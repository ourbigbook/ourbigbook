const web_api = require('ourbigbook/web_api')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    const sequelize = queryInterface.sequelize
    await queryInterface.addColumn('Upload', 'hash',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
    let i = 0;
    while (true) {
      const [uploads,] = await sequelize.query(
        `SELECT "id", "bytes" FROM "Upload" ORDER BY "id" ASC LIMIT 10 OFFSET ${i}`,
        { transaction },
      )
      for (const upload of uploads) {
        await queryInterface.bulkUpdate(
          'Upload',
          { hash: web_api.hashToHex(upload.bytes) },
          { id: upload.id },
          {
            logging: console.log,
            transaction,
          }
        )
      }
      if (uploads.length < 10) {
        break
      }
      i += uploads.length
    }
    await queryInterface.changeColumn('Upload', 'path',
      {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Upload', 'hash', { transaction })
  }),
};
