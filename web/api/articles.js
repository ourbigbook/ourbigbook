const router = require('express').Router()
const auth = require('./auth')
const Op = require('sequelize').Op

//import { getArticleJson } from '../lib/article'
const { getArticle, getArticleWithAuthor, getArticleJson } = require('../lib/articlejs')

router.param('comment', function(req, res, next, id) {
  req.app.get('sequelize').models.Comment.findByPk(id)
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
    req.query.author ? req.app.get('sequelize').models.User.findOne({ where: { username: req.query.author } }) : null,
    req.query.favorited ? req.app.get('sequelize').models.User.findOne({ where: { username: req.query.favorited } }) : null
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
        req.app.get('sequelize').models.Article.findAll({
          where: query,
          order: [['created_at', 'DESC']],
          limit: Number(limit),
          offset: Number(offset),
          include: [{ model: req.app.get('sequelize').models.User, as: 'Author' }]
        }),
        req.app.get('sequelize').models.Article.count({ where: query }),
        req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
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
  req.app.get('sequelize').models.User.findByPk(req.payload.id).then(function(user) {
    if (!user) {
      return res.sendStatus(401)
    }
    Promise.all([
      req.app.get('sequelize').models.Article.findAll({
        where: { author_id: { [Op.in]: user.following } },
        offset: Number(offset),
        limit: Number(limit),
        include: [{ model: req.app.get('sequelize').models.User, as: 'Author' }]
      }),
      req.app.get('sequelize').models.Article.count({
        where: { author_id: { [Op.in]: user.following } },
        include: [{ model: req.app.get('sequelize').models.User, as: 'Author' }]
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

router.post('/', auth.required, async (req, res, next) => {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    if (!user) {
      return res.sendStatus(404)
    }
    let article = req.app.get('sequelize').models.Article.build(req.body.article)
    article.AuthorId = user.id
    await article.save()
    return res.json({ article: article.toJSONFor(user, user) })
  } catch (error) { next(error) }
})

router.get('/:article', auth.optional, async (req, res, next) => {
  try {
    let uid;
    if (req.payload) {
      uid = req.payload.id;
    }
    const ret = await getArticleJson(req.app.get('sequelize'), req.params.article, uid);
    if (!ret) {
      return res.sendStatus(404)
    }
    return res.json({ article: ret })
  } catch (error) { next(error) }
})

router.put('/:article', auth.required, async (req, res, next) => {
  try {
    const [article, user] = await Promise.all([
      getArticleWithAuthor(req.app.get('sequelize'), req.params.article),
      req.app.get('sequelize').models.User.findByPk(req.payload.id)
    ])
    if (
      !article ||
      article.AuthorId.toString() !== req.payload.id.toString() ||
      !user
    ) {
      return res.sendStatus(404)
    }
    if (typeof req.body.article.title !== 'undefined') {
      article.title = req.body.article.title
    }
    if (typeof req.body.article.description !== 'undefined') {
      article.description = req.body.article.description
    }
    if (typeof req.body.article.body !== 'undefined') {
      article.body = req.body.article.body
    }
    if (typeof req.body.article.tagList !== 'undefined') {
      article.tagList = req.body.article.tagList
    }
    await article.save();
    return res.json({ article: article.toJSONFor(article.Author, user) })
  } catch (error) { next(error) }
})

router.delete('/:article', auth.required, async (req, res, next) => {
  try {
    const [article, user] = await Promise.all([
      getArticleWithAuthor(req.app.get('sequelize'), req.params.article),
      req.app.get('sequelize').models.User.findByPk(req.payload.id)
    ])
    if (
      !article ||
      article.AuthorId.toString() !== req.payload.id.toString() ||
      !user
    ) {
      return res.sendStatus(404)
    }
    await article.destroy()
    return res.sendStatus(204)
  } catch (error) { next(error) }
})

router.post('/:article/favorite', auth.required, async (req, res, next) => {
  try {
    const [article, user] = Promise.all([
      getArticleWithAuthor(req.app.get('sequelize'), req.params.article),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    if (!article || !user) {
      return res.sendStatus(404)
    }
    await user.favorite(article.id)
    await article.updateFavoriteCount()
    return res.json({ article: article.toJSONFor(article.Author, user) })
  } catch (error) { next(error) }
})

router.delete('/:article/favorite', auth.required, async (req, res, next) => {
  try {
    const [article, user] = Promise.all([
      getArticleWithAuthor(req.app.get('sequelize'), req.params.article),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    if (!article || !user) {
      return res.sendStatus(404)
    }
    await user.unfavorite(article.id);
    await article.updateFavoriteCount();
    return res.json({ article: article.toJSONFor(article.Author, user) })
  } catch (error) { next(error) }
})

router.get('/:article/comments', auth.optional, async (req, res, next) => {
  try {
    const article = await getArticle(req.app.get('sequelize'), req.params.article);
    if (!article) {
      return res.sendStatus(404)
    }
    let user;
    if (req.payload) {
      user = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    }
    const comments = await article.getComments({ order: [['created_at', 'DESC']] });
    return res.json({
      comments: comments.map(comment => {
        return comment.toJSONFor(user)
      })
    })
  } catch (error) { next(error) }
})

router.post('/:article/comments', auth.required, async (req, res, next) => {
  try {
    const [article, user] = Promise.all([
      getArticle(req.app.get('sequelize'), req.params.article),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    if (!article || !user) {
      return res.sendStatus(404)
    }
    const comment = await req.app.get('sequelize').models.Comment.create(
      Object.assign({}, req.body.comment, { ArticleId: article.id, AuthorId: user.id })
    )
    return res.json({ comment: comment.toJSONFor(user, user) })
  } catch (error) { next(error) }
})

router.delete('/:article/comments/:comment', auth.required, async (req, res, next) => {
  try {
    const author = await req.comment.getAuthor()
    if (author.id.toString() !== req.payload.id.toString()) {
      return res.sendStatus(404)
    }
    await req.comment.destroy();
    return res.sendStatus(204)
  } catch (error) { next(error) }
})

module.exports = router
