// Permissions that require being logged in.
const permissions = [
  ['editIssue', (loggedInUser, issue) => loggedInUser.id !== issue.authorId],
  ['likeArticle', (loggedInUser, article) => {
    if (loggedInUser.id === article.author.id) {
      return 'You cannot like your own article or issue'
    }
  }],
  ['unlikeArticle', (loggedInUser, article) => {
    if (loggedInUser.id === article.author.id) {
      return 'You cannot unlike your own article or issue'
    }
  }],
  ['deleteComment', (loggedInUser, comment) => true],
]
permissions.forEach((permission, i, permissions) => {
  permissions[i] = [
    permission[0],
    (loggedInUser, ...args) => {
      if (!loggedInUser) {
        return 'You must be logged in to perform this action'
      }
      return permission[1](loggedInUser, ...args)
    }
  ]
})
module.exports = {}
for (const [name, func] of permissions) {
  module.exports[name] = (loggedInUser, ...args) => (loggedInUser && loggedInUser.admin) ? false : func(loggedInUser, ...args)
}
