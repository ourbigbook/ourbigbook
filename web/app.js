const http = require('http')
const path = require('path')
const methods = require('methods')
const express = require('express')
const bodyParser = require('body-parser')
const session = require('express-session')
const cors = require('cors')
const passport = require('passport')
const errorhandler = require('errorhandler')

const model = require('./models')
const config = require('./config')
const app = express()

require('./config/passport')

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
// TODO revive proper deployment setup with next.
//app.get(new RegExp('^(?!' + config.apiPath + '(/|$))'), function (req, res) {
//  res.sendFile(path.join(buildDir, 'index.html'));
//});
app.use(session({ secret: 'conduit', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }))
app.use(require('./routes'))

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
      await model.sequelize.authenticate();
      await model.sequelize.sync();
      start();
    } catch (e) {
      console.error(e);
      process.exit(1)
    }
  })()
}

function start(cb) {
  const server = app.listen(config.port, function() {
    console.log('Backend listening on: http://localhost:' + config.port)
    cb && cb(server)
  })
}

module.exports = { app, start }
