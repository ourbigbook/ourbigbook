const { escapeUsername } = require("./front/config");

function getPage(page) {
  return page === undefined || page === 1 ? '' : `/${page}`
}

module.exports = {
  home: () => `/`,
  articlesLatestFollowed: (page) => page === undefined || page === 1 ? `/` : `/${escapeUsername}/latest-followed/${page}`,
  articlesTopFollowed: (page) => `/${escapeUsername}/top-followed${getPage(page)}`,
  articlesLatest: (page) => `/${escapeUsername}/latest${getPage(page)}`,
  articlesTop: (page) => `/${escapeUsername}/top${getPage(page)}`,
  articleEdit: slug => `/${escapeUsername}/edit/${slug}`,
  articleNew: () => `/${escapeUsername}/new`,
  articleView: slug => `/${slug}`,
  userEdit: () => `/${escapeUsername}/settings`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userView: (uid, page) => `/${uid}`,
  userViewTop: (uid, page) => `/${escapeUsername}/user/${uid}/top${getPage(page)}`,
  userViewLikes: (uid, page) => `/${escapeUsername}/user/${uid}/likes${getPage(page)}`,
  userViewLatest: (uid, page) => `/${escapeUsername}/user/${uid}/latest${getPage(page)}`,
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
