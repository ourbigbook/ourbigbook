module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    const DataTypes = Sequelize.DataTypes
    await queryInterface.addColumn('Article', 'announcedAt',
      {
        type: DataTypes.DATE,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.addIndex('Article', ['list', 'announcedAt'], { transaction })
    await queryInterface.addIndex('Article', ['authorId', 'list', 'announcedAt'], { transaction })
    await queryInterface.addColumn('User', 'nextAnnounceAllowedAt',
      {
        type: DataTypes.DATE,
        allowNull: true,
      },
      { transaction },
    )
    await queryInterface.addColumn('User', 'emailNotificationsForArticleAnnouncement',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      { transaction },
    )
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.removeColumn('Article', 'announcedAt', { transaction })
    await queryInterface.removeColumn('User', 'nextAnnounceAllowedAt', { transaction })
    await queryInterface.removeColumn('User', 'emailNotificationsForArticleAnnouncement', { transaction })
  }),
};
