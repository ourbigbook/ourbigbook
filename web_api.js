// https://cirosantilli.com/ourbigbook#ourbigbook-web-directory-structure

const axios = require('axios')

const { WEB_API_PATH } = require('./index')

articleGetQuery = (limit, page) => `limit=${limit}&offset=${page ? page * limit : 0}`;

class WebApi {
  constructor({ getToken, https, hostname }) {
    this.getToken = getToken
    this.hostname = hostname
    this.https = https
  }

  async req(method, path, opts={}) {
    const newopts = Object.assign(
      {
        getToken: this.getToken,
        https: this.https,
        hostname: this.hostname,
      },
      opts
    )
    return sendJsonHttp(method, `/${WEB_API_PATH}/${path}`, newopts)
  }

  async articleAll(page, limit = 10) {
    return this.req('get', `articles?${articleGetQuery(limit, page)}`)
  }

  async articleByAuthor(author, page = 0, limit = 5) {
    return this.req('get',
      `articles?author=${encodeURIComponent(
        author
      )}&${articleGetQuery(limit, page)}`
    )
  }

  async articleCreate(article) {
    return this.req('post',
      `articles`,
      { body: { article } },
    );
  }

  async articleDelete(slug) {
    return this.req('delete', `articles?id=${slug}`)
  }

  async articleLike(slug) {
    return this.req('post', `articles/like?id=${slug}`)
  }

  async articleLikedBy(author, page) {
    return this.req('get',
      `articles?liked=${encodeURIComponent(
        author
      )}&${articleGetQuery(10, page)}`
    )
  }

  async articleFeed(page, limit = 10) {
    return this.req('get', `articles/feed?${articleGetQuery(limit, page)}`)
  }

  async articleGet(slug) {
    return this.req('get', `articles?id=${encodeURIComponent(slug)}`)
  }

  async articleUnlike(slug) {
    return this.req('delete', `articles/like?id=${encodeURIComponent(slug)}`)
  }

  async articleUpdate(article, slug) {
    return this.req('put',
      `articles?id=${encodeURIComponent(slug)}`,
      { body: { article } },
    );
  }

  articleUrl(slug) {
    return `/${WEB_API_PATH}/articles?id=${encodeURIComponent(slug)}`
  }

  async commentCreate(slug, comment) {
    return this.req('post',
      `comments?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { body: comment } },
      },
    )
  }

  async commentDelete(slug, commentId) {
    return this.req('delete', `comments/${commentId}`)
  }

  commentUrl(slug) {
    return `/${WEB_API_PATH}/comments?id=${encodeURIComponent(slug)}`
  }

  async userCurrent() {
    return this.req('get', `/users`)
  }

  async userFollow(username){
    return this.req('post',
      `users/${username}/follow`,
    );
  }

  async userGet(username) { return this.req('get', `users/${username}`) }

  async userLogin(email, password) {
    return this.req('post',
      `login`,
      { body: { user: { email, password } } },
    );
  }

  async userRegister(displayName, username, email, password) {
    return this.req('post',
      `users`,
      { body: { user: { displayName, username, email, password } } },
    );
  }

  async userSave(user) {
    return this.req('put',
      `users`,
      { body : { user } },
    );
  }

  async userUpdate(user) {
    return this.req('put',
      `users/${user.username}`,
      { body: { user } },
    )
  }

  async userUnfollow(username) {
    return this.req('delete',
      `users/${username}/follow`,
    );
  }

  userUrl(username) { return `/${WEB_API_PATH}/users/${username}` }
}

// https://stackoverflow.com/questions/6048504/synchronous-request-in-node-js/53338670#53338670
async function sendJsonHttp(method, path, opts={}) {
  const { body, getToken, https, hostname, port, validateStatus } = opts
  let http
  if (https) {
    http = 'https'
  } else {
    http = 'http'
  }
  const headers = {
    "Content-Type": "application/json",
  }
  if (getToken) {
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }
  }
  let url
  if (hostname) {
    const portStr = port ? `:${port}` : ''
    url = `${http}://${hostname}${portStr}${path}`
  } else {
    url = path
  }
  const response = await axios({
    data: opts.body,
    headers,
    method,
    url,
    validateStatus,
  })
  return { data: response.data, status: response.status }
}

module.exports = {
  WebApi,
  sendJsonHttp,
}
