const assert = require('assert');

const { WebApi } = require('ourbigbook/web_api')
const {
  assert_xpath
} = require('ourbigbook/test_lib')
const ourbigbook = require('ourbigbook')

const app = require('./app')
const config = require('./front/config')
const routes = require('./front/routes')
const convert = require('./convert')
const models = require('./models')
const test_lib = require('./test_lib')
const { AUTH_COOKIE_NAME } = require('./front/js')

const web_api = require('ourbigbook/web_api');
const { QUERY_TRUE_VAL } = web_api

const testNext = process.env.OURBIGBOOK_TEST_NEXT === 'true'

async function assertNestedSets(sequelize, expects) {
  const articles = await sequelize.models.Article.treeFindInOrder({
    includeNulls: true,
    refs: true
  })
  let i = 0
  const articleObjs = []
  for (const article of articles) {
    const expect = expects[i]
    const articleObj = {}
    for (const key in expect) {
      if (key !== 'to_id_index') {
        articleObj[key] = article.get(key)
      }
    }
    const ref = article.file.toplevelId
    let to_id_index, parentId
    if (ref === null) {
      to_id_index = null
      parentId = null
    } else {
      const tos = ref.to
      assert.strictEqual(tos.length, 1)
      to_id_index = tos[0].to_id_index
      parentId = tos[0].from_id
    }
    articleObj.to_id_index = to_id_index
    articleObj.parentId = parentId
    articleObjs.push(articleObj)
    i++
  }
  assertRows(
    articleObjs,
    expects,
    {
      msgFn: () => 'actual:\nnestedSetIndex, nestedSetNextSibling, depth, to_id_index, slug, parentId\n' +
        articleObjs.map(a => `${a.nestedSetIndex}, ${a.nestedSetNextSibling}, ${a.depth}, ${a.to_id_index}, ${a.slug}, ${a.parentId}`).join('\n')
    }
  )
}

function assertRows(rows, rowsExpect, opts={}) {
  const msgFn = opts.msgFn
  assert.strictEqual(rows.length, rowsExpect.length, `wrong number of rows: ${rows.length}, expected: ${rowsExpect.length}`)
  function printMsg(i, key) {
    if (msgFn) console.error(msgFn())
    console.error({ i, key })
  }
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
        if (!val.match(expect)) {
          printMsg(i, key)
        }
        assert.match(val, expect)
      } else {
        if (typeof expect === 'function') {
          if (!expect(val)) {
            printMsg(i, key)
            assert(false)
          }
        } else {
          if (val !== expect) {
            printMsg(i, key)
          }
          assert.strictEqual(val, expect)
        }
      }
    }
  }
}

// assertRows helpers.
const ne = (expect) => (v) => v !== expect

async function assertNestedSetsMultiuser(sequelize, users, rows) {
  const newRows = []
  for (const user of users) {
    for (const row of rows) {
      const slug = row.slug
      let sep
      if (slug) {
        sep = '/'
      } else {
        sep = ''
      }
      const newRow = Object.assign({}, row)
      newRow.slug = user.username + sep + slug
      newRows.push(newRow)
    }
  }
  return assertNestedSets(sequelize, newRows)
}

// 200 status assertion helper that also prints the data to help
// quickly see what the error is about.
function assertStatus(status, data) {
  if (status !== 200) {
    console.error(require('util').inspect(data));
    assert.strictEqual(status, 200)
  }
}

async function createArticleApi(test, article, opts={}) {
  if (!opts.hasOwnProperty('parentId') && test.user) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreate(article, opts)
}

async function createOrUpdateArticleApi(test, article, opts={}) {
  if (
    !opts.hasOwnProperty('parentId') &&
    test.user &&
    // This is just a heuristic to detect index editing. Index can also be achieved e.g. with {id=},
    // but let's KISS it for now.
    article.titleSource !== ''
  ) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreateOrUpdate(article, opts)
}

async function createArticles(sequelize, author, opts) {
  const articleArg = createArticleArg(opts, author)
  const { articles } = await convert.convertArticle({
    author,
    bodySource: articleArg.bodySource,
    path: opts.path,
    parentId: articleArg.parentId || `${ourbigbook.AT_MENTION_CHAR}${author.username}`,
    sequelize,
    titleSource: articleArg.titleSource,
  })
  return articles
}

async function createArticle(sequelize, author, opts) {
  return (await createArticles(sequelize, author, opts))[0]
}

function createArticleArg(opts, author) {
  const i = opts.i
  const ret = {}
  if (opts.hasOwnProperty('titleSource')) {
    ret.titleSource = opts.titleSource
  } else {
    ret.titleSource = `Title ${i}`
  }
  if (opts.hasOwnProperty('bodySource')) {
    ret.bodySource = opts.bodySource
  }  else {
    ret.bodySource = `Body ${i}\.`
  }
  if (author) {
    ret.authorId = author.id
  }
  ret.parentId = opts.parentId
  return ret
}

async function createArticleApiMultiuser(test, users, articleArg, meta={}) {
  for (const user of users) {
    test.loginUser(user)
    const parentId = meta.parentId
    const newMeta = Object.assign({}, meta)
    if (parentId) {
      newMeta.parentId = `@${user.username}/${parentId}`
    }
    ;({data, status} = await createArticleApi(test, articleArg, newMeta))
    assertStatus(status, data)
  }
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
  return app.start(0, canTestNext && testNext, async (server, sequelize, app) => {
    const test = {
      app,
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
  assert.strictEqual(rows[0].titleRender, 'Title 0')
  assert.strictEqual(rows[0].file.authorId, user3.id)
  assert.strictEqual(rows[1].titleRender, 'Title 3')
  assert.strictEqual(rows[1].file.authorId, user1.id)
  assert.strictEqual(rows[2].titleRender, 'Title 2')
  assert.strictEqual(rows[2].file.authorId, user1.id)
  assert.strictEqual(rows.length, 3)
  // 6 manually from all follows + 2 for the automatically created indexes.
  assert.strictEqual(count, 8)
})

it('Article.getArticlesInSamePage', async function test_Article__getArticlesInSamePage() {
  let rows
  let article_0_0, article_0_0_0, article_1_0, article
  const sequelize = this.test.sequelize
  const { Article } = sequelize.models
  const user0 = await createUser(sequelize, 0)
  const user1 = await createUser(sequelize, 1)

  // Create some articles.
  await createArticle(sequelize, user0, { titleSource: 'Title 0' })
  await createArticle(sequelize, user0, { titleSource: 'Title 0 1', parentId: '@user0/title-0' })
  await createArticle(sequelize, user0, {
    titleSource: 'Title 0 0',
    parentId: '@user0/title-0',
    bodySource: '{tag=Title 0 1}\n'
  })
  await createArticle(sequelize, user0, { titleSource: 'Title 0 0 0', parentId: '@user0/title-0-0'  })

  // Single user tests.
  article = await Article.getArticle({ sequelize, slug: 'user0/title-0' })
  rows = await Article.getArticlesInSamePage({
    article,
    getTagged: true,
    loggedInUser: user0,
    sequelize,
  })
  assertRows(rows, [
    { slug: 'user0/title-0-0',   topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])
  assertRows(rows[2].taggedArticles, [
    { slug: 'user0/title-0-0' },
  ])

  // Hidden articles don't show by default.
  await Article.update({ list: false }, { where: { slug: 'user0/title-0-0' } })
  article = await Article.getArticle({ sequelize, slug: 'user0/title-0' })
  rows = await Article.getArticlesInSamePage({ sequelize, article, loggedInUser: user0, list: true })
  assertRows(rows, [
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])
  await Article.update({ list: true }, { where: { slug: 'user0/title-0-0' } })
  article = await Article.getArticle({ sequelize, slug: 'user0/title-0' })

  rows = await Article.getArticlesInSamePage({ sequelize, article, loggedInUser: user0, h1: true })
  assertRows(rows, [
    { slug: 'user0/title-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])

  article = await Article.getArticle({ sequelize, slug: 'user0/title-0-0' })
  rows = await Article.getArticlesInSamePage({ sequelize, article, loggedInUser: user0 })
  assertRows(rows, [
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])

  article = await Article.getArticle({ sequelize, slug: 'user0/title-0-0-0' })
  rows = await Article.getArticlesInSamePage({ sequelize, article, loggedInUser: user0 })
  assertRows(rows, [])

  await createArticle(sequelize, user1, { titleSource: 'Title 0' })
  await createArticle(sequelize, user1, { titleSource: 'Title 0 1', parentId: '@user1/title-0' })
  await createArticle(sequelize, user1, { titleSource: 'Title 0 1 0', parentId: '@user1/title-0-1' })
  await createArticle(sequelize, user1, { titleSource: 'Title 0 0', parentId: '@user1/title-0' })

  // We have to refetch here because the counts involved are changed by other articles/issues/likes.
  article_0_0 = await Article.getArticle({ sequelize, slug: 'user0/title-0' })
  article_0_0_0 = await Article.getArticle({ sequelize, slug: 'user0/title-0-0' })
  article_1_0 = await Article.getArticle({ sequelize, slug: 'user1/title-0' })

  // User1 likes user0/title-0-0
  await user1.addArticleLikeSideEffects(article_0_0_0)

  // Add an issue to Title 0 0 0.
  await convert.convertIssue({
    article: article_0_0_0,
    bodySource: '',
    number: 1,
    sequelize,
    titleSource: 'a',
    user: user0
  })

  // Multi user tests.
  rows = await Article.getArticlesInSamePage({
    sequelize,
    article: article_0_0,
    loggedInUser: user0,
  })
  assertRows(rows, [
    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
  ])
  rows = await Article.getArticlesInSamePage({
    sequelize,
    article: article_0_0,
    loggedInUser: user1,
  })
  assertRows(rows, [
    { slug: 'user0/title-0-0',   topicCount: 2, issueCount: 1, hasSameTopic: true,  liked: true },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
  ])
  rows = await Article.getArticlesInSamePage({
    sequelize,
    article: article_1_0,
    loggedInUser: user0,
  })
  assertRows(rows, [
    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true,  liked: false },
    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
  ])
  rows = await Article.getArticlesInSamePage({
    sequelize,
    article: article_1_0,
    loggedInUser: user1,
  })
  assertRows(rows, [
    { slug: 'user1/title-0-0',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user1/title-0-1',   topicCount: 2, issueCount: 0, hasSameTopic: true, liked: false },
    { slug: 'user1/title-0-1-0', topicCount: 1, issueCount: 0, hasSameTopic: true, liked: false },
  ])
})

it('Article.rerender', async function() {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Create articles

      article = createArticleArg({
        i: 0,
        titleSource: 'Mathematics',
        // We had some predefined ourbigbook KaTeX macro issues in the past.
        bodySource: `$$
\\abs{x}
$$
`,
      })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Physics' })
      ;({data, status} = await createArticleApi(test, article, { previousSiblingId: '@user0/mathematics' }))
      assertStatus(status, data)
      const physicsHash = data.articles[0].file.hash

      // Sanity check.
      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
      ])

    // Rerender does not set previousSibligId to undefined (thus moving article as first child).
    await sequelize.models.Article.rerender({ slugs: ['user0/physics'] })
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
    ])

    // Rerender does not modify the article hash. Was happening because we were calculating hash
    // with previousSiblingId undefined https://github.com/ourbigbook/ourbigbook/issues/322
    ;({data, status} = await test.webApi.article('user0/physics'))
    assertStatus(status, data)
    assert.strictEqual(physicsHash, data.file.hash)

    // Works with OurBigBook predefined macros.
    await sequelize.models.Article.rerender({ slugs: ['user0/mathematics'] })
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
    ])

    // Works for root article.
    await sequelize.models.Article.rerender({ slugs: ['user0'] })
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
    ])
  })
})

