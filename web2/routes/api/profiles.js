const router = require('express').Router()
const auth = require('../auth')

// Preload user profile on routes with ':username'
router.param('username', function(req, res, next, username) {
  req.app.get('sequelize').models.User.findOne({ where: { username: username } })
    .then(function(user) {
      if (!user) {
        return res.sendStatus(404)
      }

      req.profile = user

      return next()
    })
    .catch(next)
})

router.get('/:username', auth.optional, async function(req, res, next) {
  try {
    let toProfileJSONForUser;
    if (req.payload) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
      if (user) {
        toProfileJSONForUser = user
      } else {
        toProfileJSONForUser = false
      }
    } else {
      toProfileJSONForUser = false
    }
    return res.json({ profile: await req.profile.toProfileJSONFor(toProfileJSONForUser) })
  } catch(error) {
    next(error);
  }
})

router.post('/:username/follow', auth.required, async function(req, res, next) {
  try {
    let profileId = req.profile.id
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    await user.addFollow(profileId)
    return res.json({ profile: await req.profile.toProfileJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

router.delete('/:username/follow', auth.required, async function(req, res, next) {
  try {
    let profileId = req.profile.id
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    await user.removeFollow(profileId)
    return res.json({ profile: await req.profile.toProfileJSONFor(user) })
  } catch(error) {
    next(error);
  }
})

module.exports = router
