const assert = require('assert');

const { WebApi } = require('ourbigbook/web_api')
const {
  assertArraysEqual,
  assertRows,
  assert_xpath,
} = require('ourbigbook/test_lib')
const ourbigbook = require('ourbigbook')

const app = require('./app')
const config = require('./front/config')
const routes = require('./front/routes')
const convert = require('./convert')
const models = require('./models')
const test_lib = require('./test_lib')
const { INVALID_UTF8_BUFFER } = test_lib
const { AUTH_COOKIE_NAME } = require('./front/js')

const web_api = require('ourbigbook/web_api');
const { QUERY_TRUE_VAL } = web_api

const testNext = process.env.OURBIGBOOK_TEST_NEXT === 'true'

// Generated with:
// convert -size 1x1 xc:white empty.png
// od -t x1 -An empty.png | tr -d '\n '
const PNG_1X1_WHITE = '89504e470d0a1a0a0000000d4948445200000001000000010100000000376ef924000000206348524d00007a26000080840000fa00000080e8000075300000ea6000003a98000017709cba513c00000002624b47440001dd8a13a40000000774494d4507e80c10123327ede92e940000000a4944415408d76368000000820081dd436af40000000049454e44ae426082'
const PNG_1X1_WHITE_BUFFER = Buffer.from(PNG_1X1_WHITE, 'hex')

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

/** We set the parent to index by default. To leave it unset,
 * e.g. to set it implicitly via previousSiblingId you need to explicitly set
 * parentId to undefined. It's quite bad. */
async function createArticleApi(test, article, opts={}, reqOpts={}) {
  if (!opts.hasOwnProperty('parentId') && test.user) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreate(article, opts, reqOpts)
}

async function createOrUpdateArticleApi(test, article, opts={}, reqOpts={}) {
  if (
    !opts.hasOwnProperty('parentId') &&
    test.user &&
    // This is just a heuristic to detect index editing. Index can also be achieved e.g. with {id=},
    // but let's KISS it for now.
    article.titleSource !== ''
  ) {
    opts = Object.assign({ parentId: `${ourbigbook.AT_MENTION_CHAR}${test.user.username}` }, opts)
  }
  return test.webApi.articleCreateOrUpdate(article, opts, reqOpts)
}

async function createArticles(sequelize, author, opts) {
  const articleArg = createArticleArg(opts, author)
  const { articles } = await convert.convertArticle({
    author,
    bodySource: articleArg.bodySource,
    path: opts.path,
    parentId: articleArg.parentId || `${ourbigbook.AT_MENTION_CHAR}${author.username}`,
    render: opts.render,
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
  let {
    canTestNext,
    // If given then all api requests automatically check this status, usually 200.
    // Then if you want to assert a non-200 status inside that test, you have to
    // pass "expectStatus" to the corresponding API call.
    //
    // Once every test is migrated to use 200, we'll just make it default.
    // This should have been our initial approach to start with. It just requires
    // some work of adding the extra parameter to every single api call.
    defaultExpectStatus,
  } = opts
  canTestNext = canTestNext === undefined ? false : canTestNext
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
      expectStatus: defaultExpectStatus,
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

it('Article.getArticlesInSamePage simple', async function test_Article__getArticlesInSamePage() {
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

  // Logged off
  rows = await Article.getArticlesInSamePage({
    article,
    getTagged: true,
    loggedInUser: undefined,
    sequelize,
  })
  assertRows(rows, [
    { slug: 'user0/title-0-0',   topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
    { slug: 'user0/title-0-0-0', topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
    { slug: 'user0/title-0-1',   topicCount: 1, issueCount: 0, hasSameTopic: false, liked: false },
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
  await convert.convertDiscussion({
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

it('Article.getArticlesInSamePage with render=false then render=true', async function test_Article__getArticlesInSamePageRenderFalse() {
  let rows
  let article_0_0, article_0_0_0, article_1_0, article
  const sequelize = this.test.sequelize
  const { Article } = sequelize.models
  const user0 = await createUser(sequelize, 0)

  // Create some articles.
  for (const render of [false, true]) {
    await createArticle(sequelize, user0, { render, titleSource: 'Title 0' })
    await createArticle(sequelize, user0, { render, titleSource: 'Title 0 1', parentId: '@user0/title-0' })
    await createArticle(sequelize, user0, {
      titleSource: 'Title 0 0',
      bodySource: '{tag=Title 0 1}\n',
      parentId: '@user0/title-0',
      render,
    })
    await createArticle(sequelize, user0, { render, titleSource: 'Title 0 0 0', parentId: '@user0/title-0-0'  })
  }

  // Test it.
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
})

it('Article.rerender', async function() {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const { Article } = sequelize.models
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
      ;({data, status} = await createArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/mathematics' }))
      assertStatus(status, data)
      const physicsArticle = data.articles[0]
      const physicsHash = physicsArticle.file.hash

      // Sanity check.
      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
        { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
      ])

    // Rerender does not set previousSibligId to undefined (thus moving article as first child).
    await Article.rerender({ slugs: ['user0/physics'] })
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
    ])

    // Rerender does not modify the article hash. Was happening because we were calculating hash
    // with previousSiblingId undefined https://github.com/ourbigbook/ourbigbook/issues/322
    ;({data, status} = await test.webApi.article('user0/physics'))
    assertStatus(status, data)
    assert.strictEqual(data.file.hash, physicsHash)
    // It also does not modify updatedAt.
    assert.strictEqual(data.updatedAt, physicsArticle.updatedAt)

    // Works with OurBigBook predefined macros.
    await Article.rerender({ slugs: ['user0/mathematics'] })
    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/physics' },
    ])

    // Works for root article.
    await Article.rerender({ slugs: ['user0'] })
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
      ;({data, status} = await createArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/mathematics' }))
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

  async function getTopicIds(topicIds, count=true) {
    const ret = await sequelize.models.Topic.getTopics({
      sequelize,
      articleOrder: 'topicId',
      articleWhere: { topicId: topicIds },
      count,
    })
    if (count) {
      return ret.rows
    } else {
      return ret
    }
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
  // Also check that count: false works.
  assertRows(
    await getTopicIds(['title-0'], false),
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
        // Article source
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleSource('user0/title-0'), ))
        assertStatus(status, data)
        // Article that doesn't exist.
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/dontexist'), ))
        assert.strictEqual(status, 404)
        // Article source that doesn't exist.
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleSource('user0/dontexist'), ))
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
    }, { expectStatus: 403 }))
    ;({data, status} = await test.webApi.user('user0'))
    assert.strictEqual(data.maxArticles, config.maxArticles)

    // Admin users can edit other users' resource limits.

      test.loginUser(admin)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        maxArticles: 3,
        maxArticleSize: 3,
        maxUploads: 2,
        maxUploadSize: 2,
        maxIssuesPerMinute: 3,
        maxIssuesPerHour: 3,
        locked: true,
      }))
      test.loginUser(user)

      ;({data, status} = await test.webApi.user('user0'))
      assertRows([data], [{
        username: 'user0',
        maxArticles: 3,
        maxArticleSize: 3,
        maxUploads: 2,
        maxUploadSize: 2,
        maxIssuesPerMinute: 3,
        maxIssuesPerHour: 3,
        locked: true,
      }])

      // Restore locked to false because this will cause problems with the following tests.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        locked: false,
      }))
      test.loginUser(user)

    // Article.

      // maxArticleSize resource limit is enforced for non-admins.
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await createArticleApi(test, article, {}, { expectStatus: 403 }))

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      article = createArticleArg({ i: 0, bodySource: 'abcd' })
      ;({data, status} = await createArticleApi(test, article))
      test.loginUser(user)

      // OK, second article including Index.
      article = createArticleArg({ i: 0, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))

      // maxArticleSize resource limit is enforced for all users.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article, {}, { expectStatus: 422 }))

      // Even admin.
      test.loginUser(admin)
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article, {}, { expectStatus: 422 }))
      test.loginUser(user)

      // OK 2, third article including Index.
      article = createArticleArg({ titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))

      // maxArticles resource limit is enforced for non-admins.
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article, {}, { expectStatus: 403 }))

      // maxArticles resource limit is enforced for non-admins when creating article with PUT.
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, {}, { expectStatus: 403 }))

      // OK 2 for admin.
      test.loginUser(admin)
      article = createArticleArg({ i: 1, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      article = createArticleArg({ i: 2, bodySource: 'abc' })
      ;({data, status} = await createArticleApi(test, article))
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
//      test.loginUser(user)
//
//      // This should count as just one, totalling 4.
//      article = createArticleArg({ i: 2, bodySource: `== Title 2 1
//` })
//      ;({data, status} = await createArticleApi(test, article))
//
//      // So now we can still do one more, totalling 5.
//      article = createArticleArg({ i: 3, bodySource: `abc`})
//      ;({data, status} = await createArticleApi(test, article))

    // Issue.

      // Change limit to 2 now that we don't have Index.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.userUpdate('user0', {
        maxArticles: 2,
        maxArticleSize: 3,
      }))
      ;({data, status} = await test.webApi.user('user0'))
      test.loginUser(user)

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0',
        createIssueArg(0, 0, 0, { bodySource: 'abcd' }),
        { expectStatus: 403 }
      ))

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abcd' })))
      test.loginUser(user)

      // OK.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))

      // maxArticleTitleSize resource limit is enforced for all users.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' }),
        { expectStatus: 422 }
      ))

      // Even admin.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize + 1), bodySource: 'abc' }),
        { expectStatus: 422 }
      ))
      test.loginUser(user)

      // OK 2.
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(
        0, 0, 0, { titleSource: '0'.repeat(config.maxArticleTitleSize), bodySource: 'abc' })))

      // maxArticles resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.issueCreate(
        'user0/title-0',
        createIssueArg(0, 0, 0, { bodySource: 'abc' }),
        { expectStatus: 403 }
      ))

      // OK 2 for admin.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(0, 0, 0, { bodySource: 'abc' })))
      test.loginUser(user)

    // Comment.

      // maxArticleSize resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd', { expectStatus: 403 }))

      // maxArticleSize resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abcd'))
      test.loginUser(user)

      // OK.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))

      // OK 2.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))

      // maxArticles resource limit is enforced for non-admins.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc', { expectStatus: 403 }))

      // OK 2 for admin.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      test.loginUser(user)

      // maxArticles resource limit is not enforced for admins.
      test.loginUser(admin)
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, 'abc'))
      test.loginUser(user)

    // Upload.

      // Max upload size is enforced for non-admins.
      ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile1.txt', '000', { expectStatus: 403 }))

      // Max uploads is enforced for non-admins.
      ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile1.txt', '11'))
      ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile2.txt', '22'))
      // Update does not blow up the max.
      ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile2.txt', '23'))
      ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile3.txt', '33', { expectStatus: 403 }))

  }, { defaultExpectStatus: 200 })
})

