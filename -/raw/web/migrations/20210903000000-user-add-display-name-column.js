module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('User', 'displayName',
      {
        type: DataTypes.STRING(256),
        allowNull: false,
        defaultValue: '',
      },
      {transaction},
    )
    await queryInterface.bulkUpdate('User',
      {displayName: queryInterface.sequelize.col('username')},
      {},
      {transaction},
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('User', 'displayName', { transaction })
  })
};
