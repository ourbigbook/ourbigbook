const assert = require('assert');

const { WebApi } = require('ourbigbook/web_api')
const {
  assert_xpath,
  xpath_header_parent,
} = require('ourbigbook/test_lib')
const ourbigbook = require('ourbigbook')

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

async function createArticleApi(test, article, opts={}) {
  if (opts.parentId === undefined && test.user) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreate(article, opts)
}

async function createOrUpdateArticleApi(test, article, opts={}) {
  if (opts.parentId === undefined && test.user && article.titleSource.toLowerCase() !== ourbigbook.INDEX_BASENAME_NOEXT) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreateOrUpdate(article, opts)
}

async function createArticles(sequelize, author, opts) {
  const articleArg = createArticleArg(opts, author)
  return convert.convertArticle({
    author,
    bodySource: articleArg.bodySource,
    path: opts.path,
    parentId: `${ourbigbook.AT_MENTION_CHAR}${author.username}`,
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
    test.user = undefined
    test.userSave = undefined
    test.loginUser = function(newUser) {
      if (newUser) {
        test.user = newUser
        test.userSave = newUser
      } else {
        test.user = test.userSave
      }
    }
    test.disableToken = function() {
      test.user = undefined
    }
    const jsonHttpOpts = {
      getToken: function () { return test.user ? test.user.token : undefined },
      https: false,
      port: server.address().port,
      hostname: 'localhost',
      validateStatus: () => true,
    }
    test.sendJsonHttp = async function (method, path, opts={}) {
      const { body, useToken } = opts
      let token, headers = {}
      if (useToken === undefined || useToken) {
        token = test.user ? test.user.token : undefined
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
      assertStatus(status, data)
      test.tokenSave = data.user.token
      test.loginUser()
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

// TODO this is in a bit of flow, as we possibly move from predefined descendant contents, to on-the-fly calculated ones.
//it('Article.getArticlesInSamePage', async function() {
//  const sequelize = this.test.sequelize
//  const user0 = await createUser(sequelize, 0)
//  const user1 = await createUser(sequelize, 1)
//
//  // Create one article by each user.
//  const articles0_0 = await createArticles(sequelize, user0, { i: 0, bodySource: `== Title 0 0
//
//=== Title 0 0 0
//
//== Title 0 1
//`
//})
//  const articles1_0 = await createArticle(sequelize, user1, { i: 0, bodySource: `== Title 0 0
//
//== Title 0 1
//
//== Title 0 1 0
//`
//})
//
//  // User1 likes user0/title-0
//  await user1.addArticleLikeSideEffects(articles0_0[0])
//
//  // Add an issue to Title 0 0.
//  await convert.convertIssue({
//    article: articles0_0[1],
//    bodySource: '',
//    number: 1,
//    sequelize,
//    titleSource: 'a',
//    user: user0
//  })
//
//  // Check the data each user gets for each article.
//  let rows
//  rows = await sequelize.models.Article.getArticlesInSamePage({
//    sequelize,
//    slug: 'user0/title-0',
//    loggedInUser: user0,
//  })
//  assertRows(rows, [
//    { slug: 'user0/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
//    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true, liked: false },
//    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
//    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
//  ])
//  rows = await sequelize.models.Article.getArticlesInSamePage({
//    sequelize,
//    slug: 'user0/title-0',
//    loggedInUser: user1,
//  })
//  assertRows(rows, [
//    { slug: 'user0/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: true  },
//    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true,  liked: false },
//    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
//    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
//  ])
//  rows = await sequelize.models.Article.getArticlesInSamePage({
//    sequelize,
//    slug: 'user1/title-0',
//    loggedInUser: user0,
//  })
//  assertRows(rows, [
//    { slug: 'user1/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
//    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
//    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
//    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
//  ])
//  rows = await sequelize.models.Article.getArticlesInSamePage({
//    sequelize,
//    slug: 'user1/title-0',
//    loggedInUser: user1,
//  })
//  assertRows(rows, [
//    { slug: 'user1/title-0',     topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
//    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
//    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
//    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
//  ])
//})

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
      test.loginUser(user)

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
        test.loginUser(user1)
        ;({data, status} = await test.webApi.userUpdate('user0', { displayName: 'User 0 hacked 2' }))
        assert.strictEqual(status, 403)
        test.loginUser(user)

        // Admin users can edit other users.
        test.loginUser(user2)
        ;({data, status} = await test.webApi.userUpdate('user0', { displayName: 'User 0 hacked 3' }))
        assertStatus(status, data)
        test.loginUser(user)
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
      test.loginUser(user2)
      ;({data, status} = await test.webApi.user('user1'))
      assertStatus(status, data)
      assertRows([data], [{ email: 'user1@mail.com' }])
      test.loginUser(user)

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
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{ titleRender: 'title 0' }])

    // Create article errors

      // Cannot create article if logged out.
      test.disableToken()
      article = createArticleArg({ i: 1 })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 401)
      test.loginUser()

      // Cannot create article if token is given but wrong.
      test.loginUser('asdfqwer')
      article = createArticleArg({ i: 1 })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 401)
      test.loginUser(user)

      // Recreating an article with POST is not allowed.
      article = createArticleArg({ i: 0, bodySource: 'Body 1' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 422)

      // Wrong field type.
      ;({data, status} = await createArticleApi(test, { titleSource: 1, bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Empty path.
      ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: 'Empty path attempt', bodySource: 'Body 1' }, { path: '' }
      ))
      assert.strictEqual(status, 422)

      // Missing title
      ;({data, status} = await createArticleApi(test, { bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Missing all data.
      ;({data, status} = await createArticleApi(test, {}))
      assert.strictEqual(status, 422)

      // Markup errors.
      ;({data, status} = await createArticleApi(test, {
        titleSource: 'The \\notdefined', bodySource: 'The \\i[body]' }))
      assert.strictEqual(status, 422)
      ;({data, status} = await createArticleApi(test,
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
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0 hacked\./ }])

      ;({data, status} = await test.webApi.article('user0/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 0')
      assert.match(data.render, /Body 0 hacked\./)

      // Undo it for sanity.
      article = createArticleArg({ i: 0, bodySource: 'Body 0.' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0\./ }])

    // Edit index article.

      ;({data, status} = await createOrUpdateArticleApi(test, {
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
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user0'))
      assertStatus(status, data)
      test.loginUser(user)

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
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user0'))
      assert.strictEqual(status, 403)
      test.loginUser(user)

      // Users cannot like their own article.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user1'))
      assert.strictEqual(status, 403)
      test.loginUser(user)

      // Trying to like article that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.loginUser(user)

    // Make user1 unlike one of the articles.

      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleUnlike('user0'))
      assertStatus(status, data)
      test.loginUser(user)

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
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleUnlike('user0'))
      assert.strictEqual(status, 403)
      test.loginUser(user)

      // Trying to like article that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleUnlike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.loginUser(user)

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
      ;({data, status} = await createOrUpdateArticleApi(test, article))
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
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'title 1')
      assert.match(data.render, /Body 2/)

    // User following.

      // user2 follows user0 and user2
      test.loginUser(user2)
      ;({data, status} = await test.webApi.userFollow('user0'))
      assertStatus(status, data)
      ;({data, status} = await test.webApi.userFollow('user2'))
      assertStatus(status, data)
      test.loginUser(user)

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
      test.loginUser(user2)
      ;({data, status} = await test.webApi.userUnfollow('user0'))
      assertStatus(status, data)
      ;({data, status} = await test.webApi.userUnfollow('user2'))
      assertStatus(status, data)
      test.loginUser(user)
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
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      // TODO title-1 would be better here. Lazy to investigate now though.
      // https://github.com/cirosantilli/ourbigbook/issues/283
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
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 3)))
      assertStatus(status, data)
      assert.match(data.issue.titleRender, /The <i>title<\/i> 0 0 3\./)
      assert.match(data.issue.render, /The <i>body<\/i> 0 0 3\./)
      assert.strictEqual(data.issue.number, 4)
      test.loginUser(user)

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

      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueEdit('user1', 1,
        { bodySource: 'The \\i[body] 1 index 0 hacked by user1.' }))
      assert.strictEqual(status, 403)
      test.loginUser(user)

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
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 1))
      assertStatus(status, data)
      test.loginUser(user)

      // Score goes up.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-1', sort: 'score' } ))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./, score: 1 },
        { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./, score: 0 },
      ])

      // Users cannot like issue twice.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 1))
      assert.strictEqual(status, 403)
      test.loginUser(user)

      // Users cannot like their own issue.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueLike('user0/title-0', 4))
      assert.strictEqual(status, 403)
      test.loginUser(user1)

      // Trying to like issue that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueLike('user0/dontexist', 1))
      assert.strictEqual(status, 404)
      ;({data, status} = await test.webApi.issueLike('user0/title-1', 999))
      assert.strictEqual(status, 404)
      test.loginUser(user)

    // Make user1 unlike one of an issues.

      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 1))
      assertStatus(status, data)
      test.loginUser(user)

      // Score goes up.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-1' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./, score: 0 },
        { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./, score: 0 },
      ])

      // Cannot unlike issue twice.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 1))
      assert.strictEqual(status, 403)
      test.loginUser(user)

      // Trying to like article that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.issueUnlike('user0/dontexist', 1))
      assert.strictEqual(status, 404)
      ;({data, status} = await test.webApi.issueUnlike('user0/title-1', 999))
      assert.strictEqual(status, 404)
      test.loginUser(user)

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
      // TODO https://github.com/cirosantilli/ourbigbook/issues/277
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
      test.loginUser(user)

      // Cases where logged out access leads to redirect to signup page.
      async function testRedirIfLoggedOff(cb) {
        test.disableToken()
        let {data, status} = await cb()
        assert.strictEqual(status, 307)
        test.loginUser(user)
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
      test.loginUser(user)
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        routes.userEdit('user1'),
      ))
      assert.strictEqual(status, 404)

      // Admins can see the settings page of other users.
      test.loginUser(user2)
      ;({data, status} = await test.sendJsonHttp(
        'GET',
        routes.userEdit('user1'),
      ))
      assertStatus(status, data)
      test.loginUser(user)
    }
  }, { canTestNext: true })
})

