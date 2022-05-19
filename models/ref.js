/* Models different types of references between two sections, e.g.
 * \x from one link to the other. */

const ourbigbook = require('../index');

module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize
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
        type: DataTypes.SMALLINT,
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
    // https://docs.ourbigbook.com/include
    [ourbigbook.REFS_TABLE_PARENT]: 0,
    // https://docs.ourbigbook.com/internal-cross-reference
    [ourbigbook.REFS_TABLE_X]: 1,
    // https://docs.ourbigbook.com/secondary-children
    [ourbigbook.REFS_TABLE_X_CHILD]: 2,
    // https://github.com/cirosantilli/ourbigbook/issues/198
    [ourbigbook.REFS_TABLE_X_TITLE_TITLE]: 3,
  };
  return Ref;
}
