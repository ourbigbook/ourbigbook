import { ApiBase } from './index'
import { WEB_API_PATH } from '../index'

class CommentApiClass extends ApiBase {
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

module.exports = CommentApiClass
