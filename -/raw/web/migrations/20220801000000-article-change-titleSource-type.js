module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    try {
      return Promise.all([
        queryInterface.changeColumn('Article', 'slug', {
          type: Sequelize.DataTypes.TEXT,
        }, { transaction }),
        queryInterface.changeColumn('Article', 'topicId', {
          type: Sequelize.DataTypes.TEXT,
        }, { transaction }),
        queryInterface.changeColumn('Issue', 'titleSource', {
          type: Sequelize.DataTypes.TEXT,
        }, { transaction }),
      ])
    } catch (err) { console.error(err); throw err }
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    try {
      return Promise.all([
        queryInterface.changeColumn('Article ', 'slug', {
          type: Sequelize.DataTypes.STRING,
        }, { transaction }),
        queryInterface.changeColumn('Article ', 'topicId', {
          type: Sequelize.DataTypes.STRING,
        }, { transaction }),
        queryInterface.changeColumn('Article ', 'topicId', {
          type: Sequelize.DataTypes.STRING(512),
        }, { transaction }),
      ])
    } catch (err) { console.error(err); throw err }
  }),
};
