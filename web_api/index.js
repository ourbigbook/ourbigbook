// https://cirosantilli.com/ourbigbook#ourbigbook-web-directory-structure

const axios = require('axios')

const { WEB_API_PATH } = require('../index')

class ApiBase {
  constructor({ getToken, https, hostname }) {
    this.getToken = getToken
    this.hostname = hostname
    if (https) {
      this.http = 'https'
    } else {
      this.http = 'http'
    }
  }

  async req(method, path, opts={}) {
    const newopts = Object.assign(
      {
        getToken: this.getToken,
        http: this.http,
        hostname: this.hostname,
      },
      opts
    )
    return sendJsonHttp(method, `/${WEB_API_PATH}/${path}`, newopts)
  }
}

// https://stackoverflow.com/questions/6048504/synchronous-request-in-node-js/53338670#53338670
async function sendJsonHttp(method, path, opts={}) {
  const { body, getToken, http, hostname, port, validateStatus } = opts
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
  ApiBase,
  sendJsonHttp,
}
