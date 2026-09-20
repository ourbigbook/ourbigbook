module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.createTable('ArticleJob', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      activeUserId: { type: Sequelize.INTEGER, unique: true },
      requestId: { type: Sequelize.STRING, allowNull: false },
      requestHash: { type: Sequelize.STRING, allowNull: false },
      phase: { type: Sequelize.STRING, allowNull: false, defaultValue: 'render' },
      queuedAt: Sequelize.DATE,
      items: { type: Sequelize.TEXT, allowNull: false },
      total: { type: Sequelize.INTEGER, allowNull: false },
      completed: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'staged' },
      error: Sequelize.TEXT,
      finishedAt: Sequelize.DATE,
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    }, { transaction })
    await queryInterface.addIndex('ArticleJob', ['userId', 'requestId'], { unique: true, transaction })
    for (const fields of [['userId', 'id'], ['userId', 'status'], ['status', 'queuedAt'], ['status', 'createdAt']]) {
      await queryInterface.addIndex('ArticleJob', fields, { transaction })
    }
  }),
  down: async queryInterface => queryInterface.dropTable('ArticleJob'),
}
