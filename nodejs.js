// Contains exports that should only be visible from Node.js but not browser.

const path = require('path');

const ENCODING = 'utf8';
const PACKAGE_NAME = 'cirodown';
exports.PACKAGE_NAME = PACKAGE_NAME;
// https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is
const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')));
const PACKAGE_OUT_PATH = path.join(PACKAGE_PATH, 'out');
exports.PACKAGE_OUT_PATH = PACKAGE_OUT_PATH;
const PACKAGE_OUT_CSS_BASENAME = PACKAGE_NAME + '.min.css';
exports.PACKAGE_OUT_CSS_BASENAME = PACKAGE_OUT_CSS_BASENAME;
const PACKAGE_OUT_CSS_PATH = PACKAGE_OUT_CSS_BASENAME;
exports.PACKAGE_OUT_CSS_PATH = PACKAGE_OUT_CSS_PATH;
const PACKAGE_OUT_CSS_EMBED_PATH = PACKAGE_NAME + '.embed.min.css';
exports.PACKAGE_OUT_CSS_EMBED_PATH = PACKAGE_OUT_CSS_EMBED_PATH;
const PACKAGE_OUT_CSS_LOCAL_PATH = PACKAGE_NAME + '.local.min.css';
exports.PACKAGE_OUT_CSS_LOCAL_PATH = PACKAGE_OUT_CSS_LOCAL_PATH;
const PACKAGE_NODE_MODULES_PATH = path.join(PACKAGE_PATH, 'node_modules');
exports.PACKAGE_NODE_MODULES_PATH = PACKAGE_NODE_MODULES_PATH;
const PACKAGE_PACKAGE_JSON_PATH = path.join(PACKAGE_PATH, 'package.json');
exports.PACKAGE_PACKAGE_JSON_PATH = PACKAGE_PACKAGE_JSON_PATH;
const GITIGNORE_PATH = path.join(PACKAGE_PATH, '.gitignore');
exports.GITIGNORE_PATH = GITIGNORE_PATH;
const PACKAGE_SASS_BASENAME = PACKAGE_NAME + '.scss';
exports.PACKAGE_SASS_BASENAME = PACKAGE_SASS_BASENAME;
const LOCAL_INCLUDES = [
  path.join(PACKAGE_NODE_MODULES_PATH, 'katex', 'dist', 'katex.min.css'),
  path.join(PACKAGE_NODE_MODULES_PATH, 'normalize.css', 'normalize.css'),
]
exports.LOCAL_INCLUDES = LOCAL_INCLUDES;
