function addModels(sequelize) {
  const Id = require('./id')(sequelize)
  const Include = require('./include')(sequelize)
  const File = require('./file')(sequelize)
  const Ref = require('./ref')(sequelize)
}

exports = {
  addModels
}
