const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Id = sequelize.define(
    'Id',
    {
      // Don't use `id` because that is the default pk column.
      idid: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
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
