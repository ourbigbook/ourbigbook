// https://docs.ourbigbook.com#ourbigbook-web-directory-structure
//
// Plus some other random stuff that has to be able to run on frontend, thus no backend stuff here.

const crypto = require('crypto')

const axios = require('axios')

const ourbigbook = require('./index')

function articleHash(opts={}) {
  const jsonStr = JSON.stringify(Object.fromEntries(Object.entries(opts).sort()))
  return crypto.createHash('sha256').update(jsonStr).digest('hex')
}

// https://stackoverflow.com/questions/8135132/how-to-encode-url-parameters/50288717#50288717
function encodeGetParams(p) {
  const params = []
  for (const key of Object.keys(p).sort()) {
    const val = p[key]
    if (val !== undefined) {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    }
  }
  let ret = params.join('&')
  if (ret) {
    ret = '?' + ret
  }
  return ret
}

const encodeGetParamsWithOffset = (opts) => {
  opts = Object.assign({}, opts)
  if (opts.page !== undefined && opts.limit !== undefined) {
    opts.offset = opts.page * opts.limit
  }
  delete opts.page
  return encodeGetParams(opts)
}

function read_include({exists, read, path_sep, ext}) {
  function join(...parts) {
    return parts.join(path_sep)
  }
  if (ext === undefined) {
    ext = `.${ourbigbook.OURBIGBOOK_EXT}`
  }
  return async (id, input_dir) => {
    let found = undefined
    let test
    let basename = id + ext
    if (basename[0] === path_sep) {
      test = id.substring(1)
      if (await exists(test)) {
        found = test
      }
    } else {
      const input_dir_with_sep = input_dir + path_sep
      for (let i = input_dir_with_sep.length - 1; i > 0; i--) {
        if (input_dir_with_sep[i] === path_sep) {
          test = input_dir_with_sep.slice(0, i + 1) + basename
          if (await exists(test)) {
            found = test
            break
          }
        }
      }
      if (found === undefined && await exists(basename)) {
        found = basename
      }
    }
    if (found === undefined) {
      test = join(id, ourbigbook.INDEX_BASENAME_NOEXT + ext)
      if (input_dir !=='') {
        test = join(input_dir, test)
      }
      if (await exists(test)) {
        found = test
      }
      if (found === undefined) {
        const [dir, basename] = ourbigbook.pathSplit(id, path_sep)
        const [basename_noext, ext] = ourbigbook.pathSplitext(basename)
        if (basename_noext === ourbigbook.INDEX_BASENAME_NOEXT) {
          for (let index_basename_noext of ourbigbook.INDEX_FILE_BASENAMES_NOEXT) {
            test = join(dir, index_basename_noext + ext)
            if (await exists(test)) {
              found = test
              break
            }
          }
        }
      }
    }
    if (found !== undefined) {
      return [found, await read(found)]
    }
    return undefined
  }
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
    return sendJsonHttp(method, `/${ourbigbook.WEB_API_PATH}/${path}`, newopts)
  }

  async article(slug, opts={}, reqOpts={}) {
    const { data, status } = await this.articles(Object.assign({ id: slug }, opts), reqOpts)
    return { data: data.articles[0], status }
  }

  async articles(opts={}, reqOpts={}) {
    return this.req('get', `articles${encodeGetParamsWithOffset(opts)}`, reqOpts)
  }

  async articleAnnounce(slug, message, opts={}, reqOpts={}) {
    const body = {}
    if (message) {
      body.message = message
    }
    return this.req(
      'post',
      `articles/announce?id=${slug}${encodeGetParamsWithOffset(opts)}`,
      { body, ...reqOpts },
    )
  }

  async articlesHash(opts={}, reqOpts={}) {
    return this.req('get', `articles/hash${encodeGetParamsWithOffset(opts)}`, reqOpts)
  }

  async articlesBulkUpdate(where, what, reqOpts={}) {
    return this.req('put',
      `articles/bulk-update`,
      { body: { where, what }, ...reqOpts },
    )
  }

  async articleCreate(article, opts={}, reqOpts={}) {
    const { path, parentId, previousSiblingId, render } = opts
    return this.req('post',
      `articles`,
      { body: Object.assign({ article }, opts), ...reqOpts },
    )
  }

  async articleCreateOrUpdate(article, opts={}, reqOpts={}) {
    return this.req('put',
      `articles`,
      { body: Object.assign({ article }, opts), ...reqOpts },
    )
  }

  async articleDelete(slug, reqOpts={}) {
    return this.req('delete', `articles?id=${slug}`, reqOpts)
  }

  async articleLike(slug, reqOpts={}) {
    return this.req('post', `articles/like?id=${slug}`, reqOpts)
  }

  async articleFeed(opts={}, reqOpts={}) {
    return this.req('get', `articles/feed${encodeGetParamsWithOffset(opts)}`, reqOpts)
  }

  async articleFollow(slug, reqOpts={}) {
    return this.req('post', `articles/follow?id=${slug}`, reqOpts)
  }

  async articleRedirects(opts={}, reqOpts={}) {
    return this.req('get', `articles/redirects${encodeGetParamsWithOffset(opts)}`, reqOpts)
  }

  async articleUnfollow(slug, reqOpts={}) {
    return this.req('delete', `articles/follow?id=${slug}`, reqOpts)
  }

  async articleUnlike(slug, reqOpts={}) {
    return this.req('delete', `articles/like?id=${encodeURIComponent(slug)}`, reqOpts)
  }

  async articleUpdatedNestedSet(user, reqOpts={}) {
    return this.req('put', `articles/update-nested-set/${encodeURIComponent(user)}`, reqOpts)
  }

  async editorFetchFiles(paths, reqOpts={}) {
    return this.req('post',
      `editor/fetch-files`,
      {
        body: {
          paths,
        },
        ...reqOpts,
      },
    )
  }

  async editorGetNoscopesBaseFetch(ids, ignore_paths_set, reqOpts={}) {
    return this.req('post',
      `editor/get-noscopes-base-fetch`,
      {
        body: {
          ids,
          ignore_paths_set
        },
        ...reqOpts,
      },
    )
  }

  async editorIdExists(idid, reqOpts={}) {
    const ret = await this.req('post',
      `editor/id-exists`,
      {
        body: {
          idid,
        },
        ...reqOpts
      },
    )
    return ret.data.exists
  }

  async issue(slug, number, reqOpts={}) {
    const { data, status } = await this.issues({ id: slug, number })
    return { data: data.issues[0], status }
  }

  async issues(opts, reqOpts={}) {
    return this.req('get',
      `issues${encodeGetParamsWithOffset(opts)}`,
      reqOpts
    )
  }

  async issueCreate(slug, issue, reqOpts={}) {
    return this.req('post',
      `issues?id=${encodeURIComponent(slug)}`,
      {
        body: { issue },
        reqOpts,
      },
    )
  }

  async issueDelete(slug, issueNumber, reqOpts={}) {
    return this.req('delete', `issues/${issueNumber}?id=${encodeURIComponent(slug)}`, reqOpts)
  }

  async issueEdit(slug, issueNumber, issue, reqOpts={}) {
    return this.req('put',
      `issues/${issueNumber}?id=${encodeURIComponent(slug)}`,
      {
        body: { issue },
        ...reqOpts,
      },
    )
  }

  async issueFollow(slug, issueNumber, reqOpts={}) {
    return this.req('post', `issues/${issueNumber}/follow?id=${slug}`, reqOpts)
  }

  async issueUnfollow(slug, issueNumber, reqOpts={}) {
    return this.req('delete', `issues/${issueNumber}/follow?id=${encodeURIComponent(slug)}`, reqOpts)
  }

  async issueLike(slug, issueNumber, reqOpts={}) {
    return this.req('post', `issues/${issueNumber}/like?id=${slug}`, reqOpts)
  }

  async issueUnlike(slug, issueNumber, reqOpts={}) {
    return this.req('delete', `issues/${issueNumber}/like?id=${encodeURIComponent(slug)}`, reqOpts)
  }

  async comments(slug, issueNumber, reqOpts={}) {
    return this.req('get',
      `issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
      reqOpts,
    )
  }

  async comment(slug, issueNumber, commentNumber, reqOpts={}) {
    return this.req('get',
      `issues/${issueNumber}/comment/${commentNumber}?id=${encodeURIComponent(slug)}`,
      reqOpts,
    )
  }

  async commentCreate(slug, issueNumber, source, reqOpts={}) {
    return this.req('post',
      `issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
        ...reqOpts
      },
    )
  }

  async commentUpdate(slug, issueNumber, comentNumber, source, reqOpts={}) {
    return this.req('put',
      `issues/${issueNumber}/comments${commentNumber}?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
        ...reqOpts
      },
    )
  }

  async commentDelete(slug, issueNumber, commentNumber, reqOpts={}) {
    return this.req('delete', `issues/${issueNumber}/comments/${commentNumber}?id=${encodeURIComponent(slug)}`, reqOpts)
  }

  async min(opts={}, reqOpts={}) {
    return this.req('get', `min${encodeGetParams(opts)}`, reqOpts)
  }

  async siteSettingsUpdate(opts={}, reqOpts={}) {
    return this.req('put',
      `site`,
      {
        body: opts,
        ...reqOpts,
      },
    )
  }

  async siteSettingsBlacklistSignupIpGet(opts={}, reqOpts={}) {
    return this.req('get', `site/blacklist-signup-ip`, Object.assign({ body: opts }, reqOpts))
  }

  async siteSettingsBlacklistSignupIpCreate(opts={}, reqOpts={}) {
    return this.req('put', `site/blacklist-signup-ip`, Object.assign({ body: opts }, reqOpts))
  }

  async siteSettingsBlacklistSignupIpDelete(opts={}, reqOpts={}) {
    return this.req('delete', `site/blacklist-signup-ip`, Object.assign({ body: opts }, reqOpts))
  }

  async topics(opts={}, reqOpts={}) {
    return this.req('get', `topics${encodeGetParamsWithOffset(opts)}`, reqOpts)
  }

  async resetPassword(email, password, code, reqOpts={}) {
    return this.req(
      'post',
      `reset-password`,
      { body: { email, password, code }, ...reqOpts }
    )
  }

  async resetPasswordRequest(emailOrUsername, recaptchaToken, reqOpts={}) {
    return this.req(
      'post',
      `reset-password-request`,
      { body: { emailOrUsername, recaptchaToken }, ...reqOpts }
    )
  }

  async users(opts, reqOpts={}) {
    return this.req('get', `users${encodeGetParamsWithOffset(opts)}`)
  }

  async userCreate(attrs, recaptchaToken, reqOpts={}) {
    return this.req('post',
      `users`,
      { body: { user: attrs, recaptchaToken }, ...reqOpts },
    )
  }

  async userFollow(username, reqOpts={}){
    return this.req('post',
      `users/${username}/follow`,
      reqOpts
    )
  }

  async user(username, reqOpts={}) {
    const { data, status } = await this.users({ username }, reqOpts)
    return { data: data.users[0], status }
  }

  async userLogin(attrs, reqOpts={}) {
    return this.req('post',
      `login`,
      { body: { user: attrs }, ...reqOpts },
    )
  }

  async userUpdate(username, user, reqOpts={}) {
    return this.req('put',
      `users/${username}`,
      { body: { user }, reqOpts },
    )
  }

  async userUpdateProfilePicture(username, bytes, reqOpts={}) {
    return this.req('put',
      `users/${username}/profile-picture`,
      { body: { bytes }, reqOpts },
    )
  }

  async userUnfollow(username, reqOpts={}) {
    return this.req('delete',
      `users/${username}/follow`,
      reqOpts
    )
  }
}

// https://stackoverflow.com/questions/6048504/synchronous-request-in-node-js/53338670#53338670
async function sendJsonHttp(method, path, opts={}) {
  let { body, contentType, getToken, headers, https, hostname, port, validateStatus } = opts
  let http
  if (https) {
    http = 'https'
  } else {
    http = 'http'
  }
  if (headers) {
    headers = Object.assign({}, headers)
  } else {
    headers = {}
  }
  headers['Content-Type'] = contentType || "application/json"
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
    data: body,
    headers,
    maxRedirects: 0,
    method,
    url,
    validateStatus,
  })
  return {
    data: response.data,
    headers: response.headers,
    status: response.status,
  }
}

// Non-API stuff.

class DbProviderBase extends ourbigbook.DbProvider {
  constructor(opts={}) {
    super()
    this.id_cache = {}
    this.ref_cache = {
      from_id: {},
      to_id: {},
    }
    this.path_to_file_cache = {}
  }

  add_file_row_to_cache(row, context) {
    this.path_to_file_cache[row.path] = row
    const toplevelId = row.toplevelId
    if (
      // Happens on some unminimized condition when converting
      // cirosantilli.github.io @ 04f0f5bc03b9071f82b706b3481c09d616d44d7b + 1
      // twice with ourbigbook -S ., no patience to minimize and test now.
      toplevelId !== null
    ) {
      if (
        // We have to do this if here because otherwise it would overwrite the reconciled header
        // we have stiched into the tree with Include.
        !this.id_cache[toplevelId.idid]
      ) {
        this.add_row_to_id_cache(toplevelId, context)
      }
    }
  }

  add_ref_row_to_cache(row, to_id_key, include_key, context) {
    let to_id_key_dict = this.ref_cache[to_id_key][row[to_id_key]]
    if (to_id_key_dict === undefined) {
      to_id_key_dict = {}
      this.ref_cache[to_id_key][row[to_id_key]] = to_id_key_dict
    }
    let to_id_key_dict_type = to_id_key_dict[row.type]
    if (to_id_key_dict_type === undefined) {
      to_id_key_dict_type = []
      to_id_key_dict[row.type] = to_id_key_dict_type
    }
    to_id_key_dict_type.push(row)
    this.add_row_to_id_cache(row[include_key], context)
  }

  add_row_to_id_cache(row, context) {
    if (row !== null) {
      const ast = this.row_to_ast(row, context)
      const oldCache = this.id_cache[ast.id]
      if (
        // This is not just an optimization, we actually had a case that broke because
        // this was overwriting the value from the parsed tree, which contained more
        // information about the header tree not present in the new ast and which was required.
        oldCache
      ) {
        return oldCache
      } else {
        if (
          // Possible on reference to ID that does not exist and some other
          // non error cases I didn't bother to investigate.
          row.to !== undefined
        ) {
          ast.header_parent_ids = row.to.map(to => to.from_id)
        }
        this.id_cache[ast.id] = ast
        return ast
      }
    }
  }

  get_noscopes_base(ids, ignore_paths_set) {
    const cached_asts = []
    for (const id of ids) {
      if (id in this.id_cache) {
        const ast = this.id_cache[id]
        if (
          ignore_paths_set === undefined ||
          !ignore_paths_set.has(ast.input_path)
        ) {
          cached_asts.push(ast)
        }
      }
    }
    return cached_asts
  }

  get_file(path) {
    return this.path_to_file_cache[path]
  }

  /** Convert a Id DB row to a JavaScript AstNode object.
   *
   * @param row: a row from the Ids database
   * @return {AstNode}
   **/
  row_to_ast(row, context) {
    const ast = ourbigbook.AstNode.fromJSON(row.ast_json, context)
    ast.input_path = row.path
    ast.id = row.idid
    ast.toplevel_id = row.toplevel_id
    return ast
  }

  rows_to_asts(rows, context) {
    const asts = []
    for (const row of rows) {
      asts.push(this.add_row_to_id_cache(row, context))
      for (const row_title_title of row.from) {
        if (
          // We need this check because the version of the header it fetches does not have .to
          // so it could override one that did have the .to, and then other things could blow up.
          !(row_title_title.to && row_title_title.to.idid in this.id_cache)
        ) {
          const id2 = row_title_title.to
          if (id2) {
            const ret = this.add_row_to_id_cache(id2, context)
            if (ret !== undefined) {
              asts.push(ret)
            }
            // Get synonym of title title.
            for (const synonymRef of id2.from) {
              const ret = this.add_row_to_id_cache(synonymRef.to, context)
              if (ret !== undefined) {
                asts.push(ret)
              }
            }
          }
        }
      }
    }
    return asts
  }
}

const QUERY_TRUE_VAL = 'true'
const QUERY_FALSE_VAL = 'false'

function boolToQueryVal(b) {
  return b ? QUERY_TRUE_VAL : QUERY_FALSE_VAL
}

module.exports = {
  ARTICLE_HASH_LIMIT_MAX: 10000,
  articleHash,
  boolToQueryVal,
  QUERY_TRUE_VAL,
  QUERY_FALSE_VAL,
  WebApi,
  DbProviderBase,
  encodeGetParams,
  read_include,
  sendJsonHttp,
}
