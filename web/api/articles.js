const router = require('express').Router()
const Op = require('sequelize').Op

const ourbigbook = require('ourbigbook')

const auth = require('../auth')
const { cant } = require('../front/cant')
const front = require('../front/js')
const convert = require('../convert')
const lib = require('./lib')
const config = require('../front/config')

router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    const [{count: articlesCount, rows: articles}, loggedInUser] = await Promise.all([
      sequelize.models.Article.getArticles({
        sequelize,
        limit,
        offset,
        author: req.query.author,
        likedBy: req.query.likedBy,
        topicId: req.query.topicId,
        order: lib.getOrder(req),
        slug: req.query.id,
      }),
      req.payload ? sequelize.models.User.findByPk(req.payload.id) : null
    ])
    return res.json({
      articles: await Promise.all(articles.map(function(article) {
        return article.toJson(loggedInUser)
      })),
      articlesCount,
    })
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
    const loggedInUser = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    const order = lib.getOrder(req)
    const {count: articlesCount, rows: articles} = await loggedInUser.findAndCountArticlesByFollowed(offset, limit, order)
    const articlesJson = await Promise.all(articles.map((article) => {
      return article.toJson(loggedInUser)
    }))
    return res.json({
      articles: articlesJson,
      articlesCount: articlesCount,
    })
  } catch(error) {
    next(error);
  }
})

// Create File and corresponding Articles. The File must not already exist.
router.post('/', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const loggedInUser = await sequelize.models.User.findByPk(req.payload.id)
    return await createOrUpdateArticle(req, res, { forceNew: true })
  } catch(error) {
    next(error);
  }
})

// Create or Update File and corresponding Articles. The File must not already exist.
router.put('/', auth.required, async function(req, res, next) {
  try {
    return await createOrUpdateArticle(req, res, { forceNew: false })
  } catch(error) {
    next(error);
  }
})

async function createOrUpdateArticle(req, res, opts) {
  const sequelize = req.app.get('sequelize')
  const loggedInUser = await sequelize.models.User.findByPk(req.payload.id);
  const body = lib.validateParam(req, 'body')
  const articleData = lib.validateParam(body, 'article')
  const bodySource = lib.validateParam(articleData, 'bodySource', {
    validators: [
      front.isString,
    ],
    defaultValue: ''
  })
  lib.validateBodySize(loggedInUser, bodySource)
  const titleSource = lib.validateParam(articleData, 'titleSource', {
    validators: [front.isString, front.isTruthy]
  })
  const render = lib.validateParam(body, 'render', {
    validators: [front.isBoolean], defaultValue: true})
  const parentId = lib.validateParam(body,
    // ID of article that will be the parent of this article, including the @username/ part.
    // However, at least to start with, @username/ will have to match your own username to
    // simplify things a bit.
    'parentId',
    // If undefined:
    // - if previousSiblingId is given, deduce parentId from it
    // - else if article already exists (i.e. this is an update), keep existing parent
    // - else (article does not already exist and previousSiblingId not given): throw an error
    { defaultValue: undefined }
  )
  const idPrefix = `${ourbigbook.AT_MENTION_CHAR}${loggedInUser.username}`
  if (!(
    parentId === undefined ||
    parentId === idPrefix ||
    parentId.startsWith(`${idPrefix}/`)
  )) {
    throw new lib.ValidationError(`parentId cannot belong to another user: "${parentId}"`)
  }
  const previousSiblingId = lib.validateParam(body,
    'previousSiblingId',
    // If undefined, make it the first child. This happens even on update:
    // the previous value is not kept, since undefined is the only way to indicate parent.
    { defaultValue: undefined }
  )
  const articles = (await convert.convertArticle({
    author: loggedInUser,
    bodySource,
    forceNew: opts.forceNew,
    sequelize,
    // TODO https://docs.ourbigbook.com/todo/remove-the-path-parameter-from-the-article-creation-api
    path: lib.validateParam(body, 'path', { validators: [
      front.isString, front.isTruthy ], defaultValue: undefined }),
    parentId,
    previousSiblingId,
    render,
    titleSource,
  })).articles
  return res.json({ articles: await Promise.all(articles.map(article => article.toJson(loggedInUser))) })
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
  let msg
  if (isLike) {
    msg = cant.likeArticle(user, article)
  } else {
    msg = cant.unlikeArticle(user, article)
  }
  if (msg) {
    throw new lib.ValidationError([msg], 403)
  }
  if (await user.hasLikedArticle(article) === isLike) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isLike ? 'already likes' : 'does not like'} article '${article.slug}'`],
      403,
    )
  }
}

// Like an article
router.post('/like', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateLike(req, res, loggedInUser, article, true)
    await loggedInUser.addArticleLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Unlike an article
router.delete('/like', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateLike(req, res, loggedInUser, article, false)
    await loggedInUser.removeArticleLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

module.exports = router
