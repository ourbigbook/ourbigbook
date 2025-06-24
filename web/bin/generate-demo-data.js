#!/usr/bin/env node
// https://ourbigbook/ourbigbook/demo-data

const assert = require('assert')
const path = require('path')

const commander = require('commander');

const { cliInt } = require('ourbigbook/nodejs_webpack_safe')

const config = require('../front/config')

const program = commander.program
program.allowExcessArguments(false)
program.option('-a, --articles-per-user <n>', 'n articles per user', cliInt);
program.option('-i, --max-issues-per-article <n>', 'maximum number of issues per article', cliInt);
program.option('-c, --max-comments-per-article <n>', 'maximum number of comments per issues', cliInt);
program.option('-f, --follows-per-user <n>', 'n follows per user', cliInt);
program.option('--only-generate-filesystem', 'only generate the local test filesystem, don\'t add it to the web database', false)
program.option('-l, --likes-per-user <n>', 'n likes per user', cliInt);
program.option('--force-production', 'allow running in production, DELETES ALL DATA', false);
program.option('-C, --clear', 'clear the database and create demo data from scratch instead of just updating existing entries', false);
program.option('--empty', 'ignore everything else and make an empty database instead. Implies --reset', false);
program.option('-u, --users <n>', 'n users', cliInt);
program.parse(process.argv);
const opts = program.opts()

if (!opts.forceProduction) {
  assert(!config.isProduction)
}
(async () => {
const test_lib = require('../test_lib')
const sequelize = await test_lib.generateDemoData({
  clear: opts.clear,
  directory: path.dirname(__dirname),
  empty: opts.empty,
  nArticlesPerUser: opts.articlesPerUser,
  nMaxCommentsPerIssue: opts.nMaxCommentsPerIssue,
  nMaxIssuesPerArticle: opts.maxIssuesPerArticle,
  nLikesPerUser: opts.likesPerUser,
  nFollowsPerUser: opts.followsPerUser,
  onlyGenerateFilesystem: opts.onlyGenerateFilesystem,
  nUsers: opts.users,
  verbose: true,
})
await sequelize.close()
})()
