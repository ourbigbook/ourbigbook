#!/usr/bin/env bash
set -eux
env $(cat .env | xargs) NODE_ENV=production "$@"
