const { verify } = require('./jwt')

class UnauthorizedError extends Error {
  constructor(code, error) {
    super(error.message)
    this.code = code
    this.inner = error
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

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

function authenticate(credentialsRequired) {
  return function(req, res, next) {
    const token = getTokenFromRequest(req)
    if (token === null) {
      if (credentialsRequired) {
        return next(new UnauthorizedError(
          'credentials_required',
          new Error('No authorization token was found')
        ))
      }
      return next()
    }
    try {
      req.payload = verify(token)
    } catch (error) {
      if (credentialsRequired) {
        return next(new UnauthorizedError('invalid_token', error))
      }
    }
    next()
  }
}

module.exports = {
  required: authenticate(true),
  optional: authenticate(false),
  UnauthorizedError,
}
