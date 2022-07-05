const url = require('url');

const { sendJsonHttp } = require('ourbigbook/web_api')

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
      let missingVerify
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
    const loggedInUser = req.payloas ? await req.app.get('sequelize').models.User.findByPk(req.payload.id) : null
    return res.json({ user: await req.user.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

async function sendEmail({ subject, html, text, user }) {
  if (!config.isTest) {
    if (process.env.OURBIGBOOK_SEND_EMAIL === '1' || config.isProduction) {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      const msg = {
        to: user.email,
        from: 'ciro@ourbigbook.com',
        subject,
        text,
        html,
      }
      await sgMail.send(msg)
    } else {
      console.log(`Email sent:
to: ${user.email}
subject: ${subject}
text: ${text}
html: ${html}`)
    }
  }
}

// Create a new user.
router.post('/users', async function(req, res, next) {
  try {
    const body = lib.validateParam(req, 'body')
    const userPost = lib.validateParam(body, 'user')
    const username = lib.validateParam(userPost, 'username')
    const email = lib.validateParam(userPost, 'email')
    const password = lib.validateParam(userPost, 'password')
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
        console.error(data);
        throw new lib.ValidationError(['reCAPTCHA failed'])
      }
    }
    const sequelize = req.app.get('sequelize')
    const user = new (sequelize.models.User)()
    user.username = username
    user.displayName = userPost.displayName
    user.email = email
    user.ip = front.getClientIp(req)
    sequelize.models.User.setPassword(user, password)
    if (config.isTest) {
      // Authenticate all users automatically.
      user.verified = true
    }
    await user.saveSideEffects()
    if (config.isTest) {
      return authenticate(req, res, next, { forceVerify: true })
    }
    sendEmail({
      user,
      subject: `Verify your OurBigBook.com account`,
      html: `<p>Click <a href="${req.protocol}://${req.get('host')}${routes.userVerify()}?email=${encodeURIComponent(user.email)}&code=${user.verificationCode}">this verification link</a>.</p>`,
      text: `Your verification link is: ${req.protocol}://${req.get('host')}${routes.userVerify()}?email=${encodeURIComponent(user.email)}&code=${user.verificationCode}`,
    })
    return res.json({ user: await user.toJson(user) })
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
