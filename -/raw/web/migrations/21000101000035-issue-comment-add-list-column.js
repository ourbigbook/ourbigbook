const { sequelizeCreateTriggerUpdateCount } = require('ourbigbook/nodejs_webpack_safe')

const issueListIndices = [
  ['list', 'createdAt'],
  ['list', 'updatedAt'],
  ['list', 'score'],
  ['list', 'followerCount'],
  ['list', 'commentCount'],
  ['authorId', 'list', 'createdAt'],
  ['authorId', 'list', 'updatedAt'],
  ['authorId', 'list', 'score'],
  ['authorId', 'list', 'followerCount'],
  ['authorId', 'list', 'commentCount'],
]

const commentListIndices = [
  ['list', 'createdAt'],
  ['list', 'updatedAt'],
  ['authorId', 'list', 'createdAt'],
  ['authorId', 'list', 'updatedAt'],
]

const triggerSpecs = [
  ['Issue', 'discussionCount', 'user_discussion_count'],
  ['Comment', 'commentCount', 'user_comment_count'],
]

async function createUserCountTriggers(queryInterface, conditional, transaction) {
  const sequelize = queryInterface.sequelize
  for (const [childTable, countField, nameExtra] of triggerSpecs) {
    await sequelizeCreateTriggerUpdateCount(
      sequelize,
      { tableName: 'User' },
      { tableName: childTable },
      countField,
      'authorId',
      {
        countBooleanField: conditional ? 'list' : undefined,
        nameExtra,
        transaction,
      },
    )
  }
}

async function updateUserCounts(queryInterface, conditional, transaction) {
  for (const [childTable, countField] of triggerSpecs) {
    await queryInterface.sequelize.query(`
UPDATE "User"
SET "${countField}" = (
  SELECT CAST(COUNT(*) AS INTEGER)
  FROM "${childTable}"
  WHERE "${childTable}"."authorId" = "User"."id"${conditional ? ` AND "${childTable}"."list" = ${queryInterface.sequelize.options.dialect === 'postgres' ? 'TRUE' : '1'}` : ''}
)
`, { transaction })
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const column = () => ({
      type: Sequelize.DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    })
    await queryInterface.addColumn('Issue', 'list', column(), { transaction })
    await queryInterface.addColumn('Comment', 'list', column(), { transaction })
    for (const index of issueListIndices) {
      await queryInterface.addIndex('Issue', index, { transaction })
    }
    for (const index of commentListIndices) {
      await queryInterface.addIndex('Comment', index, { transaction })
    }
    await createUserCountTriggers(queryInterface, true, transaction)
    await updateUserCounts(queryInterface, true, transaction)
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await createUserCountTriggers(queryInterface, false, transaction)
    await updateUserCounts(queryInterface, false, transaction)
    await queryInterface.removeColumn('Comment', 'list', { transaction })
    await queryInterface.removeColumn('Issue', 'list', { transaction })
    await createUserCountTriggers(queryInterface, false, transaction)
  }),
}
