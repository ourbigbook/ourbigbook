const config = require('../front/config')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes

    // UploadDirectory
    await queryInterface.createTable(
      'UploadDirectory',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        path: {
          type: Sequelize.INTEGER,
          unique: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        parentId: {
          type: Sequelize.INTEGER,
        },
      },
      {
        transaction,
      }
    )
    await queryInterface.addConstraint('UploadDirectory', {
      fields: ['parentId'],
      type: 'foreign key',
      name: 'UploadDirectory_parentId_fkey',
      references: {
        table: 'UploadDirectory',
        field: 'id'
      },
      onDelete: 'set null',
      onUpdate: 'cascade',
      transaction,
    })
    await queryInterface.addIndex('UploadDirectory', ['createdAt'], { transaction })
    await queryInterface.addIndex('UploadDirectory', ['updatedAt'], { transaction })
    await queryInterface.addIndex('UploadDirectory', ['parentId', 'path'], { transaction })

    // ARef
    await queryInterface.createTable(
      'ARef',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        to: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        defined_at_line: {
          type: DataTypes.INTEGER,
        },
        defined_at_col: {
          type: DataTypes.INTEGER,
        },
        from: {
          type: DataTypes.INTEGER,
        },
        defined_at: {
          type: DataTypes.INTEGER,
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
      { transaction }
    )
    await queryInterface.addIndex('ARef', ['from', 'defined_at_line', 'defined_at_col'], { unique: true, transaction })
    await queryInterface.addIndex('ARef', ['from', 'to'], { transaction })
    await queryInterface.addIndex('ARef', ['to', 'from'], { transaction })
    await queryInterface.addConstraint('ARef', {
      fields: ['defined_at'],
      type: 'foreign key',
      name: 'ARef_defined_at_fkey',
      references: {
        table: 'File',
        field: 'id'
      },
      onDelete: 'cascade',
      onUpdate: 'cascade',
      transaction,
    })
    await queryInterface.addConstraint('ARef', {
      fields: ['from'],
      type: 'foreign key',
      name: 'ARef_from_fkey',
      references: {
        table: 'Id',
        field: 'id'
      },
      onDelete: 'cascade',
      onUpdate: 'cascade',
      transaction,
    })

    // Upload changes.
    await queryInterface.addColumn('Upload', 'parentId',
      {
        type: Sequelize.INTEGER,
      },
      { transaction },
    )
    await queryInterface.addConstraint('Upload', {
      fields: ['parentId'],
      type: 'foreign key',
      name: 'Upload_parentId_fkey',
      references: {
        table: 'UploadDirectory',
        field: 'id'
      },
      onDelete: 'set null',
      onUpdate: 'cascade',
      transaction,
    })
    await queryInterface.addIndex('Upload', ['parentId', 'path'], { transaction })
    await queryInterface.addIndex('Upload', ['hash'], { transaction })

    // User
    await queryInterface.addColumn('User', 'maxUploads',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxUploads,
      },
      { transaction },
    )
    await queryInterface.addColumn('User', 'maxUploadSize',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxUploadSize,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.dropTable('UploadDirectory', { transaction })
    await queryInterface.removeColumn('Upload', 'parentId', { transaction })
    await queryInterface.removeColumn('User', 'maxUploads', { transaction })
    await queryInterface.removeColumn('User', 'maxUploadSize', { transaction })
  }),
};
