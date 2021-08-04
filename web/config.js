let isProduction;

if (process.env.NODE_ENV_OVERRIDE === undefined) {
  isProduction = process.env.NODE_ENV === 'production'
} else {
  isProduction = process.env.NODE_ENV_OVERRIDE === 'production'
}

const apiPathComponent = 'api'
const escapeUsername = 'go'

module.exports = {
  apiPath: '/' + apiPathComponent,
  apiPathComponent,
  // Reserved username to have URLs like /username/my-article and /view/editor/my-article.
  escapeUsername,
  databaseUrl: process.env.DATABASE_URL || '',
  revalidate: 10,
  isProduction: isProduction,
  isProductionNext: process.env.NODE_ENV_NEXT === undefined ?
    (isProduction) :
    (process.env.NODE_ENV_NEXT === 'production'),
  secret: isProduction ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  reservedUsernames: new Set([
    apiPathComponent,
    escapeUsername,
  ]),
  usernameMinLength: 3,
  usernameMaxLength: 40,
  verbose: process.env.VERBOSE
}
