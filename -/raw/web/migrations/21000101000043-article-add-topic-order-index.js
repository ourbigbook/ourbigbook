const name = 'article_list_topic_id_created_at_id'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  // Leave the existing text_pattern_ops indexes available for prefix searches.
  up: async queryInterface => queryInterface.addIndex('Article', [
    'list',
    { name: 'topicId', order: 'ASC' },
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('Article', name, { concurrently: true }),
}
