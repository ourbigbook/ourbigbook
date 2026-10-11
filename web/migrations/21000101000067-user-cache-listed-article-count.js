const { sequelizeCreateTriggerUpdateCount } = require('ourbigbook/nodejs_webpack_safe')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const sequelize = queryInterface.sequelize
    // Adding the column locks User until commit. Lock Article first to match
    // article writers' lock order and keep the backfill consistent with writes.
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query('LOCK TABLE "Article" IN SHARE ROW EXCLUSIVE MODE', { transaction })
    }
    await queryInterface.addColumn('User', 'listedArticleCount', {
      type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0,
    }, { transaction })
    await sequelizeCreateTriggerUpdateCount(sequelize, { tableName: 'User' }, { tableName: 'Article' },
      'listedArticleCount', 'authorId', { countBooleanField: 'list', nameExtra: 'user_listed_article_count', transaction })
    await sequelize.query(`UPDATE "User" SET "listedArticleCount" = (
      SELECT CAST(COUNT(*) AS INTEGER) FROM "Article"
      WHERE "Article"."authorId" = "User"."id" AND "Article"."list" = ${sequelize.escape(true)}
    )`, { transaction })
  }),
  down: async queryInterface => {
    const sequelize = queryInterface.sequelize
    const sqlite = sequelize.getDialect() === 'sqlite'
    if (sqlite) await sequelize.query('PRAGMA foreign_keys = OFF')
    try {
      await sequelize.transaction(async transaction => {
        if (!sqlite) {
          await sequelize.query('LOCK TABLE "Article" IN SHARE ROW EXCLUSIVE MODE', { transaction })
        }
        for (const operation of ['insert', 'delete', 'update']) {
          const name = `Article_${operation}_user_listed_article_count`
          if (!sqlite) {
            await sequelize.query(`DROP TRIGGER IF EXISTS ${name} ON "Article"`, { transaction })
            await sequelize.query(`DROP FUNCTION IF EXISTS "${name}_fn"()`, { transaction })
          } else {
            await sequelize.query(`DROP TRIGGER IF EXISTS "${name}"`, { transaction })
          }
        }
        // SQLite rebuilds User when dropping a column. Preserve its indexes and
        // triggers; the new counter's triggers on Article were removed above.
        const [schema] = sqlite ? await sequelize.query(
          `SELECT sql FROM sqlite_master WHERE tbl_name = 'User' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
          { transaction },
        ) : [[]]
        if (sqlite) {
          // Sequelize's SQLite describeTable omits UNIQUE constraints. Preserve
          // the username/email constraints while rebuilding this parent table.
          const fields = await queryInterface.describeTable('User', { transaction })
          delete fields.listedArticleCount
          for (const index of await queryInterface.showIndex('User', { transaction })) {
            if (index.unique && index.name.startsWith('sqlite_autoindex_')) {
              if (index.fields.length !== 1) throw new Error('Cannot rebuild User with a composite UNIQUE constraint')
              fields[index.fields[0].attribute].unique = true
            }
          }
          const sql = queryInterface.queryGenerator.removeColumnQuery('User', fields)
          for (const statement of sql.split(';').filter(Boolean)) {
            await sequelize.query(statement, { transaction, raw: true })
          }
        } else {
          await queryInterface.removeColumn('User', 'listedArticleCount', { transaction })
        }
        for (const { sql } of schema) await sequelize.query(sql, { transaction })
      })
    } finally {
      if (sqlite) await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
