const router = require('express').Router()
const { minPath }  = require('../front/js')

// heroku bootstrap
router.get('/', function(req, res) {
  res.json({message: 'backend is up'})
});
router.use('/', require('./users'))
router.use('/articles', require('./articles'))
router.use('/issues', require('./issues'))
//router.use(`/${minPath}`, require('./min'))

module.exports = router
