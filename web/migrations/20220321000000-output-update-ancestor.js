const path = require('path');

const models = require('../models');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // This is ugly because it creates a new connection.
    const sequelize = models.getSequelize(path.dirname(__dirname));
    return sequelize.models.Article.rerender({ log: true })
  },
  down: async (queryInterface, Sequelize) => {}
};
