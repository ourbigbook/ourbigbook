const e = require('cors');
const config = require('../front/config')

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Topic', 'topicId',
      {
        type: DataTypes.TEXT,
      },
      { transaction },
    )
    // TODO not sure how this happened on ourbigbook.com. There was only one instance with "Topic".id = 112409.
    // It doesn't seem to be linked to anything else, so it is impossible to tell where it came from,
    // and therefore it should also not have any negative effects. But there is, or was, a bug somewhere.
    await queryInterface.sequelize.query(`DELETE FROM "Topic" WHERE "articleId" IS NULL`, { transaction })
    await queryInterface.sequelize.query(`
UPDATE "Topic"
SET "topicId" = "Article"."topicId"
FROM "Article"
WHERE "Topic"."articleId" = "Article"."id"
`,
    { transaction }
  )
    await queryInterface.changeColumn('Topic', 'topicId',
      {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      { transaction },
    )
    await queryInterface.addIndex('Topic', ['topicId'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'topicId'], { transaction })
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Topic', 'topicId', { transaction })
    await queryInterface.removeIndex('Article', ['authorId', 'topicId'], { transaction })
  }),
};
