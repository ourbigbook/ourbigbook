module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize
  return sequelize.define(
    'Cli',
    {
      host: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      username: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      defaultUsernameForHost: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['host', 'username'], unique: true },
      ],
    }
  )
}
