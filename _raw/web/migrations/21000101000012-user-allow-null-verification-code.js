module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    return queryInterface.changeColumn('User', 'verificationCode', {
      type: DataTypes.STRING(1024),
      allowNull: true,
    }, { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    return queryInterface.changeColumn('User', 'verificationCode', {
      type: DataTypes.STRING(1024),
      allowNull: false,
    }, { transaction })
  }),
};
