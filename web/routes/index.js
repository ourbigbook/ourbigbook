const router = require('express').Router()
let indexCache
router.use('/api', require('./api'))
module.exports = router
