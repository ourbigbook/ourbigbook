const path = require('path')

const config = require('../front/config')
const models = require('../models')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await Promise.all([
      queryInterface.createTable(
        'Site',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          pinnedArticleId: {
            type: DataTypes.INTEGER,
            references: {
              model: 'Article',
              key: 'id'
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
            allowNull: true,
          },
        },
        {
          transaction,
        },
      ),
    ])
    // Create the singleton.
    await queryInterface.bulkInsert('Site', [{
      createdAt: new Date(),
      updatedAt: new Date(),
      pinnedArticleId: null,
    }], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    return Promise.all([
      queryInterface.dropTable('Site', { transaction }),
    ])
  })
};
