const router = require('express').Router()
const auth = require('../auth')
const Op = require('sequelize').Op

const { Article, User, Comment } = require('../../models')

// Preload article objects on routes with ':article'
router.param('article', function(req, res, next, slug) {
  Article.findOne({
    where: { slug: slug },
    include: [{ model: User, as: 'Author' }]
  })
    .then(function(article) {
      if (!article) {
        return res.sendStatus(404)
      }

      req.article = article

      next()

      return null
    })
    .catch(next)
})

router.param('comment', function(req, res, next, id) {
  Comment.findByPk(id)
    .then(function(comment) {
      if (!comment) {
        return res.sendStatus(404)
      }

      req.comment = comment

      next()

      return null
    })
    .catch(next)
})

router.get('/', auth.optional, function(req, res, next) {
  let query = {}
  let limit = 20
  let offset = 0

  if (typeof req.query.limit !== 'undefined') {
    limit = req.query.limit
  }

  if (typeof req.query.offset !== 'undefined') {
    offset = req.query.offset
  }

  if (typeof req.query.tag !== 'undefined') {
    query.tagList = { [Op.like]: req.query.tag + ',%' }
  }

  Promise.all([
    req.query.author ? User.findOne({ where: { username: req.query.author } }) : null,
    req.query.favorited ? User.findOne({ where: { username: req.query.favorited } }) : null
  ])
    .then(function(results) {
      let author = results[0]
      let favoriter = results[1]

      if (author) {
        query.author_id = author.id
      }

      if (favoriter) {
        query.id = { [Op.in]: favoriter.favorites }
      } else if (req.query.favorited) {
        query.id = { [Op.in]: [] }
      }

      return Promise.all([
        Article.findAll({
          where: query,
          order: [['created_at', 'DESC']],
          limit: Number(limit),
          offset: Number(offset),
          include: [{ model: User, as: 'Author' }]
        }),
        Article.count({ where: query }),
        req.payload ? User.findByPk(req.payload.id) : null
      ]).then(function(results) {
        let articles = results[0]
        let articlesCount = results[1]
        let user = results[2]

        return res.json({
          articles: articles.map(function(article) {
            return article.toJSONFor(article.Author, user)
          }),
          articlesCount: articlesCount
        })
      })
    })
    .catch(next)
})

router.get('/feed', auth.required, function(req, res, next) {
  let limit = 20
  let offset = 0

  if (typeof req.query.limit !== 'undefined') {
    limit = req.query.limit
  }

  if (typeof req.query.offset !== 'undefined') {
    offset = req.query.offset
  }

  User.findByPk(req.payload.id).then(function(user) {
    if (!user) {
      return res.sendStatus(401)
    }

    Promise.all([
      Article.findAll({
        where: { author_id: { [Op.in]: user.following } },
        offset: Number(offset),
        limit: Number(limit),
        include: [{ model: User, as: 'Author' }]
      }),
      Article.count({
        where: { author_id: { [Op.in]: user.following } },
        include: [{ model: User, as: 'Author' }]
      })
    ])
      .then(function(results) {
        let articles = results[0]
        let articlesCount = results[1]

        return res.json({
          articles: articles.map(function(article) {
            return article.toJSONFor(article.Author)
          }),
          articlesCount: articlesCount
        })
      })
      .catch(next)
  })
})

router.post('/', auth.required, function(req, res, next) {
  User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }

      let article = new Article(req.body.article)
      article.AuthorId = user.id

      return article.save().then(article => {
        return res.json({ article: article.toJSONFor(user, user) })
      })
    })
    .catch(next)
})

// return a article
router.get('/:article', auth.optional, function(req, res, next) {
  Promise.all([req.payload ? User.findByPk(req.payload.id) : null, req.article.getAuthor()])
    .then(function(results) {
      let [user, author] = results

      return res.json({ article: req.article.toJSONFor(author, user) })
    })
    .catch(next)
})

// update article
router.put('/:article', auth.required, function(req, res, next) {
  User.findByPk(req.payload.id).then(function(user) {
    if (req.article.AuthorId.toString() === req.payload.id.toString()) {
      if (typeof req.body.article.title !== 'undefined') {
        req.article.title = req.body.article.title
      }

      if (typeof req.body.article.description !== 'undefined') {
        req.article.description = req.body.article.description
      }

      if (typeof req.body.article.body !== 'undefined') {
        req.article.body = req.body.article.body
      }

      if (typeof req.body.article.tagList !== 'undefined') {
        req.article.tagList = req.body.article.tagList
      }

      req.article
        .save()
        .then(function(article) {
          return article.getAuthor().then(author => {
            return res.json({ article: article.toJSONFor(author, user) })
          })
        })
        .catch(next)
    } else {
      return res.sendStatus(403)
    }
  })
})

// delete article
router.delete('/:article', auth.required, function(req, res, next) {
  User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }

      if (req.article.Author.id.toString() === req.payload.id.toString()) {
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
router.post('/:article/favorite', auth.required, function(req, res, next) {
  let articleId = req.article.id

  User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }

      return user.favorite(articleId).then(function() {
        return req.article.updateFavoriteCount().then(function(article) {
          return article.getAuthor().then(author => {
            return res.json({ article: article.toJSONFor(author, user) })
          })
        })
      })
    })
    .catch(next)
})

// Unfavorite an article
router.delete('/:article/favorite', auth.required, function(req, res, next) {
  let articleId = req.article.id

  User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }

      return user.unfavorite(articleId).then(function() {
        return req.article.updateFavoriteCount().then(function(article) {
          return article.getAuthor().then(author => {
            return res.json({ article: article.toJSONFor(author, user) })
          })
        })
      })
    })
    .catch(next)
})

// return an article's comments
router.get('/:article/comments', auth.optional, function(req, res, next) {
  Promise.resolve(req.payload ? User.findByPk(req.payload.id) : null)
    .then(function(user) {
      return req.article.getComments({ order: [['created_at', 'DESC']] }).then(function(comments) {
        return res.json({
          comments: comments.map(function(comment) {
            return comment.toJSONFor(user)
          })
        })
      })
    })
    .catch(next)
})

// create a new comment
router.post('/:article/comments', auth.required, function(req, res, next) {
  User.findByPk(req.payload.id)
    .then(function(user) {
      if (!user) {
        return res.sendStatus(401)
      }
      return Comment.create(
        Object.assign({}, req.body.comment, { ArticleId: req.article.id, AuthorId: user.id })
      ).then(function(comment) {
        res.json({ comment: comment.toJSONFor(user, user) })
      })
    })
    .catch(next)
})

router.delete('/:article/comments/:comment', auth.required, function(req, res, next) {
  return req.comment
    .getAuthor()
    .then(function(author) {
      if (author.id.toString() === req.payload.id.toString()) {
        return req.comment.destroy().then(function() {
          res.sendStatus(204)
        })
      } else {
        res.sendStatus(403)
      }
    })
    .catch(next)
})

module.exports = router
