module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    try {
      return Promise.all([
        queryInterface.changeColumn('Article', 'nestedSetIndex', {
          type: DataTypes.INTEGER,
          allowNull: true,
        }, { transaction }),
        queryInterface.changeColumn('Article', 'nestedSetNextSibling', {
          type: DataTypes.INTEGER,
          allowNull: true,
        }, { transaction }),
        queryInterface.changeColumn('Article', 'depth', {
          type: DataTypes.INTEGER,
          allowNull: true,
        }, { transaction }),
      ])
    } catch (err) { console.error(err); throw err }
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    try {
      return Promise.all([
        queryInterface.changeColumn('Article', 'nestedSetIndex', {
          type: DataTypes.INTEGER,
          allowNull: false,
        }, { transaction }),
        queryInterface.changeColumn('Article', 'nestedSetNextSibling', {
          type: DataTypes.INTEGER,
          allowNull: false,
        }, { transaction }),
        queryInterface.changeColumn('Article', 'depth', {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        }, { transaction }),
      ])
    } catch (err) { console.error(err); throw err }
  }),
};
