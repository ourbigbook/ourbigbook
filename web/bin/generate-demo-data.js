#!/usr/bin/env node

const assert = require('assert')
const path = require('path')

const config = require('../front/config')

function myParseInt(value, dummyPrevious) {
  const parsedValue = parseInt(value);
  if (isNaN(parsedValue)) {
    throw new commander.InvalidOptionArgumentError('Not a number.');
  }
  return parsedValue;
}

const commander = require('commander');
commander.option('-a, --articles-per-user <n>', 'n articles per user', myParseInt);
commander.option('-c, --max-comments-per-article <n>', 'maximum number of comments per article', myParseInt);
commander.option('-f, --follows-per-user <n>', 'n follows per user', myParseInt);
commander.option('-l, --likes-per-user <n>', 'n likes per user', myParseInt);
commander.option('--force-production', 'allow running in production, DELETES ALL DATA', false);
commander.option('--empty', 'ignore everything else and make an empty database instead', false);
commander.option('-u, --users <n>', 'n users', myParseInt);
commander.parse(process.argv);

if (!commander.forceProduction) {
  assert(!config.isProduction)
}
(async () => {
const test_lib = require('../test_lib')
const sequelize = await test_lib.generateDemoData({
  directory: path.dirname(__dirname),
  empty: commander.empty,
  nArticlesPerUser: commander.articlesPerUser,
  nMaxCommentsPerArticle: commander.maxCommentsPerArticle,
  nLikesPerUser: commander.likesPerUser,
  nFollowsPerUser: commander.followsPerUser,
  nUsers: commander.users,
})
await sequelize.close()
})()
