// https://ourbigbook/ourbigbook/demo-data
//
// Need a separate file from test.js because Mocha automatically defines stuff like it,
// which would break non-Mocha requirers.

const fs = require('fs')
const path = require('path')
const perf_hooks = require('perf_hooks')

const lodash = require('lodash')

const ourbigbook = require('ourbigbook')
const back_js = require('./back/js')
const convert = require('./convert')
const models = require('./models')
const config = require('./front/config')

const { performance } = require('perf_hooks')
const now = performance.now.bind(performance)
const ISSUE_DATE = new Date(2000, 0, 1, 2, 3, 4, 5)
const NTAGS = 21

let printTimeNow;
function printTime() {
  const newNow = now()
  console.error((newNow - printTimeNow)/1000.0)
  printTimeNow = newNow
}

// https://stackoverflow.com/questions/563406/add-days-to-javascript-date
function addDays(oldDate, days) {
  const newDate = new Date(oldDate.valueOf());
  newDate.setDate(oldDate.getDate() + days);
  return newDate;
}
const date0 = new Date(2000, 0, 0, 0, 0, 0, 0)

const userData = [
  ['Barack Obama', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Official_portrait_of_Barack_Obama.jpg/160px-Official_portrait_of_Barack_Obama.jpg'],
  ['Donald Trump', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/160px-Donald_Trump_official_portrait.jpg'],
  ['Xi Jinping', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Xi_Jinping_2019.jpg/90px-Xi_Jinping_2019.jpg'],
  ['Mao Zedong', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Mao_Zedong_portrait.jpg/90px-Mao_Zedong_portrait.jpg'],
  ['Isaac Newton', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Portrait_of_Sir_Isaac_Newton%2C_1689.jpg/220px-Portrait_of_Sir_Isaac_Newton%2C_1689.jpg'],
  ['Joe Biden', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/160px-Joe_Biden_presidential_portrait.jpg'],
  ['Li Hongzhi', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Li_Hongzhi_1.jpg/200px-Li_Hongzhi_1.jpg'],
  ['Jiang Zemin', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Jiang_Zemin_St._Petersburg.jpg/90px-Jiang_Zemin_St._Petersburg.jpg'],
  ['John F. Kennedy', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/John_F._Kennedy%2C_White_House_color_photo_portrait.jpg/160px-John_F._Kennedy%2C_White_House_color_photo_portrait.jpg'],
  ['Erwin Schrödinger', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Erwin_Schrodinger2.jpg/170px-Erwin_Schrodinger2.jpg'],
  ['Jesus', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Spas_vsederzhitel_sinay.jpg/220px-Spas_vsederzhitel_sinay.jpg'],
  ['Deng Xiaoping', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Deng_Xiaoping_and_Jimmy_Carter_at_the_arrival_ceremony_for_the_Vice_Premier_of_China._-_NARA_-_183157-restored%28cropped%29.jpg/220px-Deng_Xiaoping_and_Jimmy_Carter_at_the_arrival_ceremony_for_the_Vice_Premier_of_China._-_NARA_-_183157-restored%28cropped%29.jpg'],
  ['George W. Bush', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/George-W-Bush.jpeg/160px-George-W-Bush.jpeg'],
  ['Einstein', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Einstein_patentoffice.jpg/170px-Einstein_patentoffice.jpg'],
  ['Bill Clinton', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Bill_Clinton.jpg/160px-Bill_Clinton.jpg'],
  ['Gautama Buddha', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Mahapajapati.jpg/220px-Mahapajapati.jpg'],
  ['President Reagan', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Official_Portrait_of_President_Reagan_1981.jpg/165px-Official_Portrait_of_President_Reagan_1981.jpg'],
  ['Euclid of Alexandria', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Scuola_di_atene_23.jpg/220px-Scuola_di_atene_23.jpg'],
  ['Richard Nixon', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Richard_Nixon_presidential_portrait_%281%29.jpg/160px-Richard_Nixon_presidential_portrait_%281%29.jpg'],
  ['Moses', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Guido_Reni_-_Moses_with_the_Tables_of_the_Law_-_WGA19289.jpg/220px-Guido_Reni_-_Moses_with_the_Tables_of_the_Law_-_WGA19289.jpg'],
]

const articleData = [
  ['Mathematics', [
    ['Algebra', [
      ['Linear algebra', [
        ['Vector space', []],
      ]],
      ['Abstract algebra', []],
    ]],
    ['Calculus', [
      ['Derivative', []],
      ['Integral', [
        ['Fundamental theorem of calculus', [
          ['Proof of the fundamental theorem of calculus', []],
        ]],
        ['$L^p$ space', []],
      ]],
    ]],
  ]],
  ['Natural science', [
    ['Physics', [
      ['Quantum mechanics', [
        ['Schrödinger equation', [
          ['Schrödinger equation solution for the hydrogen atom', [
            ['Atomic orbital', [
              ['Principal quantum number', []],
              ['Azimuthal quantum number', []],
              ['Magnetic quantum number', []],
            ]],
          ], { headerArgs: '{c}' }],
        ], { headerArgs: '{c}' }],
        ['Quantum mechanics experiment', [
          ['Emission spectrum', [
            ['Rydberg formula', [], { headerArgs: '{c}' }],
            ['Fine structure', [
              ['Hyperfine structure', []],
            ]],
          ]],
          ['Double-slit experiment', []],
        ]],
      ]],
      ['Special relativity', [
        ['Lorentz transformation', [
          ['Time dilation', []],
        ], { headerArgs: '{c}' }],
      ]],
    ], { toplevel: true }],
    ['Chemistry', [
      ['Chemical element', [
        ['Hydrogen', [
          ['Water', []],
        ]],
        ['Helium', []],
        ['Carbon', [
          ['Carbon-14', []],
        ]],
      ]],
      ['Organic chemistry', [
      ]],
    ], { toplevel: true }],
    ['Biology', [
      ['Molecular biology', [
        ['DNA', [], { headerArgs: '{c}' }],
        ['Protein', []],
      ]],
      ['Cell biology', [
        ['Organelle', [
          ['Mitochondrion', []],
          ['Ribosome', [
            ['Ribosome large subunit', []],
            ['Ribosome small subunit', []],
          ]],
        ]],
      ]],
    ], { toplevel: true }],
  ]],
  ['Test data',
    [
      ['Test scope', [
        ['Test scope 1', [
          ['Test scope 1 1', []],
          ['Test scope 1 2', []],
        ]],
        ['Test scope 2', []],
        ['Test subscope 1', [
          ['Test subscope 1 1', []],
          ['Test subscope 1 2', []],
        ], { headerArgs: '{scope}' }],
        ['Test subscope 2', [
          ['Test subscope 2 1', []],
          ['Test subscope 2 2', []],
        ], { headerArgs: '{scope}' }],
      ], { headerArgs: '{scope}' }],
      ['Barack Obama',
        [
          ['Mathematics', []],
        ],
        {
          headerArgs: '{scope}',
          body: `This is a a scope named after the first test user.

The goal of this is to test this possible edge case of short URL fragments e.g. when you visit <mathematics>.
`,
        }
      ],
      ['Test tag', [
         ['Test tagged 1', [], { headerArgs: [...Array(NTAGS).keys()].map(i => `{tag=Test tagger ${i + 1}}\n`).join('') + '{wiki}' }],
         ...[...Array(NTAGS - 1).keys()].map(i => [`Test tagged ${i + 2}`, [], { headerArgs: '{tag=Test tagger 1}\n{wiki}' }]),
         ...[...Array(NTAGS).keys()].map(i => [`Test tagger ${i + 1}`, []])
      ]],
      ['Test wiki', [], { headerArgs: '{wiki}' }],
      ['Test child', [
        ['Test child 1', [
          ['Test child 1 1', []],
        ], { body: `Link to outsider: <test child 2>

Link to parent: <test child>

Link to external subelement: <equation my favorite equation>

Link to external subelement long: <equation Test data long before ID>

Link to child: <test child 1 1>

Link to external: http://example.com

Link to topic: <#mathematics>
` }],
        ['Test child 2', [], { body: `Link to synonym: <Test child with synonym 2>
` }],
        ['Test child with synonym', [], {
          body: `= Test child with synonym 2
{synonym}

= Test child with synonym 3
{synonym}
`
        }],
      ]],
      // This is used to check if we are jumping to an ID at the bottom of the page correctly.
      ['Test data long before ID', [], { body: [...Array(50).keys()].map(i => `spacer ${i}\n\n`).join('') +
         `$$\\frac{1}{\\sqrt{2}}$\${title=Test data long before ID}` }],
      ['Test data disambiguate',
        [['Test data disambiguate child 1', []]],
        { headerArgs: '{disambiguate=specific type 1}' }
      ],
      ['Test data disambiguate',
        [['Test data disambiguate child 2', []]],
        { headerArgs: '{disambiguate=specific type 2}' }
      ],
      ['Test data disambiguate next sibling', []],
      ['Test data unlisted', [
        ['Test data unlisted listed child', []],
        ['Test data unlisted unlisted child', [], { list: false }],
      ], { body: `This article is unlisted.\n\nIt shouldn't appear on ToCs, topics and most other listings by default.`, list: false }],
      ['Test data with title2', [], { body: `{title2=My title 2}` }],
      ['Test data with math on title $\\frac{1}{\\sqrt{2}}$', []],
      ['Test data with code on title `int main() { return 0; }`', []],
    ],
    {
      body: `Block math: <equation My favorite equation>

$$
\\frac{1}{\\sqrt{2}}
$$
{title=My favorite equation}

And another: <equation My second favorite equation>

$$
\\frac{1}{\\sqrt{2}}
$$
{title=My second favorite equation}

Ourbigbook defined LaTeX macro: $\\abs{x}$

Empty link to home page: <>
`
    }
  ],
]
const issueData = [
  ['Test issue', `Link to article: <test data>

Link to ID in this issue: <test issue 2>

== Test issue 2

=== Test issue 3

== Test child

Conflict resolution between issue IDs and article IDs:

* to issue: <test child>
* to article: </test child>
`],
  ['There\'s a typo in this article at "mathmatcs"', ``],
  ['Add mention of the fundamental theorem of calculus', `The fundamental theorem of calculus is very important to understanding this subject.

I would add something like:
\\Q[
The reason why the superconductor laser is blue, is due to the integral of its resonance modes.

From the fundamental theorem of calculus, we understand that this is because the derivative of the temperature is too small.
]

== Also mentions Newton's rule

As an added bonus, a mention of Newton's rule would also be very useful.
`],
  ['$\\sqrt{1 + 1} = 3$, not 2 as mentioned', 'I can\'t believe you got such a basic fact wrong!'],
  ['The code `f(x) + 1` should be `f(x) + 2`', 'Zero indexing always gets me too.'],
]
const commentData = [
  `= My test comment

Link to ID in comment: <My test comment 2>

Link to article: <test data>

== My test comment 2

=== My test comment 3

== Test child

Conflict resolution between issue IDs and article IDs:

* to issue: <test child>
* to article: </test child>
`,
//  `My test comment without a header
//
//Link to article: <test data>
//`,
  'Thanks, you\'re totally right, I\'ll look into it!',
  'Just fixed the issue on a new edit, thanks.',
  `= Why I think you are stupid

Here's my essay with irrefutable proof, notably: <I don't think this is correct>.

== I don't think this is correct.

Consider what happens when $\\sqrt{a + b} > 0$`,
  `Ah, maybe. But are you sure that the sum of:
\`\`
f() + 3*g()
\`\`
is enough to make the loop terminate?
`,
]
let todo_visit = articleData.map(a => [null, a])
let articleDataCount = 0
while (todo_visit.length > 0) {
  let [parentEntry, entry] = todo_visit.pop()
  const { children, opts } = expandArticleDataEntry(entry)
  entry[2] = opts
  opts.parentEntry = parentEntry
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]
    todo_visit.push([entry, child]);
    if (i > 0) {
      const { opts } = expandArticleDataEntry(child)
      child[2] = opts
      opts.previousSiblingEntry = children[i - 1]
    }
  }
  articleDataCount++
}

class ArticleDataProvider {
  constructor(articleData, userIdx) {
    // These store the current tree transversal state across .get calls.
    this.gen = 0
    this.todo_visit = articleData.slice()
    // Set of all entries we visited that don't have a parent.
    // We will want to include those from the toplevel index.
    this.toplevelTitleToEntry = {}
  }

  // Pre order depth first transversal to ensure that parents are created before children.
  get() {
    if (this.todo_visit.length === 0) {
      this.todo_visit = articleData.slice()
      this.gen++
    }
    while (this.todo_visit.length !== 0) {
      let entry = this.todo_visit.pop();
      entry = Object.assign({}, entry)
      let title = entry[0]
      if (this.gen > 0) {
        title = `${title} v${this.gen}`
        entry[0] = title
      }
      let children = entry[1]
      for (let i = 0; i < children.length; i++) {
        this.todo_visit.push(children[i]);
      }
      this.toplevelTitleToEntry[title] = entry
      this.globalI++
      return entry
    }
  }
}

async function generateDemoData(params) {
  // Input Param defaults.
  const nUsers = params.nUsers === undefined ? 2 : params.nUsers
  const nArticlesPerUser = params.nArticlesPerUser === undefined ? articleDataCount : params.nArticlesPerUser
  const nMaxIssuesPerArticle = params.nMaxIssuesPerArticle === undefined ? 3 : params.nMaxIssuesPerArticle
  const nMaxCommentsPerIssue = params.nMaxCommentsPerIssue === undefined ? 3 : params.nMaxCommentsPerIssue
  const nFollowsPerUser = params.nFollowsPerUser === undefined ? 2 : params.nFollowsPerUser
  const nLikesPerUser = params.nLikesPerUser === undefined ? 20 : params.nLikesPerUser
  const directory = params.directory
  const basename = params.basename
  const verbose = params.verbose === undefined ? false : params.verbose
  const empty = params.empty === undefined ? false : params.empty
  const clear = params.clear === undefined ? false : params.clear

  const nArticles = nUsers * nArticlesPerUser
  const sequelize = models.getSequelize(directory, basename);
  const { Id } = sequelize.models
  const katex_macros = back_js.preloadKatex()
  await models.sync(sequelize, { force: empty || clear })
  if (!empty) {
    const sourceRoot = path.join(__dirname, 'tmp', 'demo')
    fs.rmSync(sourceRoot, { recursive: true, force: true });

    if (verbose) printTimeNow = now()
    if (verbose) console.error('User');
    const userArgs = [];
    for (let i = 0; i < nUsers; i++) {
      let [displayName, image] = userData[i % userData.length]
      let username = ourbigbook.titleToId(displayName)
      if (i >= userData.length) {
        username = `user${i}`
        displayName = `User${i}`
        image = undefined
      }
      const userArg = {
        username,
        displayName,
        email: `user${i}@mail.com`,
        verified: true,
      }
      if (image) {
        userArg.image = image
      }
      sequelize.models.User.setPassword(userArg, process.env.OURBIGBOOK_DEMO_USER_PASSWORD || 'asdf')
      userArgs.push(userArg)
    }
    const users = []
    const userIdToUser = {}
    for (const userArg of userArgs) {
      let user = await sequelize.models.User.findOne({ where: { username: userArg.username } })
      if (user) {
        Object.assign(user, userArg)
        await user.save()
      } else {
        user = await sequelize.models.User.create(userArg)
      }
      userIdToUser[user.id] = user
      users.push(user)
    }
    // TODO started livelocking after we started creating index articles on hooks.
    //const users = await sequelize.models.User.bulkCreate(
    //  userArgs,
    //  {
    //    validate: true,
    //    individualHooks: true,
    //  }
    //)
    if (verbose) printTime()

    if (verbose) console.error('UserFollowUser');
    for (let i = 0; i < nUsers; i++) {
      let nFollowsPerUserEffective = nUsers < nFollowsPerUser ? nUsers : nFollowsPerUser
      for (var j = 0; j < nFollowsPerUserEffective; j++) {
        const follower = users[i]
        const followed = users[(i + 1 + j) % nUsers]
        if (!(await follower.hasFollow(followed))) {
          await follower.addFollowSideEffects(followed)
        }
      }
    }

    if (verbose) printTime()

    if (verbose) console.error('Article');
    const articleDataProviders = {}
    const articleIdToArticle = {}
    for (let userIdx = 0; userIdx < nUsers; userIdx++) {
      let authorId = users[userIdx].id
      articleDataProvider = new ArticleDataProvider(articleData, userIdx)
      articleDataProviders[authorId] = articleDataProvider
    }
    const articleArgs = [];
    const toplevelTopicIds = new Set()
    let dateI = 0
    async function makeArticleArg(articleDataEntry, forceToplevel, i, authorId) {
      const date = addDays(date0, dateI)
      dateI++
      articleDataEntry.articleIdx = i
      let { titleSource, headerArgs, children, opts } = expandArticleDataEntry(articleDataEntry)
      headerArgs = opts.headerArgs
      if (headerArgs === undefined) {
        headerArgs = ''
      } else {
        headerArgs += '\n\n'
      }
      let body = opts.body
      if (body === undefined) {
        body = makeBody(titleSource)
      }
      const id_noscope = await titleToId(titleSource)
      toplevelTopicIds.add(id_noscope)
      return {
        titleSource,
        authorId,
        createdAt: date,
        // TODO not taking effect. Appears to be because of the hook.
        updatedAt: date,
        bodySource: `${headerArgs}${body}`,
        opts,
      }
    }
    let i
    for (i = 0; i < nArticlesPerUser; i++) {
      for (let userIdx = 0; userIdx < nUsers; userIdx++) {
        const authorId = users[userIdx].id
        const articleDataProvider = articleDataProviders[authorId]
        const articleDataEntry = articleDataProvider.get()
        const articleArg = await makeArticleArg(articleDataEntry, false, i, authorId)
        if (articleArg) {
          articleArgs.push(articleArg)
        }
      }
    }

    //// Sort first by topic id, and then by user id to mix up votes a little:
    //// otherwise user0 gets all votes, then user1, and so on.
    //articleArgs.sort((a, b) => {
    //  if (a.title < b.title) {
    //    return -1
    //  } else if(a.title > b.title) {
    //    return 1
    //  } else if(a.authorId < b.authorIdtitle) {
    //    return -1
    //  } else if(a.authorId > b.authorIdtitle) {
    //    return 1
    //  } else {
    //    return 0;
    //  }
    //})
    const articles = []
    for (const render of [false, true]) {
      let articleId = 0
      let i = 0
      let pref
      if (verbose) {
        if (render) {
          pref = 'render'
        } else {
          pref = 'extract_ids'
        }
      }
      for (const articleArg of articleArgs) {
        const msg = `${pref}: ${i + 1}/${articleArgs.length}: ${userIdToUser[articleArg.authorId].username}/${articleArg.titleSource}`
        if (verbose) console.error(msg);
        const author = userIdToUser[articleArg.authorId]
        const opts = articleArg.opts

        let parentId
        {
          const parentEntry = opts.parentEntry
          if (parentEntry) {
            ;({ opts: parentOpts } = expandArticleDataEntry(parentEntry))
            parentId = `${ourbigbook.AT_MENTION_CHAR}${author.username}/${parentOpts.topicId}`
          } else {
            parentId = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
          }
        }
        const before = now();
        const { articles: newArticles, extra_returns } = await convert.convertArticle({
          author,
          bodySource: articleArg.bodySource,
          convertOptionsExtra: { katex_macros },
          enforceMaxArticles: false,
          list: opts.list,
          parentId,
          path: opts.path,
          render,
          sequelize,
          titleSource: articleArg.titleSource,
        })
        const after = now();
        opts.topicId = extra_returns.context.header_tree.children[0].ast.id.substring(
          ourbigbook.AT_MENTION_CHAR.length + author.username.length + 1)
        if (verbose) console.error(`${msg} finished in ${after - before}ms`);
        for (const article of newArticles) {
          articleIdToArticle[article.id] = article
          articles.push(article)
          articleId++
        }
        i++
      }
    }

    // Create an article in a topic that exists only for user0. All other articles exist for all users.
    // This is useful to test that case which hsa UI implications such as "show create new vs view mine".
    let articleManyDiscussions
    {
      const parentId = `${ourbigbook.AT_MENTION_CHAR}${users[0].username}/${await titleToId('Test data')}`
      const parentIdObj = await Id.findOne({ where: { idid: parentId } })
      let articleUser0Only
      if (parentIdObj) {
        const { articles } = await convert.convertArticle({
          author: users[0],
          bodySource: 'This topic only exists for the first user.\n',
          convertOptionsExtra: { katex_macros },
          parentId,
          render: true,
          sequelize,
          titleSource: 'Test data user0 only',
        })
        articleUser0Only = articles[0]
      }
      if (articleUser0Only) {
        const { articles } = await convert.convertArticle({
          author: users[0],
          bodySource: 'This article has many discussions. To test article discussion pagination.',
          convertOptionsExtra: { katex_macros },
          parentId: `${ourbigbook.AT_MENTION_CHAR}${articleUser0Only.slug}`,
          render: true,
          sequelize,
          titleSource: 'Test data article with many discussions',
        })
        articleManyDiscussions = articles[0]
      }
    }

    // Write files to filesystem.
    // https://docs.ourbigbook.com/demo-data-local-file-output
    for (const user of users) {
      const articles = (await sequelize.models.Article.getArticles({
        author: user.username,
        count: false,
        sequelize,
      }))
      for (const article of articles) {
        const slugParse = path.parse(article.slug)
        let outdir, outbase_noext
        if (slugParse.dir) {
          outdir = path.join(sourceRoot, slugParse.dir)
          outbase_noext = slugParse.base
        } else {
          // Toplevel index.
          outdir = path.join(sourceRoot, slugParse.base)
          outbase_noext = ourbigbook.INDEX_BASENAME_NOEXT
        }
        fs.mkdirSync(outdir, { recursive: true })
        const outpath = path.join(outdir, outbase_noext + '.' + ourbigbook.OURBIGBOOK_EXT)
        fs.writeFileSync(outpath, await article.getSourceExport());
      }
      fs.writeFileSync(path.join(sourceRoot, user.username, ourbigbook.OURBIGBOOK_JSON_BASENAME), '{}\n');
    }

    // TODO This was livelocking (taking a very long time, live queries)
    // due to update_database_after_convert on the hook it would be good to investigate it.
    // Just converted to the regular for loop above instead.
    //const articles = await sequelize.models.Article.bulkCreate(
    //  articleArgs,
    //  {
    //    validate: true,
    //    individualHooks: true,
    //  }
    //)

    if (verbose) printTime()

    if (verbose) console.error('Like');
    let articleIdx = 0
    for (let i = 0; i < nUsers; i++) {
      const user = users[i]
      for (let j = 0; j < nLikesPerUser; j++) {
        const article = articles[(i * j) % nArticles];
        if (
          article
          && article.file.authorId !== user.id
        ) {
          if (!(await user.hasLikedArticle(article))) {
            await user.addArticleLikeSideEffects(article)
          }
          if (!(await user.hasFollowedArticle(article))) {
            await user.addArticleFollowSideEffects(article)
          }
        }
      }
    }

    // 0.5s faster than the addArticleLikeSideEffects version, total run 7s.
    //let articleIdx = 0
    //const likeArgs = []
    //for (let i = 0; i < nUsers; i++) {
    //  const userId = users[i].id
    //  for (var j = 0; j < nLikesPerUser; j++) {
    //    likeArgs.push({
    //      userId: userId,
    //      articleId: articles[articleIdx % nArticles].id,
    //    })
    //    articleIdx += 1
    //  }
    //}
    //await sequelize.models.UserLikeArticle.bulkCreate(likeArgs)
    if (verbose) printTime()

    if (verbose) console.error('Issue');
    const issues = [];
    let issueIdx = 0;
    await sequelize.models.Issue.destroy({ where: { authorId: users.map(user => user.id) } })
    for (let i = 0; i < nArticles; i++) {
      let articleIssueIdx = 0;
      const article = articles[i]
      for (var j = 0; j < (i % (nMaxIssuesPerArticle + 1)); j++) {
        if (verbose) console.error(`${article.slug}#${articleIssueIdx}`)
        const [titleSource, bodySource] = issueData[issueIdx % issueData.length]
        const issue = await convert.convertIssue({
          article,
          bodySource,
          date: ISSUE_DATE,
          number: articleIssueIdx + 1,
          sequelize,
          titleSource,
          user: users[issueIdx % nUsers],
        })
        issue.article = article
        issues.push(issue)
        issueIdx++
        articleIssueIdx++
      }
    }
    const nIssues = issueIdx
    if (verbose) printTime()

    if (verbose) console.error('Comment');
    const comments = [];
    let commentIdx = 0;
    await sequelize.models.Comment.destroy({ where: { authorId: users.map(user => user.id) } })
    for (let i = 0; i < nIssues; i++) {
      let issueCommentIdx = 0;
      const issue = issues[i]
      for (var j = 0; j < (i % (nMaxCommentsPerIssue + 1)); j++) {
        if (verbose) console.error(`${articleIdToArticle[issue.articleId].slug}#${issue.number}#${issueCommentIdx}`)
        const source = commentData[commentIdx % commentData.length]
        const comment = await convert.convertComment({
          date: ISSUE_DATE,
          issue,
          source,
          number: issueCommentIdx + 1,
          sequelize,
          user: users[commentIdx % nUsers],
        })
        comments.push(comment)
        commentIdx++
        issueCommentIdx++
      }
    }
    if (verbose) printTime()

    // Create an article in a topic that exists only for user0. All other articles exist for all users.
    // This is useful to test that case which hsa UI implications such as "show create new vs view mine".
    if (articleManyDiscussions) {
      let issueManyComments
      for (let i = 0; i < config.articleLimit + 2; i++) {
        const article =  articleManyDiscussions
        if (verbose) console.error(`${article.slug}#${i}`)
        const issue = await convert.convertIssue({
          article,
          bodySource: `Many discussions body ${i}.`,
          date: ISSUE_DATE,
          number: i + 1,
          sequelize,
          titleSource: `Many discussions title ${i}`,
          user: users[0],
        })
        if (i === 0) {
          issueManyComments = issue
        }
      }
      for (let i = 0; i < config.articleLimit + 2; i++) {
        if (verbose) console.error(`${articleManyDiscussions.slug}#${issueManyComments.number}#${i}`)
        await convert.convertComment({
          date: ISSUE_DATE,
          issue: issueManyComments,
          source: `Many comments body ${i}.`,
          number: i + 1,
          sequelize,
          user: users[0],
        })
      }
    }
  }

  return sequelize
}
exports.generateDemoData = generateDemoData

function expandArticleDataEntry(articleDataEntry) {
  let titleSource, children, opts
  if (articleDataEntry === undefined) {
    titleSource = `My title ${articleDataEntry.articleIdx * (userIdx + 1)}`
    children = []
    opts = {}
  } else {
    titleSource = articleDataEntry[0]
    children = articleDataEntry[1]
    opts = articleDataEntry[2] || {}
  }
  return { titleSource, children, opts }
}

function makeBody(titleSource) {
  return `This is a section about ${titleSource}!

${titleSource} is a very important subject about which there is a lot to say.

For example, this sentence. And then another one.
`
/*
`This is a section about ${titleSource}!

${refsString}\\i[Italic]

\\b[Bold]

http://example.com[External link]

Inline code: \`int main() { return 1; }\`

Code block:
\`\`
function myFunc() {
  return 1;
}
\`\`

Inline math: $\\sqrt{1 + 1}$

Block math and a reference to it: \\x[equation-in-${id_noscope}]:
$$\\frac{1}{\\sqrt{2}}$$\{id=equation-in-${id_noscope}}

Block quote:
\\Q[
To be or not to be.

That is the question.
]

List:
* item 1
* item 2
* item 3

Table:
|| String col
|| Integer col
|| Float col

| ab
| 2
| 10.1

| a
| 10
| 10.2

| c
| 2
| 3.4

| c
| 3
| 3.3

Reference to the following image: \\x[image-my-xi-chrysanthemum-${id_noscope}].

\\Image[https://raw.githubusercontent.com/cirosantilli/media/master/Chrysanthemum_Xi_Jinping_with_black_red_liusi_added_by_Ciro_Santilli.jpg]
{title=Xi Chrysanthemum is a very nice image}
{id=image-my-xi-chrysanthemum-${id_noscope}}
{source=https://commons.wikimedia.org/wiki/File:Lotus_flower_(978659).jpg}

An YouTube video: \\x[video-sample-youtube-video-in-${id_noscope}].

\\Video[https://youtube.com/watch?v=YeFzeNAHEhU&t=38]
{title=Sample YouTube video in ${titleSource}}${includesString}
`,
*/
}

async function titleToId(titleSource) {
  return ourbigbook.titleToId(
    await ourbigbook.convert(
      titleSource,
      { output_format: ourbigbook.OUTPUT_FORMAT_ID }
    )
  )
}