// TODO. Either forbid or allow multiheader. This was working, but
// changed when we started exposing the parentId via API.
//it('api: multiheader file creates multiple articles', async () => {
//  await testApp(async (test) => {
//    let res,
//      data,
//      article
//
//    // Create user.
//    const user = await test.createUserApi(0)
//
//    // Create article.
//    article = createArticleArg({ i: 0, bodySource: `Body 0.
//
//== title 0 0
//
//Body 0 0.
//
//== title 0 1
//
//Body 0 1.
//`})
//    ;({data, status} = await createArticleApi(test, article))
//    assertStatus(status, data)
//    assertRows(data.articles, [
//      { titleRender: 'title 0', slug: 'user0/title-0' },
//      { titleRender: 'title 0 0', slug: 'user0/title-0-0' },
//      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
//    ])
//    assert.match(data.articles[0].render, /Body 0\./)
//    assert.match(data.articles[0].render, /Body 0 0\./)
//    assert.match(data.articles[0].render, /Body 0 1\./)
//    assert.match(data.articles[1].render, /Body 0 0\./)
//    assert.match(data.articles[2].render, /Body 0 1\./)
//
//    // See them on global feed.
//    ;({data, status} = await test.webApi.articles())
//    assertStatus(status, data)
//    sortByKey(data.articles, 'slug')
//    assertRows(data.articles, [
//      { titleRender: 'Index', slug: 'user0' },
//      { titleRender: 'title 0', slug: 'user0/title-0' },
//      { titleRender: 'title 0 0', slug: 'user0/title-0-0' },
//      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
//    ])
//
//    // Access one of the articles directly.
//    ;({data, status} = await test.webApi.article('user0/title-0-0'))
//    assertStatus(status, data)
//    assert.strictEqual(data.titleRender, 'title 0 0')
//    assert.match(data.render, /Body 0 0\./)
//    assert.doesNotMatch(data.render, /Body 0 1\./)
//
//    // Modify the file.
//    article = createArticleArg({ i: 0, bodySource: `Body 0.
//
//== title 0 0 hacked
//
//Body 0 0 hacked.
//
//== title 0 1
//
//Body 0 1.
//`})
//    ;({data, status} = await createOrUpdateArticleApi(test, article))
//    assertStatus(status, data)
//    assertRows(data.articles, [
//      { titleRender: 'title 0', slug: 'user0/title-0' },
//      { titleRender: 'title 0 0 hacked', slug: 'user0/title-0-0-hacked' },
//      { titleRender: 'title 0 1', slug: 'user0/title-0-1' },
//    ])
//    assert.match(data.articles[0].render, /Body 0\./)
//    assert.match(data.articles[0].render, /Body 0 0 hacked\./)
//    assert.match(data.articles[0].render, /Body 0 1\./)
//    assert.match(data.articles[1].render, /Body 0 0 hacked\./)
//    assert.match(data.articles[2].render, /Body 0 1\./)
//
//    // See them on global feed.
//    ;({data, status} = await test.webApi.articles())
//    assertStatus(status, data)
//    sortByKey(data.articles, 'slug')
//    assertRows(data.articles, [
//      { titleRender: 'Index',     slug: 'user0', },
//      { titleRender: 'title 0',   slug: 'user0/title-0',  render: /Body 0 0 hacked\./ },
//      { titleRender: 'title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
//      { titleRender: 'title 0 0 hacked', slug: 'user0/title-0-0-hacked', render: /Body 0 0 hacked\./ },
//      { titleRender: 'title 0 1', slug: 'user0/title-0-1', render: /Body 0 1\./ },
//    ])
//
//    // Topic shows only one subarticle.
//    ;({data, status} = await test.webApi.articles({ topicId: 'title-0-0' }))
//    assertStatus(status, data)
//    sortByKey(data.articles, 'slug')
//    assertRows(data.articles, [
//      { titleRender: 'title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
//    ])
//  })
//})

