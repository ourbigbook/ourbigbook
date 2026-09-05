const columns = ['pendingEmail', 'emailChangeCode']

module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    for (const column of columns) {
      await queryInterface.addColumn('User', column, {
        type: Sequelize.DataTypes.STRING(column === 'emailChangeCode' ? 1024 : 255),
        allowNull: true,
      }, { transaction })
    }
  }),
  down: async (queryInterface) => {
    const sequelize = queryInterface.sequelize
    const sqlite = sequelize.options.dialect === 'sqlite'
    if (sqlite) await sequelize.query('PRAGMA foreign_keys = OFF')
    try {
      await sequelize.transaction(async transaction => {
        const [schema] = sqlite ? await sequelize.query(
          `SELECT sql FROM sqlite_master WHERE tbl_name = 'User' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
          { transaction },
        ) : [[]]
        for (const column of columns) {
          await queryInterface.removeColumn('User', column, { transaction })
        }
        for (const { sql } of schema) await sequelize.query(sql, { transaction })
      })
    } finally {
      if (sqlite) await sequelize.query('PRAGMA foreign_keys = ON')
    }
  },
}
