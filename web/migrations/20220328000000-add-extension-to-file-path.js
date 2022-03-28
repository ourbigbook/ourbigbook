module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const sequelize = queryInterface.sequelize
    await queryInterface.bulkUpdate(
      'File',
      { path: sequelize.literal("path || '.bigb'") },
      {},
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => {
    // TODO.
  }
};