it('api: resource limits', async () => {
  await testApp(async (test) => {
    let data, status, article

    const user = await test.createUserApi(0)
    const admin = await test.createUserApi(1)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user1' } })
    test.loginUser(user)

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
    test.loginUser(admin)
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
    test.loginUser(user)

    // Article.

      // maxArticleSize resource limit is enforced for non-admins.
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      test.loginUser(user)

      // OK, second article including Index.
      article = createArticleArg({ i: 0, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      // maxArticleSize resource limit is enforced for all users.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 422)

      // Even admin.
      test.loginUser(admin)
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 422)
      test.loginUser(user)

      // OK 2, third article including Index.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      // maxArticles resource limit is enforced for non-admins.
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 403)

      // maxArticles resource limit is enforced for non-admins when creating article with PUT.
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assert.strictEqual(status, 403)

      // OK 2 for admin.
      test.loginUser(admin)
      article = createArticleArg({ i: 1, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      test.loginUser(user)

    // Multiheader articles count as just one article.
    // We forbade multiheader articles at one point. Might be reallowed later on.
//      // Increment article limit by two from 3 to 5. User had 3, so now there are two left.
//      // Also increment article size so we can fit the header in.
//      test.loginUser(admin)
//      ;({data, status} = await test.webApi.userUpdate('user0', {
//        maxArticles: 5,
//        maxArticleSize: 100,
//      }))
//      assertStatus(status, data)
//      test.loginUser(user)
//
//      // This should count as just one, totalling 4.
//      article = createArticleArg({ i: 2, bodySource: `== Title 2 1
//` })
//      ;({data, status} = await createArticleApi(test, article))
//      assertStatus(status, data)
//
//      // So now we can still do one more, totalling 5.
//      article = createArticleArg({ i: 3, bodySource: `abc`})
//      ;({data, status} = await createArticleApi(test, article))
//      assertStatus(status, data)

    // Issue.

      // Change limit to 2 now that we don't have Index.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        maxArticles: 2,
        maxArticleSize: 3,
      }))
      assertStatus(status, data)
      test.loginUser(user)

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abcd' })))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abcd' })))
      assertStatus(status, data)
      test.loginUser(user)

      // OK.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)

      // maxArticleSize resource limit is enforced for all users.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })))
      assert.strictEqual(status, 422)

      // Even admin.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })))
      assert.strictEqual(status, 422)
      test.loginUser(user)

      // OK 2.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })))
      assertStatus(status, data)

      // maxArticles resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assert.strictEqual(status, 403)

      // OK 2 for admin.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      assertStatus(status, data)
      test.loginUser(user)

    // Comment.

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd'))
      assert.strictEqual(status, 403)

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd'))
      assertStatus(status, data)
      test.loginUser(user)

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
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      assertStatus(status, data)
      test.loginUser(user)
  })
})

