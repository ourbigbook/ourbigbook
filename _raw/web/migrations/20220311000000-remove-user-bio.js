module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('User', 'bio')
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('User', 'bio', Sequelize.DataTypes.STRING)
  }),
};
