#!/usr/bin/env node
const cirodown = require('cirodown');
(async () => {
console.log(await cirodown.convert('ab\ncd\n', {'body_only': true}));
})()