it('normalize nested-set', async function() {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Create articles

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Physics' })
      ;({data, status} = await createArticleApi(test, article, { previousSiblingId: '@user0/mathematics' }))
      assertStatus(status, data)

    // The nested-set for the API is correctly normalized.
    await models.normalize({
      check: true,
      sequelize,
      whats: ['nested-set'],
    })
  })
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
      // TODO https://github.com/ourbigbook/ourbigbook/issues/268
      // Once the above is fixed, this will likely just be allowed on dev mode and then
      // we will just remove this test.
      ;({data, status} = await test.webApi.userUpdate('user0', { email: 'user0hacked@mail.com' }))
      assert.strictEqual(status, 422)

    // Create article in one go

      article = createArticleArg({ i: 0 })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{
        // New articles are listed by default.
        list: true,
        titleRender: 'Title 0',
      }])

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

      // Missing title and no path existing article to take it from
      ;({data, status} = await createArticleApi(test, { bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Newline in title
      ;({data, status} = await createArticleApi(test, { titleSource: 'a\nb', bodySource: 'Body 1' }))
      assert.strictEqual(status, 422)

      // Newline in literal in title
      ;({data, status} = await createArticleApi(test, {
        titleSource: 'a `',
        bodySource: '` b'
      }))
      assert.strictEqual(status, 422)

      // Title ending in backslash is an error because it adds newline to shorthand header
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
        titleSource: 'ab\\',
        bodySource: 'cd',
      })))
      assert.strictEqual(status, 422)

      // Missing all data and no path to existing article to take it from
      ;({data, status} = await createArticleApi(test, {}))
      assert.strictEqual(status, 422)

      // Missing data, has path to existing article, but is not render.
      // Doesn't make sense as no changes can come from this.
      ;({data, status} = await createArticleApi(test, {}, { path: 'title-0' }))
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
      assert.strictEqual(data.titleRender, 'Title 0')
      assert.strictEqual(data.titleSource, 'Title 0')
      assert.match(data.render, /Body 0\./)

      // See articles on global feed.

      ;({data, status} = await test.webApi.articles())
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'Title 0', slug: 'user0/title-0', render: /Body 0/ },
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user2' },
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user1' },
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user0' },
      ])

      // See latest articles by a user.

      ;({data, status} = await test.webApi.articles({ author: 'user0' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: 'Title 0', slug: 'user0/title-0', render: /Body 0/ },
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user0' },
      ])

    // Edit article.

      article = createArticleArg({ i: 0, bodySource: 'Body 0 hacked.' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0 hacked\./ }])

      ;({data, status} = await test.webApi.article('user0/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Title 0')
      assert.match(data.render, /Body 0 hacked\./)

      // Undo it for test sanity.
      article = createArticleArg({ i: 0 })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Body 0\./ }])

      // Edit article with render: false followed by render: true without parameters.
      // Take bodySource parameter from the database state of the previous render: false.

        // render: false
        article = createArticleArg({ i: 0, bodySource: 'Body 0 hacked.' })
        ;({data, status} = await createOrUpdateArticleApi(test,
          article,
          { path: 'title-0', render: false }
        ))
        assertStatus(status, data)
        // Maybe we could return the pre-existing article here.
        assertRows(data.articles, [])

        // Also take this chance to check that /hash renderOutdated is correct.
        ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
        assertStatus(status, data)
        assertRows(data.articles, [
          { path: '@user0/index.bigb',   renderOutdated: false, },
          { path: '@user0/title-0.bigb', renderOutdated: true,  },
        ])

        // render: true
        article = createArticleArg({ i: 0, bodySource: undefined })
        ;({data, status} = await createOrUpdateArticleApi(test,
          article,
          { path: 'title-0', render: true }
        ))
        assertStatus(status, data)
        assertRows(data.articles, [{ render: /Body 0 hacked\./ }])

        // And now not outdated after render.
        ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
        assertStatus(status, data)
        assertRows(data.articles, [
          { path: '@user0/index.bigb',   renderOutdated: false, },
          { path: '@user0/title-0.bigb', renderOutdated: false,  },
        ])

        // Undo it for test sanity.
        article = createArticleArg({ i: 0 })
        ;({data, status} = await createOrUpdateArticleApi(test, article))
        assertStatus(status, data)
        assertRows(data.articles, [{ render: /Body 0\./ }])

    // Edit index article.

      ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: '',
        bodySource: `{id=}

Welcome to my home page hacked!
`
      }))
      assertStatus(status, data)
      assertRows(data.articles, [{ render: /Welcome to my home page hacked!/ }])

      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, ourbigbook.HTML_HOME_MARKER)
      assert.match(data.render, /Welcome to my home page hacked!/)

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
      assert.strictEqual(articles[0].titleRender, 'Title 1')
      assert.strictEqual(articles.length, 1)

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Title 1')
      assert.match(data.render, /Body 1/)

      // Update article with PUT.
      article = createArticleArg({ i: 1, bodySource: 'Body 2' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)

      // Access the article directly
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Title 1')
      assert.match(data.render, /Body 2/)

    // User following.

      // user2 follows user0
      test.loginUser(user2)
      ;({data, status} = await test.webApi.userFollow('user0'))
      assertStatus(status, data)

      // Follower count increases.
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.followerCount, 1)

      // user2 follows user2
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

      // user2 unfollows user0
      test.loginUser(user2)
      ;({data, status} = await test.webApi.userUnfollow('user0'))
      assertStatus(status, data)

      // Follower count decreases.
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.followerCount, 0)

      // user0 unfollows user2
      ;({data, status} = await test.webApi.userUnfollow('user2'))
      assertStatus(status, data)
      test.loginUser(user)

      // user0 unfollows user1
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
      // https://github.com/ourbigbook/ourbigbook/issues/283
      assert_xpath("//x:a[@href='/user0/title-1' and text()='Title 1']", data.articles[0].render)

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

      // Issue with empty ID is fine unlike article.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', { titleSource: '.' }))
      assertStatus(status, data)

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

      // Get one issue.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-0' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 5, titleRender: /\./ },
        { number: 4, titleRender: /The <i>title<\/i> 0 0 3\./ },
        { number: 3, titleRender: /The <i>title<\/i> 0 0 2\./ },
        { number: 2, titleRender: /The <i>title<\/i> 0 0 1\./ },
        { number: 1, titleRender: /The <i>title<\/i> 0 0 0\./ },
      ])

      // Article issue count increments when new issues are created.
      ;({data, status} = await test.webApi.article('user0/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.issueCount, 5)

      // Get another issue.
      ;({data, status} = await test.webApi.issues({ id: 'user0/title-1' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 2, titleRender: /The <i>title<\/i> 0 1 1\./ },
        { number: 1, titleRender: /The <i>title<\/i> 0 1 0\./ },
      ])

      // Article issue count increments when new issues are created.
      ;({data, status} = await test.webApi.article('user0/title-1'))
      assertStatus(status, data)
      assert.strictEqual(data.issueCount, 2)

      // Get an index page issue.
      ;({data, status} = await test.webApi.issues({ id: 'user0' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 1, titleRender: /The <i>title<\/i> 0 index 0\./ },
      ])

      // Article issue count increments when new issues are created.
      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.issueCount, 1)

      // Get another index page issue.
      ;({data, status} = await test.webApi.issues({ id: 'user1' }))
      assertStatus(status, data)
      assertRows(data.issues, [
        { number: 1, titleRender: /The <i>title<\/i> 1 index 0\./ },
      ])

      // Article issue count increments when new issues are created.
      ;({data, status} = await test.webApi.article('user1'))
      assertStatus(status, data)
      assert.strictEqual(data.issueCount, 1)

      // Getting issues from an article that doesn't exist fails gracefully.
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
      assert_xpath("//x:a[@href='/user0/title-1' and text()='Title 1']", data.issue.render)

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

      // Get all comments in article.
      ;({data, status} = await test.webApi.comments('user0/title-0', 1))
      assertStatus(status, data)
      assertRows(data.comments, [
        { number: 1, render: /The <i>body<\/i> 0 0 0\./ },
        { number: 2, render: /The <i>body<\/i> 0 0 1\./ },
      ])

      // Get one comment in article
      ;({data, status} = await test.webApi.comment('user0/title-0', 1, 1))
      assertStatus(status, data)
      assertRows([data], [
        { number: 1, render: /The <i>body<\/i> 0 0 0\./ },
      ])

      // Get another comment in article
      ;({data, status} = await test.webApi.comment('user0/title-0', 1, 2))
      assertStatus(status, data)
      assertRows([data], [
        { number: 2, render: /The <i>body<\/i> 0 0 1\./ },
      ])

      // Getting a comment that doesn't exist fails gracefully.
      ;({data, status} = await test.webApi.comment('user0/title-0', 1, 3))
      assert.strictEqual(status, 404)

      // The issue comment count goes up with comment creation.
      ;({data, status} = await test.webApi.issue('user0/title-0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.commentCount, 2)

      // Get all comments in another article
      ;({data, status} = await test.webApi.comments('user0/title-0', 2))
      assertRows(data.comments, [
        { number: 1, render: /The <i>body<\/i> 0 1 0\./ },
      ])

      // The issue comment count goes up with comment creation.
      ;({data, status} = await test.webApi.issue('user0/title-0', 2))
      assertStatus(status, data)
      assert.strictEqual(data.commentCount, 1)

      // Getting comments from articles or issues that don't exist fails gracefully.
      ;({data, status} = await test.webApi.comments('user0/title-1', 999))
      assert.strictEqual(status, 404)
      ;({data, status} = await test.webApi.comments('user0/dontexist', 1))
      assert.strictEqual(status, 404)

    // Delete comment

      // Non-admin users cannot delete comments.
      ;({data, status} = await test.webApi.commentDelete('user0/title-0', 1, 1))
      assert.strictEqual(status, 403)

      // Trying to delete a comment that doesn't exist fails gracefully.
      test.loginUser(user2)
      ;({data, status} = await test.webApi.commentDelete('user0/title-0', 1, 3))
      assert.strictEqual(status, 404)
      test.loginUser(user)

      // Admin can delete comments.
      test.loginUser(user2)
      ;({data, status} = await test.webApi.commentDelete('user0/title-0', 1, 1))
      assert.strictEqual(status, 204)
      test.loginUser(user)

      // The issue comment count goes down with comment deletion.
      ;({data, status} = await test.webApi.issue('user0/title-0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.commentCount, 1)

      // The deleted comment is no longer visible
      ;({data, status} = await test.webApi.comment('user0/title-0', 1, 1))
      assert.strictEqual(status, 404)

    // No more comment index gets from now on.

      // Link to article by comment author.
      // https://github.com/ourbigbook/ourbigbook/issues/277
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, '<Title 1>'))
      assertStatus(status, data)
      assert_xpath("//x:a[@href='/user0/title-1' and text()='Title 1']", data.comment.render)

    if (testNext) {
      // Tests with the same result for logged in or off.
      async function testNextLoggedInOrOff(loggedInUser) {
        // Index.
        ;({data, status} = await test.sendJsonHttp('GET', routes.home(), ))
        assertStatus(status, data)

        // Articles
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles(), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles({ sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles({ sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles({ sort: 'score' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles({ sort: 'follower-count' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articles({ sort: 'issues' }), ))
        assertStatus(status, data)

        // Article
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/title-0'), ))
        assertStatus(status, data)
        // Article that doesn't exist.
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/dontexist'), ))
        assert.strictEqual(status, 404)

        // Article issues
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0', { sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0', { sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0', { sort: 'score' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0', { sort: 'follower-count' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/title-0', { sort: 'comments' }), ))
        assertStatus(status, data)

        // Article links
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesChildren('user0', ''), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesChildren('user0', 'title-0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesIncoming('user0', ''), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesIncoming('user0', 'title-0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesTagged('user0', ''), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesTagged('user0', 'title-0'), ))
        assertStatus(status, data)

        // Issues
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues(), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues({ sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues({ sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues({ sort: 'score' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues({ sort: 'follower-count' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.issues({ sort: 'comments' }), ))
        assertStatus(status, data)

        // Issue
        ;({data, status} = await test.sendJsonHttp('GET', routes.issue('user0/title-0', 1), ))
        assertStatus(status, data)
        // An issue that doesn't exist.
        ;({data, status} = await test.sendJsonHttp('GET', routes.issue('user0/title-0', 999), ))
        assert.strictEqual(status, 404)

        // Topics
        ;({data, status} = await test.sendJsonHttp('GET', routes.topics({ loggedInUser }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.topics({ loggedInUser, sort: 'article-count' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.topics({ loggedInUser, sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.topics({ loggedInUser, sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.topics({ loggedInUser, sort: 'score' }), ))
        assert.strictEqual(status, 422)

        // Topic
        ;({data, status} = await test.sendJsonHttp('GET', routes.topic('title-0'), ))
        assertStatus(status, data)
        // Empty topic.
        ;({data, status} = await test.sendJsonHttp('GET', routes.topic('dontexist'), ))
        assertStatus(status, data)

        // Comments
        ;({data, status} = await test.sendJsonHttp('GET', routes.comments(), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.comments({ sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.comments({ sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.comments({ sort: 'score' }), ))
        assert.strictEqual(status, 422)

        // Users
        ;({data, status} = await test.sendJsonHttp('GET', routes.users(), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.users({ sort: 'created' }), ))
        assertStatus(status, data)
        // Users sort by updated not allowed. Feels weird given all private data?
        ;({data, status} = await test.sendJsonHttp('GET', routes.users({ sort: 'updated' }), ))
        assert.strictEqual(status, 422)
        ;({data, status} = await test.sendJsonHttp('GET', routes.users({ sort: 'score' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.users({ sort: 'username' }), ))
        assertStatus(status, data)

        // User
        ;({data, status} = await test.sendJsonHttp('GET', routes.user('user0'), ))
        assertStatus(status, data)
        // User that doesn't exist.
        ;({data, status} = await test.sendJsonHttp('GET', routes.user('dontexist'), ))
        assert.strictEqual(status, 404)

        // User articles
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticles('user0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticles('user0', { sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticles('user0', { sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticles('user0', { sort: 'score' }), ))
        assertStatus(status, data)

        // User liked
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLiked('user0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLiked('user0', { sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLiked('user0', { sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLiked('user0', { sort: 'score' }), ))
        assert.strictEqual(status, 422)

        // User likes
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLikes('user0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLikes('user0', { sort: 'created' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLikes('user0', { sort: 'updated' }), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userLikes('user0', { sort: 'score' }), ))
        assert.strictEqual(status, 422)

        // User follows
        ;({data, status} = await test.sendJsonHttp('GET', routes.userFollows('user0'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userFollowed('user0'), ))
        assertStatus(status, data)
      }

      // Logged in.
      await testNextLoggedInOrOff(true)

      // Logged out.
      test.disableToken()
      await testNextLoggedInOrOff(false)
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
      await testRedirIfLoggedOff(async () => test.sendJsonHttp( 'GET', routes.articleNew(), ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp( 'GET', routes.articleEdit('user0/title-0'), ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp( 'GET', routes.issueNew('user0/title-0'), ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp( 'GET', routes.issueEdit('user0/title-0', 1), ))
      await testRedirIfLoggedOff(async () => test.sendJsonHttp( 'GET', routes.userEdit('user0'), ))

      // Non admins cannot see the settings page of other users.
      test.loginUser(user)
      ;({data, status} = await test.sendJsonHttp( 'GET', routes.userEdit('user1'), ))
      assert.strictEqual(status, 404)

      // Admins can see the settings page of other users.
      test.loginUser(user2)
      ;({data, status} = await test.sendJsonHttp( 'GET', routes.userEdit('user1'), ))
      assertStatus(status, data)
      test.loginUser(user)
    }
  }, { canTestNext: true })
})

it('api: article like', async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    const user2 = await test.createUserApi(2)
    test.loginUser(user0)

    // user0 creates another article
    article = createArticleArg({ i: 0 })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    assertRows(data.articles, [{ titleRender: 'Title 0' }])

    // Make user1 like article user0
    test.loginUser(user1)
    ;({data, status} = await test.webApi.articleLike('user0'))
    assertStatus(status, data)
    test.loginUser(user0)

    // Article score goes up.
    ;({data, status} = await test.webApi.article('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.score, 1)

    // Make user2 like article user0
    test.loginUser(user2)
    ;({data, status} = await test.webApi.articleLike('user0'))
    assertStatus(status, data)
    test.loginUser(user0)

    // Like effects.

      // Article score goes up.
      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.score, 2)

      // Shows on likedBy list of user1.
      ;({data, status} = await test.webApi.articles({ likedBy: 'user1' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user0' },
      ])

      // Does not show up on likedBy list of user0.
      ;({data, status} = await test.webApi.articles({ likedBy: 'user0' }))
      assertStatus(status, data)
      assertRows(data.articles, [])

      // Top articles by a user.
      ;({data, status} = await test.webApi.articles({ author: 'user0', sort: 'score' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user0', score: 2 },
        { titleRender: 'Title 0', slug: 'user0/title-0', render: /Body 0/, score: 0 },
      ])

      // Invalid sort.
      ;({data, status} = await test.webApi.articles({ author: 'user0', sort: 'dontexist' }))
      assert.strictEqual(status, 422)

      // User score.
      ;({data, status} = await test.webApi.users({ sort: 'score' }))
      assertStatus(status, data)
      assertRows(data.users, [
        { username: 'user0', score: 2 },
        { username: 'user2', score: 0 },
        { username: 'user1', score: 0 },
      ])

    // Article like errors.

      // Users cannot like articles twice.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user0'))
      assert.strictEqual(status, 403)
      test.loginUser(user0)

      // Users cannot like their own article.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user1'))
      assert.strictEqual(status, 403)
      test.loginUser(user0)

      // Trying to like article that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleLike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.loginUser(user0)

    // Make user1 unlike one of the articles.
    test.loginUser(user1)
    ;({data, status} = await test.webApi.articleUnlike('user0'))
    assertStatus(status, data)
    test.loginUser(user0)

    // Make user2 unlike one of the articles.
    test.loginUser(user2)
    ;({data, status} = await test.webApi.articleUnlike('user0'))
    assertStatus(status, data)
    test.loginUser(user0)

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
      test.loginUser(user0)

      // Trying to like article that does not exist fails gracefully.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleUnlike('user0/dontexist'))
      assert.strictEqual(status, 404)
      test.loginUser(user0)

  })
})

it('api: article follow', async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)

    // user1 creates another article
    test.loginUser(user1)
    article = createArticleArg({ i: 0 })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    assertRows(data.articles, [{ titleRender: 'Title 0' }])
    test.loginUser(user0)

    // Users follow their own articles by default.

      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, true)

      ;({data, status} = await test.webApi.article('user1'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, false)

      test.loginUser(user1)
      ;({data, status} = await test.webApi.article('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, false)

      ;({data, status} = await test.webApi.article('user1'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, true)

      ;({data, status} = await test.webApi.article('user1/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, true)
      test.loginUser(user0)

    // Make user0 follow article user1/title-0
    ;({data, status} = await test.webApi.articleFollow('user1/title-0'))
    assertStatus(status, data)

    // Follow effects.

      // Article follower count goes up and shows on logged in user as followed.
      ;({data, status} = await test.webApi.article('user1/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 2)
      assert.strictEqual(data.followed, true)

      // Shows on user0's followedBy list.
      ;({data, status} = await test.webApi.articles({ followedBy: 'user0' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user1/title-0' },
        { slug: 'user0' },
      ])

      // Most followed articles by user
      ;({data, status} = await test.webApi.articles({ author: 'user1', sort: 'follower-count' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user1/title-0', followerCount: 2 },
        { slug: 'user1', followerCount: 1 },
      ])

    // Article follow errors.

      // Users cannot follow articles twice.
      ;({data, status} = await test.webApi.articleFollow('user1/title-0'))
      assert.strictEqual(status, 403)

      // Trying to follow article that does not exist fails gracefully.
      ;({data, status} = await test.webApi.articleFollow('user1/dontexist'))
      assert.strictEqual(status, 404)

    // Make user0 unfollow article user1/title-0.
    ;({data, status} = await test.webApi.articleUnfollow('user1/title-0'))
    assertStatus(status, data)

    // Unfollow effects

      // Follower count goes back down.
      ;({data, status} = await test.webApi.article('user1/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, false)

    // Unfollow errors.

      // Cannot unfollow article twice.
      ;({data, status} = await test.webApi.articleUnfollow('user1/title-0'))
      assert.strictEqual(status, 403)

      // Trying to follow article that does not exist fails gracefully.
      ;({data, status} = await test.webApi.articleUnfollow('user0/dontexist'))
      assert.strictEqual(status, 404)

    // Updating your own article does not make you follow it, only new article creation does.

      // Make user1 unfollowe article user1/title-0.
      test.loginUser(user1)
      ;({data, status} = await test.webApi.articleUnfollow('user1/title-0'))
      assertStatus(status, data)

      // Follower count goes back down.
      ;({data, status} = await test.webApi.article('user1/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 0)
      assert.strictEqual(data.followed, false)

      // Edit the article.
      article = createArticleArg({ i: 0, bodySource: 'hacked' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)

      // This does not make user1 follow the article.
      ;({data, status} = await test.webApi.article('user1/title-0'))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 0)
      assert.strictEqual(data.followed, false)

      test.loginUser(user0)
  })
})

// TODO this is an initial sketch of https://docs.ourbigbook.com/todo/delete-articles
// Some steps have been skipped because we are initially only enabling this for article moves:
// and issues and children are moved out to the new merge target by the migration code prior
// to deletion. For this reason, it is also not yet exposed on the API, and is tested by calling
// via the sequelize model directly.
it('api: article delete', async () => {
  await testApp(async (test) => {
    let data, status, article

    const sequelize = test.sequelize

    // Create users
    const user = await test.createUserApi(0)
    const admin = await test.createUserApi(1)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user1' } })
    test.loginUser(user)

    // Create a basic hierarchy.

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Algebra' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '\\Image[http://jpg]{title=My calculus image}\n\n<Algebra>\n' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Geometry' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Derivative', bodySource: '<Calculus>\n' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Limit' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
      assertStatus(status, data)

      // Create some data from another user
      test.loginUser(admin)

        // Add user1 metadata to user0/calculus

          // Like.
          ;({data, status} = await test.webApi.articleLike('user0/calculus'))
          assertStatus(status, data)

          // Create issue.
          ;({data, status} = await test.webApi.issueCreate('user0/calculus',
            { titleSource: 'Calculus issue 1' }
          ))
          assertStatus(status, data)

        // Create another "calculus" article to see handling of topic count side effects.

          article = createArticleArg({ i: 0, titleSource: 'Calculus' })
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user1' }))
          assertStatus(status, data)

      test.loginUser(user)

      // Create a comment
      ;({data, status} = await test.webApi.commentCreate('user0/calculus', 1, 'user0/title-1 1 1'))
      assertStatus(status, data)

    // Sanity checks before deletion.

      // User score is now up to 1 after like
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.score, 1)

      // The topic has 2 entries
      ;({data, status} = await test.webApi.topics({ id: 'calculus' }))
      assertStatus(status, data)
      assert.strictEqual(data.topics[0].articleCount, 2)

      // Issue is visible.
      ;({data, status} = await test.webApi.issue('user0/calculus', 1))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Calculus issue 1')

      // Comment is visible
      ;({data, status} = await test.webApi.comment('user0/calculus', 1, 1))
      assertStatus(status, data)
      assert.strictEqual(data.source, 'user0/title-1 1 1')

      // The in-article ID image-my-calculus-image is defined.
      {
        const id = await sequelize.models.Id.findOne({ where: { idid: '@user0/image-my-calculus-image' } })
        assert.notStrictEqual(id, null)
      }

      // References defined in calculus are present
      {
        const count = await sequelize.models.Ref.count({
          include: [
            {
              model: sequelize.models.File,
              as: 'definedAt',
              where: { path: '@user0/calculus.bigb' }
            }
          ]
        })
        assert.notStrictEqual(count, 0)
      }

      // The File object exists.
      {
        const file = await sequelize.models.File.findOne({ where: { path: '@user0/calculus.bigb' } })
        assert.notStrictEqual(file, null)
      }

      // Parent and previous siblings that involve calculus.
      {
        // Current tree state:
        // * 0 user0/Index
        //  * 1 Mathematics
        //    * 2 Geometry
        //    * 3 Calculus
        //      * 4 Limit
        //      * 5 Derivative
        //    * 6 Algebra
        // * 0 user1/Index
        //   * 1 Calculus

        const algebra = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: 'user0/algebra',
        })
        assert.strictEqual(algebra.parentId.idid, '@user0/mathematics')
        assert.strictEqual(algebra.previousSiblingId.idid, '@user0/calculus')

        const limit = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          slug: 'user0/limit',
          sequelize
        })
        assert.strictEqual(limit.parentId.idid, '@user0/calculus')
        assert.strictEqual(limit.previousSiblingId, undefined)

        const derivative = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          slug: 'user0/derivative',
          sequelize
        })
        assert.strictEqual(derivative.parentId.idid, '@user0/calculus')
        assert.strictEqual(derivative.previousSiblingId.idid, '@user0/limit')

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 7, depth: 0, to_id_index: null, slug: 'user0', parentId: null },
          { nestedSetIndex: 1, nestedSetNextSibling: 7, depth: 1, to_id_index: 0, slug: 'user0/mathematics', parentId: '@user0' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/geometry', parentId: '@user0/mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 2, to_id_index: 1, slug: 'user0/calculus', parentId: '@user0/mathematics' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, to_id_index: 0, slug: 'user0/limit', parentId: '@user0/calculus' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 1, slug: 'user0/derivative', parentId: '@user0/calculus' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 2, to_id_index: 2, slug: 'user0/algebra', parentId: '@user0/mathematics' },
          { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user1', parentId: null },
          { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user1/calculus', parentId: '@user1' },
        ])
      }

    // Delete user0/calculus and check the side effects!!!
    {
      const article = await sequelize.models.Article.getArticle({
        includeParentAndPreviousSibling: true,
        sequelize,
        slug: 'user0/calculus',
      })
      await article.destroySideEffects()
    }

      // User score is is decremented when an article is deleted
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.score, 0)

      // Topic article count is decremented when the article the topic pointed to is deleted
      // Here the topic pointed to user0/calculus because it was created before user1/calculus.
      ;({data, status} = await test.webApi.topics({ id: 'calculus' }))
      assertStatus(status, data)
      assert.strictEqual(data.topics[0].articleCount, 1)

      //// Issues are deleted TODO
      //;({data, status} = await test.webApi.issue('user0/calculus', 1))
      //assert.strictEqual(status, 404)

      //// Comments are deleted TODO
      //;({data, status} = await test.webApi.comment('user0/calculus', 1, 1))
      ////assert.strictEqual(status, 404)

      // The in-article ID image-my-calculus-image was deleted
      {
        const id = await sequelize.models.Id.findOne({ where: { idid: '@user0/image-my-calculus-image' } })
        assert.strictEqual(id, null)
      }

      // References defined in calculus were deleted
      {
        const count = await sequelize.models.Ref.count({
          include: [
            {
              model: sequelize.models.File,
              as: 'definedAt',
              where: { path: '@user0/calculus.bigb' }
            }
          ]
        })
        assert.strictEqual(count, 0)
      }

      // The File object were deleted
      {
        const file = await sequelize.models.File.findOne({ where: { path: '@user0/calculus.bigb' } })
        assert.strictEqual(file, null)
      }

      // Parent and previous siblings that involve deleted article are updated.
      // All child pages are moved up the tree and placed where the parent was.
      {
        // Current tree state:
        // * 0 user0/Index
        //  * 1 Mathematics
        //    * 2 Geometry
        //    * 3 Limit
        //    * 4 Derivative
        //    * 5 Algebra
        // * 0 user1/Index
        //   * 1 Calculus

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 6, depth: 0, to_id_index: null, slug: 'user0', parentId: null },
          { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0, slug: 'user0/mathematics', parentId: '@user0' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/geometry', parentId: '@user0/mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, to_id_index: 1, slug: 'user0/limit', parentId: '@user0/mathematics' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 2, to_id_index: 2, slug: 'user0/derivative', parentId: '@user0/mathematics' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 2, to_id_index: 3, slug: 'user0/algebra', parentId: '@user0/mathematics' },
          { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user1', parentId: null },
          { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user1/calculus', parentId: '@user1' },
        ])

        const limit = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          slug: 'user0/limit',
          sequelize
        })
        assert.strictEqual(limit.parentId.idid, '@user0/mathematics')
        assert.strictEqual(limit.previousSiblingId.idid, '@user0/geometry')

        const derivative = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          slug: 'user0/derivative',
          sequelize
        })
        assert.strictEqual(derivative.parentId.idid, '@user0/mathematics')
        assert.strictEqual(derivative.previousSiblingId.idid, '@user0/limit')

        const algebra = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: 'user0/algebra',
        })
        assert.strictEqual(algebra.parentId.idid, '@user0/mathematics')
        assert.strictEqual(algebra.previousSiblingId.idid, '@user0/derivative')
      }

    // Delete user1/calculus and check the topic deletion effects.
    {
      const article = await sequelize.models.Article.getArticle({
        includeParentAndPreviousSibling: true,
        sequelize,
        slug: 'user1/calculus',
      })
      await article.destroySideEffects()
    }

      // Topics without articles are deleted
      // This behavior might have to change later on if we implement features
      // such as topic following and topic issues:
      // https://docs.ourbigbook.com/todo/follow-topic
      // https://github.com/ourbigbook/ourbigbook/issues/257
      ;({data, status} = await test.webApi.topics({ id: 'calculus' }))
      assertStatus(status, data)
      assertRows(data.topics, [])
  })
})

it('api: issue follow', async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)

    // user1 creates issue user0#1
    test.loginUser(user1)
    ;({data, status} = await test.webApi.issueCreate('user0', createIssueArg(0, 0, 0)))
    assertStatus(status, data)
    assert.strictEqual(data.issue.number, 1)
    test.loginUser(user0)

    // Users follow their own issues by default

      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, false)

      test.loginUser(user1)
      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, true)
      test.loginUser(user0)

    // Make user0 follow issue user0#1
    ;({data, status} = await test.webApi.issueFollow('user0', 1))
    assertStatus(status, data)

    // Follow effects

      // Issue follower count goes up and shows on logged in user as followed.
      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 2)
      assert.strictEqual(data.followed, true)

      //// TODO Shows on user0's followedBy list.
      //;({data, status} = await test.webApi.issues({ followedBy: 'user0' }))
      //assertStatus(status, data)
      //assertRows(data.issues, [
      //  { slug: 'user1/title-0' },
      //  { slug: 'user0' },
      //])

    // issue follow errors.

      // Users cannot follow issues twice.
      ;({data, status} = await test.webApi.issueFollow('user0', 1))
      assert.strictEqual(status, 403)

      // Trying to follow issue on article that does not exist fails gracefully.
      ;({data, status} = await test.webApi.issueFollow('user0/dontexist', 1))
      assert.strictEqual(status, 404)

      // Trying to follow issue that does not exist fails gracefully.
      ;({data, status} = await test.webApi.issueFollow('user0', 2))
      assert.strictEqual(status, 404)

    // Make user0 unfollow issue user1/title-0.

      ;({data, status} = await test.webApi.issueUnfollow('user0', 1))
      assertStatus(status, data)

    // Unfollow effects

      // Follower count goes back down.
      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 1)
      assert.strictEqual(data.followed, false)

    // Unfollow errors

      // Cannot unfollow issue twice.
      ;({data, status} = await test.webApi.issueUnfollow('user0', 1))
      assert.strictEqual(status, 403)

      // Trying to follow issue on article that does not exist fails gracefully.
      ;({data, status} = await test.webApi.issueUnfollow('user0/dontexist', 1))
      assert.strictEqual(status, 404)

      // Trying to follow issue that does not exist fails gracefully.
      ;({data, status} = await test.webApi.issueUnfollow('user0', 2))
      assert.strictEqual(status, 404)

    // Commenting on an issue makes you follow it automatically

      ;({data, status} = await test.webApi.commentCreate('user0', 1, 'The \\i[body] 0 index 0.'))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 2)
      assert.strictEqual(data.followed, true)

      // Commenting again does not keep increasing the followerCount.
      ;({data, status} = await test.webApi.commentCreate('user0', 1, 'The \\i[body] 0 index 0.'))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issue('user0', 1))
      assertStatus(status, data)
      assert.strictEqual(data.followerCount, 2)
      assert.strictEqual(data.followed, true)
  })
})

// This used to work at one point working. But then we
// when we started exposing the parentId via API, and decided it would be
// less confusing if we instead forbade multiheader articles to start with.
// Maybe one day we can bring them back, but e.g. forbidding removal after published.
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
//== Title 0 0
//
//Body 0 0.
//
//== Title 0 1
//
//Body 0 1.
//`})
//    ;({data, status} = await createArticleApi(test, article))
//    assertStatus(status, data)
//    assertRows(data.articles, [
//      { titleRender: 'Title 0', slug: 'user0/title-0' },
//      { titleRender: 'Title 0 0', slug: 'user0/title-0-0' },
//      { titleRender: 'Title 0 1', slug: 'user0/title-0-1' },
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
//      { titleRender: ourbigbook.HTML_HOME_MARKER, slug: 'user0' },
//      { titleRender: 'Title 0', slug: 'user0/title-0' },
//      { titleRender: 'Title 0 0', slug: 'user0/title-0-0' },
//      { titleRender: 'Title 0 1', slug: 'user0/title-0-1' },
//    ])
//
//    // Access one of the articles directly.
//    ;({data, status} = await test.webApi.article('user0/title-0-0'))
//    assertStatus(status, data)
//    assert.strictEqual(data.titleRender, 'Title 0 0')
//    assert.match(data.render, /Body 0 0\./)
//    assert.doesNotMatch(data.render, /Body 0 1\./)
//
//    // Modify the file.
//    article = createArticleArg({ i: 0, bodySource: `Body 0.
//
//== Title 0 0 hacked
//
//Body 0 0 hacked.
//
//== Title 0 1
//
//Body 0 1.
//`})
//    ;({data, status} = await createOrUpdateArticleApi(test, article))
//    assertStatus(status, data)
//    assertRows(data.articles, [
//      { titleRender: 'Title 0', slug: 'user0/title-0' },
//      { titleRender: 'Title 0 0 hacked', slug: 'user0/title-0-0-hacked' },
//      { titleRender: 'Title 0 1', slug: 'user0/title-0-1' },
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
//      { titleRender: ourbigbook.HTML_HOME_MARKER,     slug: 'user0', },
//      { titleRender: 'Title 0',   slug: 'user0/title-0',  render: /Body 0 0 hacked\./ },
//      { titleRender: 'Title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
//      { titleRender: 'Title 0 0 hacked', slug: 'user0/title-0-0-hacked', render: /Body 0 0 hacked\./ },
//      { titleRender: 'Title 0 1', slug: 'user0/title-0-1', render: /Body 0 1\./ },
//    ])
//
//    // Topic shows only one subarticle.
//    ;({data, status} = await test.webApi.articles({ topicId: 'title-0-0' }))
//    assertStatus(status, data)
//    sortByKey(data.articles, 'slug')
//    assertRows(data.articles, [
//      { titleRender: 'Title 0 0', slug: 'user0/title-0-0', render: /Body 0 0\./ },
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

it('api: article tree: single user', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    // Create a second user and index to ensure that the nested set indexes are independent for each user.
    // Because of course we didn't do this when originally implementing.
    const user1 = await test.createUserApi(1)
    test.loginUser(user)

    // Article.

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
      ])

      // It is possible to change a parent ID.

        // Create a new test ID.
        article = createArticleArg({ i: 0, titleSource: 'Derivative' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assertStatus(status, data)

        // Current tree state:
        // * 0 Index
        //  * 1 Mathematics
        //    * 2 Derivative
        //    * 3 Calculus

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 4, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/derivative' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, to_id_index: 1, slug: 'user0/calculus' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // Modify the parent of derivative from Mathematics to its next sibling Calculus.
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
        assertStatus(status, data)

        // Current tree state:
        // * 0 Index
        //  * 1 Mathematics
        //    * 2 Calculus
        //      * 3 Derivative

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 4, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0, slug: 'user0/derivative' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
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
        article = createArticleArg({ i: 0, titleSource: '' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
        assert.strictEqual(status, 422)

        // Also doesn't work with render: false
        article = createArticleArg({ i: 0, titleSource: '' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render: false }))
        assert.strictEqual(status, 422)

        // It it not possible to set the parentId to an article of another user.
        article = createArticleArg({ i: 0, titleSource: 'Physics' })
        ;({data, status} = await createArticleApi(test, article, { parentId: '@user1' }))
        assert.strictEqual(status, 422)

        // Circular parent loops fail gracefully.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
        assert.strictEqual(status, 422)

        // Circular parent loops fail gracefully with render: false.
        // Related: https://github.com/ourbigbook/ourbigbook/issues/204
        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus', render: false }))
        // TODO bad.
        //assert.strictEqual(status, 422)
        // OK at least DB seems consistent.
        {
          const article = await sequelize.models.Article.getArticle({
            includeParentAndPreviousSibling: true,
            sequelize,
            slug: 'user0/mathematics',
          })
          assert.strictEqual(article.parentId.idid, '@user0')
        }

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
          { nestedSetIndex: 0, nestedSetNextSibling: 5, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 5, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 5, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, to_id_index: 1,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // Refresh the parent index to show this new child.
        // TODO restore toc asserts. Requires next, not currently exposed on the API.
        //assert_xpath("//*[@id='toc']//x:a[@href='/user0/mathematics' and @data-test='0' and text()='Mathematics']", data.articles[0].render)
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
          { nestedSetIndex: 0, nestedSetNextSibling: 6, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 6, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

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
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='3' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='4' and text()='Limit of a function']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='5' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)

        // Move Limit to after a later sibling. Give a parentId as well as sibling. parentId is not necessary
        // in this case as it is implied by previousSibling, but it is allowed.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/calculus', previousSiblingId: '@user0/integral' }
        ))
        assertStatus(status, data)

        // Current tree state:
        // * 0 Index
        //  * 1 Mathematics
        //    * 2 Calculus
        //      * 3 Derivative
        //      * 4 Integral
        //      * 5 Limit
        //        * 6 Limit of a sequence
        //        * 7 Limit of a function

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, to_id_index: 1,    slug: 'user0/integral' },
          { nestedSetIndex: 5, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/limit' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // TODO restore toc asserts.
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='2' and text()='Derivative']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='3' and text()='Integral']",   data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='4' and text()='Limit']",      data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='5' and text()='Limit of a sequence']", data.articles[0].render)
        //assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='6' and text()='Limit of a function']", data.articles[0].render)

        // Move to previous sibling. Don't give parentId on update. Parent will be derived from sibling.

          // First create a link to derivative from here. This is to stress the case where there is a non-parent
          // link to the previousSiblingId, to ensure that the Ref type is chosen on the query. This failed to exercise
          // the bug concretely, as it is an undocumented behavior ordering issue.
          article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '<derivative>' })
          ;({data, status} = await createOrUpdateArticleApi(test, article))
          assertStatus(status, data)

          ;({data, status} = await createOrUpdateArticleApi(test,
            createArticleArg({ i: 0, titleSource: 'Limit' }),
            { parentId: undefined, previousSiblingId: '@user0/derivative' }
          ))
          assertStatus(status, data)

        // Current tree state:
        // * 0 Index
        //  * 1 Mathematics
        //    * 2 Calculus
        //      * 3 Derivative
        //      * 4 Limit
        //        * 5 Limit of a sequence
        //        * 6 Limit of a function
        //      * 7 Integral

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/derivative' },
          { nestedSetIndex: 4, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/limit' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // Move limit to before ancestor to check that nested set doesn't blow up.
        ;({data, status} = await createOrUpdateArticleApi(test,
          createArticleArg({ i: 0, titleSource: 'Limit' }),
          { parentId: '@user0/mathematics', previousSiblingId: undefined }
        ))
        assertStatus(status, data)
        // Ancestors placeholder is present.
        assert_xpath("//x:div[@class='nav ancestors']", data.articles[0].h1Render)

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
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 5, depth: 2, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 3, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 5, nestedSetNextSibling: 8, depth: 2, to_id_index: 1,    slug: 'user0/calculus' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, to_id_index: 0,    slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 1,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
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

        // Ancestors placeholder is when neither parentId nor previousSiblingId are given.
        assert_xpath("//x:div[@class='nav ancestors']", data.articles[0].h1Render)

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
          { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 8, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

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
          { nestedSetIndex: 0, nestedSetNextSibling: 9, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 9, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 9, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 8, nestedSetNextSibling: 9, depth: 3, to_id_index: 3,    slug: 'user0/measure' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

        // TODO restore toc asserts.
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit'      and @data-test='2' and text()='Limit']",      data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-sequence' and @data-test='3' and text()='Limit of a sequence']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/limit-of-a-function' and @data-test='4' and text()='Limit of a function']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/derivative' and @data-test='5' and text()='Derivative']", data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/integral'   and @data-test='6' and text()='Integral']",   data.articles[0].render)
        // assert_xpath("//*[@id='toc']//x:a[@href='user0/measure'    and @data-test='7' and text()='Measure']",    data.articles[0].render)

        // Refresh Mathematics to show the source ToC.
        // Add a reference to the article self: we once had a bug where this was preventing the ToC from showing.
        article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'I like mathematics.' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0' }))
        assertStatus(status, data)
        // TODO restore toc asserts.
        // assert_xpath("//*[@id='toc']//x:a[@href='/user0/calculus' and @data-test='0' and text()='Calculus']", data.articles[0].render)

      // Article.getArticle includeParentAndPreviousSibling argument test.
      // Used on editor only for now, so a bit hard to test on UI. But this tests the crux MEGAJOIN just fine.

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 9, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 9, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 9, depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/limit' },
          { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-sequence' },
          { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 4, to_id_index: 1,    slug: 'user0/limit-of-a-function' },
          { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
          { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/integral' },
          { nestedSetIndex: 8, nestedSetNextSibling: 9, depth: 3, to_id_index: 3,    slug: 'user0/measure' },
          { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1' },
        ])

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
          { from_id: '@user0',             to_id: '@user0/mathematics',         to_id_index: 0, },
          { from_id: '@user0/calculus',    to_id: '@user0/limit',               to_id_index: 0, },
          { from_id: '@user0/calculus',    to_id: '@user0/derivative',          to_id_index: 1, },
          { from_id: '@user0/calculus',    to_id: '@user0/integral',            to_id_index: 2, },
          { from_id: '@user0/calculus',    to_id: '@user0/measure',             to_id_index: 3, },
          { from_id: '@user0/limit',       to_id: '@user0/limit-of-a-sequence', to_id_index: 0, },
          { from_id: '@user0/limit',       to_id: '@user0/limit-of-a-function', to_id_index: 1, },
          { from_id: '@user0/mathematics', to_id: '@user0/calculus',            to_id_index: 0, },
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

it('api: article tree: update first sibling to become a child', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    // Create a second user and index to ensure that the nested set indexes are independent for each user.
    // Because of course we didn't do this when originally implementing.
    test.loginUser(user)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Physics' })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/physics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/mathematics' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/physics' }))
    assertStatus(status, data)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/physics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/mathematics' },
    ])
  })
})

it('api: article tree: multiuser', async () => {
  await testApp(async (test) => {
    let article, data, status
    const sequelize = test.sequelize
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    const users = [user0, user1]

    await assertNestedSetsMultiuser(sequelize, users, [
      { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, slug: '' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
    await createArticleApiMultiuser(test, users, article)

    await assertNestedSetsMultiuser(sequelize, users, [
      { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, slug: '' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'mathematics' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Calculus',  })
    await createArticleApiMultiuser(test, users, article, { parentId: 'mathematics' })

    await assertNestedSetsMultiuser(sequelize, users, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, slug: '' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, slug: 'mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, slug: 'calculus' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'Natural science' })
    await createArticleApiMultiuser(test, users, article)

    await assertNestedSetsMultiuser(sequelize, users, [
      { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: '' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'natural-science' },
        { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 1, slug: 'mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, slug: 'calculus' },
    ])

    // Sanity check because now we are going to start modifying just one tree.
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'user0/natural-science' },
        { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, slug: 'user0/calculus' },
      { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user1' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'user1/natural-science' },
        { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 1, slug: 'user1/mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, slug: 'user1/calculus' },
    ])

    // Move user0/mathematics before natural science.
    test.loginUser(user0)
    article = createArticleArg({ i: 0, titleSource: 'Mathematics',  })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)

    // Moving a user0 article does not affect user1's tree.
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, slug: 'user0/calculus' },
        { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 1, slug: 'user0/natural-science' },
      { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, slug: 'user1' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, slug: 'user1/natural-science' },
        { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 1, slug: 'user1/mathematics' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 2, slug: 'user1/calculus' },
    ])
  })
})

it('api: article tree render=false', async () => {
  // This is what we have to do on mass upload with ourbigbook --web
  // in order to handle circular references without having one massive
  // server-side operation.
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)
    for (const render of [false, true]) {
      article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '<calculus>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { render }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '<mathematics>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }, { render }))
      assertStatus(status, data)
    }
  })
})

it('api: article tree: updateNestedSetIndex=false and /article/update-nested-set', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // New articles with updateNestedSetIndex=false

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
      ])

      // user.nestedSetNeedsUpdate starts off as false.
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, false)

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { updateNestedSetIndex: false }))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, true)

      // user.nestedSetNeedsUpdate becomes true after the nested set is updated
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, true)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: null, nestedSetNextSibling: null, depth: null, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics', updateNestedSetIndex: false }))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, true)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: null, nestedSetNextSibling: null, depth: null, to_id_index: 0, slug: 'user0/calculus' },
        { nestedSetIndex: null, nestedSetNextSibling: null, depth: null, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
      ])

      ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
      assertStatus(status, data)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
      ])

      // user.nestedSetNeedsUpdate becomes false after the nested se is updated
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, false)

    // Update existing articles with updateNestedSetIndex=false

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { updateNestedSetIndex: false }))
      assertStatus(status, data)
      assert.strictEqual(data.nestedSetNeedsUpdate, true)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
      ])

      ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
      assertStatus(status, data)

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/calculus' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/mathematics' },
      ])

    // nestedSetNeedsUpdate is false when there are no tree changes.
    article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: 'Hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)

    // nestedSetNeedsUpdate is true when there are tree changes and render=false.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, true)

    // nestedSetNeedsUpdate is false when there are no tree changes and render=false.
    // TODO: false would be better here. But would require a bit of refactoring, and wouldn't
    // help much on the CLI, so lazy now. For now it always returns "true" when render=false.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, true)

    // Move math up with a full render.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
    assertStatus(status, data)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/calculus' },
    ])

    // nestedSetNeedsUpdate is false when there are tree changes, but we are updating the index;
    article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)
  })
})

