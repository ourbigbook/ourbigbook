module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Site', 'automaticTopicLinksMaxWords',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Site', 'automaticTopicLinksMaxWords', { transaction })
  }),
};
