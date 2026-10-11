const name = 'article_issue_count_created_at_id'
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

module.exports = {
  // Keep writes available while indexing the existing production articles.
  up: async queryInterface => addIndexIfMissing(queryInterface, 'Article', [
    { name: 'issueCount', order: 'DESC' },
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => removeIndexIfExists(queryInterface, 'Article', name, { concurrently: true }),
}
