module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TreeRebuildJob', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      activeUserId: { type: Sequelize.INTEGER, unique: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
      error: Sequelize.TEXT,
      finishedAt: Sequelize.DATE,
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    })
  },
  down: async queryInterface => queryInterface.dropTable('TreeRebuildJob'),
}
