// Ideally, this would be moved entirely to front/js.js to share functionality backend API with Next.js.
// There is just one thing that we haven't managed/tried to much to do on Next.js but which works on Express:
// to raise error pages like 404 by throwing exceptions. So we are keeping only the exception throwing stuff
// here for now. This type of exception interface is very convenient, as it allows you to stop processing
// immediately and return an error from subcalls.

const config = require('../front/config')
const front = require('../front/js')

function validateBodySize(loggedInUser, bodySource) {
  if (!loggedInUser.admin && bodySource.length > loggedInUser.maxArticleSize) {
    throw new ValidationError(
      `The body size (${bodySource.length} bytes) was larger than you maximum article size (${loggedInUser.maxArticleSize} bytes). bodySource:\n${bodySource}`,
      403,
    )
  }
}

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

function getOrder(req) {
  const [sort, err] = front.getOrder(req)
  if (err) {
    throw new ValidationError(
      [`Invalid sort value: '${sort}'`],
      422,
    )
  }
  return sort
}

function getLimitAndOffset(req, res, opts) {
  return [
    validateParam(req.query, 'limit', {
      typecast: front.typecastInteger,
      validators: [
        front.isNonNegativeInteger,
        front.isSmallerOrEqualTo(config.articleLimitMax),
      ],
      defaultValue: opts.defaultLimit !== undefined ? opts.defaultLimit : config.articleLimit
    }),
    validateParam(req.query, 'offset', {
      typecast: front.typecastInteger,
      validators: [front.isNonNegativeInteger],
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

function validate(inputString, validators, prop) {
  if (validators === undefined) {
    validators = [front.isTruthy]
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
      ;[param, ok] = typecast(param)
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
  getLimitAndOffset,
  getOrder,
  validate,
  validateBodySize,
  validateParam,
}