it(`api: user: locked users can't do much`, async () => {
  await testApp(async (test) => {
    let data, status, article

    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    const admin = await test.createUserApi(2)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user2' } })

    // Create a test article and issue by user1.

      test.loginUser(user1)

      article = createArticleArg({ i: 0 })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 1 })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issueCreate('user1/title-0', createIssueArg(1, 0, 0)))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issueCreate('user1/title-0', createIssueArg(1, 0, 0)))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.commentCreate('user1/title-0', 1, '= The header\n\n==The body\n'))
      assertStatus(status, data)

    // Create some items by user0.

      test.loginUser(user0)

      article = createArticleArg({ i: 0 })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(1, 0, 0)))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.articleLike('user1/title-0'))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.articleFollow('user1/title-0'))
      assertStatus(status, data)

      ;({data, status} = await test.webApi.issueFollow('user1/title-0', 1))
      assertStatus(status, data)

    // Lock user0
    test.loginUser(admin)
    ;({data, status} = await test.webApi.userUpdate('user0', {
      locked: true,
    }))
    assertStatus(status, data)

    // Check that user0 cannot do stuff.

      test.loginUser(user0)

      // Locked users cannot edit their own profile
      ;({ data, status } = await test.webApi.userUpdate(
        'user0', { displayName: 'hacked', },
      ))
      assert.strictEqual(status, 403)

      // Locked users cannot follow users.
      ;({data, status} = await test.webApi.userFollow('user0'))
      assert.strictEqual(status, 403)

      // Locked users cannot create articles.
      article = createArticleArg({ i: 1 })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 403)

      // Locked users cannot edit their own articles.
      article = createArticleArg({ i: 0, body: 'hacked' })
      ;({data, status} = await createArticleApi(test, article))
      assert.strictEqual(status, 403)

      // Locked users cannot announce their own articles.
      ;({data, status} = await test.webApi.articleAnnounce('user0/title-0', 'My message.'))
      assert.strictEqual(status, 403)

      // Locked users cannot unlike articles.
      ;({data, status} = await test.webApi.articleUnlike('user1/title-0'))
      assert.strictEqual(status, 403)

      // Locked users cannot like articles.
      ;({data, status} = await test.webApi.articleLike('user1/title-1'))
      assert.strictEqual(status, 403)

      // Locked users cannot unfollow articles.
      ;({data, status} = await test.webApi.articleUnfollow('user1/title-0'))
      assert.strictEqual(status, 403)

      // Locked users cannot follow articles.
      ;({data, status} = await test.webApi.articleFollow('user1/title-1'))
      assert.strictEqual(status, 403)

      // Locked users cannot create discussions.
      article = createArticleArg({ i: 1 })
      ;({data, status} = await test.webApi.issueCreate('user0/title-0', createIssueArg(1, 0, 0)))
      assert.strictEqual(status, 403)

      // Locked users cannot edit their own discussions.
      ;({data, status} = await test.webApi.issueEdit('user0/title-0', 1, { bodySource: 'hacked' }))
      assert.strictEqual(status, 403)

      // Locked users cannot unfollow discussions
      ;({data, status} = await test.webApi.issueUnfollow('user1/title-0', 1))
      assert.strictEqual(status, 403)

      // Locked users cannot follow discussions
      ;({data, status} = await test.webApi.issueFollow('user1/title-0', 2))
      assert.strictEqual(status, 403)

      // Locked users cannot create comments.
      ;({data, status} = await test.webApi.commentCreate('user0/title-0', 1, '= The header\n\n==The body\n'))
      assert.strictEqual(status, 403)
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

        // The convert function has some massive if(render) cases, so let's test all error cases for both
        for (const render of [false, true]) {
          // Parent ID that doesn't exist gives an error on new article.
          article = createArticleArg({ i: 0, titleSource: 'Physics' })
          ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/dontexist', render }))
          assert.strictEqual(status, 422)

          // Parent ID that doesn't exist gives an error on existing article.
          article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/dontexist', render }))
          assert.strictEqual(status, 422)

          // It is not possible to change the index parentId.
          article = createArticleArg({ i: 0, titleSource: '' })
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
          assert.strictEqual(status, 422)

          // It it not possible to set the parentId to an article of another user.
          article = createArticleArg({ i: 0, titleSource: 'Physics' })
          ;({data, status} = await createArticleApi(test, article, { parentId: '@user1', render }))
          assert.strictEqual(status, 422)

          // Circular parent loops fail gracefully.
          // Related:
          // * https://github.com/ourbigbook/ourbigbook/issues/204
          // * https://github.com/ourbigbook/ourbigbook/issues/319#issuecomment-2662912799
          article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/calculus', render }))
          assert.strictEqual(status, 422)
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
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
          assertStatus(status, data)

          // Circular parent loops to self fail gracefully.
          article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
          ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
          assert.strictEqual(status, 422)
        }

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

        for (const render of [false, true]) {
          // previousSiblingId that does not exist fails
          ;({data, status} = await createOrUpdateArticleApi(test,
            createArticleArg({ i: 0, titleSource: 'Limit' }),
            { parentId: undefined, previousSiblingId: '@user0/dontexist', render }
          ))
          assert.strictEqual(status, 422)

          // previousSiblingId empty string fails
          ;({data, status} = await createOrUpdateArticleApi(test,
            createArticleArg({ i: 0, titleSource: 'Limit' }),
            { parentId: undefined, previousSiblingId: '', render }
          ))
          assert.strictEqual(status, 422)

          // previousSiblingId that is not a child of parentId fails
          ;({data, status} = await createOrUpdateArticleApi(test,
            createArticleArg({ i: 0, titleSource: 'Limit' }),
            { parentId: '@user0/mathematics', previousSiblingId: '@user0/derivative', render }
          ))
          assert.strictEqual(status, 422) }

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
    let data, status, article, ref
    const sequelize = test.sequelize
    const { Ref } = sequelize.models
    const user = await test.createUserApi(0)
    test.loginUser(user)

    let render

    render = false

      // Create user0/mathematics
      article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '<calculus>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { render }))
      assertStatus(status, data)

      // Parent Ref is setup correctly even with render=false.
      ref = await Ref.findOne({
        where: {
          from_id: '@user0',
          to_id: '@user0/mathematics',
          type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
      })
      assert.strictEqual(ref.to_id_index, 0)

      // Create user0/calculus
      article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '<mathematics>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
      assertStatus(status, data)

      // Parent Ref is setup correctly even with render=false.
      ref = await Ref.findOne({
        where: {
          from_id: '@user0/mathematics',
          to_id: '@user0/calculus',
          type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
      })
      assert.strictEqual(ref.to_id_index, 0)

      // Create user0/physics
      article = createArticleArg({ i: 0, titleSource: 'Physics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/mathematics', render }))
      assertStatus(status, data)

      // Parent Ref is setup correctly even with render=false.
      ref = await Ref.findOne({
        where: {
          from_id: '@user0',
          to_id: '@user0/physics',
          type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
      })
      assert.strictEqual(ref.to_id_index, 1)

    // Now the same sequence with render=true
    render = true

      await assertNestedSets(sequelize, [
        { nestedSetIndex: 0, nestedSetNextSibling: 1, depth: 0, to_id_index: null, slug: 'user0' },
      ])

      article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '<calculus>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { render }))
      assertStatus(status, data)

        // The author is following the article.
        ;({data, status} = await test.webApi.article('user0/mathematics'))
        assertStatus(status, data)
        assert.strictEqual(data.followerCount, 1)

        // Topics are created.
        ;({data, status} = await test.webApi.topics({ topicId: 'mathematics' }))
        assertStatus(status, data)
        assert.strictEqual(data.topics[0].topicId, 'mathematics')

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 2, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
        ])

      article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: '<mathematics>' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
      assertStatus(status, data)

        // The author is following the article.
        ;({data, status} = await test.webApi.article('user0/calculus'))
        assertStatus(status, data)
        assert.strictEqual(data.followerCount, 1)

        // Topics are created.
        ;({data, status} = await test.webApi.topics({ topicId: 'calculus' }))
        assertStatus(status, data)
        assert.strictEqual(data.topics[0].topicId, 'calculus')

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
        ])

      article = createArticleArg({ i: 0, titleSource: 'Physics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/mathematics', render }))
      assertStatus(status, data)

        // The author is following the article.
        ;({data, status} = await test.webApi.article('user0/physics'))
        assertStatus(status, data)
        assert.strictEqual(data.followerCount, 1)

        // Topics are created.
        ;({data, status} = await test.webApi.topics({ topicId: 'physics' }))
        assertStatus(status, data)
        assert.strictEqual(data.topics[0].topicId, 'physics')

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 4, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
          { nestedSetIndex: 3, nestedSetNextSibling: 4, depth: 1, to_id_index: 1, slug: 'user0/physics' },
        ])
  })
})

