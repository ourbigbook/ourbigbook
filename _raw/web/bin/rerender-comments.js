#!/usr/bin/env node

const path = require('path')

const commander = require('commander');

const models = require('../models')
const back_js = require('../back/js')

const program = commander.program
program.description('Re-render comments https://docs.ourbigbook.com/_file/web/bin/rerender-comments.js')
program.option('-i, --ignore-errors', 'ignore errors', false);
program.parse(process.argv);
const opts = program.opts()
const sequelize = models.getSequelize(path.dirname(__dirname));
(async () => {
await sequelize.models.Comment.rerender({
  log: true,
  convertOptionsExtra: { katex_macros: back_js.preloadKatex() },
  ignoreErrors: opts.ignoreErrors
})
})().finally(() => { return sequelize.close() });
