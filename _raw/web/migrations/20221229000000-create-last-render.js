// Would have been more acurate if we had created entries for filetype HTML. But lazy,
// and shouldn't break things, only lose some caching.
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await Promise.all([
      queryInterface.createTable(
        'LastRender',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
          type: {
            type: DataTypes.SMALLINT,
            allowNull: false,
          },
          date: {
            type: DataTypes.DATE,
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
          // https://stackoverflow.com/questions/29904939/writing-migrations-with-foreign-keys-using-sequelizejs
          fileId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
              model: 'File',
              key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
        },
        {
          transaction,
        }
      ),
    ])
    // https://stackoverflow.com/questions/62667269/sequelize-js-how-do-we-change-column-type-in-migration/70486686#70486686
    //await queryInterface.removeColumn(
    //  'File',
    //  'last_render',
    //  { transaction },
    //)
    // https://stackoverflow.com/questions/42707568/create-a-table-and-add-indexes-in-a-single-migration-with-sequelize
    await queryInterface.addIndex('LastRender', ['fileId', 'type'], { unique: true, transaction });
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await Promise.all([
      queryInterface.dropTable('LastRender', { transaction }),
      // https://stackoverflow.com/questions/62667269/sequelize-js-how-do-we-change-column-type-in-migration/70486686#70486686
      //queryInterface.addColumn(
      //  'File',
      //  'last_render',
      //  {
      //    type: DataTypes.DATE,
      //    allowNull: true,
      //    transaction,
      //  }
      //),
    ])
  }),
};
