
// These routes return only user-specific data that is added by the client
// on top of the pre-rendered page for logged out users that we return first.
//
// Ended up being an ad-hoc GraphQL! Great.

const router = require('express').Router()

const auth = require('../auth')
const { cant } = require('../front/cant')
const front = require('../front/js')
const lib = require('./lib')
const {
  ValidationError,
  validateParam,
} = lib

// Public history deliberately omits precise timestamps, payloads and private error details.
router.get('/jobs', auth.optional, async function(req, res, next) {
  try {
    const { ArticleJob, User } = req.app.get('sequelize').models
    const view = req.query.view || 'todo'
    if (!['todo', 'done'].includes(view)) throw new ValidationError('Invalid job view', 422)
    const [limit, offset] = lib.getLimitAndOffset(req, res, { limitMax: 100 })
    const history = await ArticleJob.history(null, { view, limit, offset })
    const users = await User.findAll({
      attributes: ['id', 'username'],
      where: { id: [...new Set(history.jobs.map(job => job.userId))] },
    })
    const usernames = new Map(users.map(user => [user.id, user.username]))
    res.json({ ...history, jobs: history.jobs.map(job => ({
      username: usernames.get(job.userId),
      id: job.id,
      batchIndex: job.batchIndex,
      batchCount: job.batchCount,
      phase: job.phase,
      status: job.status,
      completed: job.completed,
      total: job.total,
      createdAt: new Date(job.createdAt).toISOString().slice(0, 10),
      runtimeMs: job.runtimeMs,
      error: job.error ? 'Job failed' : null,
    })) })
  } catch (error) {
    next(error)
  }
})

router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Site, User } = sequelize.models
    res.json(
      await sequelize.transaction(async (transaction) => {
        const [loggedInUser, site] = await Promise.all([
          User.findByPk(req.payload.id, { transaction }),
          Site.findOne({ transaction }),
        ])
        return await site.toJson(loggedInUser)
      })
    )
  } catch(error) {
    next(error);
  }
})

router.put('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    res.json(
      await sequelize.transaction(async (transaction) => {
        const body = validateParam(req, 'body')
        const automaticTopicLinksMaxWords = validateParam(body, 'automaticTopicLinksMaxWords', {
          defaultValue: undefined,
          validators: [front.isNonNegativeInteger],
        })
        const pinnedArticle = validateParam(body, 'pinnedArticle', {
          defaultValue: undefined,
          validators: [front.isString],
        })
        const [article, loggedInUser, site] = await Promise.all([
          pinnedArticle
            ? sequelize.models.Article.findOne({
                where: { slug: pinnedArticle },
                transaction
              })
            : null,
          sequelize.models.User.findByPk(req.payload.id, { transaction }),
          sequelize.models.Site.findOne({ transaction }),
        ])
        const msg = cant.updateSiteSettings(loggedInUser)
        if (msg) {
          throw new ValidationError([msg], 403)
        }
        if (automaticTopicLinksMaxWords !== undefined) {
          site.automaticTopicLinksMaxWords = automaticTopicLinksMaxWords
        }
        if (pinnedArticle !== undefined) {
          if (pinnedArticle) {
            if (!article) {
              throw new ValidationError([`article does not exist: "${pinnedArticle}"`], 404)
            }
            site.pinnedArticleId = article.id
          } else {
            site.pinnedArticleId = null
          }
        }
        await site.save({ transaction })
        return await site.toJson(loggedInUser, { transaction })
      })
    )
  } catch(error) {
    next(error);
  }
})

router.get('/blacklist-signup-ip', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    res.json(
      await sequelize.transaction(async (transaction) => {
        const body = validateParam(req, 'body')
        const ips = validateParam(body, 'ips', {
          validators: [ front.isArrayOf(front.isString) ],
          defaultValue: [],
        })
        const [loggedInUser] = await Promise.all([
          sequelize.models.User.findByPk(req.payload.id, { transaction }),
        ])
        const msg = cant.updateSiteSettings(loggedInUser)
        if (msg) {
          throw new ValidationError([msg], 403)
        }
        const ipsFound = await sequelize.models.SignupBlacklistIp.findAll(
          { where: { ip: ips } },
          { transaction },
        )
        return { ips: ipsFound.map(ip => ip.ip) }
      })
    )
  } catch(error) {
    next(error);
  }
})

router.put('/blacklist-signup-ip', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    res.json(
      await sequelize.transaction(async (transaction) => {
        const body = validateParam(req, 'body')
        const ips = validateParam(body, 'ips', {
          validators: [ front.isArrayOf(front.isString) ],
          defaultValue: [],
        })
        for (const ip of ips) {
          if (!ip.match(/\d+(\.\d+(\.\d+(\.\d+)))/)) {
            throw new ValidationError(`not a valid IP or IP prefix: ${ip}`)
          }
        }
        const [loggedInUser] = await Promise.all([
          sequelize.models.User.findByPk(req.payload.id, { transaction }),
        ])
        const msg = cant.updateSiteSettings(loggedInUser)
        if (msg) {
          throw new ValidationError([msg], 403)
        }
        await sequelize.models.SignupBlacklistIp.bulkCreate(
          ips.map(ip => { return { ip } }),
          {
            transaction,
            updateOnDuplicate: ['ip'],
          }
        )
        return {}
      })
    )
  } catch(error) {
    next(error);
  }
})

router.delete('/blacklist-signup-ip', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    res.json(
      await sequelize.transaction(async (transaction) => {
        const body = validateParam(req, 'body')
        const ips = validateParam(body, 'ips', {
          validators: [ front.isArrayOf(front.isString) ],
          defaultValue: [],
        })
        const [loggedInUser] = await Promise.all([
          sequelize.models.User.findByPk(req.payload.id, { transaction }),
        ])
        const msg = cant.updateSiteSettings(loggedInUser)
        if (msg) {
          throw new ValidationError([msg], 403)
        }
        await sequelize.models.SignupBlacklistIp.destroy(
          { where: { ip: ips }, transaction }
        )
        return {}
      })
    )
  } catch(error) {
    next(error);
  }
})

module.exports = router
