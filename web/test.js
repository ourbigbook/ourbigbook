const assert = require('assert');

const { WebApi } = require('ourbigbook/web_api')
const { assert_xpath } = require('ourbigbook/test_lib')

const app = require('./app')
const config = require('./front/config')
const routes = require('./front/routes')
const convert = require('./convert')
const test_lib = require('./test_lib')
const { AUTH_COOKIE_NAME } = require('./front/js')

const web_api = require('ourbigbook/web_api')

const testNext = process.env.OURBIGBOOK_TEST_NEXT === 'true'

function assertRows(rows, rowsExpect) {
  assert.strictEqual(rows.length, rowsExpect.length)
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i]
    let rowExpect = rowsExpect[i]
    for (let key in rowExpect) {
      let val
      if (typeof row.get === 'function') {
        val = row.get(key)
      } else {
        val = row[key]
      }
      if (val === undefined) {
        assert(false, `key "${key}" not found in available keys: ${Object.keys(row).join(', ')}`)
      }
      const expect = rowExpect[key]
      if (expect instanceof RegExp) {
        if (!val.match(expect)) { console.error({ i, key }); }
        assert.match(val, expect)
      } else {
        if (typeof expect === 'function') {
          if (!expect(val)) {
            console.error({ i, key });
            assert(false)
          }
        } else {
          if (val !== expect) { console.error({ i, key }); }
          assert.strictEqual(val, expect)
        }
      }
    }
  }
}

// assertRows helpers.
const ne = (expect) => (v) => v !== expect

// 200 status assertion helper that also prints the data to help
// quickly see what the error is about.
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
    path: opts.path,
    sequelize,
    titleSource: articleArg.titleSource,
  })
}

async function createArticle(sequelize, author, opts) {
  return (await createArticles(sequelize, author, opts))[0]
}

function createArticleArg(opts, author) {
  const i = opts.i
  const ret = {}
  if (opts.titleSource !== undefined) {
    ret.titleSource = opts.titleSource
  } else {
    ret.titleSource = `title ${i}`
  }
  if (opts.bodySource !== undefined) {
    ret.bodySource = opts.bodySource
  }  else {
    ret.bodySource = `Body ${i}\.`
  }
  if (author) {
    ret.authorId = author.id
  }
  return ret
}

function createIssueArg(i, j, k, opts={}) {
  const ret = {
    titleSource: `The \\i[title] ${i} ${j} ${k}.`,
    bodySource: `The \\i[body] ${i} ${j} ${k}.`,
  }
  if (opts.titleSource !== undefined) {
    ret.titleSource = opts.titleSource
  }
  if (opts.bodySource !== undefined) {
    ret.bodySource = opts.bodySource
  }
  return ret
}

async function createUser(sequelize, i) {
  const user = new sequelize.models.User(createUserArg(i, { password: false }))
  sequelize.models.User.setPassword(user, 'asdf')
  return user.save()
}

