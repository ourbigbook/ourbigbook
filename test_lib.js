// https://stackoverflow.com/questions/25753368/performant-parsing-of-html-pages-with-node-js-and-xpath/25971812#25971812
// Not using because too broken.
// https://github.com/hieuvp/xpath-html/issues/10
//const xpath = require("xpath-html");
const parse5 = require('parse5');
const xmlserializer = require('xmlserializer');
const xmldom = require('xmldom').DOMParser;
const xpath = require('xpath');

const assert = require('assert');

function xpath_html(html, xpathStr) {
  const document = parse5.parse(html);
  const xhtml = xmlserializer.serializeToString(document);
  const doc = new xmldom().parseFromString(xhtml);
  const select = xpath.useNamespaces({"x": "http://www.w3.org/1999/xhtml"});
  return select(xpathStr, doc);
}

function assert_xpath_main(xpath_expr, string, options={}) {
  const xpath_matches = xpath_html(string, xpath_expr);
  if (!('count' in options)) {
    options.count = 1;
  }
  if (!('main' in options)) {
    options.main = true;
  }
  if (!('message' in options)) {
    options.message = '';
  }
  if (xpath_matches.length !== options.count) {
    let count_str
    if (options.count === 1) {
      count_str = ''
    } else {
      count_str = ` count=${options.count}`
    }
    console.error(`assert_xpath${options.main ? '_main' : ''}${count_str}: ` + options.message);
    console.error('xpath: ' + xpath_expr);
    console.error('string:');
    console.error(string);
    assert.strictEqual(xpath_matches.length, options.count);
  }
}

module.exports = {
  assert_xpath_main,
}
