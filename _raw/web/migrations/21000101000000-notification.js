const path = require('path')

const config = require('../front/config')
const models = require('../models')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await Promise.all([
      queryInterface.addColumn('User', 'emailNotifications',
        {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        { transaction },
      ),
      queryInterface.addColumn('User', 'maxIssuesPerMinute',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: config.maxIssuesPerMinute,
        },
        { transaction },
      ),
      queryInterface.addColumn('User', 'maxIssuesPerHour',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: config.maxIssuesPerHour,
        },
        { transaction },
      ),
      queryInterface.addColumn('Article', 'issueCount',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      ),
      queryInterface.addColumn('Article', 'followerCount',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      ),
      queryInterface.addColumn('Issue', 'commentCount',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      ),
      queryInterface.addColumn('Issue', 'followerCount',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      ),
      queryInterface.createTable(
        'UserFollowArticle',
        {
          userId: {
              type: DataTypes.INTEGER,
              references: {
                model: 'User',
                key: 'id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
          },
          articleId: {
              type: DataTypes.INTEGER,
              references: {
                model: 'Article',
                key: 'id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
        },
        {
          transaction,
        },
      ),
      queryInterface.createTable(
        'UserFollowIssue',
        {
          userId: {
              type: DataTypes.INTEGER,
              references: {
                model: 'User',
                key: 'id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
          },
          issueId: {
              type: DataTypes.INTEGER,
              references: {
                model: 'Issue',
                key: 'id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
          },
        },
        {
          transaction,
        }
      ),
    ])
    await Promise.all([
      queryInterface.addIndex('User', ['score'], { transaction }),
      queryInterface.addIndex('User', ['admin'], { transaction }),
      queryInterface.addIndex('User', ['createdAt'], { transaction }),
      queryInterface.addIndex('User', ['followerCount'], { transaction }),
      queryInterface.addIndex('Article', ['followerCount'], { transaction }),
      queryInterface.addIndex('Issue', ['followerCount'], { transaction }),
      queryInterface.addIndex('Issue', ['score'], { transaction }),
      queryInterface.addIndex('Issue', ['commentCount'], { transaction }),
      queryInterface.addConstraint('UserFollowArticle', {
        fields: ['userId', 'articleId'],
        type: 'primary key',
        transaction,
      }),
      queryInterface.addIndex('UserFollowArticle', ['userId', 'articleId'], { unique: true, transaction }),
      queryInterface.addIndex('UserFollowArticle', ['userId'], { transaction }),
      queryInterface.addIndex('UserFollowArticle', ['articleId'], { transaction }),
      queryInterface.addConstraint('UserFollowIssue', {
        fields: ['userId', 'issueId'],
        type: 'primary key',
        transaction,
      }),
      queryInterface.addIndex('UserFollowIssue', ['userId', 'issueId'], { unique: true, transaction }),
      queryInterface.addIndex('UserFollowIssue', ['userId'], { transaction }),
      queryInterface.addIndex('UserFollowIssue', ['issueId'], { transaction }),
    ])
    const sequelize = models.getSequelize(path.dirname(__dirname))
    await models.normalize({
      fix: true,
      sequelize,
      transaction,
      whats: [
        'article-issue-count',
        'article-follower-count',
        'issue-comment-count',
        'issue-follower-count',
        'follow-authored-articles',
        'follow-authored-issues',
      ],
    })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    return Promise.all([
      queryInterface.removeColumn('User', 'emailNotifications', { transaction }),
      queryInterface.removeColumn('User', 'maxIssuesPerMinute', { transaction }),
      queryInterface.removeColumn('User', 'maxIssuesPerHour', { transaction }),
      queryInterface.removeColumn('Article', 'issueCount', { transaction }),
      queryInterface.removeColumn('Article', 'followerCount', { transaction }),
      queryInterface.removeColumn('Issue', 'commentCount', { transaction }),
      queryInterface.removeColumn('Issue', 'followerCount', { transaction }),
      queryInterface.dropTable('UserFollowArticle', { transaction }),
      queryInterface.dropTable('UserFollowIssue', { transaction }),
    ])
  })
};
