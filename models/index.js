const file = require('./file')
const id = require('./id')
const ref = require('./ref')

function addModels(sequelize) {
  const File = file(sequelize)
  const Id = id(sequelize)
  const Ref = ref(sequelize)
  // constraints: false for now because when we convert multiple files, we are creating IDs
  // and refs of files one by one. So if one file references another, it will initially reference
  // an undefined ID. The better solution would be to group data from conversion of all files,
  // then create all IDs and then create all refs, but lazy.
  Id.hasMany(Ref, { as: 'to', foreignKey: 'to_id', sourceKey: 'idid', constraints: false })
  Ref.belongsTo(Id, { as: 'to', foreignKey: 'to_id', targetKey: 'idid', constraints: false })
  Id.hasMany(Ref, { as: 'from', foreignKey: 'from_id', sourceKey: 'idid', constraints: false  })
  Ref.belongsTo(Id, { as: 'from', foreignKey: 'from_id', targetKey: 'idid', constraints: false })
}

module.exports = {
  addModels
}
