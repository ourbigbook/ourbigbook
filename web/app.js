const passport = require('passport')
const passport_local = require('passport-local');
const http = require('http')
const path = require('path')
const methods = require('methods')
const express = require('express')
const bodyParser = require('body-parser')
const session = require('express-session')
const cors = require('cors')
const errorhandler = require('errorhandler')
const next = require('next')

const models = require('./models')
const config = require('./config')
const app = express()

const nextApp = next({ dev: !config.isProduction })
const nextHandle = nextApp.getRequestHandler()
nextApp.prepare().then(() => {
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
            if (!user || !user.validPassword(password)) {
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
    app.use(require('morgan')('dev'))
  }
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(require('method-override')())
  const buildDir = path.join(__dirname, 'frontend', 'build');
  app.use(express.static(buildDir));

  // Next handles anythiung outside of /api.
  app.get(new RegExp('^(?!' + config.apiPath + '(/|$))'), function (req, res) {
    return nextHandle(req, res);
  });

  // Use express for everything else (i.e. anything under /api).
  app.use(session({ secret: 'conduit', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }))
  app.use(config.apiPath, require('./api'))

  // 404 handler.
  app.use(function (req, res, next) {
    res.status(404).send('error: 404 Not Found ' + req.path)
  })

  // Error handlers
  if (config.isProduction) {
    app.use(function(err, req, res, next) {
      res.status(500).send('error: 500 Internal Server Error')
    });
  } else {
    app.use(errorhandler())
  }

  if (!module.parent) {
    (async () => {
      try {
        sequelize.authenticate();
        sequelize.sync();
        app.set('sequelize', sequelize)
        start();
      } catch (e) {
        console.error(e);
        process.exit(1)
      }
    })()
  }

});

function start(cb) {
  const server = app.listen(config.port, function() {
    console.log('Backend listening on: http://localhost:' + config.port)
    cb && cb(server)
  })
}

module.exports = { app, start }