function createUserArg(i, opts={}) {
  let { password } = opts
  if (password === undefined) {
    password = true
  }
  const ret = {
    email: `user${i}@mail.com`,
    username: `user${i}`,
    displayName: `User ${i}`,
  }
  if (opts.username !== undefined) {
    ret.username = opts.username
  }
  if (opts.displayName !== undefined) {
    ret.displayName = opts.displayName
  }
  if (opts.email !== undefined) {
    ret.email = opts.email
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
  return app.start(0, canTestNext && testNext, async (server, sequelize) => {
    const test = {
      sequelize
    }
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
      let token, headers = {}
      if (useToken === undefined || useToken) {
        token = test.token
        if (token) {
          // So we can test logged-in Next.js GET requests.
          // This is never done on the actual website from js (cookies are sent by browser automatically only).
          headers.Cookie = `${AUTH_COOKIE_NAME}=${token}`
        }
      } else {
        token = undefined
      }
      return web_api.sendJsonHttp(
        method,
        path,
        Object.assign({ body, headers }, jsonHttpOpts)
      )
    }
    // Create user and save the token for future requests.
    test.createUserApi = async function(i, opts) {
      const { data, status } = await test.webApi.userCreate(createUserArg(i, opts))
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

it('User.findAndCountArticlesByFollowed', async function() {
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

it('Article.getArticlesInSamePage', async function() {
  const sequelize = this.test.sequelize
  const user0 = await createUser(sequelize, 0)
  const user1 = await createUser(sequelize, 1)

  // Create one article by each user.
  const articles0_0 = await createArticles(sequelize, user0, { i: 0, bodySource: `== Title 0 0

=== Title 0 0 0

== Title 0 1
`
})
  const articles1_0 = await createArticle(sequelize, user1, { i: 0, bodySource: `== Title 0 0

== Title 0 1

== Title 0 1 0
`
})

  // User1 likes user0/title-0
  await user1.addArticleLikeSideEffects(articles0_0[0])

  // Add an issue to Title 0 0.
  await convert.convertIssue({
    article: articles0_0[1],
    bodySource: '',
    number: 1,
    sequelize,
    titleSource: 'a',
    user: user0
  })

  // Check the data each user gets for each article.
  let rows
  rows = await sequelize.models.Article.getArticlesInSamePage({
    sequelize,
    slug: 'user0/title-0',
    loggedInUser: user0,
  })
  assertRows(rows, [
    { slug: 'user0/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
  ])
  rows = await sequelize.models.Article.getArticlesInSamePage({
    sequelize,
    slug: 'user0/title-0',
    loggedInUser: user1,
  })
  assertRows(rows, [
    { slug: 'user0/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: true  },
    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true,  liked: false },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
  ])
  rows = await sequelize.models.Article.getArticlesInSamePage({
    sequelize,
    slug: 'user1/title-0',
    loggedInUser: user0,
  })
  assertRows(rows, [
    { slug: 'user1/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
  ])
  rows = await sequelize.models.Article.getArticlesInSamePage({
    sequelize,
    slug: 'user1/title-0',
    loggedInUser: user1,
  })
  assertRows(rows, [
    { slug: 'user1/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])
})

it('Article.updateTopicsNewArticles', async function() {
  const sequelize = this.test.sequelize

  async function getTopicIds(topicIds) {
    return (await sequelize.models.Topic.getTopics({
      sequelize,
      articleOrder: 'topicId',
      articleWhere: { topicId: topicIds },
    })).rows
  }

  const nArticles = config.topicConsiderNArticles + 1
  const users = []
  for (let i = 0; i < nArticles; i++) {
    users.push(await createUser(sequelize, i))
  }

  const articles = []
  articles.push(await createArticle(sequelize, users[0], { i: 0 }))
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[0].id, articleCount: 1 }]
  )

  // Article update does not increment the Topic.articleCount.
  await createArticle(sequelize, users[0], { i: 0, body: 'Body 0 hacked' })
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[0].id, articleCount: 1 }]
  )

  articles.push(await createArticle(sequelize, users[1], { i: 99, path: 'title-0' }))
  // The topic title-0 is tied with two different titles, "Title 0" and "Title 99".
  // So we keep the oldest one, "Title 0".
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[0].id, articleCount: 2 }]
  )

  articles.push(await createArticle(sequelize, users[2], { i: 99, path: 'title-0' }))
  // This broke the above tie, now "Title 99" became the representative title with 2 entries,
  // so we update the topic to point to the oldest "Title 99".
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[1].id, articleCount: 3 }]
  )

  for (let i = 3; i < 7; i++) {
    articles.push(await createArticle(sequelize, users[i], { i: 99, path: 'title-0' }))
  }
  for (let i = 7; i < nArticles; i++) {
    articles.push(await createArticle(sequelize, users[i], { i: 0, path: 'title-0' }))
  }

  // Now we have 6 "Title 99" and 5 "Title 0". All have score 0.
  // Only top 10 most voted are considered, but we take lower IDs first,
  // and the Title 99 are IDs 1 through 6, so it wins, 6 to 4.
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[1].id, articleCount: nArticles }]
  )

  // So let's upvote the 4 trailing ones to bring them up in score.
  // This will bring the count 5 to 5, and "Title 0" will win because
  // it holds the smallest ID 0.
  for (let i = 7; i < nArticles; i++) {
    await users[0].addArticleLikeSideEffects(articles[i])
  }
  assertRows(
    await getTopicIds(['title-0']),
    [{ articleId: articles[0].id, articleCount: nArticles }]
  )
})

