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
  articleView: slug => `/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/issue-edit/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/issue-new/${slug}`,
  issueView: (slug, number) => `/${escapeUsername}/issue/${number}/${slug}`,
  issues: (slug, opts={}) => `/${escapeUsername}/issues/${slug}${encodeGetParamsWithPage(opts)}`,
  userEdit: () => `/${escapeUsername}/settings`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  userView: (uid) => `/${uid}`,
  userViewArticles: (uid, opts={}) => `/${escapeUsername}/user/${uid}/articles${encodeGetParamsWithPage(opts)}`,
  userViewLikes: (uid, opts={}) => `/${escapeUsername}/user/${uid}/likes${encodeGetParamsWithPage(opts)}`,
  users: (opts={}) => `/${escapeUsername}/users${encodeGetParamsWithPage(opts)}`,
  topicArticlesTop: (id, page) => {
    if (page === undefined || page === 1) {
      return `/${escapeUsername}/topic/${id}`
    } else {
      return `/${escapeUsername}/topic-page/${page}/${id}`
    }
  },
  topicArticlesLatest: (id, page) => {
    if (page === undefined || page === 1) {
      return `/${escapeUsername}/topic-latest/${id}`
    } else {
      return `/${escapeUsername}/topic-latest-page/${page}/${id}`
    }
  },
  topicUsersView: id => `/${escapeUsername}/topic-users/${id}`,
}
