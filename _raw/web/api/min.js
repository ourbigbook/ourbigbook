// These routes return only user-specific data that is added by the client
// on top of the pre-rendered page for logged out users that we return first.
//
// Ended up being an ad-hoc GraphQL! Great.

const router = require('express').Router()

const auth = require('../auth')
const routes = require('../front/routes')
const lib = require('./lib')

router.get('/', auth.optional, async function(req, res, next) {
  try {
    let query
    const q = req.query.q
    if (q) {
      try {
        query = JSON.parse(q)
      } catch(error) {
        throw new lib.ValidationError(['Invalid query JSON'], 403)
      }
    } else {
      query = {}
    }
    const sequelize = req.app.get('sequelize')
    let loggedInUser
    if (req.payload && req.payload.id) {
      loggedInUser = await sequelize.models.User.findByPk(req.payload.id)
    }
    let ret = {
      // Inform the UI that the user's login failed.
      loggedIn: !!loggedInUser,
    }
    res.json(ret)
  } catch(error) {
    next(error);
  }
})

// TODO need to think about and test privacy issues with this, e.g. email leaking.
//router.get(routes.home(), auth.required, async function(req, res, next) {
//  try {
//    let query
//    try {
//      query = JSON.parse(req.query.query)
//    } catch(error) {
//      throw new lib.ValidationError(['Invalid query JSON'], 403)
//    }
//    const ret = {}
//    if (query.articleIds) {
//      const ids = []
//      for (let idString of query.articleIds) {
//        ids.push(lib.validate(idString, lib.isPositiveInteger, 'articleIds'))
//      }
//      const objArr = await req.app.get('sequelize').models.UserLikeArticle.findAll({
//        where: {
//          userId: req.payload.id,
//          articleId: ids,
//        },
//        attributes: ['articleId'],
//      })
//      const idSet = new Set(objArr.map(a => a.articleId ))
//      ret.articles = ids.map(id => { return { liked: idSet.has(id) } })
//    }
//    if (query.userIds) {
//      const ids = []
//      for (let idString of query.userIds) {
//        ids.push(lib.validate(idString, lib.isPositiveInteger, 'userIds'))
//      }
//      const objArr = await req.app.get('sequelize').models.UserFollowUser.findAll({
//        where: {
//          userId: req.payload.id,
//          followId: ids,
//        },
//        attributes: ['followId'],
//      })
//      const idSet = new Set(objArr.map(a => a.followId ))
//      ret.users = ids.map(id => { return { following: idSet.has(id) } })
//    }
//    res.json(ret)
//  } catch(error) {
//    next(error);
//  }
//})

module.exports = router
