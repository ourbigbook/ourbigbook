// Random stuff shared between front and backend.
// Has to be .js until we port backend to TypeScript..

const ourbigbook = require('ourbigbook')

function getOrder(req) {
  let sort = req.query.sort;
  if (sort) {
    if (sort === 'createdAt' || sort === 'score') {
      return [sort]
    } else {
      return [,`Invalid sort value: '${sort}'`]
    }
  } else {
    return ['createdAt']
  }
}

function getPage(req) {
  const page = req.query.page
  const pageNum = typeof page === 'undefined' ? 0 : parseInt(page, 10) - 1
  if (isNaN(pageNum)) {
    return [,'Invalid page number']
  } else {
    return [pageNum,]
  }
}

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

module.exports = {
  modifyEditorInput,
  getOrder,
  getPage,
}
