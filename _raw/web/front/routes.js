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

function issue(slug, number) {
  return `/${escapeUsername}/discussion/${number}/${encodeUrlPath(slug)}`
}

module.exports = {
  decodeUrlPath,
  home: () => `/`,
  articles: (opts={}) => `/${escapeUsername}/articles${encodeGetParamsWithPage(opts)}`,
  articleComments: (slug, opts={}) => `/${escapeUsername}/comments/${encodeUrlPath(slug)}${encodeGetParamsWithPage(opts)}`,
  articleDelete: slug => `/${escapeUsername}/delete/${encodeUrlPath(slug)}`,
  articleEdit: slug => `/${escapeUsername}/edit/${encodeUrlPath(slug)}`,
  articleIssues: (slug, opts={}) => `/${escapeUsername}/discussions/${encodeUrlPath(slug)}${encodeGetParamsWithPage(opts)}`,
  articleNew: (opts={}) => `/${escapeUsername}/new${encodeGetParams(opts)}`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${encodeUrlPath(slug)}`,
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articleSource: (slug) => `/${escapeUsername}/source/${encodeUrlPath(slug)}`,
  article: slug => `/${encodeUrlPath(slug)}`,
  comments: (opts={}) => `/${escapeUsername}/comments${encodeGetParamsWithPage(opts)}`,
  files: (opts={}) => `/${escapeUsername}/files${encodeGetParamsWithPage(opts)}`,
  dir: (username, dir) => `/${username}/${DIR_PREFIX}${dir ? `/${encodeUrlPath(dir)}` : ''}`,
  host: req => `${req.protocol}://${req.get('host')}`,
  issueComment: (slug, issueNumber, commentNumber) => `${issue(slug, issueNumber)}#${commentIdPrefix}${commentNumber}`,
  issueComments: (slug, number) => `${issue(slug, number)}#${commentsHeaderId}`,
  issueDelete: (slug, number) => `/${escapeUsername}/delete-discussion/${number}/${encodeUrlPath(slug)}`,
  issueEdit: (slug, number) => `/${escapeUsername}/edit-discussion/${number}/${encodeUrlPath(slug)}`,
  issueNew: (slug) => `/${escapeUsername}/new-discussion/${encodeUrlPath(slug)}`,
  issue,
  issues: (opts={}) => `/${escapeUsername}/discussions${encodeGetParamsWithPage(opts)}`,
  resetPassword: () => `/${escapeUsername}/reset-password`,
  resetPasswordSent: () => `/${escapeUsername}/reset-password-sent`,
  resetPasswordUpdate: () => `/${escapeUsername}/reset-password-update`,
  siteSettings: () => `/${escapeUsername}/site-settings`,
  userEdit: (uid) => `/${escapeUsername}/settings/${uid}`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  user: (uid) => `/${uid}`,
  userArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/articles${encodeGetParamsWithPage(opts)}`,
  userArticlesChildren: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/children${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}${encodeGetParamsWithPage(opts)}`,
  userArticlesIncoming: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/incoming${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}${encodeGetParamsWithPage(opts)}`,
  userArticlesTagged: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/tagged${tagTopicId ? `/${encodeUrlPath(tagTopicId)}` : ''}${encodeGetParamsWithPage(opts)}`,
  userComments: (uid, opts={}) => `/${escapeUsername}/user/${uid}/comments${encodeGetParamsWithPage(opts)}`,
  userFiles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/files${encodeGetParamsWithPage(opts)}`,
  userIssues: (uid, opts={}) => `/${escapeUsername}/user/${uid}/discussions${encodeGetParamsWithPage(opts)}`,
  userFollows: (uid, opts={}) => `/${escapeUsername}/user/${uid}/follows${encodeGetParamsWithPage(opts)}`,
  userFollowed: (uid, opts={}) => `/${escapeUsername}/user/${uid}/followed${encodeGetParamsWithPage(opts)}`,
  userLiked: (uid, opts={}) => `/${escapeUsername}/user/${uid}/liked${encodeGetParamsWithPage(opts)}`,
  userLikedDiscussions: (uid, opts={}) => `/${escapeUsername}/user/${uid}/liked-discussions${encodeGetParamsWithPage(opts)}`,
  userLikes: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes${encodeGetParamsWithPage(opts)}`,
  // TODO https://github.com/ourbigbook/ourbigbook/issues/313
  userLikesDiscussions: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes-discussions${encodeGetParamsWithPage(opts)}`,
  userFollowsArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/follows-articles${encodeGetParamsWithPage(opts)}`,
  userFollowsDiscussions: (uid, opts={}) => `/${escapeUsername}/user/${uid}/follows-discussions${encodeGetParamsWithPage(opts)}`,
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
