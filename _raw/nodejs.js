// Contains exports that should only be visible from Node.js but not browser.

const path = require('path')

const ourbigbook = require('./index.js')
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe.js')

const commander = require('commander')

const PACKAGE_NAME = 'ourbigbook'
exports.PACKAGE_NAME = PACKAGE_NAME

// This does not work in webpack.
// https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is
const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')))
exports.PACKAGE_PATH = PACKAGE_PATH

const PUBLISH_OBB_PREFIX = `${ourbigbook.Macro.RESERVED_ID_PREFIX}obb`
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

function cliInt(value, dummyPrevious) {
  const parsedValue = parseInt(value)
  if (isNaN(parsedValue)) {
    throw new commander.InvalidArgumentError('Not a number.')
  }
  return parsedValue
}
exports.cliInt = cliInt
