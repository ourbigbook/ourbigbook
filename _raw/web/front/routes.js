const { commentsHeaderId, commentIdPrefix, escapeUsername } = require('./config');

const { encodeGetParams } = require('ourbigbook/web_api');

function getPage(page) {
  return page === undefined || page === 1 ? '' : `/${page}`
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
  return `/${escapeUsername}/discussion/${number}/${slug}`
}

module.exports = {
  home: () => `/`,
  articles: (opts={}) => `/${escapeUsername}/articles${encodeGetParamsWithPage(opts)}`,
  articleComments: (slug, opts={}) => `/${escapeUsername}/comments/${slug}${encodeGetParamsWithPage(opts)}`,
  articleDelete: slug => `/${escapeUsername}/delete/${slug}`,
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleIssues: (slug, opts={}) => `/${escapeUsername}/discussions/${slug}${encodeGetParamsWithPage(opts)}`,
  articleNew: (opts={}) => `/${escapeUsername}/new${encodeGetParams(opts)}`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${slug}`,
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articleSource: (slug) => `/${escapeUsername}/source/${slug}`,
  article: slug => `/${slug}`,
  comments: (opts={}) => `/${escapeUsername}/comments${encodeGetParamsWithPage(opts)}`,
  host: req => `${req.protocol}://${req.get('host')}`,
  issueComment: (slug, issueNumber, commentNumber) => `${issue(slug, issueNumber)}#${commentIdPrefix}${commentNumber}`,
  issueComments: (slug, number) => `${issue(slug, number)}#${commentsHeaderId}`,
  issueDelete: (slug, number) => `/${escapeUsername}/delete-discussion/${number}/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/edit-discussion/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/new-discussion/${slug}`,
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
  userArticlesChildren: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/children${tagTopicId ? '/' : ''}${tagTopicId}${encodeGetParamsWithPage(opts)}`,
  userArticlesIncoming: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/incoming${tagTopicId ? '/' : ''}${tagTopicId}${encodeGetParamsWithPage(opts)}`,
  userArticlesTagged: (uid, tagTopicId, opts={}) => `/${escapeUsername}/user/${uid}/tagged${tagTopicId ? '/' : ''}${tagTopicId}${encodeGetParamsWithPage(opts)}`,
  userComments: (uid, opts={}) => `/${escapeUsername}/user/${uid}/comments${encodeGetParamsWithPage(opts)}`,
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
  topic: (id, opts={}) => `/${escapeUsername}/topic/${id}${encodeGetParamsWithPage(opts, { defaultSort: 'score' })}`,
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
