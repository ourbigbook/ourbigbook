const name = 'article_topic_id_created_at_id'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => queryInterface.addIndex('Article', [
    { name: 'topicId', order: 'DESC' },
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('Article', name, { concurrently: true }),
}
