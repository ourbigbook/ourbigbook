const name = 'article_author_id_score_created_at_id'
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => addIndexIfMissing(queryInterface, 'Article', [
    'authorId',
    { name: 'score', order: 'DESC' },
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => removeIndexIfExists(queryInterface, 'Article', name, { concurrently: true }),
}
