module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.createTable(
      'Upload',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        path: {
          type: DataTypes.STRING(1024),
          allowNull: false,
        },
        bytes: {
          type: DataTypes.BLOB,
          allowNull: false,
        },
        contentType: {
          type: DataTypes.STRING(256),
          allowNull: false,
        },
        size: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      },
      {
        transaction,
      }
    )
    await queryInterface.addIndex('Upload', ['path'], { unique: true, transaction })
    await queryInterface.addIndex('Upload', ['contentType', 'path'], { transaction })
    await queryInterface.addIndex('Upload', ['createdAt'], { transaction })
    await queryInterface.addIndex('Upload', ['size'], { transaction })
    await queryInterface.addIndex('Upload', ['updatedAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('Upload', { transaction })
  }),
};
