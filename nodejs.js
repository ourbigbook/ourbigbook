// Contains exports that should only be visible from Node.js but not browser.

const path = require('path')
const fs = require('fs')

const ourbigbook = require('./index.js')
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe.js')

const commander = require('commander')

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
