// Random stuff shared between front and backend.
// Has to be .js until we port backend to TypeScript..

const ourbigbook = require('ourbigbook')

const config = require('./config')

// https://stackoverflow.com/questions/14382725/how-to-get-the-correct-ip-address-of-a-client-into-a-node-socket-io-app-hosted-o/14382990#14382990
// Works on Heroku 2021.
function getClientIp(req) {
  return req.header('x-forwarded-for')
}

function getOrderAndPage(req, page, opts={}) {
  const [order, orderErr] = getOrder(req, opts)
  const [pageNum, pageErr] = getPage(page)
  let errs = []
  if (orderErr) {
    errs.push(orderErr)
  }
  if (pageErr) {
    errs.push(pageErr)
  }
  return [order, pageNum, errs.length ? errs : undefined]
}

function getOrder(req, opts={}) {
  let sort = req.query.sort;
  const default_ = opts.defaultOrder || 'createdAt'
  const urlToDbSort = opts.urlToDbSort || {}
  if (sort) {
    if (
      sort === 'created'
    ) {
      return ['createdAt']
    } else if (sort === 'score' || sort === 'followerCount') {
      return [sort]
    } else {
      if (sort in urlToDbSort) {
        return [urlToDbSort[sort]]
      } else {
        return [default_, `Invalid sort value: '${sort}'`]
      }
    }
  } else {
    return [default_]
  }
}

/**
 * @param {string|string[]} page - 1-based.
 * @returns {[number, string|undefined]} 0-based return, error string if any.
 */
function getPage(page='1') {
  const pageString = typeof page === 'string' ? page : page[0]
  const [pageNum, ok] = typecastInteger(page)
  if (ok) {
    if (pageNum <= 0) {
      return [0, 'The page must be postive']
    } else {
      return [pageNum - 1,]
    }
  } else {
    return [0, 'Invalid page number']
  }
}

function hasReachedMaxItemCount(loggedInUser, itemCount, itemType) {
  if (!loggedInUser.admin && itemCount >= loggedInUser.maxArticles) {
    return `You have reached your maximum number of ${itemType}: ${loggedInUser.maxArticles}. Please ask an admin to raise it for you: ${config.contactUrl}`
  }
}

function modifyEditorInput(title, body) {
  let ret = ''
  if (title !== undefined) {
    ret += `${ourbigbook.INSANE_HEADER_CHAR} ${title}\n`
  }
  let offsetOffset = 0
  // Append title to body. Add a newline if the body doesn's start
  // with a header argument like `{c}` in:
  //
  // = h1
  // {c}
  if (body) {
    if (body[0] !== ourbigbook.START_NAMED_ARGUMENT_CHAR) {
      ret += '\n'
      offsetOffset = 1
    }
    ret += body
  }
  return { offset: 1 + offsetOffset, new: ret };
}

function typecastBoolean(s) {
  let b
  let ok = true
  if (s === 'true') {
    b = true
  } else if (s === 'false') {
    b = true
  } else {
    ok = false
  }
  return [b, ok]
}

/**
 * Typecast string to integer. Typically used to typecast
 * URL GET parameters to types with error checking. This is unlike
 * JSON bodies which are clearly typed already.
 * 
 * @param {string} s
 * @returns {[number, boolean]}
 */
function typecastInteger(s) {
  const i = Number(s)
  let ok = s !== '' && Number.isInteger(i)
  return [i, ok]
}

function isNonNegativeInteger(i) {
  return i >= 0
}

function isPositiveInteger(i) {
  return i > 0
}

// Elements either match cb, or is an array where each type matches cb.
function isTypeOrArrayOf(cb) {
  return (a) => {
    if (cb(a)) return true
    return isArrayOf(cb)(a)
  }
}

function isArrayOf(cb) {
  return (a) => {
    if (!(a instanceof Array)) {
      return false
    }
    for (const elem of a) {
      if (!cb(elem)) {
        return false
      }
    }
    return true
  }
}

function isBoolean(tf) {
  return typeof tf === 'boolean'
}

function isSmallerOrEqualTo(max) {
  return (n) => n <= max
}

function isLengthSmallerOrEqualTo(max) {
  return (s) => s.length <= max
}

function isString(s) {
  return typeof s === 'string'
}

function isTruthy(s) {
  return !!s
}

module.exports = {
  AUTH_COOKIE_NAME: 'auth',
  getClientIp,
  getOrder,
  getOrderAndPage,
  getPage,
  hasReachedMaxItemCount,
  isArrayOf,
  isBoolean,
  isLengthSmallerOrEqualTo,
  isNonNegativeInteger,
  isPositiveInteger,
  isSmallerOrEqualTo,
  isString,
  isTypeOrArrayOf,
  isTruthy,
  modifyEditorInput,
  typecastBoolean,
  typecastInteger,
}
