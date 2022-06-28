const config = require('../front/config')
const front = require('../front/js')

async function getArticle(req, res, options={}) {
  const slug = validateParam(req.query, 'id')
  const sequelize = req.app.get('sequelize')
  const article = await sequelize.models.Article.getArticle(Object.assign({ sequelize, slug }, options))
  if (!article) {
    throw new ValidationError(
      [`Article slug not found: "${slug}"`],
      404,
    )
  }
  return article
}

// https://stackoverflow.com/questions/14382725/how-to-get-the-correct-ip-address-of-a-client-into-a-node-socket-io-app-hosted-o/14382990#14382990
// Works on Heroku 2021.
function getClientIp(req) {
  return req.header('x-forwarded-for')
}

function getOrder(req) {
  let sort = req.query.sort;
  if (sort) {
    if (sort === 'createdAt' || sort === 'score') {
      return sort
    } else {
      throw new ValidationError(
        [`Invalid sort value: '${sort}'`],
        422,
      )
    }
  } else {
    return 'createdAt'
  }
}

function getLimitAndOffset(req, res) {
  return [
    validateParam(req.query, 'limit', {
      typecast: typecastInteger,
      validators: [
        isNonNegativeInteger,
        isSmallerOrEqualTo(config.articleLimitMax),
      ],
      defaultValue: config.articleLimit
    }),
    validateParam(req.query, 'offset', {
      typecast: typecastInteger,
      validators: [isNonNegativeInteger],
      defaultValue: 0
    }),
  ]
}

// When this class is thrown and would blows up on toplevel, we catch it instead
// and gracefully return the specified error to the client instead of doing a 500.
class ValidationError extends Error {
  constructor(errors, status) {
    super();
    this.errors = errors
    if (status === undefined) {
      status = 422
    }
    this.status = status
  }
}

function typecastInteger(s) {
  const i = Number(s)
  let ok = s !== '' && Number.isInteger(i)
  return [ok, i]
}

function isNonNegativeInteger(i) {
  return i >= 0
}

function isPositiveInteger(i) {
  return i > 0
}

function isBoolean(tf) {
  return typeof tf === 'boolean'
}

function isSmallerOrEqualTo(max) {
  return (n) => n <= max
}

function isString(s) {
  return typeof s === 'string'
}

function isTruthy(s) {
  return !!s
}

function validate(inputString, validators, prop) {
  if (validators === undefined) {
    validators = [isTruthy]
  }
  for (const validator of validators) {
    if (!validator(inputString)) {
      throw new ValidationError(
        { [prop]: [`validator ${validator.name} failed on ${prop} = "${inputString}"`] },
        422,
      )
    }
  }
}

/* Validate some input parameter, e.g. either URL GET param or parsed JSON body.
 *
 * Every such param should be validated like this before getting used, otherwise
 * 500s are likely
 *
 * - typecast: converts strings to other types e.g. integer. This ensures that the type is correct afterwards.
 *             so you don't need to add a type validator to validators.
 *
 *             Body JSON is preparsed by Express for us as a JavaScript object, and types are already converted,
 *             so typecast is not necessary. But then you have to check that types are correct instead.
 * - validators: if any of them returs false, return an error code.
 *               They are not run if the value was not given, the defaultValue is used directly
 *               if it was given in that case.
 * - defaultValue: if not given, will blow up if the param is missing. Can be undefined however
 *                 to allow a default value of undefined.
 **/
function validateParam(obj, prop, opts={}) {
  const { typecast, validators, defaultValue } = opts
  let param = obj[prop]
  if (typeof param === 'undefined') {
    if (!('defaultValue' in opts)) {
      throw new ValidationError(
        { [prop]: [`missing mandatory argument`] },
        422,
      )
    }
    return defaultValue
  } else {
    if (typecast !== undefined) {
      let ok
      ;[ok, param] = typecast(param)
      if (!ok) {
        throw new ValidationError(
          { [prop]: [`typecast ${typecast.name} failed on ${prop} = "${param}"`] },
          422,
        )
      }
    }
    validate(param, validators, prop)
    return param
  }
}

module.exports = {
  ValidationError,
  getArticle,
  getClientIp,
  getLimitAndOffset,
  getOrder,
  isBoolean,
  isString,
  isTruthy,
  validate,
  validateParam,
  isNonNegativeInteger,
  isSmallerOrEqualTo,
  isPositiveInteger,
  typecastInteger,
}
