const file = require('./file')
const id = require('./id')
const ref = require('./ref')

function addModels(sequelize) {
  const File = file(sequelize)
  const Id = id(sequelize)
  const Ref = ref(sequelize)
}

module.exports = {
  addModels
}
