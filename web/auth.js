const jwt = require('express-jwt')
const secret = require('./front/config').secret

function getTokenFromHeader(authorization) {
  if (
    (authorization && authorization.split(' ')[0] === 'Token') ||
    (authorization && authorization.split(' ')[0] === 'Bearer')
  ) {
    return authorization.split(' ')[1]
  }
  return null
}

function getTokenFromRequest(req) {
  return getTokenFromHeader(req.headers.authorization)
}

const auth = {
  required: jwt({
    secret,
    userProperty: 'payload',
    getToken: getTokenFromRequest
  }),
  optional: jwt({
    secret,
    userProperty: 'payload',
    credentialsRequired: false,
    getToken: getTokenFromRequest
  })
}

module.exports = auth
