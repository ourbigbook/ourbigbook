module.exports = (sequelize, web=false) => {
  const { DataTypes } = sequelize.Sequelize
  const cols = {
    // Path of the file relative to project toplevel. E.g.:
    // animal/dog.bigb
    // or on web:
    // @username/dog.bigb
    // It would likely have been nicer if we had just not kept the extension in there,
    // but lazy to change now.
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
      // do SHA checking there, but would likely be a slower, possibly not noticeable.
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
    cols.hash = {
      // hex representation of the hash of the full source of the article,
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
