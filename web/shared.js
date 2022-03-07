// Shared between front and backend.

const cirodown = require('cirodown')

function modifyEditorInput(title, body) {
  let ret = cirodown.INSANE_HEADER_CHAR + ' ' + title
  // Append title to body. Add a newline if the body doesn's start
  // with a header argument like `{c}` in:
  //
  // = h1
  // {c}
  if (body) {
    if (body[0] !== cirodown.START_NAMED_ARGUMENT_CHAR) {
      ret += '\n\n'
    }
    ret += body
  }
  return ret;
}
exports.modifyEditorInput = modifyEditorInput

exports.minPath = 'min'
