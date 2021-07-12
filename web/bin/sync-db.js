#!/usr/bin/env node

// Initialize the database.
// Originally added for next build since we don't know how to run hooks.
// before next build, and the database wouldn't exist otherwise.

(async () => {
const path = require('path')
const models = require('../models')
const sequelize = models(path.dirname(__dirname));
await sequelize.sync()
})()

