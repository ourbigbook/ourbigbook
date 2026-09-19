const { Op } = require('sequelize')

const indexes = [
  {
    name: 'topic_article_count_created_at',
    fields: [
      { name: 'articleCount', order: 'DESC' },
      { name: 'createdAt', order: 'DESC' },
    ],
  },
  {
    name: 'topic_created_at',
    fields: [{ name: 'createdAt', order: 'DESC' }],
  },
  {
    name: 'topic_created_at_nonempty',
    fields: [{ name: 'createdAt', order: 'DESC' }],
    where: { articleCount: { [Op.gt]: 0 } },
  },
  {
    name: 'topic_topic_id_asc_created_at',
    fields: [
      { name: 'topicId', order: 'ASC' },
      { name: 'createdAt', order: 'DESC' },
    ],
  },
  {
    name: 'topic_topic_id_asc_created_at_nonempty',
    fields: [
      { name: 'topicId', order: 'ASC' },
      { name: 'createdAt', order: 'DESC' },
    ],
    where: { articleCount: { [Op.gt]: 0 } },
  },
  {
    name: 'topic_article_count_topic_id_created_at',
    fields: [
      'articleCount',
      { name: 'topicId', order: 'ASC' },
      { name: 'createdAt', order: 'DESC' },
    ],
  },
]

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => {
    for (const { fields, ...options } of indexes) {
      await queryInterface.addIndex('Topic', fields, { ...options, concurrently: true })
    }
  },
  down: async queryInterface => {
    for (const { name } of [...indexes].reverse()) {
      await queryInterface.removeIndex('Topic', name, { concurrently: true })
    }
  },
}