it('api: article tree render=true on parent that only has render=false does not blow up', async () => {
  await testApp(async (test) => {
    let data, status, article, ref
    const user = await test.createUserApi(0)
    test.loginUser(user)

    let render

    render = false

      // Create user0/mathematics
      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { render }))
      assertStatus(status, data)

      // Create user0/calculus
      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
      assertStatus(status, data)

    // Now the same sequence with render=true
    render = true

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
      assertStatus(status, data)
  })
})

it('api: article tree render=true on previousSiblingId that only has render=false does not blow up', async () => {
  await testApp(async (test) => {
    let data, status, article, ref
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    let render

    render = false

      // Create user0/mathematics
      article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { render }))
      assertStatus(status, data)

      // Create user0/calculus
      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics', render }))
      assertStatus(status, data)

      // Create user0/calculus
      article = createArticleArg({ i: 0, titleSource: 'Algebra' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/calculus', render }))
      assertStatus(status, data)

    // Now the same sequence with render=true
    render = true

      article = createArticleArg({ i: 0, titleSource: 'Algebra' })
      ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/calculus', render }))
      assertStatus(status, data)
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

      // Conversion with updateNestedSetIndex: false makes nestedSetNeedsUpdate true.

        article = createArticleArg({ i: 0, titleSource: 'Mathematics' })
        ;({data, status} = await createOrUpdateArticleApi(test, article, { updateNestedSetIndex: false }))
        assertStatus(status, data)
        assert.strictEqual(data.nestedSetNeedsUpdate, true)

        ;({data, status} = await test.webApi.user('user0'))
        assertStatus(status, data)
        assert.strictEqual(data.nestedSetNeedsUpdate, true)

        // The new article simply does not have nested set index position.
        // The parent Ref is correct however.
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

      // articleUpdatedNestedSet fixes the tree and updates the nested set index

        ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
        assertStatus(status, data)

        await assertNestedSets(sequelize, [
          { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
          { nestedSetIndex: 1, nestedSetNextSibling: 3, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
          { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 2, to_id_index: 0, slug: 'user0/calculus' },
        ])

        // User.nestedSetNeedsUpdate becomes false after the nested se is updated
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

    // nestedSetNeedsUpdate remains false when there are no tree changes.
    article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: 'Hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)

    // nestedSetNeedsUpdate becomes true when there are tree changes and render=false.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, true)
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, true)

    // createOrUpdateArticleApi nestedSetNeedsUpdate return is false when there are no tree changes and render=false.
    // It does not consider the current user.nestedSetNeedsUpdate state, it only informs if the
    // current change would have modified that state or not.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, true)

    // Move math up with a full render.
    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)

    await assertNestedSets(sequelize, [
      { nestedSetIndex: 0, nestedSetNextSibling: 3, depth: 0, to_id_index: null, slug: 'user0' },
      { nestedSetIndex: 1, nestedSetNextSibling: 2, depth: 1, to_id_index: 0, slug: 'user0/mathematics' },
      { nestedSetIndex: 2, nestedSetNextSibling: 3, depth: 1, to_id_index: 1, slug: 'user0/calculus' },
    ])

    // nestedSetNeedsUpdate remains false when there are tree changes, but we are updating the index;
    article = createArticleArg({ i: 0, titleSource: 'Calculus', bodySource: 'Hacked 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)
    ;({data, status} = await test.webApi.user('user0'))
    assertStatus(status, data)
    assert.strictEqual(data.nestedSetNeedsUpdate, false)
  })
})

it('api: article tree: updateNestedSetIndex=false circular loop check is done with Ref and not nested set index', async () => {
  // Reproduction for: https://github.com/ourbigbook/ourbigbook/issues/319#issuecomment-2662912799
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

      article = createArticleArg({
        i: 0,
        titleSource: 'Mathematics',
      })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Physics' })
      ;({data, status} = await createArticleApi(test, article, { parentId: undefined, previousSiblingId: '@user0/mathematics' }))
      assertStatus(status, data)
      const physicsHash = data.articles[0].file.hash

    // New articles with updateNestedSetIndex=false

      // Create.
      // 0
      //  1
      //   2
      //   3
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 }), { updateNestedSetIndex: false }))
      assertStatus(status, data)
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 2 }), { parentId: '@user0/title-1', updateNestedSetIndex: false }))
      assertStatus(status, data)
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 3 }), { parentId: undefined, previousSiblingId: '@user0/title-2', updateNestedSetIndex: false }))
      assertStatus(status, data)
      //;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 4 }), { previousSiblingId: '@user0/title-3', updateNestedSetIndex: false }))
      //assertStatus(status, data)
      ;({data, status} = await test.webApi.articleUpdatedNestedSet('user0'))
      assertStatus(status, data)

      //;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 5 }), { previousSiblingId: '@user0/title-4', updateNestedSetIndex: false }))
      //assertStatus(status, data)
      //;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 }), { parentId: '@user0/title-5', updateNestedSetIndex: false }))
      //assertStatus(status, data)

      // Move to.
      // 0
      //  1
      //   3
      //  2
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 2 }), { parentId: undefined, previousSiblingId: '@user0/title-1', updateNestedSetIndex: false }))
      assertStatus(status, data)

      // Move to.
      // 0
      //  2
      //   1
      //    3
      // This is the main initial point of this test
      // At one point this was blowing up on an incorrect safety check because were checking
      // for parentId loops based on nested set, which is out of date relative to the canonical Ref.
      // The database was semi-safe because we also did a check for this at render time, but it was horrendous.
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 }), { parentId: '@user0/title-2', updateNestedSetIndex: false }))
      assertStatus(status, data)
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

