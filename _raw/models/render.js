/* Represents the status of a specific type of rendering of an input source.
 *
 * Has to be on separate table than File because there can be multiple different render types,
 * notably HTML and BIGB for now.
 *
 * Used primarily to decide if rerender is needed or not for a given input.
 */

const ourbigbook = require('../index');

const RENDER_TYPES = {
  [ourbigbook.OUTPUT_FORMAT_HTML]: 0,
  [ourbigbook.OUTPUT_FORMAT_OURBIGBOOK]: 1,
  [ourbigbook.RENDER_TYPE_WEB]: 2,
};
exports.RENDER_TYPES = RENDER_TYPES

function render(sequelize) {
  const { DataTypes } = sequelize.Sequelize
  const Render = sequelize.define(
    'Render',
    {
      type: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      outdated: {
        // Instead of having this field we could as well just delete the
        // objects when we are outdated. Would be slightly nicer, but
        // less extensible and lazy now.
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
  Render.Types = RENDER_TYPES
  return Render;
}
exports.render = render
