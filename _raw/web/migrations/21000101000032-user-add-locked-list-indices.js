const indices = [
  ['locked', 'createdAt'],
  ['locked', 'followerCount', 'createdAt'],
  ['locked', 'score', 'createdAt'],
]

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    for (const index of indices) {
      await queryInterface.addIndex('User', index, { transaction })
    }
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    for (const index of indices) {
      await queryInterface.removeIndex('User', index, { transaction })
    }
  }),
}
