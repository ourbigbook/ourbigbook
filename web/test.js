const assert = require('assert');

const app = require('./app')
const convert = require('./convert')
const test_lib = require('./test_lib')

const web_api = require('ourbigbook/web_api')

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
  const { data, status } = await sendJsonHttp(
    server,
    'POST',
    '/api/users',
    {
      body: { user: createUserArg(i) },
    }
  )
  assert.strictEqual(status, 200)
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

async function sendJsonHttp(server, method, path, opts={}) {
  const { body, token } = opts
  return web_api.sendJsonHttp(
    method,
    path,
    {
      body,
      getToken: () => opts.token,
      http: 'http',
      hostname: 'localhost',
      port: server.address().port,
      validateStatus: () => true,
    }
  )
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
    let data, status, article

    // Create user.
    const user = await createUserApi(server, 0)
    const token = user.token

    // Create article.
    article = createArticleArg({ i: 0 })
    ;({data, status} = await sendJsonHttp(
      server,
      'POST',
      '/api/articles',
      {
        body: { article },
        token,
      }
    ))
    assert.strictEqual(status, 200)
    articles = data.articles
    assert.strictEqual(articles[0].title, 'Title 0')
    assert.strictEqual(articles.length, 1)

    // See it on global feed.
    ;({data, status} = await sendJsonHttp(
      server,
      'GET',
      '/api/articles',
      {
        token,
      }
    ))
    assert.strictEqual(status, 200)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { title: 'Index', slug: 'user0' },
      { title: 'Title 0', slug: 'user0/title-0' },
    ])

    if (testNext) {
      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/',
        {
          token,
        }
      ))
      assert.strictEqual(status, 200)

      // Logged out.
      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/',
      ))
      assert.strictEqual(status, 200)

      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/user0',
        {
        token,
        }
      ))
      assert.strictEqual(status, 200)

      // Logged out.
      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/user0',
      ))
      assert.strictEqual(status, 200)

      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/user0/title-0',
        {
          token,
        }
      ))
      assert.strictEqual(status, 200)

      // Logged out.
      ;({data, status} = await sendJsonHttp(
        server,
        'GET',
        '/user0/title-0',
      ))
      assert.strictEqual(status, 200)
    }
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
    article = createArticleArg({ i: 0, body: `Body 0

== Title 0 0

Body 0 0

== Title 0 1

Body 0 1
`})
    ;({data, status} = await sendJsonHttp(
      server,
      'POST',
      '/api/articles',
      {
        body: { article },
        token,
      }
    ))
    assert.strictEqual(status, 200)
    assertRows(data.articles, [
      { title: 'Title 0', slug: 'user0/title-0' },
      { title: 'Title 0 0', slug: 'user0/title-0-0' },
      { title: 'Title 0 1', slug: 'user0/title-0-1' },
    ])
    assert.match(data.articles[0].render, /Body 0/)
    assert.match(data.articles[0].render, /Body 0 0/)
    assert.match(data.articles[0].render, /Body 0 1/)
    assert.match(data.articles[1].render, /Body 0 0/)
    assert.match(data.articles[2].render, /Body 0 1/)

    // See them on global feed.
    ;({data, status} = await sendJsonHttp(
      server,
      'GET',
      '/api/articles',
      {
        token,
      }
    ))
    assert.strictEqual(status, 200)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { title: 'Index', slug: 'user0' },
      { title: 'Title 0', slug: 'user0/title-0' },
      { title: 'Title 0 0', slug: 'user0/title-0-0' },
      { title: 'Title 0 1', slug: 'user0/title-0-1' },
    ])

    //// Access one of them directly.
    //;({data, status} = await sendJsonHttp(
    //  server,
    //  'GET',
    //  '/api/articles?id=',
    //  {
    //    token,
    //  }
    //))
    //assert.strictEqual(status, 200)
    //sortByKey(data.articles, 'slug')
    //assertRows(data.articles, [
    //  { title: 'Index', slug: 'user0' },
    //  { title: 'Title 0', slug: 'user0/title-0' },
    //  { title: 'Title 0 0', slug: 'user0/title-0-0' },
    //  { title: 'Title 0 1', slug: 'user0/title-0-1' },
    //])
  })
})
