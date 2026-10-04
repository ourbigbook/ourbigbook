// Contains exports that should only be visible from Node.js but not browser.

const path = require('path')
const fs = require('fs')

const ourbigbook = require('./index.js')
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe.js')

const commander = require('commander')

let checkDbCodeHash

// CLI SQLite only. Revision triggers also see extraction done by worker processes;
// rendering timestamps are deliberately not used as an extraction generation.
// These disposable cache tables need no migration of existing CLI databases.
async function checkDbWithCache(sequelize, paths, opts = {}) {
  const check = ourbigbook_nodejs_webpack_safe.check_db
  if (sequelize.getDialect() !== 'sqlite' || opts.web || opts.transaction || opts.parentOverride) {
    return check(sequelize, paths, opts)
  }
  const crypto = require('crypto')
  const hash = value => crypto.createHash('sha256').update(value).digest('hex')
  if (checkDbCodeHash === undefined) {
    // Also invalidate between unversioned development changes to the checker.
    checkDbCodeHash = hash(['index.js', 'nodejs.js', 'nodejs_webpack_safe.js', 'models/id.js', 'models/ref.js', 'models/file.js', 'package.json']
      .map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n'))
  }
  const context = hash(JSON.stringify([checkDbCodeHash, opts.options?.ourbigbook_json, opts.ref_prefix]))
  let failure
  try {
    return await sequelize.transaction({ type: sequelize.Sequelize.Transaction.TYPES.IMMEDIATE }, async transaction => {
      const query = (sql, replacements) => sequelize.query(sql, { replacements, transaction })
      await query('CREATE TABLE IF NOT EXISTS "CliCheckRevision" ("fileId" INTEGER PRIMARY KEY, "revision" INTEGER NOT NULL)')
      await query('CREATE TABLE IF NOT EXISTS "CliCheckCache" ("id" INTEGER PRIMARY KEY, "value" TEXT NOT NULL)')
      const [installed] = await query("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'cli_check_%'")
      const triggerNames = new Set(installed.map(row => row.name))
      let reset = false
      for (const table of ['Id', 'Ref', 'File']) {
        for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
          const name = `cli_check_${table}_${event}`
          if (triggerNames.has(name)) continue
          reset = true
          const column = table === 'File' ? 'id' : 'defined_at'
          const versions = event === 'UPDATE' ? ['OLD', 'NEW'] : [event === 'DELETE' ? 'OLD' : 'NEW']
          await query(`CREATE TRIGGER "${name}" AFTER ${event} ON "${table}"${
            table === 'File' && event === 'UPDATE'
              ? ' WHEN OLD.path IS NOT NEW.path OR OLD.toplevel_id IS NOT NEW.toplevel_id' : ''}
BEGIN
${versions.map(version => `  INSERT INTO "CliCheckRevision" ("fileId", "revision")
  SELECT ${version}."${column}", 1 WHERE ${version}."${column}" IS NOT NULL
  ON CONFLICT ("fileId") DO UPDATE SET "revision" = "revision" + 1;`).join('\n')}
END`)
        }
      }
      // Dropping/recreating source tables (e.g. --clear-db) drops their triggers.
      if (reset) await query('DELETE FROM "CliCheckCache"')
      const readFiles = async () => (await query(`SELECT f.id, f.path, f.toplevel_id, COALESCE(r.revision, 0) AS revision
        FROM "File" f LEFT JOIN "CliCheckRevision" r ON r."fileId" = f.id ORDER BY f.id`))[0]
      const files = await readFiles()
      const selected = paths === undefined ? undefined : new Set(paths)
      // A partial-directory check cannot certify the entire database. Keep its
      // existing behavior, but invalidate any full-build certificate afterwards.
      if (selected && files.some(file => !selected.has(file.path))) {
        await query('DELETE FROM "CliCheckCache"')
        const errors = await check(sequelize, paths, { ...opts, transaction })
        if (errors.length) {
          failure = { errors }
          throw failure
        }
        return errors
      }
      const [rows] = await query('SELECT value FROM "CliCheckCache" WHERE id = 1')
      let previous
      try { previous = JSON.parse(rows[0]?.value) } catch (_) { /* cold or invalid cache */ }
      if (opts.force || previous?.context !== context) previous = undefined
      const entries = {}
      const fileCache = new Map()
      let sameStructure = !!previous && Object.keys(previous.files).length === files.length
      const structure = async file => {
        // Ignore numeric Id/Ref primary keys and AST source positions: re-extracting
        // a text edit replaces those, without changing other files' dependencies.
        const [ids] = await query('SELECT idid, macro_name FROM "Id" WHERE defined_at = :id ORDER BY idid, macro_name', { id: file.id })
        const [parents] = await query(`SELECT type, from_id, to_id FROM "Ref"
          WHERE defined_at = :id AND type IN (:types) ORDER BY type, from_id, to_id`, {
          id: file.id,
          types: [sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT], sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM]],
        })
        return hash(JSON.stringify([file.path, file.toplevel_id, ids, parents]))
      }
      for (const file of files) {
        const old = previous?.files[file.id]
        if (old && old.revision === file.revision) {
          entries[file.id] = old
          fileCache.set(file.id, old.tags)
        } else {
          const fingerprint = await structure(file)
          entries[file.id] = { revision: file.revision, structure: fingerprint }
          if (old?.structure !== fingerprint) sameStructure = false
        }
      }
      // A new ID can shadow an existing target in another file. Reparenting can
      // alter implicit tags anywhere below it. Neither is a local invalidation.
      if (!sameStructure) fileCache.clear()
      opts.onCache?.({ checked: files.length - fileCache.size, reused: fileCache.size, structural: !sameStructure })
      const errors = await check(sequelize, paths, {
        ...opts, transaction, fileCache, skipStructuralChecks: sameStructure,
      })
      if (errors.length) {
        // Failed reference resolution deletes unmatched candidates. Roll it back
        // so a subsequent check cannot mistake their absence for success.
        failure = { errors }
        throw failure
      }
      for (const file of await readFiles()) {
        const entry = entries[file.id]
        if (entry.revision !== file.revision) entry.structure = await structure(file)
        entry.revision = file.revision
        entry.tags = fileCache.get(file.id)
      }
      await query('INSERT INTO "CliCheckCache" (id, value) VALUES (1, :value) ON CONFLICT (id) DO UPDATE SET value = excluded.value', {
        value: JSON.stringify({ context, files: entries }),
      })
      await query('DELETE FROM "CliCheckRevision" WHERE "fileId" NOT IN (SELECT id FROM "File")')
      return errors
    })
  } catch (error) {
    if (error === failure) return failure.errors
    throw error
  }
}
exports.checkDbWithCache = checkDbWithCache

