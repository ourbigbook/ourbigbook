// Would have been more acurate if we had created entries for filetype HTML. But lazy,
// and shouldn't break things, only lose some caching.
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn(
      'File',
      'last_render',
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await Promise.all([
      queryInterface.addColumn(
        'File',
        'last_render',
        {
          type: DataTypes.DATE,
          allowNull: true,
        },
        { transaction }
      ),
    ])
  }),
};
