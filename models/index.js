const id = require('./id')
const include = require('./include')
const file = require('./file')
const ref = require('./ref')

function addModels(sequelize) {
  const Id = id(sequelize)
  const Include = include(sequelize)
  const File = file(sequelize)
  const Ref = ref(sequelize)
}

module.exports = {
  addModels
}
