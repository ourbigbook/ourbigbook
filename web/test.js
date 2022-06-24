const assert = require('assert');

const { WebApi } = require('ourbigbook/web_api')

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
      const val = row[key]
      if (val === undefined) {
        assert(false, `key "${key}" not found in available keys: ${Object.keys(row).join(', ')}`)
      }
      const expect = rowExpect[key]
      if (expect instanceof RegExp) {
        if (!val.match(expect)) { console.error({ i, key }); }
        assert.match(val, expect)
      } else {
        if (val !== expect) { console.error({ i, key }); }
        assert.strictEqual(val, expect)
      }
    }
  }
}

function assertStatus(status, data) {
  if (status !== 200) {
    console.error(require('util').inspect(data));
    assert.strictEqual(status, 200)
  }
}

async function createArticles(sequelize, author, opts) {
  const articleArg = createArticleArg(opts, author)
  return convert.convertArticle({
    author,
    bodySource: articleArg.bodySource,
    sequelize,
    titleSource: articleArg.titleSource,
  })
}

async function createArticle(sequelize, author, opts) {
  return (await createArticles(sequelize, author, opts))[0]
}

function createArticleArg(opts, author) {
  const i = opts.i
  const ret = {
    titleSource: `title ${i}`,
  }
  if (opts.bodySource !== undefined) {
    ret.bodySource = opts.bodySource
  }  else {
    ret.bodySource = `Body ${i}`
  }
  if (author) {
    ret.authorId = author.id
  }
  return ret
}

function createIssueArg(i, j, k) {
  return {
    titleSource: `The \\i[title] ${i} ${j} ${k}.`,
    bodySource: `The \\i[body] ${i} ${j} ${k}.`,
  }
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
    const test = {}
    test.token = undefined
    test.tokenSave = undefined
    test.enableToken = function(newToken) {
      if (newToken) {
        test.token = newToken
        test.tokenSave = newToken
      } else {
        test.token = test.tokenSave
      }
    }
    test.disableToken = function() {
      test.token = undefined
    }
    const jsonHttpOpts = {
      getToken: function () { return test.token },
      https: false,
      port: server.address().port,
      hostname: 'localhost',
      validateStatus: () => true,
    }
    test.sendJsonHttp = async function (method, path, opts={}) {
      const { body, useToken } = opts
      let token
      if (useToken === undefined || useToken) {
        token = test.token
      } else {
        token = undefined
      }
      return web_api.sendJsonHttp(
        method,
        path,
        Object.assign({ body }, jsonHttpOpts)
      )
    }
    // Create user and save the token for future requests.
    test.createUserApi = async function(i) {
      const { data, status } = await test.webApi.userCreate(createUserArg(i))
      test.tokenSave = data.user.token
      test.enableToken()
      assertStatus(status, data)
      assert.strictEqual(data.user.username, `user${i}`)
      return data.user
    }
    test.webApi = new WebApi(jsonHttpOpts)
    await cb(test)
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
  assert.strictEqual(rows[0].titleRender, 'title 0')
  assert.strictEqual(rows[0].file.authorId, user3.id)
  assert.strictEqual(rows[1].titleRender, 'title 3')
  assert.strictEqual(rows[1].file.authorId, user1.id)
  assert.strictEqual(rows[2].titleRender, 'title 2')
  assert.strictEqual(rows[2].file.authorId, user1.id)
  assert.strictEqual(rows.length, 3)
  // 6 manually from all follows + 2 for the automatically created indexes.
  assert.strictEqual(count, 8)
})

