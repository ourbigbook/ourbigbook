// Safe for web/front

// Value of environment variables considered as true.
env_true = '1'

module.exports = {
  env_true,
  // TODO convert to OURBIGBOOK_DBMS=pg rather than boolean.
  postgres: process.env.OURBIGBOOK_POSTGRES === env_true,
  sequelize_postgres_opts: {
    dialect: 'postgres',
    dialectOptions: {
      // https://stackoverflow.com/questions/27687546/cant-connect-to-heroku-postgresql-database-from-local-node-app-with-sequelize
      // https://devcenter.heroku.com/articles/heroku-postgresql#connecting-in-node-js
      // https://stackoverflow.com/questions/58965011/sequelizeconnectionerror-self-signed-certificate
      ssl: {
        require: true,
        rejectUnauthorized: false,
      }
    }
  },
}
