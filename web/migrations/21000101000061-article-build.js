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
    for (const fields of [['userId', 'status'], ['status', 'id']]) await qi.addIndex('ArticleBuild', fields, { transaction })
    await qi.addColumn('ArticleJob', 'buildId', { type: Sequelize.STRING(64), allowNull: true }, { transaction })
    await qi.addColumn('ArticleJob', 'buildIndex', { type: Sequelize.INTEGER, allowNull: true }, { transaction })
    await qi.addIndex('ArticleJob', ['buildId', 'buildIndex'], { unique: true, transaction })
  }),
  down: async qi => qi.sequelize.transaction(async transaction => {
    await qi.removeIndex('ArticleJob', 'article_job_build_id_build_index', { transaction })
    if (qi.sequelize.getDialect() === 'sqlite') {
      // Preserve composite unique constraints across SQLite's table rebuild.
      const [schema] = await qi.sequelize.query(
        `SELECT sql FROM sqlite_master WHERE tbl_name = 'ArticleJob' AND type IN ('index', 'trigger') AND sql IS NOT NULL`, { transaction },
      )
      const [[table]] = await qi.sequelize.query(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ArticleJob'`, { transaction })
      const createSql = table.sql.replace(/([`"]?)ArticleJob\1/, '"ArticleJob_build_backup"')
        .replace(/,\s*[`"]?buildId[`"]?\s+VARCHAR\(64\)/i, '')
        .replace(/,\s*[`"]?buildIndex[`"]?\s+INTEGER/i, '')
      const fields = Object.keys(await qi.describeTable('ArticleJob', { transaction }))
        .filter(field => !['buildId', 'buildIndex'].includes(field)).map(field => qi.quoteIdentifier(field)).join(', ')
      await qi.sequelize.query(createSql, { transaction })
      await qi.sequelize.query(`INSERT INTO "ArticleJob_build_backup" (${fields}) SELECT ${fields} FROM "ArticleJob"`, { transaction })
      await qi.dropTable('ArticleJob', { transaction })
      await qi.renameTable('ArticleJob_build_backup', 'ArticleJob', { transaction })
      for (const { sql } of schema) await qi.sequelize.query(sql, { transaction })
    } else {
      for (const column of ['buildId', 'buildIndex']) await qi.removeColumn('ArticleJob', column, { transaction })
    }
    await qi.dropTable('ArticleBuild', { transaction })
  }),
}
