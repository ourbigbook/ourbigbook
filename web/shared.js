// Shared between front and backend.

const ourbigbook = require('ourbigbook')

function modifyEditorInput(title, body) {
  let ret = ourbigbook.INSANE_HEADER_CHAR + ' ' + title
  // Append title to body. Add a newline if the body doesn's start
  // with a header argument like `{c}` in:
  //
  // = h1
  // {c}
  if (body) {
    ret += '\n'
    if (body[0] !== ourbigbook.START_NAMED_ARGUMENT_CHAR) {
      ret += '\n'
    }
    ret += body
  }
  return ret;
}
exports.modifyEditorInput = modifyEditorInput

exports.minPath = 'min'
