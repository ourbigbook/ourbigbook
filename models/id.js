const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Id = sequelize.define(
    'Id',
    {
      path: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ast_json: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['path'], },
      ],
    }
  )
  return Id
}
