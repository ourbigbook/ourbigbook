const config = require('../config')
const express = require('express')
const Sequelize = require('sequelize')

const router = require('express').Router()
router.get('/', function(req, res) {
  res.json({message: 'the backend is up'})
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
