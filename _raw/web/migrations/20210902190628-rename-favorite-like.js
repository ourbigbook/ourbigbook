module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.renameTable('UserFavoriteArticle', 'UserLikeArticle');
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.renameTable('UserLikeArticle', 'UserFavoriteArticle');
  }
};