it('api: create an article and see it on global feed', async () => {
  await testApp(async (test) => {
    let data, status, article

    // Cannot create article without login.
    article = createArticleArg({ i: 0 })
    ;({data, status} = await test.webApi.articleCreate(article))
    assert.strictEqual(status, 401)

    // Create user and login.
    const user1 = await test.createUserApi(1)
    const user = await test.createUserApi(0)

    // Create article with POST.
    article = createArticleArg({ i: 0 })
    ;({data, status} = await test.webApi.articleCreate(article))
    assertStatus(status, data)
    articles = data.articles
    assert.strictEqual(articles[0].titleRender, 'title 0')
    assert.strictEqual(articles.length, 1)

    // Article creation error cases.

      // Recreating an article with POST is not allowed.
      article = createArticleArg({ i: 0, bodySource: 'Body 1' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 422)

      // Wrong field type.
      ;({data, status} = await test.webApi.articleCreate({ titleSource: 1, bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Missing title
      ;({data, status} = await test.webApi.articleCreate({ bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Missing all data.
      ;({data, status} = await test.webApi.articleCreate({}))
      assert.strictEqual(status, 422)

      // Marktup errors.
      ;({data, status} = await test.webApi.articleCreate({
        titleSource: 'The \\notdefined', bodySource: 'The \\i[body]' }))
      assert.strictEqual(status, 422)
      ;({data, status} = await test.webApi.articleCreate(
        { titleSource: 'Error', bodySource: 'The \\notdefined' }))
      assert.strictEqual(status, 422)

    // Access the article directly
    ;({data, status} = await test.webApi.articleGet('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.article.titleRender, 'title 0')
    assert.match(data.article.render, /Body 0/)

    // Make user1 like one of the articles.
    test.enableToken(user1.token)
    test.webApi.articleLike('user0')
    test.enableToken(user.token)

    // See articles on global feed.
    ;({data, status} = await test.webApi.articleAll())
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/ },
      { titleRender: 'Index', slug: 'user0' },
      { titleRender: 'Index', slug: 'user1' },
    ])

    // See latest articles by a user.
    ;({data, status} = await test.webApi.articleAll({ author: 'user0' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/ },
      { titleRender: 'Index', slug: 'user0' },
    ])

    // Top articles by a user.
    ;({data, status} = await test.webApi.articleAll({ author: 'user0', sort: 'score' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'Index', slug: 'user0' },
      { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/ },
    ])

    // Test global feed paging.
    ;({data, status} = await test.webApi.articleAll({ limit: 2, page: 1 }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'Index', slug: 'user1' },
    ])

    if (testNext) {
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/',
      ))
      assertStatus(status, data)

      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/user0',
      ))
      assertStatus(status, data)

      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/user0/title-0',
      ))
      assertStatus(status, data)

      // Logged out.
      test.disableToken()
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/',
      ))
      assertStatus(status, data)

      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/user0',
      ))
      assertStatus(status, data)

      ;({data, status} = await test.sendJsonHttp(
        'GET',
        '/user0/title-0',
      ))
      assertStatus(status, data)
      test.enableToken()
    }

    // Create article with PUT.
    article = createArticleArg({ i: 1 })
    ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
    assertStatus(status, data)
    articles = data.articles
    assert.strictEqual(articles[0].titleRender, 'title 1')
    assert.strictEqual(articles.length, 1)

    // Access the article directly
    ;({data, status} = await test.webApi.articleGet('user0/title-1'))
    assertStatus(status, data)
    assert.strictEqual(data.article.titleRender, 'title 1')
    assert.match(data.article.render, /Body 1/)

    // Update article with PUT.
    article = createArticleArg({ i: 1, bodySource: 'Body 2' })
    ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
    assertStatus(status, data)

    // Access the article directly
    ;({data, status} = await test.webApi.articleGet('user0/title-1'))
    assertStatus(status, data)
    assert.strictEqual(data.article.titleRender, 'title 1')
    assert.match(data.article.render, /Body 2/)

    // Create some issues.

    ;({data, status} = await test.webApi.issueCreate('user0',
      {
        titleSource: 'The \\i[title] 0 index 0.',
        bodySource: 'The \\i[body] 0 index 0.',
      }
    ))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 0 index 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 0 index 0\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0)))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 0 0 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 0 0 0\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 1)))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 0 0 1\./)
    assert.match(data.issue.render, /The <i>body<\/i> 0 0 1\./)
    assert.strictEqual(data.issue.number, 2)

    ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 2)))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 0 0 2\./)
    assert.match(data.issue.render, /The <i>body<\/i> 0 0 2\./)
    assert.strictEqual(data.issue.number, 3)

    ;({data, status} = await test.webApi.issueCreate('user0/title-1', createIssueArg(0, 1, 0)))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 0 1 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 0 1 0\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issueCreate('user1',
      { titleSource: 'The \\i[title] 1 index 0.', bodySource: 'The \\i[body] 1 index 0.' }))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 1 index 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 1 index 0\./)
    assert.strictEqual(data.issue.number, 1)

    // Get some issues.

    ;({data, status} = await test.webApi.issueGet('user0/title-0'))
    assertRows(data.issues, [
      { number: 3, titleRender: /The <i>title<\/i> 0 0 2\./ },
      { number: 2, titleRender: /The <i>title<\/i> 0 0 1\./ },
      { number: 1, titleRender: /The <i>title<\/i> 0 0 0\./ },
    ])

    ;({data, status} = await test.webApi.issueGet('user0/title-1'))
    assertRows(data.issues, [
      { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./ },
    ])

    ;({data, status} = await test.webApi.issueGet('user1'))
    assertRows(data.issues, [
      { number: 1, titleRender: /The <i>title<\/i> 1 index 0\./ },
    ])

    // Edit issue.

    ;({data, status} = await test.webApi.issueEdit('user1', 1,
      { bodySource: 'The \\i[body] 1 index 0 hacked.' }))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 1 index 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 1 index 0 hacked\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issueGet('user1'))
    assertRows(data.issues, [
      {
        number: 1,
        titleRender: /The <i>title<\/i> 1 index 0\./,
        render: /The <i>body<\/i> 1 index 0 hacked\./,
      },
    ])

    ;({data, status} = await test.webApi.issueEdit('user1', 1,
      { titleSource: 'The \\i[title] 1 index 0 hacked.' }))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 1 index 0 hacked\./)
    assert.match(data.issue.render, /The <i>body<\/i> 1 index 0 hacked\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issueGet('user1'))
    assertRows(data.issues, [
      {
        number: 1,
        titleRender: /The <i>title<\/i> 1 index 0 hacked\./,
        render: /The <i>body<\/i> 1 index 0 hacked\./,
      },
    ])

    // Create some comments.

    ;({data, status} = await test.webApi.commentCreate('user0', 1, 'The \\i[body] 0 index 0.'))
    assertStatus(status, data)
    assert.match(data.comment.render, /The <i>body<\/i> 0 index 0\./)
    assert.strictEqual(data.comment.number, 1)

    ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'The \\i[body] 0 0 0.'))
    assertStatus(status, data)
    assert.match(data.comment.render, /The <i>body<\/i> 0 0 0\./)
    assert.strictEqual(data.comment.number, 1)

    ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'The \\i[body] 0 0 1.'))
    assertStatus(status, data)
    assert.match(data.comment.render, /The <i>body<\/i> 0 0 1\./)
    assert.strictEqual(data.comment.number, 2)

    ;({data, status} = await test.webApi.commentCreate('user0/title-0', 2, 'The \\i[body] 0 1 0.'))
    assertStatus(status, data)
    assert.match(data.comment.render, /The <i>body<\/i> 0 1 0\./)
    assert.strictEqual(data.comment.number, 1)

    ;({data, status} = await test.webApi.commentCreate('user0/title-1', 1, 'The \\i[body] 1 0 0.'))
    assertStatus(status, data)
    assert.match(data.comment.render, /The <i>body<\/i> 1 0 0\./)
    assert.strictEqual(data.comment.number, 1)

    // Trying to create issues or comments on articles or issues that don't exist fails gracefully.
    ;({data, status} = await test.webApi.issueCreate('user0/title-2', createIssueArg(0, 2, 0)))
    assert.strictEqual(status, 404)
    ;({data, status} = await test.webApi.commentCreate('user0/title-1', 2, 'The \\i[body] 1 0 0.'))
    assert.strictEqual(status, 404)
    ;({data, status} = await test.webApi.commentCreate('user0/title-3', 1, 'The \\i[body] 1 0 0.'))
    assert.strictEqual(status, 404)

    // Trying to create issues and comments with markup errors fails gracefully.
    ;({data, status} = await test.webApi.issueCreate('user0/title-0', {
      titleSource: 'The \\notdefined 0 2.', bodySource: 'The \\i[body] 0 2.' }))
    assert.strictEqual(status, 422)
    ;({data, status} = await test.webApi.issueCreate('user0/title-0',
      { titleSource: 'The \\i[title] 0 2.', bodySource: 'The \\notdefined 0 2.' }))
    assert.strictEqual(status, 422)
    ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'The \\notdefined 0 0 0.'))
    assert.strictEqual(status, 422)

    // Get some comments.

    ;({data, status} = await test.webApi.commentGet('user0/title-0', 1))
    assertRows(data.comments, [
      { number: 2, render: /The <i>body<\/i> 0 0 1\./ },
      { number: 1, render: /The <i>body<\/i> 0 0 0\./ },
    ])

    ;({data, status} = await test.webApi.commentGet('user0/title-0', 2))
    assertRows(data.comments, [
      { number: 1, render: /The <i>body<\/i> 0 1 0\./ },
    ])

    // Getting issues and comments from articles or issues that don't exist fails gracefully.
    ;({data, status} = await test.webApi.issueGet('user0/title-2'))
    assert.strictEqual(status, 404)
    ;({data, status} = await test.webApi.commentGet('user0/title-1', 2))
    assert.strictEqual(status, 404)
    ;({data, status} = await test.webApi.commentGet('user0/title-3', 1))
    assert.strictEqual(status, 404)
  }, { canTestNext: true })
})

