/// Need a separate file from test.js because Mocha automatically defines stuff like it,
// which would break non-Mocha requirers.

const path = require('path')

const models = require('./models')

// https://stackoverflow.com/questions/563406/add-days-to-javascript-date
function addDays(oldDate, days) {
  const newDate = new Date(oldDate.valueOf());
  newDate.setDate(oldDate.getDate() + days);
  return newDate;
}
const date0 = new Date(2000, 0, 0, 0, 0, 0, 0)

async function generateDemoData(params) {
  const nUsers = params.nUsers === undefined ? 10 : params.nUsers
  const nArticlesPerUser = params.nArticlesPerUser === undefined ? 10 : params.nArticlesPerUser
  const nMaxCommentsPerArticle = params.nMaxCommentsPerArticle === undefined ? 3 : params.nMaxCommentsPerArticle
  const nMaxTagsPerArticle = params.nMaxTagsPerArticle === undefined ? 3 : params.nMaxTagsPerArticle
  const nFollowsPerUser = params.nFollowsPerUser === undefined ? 2 : params.nFollowsPerUser
  const nFavoritesPerUser = params.nFavoritesPerUser === undefined ? 5 : params.nFavoritesPerUser
  const nTags = params.nTags === undefined ? 10 : params.nTags
  const directory = params.directory
  const basename = params.basename

  const nArticles = nUsers * nArticlesPerUser

  const sequelize = models(directory, basename);
  await sequelize.sync({force: true})

  // Users
  const userArgs = [];
  for (var i = 0; i < nUsers; i++) {
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

  // Follows
  const followArgs = []
  for (var i = 0; i < nUsers; i++) {
    const userId = users[i].id
    for (var j = 0; j < nFollowsPerUser; j++) {
      followArgs.push({
        userId: userId,
        followId: users[(i + 1 + j) % nUsers].id,
      })
    }
  }
  await sequelize.models.UserFollowUser.bulkCreate(followArgs)

  // Articles
  const articleArgs = [];
  for (var i = 0; i < nArticles; i++) {
    const userIdx = i % nUsers
    const date = addDays(date0, i)
    const title = `My title ${i}`
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
  const articles = await sequelize.models.Article.bulkCreate(
    articleArgs,
    {
      validate: true,
      individualHooks: true,
    }
  )

  // Favorites
  let articleIdx = 0
  const favoriteArgs = []
  for (var i = 0; i < nUsers; i++) {
    const userId = users[i].id
    for (var j = 0; j < nFavoritesPerUser; j++) {
      favoriteArgs.push({
        userId: userId,
        articleId: articles[articleIdx % nArticles].id,
      })
      articleIdx += 1
    }
  }
  await sequelize.models.UserFavoriteArticle.bulkCreate(favoriteArgs)

  // Tags
  const tagArgs = []
  for (var i = 0; i < nTags; i++) {
    tagArgs.push({name: `tag${i}`})
  }
  const tags = await sequelize.models.Tag.bulkCreate(tagArgs)

  // ArticleTags
  let tagIdx = 0
  const articleTagArgs = []
  for (var i = 0; i < nArticles; i++) {
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

  // Comments
  const commentArgs = [];
  let commentIdx = 0;
  for (var i = 0; i < nArticles; i++) {
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

  return sequelize
}
exports.generateDemoData = generateDemoData
