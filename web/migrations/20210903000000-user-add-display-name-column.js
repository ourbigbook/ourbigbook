module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addColumn('User', 'displayName',
      {
        type: Sequelize.STRING(256),
        allowNull: false,
        defaultValue: '',
      },
      {transaction},
    )
    await queryInterface.bulkUpdate('User',
      {displayName: queryInterface.sequelize.col('username')},
      {},
      {transaction},
    )
    // TODO: we would have liked to do this instead, but the buildInsert fails with:
    // ERROR: Cannot read property 'map' of undefined
    //const [users] = await queryInterface.sequelize.query('SELECT * FROM "User";', { transaction });
    //const newUsers = users.map(user =>
    //  { return { id: user.id, displayName: user.username } }
    //)
    //await queryInterface.bulkInsert('User',
    //  newUsers,
    //  {
    //    updateOnDuplicate: ['displayName'],
    //    transaction,
    //  }
    //)
  }),
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('User', 'displayName')
  }
};
