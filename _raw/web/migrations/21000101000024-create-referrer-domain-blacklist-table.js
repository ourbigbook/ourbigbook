module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const { DataTypes, NOW } = Sequelize
    await queryInterface.createTable(
      'ReferrerDomainBlacklist',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        domain: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          default: NOW,
        },
      },
      {
        transaction,
      }
    )
    await queryInterface.addIndex('ReferrerDomainBlacklist', ['domain'], { transaction })
    await queryInterface.addIndex('ReferrerDomainBlacklist', ['createdAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('ReferrerDomainBlacklist', { transaction })
  }),
};
