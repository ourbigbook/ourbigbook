module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('Upload', 'width', {
      type: Sequelize.INTEGER,
      allowNull: true,
    }, { transaction })
    await queryInterface.addColumn('Upload', 'height', {
      type: Sequelize.INTEGER,
      allowNull: true,
    }, { transaction })
  }),
  down: async queryInterface => queryInterface.sequelize.transaction(async transaction => {
    const sequelize = queryInterface.sequelize
    if (sequelize.options.dialect === 'sqlite') {
      // Sequelize's table reconstruction loses inline UNIQUE constraints and
      // AUTOINCREMENT. Retain the original DDL, indexes and triggers instead.
      const [schema] = await sequelize.query(
        `SELECT type, sql FROM sqlite_master WHERE tbl_name = 'Upload' AND sql IS NOT NULL`,
        { transaction },
      )
      const original = schema.find(entry => entry.type === 'table').sql
      const create = original.replace(/CREATE TABLE\s+[`"]Upload[`"]/, 'CREATE TABLE "Upload_without_image_dimensions"')
        .replace(/,\s*[`"](?:width|height)[`"]\s+INTEGER/gi, '')
      const columns = Object.keys(await queryInterface.describeTable('Upload', { transaction }))
        .filter(column => column !== 'width' && column !== 'height')
        .map(column => queryInterface.queryGenerator.quoteIdentifier(column)).join(', ')
      await sequelize.query(create, { transaction })
      await sequelize.query(`INSERT INTO "Upload_without_image_dimensions" (${columns}) SELECT ${columns} FROM "Upload"`, { transaction })
      await sequelize.query('DROP TABLE "Upload"', { transaction })
      await sequelize.query('ALTER TABLE "Upload_without_image_dimensions" RENAME TO "Upload"', { transaction })
      for (const { type, sql } of schema) if (type !== 'table') await sequelize.query(sql, { transaction })
    } else {
      await queryInterface.removeColumn('Upload', 'height', { transaction })
      await queryInterface.removeColumn('Upload', 'width', { transaction })
    }
  }),
}
