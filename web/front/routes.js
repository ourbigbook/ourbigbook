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
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articles: (opts={}) => `/${escapeUsername}/articles/${encodeGetParamsWithPage(opts)}`,
  articleDelete: slug => `/${escapeUsername}/delete/${slug}`,
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleNew: (opts={}) => `/${escapeUsername}/new${encodeGetParams(opts)}`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${slug}`,
  article: slug => `/${slug}`,
  host: req => `${req.protocol}://${req.get('host')}`,
  issueComment: (slug, issueNumber, commentNumber) => `${issue(slug, issueNumber)}#${commentIdPrefix}${commentNumber}`,
  issueComments: (slug, number) => `${issue(slug, number)}#${commentsHeaderId}`,
  issueDelete: (slug, number) => `/${escapeUsername}/delete-discussion/${number}/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/edit-discussion/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/new-discussion/${slug}`,
  issue,
  issuesAll: (opts={}) => `/${escapeUsername}/discussions${encodeGetParamsWithPage(opts)}`,
  issues: (slug, opts={}) => `/${escapeUsername}/discussions/${slug}${encodeGetParamsWithPage(opts)}`,
  userEdit: (uid) => `/${escapeUsername}/settings/${uid}`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  user: (uid) => `/${uid}`,
  userArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/articles${encodeGetParamsWithPage(opts)}`,
  userIssues: (uid, opts={}) => `/${escapeUsername}/user/${uid}/discussions${encodeGetParamsWithPage(opts)}`,
  userFollows: (uid, opts={}) => `/${escapeUsername}/user/${uid}/follows${encodeGetParamsWithPage(opts)}`,
  userFollowed: (uid, opts={}) => `/${escapeUsername}/user/${uid}/followed${encodeGetParamsWithPage(opts)}`,
  userLiked: (uid, opts={}) => `/${escapeUsername}/user/${uid}/liked${encodeGetParamsWithPage(opts)}`,
  userLikes: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes${encodeGetParamsWithPage(opts)}`,
  userFollowsArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/follows-articles${encodeGetParamsWithPage(opts)}`,
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
