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
// I would rather operate on toplevel module.exports here directly as in:
//module.exports = {}
// but TypeScript doesn't like that and I don't have a solution for it:
// * https://github.com/microsoft/TypeScript/issues/32046
// * https://stackoverflow.com/questions/57784757/after-dynamically-export-files-typescript-cannot-find-module-file-index-tsx
const cant = {}
for (const [name, func] of permissions) {
  cant[name] = (loggedInUser, ...args) => (loggedInUser && loggedInUser.admin) ? false : func(loggedInUser, ...args)
}
exports.cant = cant
