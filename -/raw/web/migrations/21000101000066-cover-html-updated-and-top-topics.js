const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

const articleIndexes = [
  ['article_list_updated_at_created_at_id', ['list']],
  ['article_author_list_updated_at_created_at_id', ['authorId', 'list']],
]
const topicFields = [
  { name: 'articleCount', order: 'DESC' },
  { name: 'createdAt', order: 'DESC' },
]
const oldTopic = 'topic_article_count_created_at'
const newTopic = 'topic_article_count_created_at_id'

module.exports = {
  up: async queryInterface => {
    const order = queryInterface.sequelize.options.dialect === 'postgres' ? 'DESC NULLS LAST' : 'DESC'
    for (const [name, prefix] of articleIndexes) {
      await addIndexIfMissing(queryInterface, 'Article', [
        ...prefix, { name: 'updatedAt', order }, { name: 'createdAt', order }, { name: 'id', order: 'DESC' },
      ], { name, concurrently: true })
    }
    await addIndexIfMissing(queryInterface, 'Topic', [...topicFields, 'id'], { name: newTopic, concurrently: true })
    await removeIndexIfExists(queryInterface, 'Topic', oldTopic, { concurrently: true })
  },
  down: async queryInterface => {
    await addIndexIfMissing(queryInterface, 'Topic', topicFields, { name: oldTopic, concurrently: true })
    await removeIndexIfExists(queryInterface, 'Topic', newTopic, { concurrently: true })
    for (const [name] of [...articleIndexes].reverse()) {
      await removeIndexIfExists(queryInterface, 'Article', name, { concurrently: true })
    }
  },
}
