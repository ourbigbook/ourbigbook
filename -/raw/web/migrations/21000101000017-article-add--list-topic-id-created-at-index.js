const idx = ['list', { name: 'topicId', operator: 'text_pattern_ops' }, 'createdAt']

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.addIndex('Article', idx, { transaction })
    // Can't find out how to alter this in the index, so just drop and recreate.
    await queryInterface.removeIndex('Article', ['list', 'topicId', 'score', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['list', { name: 'topicId', operator: 'text_pattern_ops' }, 'score', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'topicId'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', { name: 'topicId', operator: 'text_pattern_ops' }], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeIndex('Article', idx, { transaction })
    await queryInterface.removeIndex('Article', ['list', 'topicId', 'score', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'text_pattern_ops', 'score', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'topicId'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'topicId'], { transaction })
  }),
};
