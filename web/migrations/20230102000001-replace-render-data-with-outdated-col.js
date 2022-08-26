// Would have been more acurate if we had created entries for filetype HTML. But lazy,
// and shouldn't break things, only lose some caching.
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.removeColumn(
      'Render',
      'date',
      { transaction },
    )
    await queryInterface.addColumn(
      'Render',
      'outdated',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn(
      'Render',
      'outdated',
      { transaction },
    )
    await queryInterface.addColumn(
      'Render',
      'date',
      {
        type: DataTypes.DATE,
        allowNull: true,
      },
      { transaction }
    )
  }),
};
