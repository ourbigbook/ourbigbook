/* Models different types of references between two sections, e.g.
 * \x from one link to the other. */

const ourbigbook = require('../index');

module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize
  const Ref = sequelize.define(
    'Ref',
    {
      type: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      from_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      to_id: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      defined_at: {
        type: DataTypes.TEXT,
        // Possible e.g. on Web where the parent ref is not strictly defined in any source code,
        // but rather via the UI.
        //allowNull: false,
      },
      defined_at_line: {
        type: DataTypes.INTEGER,
      },
      defined_at_col: {
        type: DataTypes.INTEGER,
      },
      inflected: {
        // This is as was given in the \x after trying pluralization/singularization
        // due to {magic} attempts, difffering from the raw inflection given.
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      to_id_index: {
        // Child index for parent references.
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      indexes: [
        // For the query that checks for corresponding \x magic inflections.
        { fields: ['defined_at', 'defined_at_line', 'defined_at_col', 'type'], },
        { fields: ['from_id', 'type'], },
        { fields: ['to_id', 'type'], },
        { fields: ['from_id', 'defined_at', 'to_id', 'type'], },
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
