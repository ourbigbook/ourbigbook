const oldIndices = [
  ['locked', 'createdAt'],
  ['locked', 'followerCount', 'createdAt'],
  ['locked', 'discussionCount', 'createdAt'],
  ['locked', 'commentCount', 'createdAt'],
  ['locked', 'score', 'createdAt'],
  ['locked', 'username'],
]

const newIndices = oldIndices.map(index => ['verified', ...index])

async function replaceIndices(queryInterface, remove, add, transaction) {
  for (const index of remove) {
    await queryInterface.removeIndex('User', index, { transaction })
  }
  for (const index of add) {
    await queryInterface.addIndex('User', index, { transaction })
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await replaceIndices(queryInterface, oldIndices, newIndices, transaction)
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await replaceIndices(queryInterface, newIndices, oldIndices, transaction)
  }),
}