it('api: child articles inherit scope from previousSiblingId', async () => {
  // Parent is calculated from previousSiblingId, and then its scope
  // is used as if parentId had been passed. Yes it is that bad, this was once broken.
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '{scope}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)

    article = createArticleArg({ i: 0, titleSource: 'Calculus' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/mathematics' }))
    assertStatus(status, data)

    article = createArticleArg({ i: 0, titleSource: 'Algebra' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { 
      parentId: undefined,
      previousSiblingId: '@user0/mathematics/calculus'
    }))
    assertStatus(status, data)

    ;({data, status} = await test.webApi.article('user0/mathematics/algebra'))
    assertStatus(status, data)
    assert.strictEqual(data.titleRender, 'Algebra')
  })
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
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: undefined, render: false }))
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
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/path/to/main.S', 'content-0'))
    article = createArticleArg({ i: 0, titleSource: 'path/to/main.S', bodySource: '{file}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { path: '_file/path/to/main.S' }))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.article('user0/_file/path/to/main.S'))
    assertStatus(status, data)
    assert.notStrictEqual(data, undefined)

    // Also works without explicit path.
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/path/to/main2.S', 'content-0'))
    article = createArticleArg({ i: 0, titleSource: 'path/to/main2.S', bodySource: '{file}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.article('user0/_file/path/to/main2.S'))
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

    // New articles created with hideArticleDates=false don't have empty date.
    article = createArticleArg({ i: 0, titleSource: 'Before' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    ;({data, status} = await test.webApi.article('user0/before'))
    assert.notStrictEqual(data.createdAt, undefined)
    assert.notStrictEqual(data.updatedAt, undefined)

    // Set hideArticleDates to true.
    ;({data, status} = await test.webApi.userUpdate('user0', {
      hideArticleDates: true,
    }))

    // New articles created after hideArticleDates=true have empty date.
    article = createArticleArg({ i: 0, titleSource: 'After' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    ;({data, status} = await test.webApi.article('user0/after'))
    assert.strictEqual(data.createdAt, undefined)
    assert.strictEqual(data.updatedAt, undefined)

    // Updates hide the updatedAt date of existing articles.
    article = createArticleArg({ i: 0, titleSource: 'Before' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    ;({data, status} = await test.webApi.article('user0/before'))
    assert.notStrictEqual(data.createdAt, undefined)
    assert.strictEqual(data.updatedAt, undefined)
  }, { defaultExpectStatus: 200 })
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

it(`api: topic links don't have the domain name`, async () => {
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

it('api: circular parent loop to self synonym fails gracefully', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    article = createArticleArg({ i: 0, titleSource: 'h2', bodySource: '= h2 2\n{synonym}\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)

    article = createArticleArg({ i: 0, titleSource: 'h2', bodySource: '= h2 2\n{synonym}\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h2-2', render: false }))
    assert.strictEqual(status, 422)

    article = createArticleArg({ i: 0, titleSource: 'h2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/h2-2', render: false }))
    assert.strictEqual(status, 422)
  })
})

it('api: synonyms lead to o sensible redirects', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    article = createArticleArg({ i: 0, titleSource: 'h2', bodySource: '= h2 2\n{synonym}\n' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    assertStatus(status, data)

    if (testNext) {
      // Tests with the same result for logged in or off.
      async function testNextLoggedInOrOff(loggedInUser) {
        // Non-synonym sanity check. 
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/h2')))
        assertStatus(status, data)

        // Article page synonym redirect
        ;({data, status} = await test.sendJsonHttp('GET', routes.article('user0/h2-2')))
        assert.strictEqual(status, 308)
        assert.strictEqual(data, routes.article('user0/h2'))

        // Article source page synonym redirect
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleSource('user0/h2-2')))
        assert.strictEqual(status, 308)
        assert.strictEqual(data, routes.articleSource('user0/h2'))

        // Discussion page synonym redirect
        ;({data, status} = await test.sendJsonHttp('GET', routes.articleIssues('user0/h2-2')))
        assert.strictEqual(status, 308)
        assert.strictEqual(data, routes.articleIssues('user0/h2'))
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

it('api: article split synonym to descendant does not go into infinite loop', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // user0
    //   h2 (h2 2)
    article = createArticleArg({ i: 0, titleSource: 'h2', bodySource: '= h2 2\n{synonym}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)

    // We need render=false here because we are temporarily duplicating the ID,
    // h2-2, and duplicate checks run on render=true only.
    //
    // user0
    //   h2 2
    //   h2 (h2 2)
    article = createArticleArg({ i: 0, titleSource: 'h2 2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false }))
    assertStatus(status, data)

    // user0
    //   h2 2
    //     h2
    article = createArticleArg({ i: 0, titleSource: 'h2' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false, parentId: '@user0/h2-2' }))
    assertStatus(status, data)

    // This is where it was going infinite, because when we set h2's parent to h2-2,
    // at one point it was picking up that h2-2 is still a synonym of h2, which made
    // h2 the parent of itself. Then when adding h3 below it, the h3 parent loop check
    // went into an infinite loop.
    //
    // user0
    //   h2 2
    //     h2
    //       h3
    article = createArticleArg({ i: 0, titleSource: 'h3' })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { render: false, parentId: '@user0/h2' }))
    assertStatus(status, data)
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

it(`api: profile picture`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    const base64 = PNG_1X1_WHITE_BUFFER.toString('base64')

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

// Closely related: https://github.com/ourbigbook/ourbigbook/issues/334
it(`api: link to home article`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
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
    ;({data, status} = await test.webApi.article('user0'))
    // titleSource actually changed on DB.
    assert.strictEqual(data.titleSource, 'My custom home')
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()='My custom home']`, data.render)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()=' Home']`, data.render)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      i: 0,
      bodySource: `<>

<My custom home>
`,
    })))
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()='My custom home']`, data.render)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user0' and text()=' Home']`, data.render)

    // Can also edit the index with path and without {id=}
    test.loginUser(user1)
    ;({data, status} = await createOrUpdateArticleApi(test, {
      titleSource: 'My custom home 2',
      bodySource: `<>

<My custom home 2>
`,
      },
      {
        parentId: undefined,
        path: 'index',
      }
    ))
    ;({data, status} = await test.webApi.article('user1'))
    // titleSource actually changed on DB.
    assert.strictEqual(data.titleSource, 'My custom home 2')
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user1' and text()='My custom home 2']`, data.render)
    assert_xpath(`//x:div[@class='p']//x:a[@href='/user1' and text()=' Home']`, data.render)
  }, { defaultExpectStatus: 200 })
})

// Closely related: https://github.com/ourbigbook/ourbigbook/issues/364
it(`api: link to self`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    ;({data, status} = await createOrUpdateArticleApi(test, {
      titleSource: 'Test data 0',
      bodySource: '',
    }))
    ;({data, status} = await createOrUpdateArticleApi(test, {
      titleSource: 'Test data',
      bodySource: `<test-data>

<test data>{id=dut}

<test data 0>{id=sanity}
`,
    }))
    ;({data, status} = await test.webApi.article('user0/test-data'))
    assert_xpath(`//x:a[@id='user0/dut' and @href='/user0/test-data']`, data.render)
    assert_xpath(`//x:a[@id='user0/sanity' and @href='/user0/test-data-0']`, data.render)
  }, { defaultExpectStatus: 200 })
})