it('api: create an article and see it on global feed', async () => {
  await testApp(async (test) => {
    let data, status, article

    // User

      // Create user errors

        // Invalid username: too short
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'a'.repeat(config.usernameMinLength - 1) })))
        assert.strictEqual(status, 422)

        // Invalid username: too long
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'a'.repeat(config.usernameMaxLength + 1) })))
        assert.strictEqual(status, 422)

        // Invalid username char: _
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'ab_cd' })))
        assert.strictEqual(status, 422)

        // Invalid username char: uppercase
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'abCd' })))
        assert.strictEqual(status, 422)

        // Invalid username: starts in -, ends in -, double -
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: '-abcd' })))
        assert.strictEqual(status, 422)
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'abcd-' })))
        assert.strictEqual(status, 422)
        ;({ data, status } = await test.webApi.userCreate(createUserArg(0, { username: 'ab--cd' })))
        assert.strictEqual(status, 422)

      // Create users
      const user = await test.createUserApi(0)
      const user1 = await test.createUserApi(1)
      const user2 = await test.createUserApi(2)
      // Make user2 admin via direct DB access (the only way).
      await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user2' } })
      test.enableToken(user.token)

      // User GET
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assertRows([data], [{ username: 'user0', displayName: 'User 0' }])

      // Edit users

        ;({data, status} = await test.webApi.userUpdate('user0', { displayName: 'User 0 hacked' }))
        assertStatus(status, data)
        ;({data, status} = await test.webApi.user('user0'))
        assertStatus(status, data)
        assertRows([data], [{ username: 'user0', displayName: 'User 0 hacked' }])

        // Non-admin users cannot edit other users.
        test.enableToken(user1.token)
        ;({data, status} = await test.webApi.userUpdate('user0', { displayName: 'User 0 hacked 2' }))
        assert.strictEqual(status, 403)
        test.enableToken(user.token)

        // Admin users can edit other users.
        test.enableToken(user2.token)
        ;({data, status} = await test.webApi.userUpdate('user0', { displayName: 'User 0 hacked 3' }))
        assertStatus(status, data)
        test.enableToken(user.token)
        ;({data, status} = await test.webApi.user('user0'))
        assertStatus(status, data)
        assertRows([data], [{ username: 'user0', displayName: 'User 0 hacked 3' }])

      // Users see their own email on GET.
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assertRows([data], [{ email: 'user0@mail.com' }])

      // Non-admin users don't see other users' email on GET.
      ;({data, status} = await test.webApi.user('user1'))
      assertStatus(status, data)
      assert.strictEqual(data.email, undefined)

      // Admin users see other users emails on GET.
      test.enableToken(user2.token)
      ;({data, status} = await test.webApi.user('user1'))
      assertStatus(status, data)
      assertRows([data], [{ email: 'user1@mail.com' }])
      test.enableToken(user.token)

      // Cannot modify username.
      ;({data, status} = await test.webApi.userUpdate('user0', { username: 'user0hacked' }))
      assert.strictEqual(status, 422)

      // Cannot modify email.
      // TODO https://github.com/cirosantilli/ourbigbook/issues/268
      // Once the above is fixed, this will likely just be allowed on dev mode and then
      // we will just remove this test.
      ;({data, status} = await test.webApi.userUpdate('user0', { email: 'user0hacked@mail.com' }))
      assert.strictEqual(status, 422)

    // Create article

      article = createArticleArg({ i: 0 })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)
      assertRows(data.articles, [{ titleRender: 'title 0' }])

    // Create article errors

      // Cannot create article if logged out.
      test.disableToken()
      article = createArticleArg({ i: 1 })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 401)
      test.enableToken()

      // Cannot create article if token is given but wrong.
      test.enableToken('asdfqwer')
      article = createArticleArg({ i: 1 })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 401)
      test.enableToken(user.token)

      // Recreating an article with POST is not allowed.
      article = createArticleArg({ i: 0, bodySource: 'Body 1' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 422)

      // Wrong field type.
      ;({data, status} = await test.webApi.articleCreate({ titleSource: 1, bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Empty path.
      ;({data, status} = await test.webApi.articleCreateOrUpdate({
        titleSource: 'Empty path attempt', bodySource: 'Body 1' }, { path: '' }
      ))
      assert.strictEqual(status, 422)

      // Missing title
      ;({data, status} = await test.webApi.articleCreate({ bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Missing all data.
      ;({data, status} = await test.webApi.articleCreate({}))
      assert.strictEqual(status, 422)

      // Markup errors.
      ;({data, status} = await test.webApi.articleCreate({
        titleSource: 'The \\notdefined', bodySource: 'The \\i[body]' }))
      assert.strictEqual(status, 422)
      ;({data, status} = await test.webApi.articleCreate(
        { titleSource: 'Error', bodySource: 'The \\notdefined' }))
      assert.strictEqual(status, 422)

    // View articles.

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 0')
      assert.match(data.render, /Body 0\./)

      // See articles on global feed.

      ;({data, status} = await test.webApi.articles())
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/ },
        { titleRender: 'Index', slug: 'user2' },
        { titleRender: 'Index', slug: 'user1' },
        { titleRender: 'Index', slug: 'user0' },
      ])

      // See latest articles by a user.

      ;({data, status} = await test.webApi.articles({ author: 'user0' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/ },
        { titleRender: 'Index', slug: 'user0' },
      ])

    // Edit article.

      article = createArticleArg({ i: 0, bodySource: 'Body 0 hacked.' })
      ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0 hacked\./ }])

      ;({data, status} = await test.webApi.article('user0/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 0')
      assert.match(data.render, /Body 0 hacked\./)

      // Undo it for sanity.
      article = createArticleArg({ i: 0, bodySource: 'Body 0.' })
      ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0\./ }])

    // Edit index article.

      ;({data, status} = await test.webApi.articleCreateOrUpdate({
        titleSource: 'Index',
        bodySource: 'Welcome to my home page hacked!'
      }))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Welcome to my home page hacked!/ }])

      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Index')
      assert.match(data.render, /Welcome to my home page hacked!/)

    // Article like

      // Make user1 like one of the articles.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleLike('user0'))
      assertStatus(status, data)
      test.enableToken(user.token)

    // Like effects.

      // Score goes up.
      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.score, 1)

      // Shows on likedBy list of user1.
      ;({data, status} = await test.webApi.articles({ likedBy: 'user1' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'Index', slug: 'user0' },
      ])

      // Does not show up on likedBy list of user0.
      ;({data, status} = await test.webApi.articles({ likedBy: 'user0' }))
      assertStatus(status, data)
      assertRows(data.articles, [])

      // Top articles by a user.
      ;({data, status} = await test.webApi.articles({ author: 'user0', sort: 'score' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'Index', slug: 'user0', score: 1 },
        { titleRender: 'title 0', slug: 'user0/title-0', render: /Body 0/, score: 0 },
      ])

      // Invalid sort.
      ;({data, status} = await test.webApi.articles({ author: 'user0', sort: 'dontexist' }))
      assert.strictEqual(status, 422)

      // User score.
      ;({data, status} = await test.webApi.users({ sort: 'score' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user0', score: 1 },
        { username: 'user2', score: 0 },
        { username: 'user1', score: 0 },
      ])

    // Article like errors.

      // Users cannot like articles twice.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleLike('user0'))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // Users cannot like their own article.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleLike('user1'))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // Trying to like article that does not exist fails gracefully.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleLike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.enableToken(user.token)

    // Make user1 unlike one of the articles.

      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleUnlike('user0'))
      assertStatus(status, data)
      test.enableToken(user.token)

    // Unlike effects

      // Score goes back down.
      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.score, 0)

      // User score.
      ;({data, status} = await test.webApi.users())
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2', score: 0 },
        { username: 'user1', score: 0 },
        { username: 'user0', score: 0 },
      ])

    // Unlike errors.

      // Cannot unlike article twice.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleUnlike('user0'))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // Trying to like article that does not exist fails gracefully.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.articleUnlike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.enableToken(user.token)

    // View articles

      // Test global feed paging.
      ;({data, status} = await test.webApi.articles({ limit: 2, page: 0 }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user0/title-0' },
        { slug: 'user2' },
      ])
      ;({data, status} = await test.webApi.articles({ limit: 2, page: 1 }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user1' },
        { slug: 'user0' },
      ])

      // Invalid limit or page.
      ;({data, status} = await test.webApi.articles({ limit: 'dontexist', page: 1 }))
      assert.strictEqual(status, 422)
      ;({data, status} = await test.webApi.articles({ limit: 2, page: 'dontexist' }))
      assert.strictEqual(status, 422)
      // Limit too large
      ;({data, status} = await test.webApi.articles({ limit: config.articleLimitMax + 1, page: 1 }))
      assert.strictEqual(status, 422)

    // Update articles

      // Create article with PUT.
      article = createArticleArg({ i: 1 })
      ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
      assertStatus(status, data)
      articles = data.articles
      assert.strictEqual(articles[0].titleRender, 'title 1')
      assert.strictEqual(articles.length, 1)

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 1')
      assert.match(data.render, /Body 1/)

      // Update article with PUT.
      article = createArticleArg({ i: 1, bodySource: 'Body 2' })
      ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
      assertStatus(status, data)

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 1')
      assert.match(data.render, /Body 2/)

    // User following.

      // user2 follows user0 and user2
      test.enableToken(user2.token)
      ;({data, status} = await test.webApi.userFollow('user0'))
      assertStatus(status, data)
      ;({data, status} = await test.webApi.userFollow('user2'))
      assertStatus(status, data)
      test.enableToken(user.token)

      // user0 follows user1
      ;({data, status} = await test.webApi.userFollow('user1'))

      // Users cannot follow another user twice.
      ;({data, status} = await test.webApi.userFollow('user1'))
      assert.strictEqual(status, 403)

      // Trying to follow an user that does not exist fails gracefully.
      ;({data, status} = await test.webApi.userFollow('dontexist'))
      assert.strictEqual(status, 404)

      // users followedBy
      ;({data, status} = await test.webApi.users({ followedBy: 'user0' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user1' },
      ])
      ;({data, status} = await test.webApi.users({ followedBy: 'user1' }))
      assertStatus(status, data)
      assertRows(data.users, [])
      ;({data, status} = await test.webApi.users({ followedBy: 'user2' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2' },
        { username: 'user0' },
      ])
      ;({data, status} = await test.webApi.users({ followedBy: 'user2', limit: 1 }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2' },
      ])

      // users following
      ;({data, status} = await test.webApi.users({ following: 'user0' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2' },
      ])
      ;({data, status} = await test.webApi.users({ following: 'user1' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user0' },
      ])
      ;({data, status} = await test.webApi.users({ following: 'user2' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2' },
      ])

      // Both followedBy and following together also works.
      ;({data, status} = await test.webApi.users({
        following: 'user2',
        followedBy: 'user2',
      }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user2' },
      ])

    // User unfollowing.

      // Unfollow everyone.
      test.enableToken(user2.token)
      ;({data, status} = await test.webApi.userUnfollow('user0'))
      assertStatus(status, data)
      ;({data, status} = await test.webApi.userUnfollow('user2'))
      assertStatus(status, data)
      test.enableToken(user.token)
      ;({data, status} = await test.webApi.userUnfollow('user1'))

      // Users cannot unfollow another user twice.
      ;({data, status} = await test.webApi.userUnfollow('user1'))
      assert.strictEqual(status, 403)

      // Trying to follow an user that does not exist fails gracefully.
      ;({data, status} = await test.webApi.userUnfollow('dontexist'))
      assert.strictEqual(status, 404)

    // No more article index operations after this point, we are not going to create some more specialized articles.

      // Link to another article.
      article = createArticleArg({ titleSource: 'x', bodySource: '<Title 1>' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)
      // TODO title-1 would be better here. Lazy to investigate now though.
      assert_xpath("//x:a[@href='../user0/title-1' and text()='Title 1']", data.articles[0].render)

    // Create issues

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

      // Users can create issues on other users articles.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 3)))
      assertStatus(status, data)
      assert.match(data.issue.titleRender, /The <i>title<\/i> 0 0 3\./)
      assert.match(data.issue.render, /The <i>body<\/i> 0 0 3\./)
      assert.strictEqual(data.issue.number, 4)
      test.enableToken(user.token)

      ;({data, status} = await test.webApi.issueCreate('user0/title-1', createIssueArg(0, 1, 0)))
      assertStatus(status, data)
      assert.match(data.issue.titleRender, /The <i>title<\/i> 0 1 0\./)
      assert.match(data.issue.render, /The <i>body<\/i> 0 1 0\./)
      assert.strictEqual(data.issue.number, 1)

      ;({data, status} = await test.webApi.issueCreate('user0/title-1', createIssueArg(0, 1, 1)))
      assertStatus(status, data)
      assert.match(data.issue.titleRender, /The <i>title<\/i> 0 1 1\./)
      assert.match(data.issue.render, /The <i>body<\/i> 0 1 1\./)
      assert.strictEqual(data.issue.number, 2)

      ;({data, status} = await test.webApi.issueCreate('user1',
        { titleSource: 'The \\i[title] 1 index 0.', bodySource: 'The \\i[body] 1 index 0.' }))
      assertStatus(status, data)
      assert.match(data.issue.titleRender, /The <i>title<\/i> 1 index 0\./)
      assert.match(data.issue.render, /The <i>body<\/i> 1 index 0\./)
      assert.strictEqual(data.issue.number, 1)

    // Create issue errors

    // Article does not exist
    ;({data, status} = await test.webApi.issueCreate('user0/dontexist', createIssueArg(0, 2, 0)))
    assert.strictEqual(status, 404)

    // Markup error on title
    ;({data, status} = await test.webApi.issueCreate('user0/title-0', {
      titleSource: 'The \\notdefined 0 2.', bodySource: 'The \\i[body] 0 2.' }))
    assert.strictEqual(status, 422)

    // Markup error on body
    ;({data, status} = await test.webApi.issueCreate('user0/title-0',
      { titleSource: 'The \\i[title] 0 2.', bodySource: 'The \\notdefined 0 2.' }))
    assert.strictEqual(status, 422)

    // Get issues

    ;({data, status} = await test.webApi.issues({ id: 'user0/title-0' }))
    assertStatus(status, data)
    assertRows(data.issues, [
      { number: 4, titleRender: /The <i>title<\/i> 0 0 3\./ },
      { number: 3, titleRender: /The <i>title<\/i> 0 0 2\./ },
      { number: 2, titleRender: /The <i>title<\/i> 0 0 1\./ },
      { number: 1, titleRender: /The <i>title<\/i> 0 0 0\./ },
    ])

    ;({data, status} = await test.webApi.issues({ id: 'user0/title-1' }))
    assertStatus(status, data)
    assertRows(data.issues, [
      { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./ },
      { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./ },
    ])

    ;({data, status} = await test.webApi.issues({ id: 'user0' }))
    assertStatus(status, data)
    assertRows(data.issues, [
      { number: 1, titleRender: /The <i>title<\/i> 0 index 0\./ },
    ])

    ;({data, status} = await test.webApi.issues({ id: 'user1' }))
    assertStatus(status, data)
    assertRows(data.issues, [
      { number: 1, titleRender: /The <i>title<\/i> 1 index 0\./ },
    ])

    // Getting issues from article that doesn't exist fails gracefully.
    ;({data, status} = await test.webApi.issues({ id: 'user0/dontexist' }))
    assert.strictEqual(status, 404)

    // Edit issue.

    ;({data, status} = await test.webApi.issueEdit('user1', 1,
      { bodySource: 'The \\i[body] 1 index 0 hacked.' }))
    assertStatus(status, data)
    assert.match(data.issue.titleRender, /The <i>title<\/i> 1 index 0\./)
    assert.match(data.issue.render, /The <i>body<\/i> 1 index 0 hacked\./)
    assert.strictEqual(data.issue.number, 1)

    ;({data, status} = await test.webApi.issues({ id: 'user1' }))
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

    ;({data, status} = await test.webApi.issues({ id: 'user1' }))
    assertRows(data.issues, [
      {
        number: 1,
        titleRender: /The <i>title<\/i> 1 index 0 hacked\./,
        render: /The <i>body<\/i> 1 index 0 hacked\./,
      },
    ])

    // Edit issue errors

    // Article does not exist
    ;({data, status} = await test.webApi.issueEdit('user0/dontexist', 1, { titleSource: 'asdf' }))
    assert.strictEqual(status, 404)

    // Markup error on title
    ;({data, status} = await test.webApi.issueEdit('user0/title-0', 1, { titleSource: '\\notdefined' }))
    assert.strictEqual(status, 422)

    // Markup error on body
    ;({data, status} = await test.webApi.issueEdit('user0/title-0', 1, { bodySource: '\\notdefined' }))
    assert.strictEqual(status, 422)

    // Trying to edit someone else's issue fails.

      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueEdit('user1', 1,
        { bodySource: 'The \\i[body] 1 index 0 hacked by user1.' }))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // The issue didn't change.
      ;({data, status} = await test.webApi.issues({ id: 'user1' }))
      assertRows(data.issues, [
        {
          number: 1,
          titleRender: /The <i>title<\/i> 1 index 0 hacked\./,
          render: /The <i>body<\/i> 1 index 0 hacked\./,
        },
      ])

    // Issue likes.

      // Make user1 like one of the issues.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 1))
      assertStatus(status, data)
      test.enableToken(user.token)

      // Score goes up.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-1', sort: 'score' } ))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./, score: 1 },
        { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./, score: 0 },
      ])

      // Users cannot like issue twice.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 1))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // Users cannot like their own issue.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueLike('user0/title-0', 4))
      assert.strictEqual(status, 403)
      test.enableToken(user1.token)

      // Trying to like issue that does not exist fails gracefully.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueLike('user0/dontexist', 1))
      assert.strictEqual(status, 404)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 999))
      assert.strictEqual(status, 404)
      test.enableToken(user.token)

    // Make user1 unlike one of an issues.

      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 1))
      assertStatus(status, data)
      test.enableToken(user.token)

      // Score goes up.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-1' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./, score: 0 },
        { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./, score: 0 },
      ])

      // Cannot unlike issue twice.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 1))
      assert.strictEqual(status, 403)
      test.enableToken(user.token)

      // Trying to like article that does not exist fails gracefully.
      test.enableToken(user1.token)
      ;({data, status} = await test.webApi.issueUnlike('user0/dontexist', 1))
      assert.strictEqual(status, 404)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 999))
      assert.strictEqual(status, 404)
      test.enableToken(user.token)

    // No more issue indexes after this point.

      // Link to article by issue author.
      ;({data, status} = await test.webApi.issueCreate('user1',
        {
          titleSource: 'x',
          bodySource: '<Title 1>',
        }
      ))
      assertStatus(status, data)
      // Has to account for go/issues/<number>/<username>, so four levels.
      assert_xpath("//x:a[@href='../../../../user0/title-1' and text()='Title 1']", data.issue.render)

    // Create comments

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

    // Create comment errors

      // Article does not exist
      ;({data, status} = await test.webApi.commentCreate('user0/title-1', 999, 'The \\i[body] 1 0 0.'))
      assert.strictEqual(status, 404)

      // Issues does not exist
      ;({data, status} = await test.webApi.commentCreate('user0/dontexist', 1, 'The \\i[body] 1 0 0.'))
      assert.strictEqual(status, 404)

      // Markup error
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'The \\notdefined 0 0 0.'))
      assert.strictEqual(status, 422)

    // Get some comments.

    ;({data, status} = await test.webApi.comments('user0/title-0', 1))
    assertRows(data.comments, [
      { number: 1, render: /The <i>body<\/i> 0 0 0\./ },
      { number: 2, render: /The <i>body<\/i> 0 0 1\./ },
    ])

    ;({data, status} = await test.webApi.comments('user0/title-0', 2))
    assertRows(data.comments, [
      { number: 1, render: /The <i>body<\/i> 0 1 0\./ },
    ])

    // Getting comments from articles or issues that don't exist fails gracefully.
    ;({data, status} = await test.webApi.comments('user0/title-1', 999))
    assert.strictEqual(status, 404)
    ;({data, status} = await test.webApi.comments('user0/dontexist', 1))
    assert.strictEqual(status, 404)

    // No more comment index gets from now on.

      //// Link to article by comment author.
      // TODO https://github.com/cirosantilli/ourbigbook/issues/277.
      // Changing titleSource: undefined, in convertComment to titleSource: 'asdf' makes it not fail,
      // but adds the title to the render.
      //;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, '<Title 1>'))
      //assertStatus(status, data)
      //assert_xpath("//x:a[@href='../../../../user0/title-1' and text()='Title 1']", data.comment.render)

    if (testNext) {
      // Tests with the same result for logged in or off.
      async function testNextLoggedInOrOff() {
        // Index.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.home(),
        ))
        assertStatus(status, data)

        // User index.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.users(),
        ))
        assertStatus(status, data)

        // User.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.user('user0'),
        ))
        assertStatus(status, data)

        // User that doesn't exist.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.user('dontexist'),
        ))
        assert.strictEqual(status, 404)

        // Article.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.article('user0/title-0'),
        ))
        assertStatus(status, data)

        // Article that doesn't exist.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.article('user0/dontexist'),
        ))
        assert.strictEqual(status, 404)

        // Issue list for article.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.issues('user0/title-0'),
        ))
        assertStatus(status, data)

        // An issue of article.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.issue('user0/title-0', 1),
        ))
        assertStatus(status, data)

        // An issue that doesn't exist.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.issue('user0/title-0', 999),
        ))
        assert.strictEqual(status, 404)

        // Topic index.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.topics(),
        ))
        assertStatus(status, data)

        // Topic.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.topic('title-0'),
        ))
        assertStatus(status, data)

        // Empty topic.
        ;({data, status} = await test.sendJsonHttp(
          'GET',
          routes.topic('dontexist'),
        ))
        // Maybe we want 404?
        assertStatus(status, data)
      }

      // Logged in.
      await testNextLoggedInOrOff()

      // Logged out.
      test.disableToken()
      await testNextLoggedInOrOff()
      test.enableToken(user.token)

      // Cases where logged out access leads to redirect to signup page.
      async function testRedirIfLoggedOff(cb) {
        test.disableToken()
        let {data, status} = await cb()
        assert.strictEqual(status, 307)
        test.enableToken(user.token)
        ;({data, status} = await cb())
        assertStatus(status, data)
      }
      await testRedirIfLoggedOff(async () => test.sendJsonHttp(
        'GET',
        routes.articleNew(),
      ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp(
        'GET',
        routes.articleEdit('user0/title-0'),
      ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp(
        'GET',
        routes.issueNew('user0/title-0'),
      ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp(
        'GET',
        routes.issueEdit('user0/title-0', 1),
      ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp(
        'GET',
        routes.userEdit('user0'),
      ))

      // Non admins cannot see the settings page of other users.
      test.enableToken(user.token)
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        routes.userEdit('user1'),
      ))
      assert.strictEqual(status, 404)

      // Admins can see the settings page of other users.
      test.enableToken(user2.token)
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        routes.userEdit('user1'),
      ))
      assertStatus(status, data)
      test.enableToken(user.token)
    }
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
    ;({data, status} = await test.webApi.articles())
    assertStatus(status, data)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { titleRender: 'Index', slug: 'user0' },
      { titleRender: 'title 0', slug: 'user0/title-0' },
      { titleRender: 'title 0 0', slug: 'user0/title-0-0' },
      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
    ])

    // Access one of the articles directly.
    ;({data, status} = await test.webApi.article('user0/title-0-0'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'title 0 0')
    assert.match(data.render, /Body 0 0\./)
    assert.doesNotMatch(data.render, /Body 0 1\./)

    // Modify the file.
    article = createArticleArg({ i: 0, bodySource: `Body 0.

== title 0 0 hacked

Body 0 0 hacked.

== title 0 1

Body 0 1.
`})
    ;({data, status} = await test.webApi.articleCreateOrUpdate(article))
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
    ;({data, status} = await test.webApi.articles())
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
    ;({data, status} = await test.webApi.articles({ topicId: 'title-0-0' }))
    assertStatus(status, data)
    sortByKey(data.articles, 'slug')
    assertRows(data.articles, [
      { titleRender: 'title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
    ])
  })
})

