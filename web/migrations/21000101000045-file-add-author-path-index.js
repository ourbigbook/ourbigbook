const name = 'file_author_id_path'

module.exports = {
  // PostgreSQL concurrent index creation must run outside a transaction.
  up: async queryInterface => queryInterface.addIndex('File', [
    'authorId',
    { name: 'path', order: 'ASC' },
  ], { name, concurrently: true }),
  down: async queryInterface => queryInterface.removeIndex('File', name, { concurrently: true }),
}
