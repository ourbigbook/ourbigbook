const router = require('express').Router()
const { minPath }  = require('../shared')

// heroku bootstrap
router.get('/', function(req, res) {
  res.json({message: 'backend is up'})
});
router.use('/', require('./users'))
router.use('/articles', require('./articles'))
router.use('/comments', require('./comments'))
router.use(`/${minPath}`, require('./min'))

module.exports = router
