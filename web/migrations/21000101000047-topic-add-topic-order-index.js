const name = 'topic_topic_id_created_at'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => queryInterface.addIndex('Topic', [
    { name: 'topicId', order: 'DESC' },
    { name: 'createdAt', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('Topic', name, { concurrently: true }),
}
