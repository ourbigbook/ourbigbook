const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const File = sequelize.define(
    'File',
    {
      path: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      toplevel_id: {
        type: DataTypes.TEXT,
        allowNull: true,
        unique: true,
      },
    },
    {
      indexes: [
        { fields: ['path'], },
        { fields: ['toplevel_id'], },
      ],
    }
  )
  return File
}
