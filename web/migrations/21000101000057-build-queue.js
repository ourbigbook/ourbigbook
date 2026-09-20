module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('User', 'dedicatedBuildWorker', {
      type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
    }, { transaction })
    await queryInterface.createTable('BuildQueue', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false },
      kind: { type: Sequelize.STRING, allowNull: false },
      jobId: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'queued' },
      activeSlot: { type: Sequelize.STRING, unique: true },
      expiresAt: Sequelize.DATE,
      workerId: Sequelize.INTEGER,
      dynoId: Sequelize.STRING,
      checkedAt: Sequelize.DATE,
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    }, { transaction })
    await queryInterface.addIndex('BuildQueue', ['kind', 'jobId'], { unique: true, transaction })
    await queryInterface.addIndex('BuildQueue', ['status', 'id'], { transaction })
    await queryInterface.addIndex('BuildQueue', ['workerId'], { transaction })
  }),
  down: async queryInterface => {
    const sequelize = queryInterface.sequelize
    const sqlite = sequelize.getDialect() === 'sqlite'
    if (sqlite) await sequelize.query('PRAGMA foreign_keys = OFF')
    try {
      await sequelize.transaction(async transaction => {
        const [schema] = sqlite ? await sequelize.query(
          `SELECT sql FROM sqlite_master WHERE tbl_name = 'User' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
          { transaction },
        ) : [[]]
        await queryInterface.dropTable('BuildQueue', { transaction })
        await queryInterface.removeColumn('User', 'dedicatedBuildWorker', { transaction })
        for (const { sql } of schema) await sequelize.query(sql, { transaction })
      })
    } finally {
      if (sqlite) await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
