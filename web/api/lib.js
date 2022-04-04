async function getArticle(req, res) {
  if (req.query.id) {
    const article = await req.app.get('sequelize').models.Article.findOne({
      where: { slug: req.query.id },
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }]
    })
    if (!article) {
      throw new ValidationError(
        [`Article slug not found: "${req.query.id}"`],
        404,
      )
    }
    return article
  }
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

function validatePositiveInteger(s) {
  const i = Number(s)
  let ok = s !== '' && Number.isInteger(i) && i >= 0
  return [i, ok]
}

function validate(inputString, validator, prop) {
  let [val, ok] = validator(inputString)
  if (ok) {
    return val
  } else {
    throw new ValidationError(
      { [prop]: [`validator ${validator.name} failed on ${msg}"${param}"`] },
      422,
    )
  }
}

function validateParam(obj, prop, validator, defaultValue) {
  let param = obj[prop]
  if (typeof param === 'undefined') {
    return defaultValue
  } else {
    return validate(param, validator, prop)
  }
}

module.exports = {
  getArticle,
  ValidationError,
  validatePositiveInteger,
  validate,
  validateParam,
}
