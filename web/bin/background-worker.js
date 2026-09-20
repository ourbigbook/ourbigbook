#!/usr/bin/env node
const path = require('path')
const id = Number(process.argv[2])
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Usage: background-worker.js JOB_ID')
// Bound runtime even if a connection or query hangs. PostgreSQL rolls back on disconnect.
const deadline = setTimeout(() => process.exit(1), 15 * 60 * 1000)
;(async () => {
  let sequelize
  try {
    let databaseOptions
    if (process.argv.includes('--local')) {
      if (!process.send) throw new Error('Local worker requires an IPC connection from the server')
      databaseOptions = await new Promise(resolve => process.once('message', resolve))
      process.disconnect()
    }
    sequelize = require('../models').getSequelize(path.dirname(__dirname), undefined, databaseOptions)
    const articles = process.argv.includes('--articles')
    if (!articles) console.log(`tree_rebuild: ${id}`)
    const queueIndex = process.argv.indexOf('--queue')
    if (queueIndex !== -1) {
      const queueId = Number(process.argv[queueIndex + 1])
      if (!Number.isSafeInteger(queueId) || queueId <= 0) throw new Error('Invalid queue ID')
      const tokenIndex = process.argv.indexOf('--worker-token')
      await sequelize.models.BuildQueue.run(queueId, tokenIndex === -1 ? undefined : process.argv[tokenIndex + 1])
    } else {
      await sequelize.models[articles ? 'ArticleJob' : 'TreeRebuildJob'].run(id)
    }
    if (!articles) console.log(`tree_rebuild: ${id} finished`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    if (sequelize) await sequelize.close()
    clearTimeout(deadline)
  }
})()
