const router = require('express').Router()
const Op = require('sequelize').Op

const cirodown = require('cirodown')

const auth = require('../auth')
const { getArticle } = require('./lib')

async function setArticleTags(req, article, tagList) {
  return req.app.get('sequelize').models.Tag.bulkCreate(
    tagList.map((tag) => {return {name: tag}}),
    {ignoreDuplicates: true}
  ).then(tags => {
    // IDs may be missing from the above, so we have to do a find.
    // https://github.com/sequelize/sequelize/issues/11223#issuecomment-864185973
    req.app.get('sequelize').models.Tag.findAll({
      where: {name: tagList}
    }).then(tags => {
      return article.setTags(tags)
    })
  })
}

router.param('comment', function(req, res, next, id) {
  req.app.get('sequelize').models.Comment.findOne({
    where: { id: id },
    include: [{ model: req.app.get('sequelize').models.User, as: 'author' }],
  })
    .then(function(comment) {
      if (!comment) {
        return res.sendStatus(404)
      }
      req.comment = comment
      return next()
    })
    .catch(next)
})

router.get('/', auth.optional, async function(req, res, next) {
  try {
    if (req.query.id === undefined) {
      let where = {}
      let limit = 20
      let offset = 0
      if (typeof req.query.limit !== 'undefined') {
        limit = req.query.limit
      }
      if (typeof req.query.offset !== 'undefined') {
        offset = req.query.offset
      }
      const authorInclude = {
        model: req.app.get('sequelize').models.User,
        as: 'author',
      }
      if (req.query.author) {
        authorInclude.where = {username: req.query.author}
      }
      const include = [authorInclude]
      if (req.query.favorited) {
        include.push({
          model: req.app.get('sequelize').models.User,
          as: 'favoritedBy',
          where: {username: req.query.favorited},
        })
      }
      if (req.query.topicId) {
        where.topicId = req.query.topicId
      }
      if (req.query.tag) {
        include.push({
          model: req.app.get('sequelize').models.Tag,
          as: 'tags',
          where: {name: req.query.tag},
        })
      }

      // order
      let order;
      let sort = req.query.sort;
      if (sort) {
        if (sort === 'createdAt' || sort === 'score') {
          order = sort
        } else {
          return res.sendStatus(422)
        }
      } else {
        order = 'createdAt'
      }

      const [{count: articlesCount, rows: articles}, user] = await Promise.all([
        req.app.get('sequelize').models.Article.findAndCountAll({
          where: where,
          order: [[order, 'DESC']],
          limit: Number(limit),
          offset: Number(offset),
          include: include,
        }),
        req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
      ])
      return res.json({
        articles: await Promise.all(articles.map(function(article) {
          return article.toJson(user)
        })),
        articlesCount: articlesCount
      })
    } else {
      const article = await getArticle(req, res)
      if (article) {
        const user = req.payload ? await req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
        return res.json({ article: await article.toJson(user) })
      }
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
    const {count: articlesCount, rows: articles} = await user.findAndCountArticlesByFollowed(offset, limit)
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

router.post('/', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (!user) {
      return res.sendStatus(401)
    }
    let article = new (req.app.get('sequelize').models.Article)(req.body.article)
    article.authorId = user.id
    const tagList = req.body.article.tagList
    await Promise.all([
      (typeof tagList === 'undefined')
        ? null
        : setArticleTags(req, article, tagList),
      article.save()
    ])
    article.author = user
    return res.json({ article: await article.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// update article
router.put('/', auth.required, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    if (article) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
      if (article.authorId.toString() === req.payload.id.toString()) {
        if (typeof req.body.article.title !== 'undefined') {
          article.title = req.body.article.title
        }
        if (typeof req.body.article.description !== 'undefined') {
          article.description = req.body.article.description
        }
        if (typeof req.body.article.body !== 'undefined') {
          article.body = req.body.article.body
        }
        const tagList = req.body.article.tagList
        await Promise.all([
          (typeof tagList === 'undefined')
            ? null
            : setArticleTags(req, article, tagList),
          article.save()
        ])
        return res.json({ article: await article.toJson(user) })
      } else {
        return res.sendStatus(403)
      }
    }
  } catch(error) {
    next(error);
  }
})

// delete article
router.delete('/', auth.required, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    if (article) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
      if (!user) {
        return res.sendStatus(401)
      }
      if (article.author.id.toString() === req.payload.id.toString()) {
        return article.destroy().then(function() {
          return res.sendStatus(204)
        })
      } else {
        return res.sendStatus(403)
      }
    }
  } catch(error) {
    next(error);
  }
})

// Favorite an article
router.post('/favorite', auth.required, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    if (article) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
      if (!user) {
        return res.sendStatus(401)
      }
      if (!article) {
        return res.sendStatus(404)
      }
      await req.app.get('sequelize').transaction(async t => {
        await Promise.all([
          user.addFavorite(article.id, { transaction: t }),
          article.increment('score', { transaction: t }),
          user.increment('articleScoreSum', { transaction: t }),
        ])
      })
      const newArticle = await getArticle(req, res)
      return res.json({ article: await newArticle.toJson(user) })
    }
  } catch(error) {
    next(error);
  }
})

// Unfavorite an article
router.delete('/favorite', auth.required, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    if (article) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
      if (!user) {
        return res.sendStatus(401)
      }
      if (!article) {
        return res.sendStatus(404)
      }
      await req.app.get('sequelize').transaction(async t => {
        await Promise.all([
          user.removeFavorite(article.id, { transaction: t }),
          article.decrement('score', { transaction: t }),
          user.decrement('articleScoreSum', { transaction: t }),
        ])
      })
      const newArticle = await getArticle(req, res)
      return res.json({ article: await newArticle.toJson(user) })
    }
  } catch(error) {
    next(error);
  }
})

module.exports = router