it(`api: article path argument`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // path takes precedence over title and id=
    ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: 'fromtitle',
        bodySource: `{id=fromid}\n`
      },
      { path: 'frompath' }
    ))
    ;({data, status} = await test.webApi.article('user0/frompath'))
    assert.notStrictEqual(data, undefined)
    ;({data, status} = await test.webApi.article('user0/fromid'))
    assert.strictEqual(data, undefined)
    ;({data, status} = await test.webApi.article('user0/fromtitle'))
    assert.strictEqual(data, undefined)

    // Without path, id= wins
    ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: 'fromtitle',
        bodySource: `{id=fromid}\n`
      },
      { path: undefined }
    ))
    ;({data, status} = await test.webApi.article('user0/fromid'))
    assert.notStrictEqual(data, undefined)
    ;({data, status} = await test.webApi.article('user0/fromtitle'))
    assert.strictEqual(data, undefined)

    // Without path and id, title wins
    ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: 'fromtitle',
        bodySource: ``
      },
      { path: undefined }
    ))
    ;({data, status} = await test.webApi.article('user0/fromtitle'))
    assert.notStrictEqual(data, undefined)

    // Path cannot be empty
    ;({data, status} = await createOrUpdateArticleApi(test,
      { titleSource: 'given' },
      { path: '' },
      { expectStatus: 422 },
    ))

    // path equals possibly special value of "index".
    // TODO we need to think about this. Arguably this should force empty id=''
    // as being the home article.
    // Closely related is: https://github.com/ourbigbook/ourbigbook/issues/334
    // perhaps is we made this be recognized that would be immediately solved.
    ;({data, status} = await createOrUpdateArticleApi(test, {
        titleSource: 'My custom home',
        bodySource: `hacked`
      },
      {
        path: 'index',
        parentId: undefined,
      }
    ))
    ;({data, status} = await test.webApi.article('user0'))
    assert.strictEqual(data.titleSource, 'My custom home')
    ;({data, status} = await test.webApi.article('user0/my-custom-home'))
    assert.strictEqual(data, undefined)
  }, { defaultExpectStatus: 200 })
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
    assert.strictEqual(lastEmail.to, 'user1@mail.com')
    assert.strictEqual(lastEmail.subject, 'Announcement: Title 0')
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 })))
    assertStatus(status, data)
    ;({data, status} = await test.webApi.articleAnnounce(`user0/title-1`, 'My message.'))
    assertStatus(status, data)
    assert.strictEqual(lastEmail.to, 'user1@mail.com')
    assert.strictEqual(lastEmail.subject, 'Announcement: Title 0')

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

it('api: article: parent and parent-type', async () => {
  await testApp(async (test) => {
    let data, status, article
    const sequelize = test.sequelize
    const user = await test.createUserApi(0)
    test.loginUser(user)

    // Create articles

      article = createArticleArg({ i: 0, titleSource: 'Good' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Mathematics', bodySource: '{tag=Good}' })
      ;({data, status} = await createArticleApi(test, article))
      assertStatus(status, data)

      article = createArticleArg({ i: 0, titleSource: 'Calculus' })
      ;({data, status} = await createArticleApi(test, article, { parentId: '@user0/mathematics' }))
      assertStatus(status, data)

    // Test parent and parent-type

      // Calculus is a direct child of mathematics
      ;({data, status} = await test.webApi.articles({ parent: '@user0/mathematics' }))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user0/calculus' },
      ])

      // Mathematics is tagged as good
      ;({data, status} = await test.webApi.articles({
        parent: '@user0/good',
        'parent-type': ourbigbook.REFS_TABLE_X_CHILD }
      ))
      assertStatus(status, data)
      assertRows(data.articles, [
        { slug: 'user0/mathematics' },
      ])

      // Unknown parent-type blows up gracefully.
      ;({data, status} = await test.webApi.articles({
        parent: '@user0/good',
        'parent-type': 'i-dont-exist' }
      ))
      assert.strictEqual(status, 422)
  })
})

it(`api: article: automatic topic linking`, async () => {
  // https://github.com/ourbigbook/ourbigbook/issues/356
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user0' } })
    test.loginUser(user0)

    // Fix the max just in case the default chances one day.
    ;({ data, status } = await test.webApi.siteSettingsUpdate({
      automaticTopicLinksMaxWords: 3
    }))

    // Create some pre-existing articles.
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'aa1', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'aa2 bb2', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'aa3 bb3 cc3', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'dog', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'common1 common2 common3 common4 common5', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'common1 common2 common3 common4', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'common1 common2 common3', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'common1 common2', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'common1', i: 0 })))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ titleSource: 'i', i: 0 })))
    assertStatus(status, data)

    // Create the final article title0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      bodySource: `> XXX aa1 YYY
{id=1}

> XXX aa2 bb2 YYY
{id=2}

> XXX aa3 bb3 cc3 YYY
{id=3}

> XXX aa2  bb2 YYY
{id=two-spaces}

> XXX aa2.bb2 YYY
{id=punct}

> XXX aa2. bb2 YYY
{id=punct-space}

> XXX aa2 \\i[bb2] YYY
{id=inline}

> XXX common1 YYY
{id=test-common-1}

> XXX common1 common2 YYY
{id=test-common-1-2}

> XXX common1 common2 common3 YYY
{id=test-common-1-3}

> XXX common1 common2 common3 common4 YYY
{id=test-common-1-4}

> XXX common1 common2 common3 common4 common5 YYY
{id=test-common-1-5}

> XXX common2 YYY
{id=test-common-2}

> XXX common2 common3 YYY
{id=test-common-2-3}

> XXX common2 common3 common4 YYY
{id=test-common-2-4}

> XXX common2 common3 common5 YYY
{id=test-common-2-5}

> XXX common3 YYY
{id=test-common-3}

> XXX common3 common4 YYY
{id=test-common-3-4}

> XXX common3 common4 common5 YYY
{id=test-common-3-5}

> XXX http://example.com[aa1] YYY
{id=inlink}

> XXX <inxto>[aa2 bb2] YYY
{id=inx}

> aa1
{id=inxto}

> \\c[aa1]
{id=incode}

> \\m[aa1]
{id=inmath}

|| aa1
| 11
{id=in-table-header}

> http://aa1.com
{id=in-a}

