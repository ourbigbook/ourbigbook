module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.sequelize.query(`
UPDATE "File"
SET "path" = SUBSTR("path", 1, LENGTH("path") - 5) || '/index.bigb'
WHERE "path" NOT LIKE '%/%'
`)
    //const Op = Sequelize.Op
    //await queryInterface.sequelize.models.File.update(
    //  { path: sequelize.where(sequelize.literal('SUBSTR("path", 1, LENGTH("path") - 5)'), '||', '.bigb'), },
    //  { where: { path: { [Op.Not]: { [Op.like]: '%/%' } } } },
    //)
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    try {
    } catch (err) { console.error(err); throw err }
  }),
};
