module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('User', 'nestedSetNeedsUpdate',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('User', 'nestedSetNeedsUpdate', { transaction })
  }),
};
