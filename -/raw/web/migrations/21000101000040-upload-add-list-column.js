const { createFileCountTriggers, createFileSizeTriggers, fileOwnerWhere } = require('../models/upload')

const indices = ['createdAt', 'updatedAt', 'size', 'path'].map(column => ['list', column])

async function updateCounts(sequelize, transaction, listedOnly) {
  await sequelize.query(`UPDATE "User" SET
    "fileCount" = (SELECT CAST(COUNT(*) AS INTEGER) FROM "Upload" WHERE ${fileOwnerWhere('"Upload"."path"')}${listedOnly ? ' AND "Upload"."list" = ' + sequelize.escape(true) : ''}),
    "fileSize" = (SELECT COALESCE(SUM(CAST("size" AS BIGINT)), 0) FROM "Upload" WHERE ${fileOwnerWhere('"Upload"."path"')}${listedOnly ? ' AND "Upload"."list" = ' + sequelize.escape(true) : ''})`, { transaction })
}

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('Upload', 'list', {
      type: Sequelize.DataTypes.BOOLEAN, allowNull: false, defaultValue: true,
    }, { transaction })
    for (const fields of indices) await queryInterface.addIndex('Upload', fields, { transaction })
    await createFileCountTriggers(queryInterface.sequelize, transaction)
    await createFileSizeTriggers(queryInterface.sequelize, transaction)
    await updateCounts(queryInterface.sequelize, transaction, true)
  }),
  down: async queryInterface => queryInterface.sequelize.transaction(async transaction => {
    const sequelize = queryInterface.sequelize
    await createFileCountTriggers(sequelize, transaction, false)
    await createFileSizeTriggers(sequelize, transaction, false)
    await updateCounts(sequelize, transaction, false)
    for (const fields of indices) await queryInterface.removeIndex('Upload', fields, { transaction })
    // SQLite rebuilds the table when removing a column; restore its indices and triggers.
    const [schema] = sequelize.options.dialect === 'sqlite' ? await sequelize.query(
      `SELECT sql FROM sqlite_master WHERE tbl_name = 'Upload' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
      { transaction },
    ) : [[]]
    await queryInterface.removeColumn('Upload', 'list', { transaction })
    for (const { sql } of schema) await sequelize.query(sql, { transaction })
  }),
}
