// https://docs.ourbigbook.com#ourbigbook-web-directory-structure

const axios = require('axios')

const { WEB_API_PATH } = require('./index')

// https://stackoverflow.com/questions/8135132/how-to-encode-url-parameters/50288717#50288717
function encodeGetParams(p) {
  let ret = Object.entries(p).filter(kv => kv[1] !== undefined).map(kv => kv.map(encodeURIComponent).join("=")).join("&");
  if (ret) {
    ret = '?' + ret
  }
  return ret
}

const encodeGetParamsWithPage = (opts) => {
  opts = Object.assign({}, opts)
  if (opts.page !== undefined && opts.limit !== undefined) {
    opts.offset = opts.page * opts.limit
  }
  delete opts.page
  return encodeGetParams(opts)
}

class WebApi {
  constructor(opts) {
    this.opts = opts
  }

  async req(method, path, opts={}) {
    const newopts = Object.assign(
      {},
      this.opts,
      opts
    )
    return sendJsonHttp(method, `/${WEB_API_PATH}/${path}`, newopts)
  }

  async articleAll(opts={}) {
    return this.req('get', `articles${encodeGetParamsWithPage(opts)}`)
  }

  async articleCreate(article, opts={}) {
    const { path, render } = opts
    return this.req('post',
      `articles`,
      { body: { article, path, render } },
    );
  }

  async articleDelete(slug) {
    return this.req('delete', `articles?id=${slug}`)
  }

  async articleLike(slug) {
    return this.req('post', `articles/like?id=${slug}`)
  }

  async articleFeed(opts={}) {
    return this.req('get', `articles/feed${encodeGetParamsWithPage(opts)}`)
  }

  async articleGet(slug) {
    return this.req('get', `articles?id=${encodeURIComponent(slug)}`)
  }

  async articleUnlike(slug) {
    return this.req('delete', `articles/like?id=${encodeURIComponent(slug)}`)
  }

  async articleCreateOrUpdate(article, opts={}) {
    const { path, render } = opts
    return this.req('put',
      `articles`,
      { body: { article, path, render } },
    );
  }

  articleUrl(slug) {
    return `/${WEB_API_PATH}/articles?id=${encodeURIComponent(slug)}`
  }

  async issueAll(opts) {
    return this.req('get',
      `/issues${encodeGetParamsWithPage(opts)}`,
    )
  }

  async issueCreate(slug, issue) {
    return this.req('post',
      `/issues?id=${encodeURIComponent(slug)}`,
      {
        body: { issue },
      },
    )
  }

  async issueDelete(slug, issueNumber) {
    return this.req('delete', `/issues/${issueNumber}/comments/${commentNumber}?id=${encodeURIComponent(slug)}`)
  }

  async issueEdit(slug, issueNumber, issue) {
    return this.req('put',
      `/issues/${issueNumber}?id=${encodeURIComponent(slug)}`,
      {
        body: { issue },
      },
    )
  }

  async issueLike(slug, issueNumber) {
    return this.req('post', `issues/${issueNumber}/like?id=${slug}`)
  }

  async issueUnlike(slug, issueNumber) {
    return this.req('delete', `issues/${issueNumber}/like?id=${encodeURIComponent(slug)}`)
  }

  async commentGet(slug, issueNumber) {
    return this.req('get',
      `/issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
    )
  }

  async commentCreate(slug, issueNumber, source) {
    return this.req('post',
      `/issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
      },
    )
  }

  async commentUpdate(slug, issueNumber, comentNumber, source) {
    return this.req('put',
      `/issues/${issueNumber}/comments${commentNumber}?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
      },
    )
  }

  async commentDelete(slug, issueNumber, commentNumber) {
    return this.req('delete', `/issues/${issueNumber}/comments/${commentNumber}?id=${encodeURIComponent(slug)}`)
  }

  async userAll(opts) {
    return this.req('get', `users${encodeGetParamsWithPage(opts)}`)
  }

  async userCreate(attrs) {
    return this.req('post',
      `users`,
      { body: { user: attrs } },
    );
  }

  async userCurrent() {
    return this.req('get', `/users`)
  }

  async userFollow(username){
    return this.req('post',
      `users/${username}/follow`,
    );
  }

  async userGet(username) {
    return this.req('get', `users/${username}`)
  }

  async userLogin(attrs) {
    return this.req('post',
      `login`,
      { body: { user: attrs } },
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
