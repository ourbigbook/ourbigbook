// Safe for web/front

// Value of environment variables considered as true.
env_true = '1'

function preload_katex(tex, katex_macros) {
  if (katex_macros === undefined) {
    katex_macros = {}
  }
  require('katex').renderToString(
    tex,
    {
      globalGroup: true,
      macros: katex_macros,
      output: 'html',
      strict: 'error',
      throwOnError: true,
    }
  );
  return katex_macros
}

let isProduction;
let isTest;
if (process.env.NEXT_PUBLIC_NODE_ENV === undefined) {
  isProduction = process.env.NODE_ENV === 'production'
} else {
  isProduction = process.env.NEXT_PUBLIC_NODE_ENV === 'production'
}
if (isProduction) {
  isTest = false
} else {
  isTest = process.env.NEXT_PUBLIC_NODE_ENV === 'test'
}

module.exports = {
  env_true,
  isProduction,
  isTest,
  preload_katex,
  // TODO convert to OURBIGBOOK_DBMS=pg rather than boolean.
  postgres: process.env.OURBIGBOOK_POSTGRES === env_true || (process.env.OURBIGBOOK_POSTGRES === undefined && isProduction),
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
  SQLITE_DB_BASENAME: 'db.sqlite3',
}
