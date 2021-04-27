const config = require('../config')
const router = require('express').Router()

let indexCache
router.use(config.apiPath, require('./api'))
module.exports = router
