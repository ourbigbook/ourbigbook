module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Article', 'image',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.addColumn('Issue', 'image',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Article', 'image', { transaction })
    await queryInterface.removeColumn('Issue', 'image', { transaction })
  }),
};
