// https://stackoverflow.com/questions/7697038/more-than-10-lines-in-a-node-js-stack-error
Error.stackTraceLimit = Infinity;

const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const UnauthorizedError = require('express-jwt/lib/errors/UnauthorizedError');
const morgan = require('morgan')
const next = require('next')
const passport = require('passport')
const passport_local = require('passport-local');
const session = require('express-session')

const api = require('./api')
const apilib = require('./api/lib')
const back_js = require('./back/js')
const models = require('./models')
const config = require('./front/config')
const front = require('./front/js')

async function start(port, startNext, cb) {
  const app = express()
  let nextApp
  let nextHandle
  if (startNext) {
    nextApp = next({ dev: !config.isProductionNext })
    nextHandle = nextApp.getRequestHandler()
  }

  const sequelize = models.getSequelize(__dirname)
  // https://stackoverflow.com/questions/57467589/req-protocol-is-always-http-and-not-https
  // req.protocol was fixed to HTTP instead of HTTPS, leading to emails sent from HTTPS having HTTP links.
  app.enable('trust proxy')

  // Enforce HTTPS.
  // https://github.com/ourbigbook/ourbigbook/issues/258
  app.use(function (req, res, next) {
    if (config.isProduction && req.headers['x-forwarded-proto'] === 'http') {
      res.redirect(301, `https://${req.hostname}${req.url}`);
      return;
    }
    next()
  })

  app.set('sequelize', sequelize)
  if (config.isTest) {
    app.set('emails', [])
  }
  passport.use(
    new passport_local.Strategy(
      {
        usernameField: 'user[username]',
        passwordField: 'user[password]'
      },
      async function(usernameOrEmail, password, done) {
        let field
        if (front.isEmail(usernameOrEmail)) {
          field = 'email'
        } else {
          field = 'username'
        }
        const user = await sequelize.models.User.findOne({ where: { [field]: usernameOrEmail } })
        if (!user || !sequelize.models.User.validPassword(user, password)) {
          return done(null, false, { errors: { 'username or password': `is invalid: usernameOrEmail=${usernameOrEmail}` } })
        }
        return done(null, user)
      }
    )
  )
  app.use(cors())

  // Normal express config defaults
  if (config.verbose) {
    // https://stackoverflow.com/questions/42099925/logging-all-requests-in-node-js-express/64668730#64668730
    app.use(morgan('combined'))
  }
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json({
    // Happens due to our huge input files!
    // https://stackoverflow.com/questions/19917401/error-request-entity-too-large
    limit: '16mb'
  }))
  app.use(require('method-override')())

  // Next handles anything outside of /api.
  app.get(new RegExp('^(?!' + config.apiPath + '(/|$))'), function (req, res) {
    // We pass the sequelize that we have already created and connected to the database
    // so that the Next.js backend can just use that connection. This is in particular mandatory
    // if we wish to use SQLite in-memory database, because there is no way to make two separate
    // connections to the same in-memory database. In memory databases are used by the test system.
    req.sequelize = sequelize
    return nextHandle(req, res);
  });
  app.use(session({ secret: config.secret, cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }))

  // Handle API routes.
  {
    // This is not visible on frontend unfortunately, we just have to redo it there again.
    config.convertOptions.katex_macros = back_js.preloadKatex()
    const router = express.Router()
    router.use(config.apiPath, api)
    app.use(router)
  }

  // 404 handler.
  app.use(function (req, res, next) {
    res.status(404).send('error: 404 Not Found ' + req.path)
  })

  // Error handlers
  app.use(function(err, req, res, next) {
    // Automatically handle Sequelize validation errors.
    if (err instanceof sequelize.Sequelize.ValidationError) {
      if (!config.isProduction && !config.isTest) {
        // The fuller errors can be helpful during development.
        console.error(err);
      }
      const errors = {}
      for (let errItem of err.errors) {
        let errorsForColumn = errors[errItem.path]
        if (errorsForColumn === undefined) {
          errorsForColumn = []
          errors[errItem.path] = errorsForColumn
        }
        errorsForColumn.push(errItem.message)
      }
      const ret = { errors }
      if (!config.isProduction) {
        // err.errors can be empty in some cases, e.g. NOT NULL constraint faiures on SQLite
        // In those cases, the actual error appears under "parent".
        ret.fullError = err
      }
      return res.status(422).json(ret)
    } else if (err instanceof apilib.ValidationError) {
      return res.status(err.status).json({
        errors: err.errors,
      })
    } else if (err instanceof UnauthorizedError) {
      return res.status(err.status).json({
        errors: err.message,
      })
    }
    return next(err)
  })

  if (startNext) {
    await nextApp.prepare()
  }
  await sequelize.authenticate()

  // Just a convenience DB create so we don't have to force new users to do it manually.
  await models.sync(sequelize)
  return new Promise((resolve, reject) => {
    const server = app.listen(port, async function () {
      try {
        cb && (await cb(server, sequelize, app))
      } catch (e) {
        reject(e)
        this.close()
        throw e
      }
    })
    server.on('close', async function () {
      if (startNext) {
        // Didn't help either.
        // https://github.com/ourbigbook/ourbigbook/issues/353
        //const server = await nextApp.getServer()
        //await server.close()
        await nextApp.close()
      }
      await sequelize.close()
      resolve()
    })
  })
}

if (require.main === module) {
  start(config.port, !config.disableFrontend, (server) => {
    console.log('Listening on: http://localhost:' + server.address().port)
  })
}

module.exports = { start }
