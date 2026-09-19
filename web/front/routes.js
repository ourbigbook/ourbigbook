const { commentsHeaderId, commentIdPrefix, escapeUsername } = require('./config');

const { encodeGetParams } = require('ourbigbook/web_api');
const { DIR_PREFIX, encodeUrlPath } = require('ourbigbook');

function getPage(page) {
  return page === undefined || page === 1 ? '' : `/${page}`
}

function decodeUrlPath(path) {
  try {
    return decodeURIComponent(path)
  } catch (_) {
    return path
  }
}

// Fragments allow all path characters and literal question marks (RFC 3986).
function encodeUrlFragment(fragment) {
  return encodeUrlPath(fragment).replace(/%3F/g, '?')
}

const encodeGetParamsWithPage = (opts, opts2={}) => {
  opts = Object.assign({}, opts)
  if (opts.page === 1) {
    delete opts.page
  }
  const defaultSort = opts2.defaultSort || 'created'
  if (opts.sort === defaultSort) {
    delete opts.sort
  }
  return encodeGetParams(opts)
}

function articleScope(slug) {
  return `/${encodeUrlPath(slug)}/${escapeUsername}${slug.includes('/') ? '' : '/home'}`
}

function issue(slug, number) {
  return `/${encodeUrlPath(slug)}/${escapeUsername}/discussion/${number}`
}

// Router.pathname identifies the internal Next page after a rewrite. Keep query-only
// navigation on the public URL without leaking dynamic page parameters into the query.
function currentPageHref(router, changes={}) {
  const url = new URL(router.asPath, 'http://localhost')
  return `${url.pathname}${encodeGetParams({ ...Object.fromEntries(url.searchParams), ...changes })}`
}

module.exports = {
  currentPageHref,
  decodeUrlPath,
  encodeUrlFragment,
  home: () => `/`,
  articles: (opts={}) => `/${escapeUsername}/articles${encodeGetParamsWithPage(opts)}`,
  articleComments: (slug, opts={}) => `${articleScope(slug)}/comments${encodeGetParamsWithPage(opts)}`,
  articleDelete: slug => `/${encodeUrlPath(slug)}/${escapeUsername}/delete`,
  articleEdit: slug => `/${encodeUrlPath(slug)}/${escapeUsername}/edit`,
  articleIssues: (slug, opts={}) => `${articleScope(slug)}/discussions${encodeGetParamsWithPage(opts)}`,
  articleNew: (opts={}) => `/${escapeUsername}/new${encodeGetParams(opts)}`,
  articleNewFrom: (slug) => `/${encodeUrlPath(slug)}/${escapeUsername}/new`,
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articleSource: (slug) => `/${encodeUrlPath(slug)}/${escapeUsername}/source`,
  article: slug => `/${encodeUrlPath(slug)}`,
  comments: (opts={}) => `/${escapeUsername}/comments${encodeGetParamsWithPage(opts)}`,
  files: (opts={}) => `/${escapeUsername}/files${encodeGetParamsWithPage(opts)}`,
  dir: (username, dir) => `/${username}/${DIR_PREFIX}${dir ? `/${encodeUrlPath(dir)}` : ''}`,
  host: req => `${req.protocol}://${req.get('host')}`,
  issueComment: (slug, issueNumber, commentNumber) => `${issue(slug, issueNumber)}#${commentIdPrefix}${commentNumber}`,
  issueComments: (slug, number) => `${issue(slug, number)}#${commentsHeaderId}`,
  issueDelete: (slug, number) => `${issue(slug, number)}/delete`,
  issueEdit: (slug, number) => `${issue(slug, number)}/edit`,
  issueNew: (slug) => `/${encodeUrlPath(slug)}/${escapeUsername}/new-discussion`,
  issue,
  issues: (opts={}) => `/${escapeUsername}/discussions${encodeGetParamsWithPage(opts)}`,
  resetPassword: () => `/${escapeUsername}/reset-password`,
  resetPasswordSent: () => `/${escapeUsername}/reset-password-sent`,
  resetPasswordUpdate: () => `/${escapeUsername}/reset-password-update`,
  siteSettings: () => `/${escapeUsername}/site-settings`,
  userEdit: (uid) => `/${uid}/${escapeUsername}/settings`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  user: (uid) => `/${uid}`,
  userArticles: (uid, opts={}) => `/${uid}/${escapeUsername}/articles${encodeGetParamsWithPage(opts)}`,
  userArticlesChildren: (uid, tagTopicId, opts={}) => `/${uid}${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}/${escapeUsername}/children${encodeGetParamsWithPage(opts)}`,
  userArticlesIncoming: (uid, tagTopicId, opts={}) => `/${uid}${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}/${escapeUsername}/incoming${encodeGetParamsWithPage(opts)}`,
  userArticlesTagged: (uid, tagTopicId, opts={}) => `/${uid}${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}/${escapeUsername}/tagged${encodeGetParamsWithPage(opts)}`,
  userComments: (uid, opts={}) => `/${uid}/${escapeUsername}/comments${encodeGetParamsWithPage(opts)}`,
  userFiles: (uid, opts={}) => `/${uid}/${escapeUsername}/files${encodeGetParamsWithPage(opts)}`,
  userIssues: (uid, opts={}) => `/${uid}/${escapeUsername}/discussions${encodeGetParamsWithPage(opts)}`,
  userFollows: (uid, opts={}) => `/${uid}/${escapeUsername}/follows${encodeGetParamsWithPage(opts)}`,
  userFollowed: (uid, opts={}) => `/${uid}/${escapeUsername}/followed${encodeGetParamsWithPage(opts)}`,
  userLiked: (uid, opts={}) => `/${uid}/${escapeUsername}/liked${encodeGetParamsWithPage(opts)}`,
  userLikedDiscussions: (uid, opts={}) => `/${uid}/${escapeUsername}/liked-discussions${encodeGetParamsWithPage(opts)}`,
  userLikes: (uid, opts={}) => `/${uid}/${escapeUsername}/likes${encodeGetParamsWithPage(opts)}`,
  // TODO https://github.com/ourbigbook/ourbigbook/issues/313
  userLikesDiscussions: (uid, opts={}) => `/${uid}/${escapeUsername}/likes-discussions${encodeGetParamsWithPage(opts)}`,
  userFollowsArticles: (uid, opts={}) => `/${uid}/${escapeUsername}/follows-articles${encodeGetParamsWithPage(opts)}`,
  userFollowsDiscussions: (uid, opts={}) => `/${uid}/${escapeUsername}/follows-discussions${encodeGetParamsWithPage(opts)}`,
  users: (opts={}) => `/${escapeUsername}/users${encodeGetParamsWithPage(opts, { defaultSort: 'score' })}`,
  topic: (id, opts={}) => `/${escapeUsername}/topic/${encodeUrlPath(id)}${encodeGetParamsWithPage(opts, { defaultSort: 'score' })}`,
  topics: (opts={}) => {
    let url
    if (opts.loggedInUser) {
      delete opts.loggedInUser
      url = `/${escapeUsername}/topics`
    } else {
      url = `/`
    }
    return `${url}${encodeGetParamsWithPage(opts, { defaultSort: 'article-count' })}`
  },
}
