const { sequelizeCreateTriggerUpdateCount } = require('ourbigbook/nodejs_webpack_safe')

const indices = [
  ['discussionCount', 'createdAt'],
  ['commentCount', 'createdAt'],
  ['locked', 'discussionCount', 'createdAt'],
  ['locked', 'commentCount', 'createdAt'],
]

const triggerSpecs = [
  ['Issue', 'discussionCount', 'user_discussion_count'],
  ['Comment', 'commentCount', 'user_comment_count'],
]

async function dropTriggers(sequelize, transaction) {
  for (const [childTable, , nameExtra] of triggerSpecs) {
    for (const operation of ['insert', 'delete', 'update']) {
      const triggerName = `${childTable}_${operation}_${nameExtra}`
      if (sequelize.options.dialect === 'postgres') {
        await sequelize.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "${childTable}"`, { transaction })
        await sequelize.query(`DROP FUNCTION IF EXISTS "${triggerName}_fn"()`, { transaction })
      } else {
        await sequelize.query(`DROP TRIGGER IF EXISTS "${triggerName}"`, { transaction })
      }
    }
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('User', 'discussionCount', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }, { transaction })
    await queryInterface.addColumn('User', 'commentCount', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    }, { transaction })
    for (const index of indices) {
      await queryInterface.addIndex('User', index, { transaction })
    }
    for (const [childTable, countField, nameExtra] of triggerSpecs) {
      await sequelizeCreateTriggerUpdateCount(
        queryInterface.sequelize,
        { tableName: 'User' },
        { tableName: childTable },
        countField,
        'authorId',
        { nameExtra, transaction },
      )
    }

    await queryInterface.sequelize.query(`
UPDATE "User"
SET "discussionCount" = (
  SELECT CAST(COUNT(*) AS INTEGER) FROM "Issue" WHERE "Issue"."authorId" = "User"."id"
),
"commentCount" = (
  SELECT CAST(COUNT(*) AS INTEGER) FROM "Comment" WHERE "Comment"."authorId" = "User"."id"
)
`, { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await dropTriggers(queryInterface.sequelize, transaction)
    for (const index of indices) {
      await queryInterface.removeIndex('User', index, { transaction })
    }
    await queryInterface.removeColumn('User', 'commentCount', { transaction })
    await queryInterface.removeColumn('User', 'discussionCount', { transaction })
  }),
}
