const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Include = sequelize.define(
    'Include',
    {
      from_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      from_path: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      to_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type: {
        type: DataTypes.TINYINT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['from_path'], },
        { fields: ['from_id', 'type'], },
        { fields: ['to_id', 'type'], },
      ],
    }
  )
  return Include
}
