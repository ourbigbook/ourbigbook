const url = require('url');

const { sendJsonHttp } = require('ourbigbook/web_api')

const { cant } = require('../front/cant')
const router = require('express').Router()
const passport = require('passport')
const auth = require('../auth')
const lib = require('./lib')
const front = require('../front/js')
const config = require('../front/config')
const routes = require('../front/routes')

async function authenticate(req, res, next, opts={}) {
  const { forceVerify } = opts
  passport.authenticate('local', { session: false }, async function(err, user, info) {
    if (err) {
      return next(err)
    }
    if (user) {
      if (user.verified || forceVerify) {
        user.token = user.generateJWT()
        verified = true
      } else {
        verified = false
      }
      return res.json({
        user: await user.toJson(user),
        verified,
      })
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
    const body = lib.validateParam(req, 'body')
    const user = lib.validateParam(body, 'user')
    const username = lib.validateParam(user, 'username')
    const password = lib.validateParam(user, 'password')
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
      req.payload ? sequelize.models.User.findByPk(req.payload.id) : null,
      sequelize.models.User.getUsers({
        // https://github.com/ourbigbook/ourbigbook/issues/260
        followedBy: req.query.followedBy,
        following: req.query.following,
        limit,
        offset,
        order: lib.getOrder(req),
        sequelize,
        username: req.query.username,
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

// Create a new user.
router.post('/users', async function(req, res, next) {
  try {
    const body = lib.validateParam(req, 'body')
    const userPost = lib.validateParam(body, 'user')
    const username = lib.validateParam(userPost, 'username')
    const email = lib.validateParam(userPost, 'email')
    const password = lib.validateParam(userPost, 'password')
    const displayName = lib.validateParam(userPost, 'displayName', {
      validators: [front.isString, front.isTruthy],
      defaultValue: undefined,
    })
    if (config.useCaptcha) {
      ;({data, status} = await sendJsonHttp(
        'POST',
        '/recaptcha/api/siteverify',
        {
          contentType: 'application/x-www-form-urlencoded',
          https: true,
          hostname: 'www.google.com',
          validateStatus: () => true,
          body: new url.URLSearchParams({
            secret: process.env.RECAPTCHA_SECRET_KEY,
            response: req.body.recaptchaToken,
          }).toString(),
        }
      ))
      if (status !== 200) {
        return res.sendStatus(503)
      }
      if (!data.success) {
        console.error(`recaptcha error: ${data}`);
        throw new lib.ValidationError(['reCAPTCHA failed'])
      }
    }
    const sequelize = req.app.get('sequelize')
    const User = sequelize.models.User
    // We fetch the existing account by email.
    // https://github.com/ourbigbook/ourbigbook/issues/329
    const existingUser = await User.findOne({ where: { email }})
    let user
    let adminsPromise
    if (existingUser) {
      user = existingUser
      if (user.verified) {
        throw new lib.ValidationError([`email already taken: ${email}`])
      } else {
        // Re-send the email if enough time passed.
        const timeToWaitMs = (
          user.verificationCodeSent.getTime() +
          lib.MILLIS_PER_MINUTE * User.verificationCodeNToTimeDeltaMinutes(user.verificationCodeN)
        ) - (new Date()).getTime()
        if (timeToWaitMs > 0) {
          throw new lib.ValidationError([`Email already registered but not verified. You can re-send a confirmation email in: ${lib.msToRoundedTime(timeToWaitMs)}`])
        } else {
          user.verificationCode = User.generateVerificationCode()
          user.verificationCodeN += 1
          adminsPromise = null
        }
      }
    } else {
      user = new (User)()
      // username is set only in this else.
      // https://github.com/ourbigbook/ourbigbook/issues/329
      user.username = username
      user.verificationCodeN = 1
      user.email = email
      user.ip = front.getClientIp(req)
      if (config.isTest) {
        // Authenticate all users automatically.
        user.verified = true
      }
      adminsPromise = User.findAll({ where: { admin: true }})
    }
    user.displayName = displayName
    User.setPassword(user, password)
    user.verificationCodeSent = new Date()
    const [, admins] = await Promise.all([
      user.saveSideEffects(),
      adminsPromise,
    ])
    if (config.isTest) {
      return authenticate(req, res, next, { forceVerify: true })
    }
    const verifyUrl = `${routes.host(req)}${routes.userVerify()}?email=${encodeURIComponent(user.email)}&code=${user.verificationCode}`
    lib.sendEmail({
      to: user.email,
      subject: `Verify your new OurBigBook.com account`,
      html: `<p>Welcome to OurBigBook.com!</p><p>Please <a href="${verifyUrl}">click this link to verify your account</a>.</p>`,
      text: `Welcome to OurBigBook.com!

Please click this link to verify your account: ${verifyUrl}
`,
    })
    const profileUrl = `${routes.host(req)}${routes.user(user.username)}`
    if (admins) {
      for (const admin of admins) {
        lib.sendEmail({
          to: admin.email,
          subject: `A new user signed up: ${user.displayName} (@${user.username}, ${user.email})!`,
          html: `<p><a href="${profileUrl}">${profileUrl}</a></p><p>Another step towards world domination is taken!</p>`,
          text: `${profileUrl}

Another step towards world domination is taken!
`,
        })
      }
    }
    return res.json({ user: await user.toJson(user) })
  } catch(error) {
    next(error);
  }
})

// Modify information about the currently logged in user.
// Backend for settings page on the web UI.
router.put('/users/:username', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const user = req.user
    const loggedInUser = await sequelize.models.User.findByPk(req.payload.id)
    const msg = cant.editUser(loggedInUser, user)
    if (msg) {
      throw new lib.ValidationError( [msg], 403)
    }
    const userArg = req.body.user
    if (userArg) {
      // only update fields that were actually passed...
      if (typeof userArg.username !== 'undefined') {
        //user.username = userArg.username
        if (user.username !== userArg.username) {
          throw new lib.ValidationError(
            [`username cannot be modified currently, would change from ${user.username} to ${userArg.username}`],
          )
        }
      }
      if (typeof userArg.email !== 'undefined') {
        //user.email = userArg.email
        if (user.email !== userArg.email) {
          throw new lib.ValidationError(
            [`email cannot be modified currently, would change from ${user.email} to ${userArg.email}`],
          )
        }
      }
      if (typeof userArg.displayName !== 'undefined') {
        const displayName = lib.validateParam(userArg, 'displayName', {
          validators: [front.isString, front.isTruthy],
          defaultValue: undefined,
        })
        user.displayName = displayName
      }
      if (typeof userArg.image !== 'undefined') {
        user.image = userArg.image
      }
      const emailNotifications = lib.validateParam(userArg, 'emailNotifications', {
        validators: [front.isBoolean],
        defaultValue: undefined,
      })
      if (emailNotifications !== undefined) {
        user.emailNotifications = userArg.emailNotifications
      }
      const hideArticleDates = lib.validateParam(userArg, 'hideArticleDates', {
        validators: [front.isBoolean],
        defaultValue: undefined,
      })
      if (hideArticleDates !== undefined) {
        user.hideArticleDates = userArg.hideArticleDates
      }
      if (!cant.setUserLimits(loggedInUser)) {
        const maxArticles = lib.validateParam(userArg, 'maxArticles', {
          typecast: front.typecastInteger,
          validators: [front.isPositiveInteger],
          defaultValue: undefined,
        })
        if (maxArticles !== undefined) {
          user.maxArticles = maxArticles
        }
        const maxArticleSize = lib.validateParam(userArg, 'maxArticleSize', {
          typecast: front.typecastInteger,
          validators: [front.isPositiveInteger],
          defaultValue: undefined,
        })
        if (maxArticleSize !== undefined) {
          user.maxArticleSize = maxArticleSize
        }
        const maxIssuesPerMinute = lib.validateParam(userArg, 'maxIssuesPerMinute', {
          typecast: front.typecastInteger,
          validators: [front.isPositiveInteger],
          defaultValue: undefined,
        })
        if (maxIssuesPerMinute !== undefined) {
          user.maxIssuesPerMinute = maxIssuesPerMinute
        }
        const maxIssuesPerHour = lib.validateParam(userArg, 'maxIssuesPerHour', {
          typecast: front.typecastInteger,
          validators: [front.isPositiveInteger],
          defaultValue: undefined,
        })
        if (maxIssuesPerHour !== undefined) {
          user.maxIssuesPerHour = maxIssuesPerHour
        }
      }
      if (typeof userArg.password !== 'undefined') {
        sequelize.models.User.setPassword(user, userArg.password)
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
  if ((await user.hasFollow(req.user)) === isFollow) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isFollow ? 'already follows' : 'does not follow'} user '${req.user.username}'`],
      403,
    )
  }
}

// Follow user.
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

// Unfollow user.
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
