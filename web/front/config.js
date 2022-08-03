const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

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

const escapeUsername = 'go'

let databaseUrl
if (process.env.NODE_ENV === 'test') {
  databaseUrl = process.env.DATABASE_URL_TEST
} else {
  databaseUrl = process.env.DATABASE_URL
}

const appDomain = 'ourbigbook.com'
const docsUrl = `https://docs.${appDomain}`

module.exports = {
  apiPath: '/' + ourbigbook.WEB_API_PATH,
  // Common convert options used by all frontend components: the backend and the editor.
  convertOptions: {
    body_only: true,
    html_x_extension: false,
    magic_leading_at: false,
    path_sep: '/',
    remove_leading_at: true,
    ourbigbook_json: {
      h: {
        numbered: false,
      },
    },
  },
  contactUrl: 'https://github.com/cirosantilli/ourbigbook/issues',
  // Reserved username to have URLs like /username/my-article and /view/editor/my-article.
  escapeUsername,
  appDomain,
  docsUrl,
  aboutUrl: `${docsUrl}#ourbigbook-web-user-manual`,
  appName: `OurBigBook.com`,
  buttonActiveClass: 'active',
  defaultProfileImage: `https://static.productionready.io/images/smiley-cyrus.jpg`,
  // Default.
  articleLimit: 20,
  // Max allowed to be set by user.
  articleLimitMax: 20,
  defaultUserScoreTitle: 'Sum of likes of all articles authored by user',
  /** @type {boolean | 'blocking'} */
  fallback: 'blocking',
  googleAnalyticsId: 'UA-47867706-4',
  // An ID separator that should be used or all IDs in the website to avoid conflicts with OurBigBook Markup output,
  // of which users can control IDs to some extent. Usage is like: prefix + sep + number.
  idSep: '_',
  isTest,
  // Default isProduction check. Affetcs all aspects of the application unless
  // they are individually overridden, including:
  // * is Next.js server dev or prod?
  // * use SQLite or PostgreSQL?
  // * in browser effects, e.g. show Google Analytics or not?
  // * print emails to stdout or actually try to send them
  isProduction,
  // Overrides isProduction for the "is Next.js server dev or prod?" only.
  isProductionNext: process.env.NODE_ENV_NEXT_SERVER_ONLY === undefined ?
    (isProduction) :
    (process.env.NODE_ENV_NEXT_SERVER_ONLY === 'production'),
  // Per user limit defaults.
  maxArticleTitleSize: 1024,
  maxArticleSize: 100000,
  maxArticles: 1000,
  secret: isProduction ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  postgres: ourbigbook_nodejs_front.postgres,
  reservedUsernames: new Set([
    ourbigbook.WEB_API_PATH,
    escapeUsername,
  ]),
  revalidate: 10,
  useCaptcha: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY !== undefined && !isTest,
  usernameMinLength: 3,
  usernameMaxLength: 40,
  topicConsiderNArticles: 10,
  verbose: process.env.VERBOSE,

  // Used by sequelize-cli as well as our source code.
  development: {
    dialect: 'sqlite',
    logging: true,
    storage: 'db.sqlite3',
  },
  production: Object.assign({
    url:
      databaseUrl ||
      'postgres://ourbigbook_user:a@localhost:5432/ourbigbook',
    logging: true,
  }, ourbigbook_nodejs_front.sequelize_postgres_opts)
}
