/* Models different types of references between two sections, e.g.
 * \x from one link to the other. */

const { DataTypes } = require('sequelize')

const cirodown = require('cirodown');

module.exports = (sequelize) => {
  const Ref = sequelize.define(
    'Ref',
    {
      from_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      defined_at: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      to_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      to_id_index: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      type: {
        type: DataTypes.TINYINT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['defined_at'], },
        { fields: ['from_id', 'type'], },
        { fields: ['to_id', 'type'], },
        {
          fields: ['from_id', 'defined_at', 'to_id', 'type'],
          unique: true
        },
      ],
    }
  )
  Ref.Types = {
    // https://cirosantilli.com/cirodown/include
    [cirodown.REFS_TABLE_PARENT]: 0,
    // https://cirosantilli.com/cirodown/internal-cross-reference
    [cirodown.REFS_TABLE_X]: 1,
    // https://cirosantilli.com/cirodown/secondary-children
    [cirodown.REFS_TABLE_X_CHILD]: 2,
  };
  return Ref;
}
