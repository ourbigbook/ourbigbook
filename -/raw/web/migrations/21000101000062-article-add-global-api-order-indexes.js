const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

const indexes = [
  ['article_updated_at_created_at_id', 'updatedAt'],
  ['article_follower_count_created_at_id', 'followerCount'],
]

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => {
    const dateOrder = queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC'
    for (const [name, field] of indexes) {
      await addIndexIfMissing(queryInterface, 'Article', [
        { name: field, order: field === 'updatedAt' ? dateOrder : 'DESC' },
        { name: 'createdAt', order: dateOrder },
        { name: 'id', order: 'DESC' },
      ], { name, concurrently: true })
    }
  },
  down: async queryInterface => {
    for (const [name] of [...indexes].reverse()) {
      await removeIndexIfExists(queryInterface, 'Article', name, { concurrently: true })
    }
  },
}
