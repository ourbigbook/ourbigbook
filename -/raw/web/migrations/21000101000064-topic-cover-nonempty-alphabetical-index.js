const { Op } = require('sequelize')
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

const oldName = 'topic_topic_id_asc_created_at_nonempty'
const name = 'topic_topic_id_asc_created_at_id_nonempty'
const fields = [
  { name: 'topicId', order: 'ASC' },
  { name: 'createdAt', order: 'DESC' },
]
const options = { where: { articleCount: { [Op.gt]: 0 } }, concurrently: true }

module.exports = {
  // Build the replacement before removing the old index, without blocking
  // production writes. Concurrent index operations must not be in a transaction.
  up: async queryInterface => {
    await addIndexIfMissing(queryInterface, 'Topic', [...fields, 'id'], { ...options, name })
    await removeIndexIfExists(queryInterface, 'Topic', oldName, { concurrently: true })
  },
  down: async queryInterface => {
    await addIndexIfMissing(queryInterface, 'Topic', fields, { ...options, name: oldName })
    await removeIndexIfExists(queryInterface, 'Topic', name, { concurrently: true })
  },
}
