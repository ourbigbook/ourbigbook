const articleFtsCol = 'topicId'
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    for (const t of ['Article', 'Topic']) {
      await queryInterface.sequelize.query(`ALTER TABLE "${t}"
  ADD COLUMN "${articleFtsCol}_tsvector" TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('simple', replace("${articleFtsCol}", '-', ' '))) STORED`, { transaction })
      await queryInterface.sequelize.query(`CREATE INDEX "${t}_${articleFtsCol}_gin_idx"
  ON "${t}" USING GIN ("${articleFtsCol}_tsvector")`, { transaction })
    }
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    for (const t of ['Article', 'Topic']) {
      await queryInterface.removeColumn(t, `${articleFtsCol}_tsvector`, { transaction })
    }
  }),
};
