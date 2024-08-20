#!/usr/bin/env node

const path = require('path')

const commander = require('commander');

const models = require('../models')
const back_js = require('../back/js')

const program = commander.program
program.description('Re-render articles https://docs.ourbigbook.com/_file/web/bin/rerender-articles.js')
program.option('-a, --author <username>', 'only convert articles by this author', (v, p) => p.concat([v]), [])
program.option('-A, --skip-author <username>', "don't convert articles by this author", (v, p) => p.concat([v]), [])
program.option('-i, --ignore-errors', 'ignore errors', false);
program.parse(process.argv);
const opts = program.opts()
const slugs = program.args
const sequelize = models.getSequelize(path.dirname(__dirname));
(async () => {
await sequelize.models.Article.rerender({
  log: true,
  convertOptionsExtra: { katex_macros: back_js.preloadKatex() },
  authors: opts.author,
  ignoreErrors: opts.ignoreErrors,
  slugs,
  skipAuthors: opts.skipAuthor,
})
})().finally(() => { return sequelize.close() });
