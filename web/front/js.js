// Random stuff shared between front and backend.
// Has to be .js until we port backend to TypeScript..
// Maybe this should just be merged with ./config.js

const ourbigbook = require('ourbigbook')
const { titleToId } = ourbigbook

const config = require('./config')
const { convertContext } = config

const web_api = require('ourbigbook/web_api');
const { QUERY_FALSE_VAL, QUERY_TRUE_VAL } = web_api

// https://stackoverflow.com/questions/14382725/how-to-get-the-correct-ip-address-of-a-client-into-a-node-socket-io-app-hosted-o/14382990#14382990
// Works on Heroku 2021.
function getClientIp(req) {
  return req.header('x-forwarded-for')
}

function getCommentSlug(comment) {
  return `${comment.issue.article.slug}#${comment.issue.number}#${comment.number}`
}

function getList(req, res) {
  let ok, showUnlisted, showListed
  const showUnlistedStr = req.query['show-unlisted']
  const showListedStr = req.query['show-listed']
  if (showUnlistedStr ===  undefined) {
    showUnlisted = false
    ok = true
  } else {
    ;[showUnlisted, ok] = typecastBoolean(showUnlistedStr)
  }
  if (showListedStr === undefined) {
    showListed = true
    ok = true
  } else {
    ;[showListed, ok] = typecastBoolean(showListedStr)
  }
  if (!ok) { res.statusCode = 422 }
  return showUnlisted ? (showListed ? undefined : false) : true
}

function getOrderAndPage(req, page, opts={}) {
  const [order, orderErr, ascDesc] = getOrder(req, opts)
  const [pageNum, pageErr] = getPage(page)
  let errs = []
  if (orderErr) {
    errs.push(orderErr)
  }
  if (pageErr) {
    errs.push(pageErr)
  }
  return {
    ascDesc,
    err: errs.length ? errs : undefined,
    order,
    page: pageNum,
  }
}

/** GET param -> DB order map. undefined means both are the same. */
const ALLOWED_SORTS_DEFAULT = {
  created: 'createdAt',
  updated: 'updatedAt',
}

/** By default we order by DESC because it works well with createdAt/updatedAt and score.
 * But for these things, notably alphabetical listings, we want to sort alphabetically instead by default. */
const SORT_WITH_DEFAULT_ASC = new Set([
  'nestedSetIndex',
  'slug',
  'topicId',
  'username',
])
const ASC_GET_SUFFIX  = '-asc'
const DESC_GET_SUFFIX  = '-desc'

function getOrder(req, opts={}) {
  let sort = req.query.sort
  let ascDesc
  let {
    allowedSorts,
    allowedSortsExtra,
    defaultOrder: default_,
  } = opts
  if (allowedSorts === undefined) {
    allowedSorts = ALLOWED_SORTS_DEFAULT
  }
  if (allowedSortsExtra === undefined) {
    allowedSortsExtra = {}
  }
  if (default_ === undefined) {
    default_ = 'createdAt'
  }
  let ret, err
  if (sort) {
    if (sort.endsWith(ASC_GET_SUFFIX)) {
      ascDesc = 'asc'
      sort = sort.substring(0, sort.length - ASC_GET_SUFFIX.length)
    } else if (sort.endsWith(DESC_GET_SUFFIX)) {
      ascDesc = 'desc'
      sort = sort.substring(0, sort.length - DESC_GET_SUFFIX.length)
    }
    const allowedSortsEff = Object.assign(
      {},
      allowedSorts,
      allowedSortsExtra
    )
    if (sort in allowedSortsEff) {
      const order = allowedSortsEff[sort]
      if (order) {
        ret = order
      } else {
        ret = sort
      }
    } else {
      if (default_ in allowedSortsEff) {
        ret = default_
      } else {
        // Return one arbitrary sort.
        ret = Object.values(allowedSortsEff)[0]
      }
      err = `Invalid sort value: '${sort}'`
    }
  } else {
    ret = default_
  }
  return [ret, err, ascDesc ? ascDesc : SORT_WITH_DEFAULT_ASC.has(ret) ? 'ASC' : 'DESC']
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
      return [0, 'The page must be positive']
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

function typecastBoolean(s) {
  let b
  let ok = true
  if (s === QUERY_TRUE_VAL) {
    b = true
  } else if (s === QUERY_FALSE_VAL) {
    b = false
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

/** Is it an email? And not a username. */
function isEmail(s) {
  return s.indexOf('@') !== -1
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

// ID, slug and topic conversions

function slugToTopic(slug) {
  return slug.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
}

function idToSlug(id) {
  return id.slice(ourbigbook.AT_MENTION_CHAR.length)
}

function idToTopic(id) {
  return slugToTopic(idToSlug(id))
}

function uidTopicIdToId(uid, topicId) {
  return ourbigbook.AT_MENTION_CHAR + uidTopicIdToSlug(uid, topicId)
}

function uidTopicIdToSlug(uid, topicId) {
  let ret =  `${uid}`
  if (topicId) {
    ret = `${ret}${ourbigbook.Macro.HEADER_SCOPE_SEPARATOR}${topicId}`
  }
  return ret
}

function slugToId(slug) {
  return ourbigbook.AT_MENTION_CHAR + slug
}

function querySearchToTopicId(search) {
  return search === undefined ? undefined : titleToId(search, undefined, convertContext)
}

module.exports = {
  AUTH_COOKIE_NAME: 'auth',
  getClientIp,
  getCommentSlug,
  getList,
  getOrder,
  getOrderAndPage,
  getPage,
  hasReachedMaxItemCount,
  idToSlug,
  idToTopic,
  isArrayOf,
  isBoolean,
  isEmail,
  isLengthSmallerOrEqualTo,
  isNonNegativeInteger,
  isPositiveInteger,
  isSmallerOrEqualTo,
  isString,
  isTruthy,
  isTypeOrArrayOf,
  querySearchToTopicId,
  slugToId,
  slugToTopic,
  typecastBoolean,
  typecastInteger,
  uidTopicIdToId,
  uidTopicIdToSlug,
}
