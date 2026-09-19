const name = 'topic_topic_id_created_at'
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => addIndexIfMissing(queryInterface, 'Topic', [
    { name: 'topicId', order: 'DESC' },
    { name: 'createdAt', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => removeIndexIfExists(queryInterface, 'Topic', name, { concurrently: true }),
}
