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
  return encodeGetParams(opts)
}

module.exports = {
  home: () => `/`,
  articlesLatestFollowed: (page) => page === undefined || page === 1 ? `/` : `/${escapeUsername}/latest-followed/${page}`,
  articlesTopFollowed: (page) => `/${escapeUsername}/top-followed${getPage(page)}`,
  articlesLatest: (page) => `/${escapeUsername}/latest${getPage(page)}`,
  articlesTop: (page) => `/${escapeUsername}/top${getPage(page)}`,
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleNew: () => `/${escapeUsername}/new`,
  articleNewFrom: (slug) => `/${escapeUsername}/new/${slug}`,
  articleView: slug => `/${slug}`,
  issueEdit: (slug, number) => `/${escapeUsername}/issue-edit/${number}/${slug}`,
  issueNew: (slug) => `/${escapeUsername}/issue-new/${slug}`,
  issueView: (slug, number) => `/${escapeUsername}/issue/${number}/${slug}`,
  issuesLatest: (slug, page=0) => `/${escapeUsername}/issues/${page}/${slug}`,
  issuesTop: (slug, page=0) => `/${escapeUsername}/issues-top/${page}/${slug}`,
  userEdit: () => `/${escapeUsername}/settings`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userVerify: (email) => `/${escapeUsername}/verify${encodeGetParams({ email })}`,
  userView: (uid) => `/${uid}`,
  userViewTop: (uid, page) => `/${escapeUsername}/user/${uid}/top${getPage(page)}`,
  userViewLikes: (uid, page) => `/${escapeUsername}/user/${uid}/likes${getPage(page)}`,
  userViewLatest: (uid, page) => `/${escapeUsername}/user/${uid}/latest${getPage(page)}`,
  users: (opts={}) => `/${escapeUsername}/users${encodeGetParams(opts)}`,
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
