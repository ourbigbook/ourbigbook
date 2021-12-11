async function getArticle(req, res) {
  if (req.query.id) {
    const article = await req.app.get('sequelize').models.Article.findOne({
      where: { slug: req.query.id },
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }]
    })
    if (!article)
      res.status(404)
    return article
  }
}
exports.getArticle = getArticle

function validatePositiveInteger(s) {
  const i = Number(s)
  let ok = s !== '' && Number.isInteger(i) && i >= 0
  return [i, ok]
}
exports.validatePositiveInteger = validatePositiveInteger

function validateParam(obj, prop, validator, defaultValue) {
  let param = obj[prop]
  if (typeof param === 'undefined') {
    return defaultValue
  } else {
    let [val, ok] = validator(param)
    if (ok) {
      return val
    } else {
      throw {
        errors: [`validator ${validator.name} failed on ${prop} = "${param}"`],
        status: 422,
      }
    }
  }
}
exports.validateParam = validateParam
