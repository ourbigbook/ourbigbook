let isProduction;
if (process.env.NODE_ENV_OVERRIDE === undefined) {
  isProduction = process.env.NODE_ENV === 'production'
} else {
  isProduction = process.env.NODE_ENV_OVERRIDE === 'production'
}
module.exports = {
  apiPath: '/api',
  databaseUrl: process.env.DATABASE_URL || '',
  revalidate: 10,
  isProduction: isProduction,
  isProductionNext: process.env.NODE_ENV_NEXT === undefined ?
    (isProduction) :
    (process.env.NODE_ENV_NEXT === 'production'),
  secret: isProduction ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  verbose: process.env.VERBOSE
}
