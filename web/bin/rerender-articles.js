#!/usr/bin/env node

const path = require('path')

const commander = require('commander');

const models = require('../models')
const back_js = require('../back/js')

const program = commander.program
program.description('Re-render articles https://docs.ourbigbook.com/_file/web/bin/rerender-articles.js')
program.option('-i, --ignore-errors', 'ignore errors', false);
program.parse(process.argv);
const opts = program.opts()
const slugs = program.args
const sequelize = models.getSequelize(path.dirname(__dirname));
(async () => {
await sequelize.models.Article.rerender({
  log: true,
  convertOptionsExtra: { katex_macros: back_js.preloadKatex() },
  ignoreErrors: opts.ignoreErrors,
  slugs,
})
})().finally(() => { return sequelize.close() });
