module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('File', 'sha256',
      {
        type: Sequelize.STRING(512),
        allowNull: true,
      },
      {transaction},
    )
  }),
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('File', 'sha256')
  }
};
