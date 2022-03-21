#!/usr/bin/env node
(async () => {
const path = require('path')
const models = require('../models')
const sequelize = models.getSequelize(path.dirname(__dirname));
await sequelize.models.Article.rerender({ log: true })
})()
