const permissions = [
  ['editIssue', (loggedInUser, issue) => loggedInUser.id === issue.authorId],
  ['deleteComment', (loggedInUser, comment) => false],
]
permissions.forEach(permission => [
  permission[0],
  (loggedInUser, ...args) => loggedInUser && permission[1](loggedInUser, ...args)
])
module.exports = {}
for (const [name, func] of permissions) {
  module.exports[name] = (loggedInUser, ...args) => (loggedInUser && loggedInUser.admin) ? true : func(loggedInUser, ...args)
}
