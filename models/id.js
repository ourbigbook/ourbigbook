const { EntryPlugin } = require('webpack')
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
    // Raw query version is way way faster (20s -> 3s on ourbigbook.com database 8k rows, Postgres 15 )
    // because not SELECTING JOIN tabee fields leads it to be much faster for some reason
    // likely DB query planning related:
    // maybe https://dba.stackexchange.com/questions/190533/slow-query-in-postgresql-selecting-a-single-row-from-between-a-range-defined-in
    // And can't not select less in sequelize because it is buggy AF, maybe:
    // https://github.com/sequelize/sequelize/issues/11096
    let paths_str
    if (paths.length) {
      paths_str = `
  AND "File"."path" IN (:paths)`
    } else {
      paths_str = ''
    }
    return (await sequelize.query(`
SELECT
  "Id"."id",
  "Id"."idid",
  "Id"."toplevel_id",
  "Id"."ast_json",
  "Id"."macro_name",
  "Id"."createdAt",
  "Id"."updatedAt",
  "Id"."defined_at"
FROM
  "Id"
  INNER JOIN "Id" AS "duplicate" ON "Id"."idid" = "duplicate"."idid"
    AND "Id"."id" != "duplicate"."id"
  INNER JOIN "File" ON "Id"."defined_at" = "File"."id"${paths_str}
ORDER BY
  "Id"."idid" ASC,
  "File"."path" ASC;
`,
      {
        replacements: {
          paths,
        },
        transaction,
      }
    ))[0]

    const on = {
      '$Id.idid$': { [Op.col]: 'duplicate.idid' },
      '$Id.id$': { [Op.ne]: { [Op.col]: 'duplicate.id' } },
    }
    if (paths.length) {
      on[Op.or] = [
        { '$idDefinedAt.path$': paths },
        { '$duplicate->idDefinedAt.path$': paths },
      ]
    }
    return sequelize.models.Id.findAll({
      logging: console.log,
      include: [
        {
          model: sequelize.models.Id,
          as: 'duplicate',
          required: true,
          attributes: [],
          //through: { attributes: [] },
          include: [
            {
              model: sequelize.models.File,
              as: 'idDefinedAt',
              required: true,
              attributes: [],
              //through: { attributes: [] },
            },
          ],
        },
        {
          model: sequelize.models.File,
          as: 'idDefinedAt',
          required: true,
          on,
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
    let where
    if (paths === undefined) {
      where = { path: paths }
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
