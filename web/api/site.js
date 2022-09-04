
// These routes return only user-specific data that is added by the client
// on top of the pre-rendered page for logged out users that we return first.
//
// Ended up being an ad-hoc GraphQL! Great.

const router = require('express').Router()

const auth = require('../auth')
const { cant } = require('../front/cant')
const front = require('../front/js')
const lib = require('./lib')
const {
  ValidationError,
  validateParam,
} = lib

router.put('/', auth.optional, async function(req, res, next) {
  try {
    let query
    const q = req.query.q
    if (q) {
      try {
        query = JSON.parse(q)
      } catch(error) {
        throw new ValidationError(['Invalid query JSON'], 403)
      }
    } else {
      query = {}
    }
    const sequelize = req.app.get('sequelize')
    const body = validateParam(req, 'body')
    const pinnedArticle = validateParam(body, 'pinnedArticle', {
      validators: [front.isString],
    })
    const [article, loggedInUser, site] = await Promise.all([
      pinnedArticle ? sequelize.models.Article.findOne({ where: { slug: pinnedArticle } }) : null,
      sequelize.models.User.findByPk(req.payload.id),
      sequelize.models.Site.findOne(),
    ])
    const msg = cant.updateSiteSettings(loggedInUser)
    if (msg) {
      throw new ValidationError([msg], 403)
    }
    if (pinnedArticle) {
      if (!article) {
        throw new ValidationError([`article does not exist: "${pinnedArticle}"`], 404)
      }
      site.pinnedArticleId = article.id
    } else {
      site.pinnedArticleId = null
    }
    await site.save()
    res.json(await site.toJson(loggedInUser))
  } catch(error) {
    next(error);
  }
})

module.exports = router
