#!/usr/bin/env node
const cirodown = require('cirodown');
console.log(cirodown.convert('ab\ncd\n', {'body_only': true}));
