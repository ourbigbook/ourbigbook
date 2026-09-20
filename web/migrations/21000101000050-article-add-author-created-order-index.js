const name = 'article_author_id_created_at_id'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => queryInterface.addIndex('Article', [
    'authorId',
    { name: 'createdAt', order: queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC' },
    { name: 'id', order: 'DESC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('Article', name, { concurrently: true }),
}