it('api: child articles inherit scope from parent', async () => {
  // This is what we have to do on mass upload with ourbigbook --web
  // in order to handle circular references without having one massive
  // server-side operation.
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '{scope}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)

    article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '{scope}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
    assertStatus(status, data)

    ;({data, status} = await test.webApi.issueCreate('user0/mathematics/calculus', createIssueArg(0, 0, 0)))
    assertStatus(status, data)

    ;({data, status} = await test.webApi.article('user0/mathematics/calculus'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Calculus')

    article = createArticleArg({ i: 0, titleSource: 'Derivative' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics/calculus' }))
    assertStatus(status, data)

    article = createArticleArg({ i: 0, titleSource: 'Physics', bodySource: `<mathematics/calculus>

<mathematics/calculus/derivative>
` })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert_xpath("//x:a[@href='/user0/mathematics/calculus' and text()='calculus']", data.articles[0].render)
    assert_xpath("//x:a[@href='/user0/mathematics/calculus/derivative' and text()='derivative']", data.articles[0].render)

    if (testNext) {
      // Tests with the same result for logged in or off.
      async function testNextLoggedInOrOff(loggedInUser) {
        // Article
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/mathematics/calculus'), ))
        assertStatus(status, data)

        // Article links
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesChildren('user0', 'mathematics/calculus'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesIncoming('user0', 'mathematics/calculus'), ))
        assertStatus(status, data)
        ;({data, status} = await test.sendJsonHttp('GET', routes.userArticlesTagged('user0', 'mathematics/calculus'), ))
        assertStatus(status, data)

        // Issue
        ;({data, status} = await test.sendJsonHttp('GET', routes.issue('user0/mathematics/calculus', 1), ))
        assertStatus(status, data)
      }
      // Logged in.
      await testNextLoggedInOrOff(true)
      // Logged out.
      test.disableToken()
      await testNextLoggedInOrOff(false)
      test.loginUser(user)
    }
  }, { canTestNext: true })
})

it('api: synonym rename', async () => {
  // This is what we have to do on mass upload with ourbigbook --web
  // in order to handle circular references without having one massive
  // server-side operation.
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    test.loginUser(user)

    // Create a basic hierarchy.

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article))
      assertStatus(status, data)

      // Has Calculus as previous sibling.
      article = createArticleArg({ i: 0, titleSource: 'Algebra' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '\\Image[http://jpg]{title=My image}\n' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Integral' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Fundamental theorem of calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/integral' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Derivative', bodySource: '<Calculus>\n' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Chain rule' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/derivative' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Limit' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus' }))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Limit of a series' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/limit' }))
      assertStatus(status, data)

    // Add some metadata to our article of interest.

    ;({data, status} = await test.webApi.issueCreate('user0/calculus',
      { titleSource: 'Calculus issue 0' }
    ))
    assertStatus(status, data)

    test.loginUser(user1)
    ;({data, status} = await test.webApi.articleLike('user0/calculus'))
    assertStatus(status, data)
    test.loginUser(user)

    // Sanity checks

      ;({data, status} = await test.webApi.issue('user0/calculus', 1))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Calculus issue 0')

      // Current tree state:
      // * 0 user0/Index
      //  * 1 Mathematics
      //    * 2 Calculus
      //      * 3 Limit
      //        * 4 Limit of a series
      //      * 5 Derivative
      //        * 6 Chain rule
      //      * 7 Integral
      //        * 8 Fundamental theorem of calculus
      //    * 9 Algebra
      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
        { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
        { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
        { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
        { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
        { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
        { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
        { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
      ])

      // Sanity check that the parent and previous sibling are correct.

      ;({data, status} = await test.webApi.article('user0/derivative', { 'include-parent': QUERY_TRUE_VAL }))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Derivative')
      assert.strictEqual(data.parentId, '@user0/calculus')

      ;({data, status} = await test.webApi.article('user0/algebra', { 'include-parent': QUERY_TRUE_VAL }))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Algebra')
      assert.strictEqual(data.previousSiblingId, '@user0/calculus')

      // Sanity check scores

      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.score, 1)

      ;({data, status} = await test.webApi.article('user0/calculus'))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Calculus')
      assert.strictEqual(data.score, 1)

    // Add calculus-2 as a synonym of calculus without changing title.

      article = createArticleArg({
        i: 0,
        titleSource: 'Calculus',
        bodySource: `= Calculus 2
{synonym}

\\Image[http://jpg]{title=My image}
`
      })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

      // Current tree state:
      // * 0 user0/Index
      //  * 1 Mathematics
      //    * 2 Calculus (Calculus 2)
      //      * 3 Limit
      //        * 4 Limit of a series
      //      * 5 Derivative
      //        * 6 Chain rule
      //      * 7 Integral
      //        * 8 Fundamental theorem of calculus
      //    * 9 Algebra
      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
        { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
        { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
        { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
        { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
        { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
        { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
        { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
      ])

      // The synonym exists as a redirect.
      ;({data, status} = await test.webApi.articleRedirects({ id: 'user0/calculus-2' }))
      assertStatus(status, data)
      assert.strictEqual(data.redirects['user0/calculus-2'], 'user0/calculus')

      // synonym does not break parentId and previousSibling

      ;({data, status} = await test.webApi.article('user0/derivative', { 'include-parent': QUERY_TRUE_VAL }))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Derivative')
      assert.strictEqual(data.parentId, '@user0/calculus')

      ;({data, status} = await test.webApi.article('user0/algebra', { 'include-parent': QUERY_TRUE_VAL }))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Algebra')
      assert.strictEqual(data.previousSiblingId, '@user0/calculus')

      // webApi.article( uses Article.getArticles, just double check
      // with the Article.getARticle (singular) version.
      const algebra = await test.sequelize.models.Article.getArticle({
        includeParentAndPreviousSibling: true,
        sequelize,
        slug: 'user0/algebra',
      })
      assert.strictEqual(algebra.parentId.idid, '@user0/mathematics')
      assert.strictEqual(algebra.previousSiblingId.idid, '@user0/calculus')

      // Issues are not broken by adding the synonym.
      ;({data, status} = await test.webApi.issue('user0/calculus', 1))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Calculus issue 0')

    // Add a link to the new synonym.
    article = createArticleArg({ i: 0, titleSource: 'Derivative', bodySource: '<Calculus>\n\n<Calculus 2>\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus', previousSiblingId: '@user0/limit' }))
    assertStatus(status, data)
    // TODO Links to synonym header from have fragment
    // https://docs.ourbigbook.com/todo/links-to-synonym-header-have-fragment
    assert_xpath("//x:a[@href='/user0/calculus' and text()='Calculus']", data.articles[0].render)
    assert_xpath("//x:a[@href='/user0/calculus' and text()='Calculus 2']", data.articles[0].render)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus' },
      { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
      { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
      { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
      { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
      { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
      { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
      { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
    ])

    // Add a tag to the new synonym.
    article = createArticleArg({ i: 0, titleSource: 'Integral', bodySource: '{tag=Calculus 2}\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus', previousSiblingId: '@user0/derivative' }))
    assertStatus(status, data)

    // Sanity: the File object exists.
    {
      const file = await sequelize.models.File.findOne({ where: { path: '@user0/calculus.bigb' } })
      assert.notStrictEqual(file, null)
    }

    // Rename Calculus to Calculus 3
    article = createArticleArg({
      i: 0,
      titleSource: 'Calculus 3',
      bodySource: `= Calculus
{synonym}

= Calculus 2
{synonym}

\\Image[http://jpg]{title=My image}
`
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
    assertStatus(status, data)

    // The File object was removed.
    {
      const file = await sequelize.models.File.findOne({ where: { path: '@user0/calculus.bigb' } })
      assert.strictEqual(file, null)
    }

    // Current tree state:
    // * 0 user0/Index
    //  * 1 Mathematics
    //    * 2 Calculus 3 (Calculus, Calculus 2)
    //      * 3 Limit
    //        * 4 Limit of a series
    //      * 5 Derivative
    //        * 6 Chain rule
    //      * 7 Integral
    //        * 8 Fundamental theorem of calculus
    //    * 9 Algebra
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus-3' },
      { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
      { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
      { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
      { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
      { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
      { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
      { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
    ])

    // Check that the latest name exists as the main one.
    ;({data, status} = await test.webApi.article('user0/calculus-3'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Calculus 3')
    assert.strictEqual(data.file.bodySource, `= Calculus
{synonym}

= Calculus 2
{synonym}

\\Image[http://jpg]{title=My image}
`
    )
    // The score is zeroed on rename to prevent rename spam.
    assert.strictEqual(data.score, 0)

    // The user score is reduce accordingly.
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.username, 'user0')
    assert.strictEqual(data.score, 0)

    // Check that the metadata is now associated to the article with the new main title.

    ;({data, status} = await test.webApi.issue('user0/calculus-3', 1))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Calculus issue 0')

    // Check that the previous name now exists as a redirect.

    ;({data, status} = await test.webApi.articleRedirects({ id: 'user0/calculus' }))
    assertStatus(status, data)
    assert.strictEqual(data.redirects['user0/calculus'], 'user0/calculus-3')

    ;({data, status} = await test.webApi.articleRedirects({ id: 'user0/calculus-2' }))
    assertStatus(status, data)
    assert.strictEqual(data.redirects['user0/calculus-2'], 'user0/calculus-3')

    // Children of the renamed article now point to the new parent,
    // Previous sibling is also updated.

    ;({data, status} = await test.webApi.article('user0/derivative', { 'include-parent': true }))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Derivative')
    assert.strictEqual(data.parentId, '@user0/calculus-3')

    ;({data, status} = await test.webApi.article('user0/algebra'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Algebra')
    // TODO https://docs.ourbigbook.com/todo/fix-parentid-and-previoussiblingid-on-articles-api
    //assert.strictEqual(data.previousSiblingId, '@user0/calculus-3')

    {
      const algebra = await sequelize.models.Article.getArticle({
        includeParentAndPreviousSibling: true,
        slug: 'user0/algebra',
        sequelize
      })
      assert.strictEqual(algebra.parentId.idid, '@user0/mathematics')
      assert.strictEqual(algebra.previousSiblingId.idid, '@user0/calculus-3')
    }

    // Only the main Article retains a File object.
    assert.notStrictEqual(await sequelize.models.File.findOne({ where: { path: '@user0/calculus-3.bigb' } }), null)
    assert.strictEqual(await sequelize.models.File.findOne({ where: { path: '@user0/calculus.bigb' } }), null)
    assert.strictEqual(await sequelize.models.File.findOne({ where: { path: '@user0/calculus-2.bigb' } }), null)

    // extract_ids without render of header with synonym does not blow up.
    // Yes, everything breaks everything.
    article = createArticleArg({ i: 0, titleSource: 'Calculus 3', bodySource: `= Calculus
{synonym}

= Calculus 2
{synonym}

\\Image[http://jpg]{title=My image}
`
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)

    // Current tree state:
    // * 0 user0/Index
    //  * 1 Mathematics
    //    * 2 Calculus 3 (Calculus, Calculus 2)
    //      * 3 Limit
    //        * 4 Limit of a series
    //      * 5 Derivative
    //        * 6 Chain rule
    //      * 7 Integral
    //        * 8 Fundamental theorem of calculus
    //    * 9 Algebra
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus-3' },
      { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
      { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
      { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
      { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
      { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
      { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
      { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
    ])

    // Adding synonym to index is fine.
    article = createArticleArg({ i: 0, titleSource: '', bodySource: '= Index 2\n{synonym}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)

    // Current tree state:
    // * 0 user0/Index (Index 2)
    //  * 1 Mathematics
    //    * 2 Calculus 3 (Calculus, Calculus 2)
    //      * 3 Limit
    //        * 4 Limit of a series
    //      * 5 Derivative
    //        * 6 Chain rule
    //      * 7 Integral
    //        * 8 Fundamental theorem of calculus
    //    * 9 Algebra
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus-3' },
      { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
      { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
      { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
      { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
      { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
      { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
      { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
    ])

    // Renaming index via synonyms is not allowed.
    article = createArticleArg({ i: 0, titleSource: 'Index 3', bodySource: '= Index\n{synonym}\n\n= Index 2\n{synonym}\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assert.strictEqual(status, 422)

    // Current tree state:
    // * 0 user0/Index (Index 2)
    //  * 1 Mathematics
    //    * 2 Calculus 3 (Calculus, Calculus 2)
    //      * 3 Limit
    //        * 4 Limit of a series
    //      * 5 Derivative
    //        * 6 Chain rule
    //      * 7 Integral
    //        * 8 Fundamental theorem of calculus
    //    * 9 Algebra
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 10, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 10, depth: 1, to_id_index: 0,    slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 9,  depth: 2, to_id_index: 0,    slug: 'user0/calculus-3' },
      { nestedSetIndex: 3, nestedSetNextSibling: 5,  depth: 3, to_id_index: 0,    slug: 'user0/limit' },
      { nestedSetIndex: 4, nestedSetNextSibling: 5,  depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series' },
      { nestedSetIndex: 5, nestedSetNextSibling: 7,  depth: 3, to_id_index: 1,    slug: 'user0/derivative' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7,  depth: 4, to_id_index: 0,    slug: 'user0/chain-rule' },
      { nestedSetIndex: 7, nestedSetNextSibling: 9,  depth: 3, to_id_index: 2,    slug: 'user0/integral' },
      { nestedSetIndex: 8, nestedSetNextSibling: 9,  depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus' },
      { nestedSetIndex: 9, nestedSetNextSibling: 10, depth: 2, to_id_index: 1,    slug: 'user0/algebra' },
      { nestedSetIndex: 0, nestedSetNextSibling: 1,  depth: 0, to_id_index: null, slug: 'user1' },
    ])

    // Article merge

      // Add user1 metadata to user0/derivative
      test.loginUser(user1)

      // Like derivative.
      ;({data, status} = await test.webApi.articleLike('user0/derivative'))
      assertStatus(status, data)

      // Create issue.
      ;({data, status} = await test.webApi.issueCreate('user0/derivative',
        { titleSource: 'Derivative issue 0' }
      ))
      assertStatus(status, data)

      test.loginUser(user)

      // Sanity check that user score is now up to 1
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.score, 1)

      // Sanity check that the issue is visible.
      ;({data, status} = await test.webApi.issue('user0/derivative', 1))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Derivative issue 0')

      // Sanity: the File object exists
      {
        const file = await sequelize.models.File.findOne({ where: { path: '@user0/derivative.bigb' } })
        assert.notStrictEqual(file, null)
      }

      // Rename derivative to calculus-3, triggering an article merge
      // of user0/derivative to user/calculus-3.
      article = createArticleArg({
        i: 0,
        titleSource: 'Calculus 3',
        bodySource: `= Calculus
{synonym}

= Calculus 2
{synonym}

= Derivative
{synonym}

\\Image[http://jpg]{title=My image}
`,
      })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined }))
      assertStatus(status, data)

      // The File object was removed.
      {
        const file = await sequelize.models.File.findOne({ where: { path: '@user0/derivative.bigb' } })
        assert.strictEqual(file, null)
      }

      // Current tree state:
      // * 0 user0/Index
      //  * 1 Mathematics
      //    * 2 Calculus 3 (Calculus, Calculus 2, Derivative)
      //      * 3 Limit
      //        * 4 Limit of a series
      //      * 5 Integral
      //        * 6 Fundamental theorem of calculus
      //      * 7 Chain rule
      //    * 8 Algebra
      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 9, depth: 0, to_id_index: null, slug: 'user0', parentId: null },
        { nestedSetIndex: 1, nestedSetNextSibling: 9, depth: 1, to_id_index: 0,    slug: 'user0/mathematics', parentId: '@user0' },
        { nestedSetIndex: 2, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/calculus-3', parentId: '@user0/mathematics' },
        { nestedSetIndex: 3, nestedSetNextSibling: 5, depth: 3, to_id_index: 0,    slug: 'user0/limit', parentId: '@user0/calculus-3' },
        { nestedSetIndex: 4, nestedSetNextSibling: 5, depth: 4, to_id_index: 0,    slug: 'user0/limit-of-a-series', parentId: '@user0/limit' },
        { nestedSetIndex: 5, nestedSetNextSibling: 7, depth: 3, to_id_index: 1,    slug: 'user0/integral', parentId: '@user0/calculus-3' },
        { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 4, to_id_index: 0,    slug: 'user0/fundamental-theorem-of-calculus', parentId: '@user0/integral' },
        { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 3, to_id_index: 2,    slug: 'user0/chain-rule', parentId: '@user0/calculus-3' },
        { nestedSetIndex: 8, nestedSetNextSibling: 9, depth: 2, to_id_index: 1,    slug: 'user0/algebra', parentId: '@user0/mathematics' },
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user1', parentId: null },
      ])

      // user0/derivative redirects to user0/calculus-3
      ;({data, status} = await test.webApi.articleRedirects({ id: 'user0/derivative' }))
      assertStatus(status, data)
      assert.strictEqual(data.redirects['user0/derivative'], 'user0/calculus-3')

      // user0/chain-rule, previously a child of user0/derivative, is reparented
      // to the new parent user0/calculus-3
      {
        const article = await sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          slug: 'user0/chain-rule',
          sequelize
        })
        assert.strictEqual(article.parentId.idid, '@user0/calculus-3')
        assert.strictEqual(article.previousSiblingId.idid, '@user0/integral')
      }

      // Issue 1 of user0/derivative is migrated as issue 2 of user/calculus-3,
      // following the pre-existing issue 1.
      ;({data, status} = await test.webApi.issue('user0/calculus-3', 1))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Calculus issue 0')
      ;({data, status} = await test.webApi.issue('user0/calculus-3', 2))
      assertStatus(status, data)
      assert.strictEqual(data.titleRender, 'Derivative issue 0')

      // user0 score is back down to 0 since likes of merged articles are deleted to prevent spam.
      ;({data, status} = await test.webApi.user('user0'))
      assertStatus(status, data)
      assert.strictEqual(data.username, 'user0')
      assert.strictEqual(data.score, 0)

      // Creating a new article with a synonym does not blow up
      article = createArticleArg({
        i: 0,
        titleSource: 'Geometry',
        bodySource: `= Geometry 2
{synonym}
`,
      })
      ;({data, status} = await createOrUpdateArticleApi(test, article, {
        parentId: '@user0/mathematics',
        previousSiblingId: '@user0/algebra',
      }))
      assertStatus(status, data)

      // Current tree state:
      // * 0 user0/Index
      //  * 1 Mathematics
      //    * 2 Calculus 3 (Calculus, Calculus 2, Derivative)
      //      * 3 Limit
      //        * 4 Limit of a series
      //      * 5 Integral
      //        * 6 Fundamental theorem of calculus
      //      * 7 Chain rule
      //    * 8 Algebra
      //    * 9 Geometry (Geometry 2)

      // Creating a new article with a synonym with render: false does not blow up.
      article = createArticleArg({
        i: 0,
        titleSource: 'Number theory',
        bodySource: `= Number theory 2
{synonym}
`,
      })
      ;({data, status} = await createOrUpdateArticleApi(test, article, {
        parentId: '@user0/mathematics',
        previousSiblingId: '@user0/geometry',
        render: false,
      }))
      assertStatus(status, data)
      ;({data, status} = await createOrUpdateArticleApi(test, article, {
        parentId: '@user0/mathematics',
        previousSiblingId: '@user0/geometry',
        render: true,
      }))
      assertStatus(status, data)

      // Current tree state:
      // * 0 user0/Index
      //  * 1 Mathematics
      //    * 2 Calculus 3 (Calculus, Calculus 2, Derivative)
      //      * 3 Limit
      //        * 4 Limit of a series
      //      * 5 Integral
      //        * 6 Fundamental theorem of calculus
      //      * 7 Chain rule
      //    * 8 Algebra
      //    * 9 Geometry (Geometry 2)
      //    * 10 Number theory (Number theory 2)

      // Creating a new article with id and a synonym does not blow up.
      article = createArticleArg({
        i: 0,
        titleSource: 'Ł',
        bodySource: `{id=weird-l}
{title2=wa}
{title2=wo}

= L with a stroke
{synonym}
`,
      })
      ;({data, status} = await createOrUpdateArticleApi(test, article,))
      assertStatus(status, data)
      assert.strictEqual(data.articles[0].slug, 'user0/weird-l')
  })
})

it('api: uppercase article IDs are forbidden', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // The only way to currently obtain them on toplevel article is with the path: argument.
    // id= does nothing on web as of writing as it gets overridden by path:.
    article = createArticleArg({ i: 0, titleSource: 'Aa' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { path: 'bB' }))
    assert.strictEqual(status, 422)

    // Similar for synonym subobjects.
    // TODO: Forbid uppercase IDs on web and CLI by default
    //article = createArticleArg({ i: 0, titleSource: 'Aa', bodySource: '= Bb\n{synonym}\n{id=cC}\n' })
    //;({data, status} = await createOrUpdateArticleApi(test, article))
    //assert.strictEqual(status, 422)

    // Similar for other subobjects.
    // TODO: Forbid uppercase IDs on web and CLI by default
    //article = createArticleArg({ i: 0, titleSource: 'Aa', bodySource: '\\Image[tmp.png]{id=cC}' })
    //;({data, status} = await createOrUpdateArticleApi(test, article))
    //assert.strictEqual(status, 422)

    // Uppercase is allowed with {file} however.
    article = createArticleArg({ i: 0, titleSource: 'path/to/main.S', bodySource: '{file}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { path: '_file/path/to/main.S' }))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.article('user0/_file/path/to/main.S'))
    assertStatus(status, data)
    assert.notStrictEqual(data, undefined)

    await models.normalize({
      check: true,
      sequelize,
      whats: ['nested-set'],
    })
  })
})

it('api: hideArticleDates', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // New articles created with hideArticleDates=false don't have the dummy date.
    article = createArticleArg({ i: 0, titleSource: 'Before' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.notStrictEqual(data.articles[0].createdAt, config.hideArticleDatesDate)
    assert.notStrictEqual(data.articles[0].updatedAt, config.hideArticleDatesDate)

    // Set hideArticleDates to true.
    ;({data, status} = await test.webApi.userUpdate('user0', {
      hideArticleDates: true,
    }))

    // New articles created after hideArticleDates=true have the dummy date.
    article = createArticleArg({ i: 0, titleSource: 'After' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.strictEqual(data.articles[0].createdAt, config.hideArticleDatesDate)
    assert.strictEqual(data.articles[0].updatedAt, config.hideArticleDatesDate)

    // Updates change the createdAt and updatedAt dates of existing articles.
    article = createArticleArg({ i: 0, titleSource: 'Before' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    // TODO would be slightly better if this were also reset. However it appears
    // that bulkCreate doesn't set createdAt even if if is passed explicitly on
    // updateOnDuplicate.
    assert.notStrictEqual(data.articles[0].createdAt, config.hideArticleDatesDate)
    assert.strictEqual(data.articles[0].updatedAt, config.hideArticleDatesDate)
  })
})

it('api: editor/fetch-files', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Create articles

      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

    // Fetch and check some files.
    ;({data, status} =  await test.webApi.editorFetchFiles([ '@user0/mathematics.bigb', '@user0/calculus.bigb' ]))
    assertStatus(status, data)
    assertRows(data.files, [
      { path: '@user0/calculus.bigb', toplevel_id: '@user0/calculus' },
      { path: '@user0/mathematics.bigb', toplevel_id: '@user0/mathematics' },
    ])
  })
})

it('api: ourbigbook LaTeX macros are defined', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)
    article = createArticleArg({
      i: 0,
      titleSource: 'Mathematics',
      bodySource: `$$
\\abs{x}
$$
`,
    })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
  })
})

it(`api: topic links dont have the domain name`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)
    article = createArticleArg({
      i: 0,
      titleSource: 'Mathematics',
      bodySource: `<#My Topic>
`,
    })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/go/topic/my-topic' and text()='My Topic']`, data.articles[0].render)

    article = createArticleArg({
      i: 0,
      titleSource: '',
      bodySource: `<#My Topic>
`,
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/go/topic/my-topic' and text()='My Topic']`, data.articles[0].render)
  })
})

it('api: parent and child to unrelated synonyms with updateNestedSetIndex', async () => {
  // Attempt to reproduce: https://docs.ourbigbook.com/todo/5
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    // Create a second user and index to ensure that the nested set indexes are independent for each user.
    // Because of course we didn't do this when originally implementing.
    test.loginUser(user)

    article = createArticleArg({ i: 0, titleSource: 'h2' })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h2-2' })
    ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/h2' }))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h1' })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h1-2' })
    ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/h1' }))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h1-1' })
    ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/h1' }))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h1-1-1' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h1-1' }))
    assertStatus(status, data)
    article = createArticleArg({ i: 0, titleSource: 'h1-2-1' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h1-2' }))
    assertStatus(status, data)
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0,    slug: 'user0/h1' },
      { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, to_id_index: 0,    slug: 'user0/h1-1' },
      { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/h1-1-1' },
      { nestedSetIndex: 4, nestedSetNextSibling: 6, depth: 2, to_id_index: 1,    slug: 'user0/h1-2' },
      { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/h1-2-1' },
      { nestedSetIndex: 6, nestedSetNextSibling: 8, depth: 1, to_id_index: 1,    slug: 'user0/h2' },
      { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/h2-2' },
    ])

    // Update sanity check without synonym.
    article = createArticleArg({ i: 0, titleSource: 'h1-2', bodySource: 'asdf' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h1', previousSiblingId: '@user0/h1-1' }))
    assertStatus(status, data)
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 8, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0,    slug: 'user0/h1' },
      { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, to_id_index: 0,    slug: 'user0/h1-1' },
      { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/h1-1-1' },
      { nestedSetIndex: 4, nestedSetNextSibling: 6, depth: 2, to_id_index: 1,    slug: 'user0/h1-2' },
      { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/h1-2-1' },
      { nestedSetIndex: 6, nestedSetNextSibling: 8, depth: 1, to_id_index: 1,    slug: 'user0/h2' },
      { nestedSetIndex: 7, nestedSetNextSibling: 8, depth: 2, to_id_index: 0,    slug: 'user0/h2-2' },
    ])

    // Update with synonym.
    article = createArticleArg({ i: 0, titleSource: 'h1-2', bodySource: '= h2-2\n{synonym}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h1', previousSiblingId: '@user0/h1-1' }))
    assertStatus(status, data)
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 7, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0,    slug: 'user0/h1' },
      { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, to_id_index: 0,    slug: 'user0/h1-1' },
      { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/h1-1-1' },
      { nestedSetIndex: 4, nestedSetNextSibling: 6, depth: 2, to_id_index: 1,    slug: 'user0/h1-2' },
      { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/h1-2-1' },
      { nestedSetIndex: 6, nestedSetNextSibling: 7, depth: 1, to_id_index: 1,    slug: 'user0/h2' },
    ])

    article = createArticleArg({ i: 0, titleSource: 'h1-1', bodySource: '= h2\n{synonym}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h1' }))
    assertStatus(status, data)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 6, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 6, depth: 1, to_id_index: 0,    slug: 'user0/h1' },
      { nestedSetIndex: 2, nestedSetNextSibling: 4, depth: 2, to_id_index: 0,    slug: 'user0/h1-1' },
      { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 3, to_id_index: 0,    slug: 'user0/h1-1-1' },
      { nestedSetIndex: 4, nestedSetNextSibling: 6, depth: 2, to_id_index: 1,    slug: 'user0/h1-2' },
      { nestedSetIndex: 5, nestedSetNextSibling: 6, depth: 3, to_id_index: 0,    slug: 'user0/h1-2-1' },
    ])
  })
})

// https://github.com/ourbigbook/ourbigbook/issues/306
it('api: article create with synonym parent uses the synonym target', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    // Create a second user and index to ensure that the nested set indexes are independent for each user.
    // Because of course we didn't do this when originally implementing.
    test.loginUser(user)

    // Create an article with synonym.
    article = createArticleArg({ i: 0, titleSource: 'h2', bodySource: '= h2 2\n{synonym}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0,    slug: 'user0/h2' },
    ])

    // Point the parent of h3 to the synonym h2-2.
    article = createArticleArg({ i: 0, titleSource: 'h3' })
    ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/h2-2' }))
    assertStatus(status, data)
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0,    slug: 'user0/h2' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0,    slug: 'user0/h3' },
    ])
    {
      const article = await sequelize.models.Article.getArticle({
        includeParentAndPreviousSibling: true,
        sequelize,
        slug: 'user0/h3',
      })
      assert.strictEqual(article.parentId.idid, '@user0/h2')
    }
  })
})

it(`api: /hash: cleanupIfDeleted is correct`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Empty non-hidden article needs to be cleaned.
    article = createArticleArg({
      i: 0,
      titleSource: 'Mathematics',
      bodySource: '',
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assert.strictEqual(data.articles[0].list, true)
    ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { path: '@user0/index.bigb', cleanupIfDeleted: true, },
      { path: '@user0/mathematics.bigb', cleanupIfDeleted: true, },
    ])

    // Empty hidden article does not need to be cleaned.
    article = createArticleArg({
      i: 0,
      titleSource: 'Mathematics',
      bodySource: '',
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { list: false, } ))
    assertStatus(status, data)
    assert.strictEqual(data.articles[0].list, false)
    ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { path: '@user0/index.bigb', cleanupIfDeleted: true, },
      { path: '@user0/mathematics.bigb', cleanupIfDeleted: false, },
    ])

    // Non-empty hidden article needs to be cleaned.
    article = createArticleArg({
      i: 0,
      titleSource: 'Mathematics',
      bodySource: 'blabla',
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article ))
    assertStatus(status, data)
    assert.strictEqual(data.articles[0].list, false)
    ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { path: '@user0/index.bigb', cleanupIfDeleted: true, },
      { path: '@user0/mathematics.bigb', cleanupIfDeleted: true, },
    ])

    // Render false does not blow up /hash with empty body
    article = createArticleArg({
      i: 0,
      titleSource: 'Physics',
      bodySource: '',
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articlesHash({ author: 'user0' }))
    assertStatus(status, data)
    assertRows(data.articles, [
      { path: '@user0/index.bigb', cleanupIfDeleted: true, },
      { path: '@user0/mathematics.bigb', cleanupIfDeleted: true, },
      // We don't need to cleanup as it was never rendered.
      { path: '@user0/physics.bigb', cleanupIfDeleted: false, },
    ])
  })
})

