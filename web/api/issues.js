const router = require('express').Router()

const auth = require('../auth')
const front = require('../front/js')
const { convertIssue, convertComment } = require('../convert')
const { getArticle, ValidationError, validateParam, validatePositiveInteger } = require('./lib')
const { modifyEditorInput } = require('../front/js')

router.param('comment', function(req, res, next, id) {
  req.app.get('sequelize').models.Comment.findOne({
    where: { id },
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

// Return an article's issues
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const article = await getArticle(req, res)
    let user;
    if (req.payload) {
      user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    } else {
      user = null
    }
    const issues = await article.getIssues({
      order: [['number', 'DESC']],
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }],
      limit: front.DEFAULT_LIMIT,
    })
    return res.json({
      issues: await Promise.all(issues.map(function(issue) {
        return issue.toJson(user)
      }))
    })
  } catch(error) {
    next(error);
  }
})

function getIssueParams(req, res) {
  return {
    number: validateParam(req.params, 'number', validatePositiveInteger),
    slug: validateParam(req.query, 'id'),
  }
}

async function getIssue(req, res) {
  const sequelize = req.app.get('sequelize')
  const { slug, number } = getIssueParams(req, res)
  const issue = await sequelize.models.Issue.findOne({
    where: {
      number: number,
    },
    include: [{
      model: sequelize.models.Article,
      where: { slug },
    }]
  })
  if (!issue) {
    throw new ValidationError(
      [`issue not found: article slug: "${req.query.id}" issue number: ${number}`],
      404,
    )
  }
  return issue
}

// Create a new issue.
router.post('/', auth.required, async function(req, res, next) {
  try {
    const { slug, number } = getIssueParams(req, res)
    const sequelize = req.app.get('sequelize')
    const [article, lastIssue, user] = await Promise.all([
      getArticle(req, res),
      sequelize.models.Issue.findOne({
        orderBy: [['number', 'DESC']],
        include: [{
          model: sequelize.models.Article,
          where: { slug },
        }]
      }),
      sequelize.models.User.findByPk(req.payload.id),
    ])
    const titleSource = validateParam(req.body.issue, 'titleSource')
    const bodySource = validateParam(req.body.issue, 'bodySource')
    const issue = await convertIssue({
      article,
      bodySource,
      number: lastIssue ? lastIssue.number + 1 : 1,
      sequelize,
      titleSource,
      user
    })
    issue.author = user
    res.json({ issue: await issue.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// Get issues's comments.
router.get('/:number/comments', auth.optional, async function(req, res, next) {
  try {
    const issue = await getIssue(req, res)
    let user;
    if (req.payload) {
      user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    } else {
      user = null
    }
    const comments = await issue.getComments({
      order: [['number', 'DESC']],
      include: [{ model: req.app.get('sequelize').models.User, as: 'author' }],
      limit: front.DEFAULT_LIMIT,
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

// Create a new comment.
router.post('/:number/comments', auth.required, async function(req, res, next) {
  const { slug, number } = getIssueParams(req, res)
  const sequelize = req.app.get('sequelize')
  try {
    const [issue, lastComment, user] = await Promise.all([
      getIssue(req, res),
      sequelize.models.Comment.findOne({
        orderBy: [['number', 'DESC']],
        include: [{
          model: sequelize.models.Issue,
          where: { number },
          include: [{
            model: sequelize.models.Article,
            where: { slug },
          }],
        }]
      }),
      sequelize.models.User.findByPk(req.payload.id),
    ])
    const source = validateParam(req.body.comment, 'source')
    const comment = await convertComment({
      issue,
      number: lastComment ? lastComment.number + 1 : 1,
      sequelize,
      source,
      user,
    })

    comment.author = user
    res.json({ comment: await comment.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// Delete a comment
router.delete('/:number/comments/:commentNumber', auth.required, async function(req, res, next) {
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
