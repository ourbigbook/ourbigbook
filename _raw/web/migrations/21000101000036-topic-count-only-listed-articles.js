const { sequelizeCreateTriggerUpdateCount } = require('ourbigbook/nodejs_webpack_safe')

async function createTopicCountTriggers(queryInterface, conditional, transaction) {
  await sequelizeCreateTriggerUpdateCount(
    queryInterface.sequelize,
    { tableName: 'Topic' },
    { tableName: 'Article' },
    'articleCount',
    'topicId',
    {
      articleTableIdField: 'topicId',
      countBooleanField: conditional ? 'list' : undefined,
      nameExtra: 'topic_article_count',
      transaction,
    },
  )
}

async function updateTopicCounts(queryInterface, conditional, transaction) {
  await queryInterface.sequelize.query(`
UPDATE "Topic"
SET "articleCount" = (
  SELECT CAST(COUNT(*) AS INTEGER)
  FROM "Article"
  WHERE
    "Article"."topicId" = "Topic"."topicId"${conditional ? `
    AND "Article"."list" = ${queryInterface.sequelize.options.dialect === 'postgres' ? 'TRUE' : '1'}` : ''}
)
`, { transaction })
}

module.exports = {
  up: async (queryInterface) => queryInterface.sequelize.transaction(async transaction => {
    await createTopicCountTriggers(queryInterface, true, transaction)
    await updateTopicCounts(queryInterface, true, transaction)
  }),
  down: async (queryInterface) => queryInterface.sequelize.transaction(async transaction => {
    await createTopicCountTriggers(queryInterface, false, transaction)
    await updateTopicCounts(queryInterface, false, transaction)
  }),
}
