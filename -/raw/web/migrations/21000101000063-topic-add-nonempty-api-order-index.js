const { Op } = require('sequelize')
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')
const name = 'topic_topic_id_created_at_id_nonempty'

module.exports = {
  up: async queryInterface => addIndexIfMissing(queryInterface, 'Topic', [
    { name: 'topicId', order: 'DESC' },
    { name: 'createdAt', order: 'DESC' },
    'id',
  ], { name, where: { articleCount: { [Op.gt]: 0 } }, concurrently: true }),
  down: async queryInterface => removeIndexIfExists(queryInterface, 'Topic', name, { concurrently: true }),
}
