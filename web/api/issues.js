const router = require('express').Router()

const auth = require('../auth')
const config = require('../front/config')
const { cant } = require('../front/cant')
const front = require('../front/js')
const { convertIssue, convertComment } = require('../convert')
const lib = require('./lib')
const { getArticle, ValidationError, validateParam, isPositiveInteger } = lib
const { modifyEditorInput } = require('../front/js')

// Get issues for an article.
// TODO: make article optional, generalize this more as a general find issues function.
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [article, loggedInUser] = await Promise.all([
      getArticle(req, res, { includeIssues: true, includeIssuesOrder: lib.getOrder(req) }),
      req.payload ? sequelize.models.User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      issues: await Promise.all(article.issues.map(issue => issue.toJson(loggedInUser)))
    })
  } catch(error) {
    next(error);
  }
})

function getIssueParams(req, res) {
  return {
    number: lib.validateParam(req.params, 'number', {
      typecast: front.typecastInteger,
      validators: [front.isPositiveInteger],
    }),
    slug: validateParam(req.query, 'id'),
  }
}

async function getIssue(req, res, options={}) {
  const { includeComments } = options
  const sequelize = req.app.get('sequelize')
  const { slug, number } = getIssueParams(req, res)
  const issue = await sequelize.models.Issue.getIssue({
    includeComments,
    number,
    order: lib.getOrder(req),
    sequelize,
    slug,
  })
  if (!issue) {
    throw new lib.ValidationError(
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
    const [article, issueCountByLoggedInUser, lastIssue, loggedInUser] = await Promise.all([
      getArticle(req, res),
      sequelize.models.Issue.count({ where: { authorId: req.payload.id } }),
      sequelize.models.Issue.findOne({
        order: [['number', 'DESC']],
        include: [{
          model: sequelize.models.Article,
          as: 'issues',
          where: { slug },
        }]
      }),
      sequelize.models.User.findByPk(req.payload.id),
    ])
    const err = front.hasReachedMaxItemCount(loggedInUser, issueCountByLoggedInUser, 'issues')
    if (err) { throw new ValidationError(err, 403) }
    const body = lib.validateParam(req, 'body')
    const issueData = lib.validateParam(body, 'issue')
    const bodySource = lib.validateParam(issueData, 'bodySource', {
      validators: [ front.isString ],
      defaultValue: ''
    })
    lib.validateBodySize(loggedInUser, bodySource)
    const titleSource = lib.validateParam(issueData, 'titleSource', {
      validators: [front.isString, front.isTruthy]
    })
    const issue = await convertIssue({
      article,
      bodySource,
      number: lastIssue ? lastIssue.number + 1 : 1,
      sequelize,
      titleSource,
      user: loggedInUser
    })
    issue.author = loggedInUser
    res.json({ issue: await issue.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Update issue.
router.put('/:number', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [issue, loggedInUser] = await Promise.all([
      getIssue(req, res),
      sequelize.models.User.findByPk(req.payload.id),
    ])
    if (cant.editIssue(loggedInUser, issue)) {
      return res.sendStatus(403)
    }
    const body = lib.validateParam(req, 'body')
    const issueData = lib.validateParam(body, 'issue')
    const bodySource = lib.validateParam(issueData, 'bodySource', {
      validators: [front.isString],
      defaultValue: undefined,
    })
    if (bodySource !== undefined) {
      lib.validateBodySize(loggedInUser, bodySource)
    }
    const titleSource = lib.validateParam(issueData, 'titleSource', {
      validators: [front.isString, front.isTruthy],
      defaultValue: undefined,
    })
    const newIssue = await convertIssue({
      bodySource,
      issue,
      sequelize,
      titleSource,
      user: loggedInUser,
    })
    newIssue.author = loggedInUser
    res.json({ issue: await newIssue.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

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
  if (await user.hasLikedIssue(article) === isLike) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isLike ? 'already likes' : 'does not like'} issue '${article.number}'`],
      403,
    )
  }
}

// Like an issue
router.post('/:number/like', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      getIssue(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateLike(req, res, loggedInUser, article, true)
    await loggedInUser.addIssueLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Unlike an issue
router.delete('/:number/like', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      getIssue(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateLike(req, res, loggedInUser, article, false)
    await loggedInUser.removeIssueLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Get issues's comments.
router.get('/:number/comments', auth.optional, async function(req, res, next) {
  try {
    const [issue, loggedInUser] = await Promise.all([
      getIssue(req, res, { includeComments: true }),
      req.payload ? req.app.get('sequelize').models.User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      comments: await Promise.all(issue.comments.map(comment => comment.toJson(loggedInUser)))
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
    const [commentCountByLoggedInUser, issue, lastComment, loggedInUser] = await Promise.all([
      sequelize.models.Comment.count({ where: { authorId: req.payload.id } }),
      getIssue(req, res),
      sequelize.models.Comment.findOne({
        order: [['number', 'DESC']],
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
    const err = front.hasReachedMaxItemCount(loggedInUser, commentCountByLoggedInUser, 'comments')
    if (err) { throw new ValidationError(err, 403) }
    const body = lib.validateParam(req, 'body')
    const commentData = lib.validateParam(body, 'comment')
    const source = lib.validateParam(commentData, 'source', {
      validators: [front.isString],
    })
    lib.validateBodySize(loggedInUser, source)
    const comment = await convertComment({
      issue,
      number: lastComment ? lastComment.number + 1 : 1,
      sequelize,
      source,
      user: loggedInUser,
    })
    comment.author = loggedInUser
    res.json({ comment: await comment.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Delete a comment
router.delete('/:number/comments/:commentNumber', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const commentNumber = lib.validateParam(req.params, 'commentNumber', {
      typecast: front.typecastInteger,
      validators: [front.isPositiveInteger],
    })
    const issueNumber = lib.validateParam(req.params, 'issue', {
      typecast: front.typecastInteger,
      validators: [front.isPositiveInteger],
    })
    const [comment, loggedInUser] = await Promise.all([
      sequelize.models.Comment.findOne({
        where: {
          number: commentNumber,
        },
        include: [
          {
            model: sequelize.models.Issue,
            as: 'comments',
            where: { number: issueNumber },
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
      if (cant.deleteComment(loggedInUser, comment)) {
        res.sendStatus(403)
      } else {
        await comment.destroy()
        res.sendStatus(204)
      }
    }
  } catch(error) {
    next(error);
  }
})

module.exports = router
