const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

module.exports = (sequelize) => {
  const Upload = sequelize.define(
    'Upload',
    {
      path: {
        type: DataTypes.STRING(1024),
        allowNull: false,
        unique: {
          msg: 'path is taken.'
        },
      },
      bytes: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      contentType: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['contentType', 'path'] },
        { fields: ['createdAt'] },
        { fields: ['size'] },
        { fields: ['updatedAt'] },
      ]
    }
  )
  return Upload
}
