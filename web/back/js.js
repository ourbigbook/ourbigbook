const path = require('path')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

function preloadKatex() {
  return ourbigbook_nodejs_webpack_safe.preload_katex_from_file(
    path.join(path.dirname(require.resolve(path.join('ourbigbook', 'package.json'))), 'default.tex'))
}
exports.preloadKatex = preloadKatex
