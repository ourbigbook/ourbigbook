const router = require('express').Router()

const auth = require('../auth')
const { getArticle, validateParam } = require('./lib')

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

// return an article's comments
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    let user;
    if (req.payload) {
      user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    } else {
      user = null
    }
    const comments = await article.getComments({
      order: [['createdAt', 'DESC']],
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }],
    })
    return res.json({
      comments: await Promise.all(comments.map(function(comment) {
        return comment.toJson(user)
      }))
    })
  } catch(error) {
    next(error);
  }
})

// create a new comment
router.post('/', auth.required, async function(req, res, next) {
  console.error();
  try {
    const article = await getArticle(req, res)
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    validateParam(req.body.comment, 'body')
    const comment = await req.app.get('sequelize').models.Comment.create(
      Object.assign({}, req.body.comment, { articleId: article.id, authorId: user.id })
    )
    comment.author = user
    res.json({ comment: await comment.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// delete a comment
router.delete('/:comment', auth.required, async function(req, res, next) {
  try {
    const author = await req.comment.getAuthor()
    if (author.id.toString() === req.payload.id.toString()) {
      await req.comment.destroy()
      res.sendStatus(204)
    } else {
      res.sendStatus(403)
    }
  } catch(error) {
    next(error);
  }

})

module.exports = router