it(`api: admin can edit other user's articles`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    const user2 = await test.createUserApi(2)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user2' } })
    test.loginUser(user0)

    // Create article as user0
    article = createArticleArg({ i: 0 })
    ;({data, status} = await createArticleApi(test, article))
    assertStatus(status, data)
    assertRows(data.articles, [{ titleRender: 'Title 0' }])

    // Sanity check.
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.file.bodySource, 'Body 0.')

    // owner that does not exist fails gracefully
    test.loginUser(user1)
    article = createArticleArg({ i: 0, bodySource: 'hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { owner: 'idontexist', parentId: undefined }))
    assert.strictEqual(status, 403)

    // Non-admin cannot edit other users' articles
    test.loginUser(user1)
    article = createArticleArg({ i: 0, bodySource: 'hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { owner: 'user0', parentId: undefined }))
    assert.strictEqual(status, 403)

    // Article unchanged.
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.file.bodySource, 'Body 0.')

    // Admin can edit other users' articles
    test.loginUser(user2)
    article = createArticleArg({ i: 0, bodySource: 'hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { owner: 'user0', parentId: undefined }))
    assertStatus(status, data)
    test.loginUser(user0)

    // Article changed.
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.file.bodySource, 'hacked')
  })
})

it(`api: user validation`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // New

      // OK sanity check.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'john-smith',
        displayName: 'John Smith',
        email: 'john.smith@mail.com',
        password: 'asdf',
      }))
      assertStatus(status, data)
      const user0 = data.user
      assert.strictEqual(data.user.username, 'john-smith')
      assert.strictEqual(data.user.emailNotifications, true)
      assert.strictEqual(data.user.emailNotificationsForArticleAnnouncement, true)

      // Logged off get.
      ;({ data, status } = await test.webApi.user('john-smith'))
      assert.strictEqual(data.username, 'john-smith')
      assert.strictEqual(data.emailNotifications, undefined)
      assert.strictEqual(data.emailNotificationsForArticleAnnouncement, undefined)

      // Logged in get.
      test.loginUser(user0)
      ;({ data, status } = await test.webApi.user('john-smith'))
      assert.strictEqual(data.username, 'john-smith')
      assert.strictEqual(data.emailNotifications, true)
      assert.strictEqual(data.emailNotificationsForArticleAnnouncement, true)
      test.loginUser()

      // Username taken.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'john-smith',
        displayName: 'Mary Jane',
        email: 'mary.jane@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Email taken.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        displayName: 'Mary Jane',
        email: 'john.smith@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Missing display name.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        email: 'mary.jane@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Empty display name.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        displayName: '',
        email: 'mary.jane@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Missing password.
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        displayName: 'Mary Jane',
        email: 'mary.jane@mail.com',
      }))
      assert.strictEqual(status, 422)

      // Missing username
      ;({ data, status } = await test.webApi.userCreate({
        displayName: 'Mary Jane',
        email: 'mary.jane@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Empty username
      ;({ data, status } = await test.webApi.userCreate({
        username: '',
        displayName: 'Mary Jane',
        email: 'mary.jane@mail.com',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Missing email
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        displayName: 'Mary Jane',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

      // Empty email
      ;({ data, status } = await test.webApi.userCreate({
        username: 'mary-jane',
        displayName: 'Mary Jane',
        email: '',
        password: 'asdf',
      }))
      assert.strictEqual(status, 422)

    // Edit

      // OK sanity check.
      test.loginUser(user0)
      ;({ data, status } = await test.webApi.userUpdate(
        'john-smith',
        {
          displayName: 'John Smith 2',
          emailNotifications: false,
          emailNotificationsForArticleAnnouncement: false,
        },
      ))
      assertStatus(status, data)
      assert.strictEqual(data.user.displayName, 'John Smith 2')
      assert.strictEqual(data.user.emailNotifications, false)
      assert.strictEqual(data.user.emailNotificationsForArticleAnnouncement, false)
      ;({ data, status } = await test.webApi.user('john-smith'))
      assert.strictEqual(data.displayName, 'John Smith 2')
      assert.strictEqual(data.emailNotifications, false)
      assert.strictEqual(data.emailNotificationsForArticleAnnouncement, false)

      // Empty display name.
      test.loginUser(user0)
      ;({ data, status } = await test.webApi.userUpdate(
        'john-smith',
        { displayName: '', },
      ))
      assert.strictEqual(status, 422)
  })
})

// Generated with:
// convert -size 1x1 xc:white empty.png
// od -t x1 -An empty.png | tr -d '\n '
const PNG_1X1_WHITE = '89504e470d0a1a0a0000000d4948445200000001000000010100000000376ef924000000206348524d00007a26000080840000fa00000080e8000075300000ea6000003a98000017709cba513c00000002624b47440001dd8a13a40000000774494d4507e80c10123327ede92e940000000a4944415408d76368000000820081dd436af40000000049454e44ae426082'

it(`api: profile picture`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    const base64 = Buffer.from(PNG_1X1_WHITE, 'hex').toString('base64')

    // Success.
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'user0',
      `data:image/png;base64,${base64}`,
    ))
    assertStatus(status, data)

    // Format not allowed.
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'user0',
      `data:image/asdf;base64,${base64}`,
    ))
    assert.strictEqual(status, 422)

    // Input too large. Adding a bunch of zeros at the end
    // still produces a valid PNG I think.
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'user0',
      `data:image/png;base64,${Buffer.from(PNG_1X1_WHITE + '00'.repeat(2 * config.profilePictureMaxUploadSize), 'hex').toString('base64')}`,
    ))
    assert.strictEqual(status, 422)

    // Invalid image.
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'user0',
      `data:image/png;base64,${Buffer.from(PNG_1X1_WHITE.substring(Math.floor(PNG_1X1_WHITE.length / 2)), 'hex').toString('base64')}`,
    ))
    assert.strictEqual(status, 422)

    // User does not exist
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'not-exists',
      `data:image/png;base64,${base64}`,
    ))
    assert.strictEqual(status, 404)

    // Logged out
    test.disableToken()
    ;({ data, status } = await test.webApi.userUpdateProfilePicture(
      'user0',
      `data:image/png;base64,${base64}`,
    ))
    assert.strictEqual(status, 401)
  })
})

