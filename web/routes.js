const { ESCAPE_USERNAME } = require("./config");

function getPage(page) {
  return page === undefined || page === 1 ? '' : `/${page}`
}

module.exports = {
  home: () => `/`,
  articlesLatestFollowed: (page) => page === undefined || page === 1 ? `/` : `/${ESCAPE_USERNAME}/latest-followed/${page}`,
  articlesTopFollowed: (page) => `/${ESCAPE_USERNAME}/top-followed${getPage(page)}`,
  articlesLatest: (page) => `/${ESCAPE_USERNAME}/latest${getPage(page)}`,
  articlesTop: (page) => `/${ESCAPE_USERNAME}/top${getPage(page)}`,
  articleEdit: slug => `/${ESCAPE_USERNAME}/edit/${slug}`,
  articleNew: () => `/${ESCAPE_USERNAME}/new`,
  articleView: slug => `/${slug}`,
  userEdit: () => `/${ESCAPE_USERNAME}/settings`,
  userLogin: () => `/${ESCAPE_USERNAME}/login`,
  userNew: () => `/${ESCAPE_USERNAME}/register`,
  userView: (uid, page) => `/${uid}`,
  userViewTop: (uid, page) => `/${ESCAPE_USERNAME}/user/${uid}/top${getPage(page)}`,
  userViewLikes: (uid, page) => `/${ESCAPE_USERNAME}/user/${uid}/likes${getPage(page)}`,
  userViewLatest: (uid, page) => `/${ESCAPE_USERNAME}/user/${uid}/latest${getPage(page)}`,
  topicArticlesTop: (id, page) => {
    if (page === undefined || page === 1) {
      return `/${ESCAPE_USERNAME}/topic/${id}`
    } else {
      return `/${ESCAPE_USERNAME}/topic-page/${page}/${id}`
    }
  },
  topicArticlesLatest: (id, page) => {
    if (page === undefined || page === 1) {
      return `/${ESCAPE_USERNAME}/topic-latest/${id}`
    } else {
      return `/${ESCAPE_USERNAME}/topic-latest-page/${page}/${id}`
    }
  },
  topicUsersView: id => `/${ESCAPE_USERNAME}/topic-users/${id}`,
}