it('api: multiheader file creates multiple articles', async () => {
  await testApp(async (test) => {
    let res,
      data,
      article

    // Create user.
    const user = await test.createUserApi(0)

    // Create article.
    article = createArticleArg({ i: 0, bodySource: `Body 0.

== title 0 0

Body 0 0.

== title 0 1

Body 0 1.
`})
    ;({data, status} = await test.webApi.articleCreate(article))
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'title 0', slug: 'user0/title-0' },
      { titleRender: 'title 0 0', slug: 'user0/title-0-0' },
      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
    ])
    assert.match(data.articles[0].render, /Body 0\./)
    assert.match(data.articles[0].render, /Body 0 0\./)
    assert.match(data.articles[0].render, /Body 0 1\./)
    assert.match(data.articles[1].render, /Body 0 0\./)
    assert.match(data.articles[2].render, /Body 0 1\./)

    // See them on global feed.
    ;({data, status} = await test.webApi.articleAll())
    assertStatus(status, data)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { titleRender: 'Index', slug: 'user0' },
      { titleRender: 'title 0', slug: 'user0/title-0' },
      { titleRender: 'title 0 0', slug: 'user0/title-0-0' },
      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
    ])

    // Access one of the articles directly.
    ;({data, status} = await test.webApi.articleGet('user0/title-0-0'))
    assertStatus(status, data)
    assert.strictEqual(data.article.titleRender, 'title 0 0')
    assert.match(data.article.render, /Body 0 0\./)
    assert.doesNotMatch(data.article.render, /Body 0 1\./)

    // Modify the file.
    article = createArticleArg({ i: 0, bodySource: `Body 0.

== title 0 0 hacked

Body 0 0 hacked.

== title 0 1

Body 0 1.
`})
    ;({data, status} = await test.webApi.articleCreateOrUpdate(article, 'user0/title-0'))
    assertStatus(status, data)
    assertRows(data.articles, [
      { titleRender: 'title 0', slug: 'user0/title-0' },
      { titleRender: 'title 0 0 hacked', slug: 'user0/title-0-0-hacked' },
      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
    ])
    assert.match(data.articles[0].render, /Body 0\./)
    assert.match(data.articles[0].render, /Body 0 0 hacked\./)
    assert.match(data.articles[0].render, /Body 0 1\./)
    assert.match(data.articles[1].render, /Body 0 0 hacked\./)
    assert.match(data.articles[2].render, /Body 0 1\./)

    // See them on global feed.
    ;({data, status} = await test.webApi.articleAll())
    assertStatus(status, data)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { titleRender: 'Index',     slug: 'user0', },
      { titleRender: 'title 0',   slug: 'user0/title-0',  render: /Body 0 0 hacked\./ },
      { titleRender: 'title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
      { titleRender: 'title 0 0 hacked', slug: 'user0/title-0-0-hacked', render: /Body 0 0 hacked\./ },
      { titleRender: 'title 0 1', slug: 'user0/title-0-1', render: /Body 0 1\./ },
    ])

    // Topic shows only one subarticle.
    ;({data, status} = await test.webApi.articleAll({ topicId: 'title-0-0' }))
    assertStatus(status, data)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { titleRender: 'title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
    ])
  })
})
