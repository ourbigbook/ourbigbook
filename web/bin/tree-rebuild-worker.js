#!/usr/bin/env node
const path = require('path')
const id = Number(process.argv[2])
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Usage: tree-rebuild-worker.js JOB_ID')
// Bound runtime even if a connection or query hangs. PostgreSQL rolls back on disconnect.
const deadline = setTimeout(() => process.exit(1), 15 * 60 * 1000)
;(async () => {
  let sequelize
  try {
    let databaseOptions
    if (process.argv[3] === '--local') {
      if (!process.send) throw new Error('Local worker requires an IPC connection from the server')
      databaseOptions = await new Promise(resolve => process.once('message', resolve))
      process.disconnect()
    }
    sequelize = require('../models').getSequelize(path.dirname(__dirname), undefined, databaseOptions)
    console.log(`tree_rebuild: ${id}`)
    await sequelize.models.TreeRebuildJob.run(id)
    console.log(`tree_rebuild: ${id} finished`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    if (sequelize) await sequelize.close()
    clearTimeout(deadline)
  }
})()
