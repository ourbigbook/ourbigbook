const { escapeUsername } = require('./config');

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

module.exports = {
  home: () => `/`,
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articles: (opts={}) => `/${escapeUsername}/articles/${encodeGetParamsWithPage(opts)}`,
  articleDelete: slug => `/${escapeUsername}/delete/${slug}`,
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleNew: (opts={}) => `/${escapeUsername}/new${encodeGetParams(opts)}`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${slug}`,
  article: slug => `/${slug}`,
  issueDelete: (slug, number) => `/${escapeUsername}/delete-discussion/${number}/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/edit-discussion/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/new-discussion/${slug}`,
  issue: (slug, number) => `/${escapeUsername}/discussion/${number}/${slug}`,
  issues: (slug, opts={}) => `/${escapeUsername}/discussions/${slug}${encodeGetParamsWithPage(opts)}`,
  userEdit: (uid) => `/${escapeUsername}/settings/${uid}`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  user: (uid) => `/${uid}`,
  userArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/articles${encodeGetParamsWithPage(opts)}`,
  userFollowing: (uid, opts={}) => `/${escapeUsername}/user/${uid}/following${encodeGetParamsWithPage(opts)}`,
  userFollowed: (uid, opts={}) => `/${escapeUsername}/user/${uid}/followed${encodeGetParamsWithPage(opts)}`,
  userLikes: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes${encodeGetParamsWithPage(opts)}`,
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
