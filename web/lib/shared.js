// Shared between front and backend.

function modifyEditorInput(title, body) {
  return '= ' + title + '\n\n' + body
}
exports.modifyEditorInput = modifyEditorInput
