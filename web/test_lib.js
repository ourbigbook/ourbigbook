/// Need a separate file from test.js because Mocha automatically defines stuff like it,
// which would break non-Mocha requirers.

const path = require('path')
const perf_hooks = require('perf_hooks')

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

async function generateDemoData(params) {
  // Input Param defaults.
  const nUsers = params.nUsers === undefined ? 10 : params.nUsers
  const nArticlesPerUser = params.nArticlesPerUser === undefined ? 50 : params.nArticlesPerUser
  const nMaxCommentsPerArticle = params.nMaxCommentsPerArticle === undefined ? 3 : params.nMaxCommentsPerArticle
  const nMaxTagsPerArticle = params.nMaxTagsPerArticle === undefined ? 3 : params.nMaxTagsPerArticle
  const nFollowsPerUser = params.nFollowsPerUser === undefined ? 2 : params.nFollowsPerUser
  const nLikesPerUser = params.nLikesPerUser === undefined ? 20 : params.nLikesPerUser
  const nTags = params.nTags === undefined ? 10 : params.nTags
  const directory = params.directory
  const basename = params.basename

  const nArticles = nUsers * nArticlesPerUser
  const sequelize = models.getSequelize(directory, basename);
  await models.sync(sequelize)

  printTimeNow = now()
  console.error(`User`);
  const userArgs = [];
  for (let i = 0; i < nUsers; i++) {
    const userArg = {
      username: `user${i}`,
      email: `user${i}@mail.com`,
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
  const articleArgs = [];
  for (let userIdx = 0; userIdx < nUsers; userIdx++) {
    for (let i = 0; i < nArticlesPerUser; i++) {
      const date = addDays(date0, i)
      const title = `My title ${i * (userIdx + 1)}`
      const articleArg = {
        title,
        authorId: users[userIdx].id,
        createdAt: date,
        // TODO not taking effect, don't know how to do it from bulkCrate, only with instances:
        // https://stackoverflow.com/questions/42519583/sequelize-updating-updatedat-manually
        // https://github.com/sequelize/sequelize/issues/3759
        updatedAt: date,
        body: `\\i[Italic]

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

== ${title} h2

=== ${title} h3
`,
      }
      articleArgs.push(articleArg)
    }
  }
  // Sort first by topic id, and then by user id to mix up votes a little:
  // otherwise user0 gets all votes, then user1, and so on.
  articleArgs.sort((a, b) => {
    if (a.title < b.title) {
      return -1
    } else if(a.title > b.title) {
      return 1
    } else if(a.authorId < b.authorIdtitle) {
      return -1
    } else if(a.authorId > b.authorIdtitle) {
      return 1
    } else {
      return 0;
    }
  })
  const articles = await sequelize.models.Article.bulkCreate(
    articleArgs,
    {
      validate: true,
      individualHooks: true,
    }
  )
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

  console.error('Tag');
  const tagArgs = []
  for (let i = 0; i < nTags; i++) {
    tagArgs.push({name: `tag${i}`})
  }
  const tags = await sequelize.models.Tag.bulkCreate(tagArgs)
  printTime()

  console.error('ArticleTag');
  let tagIdx = 0
  const articleTagArgs = []
  for (let i = 0; i < nArticles; i++) {
    const articleId = articles[i].id
    for (var j = 0; j < (i % (nMaxTagsPerArticle + 1)); j++) {
      articleTagArgs.push({
        articleId: articles[i].id,
        tagId: tags[tagIdx % nTags].id,
      })
      tagIdx += 1
    }
  }
  await sequelize.models.ArticleTag.bulkCreate(articleTagArgs)
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
