async function indexExists(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName)
  return indexes.some(index => index.name === indexName)
}

async function addIndexIfMissing(queryInterface, tableName, fields, options) {
  if (!await indexExists(queryInterface, tableName, options.name)) {
    await queryInterface.addIndex(tableName, fields, options)
  }
}

async function removeIndexIfExists(queryInterface, tableName, indexName, options) {
  if (await indexExists(queryInterface, tableName, indexName)) {
    await queryInterface.removeIndex(tableName, indexName, options)
  }
}

module.exports = {
  addIndexIfMissing,
  removeIndexIfExists,
}
