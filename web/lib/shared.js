// Shared between front and backend.

//function modifyEditorInput(title, body) {
//  return '= ' + this.title + '\n\n' + this.body
//}
//exports.modifyEditorInput = modifyEditorInput

const cirodown = require('cirodown')

function modifyEditorInput(title, body) {
  let ret = '= ' + title
  if (body && body[0] !== '{') {
    ret += '\n\n' + body
  }
  return ret;
}
exports.modifyEditorInput = modifyEditorInput
