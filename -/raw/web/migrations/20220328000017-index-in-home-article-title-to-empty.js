module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const sequelize = queryInterface.sequelize
    const Op = sequelize.Sequelize.Op
    await queryInterface.bulkUpdate(
      'File',
      { titleSource: '' },
      {
        [Op.and]: [
          { [Op.not]: { path: { [Op.substring]: '/%/' } } },
          { path: { [Op.substring]: '/index.bigb' } },
        ]
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => {
    // TODO.
  }
};
