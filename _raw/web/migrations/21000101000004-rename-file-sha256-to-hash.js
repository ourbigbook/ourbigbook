// Would have been more acurate if we had created entries for filetype HTML. But lazy,
// and shouldn't break things, only lose some caching.
module.exports = {
  up: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.renameColumn('File', 'sha256', 'hash', { transaction });
  }),
  down: async (queryInterface, Sequelize) => queryInterface.sequelize.transaction(async transaction => {
    await queryInterface.renameColumn('File', 'hash', 'sha256', { transaction });
  }),
};
