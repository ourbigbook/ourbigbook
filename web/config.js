let isProduction;

if (process.env.NODE_ENV_OVERRIDE === undefined) {
  isProduction = process.env.NODE_ENV === 'production'
} else {
  isProduction = process.env.NODE_ENV_OVERRIDE === 'production'
}

const API_PATH_COMPONENT = 'api'
const ESCAPE_USERNAME = 'go'

module.exports = {
  apiPath: '/' + API_PATH_COMPONENT,
  API_PATH_COMPONENT,
  // Reserved username to have URLs like /username/my-article and /view/editor/my-article.
  ESCAPE_USERNAME,
  googleAnalyticsId: 'UA-47867706-4',
  isProduction: isProduction,
  isProductionNext: process.env.NODE_ENV_NEXT === undefined ?
    (isProduction) :
    (process.env.NODE_ENV_NEXT === 'production'),
  secret: isProduction ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  postgres: process.env.CIRODOWN_POSTGRES === 'true',
  reservedUsernames: new Set([
    API_PATH_COMPONENT,
    ESCAPE_USERNAME,
  ]),
  revalidate: 10,
  usernameMinLength: 3,
  usernameMaxLength: 40,
  verbose: process.env.VERBOSE,

  // Used by sequelize-cli as well as our source code.
  development: {
    dialect: 'sqlite',
    storage: 'db.sqlite3',
  },
  production: {
    url: process.env.DATABASE_URL || 'postgres://cirodown_user:a@localhost:5432/cirodown',
    dialect: 'postgres',
    dialectOptions: {
      // https://stackoverflow.com/questions/27687546/cant-connect-to-heroku-postgresql-database-from-local-node-app-with-sequelize
      // https://devcenter.heroku.com/articles/heroku-postgresql#connecting-in-node-js
      // https://stackoverflow.com/questions/58965011/sequelizeconnectionerror-self-signed-certificate
      ssl: {
        require: true,
        rejectUnauthorized: false,
      }
    },
  }
}