> \\b[http://aa1.com]
{id=in-a-in-b}

> I
{id=single-letter-word}

> He and I are nice.
{id=single-letter-word-in-sentence}

> me
{id=blacklisted-word}

> dog
{id=singular}

> dogs
{id=plural}
`,
      i: 0,
    })))
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assert_xpath(`//x:div[@id='user0/1']//x:blockquote//x:a[@href='/go/topic/aa1' and text()='aa1']`, data.render)
    assert_xpath(`//x:div[@id='user0/2']//x:blockquote//x:a[@href='/go/topic/aa2-bb2' and text()='aa2 bb2']`, data.render)
    assert_xpath(`//x:div[@id='user0/3']//x:blockquote//x:a[@href='/go/topic/aa3-bb3-cc3' and text()='aa3 bb3 cc3']`, data.render)
    assert_xpath(`//x:div[@id='user0/two-spaces']//x:blockquote//x:a[@href='/go/topic/aa2-bb2' and text()='aa2  bb2']`, data.render)
    assert_xpath(`//x:div[@id='user0/punct']//x:blockquote[text()='XXX aa2.bb2 YYY']`, data.render)
    assert_xpath(`//x:div[@id='user0/punct-space']//x:blockquote[text()='XXX aa2. bb2 YYY']`, data.render)
    // This could be potentially changed one day. But for now it's hard and rare so leave it.
    assert_xpath(`//x:div[@id='user0/inline']//x:blockquote//x:a[@href='/go/topic/aa2-bb2']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/test-common-1']//x:blockquote//x:a[@href='/go/topic/common1' and text()='common1']`, data.render)
    assert_xpath(`//x:div[@id='user0/test-common-1-2']//x:blockquote//x:a[@href='/go/topic/common1-common2' and text()='common1 common2']`, data.render)
    assert_xpath(`//x:div[@id='user0/test-common-1-3']//x:blockquote//x:a[@href='/go/topic/common1-common2-common3' and text()='common1 common2 common3']`, data.render)
    assert_xpath(`//x:div[@id='user0/inlink']//x:blockquote//x:a[@href='/go/topic/aa1']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/inx']//x:blockquote//x:a[@href='/go/topic/aa1']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/incode']//x:blockquote//x:a[@href='/go/topic/aa1']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/inmath']//x:blockquote//x:a[@href='/go/topic/aa1']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/in-table-header']//x:blockquote//x:a[@href='/go/topic/aa1']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/in-a']//x:blockquote//x:a[@href='http://aa1.com' and text()='aa1.com']`, data.render)
    assert_xpath(`//x:div[@id='user0/in-a-in-b']//x:blockquote//x:b//x:a[@href='http://aa1.com' and text()='aa1.com']`, data.render)

    // These can be debated. We had removed them earlier, but decided to restore when we made the links invisible.
    assert_xpath(`//x:div[@id='user0/single-letter-word']//x:blockquote//x:a[@href='/go/topic/i' and text()='I']`, data.render)
    assert_xpath(`//x:div[@id='user0/single-letter-word-in-sentence']//x:blockquote//x:a[@href='/go/topic/i' and text()='I']`, data.render)

    assert_xpath(`//x:div[@id='user0/blacklisted-word']//x:blockquote//x:a[@href='/go/topic/me' and text()='Me']`, data.render, { count: 0 })
    assert_xpath(`//x:div[@id='user0/singular']//x:blockquote//x:a[@href='/go/topic/dog' and text()='dog']`, data.render)
    assert_xpath(`//x:div[@id='user0/plural']//x:blockquote//x:a[@href='/go/topic/dog' and text()='dogs']`, data.render)
  }, { defaultExpectStatus: 200 })
})

it(`api: site settings`, async () => {
  await testApp(
    async (test) => {
      let data, status, article
      const webApi = test.webApi

      // Create users
      const user0 = await test.createUserApi(0)
      await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user0' } })
      const user1 = await test.createUserApi(1)
      test.loginUser(user0)

      // Create article user0/title-0
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))
      // Create article user0/title-1
      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 1 })))

      // Update automaticTopicLinksMaxWords

        ;({ data, status } = await webApi.siteSettingsUpdate({
          automaticTopicLinksMaxWords: 1
        }))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 1)

        ;({ data, status } = await webApi.siteSettingsUpdate({
          automaticTopicLinksMaxWords: 2
        }))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 2)

        // Zero is fine.
        ;({ data, status } = await webApi.siteSettingsUpdate({
          automaticTopicLinksMaxWords: 0
        }))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 0)

        // Negative is not fine.
        ;({ data, status } = await webApi.siteSettingsUpdate(
          { automaticTopicLinksMaxWords: -1 },
          { expectStatus: 422 },
        ))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 0)

        // Has to be integer, string is not fine.
        ;({ data, status } = await webApi.siteSettingsUpdate(
          { automaticTopicLinksMaxWords: '1' },
          { expectStatus: 422 },
        ))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 0)

        // Non-admin cannot edit site settings
        test.loginUser(user1)
        ;({ data, status } = await webApi.siteSettingsUpdate(
          { automaticTopicLinksMaxWords: 1 },
          { expectStatus: 403 },
        ))
        test.loginUser(user0)
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 0)

        // Non-admin can read site settings
        test.loginUser(user1)
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.automaticTopicLinksMaxWords, 0)
        test.loginUser(user0)

      // Update pinned article.

        ;({ data, status } = await webApi.siteSettingsUpdate({
          pinnedArticle: 'user0/title-0'
        }))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.pinnedArticle, 'user0/title-0')

        ;({ data, status } = await webApi.siteSettingsUpdate({
          pinnedArticle: 'user0/title-1'
        }))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.pinnedArticle, 'user0/title-1')

        // Article that does not exit fails gracefully.
        ;({ data, status } = await webApi.siteSettingsUpdate(
          { pinnedArticle: 'user0/title-2' },
          { expectStatus: 404 },
        ))
        ;({ data, status } = await webApi.siteSettingsGet())
        assert.strictEqual(data.pinnedArticle, 'user0/title-1')
    },
    { defaultExpectStatus: 200 }
  )
})

it(`api: requests`, async () => {
  await testApp(async (test) => {
    let data, status, article

    const sequelize = test.sequelize
    const { ReferrerDomainBlacklist, Request } = sequelize.models
    config.trackRequests = true

    // Requests without referrer are not tracked.
    config.devIp = '123.123.123.1'
    const user0 = await test.createUserApi(0)
    assertRows(
      await Request.findAll({ order: [['createdAt', 'ASC']] }),
      []
    )

    // Requests with referrer are tracked.
    config.devIp = '123.123.123.1'
    ;({data, status} = await test.webApi.article('user0', {}, { headers: { referrer: 'http://example.com' } }))
    assertRows(
      await Request.findAll({ order: [['createdAt', 'ASC']] }),
      [
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
      ]
    )

    // Again to repeat
    config.devIp = '123.123.123.1'
    ;({data, status} = await test.webApi.article('user0', {}, { headers: { referrer: 'http://example.com' } }))
    assertRows(
      await Request.findAll({ order: [['createdAt', 'ASC']] }),
      [
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
      ]
    )

    // Another IP
    config.devIp = '123.123.123.2'
    ;({data, status} = await test.webApi.article('user0', {}, { headers: { referrer: 'http://example.com' } }))
    assertRows(
      await Request.findAll({ order: [['createdAt', 'ASC']] }),
      [
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
        { ip: '123.123.123.2', path: '/api/articles?id=user0', referrer: 'http://example.com' },
      ]
    )

    // Add to blacklist and check it does not get added anymore
    await ReferrerDomainBlacklist.create({ domain: 'example.com' })
    config.devIp = '123.123.123.1'
    ;({data, status} = await test.webApi.article('user0', {}, { headers: { referrer: 'http://example.com' } }))
    assertRows(
      await Request.findAll({ order: [['createdAt', 'ASC']] }),
      [
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
        { ip: '123.123.123.1', path: '/api/articles?id=user0', referrer: 'http://example.com' },
        { ip: '123.123.123.2', path: '/api/articles?id=user0', referrer: 'http://example.com' },
      ]
    )
  }, { defaultExpectStatus: 200 })
})

it(`api: article: bulk update`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    await test.sequelize.models.User.update({ admin: true }, { where: { username: 'user0' } })

    // Create article user1/title-0
    test.loginUser(user1)
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))
    ;({data, status} = await test.webApi.articles())
    assertRows(data.articles, [
      { slug: 'user1/title-0', list: true },
      { slug: 'user1', list: true },
      { slug: 'user0', list: true },
    ])

    // Non-admin users cannot do bulk update.
    ;({ data, status } = await test.webApi.articlesBulkUpdate(
      { username: 'user1' },
      { list: false },
      { expectStatus: 403 },
    ))
    ;({data, status} = await test.webApi.articles())
    assertRows(data.articles, [
      { slug: 'user1/title-0', list: true },
      { slug: 'user1', list: true },
      { slug: 'user0', list: true },
    ])

    // Admin can do bulk update
    test.loginUser(user0)
    ;({ data, status } = await test.webApi.articlesBulkUpdate(
      { username: 'user1' },
      { list: false },
    ))
    assert.strictEqual(data.count, 2)
    ;({data, status} = await test.webApi.articles())
    assertRows(data.articles, [
      { slug: 'user1/title-0', list: false },
      { slug: 'user1', list: false },
      { slug: 'user0', list: true },
    ])

    // Admin can do bulk update without username
    test.loginUser(user0)
    ;({ data, status } = await test.webApi.articlesBulkUpdate(
      { },
      { list: false },
    ))
    assert.strictEqual(data.count, 3)
    ;({data, status} = await test.webApi.articles())
    assertRows(data.articles, [
      { slug: 'user1/title-0', list: false },
      { slug: 'user1', list: false },
      { slug: 'user0', list: false },
    ])
  }, { defaultExpectStatus: 200 })
})

