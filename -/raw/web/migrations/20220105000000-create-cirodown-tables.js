// This is just a toy migration, to do it correctly we would have had to
// actually create new File/Id/Ref objects for existing articles.
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await Promise.all([
      queryInterface.createTable(
        'File',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
          path: {
            type: DataTypes.TEXT,
            allowNull: false,
            unique: true,
          },
          toplevel_id: {
            type: DataTypes.TEXT,
            allowNull: true,
            unique: true,
          },
          last_parse: {
            type: DataTypes.DATE,
            allowNull: true,
          },
          last_render: {
            type: DataTypes.DATE,
            allowNull: true,
          },
        },
        {
          indexes: [
            { fields: ['last_parse'], },
            { fields: ['last_render'], },
            { fields: ['path'], },
            { fields: ['toplevel_id'], },
          ],
          transaction,
        }
      ),
      queryInterface.createTable(
        'Id',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
          idid: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          path: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          ast_json: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          macro_name: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
        },
        {
          indexes: [
            { fields: ['idid'], },
            { fields: ['path'], },
          ],
          transaction,
        }
      ),
      queryInterface.createTable(
        'Ref',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
          from_id: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          defined_at: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          to_id: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          to_id_index: {
            type: DataTypes.INTEGER,
            allowNull: true,
          },
          type: {
            type: DataTypes.TINYINT,
            allowNull: false,
          },
        },
        {
          indexes: [
            { fields: ['defined_at'], },
            { fields: ['from_id', 'type'], },
            { fields: ['to_id', 'type'], },
            {
              fields: ['from_id', 'defined_at', 'to_id', 'type'],
              unique: true
            },
          ],
          transaction,
        }
      ),
    ])
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await Promise.all([
      await queryInterface.dropTable('File', { transaction }),
      await queryInterface.dropTable('Id', { transaction }),
      await queryInterface.dropTable('Ref', { transaction }),
    ])
  }),
};
