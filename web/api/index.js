const router = require('express').Router()

// heroku bootstrap
router.get('/', function(req, res) {
  res.json({message: 'backend is up'})
});
router.use('/', require('./users'))
router.use('/articles', require('./articles'))
router.use('/comments', require('./comments'))
router.use('/tags', require('./tags'))

module.exports = router
