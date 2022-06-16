// Random stuff shared between front and backend.
// Has to be .js until we port backend to TypeScript..

const ourbigbook = require('ourbigbook')

function modifyEditorInput(title, body) {
  let ret = ''
  if (title !== undefined) {
    ret += ourbigbook.INSANE_HEADER_CHAR + ' ' + title
  }
  let offsetOffset = 0
  // Append title to body. Add a newline if the body doesn's start
  // with a header argument like `{c}` in:
  //
  // = h1
  // {c}
  if (body) {
    ret += '\n'
    if (body[0] !== ourbigbook.START_NAMED_ARGUMENT_CHAR) {
      ret += '\n'
      offsetOffset = 1
    }
    ret += body
  }
  return { offset: 1 + offsetOffset, new: ret };
}
exports.modifyEditorInput = modifyEditorInput
