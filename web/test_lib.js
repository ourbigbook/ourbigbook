/// Need a separate file from test.js because Mocha automatically defines stuff like it,
// which would break non-Mocha requirers.

const path = require('path')
const perf_hooks = require('perf_hooks')

const cirodown = require('cirodown')
const models = require('./models')

const now = perf_hooks.performance.now

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
  ['Xi Jinping', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Xi_Jinping_2019.jpg/90px-Xi_Jinping_2019.jpg', 'shesaid'],
  ['Donald Trump', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/160px-Donald_Trump_official_portrait.jpg', 'great-a-gain'],
  ['Mao Zedong', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Mao_Zedong_portrait.jpg/90px-Mao_Zedong_portrait.jpg', 'greatleap'],
  ['Isaac Newton', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Portrait_of_Sir_Isaac_Newton%2C_1689.jpg/220px-Portrait_of_Sir_Isaac_Newton%2C_1689.jpg', 'applepie'],
  ['Joe Biden', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/160px-Joe_Biden_presidential_portrait.jpg', 'tooold2care'],
  ['Li Hongzhi', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Li_Hongzhi_1.jpg/200px-Li_Hongzhi_1.jpg', 'dafagood'],
  ['Jiang Zemin', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Jiang_Zemin_St._Petersburg.jpg/90px-Jiang_Zemin_St._Petersburg.jpg', 'bigtoad'],
  ['John F. Kennedy', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/John_F._Kennedy%2C_White_House_color_photo_portrait.jpg/160px-John_F._Kennedy%2C_White_House_color_photo_portrait.jpg', 'headless'],
  ['Barack Obama', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Official_portrait_of_Barack_Obama.jpg/160px-Official_portrait_of_Barack_Obama.jpg', 'bailmeout'],
  ['Erwin Schrödinger', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Erwin_Schrodinger2.jpg/170px-Erwin_Schrodinger2.jpg', 'catpoison'],
  ['Jesus', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Spas_vsederzhitel_sinay.jpg/220px-Spas_vsederzhitel_sinay.jpg', 'imback'],
  ['Deng Xiaoping', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Deng_Xiaoping_and_Jimmy_Carter_at_the_arrival_ceremony_for_the_Vice_Premier_of_China._-_NARA_-_183157-restored%28cropped%29.jpg/220px-Deng_Xiaoping_and_Jimmy_Carter_at_the_arrival_ceremony_for_the_Vice_Premier_of_China._-_NARA_-_183157-restored%28cropped%29.jpg', 'the-real-tankman-64'],
  ['George W. Bush', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/George-W-Bush.jpeg/160px-George-W-Bush.jpeg', 'wmd4sure'],
  ['Einstein', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Einstein_patentoffice.jpg/170px-Einstein_patentoffice.jpg', 'emc2'],
  ['Bill Clinton', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Bill_Clinton.jpg/160px-Bill_Clinton.jpg', 'i-did-not'],
  ['Gautama Buddha', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Mahapajapati.jpg/220px-Mahapajapati.jpg', 'aummmm'],
  ['President Reagan', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Official_Portrait_of_President_Reagan_1981.jpg/165px-Official_Portrait_of_President_Reagan_1981.jpg', 'starry-eyes'],
  ['Euclid of Alexandria', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Scuola_di_atene_23.jpg/220px-Scuola_di_atene_23.jpg', 'in-parallel'],
  ['Richard Nixon', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Richard_Nixon_presidential_portrait_%281%29.jpg/160px-Richard_Nixon_presidential_portrait_%281%29.jpg', 'waterg8'],
  ['Moses', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Guido_Reni_-_Moses_with_the_Tables_of_the_Law_-_WGA19289.jpg/220px-Guido_Reni_-_Moses_with_the_Tables_of_the_Law_-_WGA19289.jpg', 'seasplitter010'],
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
          ], '{c}'],
        ], '{c}'],
        ['Quantum mechanics experiment', [
          ['Emission spectrum', [
            ['Rydberg formula', [], '{c}'],
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
        ], '{c}'],
      ]],
    ]],
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
    ]],
    ['Biology', [
      ['Molecular biology', [
        ['DNA', [], '{c}'],
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
    ]],
  ]],
]

class ArticleDataProvider {
  constructor(articleData) {
    this.i = 0
    this.todo_visit = articleData.slice()
    this.head = undefined
  }

  get() {
    while (this.todo_visit.length !== 0) {
      let entry = this.todo_visit[this.todo_visit.length - 1];
      let title = entry[0]
      let children = entry[1]

      let finishedSubtrees = false
      let done = false
      for (const child of children) {
        if (child === this.head) {
          finishedSubtrees = true
          done = true
          break
        }
        if (done) {
          break
        }
      }
      let isLeaf = children.length === 0
      if (finishedSubtrees || isLeaf) {
        this.todo_visit.pop()
        this.head = entry
        return entry
      } else {
        for (let i = children.length - 1; i >= 0; i--) {
          this.todo_visit.push(children[i]);
        }
      }
    }
    return undefined
  }
}

async function generateDemoData(params) {
  // Input Param defaults.
  const nUsers = params.nUsers === undefined ? 20 : params.nUsers
  const nArticlesPerUser = params.nArticlesPerUser === undefined ? 50 : params.nArticlesPerUser
  const nMaxCommentsPerArticle = params.nMaxCommentsPerArticle === undefined ? 3 : params.nMaxCommentsPerArticle
  const nFollowsPerUser = params.nFollowsPerUser === undefined ? 2 : params.nFollowsPerUser
  const nLikesPerUser = params.nLikesPerUser === undefined ? 20 : params.nLikesPerUser
  const directory = params.directory
  const basename = params.basename

  const nArticles = nUsers * nArticlesPerUser
  const sequelize = models.getSequelize(directory, basename);
  await models.sync(sequelize, { force: true })

  printTimeNow = now()
  console.error('User');
  const userArgs = [];
  for (let i = 0; i < nUsers; i++) {
    let [displayName, image, username] = userData[i % userData.length]
    if (i >= userData.length) {
      username = `user${i}`
      displayName = `User${i}`
      image = undefined
    }
    const userArg = {
      username,
      displayName,
      email: `user${i}@mail.com`,
    }
    if (image) {
      userArg.image = image
    }
    if (i % 2 === 0) {
      userArg.bio = `My bio ${i}`
    }
    sequelize.models.User.setPassword(userArg, 'asdf')
    userArgs.push(userArg)
  }
  const users = await sequelize.models.User.bulkCreate(userArgs)
  printTime()

  console.error('UserFollowUser');
  for (let i = 0; i < nUsers; i++) {
    let nFollowsPerUserEffective = nUsers < nFollowsPerUser ? nUsers : nFollowsPerUser
    for (var j = 0; j < nFollowsPerUserEffective; j++) {
      await (users[i].addFollowSideEffects(users[(i + 1 + j) % nUsers]))
    }
  }

  //const followArgs = []
  //for (let i = 0; i < nUsers; i++) {
  //  const userId = users[i].id
  //  let nFollowsPerUserEffective = nUsers < nFollowsPerUser ? nUsers : nFollowsPerUser
  //  for (var j = 0; j < nFollowsPerUserEffective; j++) {
  //    followArgs.push({
  //      userId: userId,
  //      followId: users[(i + 1 + j) % nUsers].id,
  //    })
  //  }
  //}
  //await sequelize.models.UserFollowUser.bulkCreate(followArgs)

  printTime()

  console.error('Article');
  const articleDataProviders = {}
  const articleArgs = [];
  let dateI = 0
  for (let i = 0; i < nArticlesPerUser; i++) {
    for (let userIdx = 0; userIdx < nUsers; userIdx++) {
      let authorId = users[userIdx].id
      let articleDataProvider
      if (authorId in articleDataProviders) {
        articleDataProvider = articleDataProviders[authorId]
      } else {
        articleDataProvider = new ArticleDataProvider(articleData)
        articleDataProviders[authorId] = articleDataProvider
      }
      const date = addDays(date0, dateI)
      dateI++
      const articleDataEntry = articleDataProvider.get()
      let title, extra, children
      if (articleDataEntry === undefined) {
        title = `My title ${i * (userIdx + 1)}`
        children = []
      } else {
        title = articleDataEntry[0]
        children = articleDataEntry[1]
        extra = articleDataEntry[2]
      }
      if (extra === undefined) {
        extra = ''
      } else {
        extra += '\n\n'
      }
      let includesString, refsString
      if (children.length > 0) {
        const ids = children.map(child => cirodown.title_to_id(child[0]))
        includesString = '\n\n' + ids.map(id => `\\Include[${id}]`).join('\n')
        refsString = '\n\n' + ids.map(id => `\\x[${id}]`).join('\n')
      } else {
        includesString = ''
        refsString = ''
      }
      const articleArg = {
        title,
        authorId,
        createdAt: date,
        // TODO not taking effect. Appears to be because of the hook.
        updatedAt: date,
        body: `${extra}${refsString}

\\i[Italic]

\\b[Bold]

http://example.com[Link]

Inline code: \`int main() { return 1; }\`

Code block:
\`\`
function myFunc() {
  return 1;
}
\`\`

Inline math: $\\sqrt{1 + 1}$

Block math:
$$\\frac{1}{\\sqrt{2}}$$

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

Reference to the following image: \\x[image-my-xi-chrysanthemum].

\\Image[https://raw.githubusercontent.com/cirosantilli/media/master/Chrysanthemum_Xi_Jinping_with_black_red_liusi_added_by_Ciro_Santilli.jpg]
{title=Xi Chrysanthemum is a very nice image}
{id=image-my-xi-chrysanthemum}
{source=https://commons.wikimedia.org/wiki/File:Lotus_flower_(978659).jpg}

An YouTube video: \\x[video-sample-youtube-video].

\\Video[https://youtube.com/watch?v=YeFzeNAHEhU&t=38]
{id=sample-video-from-youtube-implicit-youtube}
{title=Sample YouTube video.}${includesString}

== ${title} h2

Text in h2.

=== ${title} h3

Text in h3.
`,
      }
      articleArgs.push(articleArg)
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
  let articleId = 0
  for (const articleArg of articleArgs) {
    console.error(`${articleId} authorId=${articleArg.authorId} title=${articleArg.title}`);
    const article = await new sequelize.models.Article(articleArg)
    await article.save()
    articles.push(article)
    articleId++
  }
  // TODO This was livelocking (taking a very long time, live querries)
  // due to update_database_after_convert on the hook it would be good to investigate it.
  // Just convereted to the regular for loop above instead.
  //const articles = await sequelize.models.Article.bulkCreate(
  //  articleArgs,
  //  {
  //    validate: true,
  //    individualHooks: true,
  //  }
  //)
  printTime()

  console.error('Like');
  let articleIdx = 0
  for (let i = 0; i < nUsers; i++) {
    const user = users[i]
    for (let j = 0; j < nLikesPerUser; j++) {
      const article = articles[(i * j) % nArticles];
      if (article.authorId !== user.id) {
        await user.addLikeSideEffects(article)
      }
    }
  }

  // 0.5s faster than the addLikeSideEffects version, total run 7s.
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
  printTime()

  console.error('Comment');
  const commentArgs = [];
  let commentIdx = 0;
  for (let i = 0; i < nArticles; i++) {
    for (var j = 0; j < (i % (nMaxCommentsPerArticle + 1)); j++) {
      const commentArg = {
        body: `my comment ${commentIdx}`,
        articleId: articles[i].id,
        authorId: users[commentIdx % nUsers].id,
      }
      commentArgs.push(commentArg)
      commentIdx += 1
    }
  }
  const comments = await sequelize.models.Comment.bulkCreate(commentArgs)
  printTime()

  return sequelize
}
exports.generateDemoData = generateDemoData
