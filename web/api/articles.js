const router = require('express').Router()
const Op = require('sequelize').Op

const cirodown = require('cirodown')

const auth = require('../auth')

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

// Preload article objects on routes with ':article'
router.param('article', function(req, res, next, slug) {
  req.app.get('sequelize').models.Article.findOne({
    where: { slug: slug },
    include: [{ model: req.app.get('sequelize').models.User, as: 'author' }]
  })
    .then(function(article) {
      if (!article) {
        return res.sendStatus(404)
      }
      req.article = article
      return next()
    })
    .catch(next)
})

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
    let query = {}
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
    if (req.query.tag) {
      include.push({
        model: req.app.get('sequelize').models.Tag,
        as: 'tags',
        where: {name: req.query.tag},
      })
    }
    const [{count: articlesCount, rows: articles}, user] = await Promise.all([
      req.app.get('sequelize').models.Article.findAndCountAll({
        where: query,
        order: [['createdAt', 'DESC']],
        limit: Number(limit),
        offset: Number(offset),
        include: include,
      }),
      req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
    ])
    return res.json({
      articles: await Promise.all(articles.map(function(article) {
        return article.toJSONFor(user)
      })),
      articlesCount: articlesCount
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
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (!user) {
      return res.sendStatus(401)
    }
    const {count: articlesCount, rows: articles} = await user.findAndCountArticlesByFollowed(offset, limit)
    const articlesJson = await Promise.all(articles.map((article) => {
      return article.toJSONFor(user)
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
    return res.json({ article: await article.toJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

// return a article
router.get('/:article(*)', auth.optional, async function(req, res, next) {
  try {
    const results = await Promise.all([
      req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null,
      req.article.getAuthor()
    ]);
    const [user, author] = results
    return res.json({ article: await req.article.toJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

// update article
router.put('/:article(*)', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (req.article.authorId.toString() === req.payload.id.toString()) {
      if (typeof req.body.article.title !== 'undefined') {
        req.article.title = req.body.article.title
      }
      if (typeof req.body.article.description !== 'undefined') {
        req.article.description = req.body.article.description
      }
      if (typeof req.body.article.body !== 'undefined') {
        req.article.body = req.body.article.body
      }
      const article = req.article
      const tagList = req.body.article.tagList
      await Promise.all([
        (typeof tagList === 'undefined')
          ? null
          : setArticleTags(req, article, tagList),
        article.save()
      ])
      return res.json({ article: await article.toJSONFor(user) })
    } else {
      return res.sendStatus(403)
    }
  } catch(error) {
    next(error);
  }
})

// delete article
router.delete('/:article(*)', auth.required, function(req, res, next) {
  req.app.get('sequelize').models.User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }

      if (req.article.author.id.toString() === req.payload.id.toString()) {
        return req.article.destroy().then(function() {
          return res.sendStatus(204)
        })
      } else {
        return res.sendStatus(403)
      }
    })
    .catch(next)
})

// Favorite an article
router.post('/favorite/:article(*)', auth.required, async function(req, res, next) {
  try {
    const articleId = req.article.id
    const [user, article] = await Promise.all([
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
      req.app.get('sequelize').models.Article.findByPk(articleId),
    ])
    if (!user) {
      return res.sendStatus(401)
    }
    if (!article) {
      return res.sendStatus(404)
    }
    await user.addFavorite(articleId)
    return res.json({ article: await article.toJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

// Unfavorite an article
router.delete('/favorite/:article(*)', auth.required, async function(req, res, next) {
  try {
    const articleId = req.article.id
    const [user, article] = await Promise.all([
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
      req.app.get('sequelize').models.Article.findByPk(articleId),
    ])
    if (!user) {
      return res.sendStatus(401)
    }
    if (!article) {
      return res.sendStatus(404)
    }
    await user.removeFavorite(articleId)
    return res.json({ article: await article.toJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

// return an article's comments
router.get('/comments/:article(*)', auth.optional, async function(req, res, next) {
  console.error('asdf');
  try {
    let user;
    if (req.payload) {
      user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    } else {
      user = null
    }
    const comments = await req.article.getComments({
      order: [['createdAt', 'DESC']],
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }],
    })
    return res.json({
      comments: await Promise.all(comments.map(function(comment) {
        return comment.toJSONFor(user)
      }))
    })
  } catch(error) {
    next(error);
  }
})

module.exports = router