it(`api: explicit id`, async () => {
  // We made this work, but it is never used on ourbigbook upload and
  // likely should be explicitly forbidden instead. The best general idea for
  // now seems to be to leave anything that determines an article ID out of the
  // article source itself on web, and have that only on local source. Similar applies
  // to scope and disambiguate.
  // Then on web, these are editable outside of the article source itself.
  // https://github.com/ourbigbook/ourbigbook/issues/304
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create the article
    article = createArticleArg({
      i: 0,
      titleSource: 'asdf',
      bodySource: `{id=qwer}
`,
    })
    ;({data, status} = await createOrUpdateArticleApi(test, article,))
    assertStatus(status, data)
    assert.strictEqual(data.articles[0].slug, 'user0/qwer')
  })
})

it(`api: comment: that starts with title does not blow up`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))
    assertStatus(status, data)

    // Create issue user0/title-0#1
    ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0)))
    assertStatus(status, data)

    // Create comment user0/title-0#1#1 that starts with header.
    ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, '= The header\n\n==The body\n'))
    assertStatus(status, data)
  })
})

it(`api: min`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    ;({data, status} = await test.webApi.min())
    assertStatus(status, data)
    assert.strictEqual(data.loggedIn, true)
  })
})

it(`api: link to home article`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Index creation does not create an extra dummy ID.
    assert.notStrictEqual(await test.sequelize.models.Id.findOne({ where: { idid: '@user0' } }), null)
    assert.strictEqual(await test.sequelize.models.Id.findOne({ where: { idid: '@user0/' } }), null)

    // Add alternate title to home article
    ;({data, status} = await createOrUpdateArticleApi(test, {
      titleSource: 'My custom home',
      bodySource: `{id=}

<>

<My custom home>
`,
      },
      {
        // This example misses our heuristic parentId calculation in the tests.
        parentId: undefined,
      }
    ))
    assertStatus(status, data)

    ;({data, status} = await test.webApi.article('user0'))
    assertStatus(status, data)
    assert_xpath(`//x:div[@class='p']//x:a[@href='' and text()='My custom home']`, data.render)
    assert_xpath(`//x:div[@class='p']//x:a[@href='' and text()=' Home']`, data.render)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      i: 0,
      bodySource: `<>

<My custom home>
`,
    })))
    assertStatus(status, data)

    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()='My custom home']`, data.render)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()=' Home']`, data.render)
  })
})