// Metadata only: never decode full-size pixels just to obtain dimensions.
// Return explicit nulls so replacing an upload clears any previous dimensions.
async function imageDimensions(input) {
  try {
    if (typeof input === 'string') {
      if (!(await fs.promises.stat(input)).isFile()) return { width: null, height: null }
      // libvips caches file inputs by pathname and can return stale metadata
      // after --watch replaces a file. Buffer inputs identify the new bytes.
      input = await fs.promises.readFile(input)
    }
    const metadata = await require('sharp')(input).metadata()
    let width = metadata.width
    let height = metadata.pageHeight || metadata.height
    if (metadata.orientation >= 5 && metadata.orientation <= 8) {
      ;[width, height] = [height, width]
    }
    const dimension = n => Number.isInteger(n) && n > 0 ? n : null
    return { width: dimension(width), height: dimension(height) }
  } catch (_) {
    // Missing, unsupported or malformed images must not abort conversion.
    return { width: null, height: null }
  }
}
exports.imageDimensions = imageDimensions

// Each CLI process keeps a bounded metadata cache. Stat signatures also make
// --watch pick up an image replaced during the same invocation.
function imageDimensionsReader() {
  const cache = new Map()
  return async filename => {
    filename = path.resolve(filename)
    let stat
    try { stat = await fs.promises.stat(filename) } catch (_) { return {} }
    if (!stat.isFile()) return {}
    const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
    const previous = cache.get(filename)
    if (previous?.signature === signature) return previous.dimensions
    const dimensions = imageDimensions(filename)
    cache.delete(filename)
    if (cache.size >= 1024) cache.delete(cache.keys().next().value)
    cache.set(filename, { signature, dimensions })
    return dimensions
  }
}
exports.imageDimensionsReader = imageDimensionsReader

