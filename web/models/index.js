const path = require('path')

const Sequelize = require('sequelize')

const config = require('../config')

module.exports = (toplevelPath) => {
  const sequelizeParams = {
    logging: config.verbose ? console.log : false
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
    sequelizeParams.storage = path.join(toplevelPath, 'db.sqlite3');
    sequelize = new Sequelize(sequelizeParams);
  }
  const db = {}
  db.Article = require('./article')(sequelize)
  db.Comment = require('./comment')(sequelize)
  db.User = require('./user')(sequelize)
  Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
      db[modelName].associate()
    }
  })
  return sequelize;
}
