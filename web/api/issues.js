const router = require('express').Router()

const auth = require('../auth')
const front = require('../front/js')
const { convertIssue, convertComment } = require('../convert')
const { getArticle, ValidationError, validateParam, validatePositiveInteger } = require('./lib')
const { modifyEditorInput } = require('../front/js')

// Get issues for an article.
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [article, user] = await Promise.all([
      getArticle(req, res, { includeIssues: true }),
      req.payload ? sequelize.models.User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      issues: await Promise.all(article.issues.map(issue => issue.toJson(user)))
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

async function getIssue(req, res, options={}) {
  const { includeComments } = options
  const sequelize = req.app.get('sequelize')
  const { slug, number } = getIssueParams(req, res)
  const issue = await sequelize.models.Issue.getIssue({ includeComments, number, sequelize, slug })
  if (!issue) {
    throw new ValidationError(
      [`issue not found: article slug: "${slug}" issue number: ${number}`],
      404,
    )
  }
  return issue
}

// Create a new issue.
router.post('/', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const slug = validateParam(req.query, 'id')
    const [article, lastIssue, user] = await Promise.all([
      getArticle(req, res),
      sequelize.models.Issue.findOne({
        orderBy: [['number', 'DESC']],
        include: [{
          model: sequelize.models.Article,
          as: 'issues',
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
    const [issue, user] = await Promise.all([
      getIssue(req, res, { includeComments: true }),
      req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      comments: await Promise.all(issue.comments.map(comment => comment.toJson(user)))
    })
  } catch(error) {
    next(error);
  }
})

// Create a new comment.
router.post('/:number/comments', auth.required, async function(req, res, next) {
  try {
    const { slug, number } = getIssueParams(req, res)
    const sequelize = req.app.get('sequelize')
    const [issue, lastComment, user] = await Promise.all([
      getIssue(req, res),
      sequelize.models.Comment.findOne({
        orderBy: [['number', 'DESC']],
        include: [{
          model: sequelize.models.Issue,
          as: 'comments',
          where: { number },
          include: [{
            model: sequelize.models.Article,
            as: 'issues',
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
    const sequelize = req.app.get('sequelize')
    const [comment, loggedInUser] = await Promise.all([
      sequelize.models.Comment.findOne({
        where: {
          number: validateParam(req.params, 'commentNumber', validatePositiveInteger),
        },
        include: [
          {
            model: sequelize.models.Issue,
            as: 'comments',
            where: { number: validateParam(req.params, 'number', validatePositiveInteger) },
            required: true,
            include: [
              {
                model: sequelize.models.Article,
                as: 'issues',
                where: { slug: validateParam(req.query, 'id') },
                required: true,
              }
            ],
          },
          {
            model: sequelize.models.User,
            as: 'author',
          },
        ],
      }),
      sequelize.models.User.findByPk(req.payload.id),
    ])
    if (!comment) {
      res.sendStatus(404)
    } else {
      if (
        // Only admins can do it.
        loggedInUser.admin
        // Users can delete their own comments
        //req.payload.id.toString() === comment.author.id.toString()
      ) {
        await comment.destroy()
        res.sendStatus(204)
      } else {
        res.sendStatus(403)
      }
    }
  } catch(error) {
    next(error);
  }
})

module.exports = router
