const assert = require('assert')

const a_ref = require('./a_ref')
const file = require('./file')
const id = require('./id')
const ref = require('./ref')
const render = require('./render')
const cliModel = require('./cli')

function addModels(sequelize, { web, cli }={}) {
  const ARef = a_ref(sequelize)
  const File = file(sequelize, web)
  const Id = id(sequelize)
  const Ref = ref(sequelize)
  const Render = render.render(sequelize)
  if (cli) {
    const Cli = cliModel(sequelize)
  }

  // Id <-> Ref
  // constraints: false for now because when we convert multiple files, we are creating IDs
  // and refs of files one by one. So if one file references another, it will initially reference
  // an undefined ID. The better solution would be to group data from conversion of all files,
  // then create all IDs and then create all refs, but lazy.
  Id.hasMany(Ref, { as: 'to', foreignKey: 'to_id', sourceKey: 'idid', constraints: false })
  Ref.belongsTo(Id, { as: 'to', foreignKey: 'to_id', targetKey: 'idid', constraints: false })
  Id.hasMany(Ref, { as: 'from', foreignKey: 'from_id', sourceKey: 'idid', constraints: false })
  Ref.belongsTo(Id, { as: 'from', foreignKey: 'from_id', targetKey: 'idid', constraints: false })

  // Id <-> File
  Id.hasOne(File, { as: 'toplevelId', foreignKey: 'toplevel_id', sourceKey: 'idid', constraints: false })
  File.belongsTo(Id, { as: 'toplevelId', foreignKey: 'toplevel_id', targetKey: 'idid', constraints: false })
  Id.belongsTo(File, { as: 'idDefinedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })
  File.hasMany(Id, { as: 'idDefinedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })

  // Ref <-> File
  Ref.belongsTo(File, { as: 'definedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })
  File.hasMany(Ref, { as: 'definedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })

  // ARef <-> Id. Under which ID ARef is defined at.
  ARef.belongsTo(Id, { as: 'fromId', foreignKey: 'from', onDelete: 'CASCADE' })
  Id.hasMany(ARef, { as: 'fromId', foreignKey: 'from', onDelete: 'CASCADE' })

  // ARef <-> File. Under which File ARef is defined at. This can be deduced from
  // the Id as well, but we add it as well to cover the edge semi-supported case of
  // files without toplevel header.
  ARef.belongsTo(File, { as: 'aRefDefinedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })
  File.hasMany(ARef, { as: 'aRefDefinedAt', foreignKey: 'defined_at', onDelete: 'CASCADE' })

  Render.belongsTo(File, { foreignKey: { name: 'fileId', allowNull: false }, onDelete: 'CASCADE' })
  File.hasOne(Render, { foreignKey: { name: 'fileId', allowNull: false }, onDelete: 'CASCADE' })

  // Id <-> Id
  // Needed for finding duplicates.
  Id.hasMany(Id, { as: 'duplicate', foreignKey: 'idid', sourceKey: 'idid', constraints: false });

  // Ref <-> Ref
  // Needed for finding multiple parents.
  Ref.hasMany(Ref, { as: 'duplicate', foreignKey: 'to_id', sourceKey: 'to_id', constraints: false });
}

/** Find rows where column col start with the string "startWith" using the index. */
function sequelizeWhereStartsWith(sequelize, startWith, col) {
  if (sequelize.options.dialect === 'postgres') {
    return { [sequelize.Sequelize.Op.startsWith]: startWith }
  } else {
    // explicit col is terrible here, but I can't find a way around it in v6:
    // https://stackoverflow.com/questions/52397419/sequelize-custom-operators/79233911#79233911
    return sequelize.literal(`${col} GLOB ${sequelize.escape(startWith + '*')}`)
  }
}

module.exports = {
  addModels,
  sequelizeWhereStartsWith,
}
