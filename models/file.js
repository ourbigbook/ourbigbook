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
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_render: {
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
  }
  const indexes = [
    { fields: ['last_parse'], },
    { fields: ['last_render'], },
    { fields: ['path'], },
    { fields: ['toplevel_id'], },
  ]
  if (web) {
    // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
    indexes.push({ fields: ['authorId'], })
  }
  return sequelize.define(
    'File',
    cols,
    {
      indexes,
    }
  )
}
