const router = require('express').Router()
const Op = require('sequelize').Op

const auth = require('../auth')
const { cant } = require('../front/cant')
const front = require('../front/js')
const convert = require('../convert')
const lib = require('./lib')
const config = require('../front/config')

router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Topic, User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    const articleWhere = {}
    const topicId = req.query.id
    if (topicId) {
      articleWhere.topicId = topicId
    }
    const [{count: topicsCount, rows: topics}, loggedInUser] = await Promise.all([
      Topic.getTopics({
        articleWhere,
        author: req.query.author,
        limit,
        offset,
        order: lib.getOrder(req, {
          allowedSortsExtra: Topic.ALLOWED_SORTS_EXTRA,
        }),
        sequelize,
        topicId: req.query.topicId,
      }),
      req.payload ? User.findByPk(req.payload.id) : null
    ])
    return res.json({
      topics: await Promise.all(topics.map(function(topic) {
        return topic.toJson(loggedInUser)
      })),
      topicsCount,
    })
  } catch(error) {
    next(error);
  }
})

module.exports = router
