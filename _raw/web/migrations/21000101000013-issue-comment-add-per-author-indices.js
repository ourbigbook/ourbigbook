module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    // New Issue indices
    await queryInterface.addIndex('Issue', ['createdAt'], { transaction })
    await queryInterface.addIndex('Issue', ['updatedAt'], { transaction })
    await queryInterface.addIndex('Issue', ['authorId', 'createdAt'], )
    await queryInterface.addIndex('Issue', ['authorId', 'updatedAt'], )
    await queryInterface.addIndex('Issue', ['authorId', 'score'], )
    await queryInterface.addIndex('Issue', ['authorId', 'followerCount'], )
    await queryInterface.addIndex('Issue', ['authorId', 'commentCount'], )

    // New Comment indices
    await queryInterface.addIndex('Comment', ['createdAt'], { transaction })
    await queryInterface.addIndex('Comment', ['updatedAt'], { transaction })
    await queryInterface.addIndex('Comment', ['authorId', 'createdAt'], { transaction })
    await queryInterface.addIndex('Comment', ['authorId', 'updatedAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    // New Issue indices
    await queryInterface.removeIndex('Issue', ['createdAt'], { transaction })
    await queryInterface.removeIndex('Issue', ['updatedAt'], { transaction })
    await queryInterface.removeIndex('Issue', ['authorId', 'createdAt'], )
    await queryInterface.removeIndex('Issue', ['authorId', 'updatedAt'], )
    await queryInterface.removeIndex('Issue', ['authorId', 'score'], )
    await queryInterface.removeIndex('Issue', ['authorId', 'followerCount'], )
    await queryInterface.removeIndex('Issue', ['authorId', 'commentCount'], )

    // New Comment indices
    await queryInterface.removeIndex('Comment', ['createdAt'], { transaction })
    await queryInterface.removeIndex('Comment', ['updatedAt'], { transaction })
    await queryInterface.removeIndex('Comment', ['authorId', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Comment', ['authorId', 'updatedAt'], { transaction })
  }),
};
