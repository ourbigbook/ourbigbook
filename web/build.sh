#!/usr/bin/env bash
set -ex
export NODE_OPTIONS='--unhandled-rejections=strict'
cd ../
rm -rf my_node_modules
mkdir -p my_node_modules
ln -s .. my_node_modules/cirodown
export NODE_PATH="${NODE_PATH}:$(pwd)/my_node_modules"
npm run build-assets
cd web
./bin/sync-db.js
npm run build-nodeps
rm -rf ../my_node_modules
