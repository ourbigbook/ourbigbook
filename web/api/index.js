const router = require('express').Router()
const Sequelize = require('sequelize')

// heroku bootstrap
router.get('/', function(req, res) {
  res.json({message: 'backend is up'})
});
router.use('/', require('./users'))
router.use('/profiles', require('./profiles'))
router.use('/articles', require('./articles'))
router.use('/tags', require('./tags'))

router.use(function(err, req, res, next) {
  if (err instanceof Sequelize.ValidationError) {
    return res.status(422).json({
      errors: err.errors.map(errItem => errItem.message)
    })
  }
  return next(err)
})

module.exports = router
