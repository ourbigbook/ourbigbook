const indexName = 'article_author_list_depth_nested_set_index'
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => {
    await addIndexIfMissing(
      queryInterface,
      'Article',
      ['authorId', 'list', 'depth', 'nestedSetIndex'],
      { concurrently: true, name: indexName },
    )
  },
  down: async queryInterface => {
    await removeIndexIfExists(queryInterface, 'Article', indexName, { concurrently: true })
  },
}
