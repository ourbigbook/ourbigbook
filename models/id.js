const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  return sequelize.define(
    'Id',
    {
      // Don't use `id` because that is the default pk column.
      idid: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      parent_id: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      parent_idx: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
        { fields: ['idid'], },
        { fields: ['path'], },
      ],
    }
  )
}
