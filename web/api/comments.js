const router = require('express').Router()

const auth = require('../auth')

// create a new comment
router.post('/:article(*)', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    const comment = await req.app.get('sequelize').models.Comment.create(
      Object.assign({}, req.body.comment, { articleId: req.article.id, authorId: user.id })
    )
    comment.author = user
    res.json({ comment: await comment.toJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

// delete a comment
router.delete('/:comment/:article(*)', auth.required, function(req, res, next) {
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
