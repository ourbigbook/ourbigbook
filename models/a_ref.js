// References from headers to local files: \a links, image/video embeds and
// {file} headers. Used for file-existence validation and "Used by" backlinks.

module.exports = (sequelize) => {
  const { DataTypes } = sequelize.Sequelize
  const ARef = sequelize.define(
    'ARef',
    {
      to: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      defined_at_line: {
        type: DataTypes.INTEGER,
      },
      defined_at_col: {
        type: DataTypes.INTEGER,
      },
    },
    {
      indexes: [
        { fields: ['from', 'defined_at_line', 'defined_at_col'], unique: true },
        { fields: ['from', 'to'], },
        { fields: ['to', 'from'], },
      ],
    }
  )
  return ARef;
}
