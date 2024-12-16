const router = require('express').Router()

// heroku bootstrap
router.get('/', function(req, res) {
  res.json({message: 'backend is up'})
});
router.use('/', require('./users'))
router.use('/articles', require('./articles'))
router.use('/editor', require('./editor'))
router.use('/issues', require('./issues'))
router.use(`/min`, require('./min'))
router.use(`/site`, require('./site'))
router.use('/topics', require('./topics'))
router.use('/upload', require('./upload'))

module.exports = router
