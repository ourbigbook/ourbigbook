const js_beautify = require('js-beautify')

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

function assert_xpath(xpath_expr, html, options={}) {
  const xpath_matches = xpath_html(html, xpath_expr);
  if (!('count' in options)) {
    options.count = 1;
  }
  if (!('stdout' in options)) {
    options.stdout = true;
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
    console.error(`assert_xpath${options.stdout ? '_stdout' : ''}${count_str}: ` + options.message);
    console.error('xpath: ' + xpath_expr);
    console.error('html:');
    console.error(js_beautify.html(html));
    assert.strictEqual(xpath_matches.length, options.count);
  }
}

// xpath to match the parent div of a given header.
function xpath_header(n, id, insideH, opts={}) {
  if (insideH) {
    insideH = '//' + insideH
  } else {
    insideH = ''
  }
  const { hasToc } = opts
  // The horror:
  // https://stackoverflow.com/questions/1604471/how-can-i-find-an-element-by-css-class-with-xpath
  let ret = `//x:div[(@class='h' or contains(@class, 'h '))`
  if (id) {
    ret += ` and @id='${id}'`
  }
  if (n <= 6) {
    ret += ` and .//x:h${n}${insideH}`
  } else {
    ret += ` and .//x:h6[@data-level="${n}"]`
  }
  if (hasToc !== undefined) {
    if (hasToc) {
      ret += ` and @data-has-toc="1"`
    } else {
      ret += ` and not(@data-has-toc)`
    }
  }
  ret += ']'
  return ret
}

// xpath to match the split/nosplit link inside of a header.
function xpath_header_split(n, id, href, marker) {
  let href_xpath
  if (href === undefined) {
    href_xpath = ''
  } else {
    href_xpath = `@href='${href}' and `
  }
  return `${xpath_header(n, id)}//x:a[${href_xpath}@class='${marker}']`;
}

// xpath to match the parent link inside of a header.
function xpath_header_parent(n, id, href, title) {
  return `${xpath_header(n, id)}${n === 1 ? `//x:div[@class='nav ancestors']` : ''}//x:a[@href='${href}' and text()=' ${title}']`;
}

module.exports = {
  assert_xpath,
  xpath_header,
  xpath_header_split,
  xpath_header_parent,
}
