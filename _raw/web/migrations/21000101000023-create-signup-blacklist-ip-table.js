module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.createTable(
      'SignupBlacklistIp',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        ip: {
          type: DataTypes.TEXT,
          allowNull: false,
          unique: true,
        },
        note: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      },
      {
        transaction,
      }
    )
    await queryInterface.addIndex('SignupBlacklistIp', ['ip'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('SignupBlacklistIp', { transaction })
  }),
};
