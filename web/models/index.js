const path = require('path')

const { Sequelize, DataTypes } = require('sequelize')

const config = require('../config')

module.exports = (toplevelDir, toplevelBasename) => {
  const sequelizeParams = {
    logging: config.verbose ? console.log : false,
    define: {
      freezeTableName: true,
    },
  };
  let sequelize;
  if (config.isProduction) {
    sequelizeParams.dialect = 'postgres';
    sequelizeParams.dialectOptions = {
      // https://stackoverflow.com/questions/27687546/cant-connect-to-heroku-postgresql-database-from-local-node-app-with-sequelize
      // https://devcenter.heroku.com/articles/heroku-postgresql#connecting-in-node-js
      // https://stackoverflow.com/questions/58965011/sequelizeconnectionerror-self-signed-certificate
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    };
    sequelize = new Sequelize(config.databaseUrl, sequelizeParams);
  } else {
    sequelizeParams.dialect = 'sqlite';
    let storage;
    if (process.env.NODE_ENV === 'test' || toplevelDir === undefined) {
      storage = ':memory:';
    } else {
      if (toplevelBasename === undefined) {
        toplevelBasename = 'db.sqlite3';
      }
      storage = path.join(toplevelDir, toplevelBasename);
    }
    sequelizeParams.storage = storage;
    sequelize = new Sequelize(sequelizeParams);
  }
  const Article = require('./article')(sequelize)
  const Comment = require('./comment')(sequelize)
  const User = require('./user')(sequelize)
  const Tag = require('./tag')(sequelize)

  // Associations.

  // User follow user (super many to many)
  const UserFollowUser = sequelize.define('UserFollowUser',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      followId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
    },
    {
      tableName: 'UserFollowUser'
    }
  );
  User.belongsToMany(User, {through: UserFollowUser, as: 'follows', foreignKey: 'userId', otherKey: 'followId'});
  UserFollowUser.belongsTo(User, {foreignKey: 'userId'})
  User.hasMany(UserFollowUser, {foreignKey: 'followId'})

  // User favorite Article
  Article.belongsToMany(User, { through: 'UserFavoriteArticle', as: 'favoritedBy', foreignKey: 'articleId', otherKey: 'userId'  });
  User.belongsToMany(Article, { through: 'UserFavoriteArticle', as: 'favorites',   foreignKey: 'userId', otherKey: 'articleId'  });

  // Article author User
  Article.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    }
  })
  User.hasMany(Article, {as: 'authoredArticles', foreignKey: 'authorId'})

  // Article has Comment
  Article.hasMany(Comment, {foreignKey: 'articleId'})
  Comment.belongsTo(Article, {
    foreignKey: {
      name: 'articleId',
      allowNull: false
    },
  })

  // Comment author User
  Comment.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    },
  });
  User.hasMany(Comment, {foreignKey: 'authorId'});

  // Tag Article
  Article.belongsToMany(Tag, { through: 'ArticleTag', as: 'tags',           foreignKey: 'articleId', otherKey: 'tagId' });
  Tag.belongsToMany(Article, { through: 'ArticleTag', as: 'taggedArticles', foreignKey: 'tagId', otherKey: 'articleId' });

  return sequelize;
}
