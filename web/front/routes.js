const { escapeUsername } = require('./config');

const { encodeGetParams } = require('ourbigbook/web_api');

function getPage(page) {
  return page === undefined || page === 1 ? '' : `/${page}`
}

const encodeGetParamsWithPage = (opts) => {
  opts = Object.assign({}, opts)
  if (opts.page === 1) {
    delete opts.page
  }
  if (opts.sort === 'createdAt') {
    delete opts.sort
  }
  return encodeGetParams(opts)
}

module.exports = {
  home: () => `/`,
  articlesFollowed: (opts={}) => `/${encodeGetParamsWithPage(opts)}`,
  articles: (opts={}) => {
    let url
    if (opts.loggedInUser) {
      delete opts.loggedInUser
      url = `/${escapeUsername}/articles`
    } else {
      url = `/`
    }
    return `${url}${encodeGetParamsWithPage(opts)}`
  },
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleNew: () => `/${escapeUsername}/new`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${slug}`,
  article: slug => `/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/issue-edit/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/issue-new/${slug}`,
  issue: (slug, number) => `/${escapeUsername}/issue/${number}/${slug}`,
  issues: (slug, opts={}) => `/${escapeUsername}/issues/${slug}${encodeGetParamsWithPage(opts)}`,
  userEdit: (uid) => `/${escapeUsername}/settings/${uid}`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  user: (uid) => `/${uid}`,
  userArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/articles${encodeGetParamsWithPage(opts)}`,
  userFollowing: (uid, opts={}) => `/${escapeUsername}/user/${uid}/following${encodeGetParamsWithPage(opts)}`,
  userFollowed: (uid, opts={}) => `/${escapeUsername}/user/${uid}/followed${encodeGetParamsWithPage(opts)}`,
  userLikes: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes${encodeGetParamsWithPage(opts)}`,
  users: (opts={}) => `/${escapeUsername}/users${encodeGetParamsWithPage(opts)}`,
  topic: (id, opts={}) => `/${escapeUsername}/topic/${id}${encodeGetParamsWithPage(opts)}`,
}
