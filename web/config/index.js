const path = require('path')
const fs = require('fs')

module.exports = {
  apiPath: '/api',
  databaseUrl: process.env.DATABASE_URL || '',
  // https://stackoverflow.com/questions/57408007/nextjs-next-build-with-node-env-development#comment119620243_57408007
  isProduction: process.env.NODE_ENV === 'production' && process.env.NODE_ENV_OVERRIDE !== 'development',
  secret: process.env.NODE_ENV === 'production' ? process.env.SECRET : 'secret',
  port: process.env.PORT || 3000,
  verbose: process.env.VERBOSE
}
