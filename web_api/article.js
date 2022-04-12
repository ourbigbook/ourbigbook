const { ApiBase } = require('./index')
const { WEB_API_PATH } = require('../index')

const getQuery = (limit, page) => `limit=${limit}&offset=${page ? page * limit : 0}`;

class ArticleApi extends ApiBase {
  async all(page, limit = 10) {
    return this.req('get', `articles?${getQuery(limit, page)}`)
  }

  async byAuthor(author, page = 0, limit = 5) {
    return this.req('get',
      `articles?author=${encodeURIComponent(
        author
      )}&${getQuery(limit, page)}`
    )
  }

  async create(article) {
    return this.req('post',
      `articles`,
      { body: { article } },
    );
  }

  async delete(slug) {
    return this.req('delete', `articles?id=${slug}`)
  }

  async like(slug) {
    return this.req('post', `articles/like?id=${slug}`)
  }

  async likedBy(author, page) {
    return this.req('get',
      `articles?liked=${encodeURIComponent(
        author
      )}&${getQuery(10, page)}`
    )
  }

  async feed(page, limit = 10) {
    return this.req('get', `articles/feed?${getQuery(limit, page)}`)
  }

  async get(slug) {
    return this.req('get', `articles?id=${encodeURIComponent(slug)}`)
  }

  async unlike(slug) {
    return this.req('delete', `articles/like?id=${encodeURIComponent(slug)}`)
  }

  async update(article, slug) {
    return this.req('put',
      `articles?id=${encodeURIComponent(slug)}`,
      { body: { article } },
    );
  }

  url(slug) {
    return `/${WEB_API_PATH}/articles?id=${encodeURIComponent(slug)}`
  }
};

module.exports = ArticleApi
