#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Hax: https://github.com/cirosantilli/cirodown/issues/156
function deleteProps(obj, props) {
  for (const prop of props) {
    if (!(prop in obj)) {
      throw `prop not in obj: ${prop}`
    }
    delete obj[prop]
  }
}

function writeJson(outpath, jsonObj) {
  fs.writeFileSync(outpath, JSON.stringify(jsonObj, null, '  ') + '\n')
}

{
  const packageJson = JSON.parse(fs.readFileSync('package.json').toString())
  const dependencies = packageJson.dependencies
  deleteProps(dependencies, [
    'better-sqlite3',
    'chokidar',
    'commander',
    'fs-extra',
    'git-url-parse',
    'is-installed-globally',
  ])
  const devDependencies = packageJson.devDependencies
  deleteProps(devDependencies, [
    'mocha',
    'mocha-list-tests',
    'parse5',
    'webpack-dev-server',
    'xmldom',
    'xmlserializer',
    'xpath',
  ])
  writeJson('package.json', packageJson)
}

{
  const inpath = path.join('web', 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(inpath).toString())
  deleteProps(packageJson.scripts, [
    'postinstall',
  ])
  const devDependencies = packageJson.devDependencies
  deleteProps(devDependencies, [
    'mocha',
    'newman',
    'nodemon',
    'sqlite3',
  ])
  writeJson(inpath, packageJson)
}