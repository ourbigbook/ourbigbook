#!/usr/bin/env node

const path = require('path')

const commander = require('commander')

const models = require('../models')
const back_js = require('../back/js')
const { cliInt } = require('ourbigbook/nodejs_webpack_safe')

const program = commander.program
program.description('Re-render articles or re-extract their IDs/references https://docs.ourbigbook.com/-/file/web/bin/rerender-articles.js')
program.option('-a, --author <username>', 'only convert articles by this author', (v, p) => p.concat([v]), [])
program.option('--automatic-topic-links-max-words <val>', 'maximum number of words to put on automatic topic links', cliInt)
program.option('-A, --skip-author <username>', "don't convert articles by this author", (v, p) => p.concat([v]), [])
program.option('-d, --descendants', 'rerender all descendants of input slugs in addition to the articles themselves. Has no effect if no slugs are given as input (everything gets converted regardless in that case).')
program.option('-i, --ignore-errors', 'ignore errors', false)
program.option('--extract-ids', 'only re-extract and validate IDs/references; preserve HTML, source hashes, dates and tree order')
program.option('--media', 'only sources containing \\Image, \\image or \\Video')
program.option('--source-pattern <regex>', 'only sources matching this JavaScript regular expression (title and body)')
program.option('--batch-size <count>', 'maximum articles loaded at once', cliInt, 100)
program.option('--dry-run', 'print matching slugs without changing the database')
program.option('-s, --start-from <start-from>', 'start from this article and continue alphabetically to the end', false)
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
  batchSize: opts.batchSize,
  descendants: opts.descendants,
  dryRun: opts.dryRun,
  extractIds: opts.extractIds,
  ignoreErrors: opts.ignoreErrors,
  media: opts.media,
  slugs,
  skipAuthors: opts.skipAuthor,
  startFrom: opts.startFrom,
  sourcePattern: opts.sourcePattern,
})
})().finally(() => { return sequelize.close() });