it(`api: article with {file}`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/subdir/myfile.txt', 'content-0'))

    // Create article user0/_file/subdir/myfile.txt
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `subdir/myfile.txt`,
      bodySource: `{file}`
    })))

    // Check that the article is there
    ;({data, status} = await test.webApi.article('user0/_file/subdir/myfile.txt'))
    assert.strictEqual(data.titleRender, 'subdir/myfile.txt')
    assert_xpath(
      `//x:a[@href='/user0/_dir' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}' and ` +
        `@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='@user0/${ourbigbook.FILE_PREFIX}/subdir/myfile.txt__']`,
      data.h1Render
    )
    assert_xpath(
      `//x:a[@href='/user0/_dir/subdir' and text()='subdir' and ` +
        `@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='@user0/${ourbigbook.FILE_PREFIX}/subdir/myfile.txt__subdir']`,
      data.h1Render
    )
    assert_xpath(
      `//x:a[@href='/user0/_raw/subdir/myfile.txt' and text()='myfile.txt' and ` +
        `@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='@user0/${ourbigbook.FILE_PREFIX}/subdir/myfile.txt__subdir/myfile.txt']`,
      data.h1Render
    )
  }, { defaultExpectStatus: 200 })
})

it(`api: article {synonymNoScope}`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)

    test.loginUser(user0)
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `With scope`,
      bodySource: `{scope}

= With synonymNoScope
{synonymNoScope}
`
    })))

    ;({data, status} = await test.webApi.articleRedirects({ id: 'user0/with-synonymnoscope' }))
    assert.strictEqual(data.redirects['user0/with-synonymnoscope'], 'user0/with-scope')

    // Previously the @username/ scope was being removed and
    // this would blow up with duplicate id "with-synonymNoScope".
    test.loginUser(user1)
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `With scope`,
      bodySource: `{scope}

= With synonymNoScope
{synonymNoScope}
`
    })))

    ;({data, status} = await test.webApi.articleRedirects({ id: 'user1/with-synonymnoscope' }))
    assert.strictEqual(data.redirects['user1/with-synonymnoscope'], 'user1/with-scope')
  }, { defaultExpectStatus: 200 })
})

