module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await Promise.all([
      queryInterface.createTable('Ref',
        {
          from_id: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          from_path: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          to_id: {
            type: DataTypes.TEXT,
            allowNull: false,
          },
          type: {
            type: DataTypes.TINYINT,
            allowNull: false,
          },
        },
        {
          indexes: [
            { fields: ['from_path'], },
            { fields: ['from_id', 'type'], },
            { fields: ['to_id', 'type'], },
          ],
        }
      ),
      queryInterface.createTable('Ref',
      queryInterface.createTable('Ref',
    ])
  }),
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('User', 'displayName')
  }
};
