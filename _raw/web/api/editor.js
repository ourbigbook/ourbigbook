// Provide the information that the editor needs to render the input.
// The editor will minimally request what it might need, and cache aggressively,
// this API ust provides generously as asked.

const router = require('express').Router()

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe');

const auth = require('../auth')
const front = require('../front/js')
const lib = require('./lib')

router.post('/id-completions', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const body = lib.validateParam(req, 'body')
    const query = lib.validateParam(body, 'query', {
      validators: [front.isString, value => value.length <= 256],
    })
    const username = lib.validateParam(body, 'username', {
      validators: [front.isString, value => /^[a-z0-9][a-z0-9-]{0,255}$/.test(value)],
    })
    // Match public IDs, including non-header anchors. Escape LIKE wildcards literally.
    const escapeLike = value => value.replace(/[!%_]/g, '!$&')
    const prefix = `@${username}/`
    const explicitUser = query.startsWith('@')
    const column = sequelize.getQueryInterface().queryGenerator.quoteIdentifier('idid')
    const like = pattern => `${column} LIKE ${sequelize.escape(pattern)} ESCAPE '!'`
    const start = escapeLike(explicitUser ? query : prefix + query)
    const pattern = explicitUser ? `${escapeLike(query)}%` : `${escapeLike(prefix)}%${escapeLike(query)}%`
    const rows = await sequelize.models.Id.findAll({
      attributes: ['idid', 'ast_json'],
      where: sequelize.literal(like(pattern)),
      order: [
        [sequelize.literal(`CASE WHEN ${like(start + '%')} THEN 0 ELSE 1 END`), 'ASC'],
        [sequelize.fn('LENGTH', sequelize.col('idid')), 'ASC'],
        ['idid', 'ASC'],
      ],
      limit: 100,
    })
    const context = ourbigbook.convertInitContext({ output_format: ourbigbook.OUTPUT_FORMAT_ID })
    const titles = Object.fromEntries(rows.map(row => [row.idid,
      ourbigbook.getIdCompletionTitle(ourbigbook.AstNode.fromJSON(row.ast_json, context), context),
    ]))
    return res.json({ ids: Object.keys(titles), titles })
  } catch (error) { next(error) }
})

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
