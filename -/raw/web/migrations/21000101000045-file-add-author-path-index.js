const name = 'file_author_id_path'
const { addIndexIfMissing, removeIndexIfExists } = require('../migration_helpers')

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => addIndexIfMissing(queryInterface, 'File', [
    'authorId',
    { name: 'path', order: 'ASC' },
  ], { name, concurrently: true }),
  down: async queryInterface => removeIndexIfExists(queryInterface, 'File', name, { concurrently: true }),
}
