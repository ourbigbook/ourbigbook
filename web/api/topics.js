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
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    const [{count: topicsCount, rows: topics}, loggedInUser] = await Promise.all([
      sequelize.models.Topic.getTopics({
        sequelize,
        limit,
        offset,
        author: req.query.author,
        topicId: req.query.topicId,
        order: lib.getOrder(req),
        slug: req.query.id,
      }),
      req.payload ? sequelize.models.User.findByPk(req.payload.id) : null
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
