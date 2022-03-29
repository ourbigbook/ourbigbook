const assert = require('assert');
const http = require('http')

const app = require('./app')
const test_lib = require('./test_lib')

function testApp(cb) {
  return app.start(0, false, async (server) => {
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

async function makeArticle(sequelize, author, i) {
  return sequelize.models.Article.create(makeArticleArg(i, author))
}

function makeArticleArg(i, author) {
  const ret = {
    title: `Title ${i}`,
    body: `Body ${i}`
  }
  if (author) {
    ret.authorId = author.id
  }
  return ret
}

async function makeUser(sequelize, i) {
  const user = new sequelize.models.User(makeUserArg(i, false))
  sequelize.models.User.setPassword(user, 'asdf')
  return user.save()
}

function makeUserArg(i, password=true) {
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

it('feed shows articles by followers', async function() {
  const sequelize = this.test.sequelize
  const user0 = await makeUser(sequelize, 0)
  const user1 = await makeUser(sequelize, 1)
  const user2 = await makeUser(sequelize, 2)
  const user3 = await makeUser(sequelize, 3)

  await (user0.addFollowSideEffects(user1))
  await (user0.addFollowSideEffects(user3))

  const article0_0 = await makeArticle(sequelize, user0, 0)
  const article1_0 = await makeArticle(sequelize, user1, 0)
  const article1_1 = await makeArticle(sequelize, user1, 1)
  const article1_2 = await makeArticle(sequelize, user1, 2)
  const article1_3 = await makeArticle(sequelize, user1, 3)
  const article2_0 = await makeArticle(sequelize, user2, 0)
  const article2_1 = await makeArticle(sequelize, user2, 1)
  const article3_0 = await makeArticle(sequelize, user3, 0)
  const article3_1 = await makeArticle(sequelize, user3, 1)

  const {count, rows} = await user0.findAndCountArticlesByFollowed(1, 3)
  assert.strictEqual(rows[0].title, 'Title 0')
  assert.strictEqual(rows[0].authorId, user3.id)
  assert.strictEqual(rows[1].title, 'Title 3')
  assert.strictEqual(rows[1].authorId, user1.id)
  assert.strictEqual(rows[2].title, 'Title 2')
  assert.strictEqual(rows[2].authorId, user1.id)
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
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'POST',
      path: '/api/users',
      body: { user: makeUserArg(0) },
    })
    assert.strictEqual(res.statusCode, 200)
    const token = data.user.token
    assert.strictEqual(data.user.username, 'user0')

    // Create article.
    article = makeArticleArg(0)
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'POST',
      path: '/api/articles',
      body: { article },
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    article = data.article
    assert.strictEqual(article.title, 'Title 0')

    // See it on global feed.
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'GET',
      path: '/api/articles',
      token,
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(data.articles[0].title, 'Title 0')
    assert.strictEqual(data.articles[0].author.username, 'user0')
    assert.strictEqual(data.articles[1].title, 'Index')
    assert.strictEqual(data.articles[1].author.username, 'user0')
    assert.strictEqual(data.articlesCount, 2)

    // Get request does not blow up.
    ;[res, data] = await sendJsonHttp({
      server,
      method: 'GET',
      path: '/user0/title-0',
      token,
    })
    assert.strictEqual(res.statusCode, 200)

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
    //console.error('0')
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
  })
})
