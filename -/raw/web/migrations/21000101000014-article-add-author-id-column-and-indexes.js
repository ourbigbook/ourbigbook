const e = require('cors');
const config = require('../front/config')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Article', 'authorId',
      {
        type: DataTypes.INTEGER,
      },
      { transaction },
    )
    await queryInterface.sequelize.query(`
UPDATE "Article"
SET "authorId" = "File"."authorId"
FROM "File"
WHERE "Article"."fileId" = "File"."id"
`,
    { transaction }
  )
    await queryInterface.changeColumn('Article', 'authorId',
      {
        type: DataTypes.INTEGER,
        allowNull: false,
        //// onUpdate doesn't work, otherwise this would be fine.
        //references: {
        //  model: 'User',
        //  key: 'id',
        //  onUpdate: 'CASCADE',
        //},
      },
      { transaction },
    )
    queryInterface.addConstraint('Article', {
      fields: ['authorId'],
      type: 'foreign key',
      name: 'Article_authorId_fkey',
      references: {
        table: 'User',
        field: 'id'
      },
      onUpdate: 'cascade',
    })

    // Add createdAt to pre-existing indices to make ordering deterministic.
    await queryInterface.removeIndex('Article', ['updatedAt'], { transaction })
    await queryInterface.addIndex('Article', ['updatedAt', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['list', 'updatedAt'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'updatedAt', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['issueCount'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'issueCount', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['followerCount'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'followerCount', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['score'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'score', 'createdAt'], { transaction })

    // authorId indices.
    await queryInterface.addIndex('Article', ['authorId', 'list', 'nestedSetIndex'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'updatedAt', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'score', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'followerCount', 'createdAt'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'issueCount', 'createdAt'], { transaction })
    // Useless without authorId.
    await queryInterface.removeIndex('Article', ['nestedSetIndex'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'nestedSetIndex'], { transaction })
    await queryInterface.removeIndex('Article', ['nestedSetIndex', 'nestedSetNextSibling'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'nestedSetIndex', 'nestedSetNextSibling'], { transaction })

    await queryInterface.removeIndex('Article', ['topicId'], { transaction })
    await queryInterface.addIndex('Article', ['list', 'topicId', 'score', 'createdAt'], { transaction })
    await queryInterface.addIndex('Topic', ['articleId'], { transaction })
    await queryInterface.changeColumn('User', 'username',
      {
        type: DataTypes.STRING(config.usernameMaxLength),
        allowNull: false,
      },
      { transaction },
    )
    await queryInterface.changeColumn('User', 'email',
      {
        type: DataTypes.STRING,
        allowNull: false,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Article', 'authorId', { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'nestedSetIndex'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'createdAt'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'updatedAt'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'score'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'followerCount'], { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'list', 'issueCount'], { transaction })
    await queryInterface.removeIndex('Article', ['topicId', 'score'], { transaction })
    await queryInterface.addIndex('Article', ['topicId'], { transaction })
    await queryInterface.removeIndex('Topic', ['articleId'], { transaction })
    await queryInterface.changeColumn('User', 'username',
      {
        type: DataTypes.STRING(config.usernameMaxLength),
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.changeColumn('User', 'email',
      {
        type: DataTypes.STRING,
        allowNull: true,
      },
      { transaction },
    )
  }),
};
