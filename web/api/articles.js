const router = require('express').Router()
const Op = require('sequelize').Op

const ourbigbook = require('ourbigbook')

const auth = require('../auth')
const lib = require('./lib')

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

router.get('/', auth.optional, async function(req, res, next) {
  try {
    if (req.query.id === undefined) {
      const sequelize = req.app.get('sequelize')
      const [{count: articlesCount, rows: articles}, user] = await Promise.all([
        sequelize.models.Article.getArticles({
          sequelize,
          limit: lib.validateParam(req.query, 'limit', lib.validatePositiveInteger, 20),
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
      const article = await lib.getArticle(req, res)
      const user = req.payload ? await req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
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
    if (!user) {
      return res.sendStatus(401)
    }
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

// create article
router.post('/', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (!user) {
      return res.sendStatus(401)
    }
    if (!req.body.article) {
      return res.status(422).json({ errors: { article: "can't be blank" } })
    }
    if (!req.body.article.title) {
      throw new lib.ValidationError('title cannot be empty')
    }
    let article = new (req.app.get('sequelize').models.Article)(req.body.article)
    article.authorId = user.id
    await article.saveSideEffects()
    article.author = user
    return res.json({ article: await article.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// update article
router.put('/', auth.required, async function(req, res, next) {
  try {
    const article = await lib.getArticle(req, res)
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (article.authorId.toString() === req.payload.id.toString()) {
      if (req.body.article) {
        if (typeof req.body.article.title !== 'undefined') {
          if (!req.body.article.title) {
            throw new lib.ValidationError('title cannot be empty')
          }
          article.title = req.body.article.title
        }
        if (typeof req.body.article.body !== 'undefined') {
          article.body = req.body.article.body
        }
        await article.save()
      }
      return res.json({ article: await article.toJson(user) })
    } else {
      return res.sendStatus(403)
    }
  } catch(error) {
    next(error);
  }
})

// delete article
router.delete('/', auth.required, async function(req, res, next) {
  try {
    const article = await lib.getArticle(req, res)
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    if (article.isToplevelIndex(user)) {
      throw new lib.ValidationError('Cannot delete the toplevel index')
    }
    if (article.author.id.toString() === req.payload.id.toString()) {
      return article.destroy().then(function() {
        return res.sendStatus(204)
      })
    } else {
      return res.sendStatus(403)
    }
  } catch(error) {
    next(error);
  }
})

// Likes.

async function validateLike(req, res, user, article, isLike) {
  if (!user) {
    throw new lib.ValidationError(
      ['Login required'],
      401,
    )
  }
  if (!article) {
    throw new lib.ValidationError(
      ['Article not found'],
      404,
    )
  }
  if (article.author.id === user.id) {
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
