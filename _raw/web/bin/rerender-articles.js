#!/usr/bin/env node

const path = require('path')

const commander = require('commander')

const models = require('../models')
const back_js = require('../back/js')
const { cliInt } = require('ourbigbook/nodejs')

const program = commander.program
program.description('Re-render articles https://docs.ourbigbook.com/_file/web/bin/rerender-articles.js')
program.option('-a, --author <username>', 'only convert articles by this author', (v, p) => p.concat([v]), [])
program.option('--automatic-topic-links-max-words <val>', 'maximum number of words to put on automatic topic links', cliInt)
program.option('-A, --skip-author <username>', "don't convert articles by this author", (v, p) => p.concat([v]), [])
program.option('-d, --descendants', 'rerender all descendants of input slugs in addition to the articles themselves. Has no effect if no slugs are given as input (everything gets converted regardless in that case).')
program.option('-i, --ignore-errors', 'ignore errors', false)
program.argument('[slugs...]', 'list of slugs to convert, e.g. "barack-obama/quantum-mechanics". If not given, convert all articles matching the criteria of other options.')
program.parse(process.argv);
const opts = program.opts()
let [slugs] = program.processedArgs
const sequelize = models.getSequelize(path.dirname(__dirname));
(async () => {
await sequelize.models.Article.rerender({
  log: true,
  convertOptionsExtra: {
    automaticTopicLinksMaxWords: opts.automaticTopicLinksMaxWords,
    katex_macros: back_js.preloadKatex(),
  },
  authors: opts.author,
  descendants: opts.descendants,
  ignoreErrors: opts.ignoreErrors,
  slugs,
  skipAuthors: opts.skipAuthor,
})
})().finally(() => { return sequelize.close() });
