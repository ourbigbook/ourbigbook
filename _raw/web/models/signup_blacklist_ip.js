const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

module.exports = (sequelize) => {
  const SignupBlacklistIp = sequelize.define(
    'SignupBlacklistIp',
    {
      ip: {
        // This can be an IP like 123.456.789.123
        // or a prefix stopping at any . to block an entire range
        // e.g. just 123.456.789 will block all of 123.456.789.*
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      indexes: [
        { fields: ['ip'] },
      ],
      updatedAt: false,
    }
  )
  return SignupBlacklistIp
}
