module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize
  return sequelize.define(
    'Cli',
    {
      host: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      username: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['host'], },
      ],
    }
  )
}
