const ourbigbook = require('../index')
const render = require('./render')

module.exports = (sequelize, web=false) => {
  const { DataTypes } = sequelize.Sequelize
  const cols = {
    path: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    toplevel_id: {
      type: DataTypes.TEXT,
      allowNull: true,
      // Not unique for the same reason that Id idid is not unique.
      // see comments under the Id model.
      //unique: true,
    },
    last_parse: {
      // Used to skip parsing unmodified files on CLI. We could also
      // do SHA checking there, but would likely be a slower, possibly not noticable.
      // Not used on Web, where we just mass return SHA2s so CLI uploader can check.
      type: DataTypes.DATE,
      allowNull: true,
    },
  }
  if (web) {
    cols.titleSource = {
      // Toplevel header title source.
      type: DataTypes.TEXT,
      allowNull: false,
    }
    cols.bodySource = {
      // Body source, including any toplevel header arguments
      // like {c}, etc.
      type: DataTypes.TEXT,
      allowNull: false,
    }
    cols.sha256 = {
      // hex representation of the sha256 of the full source of the article,
      // including both title and body.
      type: DataTypes.STRING(512),
      allowNull: true,
    }
  }
  const indexes = [
    { fields: ['last_parse'], },
    { fields: ['path'], },
    { fields: ['toplevel_id'], },
  ]
  if (web) {
    // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
    indexes.push({ fields: ['authorId'], })
  }
  const File = sequelize.define(
    'File',
    cols,
    {
      indexes,
    }
  )
  return File
}
