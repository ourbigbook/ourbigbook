module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('ArticleTag', { transaction })
    await queryInterface.dropTable('Tag', { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    // TODO lazy.
  }),
};
