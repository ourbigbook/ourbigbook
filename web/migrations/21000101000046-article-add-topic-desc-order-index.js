const name = 'article_list_topic_id_desc_created_at_id'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => queryInterface.addIndex('Article', [
    'list',
    { name: 'topicId', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('Article', name, { concurrently: true }),
}
