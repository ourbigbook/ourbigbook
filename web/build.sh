#!/usr/bin/env bash
set -e
export NODE_OPTIONS='--unhandled-rejections=strict'
cd ../
rm -rf my_node_modules
mkdir -p my_node_modules
ln -s .. my_node_modules/cirodown
NODE_PATH="${NODE_PATH}:my_node_modules" npm run build-assets
rm -rf my_node_modules
cd -
./bin/sync-db.js
npm run build-nodeps
