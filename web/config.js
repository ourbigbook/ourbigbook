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
  databaseUrl: process.env.DATABASE_URL || '',
  googleAnalyticsId: 'UA-47867706-4',
  revalidate: 10,
  isProduction: isProduction,
  isProductionNext: process.env.NODE_ENV_NEXT === undefined ?
    (isProduction) :
    (process.env.NODE_ENV_NEXT === 'production'),
  secret: isProduction ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  reservedUsernames: new Set([
    API_PATH_COMPONENT,
    ESCAPE_USERNAME,
  ]),
  usernameMinLength: 3,
  usernameMaxLength: 40,
  verbose: process.env.VERBOSE
}