it('api: resource limits', async () => {
  await testApp(async (test) => {
    let data, status, article

    const user = await test.createUserApi(0)
    const admin = await test.createUserApi(1)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user1' } })
    test.enableToken(user.token)

    // Non-admin users cannot edit their own resource limits.
    ;({data, status} = await test.webApi.userUpdate('user0', {
      maxArticles: 1,
      maxArticleSize: 2,
    }))
    assertStatus(status, data)
    assertRows([data.user], [{
      username: 'user0',
      maxArticles: config.maxArticles,
      maxArticleSize: config.maxArticleSize,
    }])

    // Admin users can edit other users' resource limits.
    test.enableToken(admin.token)
    ;({data, status} = await test.webApi.userUpdate('user0', {
      maxArticles: 3,
      maxArticleSize: 3,
    }))
    assertStatus(status, data)
    assertRows([data.user], [{
      username: 'user0',
      maxArticles: 3,
      maxArticleSize: 3,
    }])
    test.enableToken(user.token)

    // Article.

      // maxArticleSize resource limit is enforced for non-admins.
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.enableToken(admin.token)
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)
      test.enableToken(user.token)

      // OK, second article including Index.
      article = createArticleArg({ i: 0, bodySource: 'abc' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)

      // maxArticleSize resource limit is enforced for all users.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 422)

      // Even admin.
      test.enableToken(admin.token)
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 422)
      test.enableToken(user.token)

      // OK 2, third article including Index.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)

      // maxArticles resource limit is enforced for non-admins.
      article = createArticleArg({ i: 2, bodySource: 'abcd' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assert.strictEqual(status, 403)

      // OK 2 for admin.
      test.enableToken(admin.token)
      article = createArticleArg({ i: 1, bodySource: 'abc' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)
      test.enableToken(user.token)

      // maxArticles resource limit is not enforced for admins.
      test.enableToken(admin.token)
      article = createArticleArg({ i: 2, bodySource: 'abcd' })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)
      test.enableToken(user.token)

    // Multiheader articles count as just one article.

      // Increment article limit by two from 3 to 5. User had 3, so now there are two left.
      // Also increment article size so we can fit the header in.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        maxArticles: 5,
        maxArticleSize: 100,
      }))
      assertStatus(status, data)
      test.enableToken(user.token)

      // This should count as just one, totalling 4.
      article = createArticleArg({ i: 2, bodySource: `== Title 2 1
` })
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)

      // So now we can still do one more, totalling 5.
      article = createArticleArg({ i: 3, bodySource: `abc`})
      ;({data, status} = await test.webApi.articleCreate(article))
      assertStatus(status, data)

    // Issue.

      // Change limit to 2 now that we don't have Index.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        maxArticles: 2,
        maxArticleSize: 3,
      }))
      assertStatus(status, data)
      test.enableToken(user.token)

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abcd' })))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abcd' })))
      assertStatus(status, data)
      test.enableToken(user.token)

      // OK.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)

      // maxArticleSize resource limit is enforced for all users.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })))
      assert.strictEqual(status, 422)

      // Even admin.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })))
      assert.strictEqual(status, 422)
      test.enableToken(user.token)

      // OK 2.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })))
      assertStatus(status, data)

      // maxArticles resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assert.strictEqual(status, 403)

      // OK 2 for admin.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)
      test.enableToken(user.token)

      // maxArticles resource limit is not enforced for admins.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)
      test.enableToken(user.token)

    // Comment.

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd'))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd'))
      assertStatus(status, data)
      test.enableToken(user.token)

      // OK.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)

      // OK 2.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)

      // maxArticles resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assert.strictEqual(status, 403)

      // OK 2 for admin.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)
      test.enableToken(user.token)

      // maxArticles resource limit is not enforced for admins.
      test.enableToken(admin.token)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)
      test.enableToken(user.token)
  })
})
