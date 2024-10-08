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
        // ID is moved between two files. Previously, we were nuking the DB of files to be converted,
        // and just extracting IDs every time. But with timestamp skipping, we just don't know if the
        // ID was moved between files or not until everything is done.
        //
        // Once there are no conversion errors however and the DB is stable, then they should be unique.
        //unique: true,
      },
      // The ID of the toplevel header for this element. E.g. in:
      //
      // ``
      // = h1
      //
      // == h2
      // {toplevel}
      //
      // === h3
      //
      // == h2 2
      // ``
      //
      // both h2 and h3 had toplevel_id = h2.
      toplevel_id: {
        type: DataTypes.TEXT,
        // Can be NULL e.g. for an image before any header.
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
        { fields: ['defined_at'], },
      ],
    }
  )

  Id.findDuplicates = async (paths, transaction) => {
    const where = {}
    if (paths !== undefined) {
      where.path = paths
    }
    return sequelize.models.Id.findAll({
      include: [
        {
          model: sequelize.models.Id,
          as: 'duplicate',
          required: true,
          on: {
            '$Id.idid$': { [Op.col]: 'duplicate.idid' },
            '$Id.id$': { [Op.ne]: { [Op.col]: 'duplicate.id' } },
          },
        },
        {
          model: sequelize.models.File,
          as: 'idDefinedAt',
          required: true,
          where,
        },
      ],
      order: [
        ['idid', 'ASC'],
        [sequelize.col('idDefinedAt.path'), 'ASC'],
      ],
      transaction,
    })
  }

  Id.findInvalidTitleTitle = async (paths, transaction) => {
    const where = {}
    if (paths !== undefined) {
      where.path = paths
    }
    return sequelize.models.Id.findAll({
      include: [
        {
          model: sequelize.models.File,
          as: 'idDefinedAt',
          required: true,
          where,
        },
        {
          model: sequelize.models.Ref,
          as: 'from',
          required: true,
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_X_TITLE_TITLE],
          },
          include: [
            {
              model: sequelize.models.Id,
              as: 'to',
              required: true,
              where: {
                macro_name: { [Op.ne]: ourbigbook.Macro.HEADER_MACRO_NAME },
              }
            },
          ],
        },
      ],
      order: [
        [sequelize.col('idDefinedAt.path'), 'ASC'],
        ['idid', 'ASC'],
      ],
      transaction,
    })
  }

  return Id
}
