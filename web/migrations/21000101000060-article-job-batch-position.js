const columns = ['batchIndex', 'batchCount']

module.exports = {
  up: async (qi, Sequelize) => qi.sequelize.transaction(async transaction => {
    for (const column of columns) {
      await qi.addColumn('ArticleJob', column, { type: Sequelize.INTEGER, allowNull: true }, { transaction })
    }
  }),
  down: async qi => qi.sequelize.transaction(async transaction => {
    if (qi.sequelize.getDialect() !== 'sqlite') {
      for (const column of columns) await qi.removeColumn('ArticleJob', column, { transaction })
      return
    }
    // Sequelize's SQLite table rebuild turns composite unique indexes into
    // individual unique columns. Preserve the original table definition instead.
    const [schema] = await qi.sequelize.query(
      `SELECT sql FROM sqlite_master WHERE tbl_name = 'ArticleJob' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
      { transaction },
    )
    const [[table]] = await qi.sequelize.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ArticleJob'`, { transaction },
    )
    let createSql = table.sql.replace(/([`"]?)ArticleJob\1/, '"ArticleJob_batch_backup"')
    for (const column of columns) createSql = createSql.replace(new RegExp(',\\s*[`"]?' + column + '[`"]?\\s+INTEGER', 'i'), '')
    const fields = Object.keys(await qi.describeTable('ArticleJob', { transaction }))
      .filter(field => !columns.includes(field)).map(field => qi.quoteIdentifier(field)).join(', ')
    await qi.sequelize.query(createSql, { transaction })
    await qi.sequelize.query(`INSERT INTO "ArticleJob_batch_backup" (${fields}) SELECT ${fields} FROM "ArticleJob"`, { transaction })
    await qi.dropTable('ArticleJob', { transaction })
    await qi.renameTable('ArticleJob_batch_backup', 'ArticleJob', { transaction })
    for (const { sql } of schema) await qi.sequelize.query(sql, { transaction })
  }),
}
