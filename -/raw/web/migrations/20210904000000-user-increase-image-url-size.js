module.exports = {
  // https://github.com/sequelize/sequelize/issues/12789
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('User', 'image', {
      type: Sequelize.STRING(2048),
    })
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('User', 'image', {
      type: Sequelize.STRING(255),
      allowNull: true,
    })
  }
};
