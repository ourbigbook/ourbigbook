// https://stackoverflow.com/questions/7697038/more-than-10-lines-in-a-node-js-stack-error
Error.stackTraceLimit = Infinity;

const bodyParser = require('body-parser')
const cors = require('cors')
const errorhandler = require('errorhandler')
const express = require('express')
const http = require('http')
const methods = require('methods')
const morgan = require('morgan')
const next = require('next')
const passport = require('passport')
const passport_local = require('passport-local');
const path = require('path')
const session = require('express-session')

const api = require('./api')
const models = require('./models')
const config = require('./config')

function doStart(app) {
  const sequelize = models(__dirname);
  passport.use(
    new passport_local.Strategy(
      {
        usernameField: 'user[email]',
        passwordField: 'user[password]'
      },
      function(email, password, done) {
        sequelize.models.User.findOne({ where: { email: email } })
          .then(function(user) {
            if (!user || !sequelize.models.User.validPassword(user, password)) {
              return done(null, false, { errors: { 'email or password': 'is invalid' } })
            }

            return done(null, user)
          })
          .catch(done)
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
  app.use(bodyParser.json())
  app.use(require('method-override')())

  // Next handles anythiung outside of /api.
  app.get(new RegExp('^(?!' + config.apiPath + '(/|$))'), function (req, res) {
    return nextHandle(req, res);
  });
  app.use(session({ secret: config.secret, cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }))

  // Handle API routes.
  {
    const router = express.Router()
    router.use(config.apiPath, api)
    app.use(router)
  }

  // 404 handler.
  app.use(function (req, res, next) {
    res.status(404).send('error: 404 Not Found ' + req.path)
  })

  // Error handlers
  if (config.isProduction) {
    app.use(function(err, req, res, next) {
      console.error(err.stack)
      res.status(500).send('error: 500 Internal Server Error')
    });
  } else {
    app.use(errorhandler())
  }

  if (!module.parent) {
    (async () => {
      try {
        await sequelize.authenticate();
        await sequelize.sync();
        app.set('sequelize', sequelize)
        start();
      } catch (e) {
        console.error(e);
        process.exit(1)
      }
    })()
  }
}

function start(cb) {
  const server = app.listen(config.port, function() {
    console.log('Backend listening on: http://localhost:' + config.port)
    cb && cb(server)
  })
}

const app = express()
const nextApp = next({ dev: !config.isProductionNext })
const nextHandle = nextApp.getRequestHandler()
nextApp.prepare().then(() => {
  doStart(app)
})

module.exports = { app, start }
