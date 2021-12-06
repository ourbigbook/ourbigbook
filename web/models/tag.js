const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
  const Tag = sequelize.define(
    'Tag',
    {
      name: {
        type: DataTypes.STRING,
        unique: {
          message: 'Tag name must be unique.'
        },
      },
    }
  )

  return Tag
}
