module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.createTable(
      'Request',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        ip: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        path: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        referrer: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        userAgent: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        transaction,
      }
    )
    await queryInterface.addIndex('Request', ['ip'], { transaction })
    await queryInterface.addIndex('Request', ['referrer'], { transaction })
    await queryInterface.addIndex('Request', ['createdAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('Request', { transaction })
  }),
};
