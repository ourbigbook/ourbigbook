#!/usr/bin/env node
const ourbigbook = require('ourbigbook');
(async () => {
console.log(await ourbigbook.convert('ab\ncd\n', {'body_only': true}));
})()
