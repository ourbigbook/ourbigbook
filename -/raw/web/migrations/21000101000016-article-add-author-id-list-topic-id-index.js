const e = require('cors');
const config = require('../front/config')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addIndex('Article', ['authorId', 'list', 'topicId'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'topicId'], { transaction })
  }),
};
