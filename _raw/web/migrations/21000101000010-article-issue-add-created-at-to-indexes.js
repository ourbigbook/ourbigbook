module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeIndex('UserLikeArticle', ['userId'], { transaction })
    await queryInterface.addIndex('UserLikeArticle', ['userId', 'createdAt'], { transaction })
    await queryInterface.removeIndex('UserLikeArticle', ['articleId'], { transaction })
    await queryInterface.addIndex('UserLikeArticle', ['articleId', 'createdAt'], { transaction })

    await queryInterface.removeIndex('UserLikeIssue', ['userId'], { transaction })
    await queryInterface.addIndex('UserLikeIssue', ['userId', 'createdAt'], { transaction })
    await queryInterface.removeIndex('UserLikeIssue', ['issueId'], { transaction })
    await queryInterface.addIndex('UserLikeIssue', ['issueId', 'createdAt'], { transaction })
    await queryInterface.addIndex('UserLikeIssue', ['userId', 'issueId'], { unique: true, transaction })

    await queryInterface.removeIndex('UserFollowArticle', ['userId'], { transaction })
    await queryInterface.addIndex('UserFollowArticle', ['userId', 'createdAt'], { transaction })
    await queryInterface.removeIndex('UserFollowArticle', ['articleId'], { transaction })
    await queryInterface.addIndex('UserFollowArticle', ['articleId', 'createdAt'], { transaction })

    await queryInterface.removeIndex('UserFollowIssue', ['userId'], { transaction })
    await queryInterface.addIndex('UserFollowIssue', ['userId', 'createdAt'], { transaction })
    await queryInterface.removeIndex('UserFollowIssue', ['issueId'], { transaction })
    await queryInterface.addIndex('UserFollowIssue', ['issueId', 'createdAt'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeIndex('UserLikeArticle', ['userId', 'createdAt'], { transaction })
    await queryInterface.addIndex('UserLikeArticle', ['userId'], { transaction })
    await queryInterface.removeIndex('UserLikeIssue', ['userId', 'createdAt'], { transaction })
    await queryInterface.addIndex('UserLikeIssue', ['userId'], { transaction })
    await queryInterface.removeIndex('UserFollowArticle', ['userId', 'createdAt'], { transaction })
    await queryInterface.addIndex('UserFollowArticle', ['userId'], { transaction })
    await queryInterface.removeIndex('UserFollowIssue', ['userId', 'createdAt'], { transaction })
    await queryInterface.addIndex('UserFollowIssue', ['userId'], { transaction })
  }),
};
