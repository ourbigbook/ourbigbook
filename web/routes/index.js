const configShared = require('../config/shared')
const router = require('express').Router()

let indexCache
router.use(configShared.apiPath, require('./api'))
module.exports = router
