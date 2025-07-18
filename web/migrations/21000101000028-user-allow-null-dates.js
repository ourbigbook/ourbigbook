module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.changeColumn('Article', 'createdAt',
      { type: DataTypes.DATE, allowNull: true },
      { transaction },
    )
    await queryInterface.changeColumn('Article', 'updatedAt',
      { type: DataTypes.DATE, allowNull: true },
      { transaction },
    )
    await queryInterface.sequelize.query(`
UPDATE "Article"
SET "createdAt" = NULL
WHERE "createdAt" = '1970-01-01 01:00:00+01'
`,
      { transaction }
    )
    await queryInterface.sequelize.query(`
UPDATE "Article"
SET "updatedAt" = NULL
WHERE "updatedAt" = '1970-01-01 01:00:00+01'
`,
      { transaction }
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.sequelize.query(`
UPDATE "Article"
SET "createdAt" = '1970-01-01 01:00:00+01'
WHERE "createdAt" IS NULL
`,
      { transaction }
    )
    await queryInterface.sequelize.query(`
UPDATE "Article"
SET "updatedAt" = '1970-01-01 01:00:00+01'
WHERE "updatedAt" IS NULL
`,
      { transaction }
    )
    await queryInterface.changeColumn('Article', 'createdAt',
      { type: DataTypes.DATE, allowNull: false },
      { transaction },
    )
    await queryInterface.changeColumn('Article', 'updatedAt',
      { type: DataTypes.DATE, allowNull: false },
      { transaction },
    )
  }),
};
