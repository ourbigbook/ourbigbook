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
      workerToken: Sequelize.STRING,
      localPid: Sequelize.INTEGER,
      localHost: Sequelize.STRING,
      localIdentity: Sequelize.STRING,
      recoveries: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      checkpoint: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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
        if (sqlite) {
          // Preserve table constraints verbatim: Sequelize's rebuild can lose
          // or duplicate the username/email unique indexes on repeated rollback.
          const [[table]] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'User'", { transaction })
          const createSql = table.sql
            .replace(/,\s*[`"]?dedicatedBuildWorker[`"]?\s+(?:TINYINT\(1\)|BOOLEAN)\s+NOT NULL\s+DEFAULT (?:0|false)/i, '')
          const fields = Object.keys(await queryInterface.describeTable('User', { transaction }))
            .filter(field => field !== 'dedicatedBuildWorker').map(field => queryInterface.quoteIdentifier(field)).join(', ')
          await sequelize.query(createSql.replace(/([`"]?)User\1/, '"User_build_backup"'), { transaction })
          await sequelize.query(`INSERT INTO "User_build_backup" (${fields}) SELECT ${fields} FROM "User"`, { transaction })
          await queryInterface.dropTable('User', { transaction })
          // Recreate rather than rename: triggers on other tables reference
          // User, so SQLite refuses ALTER TABLE while that name is absent.
          await sequelize.query(createSql, { transaction })
          await sequelize.query(`INSERT INTO "User" (${fields}) SELECT ${fields} FROM "User_build_backup"`, { transaction })
          await queryInterface.dropTable('User_build_backup', { transaction })
          for (const { sql } of schema) await sequelize.query(sql, { transaction })
        } else {
          await queryInterface.removeColumn('User', 'dedicatedBuildWorker', { transaction })
        }
      })
    } finally {
      if (sqlite) await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
