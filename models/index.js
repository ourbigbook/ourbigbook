
const sequelize = require('better-sqlite3');

const fs = require('fs')
const path = require('path')

const { Sequelize, DataTypes } = require('sequelize')

function addModels(sequelize) {
  const Id = require('./id')(sequelize)
  const Include = require('./include')(sequelize)
  const File = require('./file')(sequelize)
  const Ref = require('./ref')(sequelize)
}
