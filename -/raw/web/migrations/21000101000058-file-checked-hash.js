module.exports = {
  up: async (qi, Sequelize) => qi.addColumn('File', 'checkedHash', {
    type: Sequelize.STRING(512),
    allowNull: true,
  }),
  down: async qi => {
    const sequelize = qi.sequelize
    if (sequelize.getDialect() !== 'sqlite') return qi.removeColumn('File', 'checkedHash')
    await sequelize.query('PRAGMA foreign_keys = OFF')
    try {
      await sequelize.transaction(async transaction => {
        // Preserve constraints and indexes verbatim across repeated rollback.
        const [schema] = await sequelize.query(
          "SELECT sql FROM sqlite_master WHERE tbl_name = 'File' AND type IN ('index', 'trigger') AND sql IS NOT NULL",
          { transaction },
        )
        const [[table]] = await sequelize.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'File'", { transaction })
        const createSql = table.sql.replace(/,\s*[`"]?checkedHash[`"]?\s+VARCHAR\(512\)/i, '')
        const fields = Object.keys(await qi.describeTable('File', { transaction }))
          .filter(field => field !== 'checkedHash').map(field => qi.quoteIdentifier(field)).join(', ')
        await sequelize.query(createSql.replace(/([`"]?)File\1/, '"File_check_backup"'), { transaction })
        await sequelize.query(`INSERT INTO "File_check_backup" (${fields}) SELECT ${fields} FROM "File"`, { transaction })
        await qi.dropTable('File', { transaction })
        await sequelize.query(createSql, { transaction })
        await sequelize.query(`INSERT INTO "File" (${fields}) SELECT ${fields} FROM "File_check_backup"`, { transaction })
        await qi.dropTable('File_check_backup', { transaction })
        for (const { sql } of schema) await sequelize.query(sql, { transaction })
      })
    } finally {
      await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
