const router = require('express').Router()
const Op = require('sequelize').Op

const auth = require('../auth')
const convert = require('../convert')
const lib = require('./lib')
const config = require('../front/config')

function getOrder(req) {
  let sort = req.query.sort;
  if (sort) {
    if (sort === 'createdAt' || sort === 'score') {
      return sort
    } else {
      throw new lib.ValidationError(
        [`Invalid sort value: '${sort}'`],
        422,
      )
    }
  } else {
    return 'createdAt'
  }
}

// Get a single article if ?id= is given, otherwise a list of articles.
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    if (req.query.id === undefined) {
      const [{count: articlesCount, rows: articles}, user] = await Promise.all([
        sequelize.models.Article.getArticles({
          sequelize,
          limit: lib.validateParam(req.query, 'limit', lib.validatePositiveInteger, config.articleLimit),
          offset: lib.validateParam(req.query, 'offset', lib.validatePositiveInteger, 0),
          author: req.query.author,
          likedBy: req.query.likedBy,
          topicId: req.query.topicId,
          order: getOrder(req),
        }),
        req.payload ? sequelize.models.User.findByPk(req.payload.id) : null
      ])
      return res.json({
        articles: await Promise.all(articles.map(function(article) {
          return article.toJson(user)
        })),
        articlesCount: articlesCount
      })
    } else {
      const [article, user] = await Promise.all([
        lib.getArticle(req, res),
        req.payload ? sequelize.models.User.findByPk(req.payload.id) : null,
      ])
      return res.json({ article: await article.toJson(user) })
    }
  } catch(error) {
    next(error);
  }
})

router.get('/feed', auth.required, async function(req, res, next) {
  try {
    let limit = 20
    let offset = 0
    if (typeof req.query.limit !== 'undefined') {
      limit = Number(req.query.limit)
    }
    if (typeof req.query.offset !== 'undefined') {
      offset = Number(req.query.offset)
    }
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    const order = getOrder(req)
    const {count: articlesCount, rows: articles} = await user.findAndCountArticlesByFollowed(offset, limit, order)
    const articlesJson = await Promise.all(articles.map((article) => {
      return article.toJson(user)
    }))
    return res.json({
      articles: articlesJson,
      articlesCount: articlesCount,
    })
  } catch(error) {
    next(error);
  }
})

// Create File and corrsponding Articles. The File must not already exist.
router.post('/', auth.required, async function(req, res, next) {
  try {
    return await createOrUpdateArticle(req, res, { forceNew: true })
  } catch(error) {
    next(error);
  }
})

// Create or Update File and corrsponding Articles. The File must not already exist.
router.put('/', auth.required, async function(req, res, next) {
  try {
    return await createOrUpdateArticle(req, res, { forceNew: false })
  } catch(error) {
    next(error);
  }
})

async function createOrUpdateArticle(req, res, opts) {
  const sequelize = req.app.get('sequelize')
  const user = await sequelize.models.User.findByPk(req.payload.id);
  lib.validateParamMandatory(req, 'body')
  const articleData = lib.validateParamMandatory(req.body, 'article')
  const title = lib.validateParamMandatory(articleData, 'title')
  const render = lib.validateParam(req.body, 'render', lib.validateTrueOrFalse, true)
  const articles = await convert.convertArticle({
    author: user,
    body: articleData.body,
    forceNew: opts.forceNew,
    sequelize,
    path: req.body.path,
    render,
    title,
  })
  return res.json({ articles: await Promise.all(articles.map(article => article.toJson(user))) })
}

//// Create File and corrsponding Articles. The File must not already exist.
//router.post('/', auth.required, async function(req, res, next) {
//  try {
//    return createOrUpdateArticle(req, res, { forceNew: true })
//  } catch(error) {
//    next(error);
//  }
//})
//
//// Create or Update File and corrsponding Articles. The File must not already exist.
//router.put('/', auth.required, async function(req, res, next) {
//  try {
//    return createOrUpdateArticle(req, res, { forceNew: false })
//  } catch(error) {
//    next(error);
//  }
//})

//// delete article
//router.delete('/', auth.required, async function(req, res, next) {
//  try {
//    const article = await lib.getArticle(req, res)
//    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
//    if (article.isToplevelIndex(user)) {
//      throw new lib.ValidationError('Cannot delete the toplevel index')
//    }
//    if (article.file.authorId.toString() === req.payload.id.toString()) {
//      return article.destroy().then(function() {
//        return res.sendStatus(204)
//      })
//    } else {
//      return res.sendStatus(403)
//    }
//  } catch(error) {
//    next(error);
//  }
//})

// Likes.

async function validateLike(req, res, user, article, isLike) {
  if (!article) {
    throw new lib.ValidationError(
      ['Article not found'],
      404,
    )
  }
  if (article.file.authorId === user.id) {
    throw new lib.ValidationError(
      [`A user cannot ${isLike ? 'like' : 'unlike'} their own article`],
      403,
    )
  }
  if (await user.hasLike(article) === isLike) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isLike ? 'already likes' : 'does not like'} article '${article.slug}'`],
      403,
    )
  }
}

// Like an article
router.post('/like', auth.required, async function(req, res, next) {
  try {
    const article = await lib.getArticle(req, res)
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    await validateLike(req, res, user, article, true)
    await user.addLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// Unlike an article
router.delete('/like', auth.required, async function(req, res, next) {
  try {
    const article = await lib.getArticle(req, res)
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    await validateLike(req, res, user, article, false)
    await user.removeLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(user) })
  } catch(error) {
    next(error);
  }
})

module.exports = router
