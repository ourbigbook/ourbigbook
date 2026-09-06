const { createFileCountTriggers, fileOwnerWhere } = require('../models/upload')

const indices = [
  ['fileCount', 'createdAt'],
  ['verified', 'locked', 'fileCount', 'createdAt'],
]

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('User', 'fileCount', {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }, { transaction })
    for (const index of indices) {
      await queryInterface.addIndex('User', index, { transaction })
    }
    await createFileCountTriggers(queryInterface.sequelize, transaction)
    await queryInterface.sequelize.query(`
UPDATE "User" SET "fileCount" = (
  SELECT CAST(COUNT(*) AS INTEGER) FROM "Upload"
  WHERE ${fileOwnerWhere('"Upload"."path"')}
)
`, { transaction })
  }),
  down: async (queryInterface) => {
    const sequelize = queryInterface.sequelize
    const sqlite = sequelize.options.dialect === 'sqlite'
    // Older SQLite rebuilds the table to remove a column. Preserve references,
    // indices and triggers while doing so.
    if (sqlite) await sequelize.query('PRAGMA foreign_keys = OFF')
    try {
      await sequelize.transaction(async transaction => {
        for (const operation of ['insert', 'delete', 'update']) {
          const name = `Upload_${operation}_user_file_count`
          if (sqlite) {
            await sequelize.query(`DROP TRIGGER IF EXISTS "${name}"`, { transaction })
          } else {
            await sequelize.query(`DROP TRIGGER IF EXISTS ${name} ON "Upload"`, { transaction })
            await sequelize.query(`DROP FUNCTION IF EXISTS "${name}_fn"()`, { transaction })
          }
        }
        for (const index of indices) {
          await queryInterface.removeIndex('User', index, { transaction })
        }
        const [schema] = sqlite ? await sequelize.query(
          `SELECT sql FROM sqlite_master WHERE tbl_name = 'User' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
          { transaction },
        ) : [[]]
        await queryInterface.removeColumn('User', 'fileCount', { transaction })
        for (const { sql } of schema) await sequelize.query(sql, { transaction })
      })
    } finally {
      if (sqlite) await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
