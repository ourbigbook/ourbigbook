const router = require('express').Router()
const passport = require('passport')
const auth = require('../auth')
const lib = require('./lib')

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
  req.app.get('sequelize').models.User.findOne({ where: { username } })
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
    if (!req.body.user) {
      throw new lib.ValidationError('user cannot be empty')
    }
    if (!req.body.user.username) {
      throw new lib.ValidationError({ username: 'cannot be empty' })
    }
    if (!req.body.user.password) {
      throw new lib.ValidationError({ password: 'cannot be empty' })
    }
    await authenticate(req, res, next)
  } catch(error) {
    next(error);
  }
})

router.get('/users', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    const [loggedInUser, {count: usersCount, rows: users}] = await Promise.all([
      sequelize.models.User.findByPk(req.payload.id),
      sequelize.models.User.getUsers({
        sequelize,
        limit,
        offset,
        order: lib.getOrder(req),
      }),
    ])
    return res.json({
      users: await Promise.all(users.map((user) => {
        return user.toJson(loggedInUser)
      })),
      usersCount,
    })
  } catch(error) {
    next(error);
  }
})

router.get('/users/:username', auth.optional, async function(req, res, next) {
  try {
    const loggedInUser = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    return res.json({ user: await req.user.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Create a new user.
router.post('/users', async function(req, res, next) {
  try {
    if (!req.body.user) {
      throw new lib.ValidationError('user cannot be empty')
    }
    if (!req.body.user.username) {
      throw new lib.ValidationError({ username: 'cannot be empty' })
    }
    if (!req.body.user.email) {
      throw new lib.ValidationError({ email: 'cannot be empty' })
    }
    if (!req.body.user.password) {
      throw new lib.ValidationError({ password: 'cannot be empty' })
    }
    let user = new (req.app.get('sequelize').models.User)()
    user.username = req.body.user.username
    user.displayName = req.body.user.displayName
    user.email = req.body.user.email
    user.ip = lib.getClientIp(req)
    req.app.get('sequelize').models.User.setPassword(user, req.body.user.password)
    await user.saveSideEffects()
    await authenticate(req, res, next)
  } catch(error) {
    next(error);
  }
})

// Modify information about the currently logged in user.
router.put('/users/:username', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const user = await sequelize.models.User.findByPk(req.payload.id)
    if (req.body.user) {
      // only update fields that were actually passed...
      if (typeof req.body.user.username !== 'undefined') {
        //user.username = req.body.user.username
        if (user.username !== req.body.user.username) {
          throw new lib.ValidationError(
            [`username cannot be modified currently, would change from ${user.username} to ${req.body.user.username}`],
          )
        }
      }
      if (typeof req.body.user.displayName !== 'undefined') {
        user.displayName = req.body.user.displayName
      }
      if (typeof req.body.user.email !== 'undefined') {
        user.email = req.body.user.email
      }
      if (typeof req.body.user.image !== 'undefined') {
        user.image = req.body.user.image
      }
      if (typeof req.body.user.password !== 'undefined') {
        sequelize.models.User.setPassword(user, req.body.user.password)
      }
      await user.save()
    }
    user.token = user.generateJWT()
    return res.json({ user: await user.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// Follow

async function validateFollow(req, res, user, isFollow) {
  if (await user.hasFollow(req.user) === isFollow) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isFollow ? 'already follows' : 'does not follow'} user '${req.user.username}'`],
      403,
    )
  }
}

router.post('/users/:username/follow', auth.required, async function(req, res, next) {
  try {
    const user = await req.app.get('sequelize').models.User.findByPk(req.payload.id)
    await validateFollow(req, res, user, true)
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
    await validateFollow(req, res, user, false)
    await user.removeFollowSideEffects(req.user)
    const newUser = await req.app.get('sequelize').models.User.findOne({
      where: { username: user.username } })
    return res.json({ user: await req.user.toJson(user) })
  } catch(error) {
    next(error);
  }
})

module.exports = router
