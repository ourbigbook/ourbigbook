const permissions = [
  ['editIssue', (loggedInUser, issue) => loggedInUser.id === issue.authorId],
  ['deleteComment', (loggedInUser, comment) => false],
]
module.exports = {}
for (const [name, func] of permissions) {
  module.exports[name] = (loggedInUser, ...args) => loggedInUser.admin ? true : func(loggedInUser, ...args)
}
