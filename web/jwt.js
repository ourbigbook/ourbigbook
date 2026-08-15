const { createSigner, createVerifier } = require('fast-jwt')

const { secret } = require('./front/config')

// Keep the HS256 format used by jsonwebtoken so existing login cookies remain
// valid across the dependency migration.
const sign = createSigner({ algorithm: 'HS256', key: secret })
const verify = createVerifier({ algorithms: ['HS256'], key: secret })

module.exports = { sign, verify }
