#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Hax: https://github.com/ourbigbook/ourbigbook/issues/156
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
    'sqlite3',
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
  const devDependencies = packageJson.devDependencies
  deleteProps(devDependencies, [
    'mocha',
    'nodemon',
    'sqlite3',
  ])
  writeJson(inpath, packageJson)
}
