const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

module.exports = (sequelize) => {
  const ReferrerDomainBlacklist = sequelize.define(
    'ReferrerDomainBlacklist',
    {
      domain: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      updatedAt: false,
      indexes: [
        { fields: ['domain'] },
        { fields: ['createdAt'] },
      ]
    }
  )
  return ReferrerDomainBlacklist
}
