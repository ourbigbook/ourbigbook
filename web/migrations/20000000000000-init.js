module.exports = {
  up: async (queryInterface, Sequelize) => {
    await Promise.all([
      queryInterface.createTable('Article', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        topicId: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        title: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        body: {
          type: Sequelize.STRING(2**20),
          allowNull: false,
        },
        render: {
          type: Sequelize.STRING(2**20),
          allowNull: false,
        },
        score: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
      }),
      queryInterface.createTable('Comment', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        name: {
          type: Sequelize.STRING,
          unique: true,
        },
      }),
      queryInterface.createTable('Tag', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        name: {
          type: Sequelize.STRING,
          unique: true,
        },
      }),
      queryInterface.createTable('User', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
        },
        username: {
          type: Sequelize.STRING(40),
          unique: true
        },
        email: {
          type: Sequelize.STRING,
          unique: true,
        },
        bio: Sequelize.STRING,
        image: Sequelize.STRING,
        hash: Sequelize.STRING(1024),
        salt: Sequelize.STRING,
        articleScoreSum: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        followerCount: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
      }),
    ])

    // Relations.
    await Promise.all([
      queryInterface.createTable('UserFollowUser', {
        userId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "User",
            key: "id"
          }
        },
        followId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "User",
            key: "id"
          }
        },
      }),
      queryInterface.createTable('UserFavoriteArticle', {
        articleId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "Article",
            key: "id"
          }
        },
        userId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "User",
            key: "id"
          }
        },
      }),
      queryInterface.createTable('ArticleTag', {
        articleId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "Article",
            key: "id"
          }
        },
        tagId: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "Tag",
            key: "id"
          }
        },
      }),
    ])
  },
  down: async (queryInterface, Sequelize) => {
    await Promise.all([
      queryInterface.dropTable('Article'),
      queryInterface.dropTable('Comment'),
      queryInterface.dropTable('Tag'),
      queryInterface.dropTable('User'),
    ])
  }
};
