const assert = require('assert');
const http = require('http')

const app = require('./app')
const convert = require('./convert')
const test_lib = require('./test_lib')

const testNext = process.env.OURBIGBOOK_TEST_NEXT === 'true'

function assertRows(rows, rowsExpect) {
  assert.strictEqual(rows.length, rowsExpect.length)
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i]
    let rowExpect = rowsExpect[i]
    for (let key in rowExpect) {
      if (row[key] !== rowExpect[key]) {
        console.error({ i, key });
      }
      assert.strictEqual(row[key], rowExpect[key])
    }
  }
}

async function createUserApi(server, i) {
  ;[res, data] = await sendJsonHttp({
    server,
    method: 'POST',
    path: '/api/users',
    body: { user: createUserArg(i) },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(data.user.username, `user${i}`)
  return data.user
}

async function createArticles(sequelize, author, opts) {
  const articleArg = createArticleArg(opts, author)
  return convert.convert({
    author,
    body: articleArg.body,
    sequelize,
    title:articleArg.title,
  })
  return sequelize.models.Article.create(createArticleArg(i, author))
}

async function createArticle(sequelize, author, opts) {
  return (await createArticles(sequelize, author, opts))[0]
}

function createArticleArg(opts, author) {
  const i = opts.i
  const ret = {
    title: `Title ${i}`,
  }
  if (opts.body !== undefined) {
    ret.body = opts.body
  }  else {
    ret.body = `Body ${i}`
  }
  if (author) {
    ret.authorId = author.id
  }
  return ret
}

async function createUser(sequelize, i) {
  const user = new sequelize.models.User(createUserArg(i, false))
  sequelize.models.User.setPassword(user, 'asdf')
  return user.save()
}

function createUserArg(i, password=true) {
  const ret = {
    email: `user${i}@mail.com`,
    username: `user${i}`,
    displayName: `User ${i}`,
  }
  if (password) {
    ret.password = 'asdf'
  }
  return ret
}

// TODO factor this out with front/api.
// https://stackoverflow.com/questions/6048504/synchronous-request-in-node-js/53338670#53338670
function sendJsonHttp(opts) {
  return new Promise((resolve, reject) => {
    try {
      let body
      if (opts.body) {
        body = JSON.stringify(opts.body)
      } else {
        body = ''
      }
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Accept: 'application/json',
      }
      if (opts.token) {
        headers['Authorization'] = `Token ${opts.token}`
      }
      const options = {
        hostname: 'localhost',
        port: opts.server.address().port,
        path: opts.path,
        method: opts.method,
        headers,
      }
      const req = http.request(options, (res) => {
        res.on('data', (data) => {
          let dataString
          let ret
          try {
            dataString = data.toString()
            if (res.headers['content-type'].startsWith('application/json;')) {
              ret = JSON.parse(dataString)
            } else {
              ret = dataString
            }
            resolve([res, ret])
          } catch (e) {
            console.error({ dataString })
            reject(e)
          }
        })
        // We need this as there is no 'data' event empty reply, e.g. a DELETE 204.
        res.on('end', () => resolve([res, undefined]))
      })
      req.write(body)
      req.end()
    } catch (e) {
      reject(e)
    }
  })
}

// https://stackoverflow.com/questions/8175093/simple-function-to-sort-an-array-of-objects
function sortByKey(arr, key) {
  return arr.sort((a, b) => {
    let x = a[key]
    var y = b[key]
    return ((x < y) ? -1 : ((x > y) ? 1 : 0));
  })
}

function testApp(cb, opts={}) {
  const canTestNext = opts.canTestNext === undefined ? false : opts.canTestNext
  return app.start(0, canTestNext && testNext, async (server) => {
    await cb(server)
    server.close()
  })
}

beforeEach(async function () {
  this.currentTest.sequelize = await test_lib.generateDemoData({ empty: true })
})

afterEach(async function () {
  return this.currentTest.sequelize.close()
})

it('feed shows articles by followers', async function() {
  const sequelize = this.test.sequelize
  const user0 = await createUser(sequelize, 0)
  const user1 = await createUser(sequelize, 1)
  const user2 = await createUser(sequelize, 2)
  const user3 = await createUser(sequelize, 3)

  await (user0.addFollowSideEffects(user1))
  await (user0.addFollowSideEffects(user3))

  const article0_0 = await createArticle(sequelize, user0, { i: 0 })
  const article1_0 = await createArticle(sequelize, user1, { i: 0 })
  const article1_1 = await createArticle(sequelize, user1, { i: 1 })
  const article1_2 = await createArticle(sequelize, user1, { i: 2 })
  const article1_3 = await createArticle(sequelize, user1, { i: 3 })
  const article2_0 = await createArticle(sequelize, user2, { i: 0 })
  const article2_1 = await createArticle(sequelize, user2, { i: 1 })
  const article3_0 = await createArticle(sequelize, user3, { i: 0 })
  const article3_1 = await createArticle(sequelize, user3, { i: 1 })

  const { count, rows } = await user0.findAndCountArticlesByFollowed(1, 3)
  assert.strictEqual(rows[0].title, 'Title 0')
  assert.strictEqual(rows[0].file.authorId, user3.id)
  assert.strictEqual(rows[1].title, 'Title 3')
  assert.strictEqual(rows[1].file.authorId, user1.id)
  assert.strictEqual(rows[2].title, 'Title 2')
  assert.strictEqual(rows[2].file.authorId, user1.id)
  assert.strictEqual(rows.length, 3)
  // 6 manually from all follows + 2 for the automatically created indexes.
  assert.strictEqual(count, 8)
})

it('api: create an article and see it on global feed', async () => {
  await testApp(async (server) => {
    let res,
      data,
      article

    // Create user.
    const user = await createUserApi(server, 0)
    const token = user.token

    // Create article.
    article = createArticleArg({ i: 0 })
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'POST',
      path: '/api/articles',
      body: { article },
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    articles = data.articles
    assert.strictEqual(articles[0].title, 'Title 0')
    assert.strictEqual(articles.length, 2)

    // See it on global feed.
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'GET',
      path: '/api/articles',
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { title: 'Index', slug: 'user0' },
      { title: 'Index', slug: 'user0/split' },
      { title: 'Title 0', slug: 'user0/title-0' },
      { title: 'Title 0', slug: 'user0/title-0-split' },
    ])

    if (testNext) {
      ;[res, data] = await sendJsonHttp({
        server,
        method: 'GET',
        path: '/',
        token,
      })
      assert.strictEqual(res.statusCode, 200)

      ;[res, data] = await sendJsonHttp({
        server,
        method: 'GET',
        path: '/user0',
        token,
      })
      assert.strictEqual(res.statusCode, 200)

      ;[res, data] = await sendJsonHttp({
        server,
        method: 'GET',
        path: '/user0/title-0',
        token,
      })
      assert.strictEqual(res.statusCode, 200)
    }

    //// Get request does not blow up.
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'GET',
    //  path: '/user0/title-0',
    //  token,
    //})
    //assert.strictEqual(res.statusCode, 200)

    //// See the tags on the global feed.
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'GET',
    //  path: '/api/tags',
    //  token,
    //})
    //assert.strictEqual(res.statusCode, 200)
    //data.tags.sort()
    //assert.strictEqual(data.tags[0], 'tag0')
    //assert.strictEqual(data.tags[1], 'tag1')
    //assert.strictEqual(data.tags.length, 2)

    //// Update article removing one tag and adding another.
    //article.tagList = ['tag0', 'tag1']
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'PUT',
    //  path: `/api/articles/${article.slug}`,
    //  body: {
    //    article: {
    //      title: 'Title 0 hacked',
    //      tagList: ['tag0', 'tag2'],
    //    },
    //  },
    //  token,
    //})
    //assert.strictEqual(res.statusCode, 200)
    //assert.strictEqual(data.article.title, 'Title 0 hacked')

    //// See it on global feed.
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'GET',
    //  path: '/api/articles',
    //  token,
    //})
    //assert.strictEqual(data.articles[0].title, 'Title 0 hacked')
    //assert.strictEqual(data.articles[0].author.username, 'user0')
    //assert.strictEqual(data.articlesCount, 1)

    //// See the tags on the global feed. tag1 should not exist anymore,
    //// since the article was the only one that contained it, and it was
    //// removed from the article.
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'GET',
    //  path: '/api/tags',
    //  token,
    //})
    //assert.strictEqual(res.statusCode, 200)
    //data.tags.sort()
    //assert.strictEqual(data.tags[0], 'tag0')
    //assert.strictEqual(data.tags[1], 'tag2')
    //assert.strictEqual(data.tags.length, 2)

    //// Delete article
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'DELETE',
    //  path: `/api/articles/${article.slug}`,
    //  token,
    //})
    //assert.strictEqual(res.statusCode, 204)

    //// Global feed now empty.
    //;[res, data] = await sendJsonHttp({
    //  server,
    //  method: 'GET',
    //  path: '/api/articles',
    //  token,
    //})
    //assert.strictEqual(data.articles.length, 0)
    //assert.strictEqual(data.articlesCount, 0)
  }, { canTestNext: true })
})

it('api: multiheader file creates multiple articles', async () => {
  await testApp(async (server) => {
    let res,
      data,
      article

    // Create user.
    const user = await createUserApi(server, 0)
    const token = user.token

    // Create article.
    article = createArticleArg({ i: 0, body: `== Title 0 0

== Title 0 1
`})
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'POST',
      path: '/api/articles',
      body: { article },
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    assertRows(data.articles, [
      { title: 'Title 0', slug: 'user0/title-0' },
      { title: 'Title 0 0', slug: 'user0/title-0-0' },
      { title: 'Title 0 1', slug: 'user0/title-0-1' },
      { title: 'Title 0', slug: 'user0/title-0-split' },
    ])

    // See them on global feed.
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'GET',
      path: '/api/articles',
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { title: 'Index', slug: 'user0' },
      { title: 'Index', slug: 'user0/split' },
      { title: 'Title 0', slug: 'user0/title-0' },
      { title: 'Title 0 0', slug: 'user0/title-0-0' },
      { title: 'Title 0 1', slug: 'user0/title-0-1' },
      { title: 'Title 0', slug: 'user0/title-0-split' },
    ])
  })
})
