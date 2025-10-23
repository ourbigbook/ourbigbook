module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Article', 'titleRenderPlaintext',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.sequelize.query(
      `UPDATE "Article" SET "titleRenderPlaintext" = "File"."titleSource" FROM "File" WHERE "File"."id" = "Article"."fileId";`,
      { transaction }
    )
    await queryInterface.changeColumn('Article', 'titleRenderPlaintext',
      {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      { transaction },
    )

    // Issue
    await queryInterface.addColumn('Issue', 'titleRenderPlaintext',
      {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.bulkUpdate('Issue',
      { titleRenderPlaintext: queryInterface.sequelize.col('titleSource') },
      {},
      { transaction },
    )
    await queryInterface.changeColumn('Issue', 'titleRenderPlaintext',
      {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Article', 'titleRenderPlaintext', { transaction })
    await queryInterface.removeColumn('Issue', 'titleRenderPlaintext', { transaction })
  }),
};
