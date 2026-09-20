const columns = ['workerToken', 'localPid', 'localHost', 'localIdentity', 'recoveries', 'checkpoint']

module.exports = {
  up: async (qi, Sequelize) => qi.sequelize.transaction(async transaction => {
    for (const column of columns) {
      const counter = ['recoveries', 'checkpoint'].includes(column)
      await qi.addColumn('BuildQueue', column, {
        type: column === 'localPid' || counter ? Sequelize.INTEGER : Sequelize.STRING,
        ...(counter ? { allowNull: false, defaultValue: 0 } : {}),
      }, { transaction })
    }
  }),
  down: async qi => qi.sequelize.transaction(async transaction => {
    const [schema] = qi.sequelize.getDialect() === 'sqlite' ? await qi.sequelize.query(
      `SELECT sql FROM sqlite_master WHERE tbl_name = 'BuildQueue' AND type IN ('index', 'trigger') AND sql IS NOT NULL`,
      { transaction },
    ) : [[]]
    for (const column of columns) await qi.removeColumn('BuildQueue', column, { transaction })
    for (const { sql } of schema) await qi.sequelize.query(sql, { transaction })
  }),
}
