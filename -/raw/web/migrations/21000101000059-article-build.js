module.exports = {
  up: async (qi, Sequelize) => qi.sequelize.transaction(async transaction => {
    await qi.createTable('ArticleBuild', {
      id: { type: Sequelize.STRING(64), primaryKey: true },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      activeUserId: { type: Sequelize.INTEGER, unique: true },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'staged' },
      jobCount: Sequelize.INTEGER,
      rebuildTree: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      treeJobId: Sequelize.INTEGER,
      error: Sequelize.TEXT,
      finishedAt: Sequelize.DATE,
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    }, { transaction })
    for (const fields of [['userId', 'status'], ['status', 'id'], ['treeJobId']]) await qi.addIndex('ArticleBuild', fields, { transaction })
  }),
  down: async qi => qi.dropTable('ArticleBuild'),
}
