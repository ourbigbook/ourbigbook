// Provide the information that the editor needs to render the input.
// The editor will minimally request what it might need, and cache agressively,
// this API ust provides generously as asked.

const router = require('express').Router()

const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe');

const auth = require('../auth')
const front = require('../front/js')
const lib = require('./lib')

router.post('/fetch-files', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const body = lib.validateParam(req, 'body')
    const paths = lib.validateParam(body, 'paths', {
      validators: [ front.isArrayOf(front.isString) ],
      defaultValue: [],
    })
    const rows = await sequelize.models.File.findAll({
      where: { path: paths },
      include: [
        {
          model: sequelize.models.Id,
          as: 'toplevelId',
        }
      ],
      order: [[ 'path', 'ASC' ]]
    })
    return res.json({ files: rows })
  } catch(error) { next(error); }
})

// Has to be post to be able to send body data. We don't want to URL encode to not blow up URL size limits.
// https://stackoverflow.com/questions/978061/http-get-with-request-body
router.post('/get-noscopes-base-fetch', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const body = lib.validateParam(req, 'body')
    const ids = lib.validateParam(body, 'ids', {
      validators: [ front.isArrayOf(front.isString) ],
      defaultValue: [],
    })
    const ignore_paths_set = lib.validateParam(body, 'ignore_paths_set', {
      validators: [ front.isArrayOf(front.isString) ],
      defaultValue: [],
    })
    const rows = await ourbigbook_nodejs_webpack_safe.get_noscopes_base_fetch_rows(sequelize, ids, ignore_paths_set)
    return res.json({ rows })
  } catch(error) { next(error); }
})

router.post('/id-exists', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const body = lib.validateParam(req, 'body')
    const idid = lib.validateParam(body, 'idid', {
      validators: [front.isString],
      defaultValue: undefined,
    })
    const exists = (await sequelize.models.Id.count({ where: { idid } })) > 0
    return res.json({ exists })
  } catch(error) { next(error); }
})

module.exports = router