it(`api: upload simple`, async () => {
  await testApp(async (test) => {
    let data, status, article
    const { Upload, UploadDirectory } = test.sequelize.models

    // Create users
    const user0 = await test.createUserApi(0)
    const user1 = await test.createUserApi(1)
    test.loginUser(user0)

    // Creation errors

      // Logged off user can't create uploads.
      test.disableToken()
      ;({data, status} = await test.webApi.uploadCreateOrUpdate(
        'user0/upload-0.png',
        'content-0',
        { expectStatus: 401 },
      ))
      test.loginUser(user0)

      // Cannot create upload for another user.
      ;({data, status} = await test.webApi.uploadCreateOrUpdate(
        'user1/upload-0.png',
        'content-0',
        { expectStatus: 403 },
      ))

    // Access errors

      // User exists path does not exist.
      ;({data, headers, status} = await test.webApi.upload('user0/i-dont-exist', { expectStatus: 404 }))

      // User does not exist.
      ;({data, headers, status} = await test.webApi.upload('i-dont-exist/somepath', { expectStatus: 404 }))

      // Empty
      ;({data, headers, status} = await test.webApi.upload('', { expectStatus: 422 }))

      // Empty path
      ;({data, headers, status} = await test.webApi.upload('user0', { expectStatus: 404 }))

      // Empty path with slash
      ;({data, headers, status} = await test.webApi.upload('user0/', { expectStatus: 404 }))

    // Create upload upload-0
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/upload-0.png', PNG_1X1_WHITE_BUFFER))

    // Check that the upload is there
    ;({data, headers, status} = await test.webApi.upload('user0/upload-0.png'))
    assert.strictEqual(data.equals(PNG_1X1_WHITE_BUFFER), true)
    assert.strictEqual(headers['content-type'], 'image/png')

    // Logged off user can view uploads.
    test.disableToken()
    ;({data, status} = await test.webApi.upload('user0/upload-0.png'))
    assert.strictEqual(data.equals(PNG_1X1_WHITE_BUFFER), true)
    assert.strictEqual(headers['content-type'], 'image/png')
    test.loginUser(user0)

    // Unknown extension type does not blow up
    ;({data, status} = await test.webApi.uploadCreateOrUpdate(
      'user0/not-utf8.asdfqwer',
      INVALID_UTF8_BUFFER
    ))

    // Check that the upload is there
    ;({data, headers, status} = await test.webApi.upload('user0/not-utf8.asdfqwer'))
    assert.strictEqual(data.equals(INVALID_UTF8_BUFFER), true)
    // If not UTF-8, gets considered as octet-stream.
    assert.strictEqual(headers['content-type'], 'application/octet-stream')

    // If valid UTF-8, getes considered as text/utf-8.
    const utf8Buffer = Buffer.from('my utf8 content \u{00E9}\n')
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/utf8.asdfqwer', utf8Buffer))
    ;({data, headers, status} = await test.webApi.upload('user0/utf8.asdfqwer'))
    assert.strictEqual(data.equals(utf8Buffer), true)
    assert.strictEqual(headers['content-type'], 'text/plain; charset=utf-8')

    // Create upload upload-0 for user1 as well
    test.loginUser(user1)
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user1/upload-0.png', PNG_1X1_WHITE_BUFFER))
    test.loginUser(user0)

    // Check that the upload is there
    ;({data, headers, status} = await test.webApi.upload('user1/upload-0.png'))
    assert.strictEqual(data.equals(PNG_1X1_WHITE_BUFFER), true)
    assert.strictEqual(headers['content-type'], 'image/png')

    // Subdir upload.
    ;({data, headers, status} = await test.webApi.uploadCreateOrUpdate('user0/subdir/myfile.txt', utf8Buffer))
    ;({data, headers, status} = await test.webApi.upload('user0/subdir/myfile.txt'))
    assert.strictEqual(data.equals(utf8Buffer), true)
    assert.strictEqual(headers['content-type'], 'text/plain; charset=utf-8')
    // An UploadDirectory was created with the new file.
    assert.notStrictEqual(await UploadDirectory.findOne({ where:
      { path: Upload.uidAndPathToUploadPath(user0.id, 'subdir') }
    }), null)

    // Hash
    ;({data, status} = await test.webApi.uploadHash({ author: 'user0' }))
    assertRows(data.uploads, [
      { path: 'user0/not-utf8.asdfqwer' },
      { path: 'user0/subdir/myfile.txt' },
      { path: 'user0/upload-0.png' },
      { path: 'user0/utf8.asdfqwer' },
    ])

    // Subdir 2
    const subdir2Buffer = Buffer.from(`subdir/subdir2/myfile.txt contents`)
    ;({data, headers, status} = await test.webApi.uploadCreateOrUpdate('user0/subdir/subdir2/myfile.txt', subdir2Buffer))
    ;({data, headers, status} = await test.webApi.upload('user0/subdir/subdir2/myfile.txt'))
    assert.strictEqual(data.equals(subdir2Buffer), true)
    assert.notStrictEqual(await UploadDirectory.findOne({ where:
      { path: Upload.uidAndPathToUploadPath(user0.id, 'subdir/subdir2') }
    }), null)

    // Link to file that doesn't exist blows up.
    ;({data, status} = await createOrUpdateArticleApi(test,
      createArticleArg({
        titleSource: `Link to file that does not exist`,
        bodySource: `\\a[i-dont-exist]`
      }),
      {},
      { expectStatus: 422 },
    ))

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `Link to another file same user`,
      bodySource: `\\a[subdir/myfile.txt]{id=link-to-another-file-same-user-dut}\n`
    })))
    ;({data, status} = await test.webApi.article('user0/link-to-another-file-same-user'))
    assert_xpath(`//x:a[@id='user0/link-to-another-file-same-user-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)

    // Ignored and does not blow up. An error message might be wise. But at least no blow up.
    ;({data, status} = await createOrUpdateArticleApi(test,
      createArticleArg({
        titleSource: `Link to another file same user provider github`,
        bodySource: `\\Image[subdir/myfile.txt]{id=link-to-another-file-same-user-provider-github-dut}{provider=github}\n`
      }),
      {},
      { expectStatus: 422 },
    ))
    // One day we can add a setting on web maybe to make this work. Ideally pick it up from ourbigbook.json.
    //;({data, status} = await test.webApi.article('user0/link-to-another-file-same-user-provider-github'))
    //assert_xpath(`//x:figure[@id='user0/link-to-another-file-same-user-provider-github-dut']//x:img[@src='https://github.com/TODO/subdir/myfile.txt']`, data.render)

    // Scope also creates a subdir for relative \a links.
    article = createArticleArg({ i: 0, titleSource: 'subdir', bodySource: '{scope}' })
    ;({data, status} = await createOrUpdateArticleApi(test, article))
    article = createArticleArg({ i: 0, titleSource: 'child', bodySource: `\\a[myfile.txt]{id=child-dut}

\\a[../upload-0.png]{id=child-dut-up}
` })
    ;({data, status} = await createOrUpdateArticleApi(test, article, { parentId: '@user0/subdir' }))
    ;({data, status} = await test.webApi.article('user0/subdir/child'))
    assert_xpath(`//x:a[@id='user0/subdir/child-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)
    assert_xpath(`//x:a[@id='user0/subdir/child-dut-up' and @href='/user0/_raw/upload-0.png']`, data.render)

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `Link to directory same user`,
      bodySource: `\\a[subdir]{id=link-to-directory-same-user-dut}

\\a[subdir/]{id=link-to-directory-same-user-slash-dut}
`
    })))
    ;({data, status} = await test.webApi.article('user0/link-to-directory-same-user'))
    assert_xpath(`//x:a[@id='user0/link-to-directory-same-user-dut' and @href='/user0/_dir/subdir' and text()='subdir']`, data.render)
    assert_xpath(`//x:a[@id='user0/link-to-directory-same-user-slash-dut' and @href='/user0/_dir/subdir' and text()='subdir/']`, data.render)

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `Link to another file same user abs`,
      bodySource: `\\a[/subdir/myfile.txt]{id=link-to-another-file-same-user-abs-dut}\n`
    })))
    ;({data, status} = await test.webApi.article('user0/link-to-another-file-same-user-abs'))
    assert_xpath(`//x:a[@id='user0/link-to-another-file-same-user-abs-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `Link to another file same user at`,
      bodySource: `\\a[@user0/subdir/myfile.txt]{id=link-to-another-file-same-user-at-dut}\n`
    })))
    ;({data, status} = await test.webApi.article('user0/link-to-another-file-same-user-at'))
    assert_xpath(`//x:a[@id='user0/link-to-another-file-same-user-at-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)

    test.loginUser(user1)
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `Link to another file another user`,
      bodySource: `\\a[@user0/subdir/myfile.txt]{id=link-to-another-file-another-user-dut}\n`
    })))
    ;({data, status} = await test.webApi.article('user1/link-to-another-file-another-user'))
    assert_xpath(`//x:a[@id='user1/link-to-another-file-another-user-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)
    test.loginUser(user0)

    // Create corresponding file articles.

      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
        titleSource: `not-utf8.asdfqwer`,
        bodySource: `{file}

\\a[not-utf8.asdfqwer]{id=not-utf8.asdfqwer-dut}
`
      })))
      ;({data, status} = await test.webApi.article('user0/_file/not-utf8.asdfqwer'))
      assert_xpath(`//x:a[@id='user0/not-utf8.asdfqwer-dut' and @href='/user0/_raw/not-utf8.asdfqwer']`, data.render)

      ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
        titleSource: `subdir/myfile.txt`,
        bodySource: `{file}

\\a[myfile.txt]{id=subdir-myfile.txt-dut}

\\a[../subdir/myfile.txt]{id=up-subdir-myfile.txt-dut}
`
      })))
      ;({data, status} = await test.webApi.article('user0/_file/subdir/myfile.txt'))
      assert_xpath(`//x:a[@id='user0/subdir-myfile.txt-dut' and @href='/user0/_raw/subdir/myfile.txt']`, data.render)

    // Delete errors

      // Cannot delete upload by another user
      test.loginUser(user1)
      ;({data, status} = await test.webApi.uploadDelete(
        'user0/upload-0.png',
        { expectStatus: 403 },
      ))
      test.loginUser(user0)

      // Cannot delete upload that does not exist
      ;({data, status} = await test.webApi.uploadDelete(
        'user0/i-dont-exist',
        { expectStatus: 404 },
      ))

    // Delete
    ;({data, status} = await test.webApi.uploadDelete('user0/upload-0.png'))

    // It's gone.
    ;({data, headers, status} = await test.webApi.upload('user0/upload-0.png',
      { expectStatus: 404 }))

  // Directories get removed when all files and directories are removed

    // Subdir upload.
    ;({data, headers, status} = await test.webApi.uploadDelete('user0/subdir/myfile.txt'))
    // Directory still exists because of subdir/subdir2
    assert.notStrictEqual(await UploadDirectory.findOne({ where:
      { path: Upload.uidAndPathToUploadPath(user0.id, 'subdir') }
    }), null)
    ;({data, headers, status} = await test.webApi.uploadDelete('user0/subdir/subdir2/myfile.txt'))
    // Now both subdir and subdir2 are gone.
    assert.strictEqual(await UploadDirectory.findOne({ where:
      { path: Upload.uidAndPathToUploadPath(user0.id, 'subdir') }
    }), null)
    assert.strictEqual(await UploadDirectory.findOne({ where:
      { path: Upload.uidAndPathToUploadPath(user0.id, 'subdir') }
    }), null)

  }, { defaultExpectStatus: 200 })
})

it(`api: upload delete automatically clears up associated _file`, async () => {
  // This is needed otherwise you are then unable to clean
  // the _file as conversion will fail due to missing \a.
  await testApp(async (test) => {
    let data, status, article
    const { Upload, UploadDirectory } = test.sequelize.models

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create upload upload-0
    ;({data, status} = await test.webApi.uploadCreateOrUpdate('user0/myfile.txt', 'content-0'))

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `myfile.txt`,
      bodySource: `{file}

\\i[asdf]{id=asdf}
`
    })))

    // Delete
    ;({data, status} = await test.webApi.uploadDelete('user0/myfile.txt'))

    // Can't edit it anymore because the file is gone.
    ;({data, status} = await createOrUpdateArticleApi(
      test,
      createArticleArg({
        titleSource: `myfile.txt`,
        bodySource: `{file}\n`
      }),
      {},
      { expectStatus: 422 },
    ))

    // The _file was cleared when the upload was deleted, freeing up ID 'asdf'
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `qwer`,
      bodySource: `\\i[asdf]{id=asdf}\n`
    })))
  }, { defaultExpectStatus: 200 })
})

it(`api: article: duplicate IDs don't lead to infinite DB loop`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `notindex`,
    }), { parentId: '@user0' }))
    // Was going infinite here because we were doing fetch_ancestors before check_db.
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `notindex2`,
      bodySource: `\\i[a]{id=notindex}`,
    }), { parentId: '@user0/notindex' }, { expectStatus: 422 }))
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({
      titleSource: `notindex2`,
    }), { parentId: '@user0/notindex' }))
  }, { defaultExpectStatus: 200 })
})

it(`api: article: create simple`, async () => {
  await testApp(async (test) => {
    let data, status, article

    // Create users
    const user0 = await test.createUserApi(0)
    test.loginUser(user0)

    // Create article user0/title-0
    ;({data, status} = await createOrUpdateArticleApi(test, createArticleArg({ i: 0 })))

    // Check that the article is there
    ;({data, status} = await test.webApi.article('user0/title-0'))
    assert.strictEqual(data.titleSource, 'Title 0')
    assert.match(data.render, /Body 0\./)
  }, { defaultExpectStatus: 200 })
})
