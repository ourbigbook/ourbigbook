module.exports = {
  up: async (qi, Sequelize) => qi.addColumn('File', 'checkedHash', {
    type: Sequelize.STRING(512),
    allowNull: true,
  }),
  down: async qi => qi.sequelize.transaction(async transaction => {
    const uniqueIndexes = qi.sequelize.getDialect() === 'sqlite'
      ? (await qi.showIndex('File', { transaction })).filter(index => index.unique && index.name.startsWith('sqlite_autoindex_')) : []
    const [schema] = qi.sequelize.getDialect() === 'sqlite' ? await qi.sequelize.query(
      `SELECT sql FROM sqlite_master WHERE tbl_name = 'File' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
      { transaction },
    ) : [[]]
    await qi.removeColumn('File', 'checkedHash', { transaction })
    for (const { sql } of schema) await qi.sequelize.query(sql, { transaction })
    for (const index of uniqueIndexes) {
      const fields = index.fields.map(field => field.attribute)
      await qi.addIndex('File', fields, { unique: true, name: `file_rollback_unique_${fields.join('_')}`, transaction })
    }
  }),
}
