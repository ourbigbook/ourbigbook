#!/usr/bin/env node
const path = require('path')
const models = require('../models')
const sequelize = models.getSequelize(path.dirname(__dirname));
(async () => {
await sequelize.models.Article.rerender({ log: true })
})().finally(() => { return sequelize.close() });
