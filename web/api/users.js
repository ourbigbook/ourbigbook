const router = require('express').Router()
const passport = require('passport')
const auth = require('../auth')

async function authenticate(req, res, next) {
  passport.authenticate('local', { session: false }, async function(err, user, info) {
    if (err) {
      return next(err)
    }
    if (user) {
      user.token = user.generateJWT()
      return res.json({ user: await user.toJson(user) })
    } else {
      return res.status(422).json(info)
    }
  })(req, res, next)
}

// Preload user profile on routes with ':username'
router.param('username', function(req, res, next, username) {
  req.app.get('sequelize').models.User.findOne({ where: { username: username } })
    .then(function(user) {
      if (!user) {
        return res.sendStatus(404)
      }
      req.user = user
      return next()
    })
    .catch(next)
})

// Login to the website.
router.post('/login', async function(req, res, next) {
  try {
    if (!req.body.user.email) {
      return res.status(422).json({ errors: { email: "can't be blank" } })
    }
    if (!req.body.user.password) {
      return res.status(422).json({ errors: { password: "can't be blank" } })
    }
    await authenticate(req, res, next)
  } catch(error) {
    next(error);
  }
})

router.get('/users/:username', auth.optional, async function(req, res, next) {
  try {
    let loggedInUser;
    if (req.payload) {
      const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
      if (user) {
        loggedInUser = user
      } else {
        loggedInUser = false
      }
    } else {
      loggedInUser = false
    }
    return res.json({ user: await req.user.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Create a new user.
router.post('/users', async function(req, res, next) {
  try {
    let user = new (req.app.get('sequelize').models.User)()
    user.username = req.body.user.username
    user.displayName = req.body.user.displayName
    user.email = req.body.user.email
    req.app.get('sequelize').models.User.setPassword(user, req.body.user.password)
    await user.save()
    await authenticate(req, res, next)
  } catch(error) {
    next(error);
  }
})

// Modify information about the currently logged in user.
router.put('/users/:username', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    // only update fields that were actually passed...
    if (typeof req.body.user.username !== 'undefined') {
      user.username = req.body.user.username
    }
    if (typeof req.body.user.displayName !== 'undefined') {
      user.displayName = req.body.user.displayName
    }
    if (typeof req.body.user.email !== 'undefined') {
      user.email = req.body.user.email
    }
    if (typeof req.body.user.bio !== 'undefined') {
      user.bio = req.body.user.bio
    }
    if (typeof req.body.user.image !== 'undefined') {
      user.image = req.body.user.image
    }
    if (typeof req.body.user.password !== 'undefined') {
      req.app.get('sequelize').models.User.setPassword(user, req.body.user.password)
    }
    await user.save()
    return res.json({ user: await user.toJson(user) })
  } catch(error) {
    next(error);
  }
})

router.post('/users/:username/follow', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    await user.addFollowSideEffects(req.user)
    const newUser = await req.app.get('sequelize').models.User.findOne({
      where: { username: user.username } })
    return res.json({ user: await req.user.toJson(newUser) })
  } catch(error) {
    next(error);
  }
})

router.delete('/users/:username/follow', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    if (!user) {
      return res.sendStatus(401)
    }
    await user.removeFollowSideEffects(req.user)
    const newUser = await req.app.get('sequelize').models.User.findOne({
      where: { username: user.username } })
    return res.json({ user: await req.user.toJson(user) })
  } catch(error) {
    next(error);
  }
})

module.exports = router