const PACKAGE_NAME = 'ourbigbook'
exports.PACKAGE_NAME = PACKAGE_NAME

// This does not work in webpack. It also does not work in web/bin executables on Heroku.
// https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is
const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')))
exports.PACKAGE_PATH = PACKAGE_PATH

const PUBLISH_OBB_PREFIX = `${ourbigbook.RESERVED_PATH_PREFIX}obb`
exports.PUBLISH_OBB_PREFIX = PUBLISH_OBB_PREFIX

const PUBLISH_ASSET_DIST_PREFIX = `${PUBLISH_OBB_PREFIX}/${ourbigbook_nodejs_webpack_safe.DIST_BASENAME}`
exports.PUBLISH_ASSET_DIST_PREFIX = PUBLISH_ASSET_DIST_PREFIX

const DIST_PATH = path.join(PACKAGE_PATH, ourbigbook_nodejs_webpack_safe.DIST_BASENAME)
exports.DIST_PATH = DIST_PATH

const DIST_CSS_BASENAME = PACKAGE_NAME + '.css'
exports.DIST_CSS_BASENAME = DIST_CSS_BASENAME

const DIST_CSS_PATH = path.join(DIST_PATH, DIST_CSS_BASENAME)
exports.DIST_CSS_PATH = DIST_CSS_PATH

const DIST_JS_BASENAME = PACKAGE_NAME + '_runtime.js'
exports.DIST_JS_BASENAME = DIST_JS_BASENAME

const DIST_JS_PATH = path.join(DIST_PATH, DIST_JS_BASENAME)
exports.DIST_JS_PATH = DIST_JS_PATH

const LOGO_BASENAME = 'logo.svg'
exports.LOGO_BASENAME = LOGO_BASENAME

const LOGO_PATH = path.join(PACKAGE_PATH, LOGO_BASENAME)
exports.LOGO_PATH = LOGO_PATH

const LOGO_ROOT_RELPATH = path.join(PUBLISH_OBB_PREFIX, LOGO_BASENAME)
exports.LOGO_ROOT_RELPATH = LOGO_ROOT_RELPATH

const PACKAGE_NODE_MODULES_PATH = path.join(PACKAGE_PATH, 'node_modules')
exports.PACKAGE_NODE_MODULES_PATH = PACKAGE_NODE_MODULES_PATH

const PACKAGE_PACKAGE_JSON_PATH = path.join(PACKAGE_PATH, 'package.json')
exports.PACKAGE_PACKAGE_JSON_PATH = PACKAGE_PACKAGE_JSON_PATH

const GITIGNORE_PATH = path.join(PACKAGE_PATH, 'gitignore')
exports.GITIGNORE_PATH = GITIGNORE_PATH

const PACKAGE_SASS_BASENAME = PACKAGE_NAME + '.scss'
exports.PACKAGE_SASS_BASENAME = PACKAGE_SASS_BASENAME

const DEFAULT_TEX_PATH = path.join(PACKAGE_PATH, 'default.tex')
exports.DEFAULT_TEX_PATH = DEFAULT_TEX_PATH