it(`api: article: with named argument`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      i: 0,
      bodySource: `{title2=Asdf qwer}`
    })))
    assertStatus(status, data)
  })
})

it(`api: article: create with disambiguate`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0, bodySource: '{disambiguate=that type}' })))
    assertStatus(status, data)

    // Check that the article is there
    ;({data, status} = await test.webApi.article('user0/title-0-that-type'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Title 0 (that type)')
    assert.strictEqual(data.titleSource, 'Title 0')
  })
})

it(`api: article: announce`, async () => {
  await testApp(async (test) => {
    let data, status

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    // user1 follows user0
    test.loginUser(user1)
    ;({data, status} = await test.webApi.userFollow('user0'))
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))
    assertStatus(status, data)

    // Announcement date is empty before announce.
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.announcedAt, undefined)

    // Can't announce with message that is too long.
    ;({data, status} = await test.webApi.articleAnnounce(
      'user0/title-0', 'a'.repeat(config.maxArticleAnnounceMessageLength + 1)))
    assert.strictEqual(status, 422)

    // Can't announce other person's article.
    test.loginUser(user1)
    ;({data, status} = await test.webApi.articleAnnounce('user0/title-0', 'My message.'))
    assert.strictEqual(status, 403)
    test.loginUser(user0)

    // Can't announce article that does not exist
    ;({data, status} = await test.webApi.articleAnnounce('user0/not-exists', 'My message.'))
    assert.strictEqual(status, 404)

    // Can announce the first time.
    ;({data, status} = await test.webApi.articleAnnounce('user0/title-0', 'My message.'))
    assertStatus(status, data)
    // Followers receive an email notification.
    const emails = test.app.get('emails')
    const lastEmail = emails[emails.length - 1]
    assert.strictEqual(lastEmail.to, 'user1@mail.com')
    assert.strictEqual(lastEmail.subject, 'Announcement: Title 0')

    // Announcement date is not empty anymore.
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.notStrictEqual(data.announcedAt, undefined)

    // Can't announce the second time.
    ;({data, status} = await test.webApi.articleAnnounce('user0/title-0', 'My message.'))
    assert.strictEqual(status, 422)

    // Followers don't receive an email notification if their notification setting is off.
    test.loginUser(user1)
    ;({ data, status } = await test.webApi.userUpdate(
      'user1',
      { emailNotificationsForArticleAnnouncement: false, },
    ))
    assertStatus(status, data)
    test.loginUser(user0)
    assert.strictEqual(emails.length, 1)
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 })))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articleAnnounce(`user0/title-1`, 'My message.'))
    assertStatus(status, data)
    assert.strictEqual(emails.length, 1)

    // The announcement limit prevents new announcements if hit.
    for (let i = 2; i < config.maxArticleAnnouncesPerMonth; i++) {
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i })))
      assertStatus(status, data)
      ;({data, status} = await test.webApi.articleAnnounce(`user0/title-${i}`, 'My message.'))
      assertStatus(status, data)
    }
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: config.maxArticleAnnouncesPerMonth })))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articleAnnounce(`user0/title-${config.maxArticleAnnouncesPerMonth}`, 'My message.'))
    assert.strictEqual(status, 422)
  })
})

