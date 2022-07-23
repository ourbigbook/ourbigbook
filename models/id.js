const ourbigbook = require('../index')

module.exports = (sequelize) => {
  const { DataTypes, Op } = sequelize.Sequelize
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
        //
        // Once there are no conversion errors however and the DB is stable, then they should be unique.
        //unique: true,
      },
      // Path at which the ID is defined, relative to project toplevel. E.g.:
      // animal/dog.bigb
      // or on web:
      // @username/dog.bigb
      // It would likely have been nicer if we had just not kept the extension in there,
      // but lazy to change now.
      path: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      ast_json: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Needed for title to title checks. This does duplicate
      // ast_json.macro_name for the toplevel element, but for nested elements in the JSON
      // we have no choice, so just keeping it duplicated for the toplevel for simplicity.
      // We could use database JSON functions instead, but these will be slower,
      // and have less support/portability.
      macro_name: {
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

  Id.findDuplicates = async (paths, transaction) => {
    const on = {
      '$Id.idid$': { [Op.col]: 'duplicate.idid' },
      '$Id.id$': { [Op.ne]: { [Op.col]: 'duplicate.id' } },
    }
    if (paths !== undefined) {
      on[Op.or] = [
        { '$Id.path$': paths },
        { '$duplicate.path$': paths },
      ]
    }
    return sequelize.models.Id.findAll({
      include: {
        model: sequelize.models.Id,
        as: 'duplicate',
        required: true,
        on,
      },
      order: [
        ['idid', 'ASC'],
        ['path', 'ASC'],
      ],
      transaction,
    })
  }

  Id.findInvalidTitleTitle = async (paths, transaction) => {
    let where
    if (paths !== undefined) {
      where = { 'path': paths }
    }
    return sequelize.models.Id.findAll({
      include: {
        model: sequelize.models.Ref,
        as: 'from',
        required: true,
        where: {
          type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_X_TITLE_TITLE],
        },
        include: {
          model: sequelize.models.Id,
          as: 'to',
          required: true,
          where: {
            macro_name: { [Op.ne]: ourbigbook.Macro.HEADER_MACRO_NAME },
          }
        },
      },
      order: [
        ['path', 'ASC'],
        ['idid', 'ASC'],
      ],
      transaction,
    })
  }

  return Id
}
