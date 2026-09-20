module.exports = {
  up: async (qi, Sequelize) => qi.sequelize.transaction(async transaction => {
    for (const table of ['ArticleJob', 'TreeRebuildJob']) {
      await qi.addColumn(table, 'startedAt', { type: Sequelize.DATE, allowNull: true }, { transaction })
    }
    await qi.addIndex('ArticleBuild', ['treeJobId'], { transaction })
  }),
  down: async qi => qi.sequelize.transaction(async transaction => {
    await qi.removeIndex('ArticleBuild', 'article_build_tree_job_id', { transaction })
    for (const tableName of ['ArticleJob', 'TreeRebuildJob']) {
      if (qi.sequelize.getDialect() !== 'sqlite') {
        await qi.removeColumn(tableName, 'startedAt', { transaction })
        continue
      }
      // Preserve SQLite composite unique indexes when rebuilding the table.
      const replacements = { tableName }
      const [schema] = await qi.sequelize.query(
        `SELECT sql FROM sqlite_master WHERE tbl_name = :tableName AND type IN ('index', 'trigger') AND sql IS NOT NULL`, { replacements, transaction },
      )
      const [[table]] = await qi.sequelize.query(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = :tableName`, { replacements, transaction })
      const backup = `${tableName}_runtime_backup`
      const quote = value => qi.quoteIdentifier(value)
      const createSql = table.sql.replace(new RegExp('([`"]?)' + tableName + '\\1'), quote(backup))
        .replace(/,\s*[`"]?startedAt[`"]?\s+DATETIME/i, '')
      const fields = Object.keys(await qi.describeTable(tableName, { transaction }))
        .filter(field => field !== 'startedAt').map(quote).join(', ')
      await qi.sequelize.query(createSql, { transaction })
      await qi.sequelize.query(`INSERT INTO ${quote(backup)} (${fields}) SELECT ${fields} FROM ${quote(tableName)}`, { transaction })
      await qi.dropTable(tableName, { transaction })
      await qi.renameTable(backup, tableName, { transaction })
      for (const { sql } of schema) await qi.sequelize.query(sql, { transaction })
    }
  }),
}
