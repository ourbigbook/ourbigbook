module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addIndex('Article', ['list', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['updatedAt'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'updatedAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeIndex('Article', ['list', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['updatedAt'], { transaction })
    await queryInterface.removeIndex('Article', ['list', 'updatedAt'], { transaction })
  }),
};
