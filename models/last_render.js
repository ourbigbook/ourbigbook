
/* Models different types of references between two sections, e.g.
 * \x from one link to the other. */

const ourbigbook = require('../index');

const LAST_RENDER_TYPES = {
  [ourbigbook.OUTPUT_FORMAT_HTML]: 0,
  [ourbigbook.OUTPUT_FORMAT_OURBIGBOOK]: 1,
  [ourbigbook.RENDER_TYPE_WEB]: 2,
};
exports.LAST_RENDER_TYPES = LAST_RENDER_TYPES

function last_render(sequelize) {
  const { DataTypes } = sequelize.Sequelize
  const LastRender = sequelize.define(
    'LastRender',
    {
      type: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      indexes: [
        // Foreign key.
        {
          fields: ['fileId', 'type'],
          unique: true,
        },
      ],
    }
  )
  LastRender.Types = LAST_RENDER_TYPES
  return LastRender;
}
exports.last_render = last_render
