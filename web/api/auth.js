const jwt = require('express-jwt')
const secret = require('../config').secret

function getTokenFromHeader(req) {
  if (
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Token') ||
    (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer')
  ) {
    return req.headers.authorization.split(' ')[1]
  }
  return null
}

const base = {
  secret: secret,
  userProperty: 'payload',
  getToken: getTokenFromHeader,
};

module.exports = {
  required: jwt(base),
  optional: jwt(Object.assign(
    {
      credentialsRequired: false,
    },
    base
  ))
}
