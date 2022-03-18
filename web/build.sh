#!/usr/bin/env bash
set -ex
export NODE_OPTIONS='--unhandled-rejections=strict'
cd ../
rm -rf my_node_modules
mkdir -p my_node_modules
ln -s .. my_node_modules/cirodown
# This command needs to require cirodown.
# If we ever need this more generally outside of ./web/, we have once tested
# removing this rm -rf and doing:
# heroku config:set --app ourbigbook-staging NODE_PATH=/app/my_node_modules:/app/web/node_modules
# and it seemed to work.
NODE_PATH="${NODE_PATH}:$(pwd)/my_node_modules" npm run build-assets
rm -rf my_node_modules
cd web
./bin/sync-db.js
npm run build-nodeps
