module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Article', 'titleRenderWithScope',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.bulkUpdate('Article',
      { titleRenderWithScope: queryInterface.sequelize.col('titleRender') },
      {},
      { transaction },
    )
    await queryInterface.changeColumn('Article', 'titleRenderWithScope',
      {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Article', 'titleRenderWithScope', { transaction })
  }),
};
