// https://docs.ourbigbook.com#ourbigbook-web-directory-structure
//
// Plus some other random stuff that has to be able to run on frontend, thus no backend stuff here.

const axios = require('axios')

const ourbigbook = require('./index');

// https://stackoverflow.com/questions/8135132/how-to-encode-url-parameters/50288717#50288717
function encodeGetParams(p) {
  let ret = Object.entries(p).filter(kv => kv[1] !== undefined).map(kv => kv.map(encodeURIComponent).join("=")).join("&");
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
    let found = undefined;
    let test
    let basename = id + ext;
    if (basename[0] === path_sep) {
      test = id.substr(1)
      if (await exists(test)) {
        found = test;
      }
    } else {
      const input_dir_with_sep = input_dir + path_sep
      for (let i = input_dir_with_sep.length - 1; i > 0; i--) {
        if (input_dir_with_sep[i] === path_sep) {
          test = input_dir_with_sep.slice(0, i + 1) + basename
          if (await exists(test)) {
            found = test;
            break
          }
        }
      }
      if (found === undefined && await exists(basename)) {
        found = basename;
      }
    }
    if (found === undefined) {
      test = join(id, ourbigbook.INDEX_BASENAME_NOEXT + ext);
      if (input_dir !=='') {
        test = join(input_dir, test)
      }
      if (await exists(test)) {
        found = test;
      }
      if (found === undefined) {
        const [dir, basename] = ourbigbook.path_split(id, path_sep)
        const [basename_noext, ext] = ourbigbook.path_splitext(basename)
        if (basename_noext === ourbigbook.INDEX_BASENAME_NOEXT) {
          for (let index_basename_noext of ourbigbook.INDEX_FILE_BASENAMES_NOEXT) {
            test = join(dir, index_basename_noext + ext);
            if (await exists(test)) {
              found = test;
              break;
            }
          }
        }
      }
    }
    if (found !== undefined) {
      return [found, await read(found)];
    }
    return undefined;
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

  async articles(opts={}) {
    return this.req('get', `articles${encodeGetParamsWithOffset(opts)}`)
  }

  async articleCreate(article, opts={}) {
    const { path, render } = opts
    return this.req('post',
      `articles`,
      { body: { article, path, render } },
    );
  }

  async articleCreateOrUpdate(article, opts={}) {
    const { path, render } = opts
    return this.req('put',
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
    return this.req('get', `articles/feed${encodeGetParamsWithOffset(opts)}`)
  }

  async article(slug) {
    const { data, status } = await this.articles({ id: slug })
    return { data: data.articles[0], status }
  }

  async articleUnlike(slug) {
    return this.req('delete', `articles/like?id=${encodeURIComponent(slug)}`)
  }

  async editorFetchFiles(paths) {
    return this.req('post',
      `editor/fetch-files`,
      {
        body: {
          paths,
        }
      },
    )
  }

  async editorGetNoscopesBaseFetch(ids, ignore_paths_set) {
    return this.req('post',
      `editor/get-noscopes-base-fetch`,
      {
        body: {
          ids,
          ignore_paths_set
        }
      },
    )
  }

  async editorIdExists(idid) {
    return this.req('post',
      `editor/id-exists`,
      {
        body: {
          idid,
        }
      },
    )
  }
  async issues(opts) {
    return this.req('get',
      `issues${encodeGetParamsWithOffset(opts)}`,
    )
  }

  async issueCreate(slug, issue) {
    return this.req('post',
      `issues?id=${encodeURIComponent(slug)}`,
      {
        body: { issue },
      },
    )
  }

  async issueDelete(slug, issueNumber) {
    return this.req('delete', `issues/${issueNumber}/comments/${commentNumber}?id=${encodeURIComponent(slug)}`)
  }

  async issueEdit(slug, issueNumber, issue) {
    return this.req('put',
      `issues/${issueNumber}?id=${encodeURIComponent(slug)}`,
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

  async comments(slug, issueNumber) {
    return this.req('get',
      `issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
    )
  }

  async commentCreate(slug, issueNumber, source) {
    return this.req('post',
      `issues/${issueNumber}/comments?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
      },
    )
  }

  async commentUpdate(slug, issueNumber, comentNumber, source) {
    return this.req('put',
      `issues/${issueNumber}/comments${commentNumber}?id=${encodeURIComponent(slug)}`,
      {
        body: { comment: { source } },
      },
    )
  }

  async commentDelete(slug, issueNumber, commentNumber) {
    return this.req('delete', `issues/${issueNumber}/comments/${commentNumber}?id=${encodeURIComponent(slug)}`)
  }

  async users(opts) {
    return this.req('get', `users${encodeGetParamsWithOffset(opts)}`)
  }

  async userCreate(attrs, recaptchaToken) {
    return this.req('post',
      `users`,
      { body: { user: attrs, recaptchaToken } },
    );
  }

  async userFollow(username){
    return this.req('post',
      `users/${username}/follow`,
    );
  }

  async user(username) {
    const { data, status } = await this.users({ username })
    return { data: data.users[0], status }
  }

  async userLogin(attrs) {
    return this.req('post',
      `login`,
      { body: { user: attrs } },
    );
  }

  async userUpdate(username, user) {
    return this.req('put',
      `users/${username}`,
      { body: { user } },
    )
  }

  async userUnfollow(username) {
    return this.req('delete',
      `users/${username}/follow`,
    );
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
  return { data: response.data, status: response.status }
}

// Non-API stuff.

class DbProviderBase extends ourbigbook.DbProvider {
  constructor() {
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
    if (
      // Happens on some unminimized condition when converting
      // cirosantilli.github.io @ 04f0f5bc03b9071f82b706b3481c09d616d44d7b + 1
      // twice with ourbigbook -S ., no patience to minimize and test now.
      row.Id !== null &&
      // We have to do this if here because otherwise it would overwrite the reconciled header
      // we have stiched into the tree with Include.
      !this.id_cache[row.Id.idid]
    ) {
      this.add_row_to_id_cache(row.Id, context)
    }
  }

  add_row_to_id_cache(row, context) {
    if (row !== null) {
      const ast = this.row_to_ast(row, context)
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

  row_to_ast(row, context) {
    const ast = ourbigbook.AstNode.fromJSON(row.ast_json, context)
    ast.input_path = row.path
    ast.id = row.idid
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
          const ret = this.add_row_to_id_cache(row_title_title.to, context)
          if (ret !== undefined) {
            asts.push(ret)
          }
        }
      }
    }
    return asts
  }

}

module.exports = {
  WebApi,
  DbProviderBase,
  encodeGetParams,
  read_include,
  sendJsonHttp,
}