it(`api: article: search`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create 10 articles
    for (let i = 0; i < 2; i++) {
      ;({data, status} = await createOrUpdateArticleApi(test,
        createArticleArg({ i, titleSource: `Prefix anywhere suffix ${i}` })))
      assertStatus(status, data)
    }
    for (let i = 0; i < 2; i++) {
      ;({data, status} = await createOrUpdateArticleApi(test,
        createArticleArg({ i, titleSource: `Anywhere middle suffix ${i}` })))
      assertStatus(status, data)
    }

    ;({data, status} = await createOrUpdateArticleApi(test,
      createArticleArg({ i: 0, titleSource: `Oneword` })))
    assertStatus(status, data)

    for (const [apiGet, items, field, pref] of [
      [test.webApi.articles.bind(test.webApi), 'articles', 'slug', 'user0/'],
      [test.webApi.topics.bind(test.webApi), 'topics', 'topicId', ''],
    ]) {
      ;({data, status} = await apiGet({ search: 'pref' }))
      assertStatus(status, data)
      assertRows(data[items], [
        { [field]: `${pref}prefix-anywhere-suffix-0` },
        { [field]: `${pref}prefix-anywhere-suffix-1` },
      ])
      
      // Spaces are converted to hyphen
      ;({data, status} = await apiGet({ search: 'prefix anywh' }))
      assertStatus(status, data)
      assertRows(data[items], [
        { [field]: `${pref}prefix-anywhere-suffix-0` },
        { [field]: `${pref}prefix-anywhere-suffix-1` },
      ])

      if (test.sequelize.options.dialect === 'postgres') {
        // Check that:
        // - prefix search is working
        // - full prefix hits come first
        ;({data, status} = await apiGet({ search: 'anyw' }))
        assertStatus(status, data)
        assertRows(data[items], [
          { [field]: `${pref}anywhere-middle-suffix-0` },
          { [field]: `${pref}anywhere-middle-suffix-1` },
          { [field]: `${pref}prefix-anywhere-suffix-0` },
          { [field]: `${pref}prefix-anywhere-suffix-1` },
        ])

        // Limit is respected when joining up FTS and non FTS. Prefix still gets preferred.
        ;({data, status} = await apiGet({ limit: 3, search: 'anyw' }))
        assertStatus(status, data)
        assertRows(data[items], [
          { [field]: `${pref}anywhere-middle-suffix-0` },
          { [field]: `${pref}anywhere-middle-suffix-1` },
          { [field]: `${pref}prefix-anywhere-suffix-0` },
        ])

        ;({data, status} = await apiGet({ search: 'middle anyw' }))
        assertStatus(status, data)
        assertRows(data[items], [
          { [field]: `${pref}anywhere-middle-suffix-0` },
          { [field]: `${pref}anywhere-middle-suffix-1` },
        ])
      }

      // Single word does ID not get repeated twice
      ;({data, status} = await apiGet({ search: 'oneword' }))
      assertStatus(status, data)
      assertRows(data[items], [
        { [field]: `${pref}oneword` },
      ])

      // Single word does ID not get repeated twice with trailing space on search
      ;({data, status} = await apiGet({ search: 'oneword ' }))
      assertStatus(status, data)
      assertRows(data[items], [
        { [field]: `${pref}oneword` },
      ])
    }
  })
})

it(`api: article: create simple`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))
    assertStatus(status, data)

    // Check that the article is there
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Title 0')
    assert.strictEqual(data.titleSource, 'Title 0')
    assert.match(data.render, /Body 0\./)
  })
})
