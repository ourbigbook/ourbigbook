const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Ref = sequelize.define(
    'Ref',
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
  return Ref
}
