// This endpoint implements a simplistic filesystem that stores and retrieves blobs given an input path.
// These should likely be stored in a static file server, but lazy to set that up for now, so I'll
// just store everything in the DB to start with until I regret the choice one day and migrate.

const router = require('express').Router()

const auth = require('../auth')
const lib = require('./lib')

router.get('/:path(*)', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const path = req.params.path
    const upload = await sequelize.models.Upload.findOne({ where: { path }})
    if (!upload) {
      throw new lib.ValidationError(`path does not exist: ${path}`)
    }
    res.set({
      'Content-Type': upload.contentType,
      'Last-Modified': upload.updatedAt.toUTCString()
    })
    res.write(upload.bytes)
    return res.end()
  } catch(error) {
    next(error);
  }
})

module.exports = router
