#!/usr/bin/env node

// Sync the database. If the database exists, migrate.
// Otherwise, just create directly from the latest DB settings to speed things up.
//
// Originally added for next build since we don't know how to run hooks.
// before next build, and the database wouldn't exist otherwise.

const path = require('path')
const child_process = require('child_process');
const { DatabaseError } = require('sequelize')
const models = require('../models')
const sequelize = models.getSequelize(path.dirname(__dirname))
;(async () => {
let dbEmpty = true;
try {
  await sequelize.models.SequelizeMeta.findOne()
  dbEmpty = false
} catch(e) {
  if (e instanceof DatabaseError) {
    await models.sync(sequelize)
  }
}
if (!dbEmpty) {
  out = child_process.spawnSync('npx', ['--no-install', 'sequelize-cli', 'db:migrate'])
  console.error(out.stdout.toString());
  console.error(out.stderr.toString());
  process.exit(out.status)
}
})().finally(() => { return sequelize.close() })
