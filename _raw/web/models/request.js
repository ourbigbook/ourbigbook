const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

module.exports = (sequelize) => {
  const Request = sequelize.define(
    'Request',
    {
      ip: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      path: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      referrer: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      indexes: [
        { fields: ['referrer'] },
        { fields: ['ip'] },
      ]
    }
  )
  return Request
}
