const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

const oldName = 'topic_topic_id_asc_created_at'
const name = 'topic_topic_id_asc_created_at_id'
const fields = [
  { name: 'topicId', order: 'ASC' },
  { name: 'createdAt', order: 'DESC' },
]

module.exports = {
  // Replace the non-covering index only after its replacement is ready.
  // PostgreSQL concurrent index operations must run outside a transaction.
  up: async queryInterface => {
    await addIndexIfMissing(queryInterface, 'Topic', [...fields, 'id'], { name, concurrently: true })
    await removeIndexIfExists(queryInterface, 'Topic', oldName, { concurrently: true })
  },
  down: async queryInterface => {
    await addIndexIfMissing(queryInterface, 'Topic', fields, { name: oldName, concurrently: true })
    await removeIndexIfExists(queryInterface, 'Topic', name, { concurrently: true })
  },
}
