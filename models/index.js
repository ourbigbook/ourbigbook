const file = require('./file')
const id = require('./id')
const ref = require('./ref')
const last_render = require('./last_render')
const cliModel = require('./cli')

function addModels(sequelize, { web, cli }={}) {
  const File = file(sequelize, web)
  const Id = id(sequelize)
  const Ref = ref(sequelize)
  const LastRender = last_render.last_render(sequelize)
  if (cli) {
    const Cli = cliModel(sequelize)
  }
  // constraints: false for now because when we convert multiple files, we are creating IDs
  // and refs of files one by one. So if one file references another, it will initially reference
  // an undefined ID. The better solution would be to group data from conversion of all files,
  // then create all IDs and then create all refs, but lazy.
  Id.hasMany(Ref, { as: 'to', foreignKey: 'to_id', sourceKey: 'idid', constraints: false })
  Ref.belongsTo(Id, { as: 'to', foreignKey: 'to_id', targetKey: 'idid', constraints: false })
  Id.hasMany(Ref, { as: 'from', foreignKey: 'from_id', sourceKey: 'idid', constraints: false  })
  Ref.belongsTo(Id, { as: 'from', foreignKey: 'from_id', targetKey: 'idid', constraints: false })
  // Maybe we should add as: 'file' with lowercase here as we do everywhere else. Defaults to as: 'File'.
  Id.hasOne(File, { foreignKey: 'toplevel_id', sourceKey: 'idid', constraints: false  })
  File.belongsTo(Id, { foreignKey: 'toplevel_id', targetKey: 'idid', constraints: false })

  LastRender.belongsTo(File, { foreignKey: { name: 'fileId', allowNull: false }, onDelete: 'CASCADE' })
  File.hasOne(LastRender, { foreignKey: { name: 'fileId', allowNull: false }, onDelete: 'CASCADE' })

  // Needed for finding duplicates.
  Id.hasMany(Id, { as: 'duplicate', foreignKey: 'idid', sourceKey: 'idid', constraints: false });
}

module.exports = {
  addModels
}
