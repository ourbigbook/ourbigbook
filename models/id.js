const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
  const Id = sequelize.define(
    'Id',
    {
      // Don't use `id` because that is the default pk column.
      idid: {
        type: DataTypes.TEXT,
        allowNull: false,
        // Used to be unique, but not the case anymore, because when converting a directory
        // with duplicates, we have to do the duplicate check at the end to account e.g. if an
        // ID is moved between two files. Previousy, we were nuking the DB of files to be converted,
        // and just extracing IDs every time. But with timestamp skipping, we just don't know if the
        // ID was moved between files or not until everything is done.
        //unique: true,
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

  Id.findDuplicates = async () => {
    return sequelize.models.Id.findAll({
      include: {
        model: sequelize.models.Id,
        as: 'duplicate',
        on: {
          '$Id.idid$': { [Op.col]: 'duplicate.idid' },
          '$Id.id$': { [Op.ne]: { [Op.col]: 'duplicate.id' } },
        },
        required: true,
      },
      order: [
        ['idid', 'ASC'],
        ['path', 'ASC'],
      ],
    })
  }

  return Id
}
