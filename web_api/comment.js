const { ApiBase } = require('./index')
const { WEB_API_PATH } = require('../index')

class CommentApi extends ApiBase {
  async create(slug, comment) {
    return this.req('post',
      `comments?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { body: comment } },
      },
    )
  }

  async delete(slug, commentId) {
    return this.req('delete', `comments/${commentId}`)
  }

  url(slug) {
    return `/${WEB_API_PATH}/comments?id=${encodeURIComponent(slug)}`
  }
};

module.exports = CommentApi
