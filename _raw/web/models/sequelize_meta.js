const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
  const SequelizeMeta = sequelize.define(
    'SequelizeMeta',
    {
      name: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: true,
        allowNull: false,
      },
    },
    {
      timestamps: false,
    },
  )
  return SequelizeMeta
}