async function assertNestedSets(sequelize, expect) {
  const articles = await sequelize.models.Article.findAll({ order: [['nestedSetIndex', 'ASC']] })
  //console.error(articles.map(a => [a.nestedSetIndex, a.nestedSetNextSibling, a.slug]));
  assertRows(articles, expect)
}

it('api: article tree', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Article.

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, slug: 'user0' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      // TODO ./ would be better here: https://github.com/cirosantilli/ourbigbook/issues/283
      assert_xpath(xpath_header_parent(1, 'mathematics', '../user0', 'Index'), data.articles[0].h1Render)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'user0/mathematics' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)
      assert_xpath(xpath_header_parent(1, 'calculus', '../user0/mathematics', 'Mathematics'), data.articles[0].h1Render)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, slug: 'user0/calculus' },
      ])

      // It is possible to change a parent ID.

        // Create a new test ID.
        article = createArticleArg({ i: 0, titleSource: 'Derivative' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assertStatus(status, data)
        assert_xpath(xpath_header_parent(1, 'derivative', '../user0/mathematics', 'Mathematics'), data.articles[0].h1Render)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Derivative
        //    * 2 Calculus

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 4, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, slug: 'user0/derivative' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, slug: 'user0/calculus' },
        ])

        // Modify its parent.
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
        assertStatus(status, data)
        assert_xpath(xpath_header_parent(1, 'derivative', '../user0/calculus', 'Calculus'), data.articles[0].h1Render)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Derivative

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 4, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, slug: 'user0/derivative' },
        ])

      // parentId errors

        // Parent ID that doesn't exist gives an error on new article.
        article = createArticleArg({ i: 0, titleSource: 'Physics' })
        ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/dontexist' }))
        assert.strictEqual(status, 422)

        // Parent ID that doesn't exist gives an error on existing article.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/dontexist' }))
        assert.strictEqual(status, 422)

        // It is not possible to change the index parentId.
        article = createArticleArg({ i: 0, titleSource: 'Index' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assert.strictEqual(status, 422)

        // It it not possible to set the parentId to an article of another user.
        article = createArticleArg({ i: 0, titleSource: 'Physics' })
        ;({data, status} = await createArticleApi(test, article, { parentId: '@user1' }))
        assert.strictEqual(status, 422)

        // Circular parent loops fail gracefully.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
        assert.strictEqual(status, 422)
        // This is where it might go infinite if it hadn't been prevented above.
        article = createArticleArg({ i: 0, titleSource: 'Calculus' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assertStatus(status, data)

        // Circular parent loops to self fail gracefully.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assert.strictEqual(status, 422)

      // previousSiblingId

        // Also add \\Image here, as we once had a bug where non header children were messing up the header tree
        article = createArticleArg({ i: 0, titleSource: 'Integral', bodySource: '\\Image[http://example.com]{title=My image}\n' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus', previousSiblingId: '@user0/derivative' }))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Derivative
        //      * 3 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 5, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 5, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 5, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, slug: 'user0/integral' },
        ])

        // Refresh the parent index to show this new child.
        // TODO do this on the fly during GET.
        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/mathematics' and @data-test='0' and text()='Mathematics']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/calculus'    and @data-test='1' and text()='Calculus']",    data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative'  and @data-test='2' and text()='Derivative']",  data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'    and @data-test='3' and text()='Integral']",    data.articles[0].render)

        // Add another one, and update it a few times.
        // Empty goes first.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/calculus' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Limit
        //      * 3 Derivative
        //      * 4 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 6, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 6, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, slug: 'user0/integral' },
        ])

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='3' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='4' and text()='Integral']",   data.articles[0].render)

        // Add some children to limit as we will be moving it around a bit,
        // and want to ensure that the children move with it.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit of a function' }),
          { parentId: '@user0/limit' }
        ))
        assertStatus(status, data)
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit of a sequence' }),
          { parentId: '@user0/limit' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Limit
        //        * 3 Limit of a sequence
        //        * 4 Limit of a function
        //      * 5 Derivative
        //      * 6 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, slug: 'user0/integral' },
        ])

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='3' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='4' and text()='Limit of a function']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='5' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)

        // Move Limit up. Give a parentId as well as sibling. This is not necessary.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/calculus', previousSiblingId: '@user0/integral' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Derivative
        //      * 3 Integral
        //      * 4 Limit
        //        * 5 Limit of a sequence
        //        * 6 Limit of a function

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, slug: 'user0/integral' },
          { nestedSetIndex: 5, nestedSetNextSibling: 8, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 4, slug: 'user0/limit-of-a-function' },
        ])

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='2' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='3' and text()='Integral']",   data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='4' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='5' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='6' and text()='Limit of a function']", data.articles[0].render)

        // Move Limit down. Don't give parentId on an update. Parent will be derived from sibling.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: undefined, previousSiblingId: '@user0/derivative' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Derivative
        //      * 3 Limit
        //        * 4 Limit of a sequence
        //        * 5 Limit of a function
        //      * 6 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 7, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 4, slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, slug: 'user0/integral' },
        ])

        // Move limit to before ancestor to check that nested set doesn't blow up.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/mathematics', previousSiblingId: undefined }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * Mathematics
        //    * Limit
        //      * Limit of a sequence
        //      * Limit of a function
        //    * Calculus
        //      * Derivative
        //      * Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 5, slug: 'user0/limit' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 5, nestedSetNextSibling: 8, slug: 'user0/calculus' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, slug: 'user0/integral' },
        ])

        // Move limit back to where it was.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: undefined, previousSiblingId: '@user0/derivative' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Derivative
        //      * 3 Limit
        //        * 4 Limit of a sequence
        //        * 5 Limit of a function
        //      * 6 Integral

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='2' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='3' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='4' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='5' and text()='Limit of a function']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)

        // Move back to first by not giving previousSiblingId. previousSiblingId is not maintained like most updated properties.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: undefined }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Limit
        //        * 3 Limit of a sequence
        //        * 4 Limit of a function
        //      * 5 Derivative
        //      * 6 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, slug: 'user0/integral' },
        ])

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='3' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='4' and text()='Limit of a function']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='5' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)

        // Deduce parentId from previousSiblingid on new article.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Measure' }),
          { parentId: undefined, previousSiblingId: '@user0/integral' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * Index
        //  * 0 Mathematics
        //    * 1 Calculus
        //      * 2 Limit
        //        * 3 Limit of a sequence
        //        * 4 Limit of a function
        //      * 5 Derivative
        //      * 6 Integral
        //      * 7 Measure

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 9, depth: 0, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 9, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 9, depth: 2, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, slug: 'user0/integral' },
          { nestedSetIndex: 8, nestedSetNextSibling: 9, depth: 3, slug: 'user0/measure' },
        ])

        ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, titleSource: 'Index' })))
        assertStatus(status, data)
        // TODO restore toc asserts.
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='3' and text()='Limit of a sequence']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='4' and text()='Limit of a function']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='5' and text()='Derivative']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/measure'    and @data-test='7' and text()='Measure']",    data.articles[0].render)

        // Refresh Mathematics to show the source ToC.
        // Add a reference to the article self: we once had a bug where this was preventing the ToC from showing.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'I like <mathematics>.' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0' }))
        assertStatus(status, data)
        // TODO restore toc asserts.
        // assert_xpath("//*[@id='toc']//x:a[@href='../user0/calculus' and @data-test='0' and text()='Calculus']", data.articles[0].render)

      // Article.getArticle includeParentAndPreviousSibling argument test.
      // Used on editor only for now, so a bit hard to test on UI. But this tests the crux MEGAJOIN just fine.

        // First sibling.
        article = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: 'user0/limit',
        })
        assert.strictEqual(article.parentId.idid, '@user0/calculus')
        assert.strictEqual(article.previousSiblingId, undefined)

        // Not first sibling.
        article = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: 'user0/derivative',
        })
        assert.strictEqual(article.parentId.idid, '@user0/calculus')
        assert.strictEqual(article.previousSiblingId.idid,  '@user0/limit')

        // Index.
        article = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: 'user0',
        })
        assert.strictEqual(article.parentId, undefined)
        assert.strictEqual(article.previousSiblingId,  undefined)

        // Hopefully the above tests would have caught any wrong to_id_index issues, but just in case.
        const refs = await sequelize.models.Ref.findAll({
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
          include: [
            {
              model: sequelize.models.Id,
              as: 'to',
              where: {
                macro_name: ourbigbook.Macro.HEADER_MACRO_NAME,
              },
            },
          ],
          order: [
            ['from_id', 'ASC'],
            ['to_id_index', 'ASC'],
            ['to_id', 'ASC'],
          ],
        })
        assertRows(refs, [
          { from_id: '@user0',             to_id: '@user0/mathematics', to_id_index: 0, },
          { from_id: '@user0/calculus',    to_id: '@user0/limit',       to_id_index: 0, },
          { from_id: '@user0/calculus',    to_id: '@user0/derivative',  to_id_index: 1, },
          { from_id: '@user0/calculus',    to_id: '@user0/integral',    to_id_index: 2, },
          { from_id: '@user0/calculus',    to_id: '@user0/measure',     to_id_index: 3, },
          { from_id: '@user0/limit',       to_id: '@user0/limit-of-a-sequence', to_id_index: 0, },
          { from_id: '@user0/limit',       to_id: '@user0/limit-of-a-function', to_id_index: 1, },
          { from_id: '@user0/mathematics', to_id: '@user0/calculus',    to_id_index: 0, },
        ])
        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 9, depth: 0, slug: 'user0',                     },
          { nestedSetIndex: 1, nestedSetNextSibling: 9, depth: 1, slug: 'user0/mathematics',         },
          { nestedSetIndex: 2, nestedSetNextSibling: 9, depth: 2, slug: 'user0/calculus',            },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, slug: 'user0/limit',               },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, slug: 'user0/limit-of-a-sequence', },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, slug: 'user0/limit-of-a-function', },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, slug: 'user0/derivative',          },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, slug: 'user0/integral',            },
          { nestedSetIndex: 8, nestedSetNextSibling: 9, depth: 3, slug: 'user0/measure',             },
        ])

      // previousSiblingId errors

        // previousSiblingId that does not exist fails
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: undefined, previousSiblingId: '@user0/dontexist' }
        ))
        assert.strictEqual(status, 422)

        // previousSiblingId empty string fails
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: undefined, previousSiblingId: '' }
        ))
        assert.strictEqual(status, 422)

        // previousSiblingId that is not a child of parentId fails
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/mathematics', previousSiblingId: '@user0/derivative' }
        ))
        assert.strictEqual(status, 422)

      // Forbidden elements

        // Cannot use Include on web.
        article = createArticleArg({ i: 0, titleSource: 'Physics', bodySource: `\\Include[mathematics]` })
        ;({data, status} = await createArticleApi(test, article))
        assert.strictEqual(status, 422)

        // Cannot have multiple headers per article on web.
        article = createArticleArg({ i: 0, titleSource: 'Physics', bodySource: `== Mechanics` })
        ;({data, status} = await createArticleApi(test, article))
        assert.strictEqual(status, 422)
  })
})
