const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const cirodown = require('cirodown')
const cirodown_nodejs = require('cirodown/nodejs');
const models = require('cirodown/models');

// Common default convert options for the tests.
const convert_opts = {
  add_test_instrumentation: true,
  body_only: true,
  split_headers: false,

  // Can help when debugging failures.
  log: {
    //'ast-inside': true,
    //parse: true,
    //'split-headers': true,
    //'tokens-inside': true,
    //tokenize': true,
  }
};

class MockFileProvider extends cirodown.FileProvider {
  constructor() {
    super();
    this.path_index = {};
    this.id_index = {};
  }

  get_path_entry(path) {
    return this.path_index[path];
  }

  async get_path_entry_fetch() {
  }

  update(input_path, extra_returns) {
    const context = extra_returns.context;
    const entry = {
      path: input_path,
      toplevel_id: context.toplevel_ast.id,
    };
    this.path_index[input_path] = entry;
    this.id_index[context.toplevel_ast.id] = entry;
  }
}

/** THE ASSERT EVERYTING ENTRYPOINT.
 *
 * This is named after the most common use case, which is asserting a
 * certain subset of the AST.
 *
 * But we extended it to actually test everything possible given the correct options,
 * in order to factor out all the setttings across all asserts. Other asserts are just
 * convenience functions for this function.
 *
 * Asserting the AST is ideal whenever possible as opposed to HTML,
 * since the HTML is more complicated, and chnage more often.
 *
 * This function automatically only considers the content argument of the
 * toplevel node for further convenience.
 */
function assert_convert_ast(
  description,
  input_string,
  expected_ast_output_subset,
  options={}
) {
  it(description, async function () {
    options = Object.assign({}, options);
    if (!('assert_xpath_matches' in options)) {
      // Not ideal, but sometimes there's no other easy way
      // to test rendered stuff. All in list must match.
      options.assert_xpath_matches = [];
    }
    if (!('assert_not_xpath_matches' in options)) {
      options.assert_not_xpath_matches = [];
    }
    if (!('assert_xpath_split_headers' in options)) {
      // Map of output paths for split headers mode. Each output
      // path must match all xpath expresssions in its list.
      //
      // Automatically set split_headers if not explicitly disabled.
      options.assert_xpath_split_headers = {};
    }
    if (!('assert_not_xpath_split_headers' in options)) {
      // Like assert_xpath_split_headers but assert it does not match.
      options.assert_not_xpath_split_headers = {};
    }
    if (!('convert_before' in options)) {
      // List of strings. Convert files at these paths from default_file_reader
      // before the main conversion to build up the cross-file reference database.
      options.convert_before = [];
    }
    if (!('filesystem' in options)) {
      // Passed to cirodown.convert.
      options.filesystem = default_filesystem;
    }
    if (!('has_error' in options)) {
      // Has error somewhere, but our precise error line/column assertions
      // are failing, and we are lazy to fix them right now. But still it is better
      // to know that it does not blow up with an exception, and has at least.
      // one error message.
      options.has_error = false;
    }

    // extra_convert_opts defaults.
    if (!('extra_convert_opts' in options)) {
      // Passed to cirodown.convert.
      options.extra_convert_opts = {};
    }
    if (!('path_sep' in options.extra_convert_opts)) {
      options.extra_convert_opts.path_sep = '/';
    }
    if (!('read_include' in options.extra_convert_opts)) {
      options.extra_convert_opts.read_include = (input_path_noext) => {
        return [input_path_noext + cirodown.CIRODOWN_EXT,
           options.filesystem[input_path_noext + cirodown.CIRODOWN_EXT]];
      };
    }
    options.extra_convert_opts.fs_exists_sync = (my_path) => options.filesystem[my_path] !== undefined
    if (
      (
        Object.keys(options.assert_xpath_split_headers).length > 0 ||
        Object.keys(options.assert_not_xpath_split_headers).length > 0
      ) &&
      !('split_headers' in options.extra_convert_opts)
    ) {
      options.extra_convert_opts.split_headers = true;
    }
    if (!('input_path_noext' in options) && options.extra_convert_opts.split_headers) {
      options.input_path_noext = cirodown.INDEX_BASENAME_NOEXT;
    }

    // Convenience parameter that sets both input_path_noext and toplevel_id.
    // options.input_path_noext
    if (!('toplevel' in options)) {
      options.toplevel = false;
    }
    const new_convert_opts = Object.assign({}, convert_opts);
    Object.assign(new_convert_opts, options.extra_convert_opts);
    if (options.toplevel) {
      new_convert_opts.body_only = false;
    }

    // SqliteIdProvider with in-memory database.
    const sequelize = await cirodown_nodejs.create_sequelize({
      storage: ':memory:',
      logging: false,
    })
    new_convert_opts.id_provider = new cirodown_nodejs.SqliteIdProvider(sequelize);
    new_convert_opts.file_provider = new MockFileProvider();
    for (const input_path of options.convert_before) {
      const extra_returns = {};
      const input_string = options.filesystem[input_path];
      options.convert_before = [];
      const dependency_convert_opts = Object.assign({}, new_convert_opts);
      dependency_convert_opts.input_path = input_path;
      dependency_convert_opts.toplevel_id = path.parse(input_path).ext;
      await cirodown.convert(input_string, dependency_convert_opts, extra_returns);
      await Promise.all([
        new_convert_opts.id_provider.update(extra_returns, sequelize),
        new_convert_opts.file_provider.update(input_path, extra_returns),
      ])
    }
    if (options.input_path_noext !== undefined) {
      new_convert_opts.input_path = options.input_path_noext + cirodown.CIRODOWN_EXT;
      new_convert_opts.toplevel_id = options.input_path_noext;
    }
    const extra_returns = {};
    const output = await cirodown.convert(input_string, new_convert_opts, extra_returns);
    const has_subset_extra_returns = {fail_reason: ''};
    let is_subset;
    let content;
    let content_array;
    if (expected_ast_output_subset === undefined) {
      is_subset = true;
    } else {
      if (options.toplevel) {
        content = extra_returns.ast;
        content_array = [content]
        is_subset = ast_has_subset(content, expected_ast_output_subset, has_subset_extra_returns);
      } else {
        content = extra_returns.ast.args.content;
        content_array = content
        is_subset = ast_arg_has_subset(content, expected_ast_output_subset, has_subset_extra_returns);
      }
    }
    const expect_error_precise =
      options.error_line !== undefined ||
      options.error_column !== undefined ||
      options.error_path !== undefined ||
      options.error_message !== undefined;
    const expect_error = expect_error_precise || options.has_error;
    if (
      !is_subset ||
      (
        !expect_error &&
        extra_returns.errors.length !== 0
      )
    ) {
      // Too verbose to show by default.
      //console.error('tokens:');
      //console.error(JSON.stringify(extra_returns.tokens, null, 2));
      //console.error();
      //console.error('ast output:');
      //console.error(JSON.stringify(content, null, 2));
      //console.error();
      if (expected_ast_output_subset !== undefined) {
        console.error('ast output toString:');
        console.error(content_array.map(c => c.toString()).join('\n'));
        console.error();
        console.error('ast expect:');
        console.error(JSON.stringify(expected_ast_output_subset, null, 2));
        console.error();
        console.error('errors:');
      }
      for (const error of extra_returns.errors) {
        console.error(error);
      }
      if (!is_subset) {
        console.error('failure reason:');
        console.error(has_subset_extra_returns.fail_reason);
        console.error();
      }
      for (const error of extra_returns.errors) {
        console.error(error.toString());
      }
      console.error('input ' + util.inspect(input_string));
      assert.strictEqual(extra_returns.errors.length, 0);
      assert.ok(is_subset);
    }
    if (expect_error) {
      assert.ok(extra_returns.errors.length > 0);
      const error = extra_returns.errors[0];
      if (expect_error_precise) {
        assert.deepStrictEqual(
          error.source_location,
          new cirodown.SourceLocation(
            options.error_line,
            options.error_column,
            options.error_path
          )
        );
        if (options.error_message) {
          assert.strictEqual(error.message, options.error_message)
        }
      }
    }
    for (const xpath_expr of options.assert_xpath_matches) {
      assert_xpath_matches(xpath_expr, output);
    }
    for (const xpath_expr of options.assert_not_xpath_matches) {
      assert_xpath_matches(xpath_expr, output, { count: 0 });
    }
    for (const key in options.assert_xpath_split_headers) {
      const output = extra_returns.rendered_outputs[key];
      assert.notStrictEqual(output, undefined, `${key} not in ${Object.keys(extra_returns.rendered_outputs)}`);
      for (const xpath_expr of options.assert_xpath_split_headers[key]) {
        assert_xpath_matches(xpath_expr, output, {message: key});
      }
    }
    for (const key in options.assert_not_xpath_split_headers) {
      const output = extra_returns.rendered_outputs[key];
      assert.notStrictEqual(output, undefined);
      for (const xpath_expr of options.assert_not_xpath_split_headers[key]) {
        assert_xpath_matches(xpath_expr, output, {
          count: 0,
          message: key,
        });
      }
    }
  });
}

function assert_equal(description, output, expected_output) {
  it(description, ()=>{assert.strictEqual(output, expected_output);});
}

/** Assert that the conversion fails in a controlled way, giving correct
 * error line and column as the first error, and without throwing an
 * exception. Ideally, we should assert all errors. However, asserting
 * the first one correctly is the most critical part of it, because
 * errors can compound up, making later errors meaningless. So the message
 * only has to be 100% correct on the first error pointed out, to allow
 * the user to deterministically solve that problem first, and then move
 * on to the next. */
function assert_error(description, input, line, column, path, options={}) {
  const new_convert_opts = Object.assign({}, options);
  new_convert_opts.error_line = line;
  new_convert_opts.error_column = column;
  new_convert_opts.error_path = path;
  assert_convert_ast(
    description,
    input,
    undefined,
    new_convert_opts
  );
}

const testdir = path.join(__dirname, cirodown_nodejs.TMP_DIRNAME, 'test')
fs.rmdirSync(testdir, { recursive: true});
fs.mkdirSync(testdir);

// Test the cirodown executable via a separate child process call.
//
// The test runs in a clean temporary directory. If the test fails,
// the directory is cleaned up, so you can list the latest directory
// with:
//
// ls -crtl /tmp
//
// and then inspect it interactively to debug.
function assert_executable(
  description,
  options={}
) {
  it(description, function () {
    options = Object.assign({}, options);
    if (!('args' in options)) {
      options.args = [];
    }
    if (!('cwd' in options)) {
      options.cwd = '.';
    }
    if (!('filesystem' in options)) {
      options.filesystem = {};
    }
    if (!('expect_stdout_xpath' in options)) {
      options.expect_stdout_xpath = [];
    }
    if (!('expect_filesystem_xpath' in options)) {
      options.expect_filesystem_xpath = {};
    }
    if (!('expect_filesystem_not_xpath' in options)) {
      options.expect_filesystem_not_xpath = {};
    }
    if (!('expect_exit_status' in options)) {
      options.expect_exit_status = 0;
    }
    if (!('expect_exists' in options)) {
      options.expect_exists = [];
    }
    if (!('expect_not_exists' in options)) {
      options.expect_not_exists = [];
    }
    if (!('pre_exec' in options)) {
      options.pre_exec = [];
    }
    if ('timeout' in options) {
      // https://stackoverflow.com/questions/15971167/how-to-increase-timeout-for-a-single-test-case-in-mocha
      this.timeout(options.timeout);
    }

    const tmpdir = path.join(testdir, this.test.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    // These slighty modified titles should still be unique, but who knows.
    // Not modifying them would require cd quoting.
    assert(!fs.existsSync(tmpdir));
    fs.mkdirSync(tmpdir);
    const cwd = path.relative(process.cwd(), path.join(tmpdir, options.cwd))
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd);
    }
    update_filesystem(options.filesystem, tmpdir)
    process.env.PATH = process.cwd() + ':' + process.env.PATH
    const fakeroot_arg = ['--fakeroot', tmpdir]
    for (const entry of options.pre_exec) {
      if (Array.isArray(entry)) {
        let [cmd, args] = entry
        if (cmd === 'cirodown') {
          args = fakeroot_arg.concat(args)
        }
        const out = child_process.spawnSync(cmd, args, {cwd: cwd});
        assert.strictEqual(out.status, 0, exec_assert_message(out, cmd, args, cwd));
      } else {
        update_filesystem(entry.filesystem_update, tmpdir)
      }
    }
    const cmd = 'cirodown'
    const args = fakeroot_arg.concat(options.args)
    const out = child_process.spawnSync(cmd, args, {
      cwd: cwd,
      input: options.stdin,
    });
    const assert_msg = exec_assert_message(out, cmd, args, cwd);
    assert.strictEqual(out.status, options.expect_exit_status, assert_msg);
    for (const xpath_expr of options.expect_stdout_xpath) {
      assert_xpath_matches(
        xpath_expr,
        out.stdout.toString(cirodown_nodejs.ENCODING),
        {message: assert_msg},
      );
    }
    for (const relpath in options.expect_filesystem_xpath) {
      const assert_msg_xpath = `path should match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), assert_msg_xpath);
      const html = fs.readFileSync(fullpath).toString(cirodown_nodejs.ENCODING);
      for (const xpath_expr of options.expect_filesystem_xpath[relpath]) {
        assert_xpath_matches(xpath_expr, html, {message: assert_msg_xpath});
      }
    }
    for (const relpath in options.expect_filesystem_not_xpath) {
      const assert_msg_xpath = `path should not match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), assert_msg_xpath);
      const html = fs.readFileSync(fullpath).toString(cirodown_nodejs.ENCODING);
      for (const xpath_expr of options.expect_filesystem_not_xpath[relpath]) {
        assert_xpath_matches(xpath_expr, html, {message: assert_msg_xpath, count: 0});
      }
    }
    for (const relpath of options.expect_exists) {
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), exec_assert_message(
        out, cmd, args, cwd, 'path should exist: ' + relpath));
    }
    for (const relpath of options.expect_not_exists) {
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(!fs.existsSync(fullpath), exec_assert_message(
        out, cmd, args, cwd, 'path should not exist: ' + relpath));
    }
  });
}

/** For stuff that is hard to predict the exact output of, just check the
 * exit status at least. */
function assert_no_error(description, input, options) {
  assert_convert_ast(description, input, undefined, options)
}

function assert_xpath_matches(xpath_expr, string, options={}) {
  const xpath_matches = xpath_html(string, xpath_expr);
  if (!('count' in options)) {
    options.count = 1;
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
    console.error(`assert_xpath_matches${count_str}: ` + options.message);
    console.error('xpath: ' + xpath_expr);
    console.error('string:');
    console.error(string);
    assert.strictEqual(xpath_matches.length, options.count);
  }
}

/** Determine if a given Ast argument has a subset.
 *
 * For each lement of the array, only the subset of each object is checked.
 *
 * @param {Array[AstNode]} unmodified array of AstNode as output by convert
 * @param {Array[Object]} lightweight AstNode notation containing only built-in JavaScript objects
 *        such as dict, array and string, to make writing tests a bit less verbose.
 * @return {Bool} true iff ast_subset is a subset of this node
 */
function ast_arg_has_subset(arg, subset, extra_returns) {
  if (arg.length !== subset.length) {
    extra_returns.fail_reason = `arg.length !== subset.length ${arg.length} ${subset.length}
arg: ${arg}
subset: ${subset}
`;
    return false;
  }
  for (let i = 0; i < arg.length; i++) {
    if (!ast_has_subset(arg[i], subset[i], extra_returns))
      return false;
  }
  return true;
}

/** See: ast_arg_has_subset. */
function ast_has_subset(ast, ast_subset, extra_returns) {
  for (const ast_subset_prop_name in ast_subset) {
    if (!(ast_subset_prop_name in ast)) {
      extra_returns.fail_reason = `!(ast_subset_prop_name in ast: ${ast_subset_prop_name} ${ast_subset_prop_name}`;
      return false
    }
    const ast_prop = ast[ast_subset_prop_name];
    const ast_subset_prop = ast_subset[ast_subset_prop_name];
    if (ast_subset_prop_name === 'args') {
      for (const ast_subset_arg_name in ast_subset_prop) {
        if (!(ast_subset_arg_name in ast_prop)) {
          extra_returns.fail_reason = `!(ast_subset_arg_name in ast_prop): ${ast_subset_prop_name} ${ast_subset_arg_name}`;
          return false;
        }
        if (!ast_arg_has_subset(ast_prop[ast_subset_arg_name], ast_subset_prop[ast_subset_arg_name], extra_returns))
          return false;
      }
    } else {
      if (ast_prop !== ast_subset_prop) {
        extra_returns.fail_reason = `ast_prop !== ast_subset_prop: '${ast_subset_prop_name}' '${ast_prop}' '${ast_subset_prop}'`;
        return false;
      }
    }
  }
  return true;
}

/** Shortcut to create node with a 'content' argument for ast_arg_has_subset.
 *
 * @param {Array} the argument named content, which is very common across macros.
 *                If undefined, don't add a content argument at all.
 */
function a(macro_name, content, extra_args={}, extra_props={}) {
  let args = extra_args;
  if (content !== undefined) {
    args.content = content;
  }
  return Object.assign(
    {
      'macro_name': macro_name,
      'args': args,
    },
    extra_props
  );
}

const default_filesystem = {
  'include-one-level-1.ciro': `= cc

dd
`,
  'include-one-level-2.ciro': `= ee

ff
`,
  'include-two-levels.ciro': `= ee

ff

== gg

hh
`,
  'include-two-levels-parent.ciro': `= Include two levels parent

h1 content

= Include two levels parent h2
{parent=include-two-levels-parent}

h2 content
`,
  'include-two-levels-subdir/index.ciro': `= Include two levels subdir h1

== Include two levels subdir h2
`,
  'include-with-error.ciro': `= bb

\\reserved_undefined
`,
  'include-circular-1.ciro': `= bb

\\Include[include-circular-2]
`,
  'include-circular-2.ciro': `= cc

\\Include[include-circular-1]
`,
}

function exec_assert_message(out, cmd, args, cwd, msg_extra) {
  let ret = ''
  if (msg_extra !== undefined) {
    ret = msg_extra + '\n\n'
  }
  ret += `cmd: cd ${cwd} && ${cmd} ${args.join(' ')}
stdout:
${out.stdout.toString(cirodown_nodejs.ENCODING)}

stderr:
${out.stderr.toString(cirodown_nodejs.ENCODING)}`;
  return ret;
}

/** Shortcut to create plaintext nodes for ast_arg_has_subset, we have too many of those. */
function t(text) { return {'macro_name': 'plaintext', 'text': text}; }

// https://stackoverflow.com/questions/25753368/performant-parsing-of-html-pages-with-node-js-and-xpath/25971812#25971812
// Not using because too broken.
// https://github.com/hieuvp/xpath-html/issues/10
//const xpath = require("xpath-html");
const parse5 = require('parse5');
const xmlserializer = require('xmlserializer');
const xmldom = require('xmldom').DOMParser;
const xpath = require('xpath');
function xpath_html(html, xpathStr) {
  const document = parse5.parse(html);
  const xhtml = xmlserializer.serializeToString(document);
  const doc = new xmldom().parseFromString(xhtml);
  const select = xpath.useNamespaces({"x": "http://www.w3.org/1999/xhtml"});
  return select(xpathStr, doc);
}

function update_filesystem(filesystem, tmpdir) {
  for (const relpath in filesystem) {
    const dirpath = path.join(tmpdir, path.parse(relpath).dir);
    if (!fs.existsSync(dirpath)) {
      fs.mkdirSync(dirpath);
    }
    fs.writeFileSync(path.join(tmpdir, relpath), filesystem[relpath]);
  }
}

// xpath to match the parent div of a given header.
function xpath_header(n, id, insideH) {
  if (insideH) {
    insideH = '//' + insideH
  } else {
    insideH = ''
  }
  return `//x:div[@class='h' and @id='${id}' and .//x:h${n}${insideH}]`;
}

// xpath to match the split/nosplit link inside of a header.
function xpath_header_split(n, id, href, marker) {
  return `${xpath_header(n, id)}//x:a[@href='${href}' and text()='${marker}']`;
}

// xpath to match the parent link inside of a header.
function xpath_header_parent(n, id, href, title) {
  return `${xpath_header(n, id)}//x:a[@href='${href}' and text()='${cirodown.PARENT_MARKER} \"${title}\"']`;
}

// Empty document.
assert_convert_ast('empty document', '', []);

// Paragraphs.
assert_convert_ast('one paragraph implicit no split headers', 'ab\n',
  [a('P', [t('ab')])],
);
assert_convert_ast('one paragraph explicit', '\\P[ab]\n',
  [a('P', [t('ab')])],
);
assert_convert_ast('two paragraphs', 'p1\n\np2\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
  ]
);
assert_convert_ast('three paragraphs',
  'p1\n\np2\n\np3\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
    a('P', [t('p3')]),
  ]
);
assert_convert_ast('insane paragraph at start of sane quote',
  '\\Q[\n\naa]\n',
  [
    a('Q', [
      a('P', [t('aa')])]
    ),
  ]
);
assert_convert_ast('sane quote without inner paragraph',
  '\\Q[aa]\n',
  [a('Q', [t('aa')])],
);
assert_error('paragraph three newlines', 'p1\n\n\np2\n', 3, 1);
assert_convert_ast('both quotes and paragraphs get the on-hover link',
  `= tmp

aa

\\Q[bb]`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('tmp')],
    }),
    a('P', [t('aa')], {}, {id: '_1'}),
    a('Q', [t('bb')], {}, {id: '_2'}),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='hide-hover']//x:a[@href='#_1']",
      "//x:span[@class='hide-hover']//x:a[@href='#_2']",
    ],
  }
);
assert_convert_ast('a non-header first element has a on-hover link with its id',
  `aa`,
  [
    a('P', [t('aa')], {}, {id: '_1'}),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='hide-hover']//x:a[@href='#_1']",
    ],
  }
);
assert_convert_ast('a header first element has an empty on-hover link',
  `= tmp`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('tmp')],
    }),
  ],
  {
    assertnot_xpath_matches: [
      "//x:span[@class='hide-hover']//x:a[@href='']",
    ],
    assert_not_xpath_matches: [
      "//x:span[@class='hide-hover']//x:a[@href='#tmp']",
    ],
  }
);
assert_error('paragraph three newlines', 'p1\n\n\np2\n', 3, 1);

// List.
const l_with_explicit_ul_expect = [
  a('P', [t('ab')]),
  a('Ul', [
    a('L', [t('cd')]),
    a('L', [t('ef')]),
  ]),
  a('P', [t('gh')]),
];
assert_convert_ast('l with explicit ul and no extra spaces',
  `ab

\\Ul[\\L[cd]\\L[ef]]

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('l with implicit ul sane',
  `ab

\\L[cd]
\\L[ef]

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('l with implicit ul insane',
  `ab

* cd
* ef

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('empty insane list item without a space',
  `* ab
*
* cd
`,
  [
  a('Ul', [
    a('L', [t('ab')]),
    a('L', []),
    a('L', [t('cd')]),
  ]),
]
);
assert_convert_ast('l with explicit ul and extra spaces',
  `ab

\\Ul[
\\L[cd]\u0020
\u0020\t\u0020
\\L[ef]
]

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('ordered list',
  `ab

\\Ol[
\\L[cd]
\\L[ef]
]

gh
`,
[
  a('P', [t('ab')]),
  a('Ol', [
    a('L', [t('cd')]),
    a('L', [t('ef')]),
  ]),
  a('P', [t('gh')]),
]
);
assert_convert_ast('list with paragraph sane',
  `\\L[
aa

bb
]
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('P', [t('bb\n')]),
      ]),
    ]),
  ]
)
assert_convert_ast('list with paragraph insane',
  `* aa

  bb
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('P', [t('bb')]),
      ]),
    ]),
  ]
);
assert_convert_ast('list with multiline paragraph insane',
  `* aa

  bb
  cc
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('P', [t('bb\ncc')]),
      ]),
    ]),
  ]
);
// https://github.com/cirosantilli/cirodown/issues/54
assert_convert_ast('insane list with literal no error',
  `* aa

  \`\`
  bb
  cc
  \`\`
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('C', [t('bb\ncc\n')]),
      ]),
    ]),
  ]
);
assert_error('insane list with literal with error',
  `* aa

  \`\`
  bb
cc
  \`\`
`,
  4, 1
);
assert_convert_ast('insane list with literal with double newline is not an error',
  `* aa

  \`\`
  bb

  cc
  \`\`
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('C', [t('bb\n\ncc\n')]),
      ]),
    ]),
  ]
);
// https://github.com/cirosantilli/cirodown/issues/53
assert_convert_ast('insane list with element with newline separated arguments',
  `* aa

  \`\`
  bb
  \`\`
  {id=cc}
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('C', [t('bb\n')], {id: [t('cc')]}),
      ]),
    ]),
  ]
);
assert_convert_ast('insane list inside paragraph',
  `aa
* bb
* cc
dd
`,
  [
    a('P', [
      t('aa'),
      a('Ul', [
        a('L', [t('bb')]),
        a('L', [t('cc\n')]),
      ]),
      t('dd'),
    ]),
  ]
);
assert_convert_ast('insane list at start of sane quote',
  `\\Q[
* bb
* cc
]
`,
  [
    a('Q', [
      a('Ul', [
        a('L', [t('bb')]),
        a('L', [t('cc\n')]),
      ]),
    ]),
  ]
);
assert_convert_ast('nested list insane',
  `* aa
  * bb
`,
  [
    a('Ul', [
      a('L', [
        t('aa'),
        a('Ul', [
          a('L', [
            t('bb')
          ]),
        ]),
      ]),
    ]),
  ]
);
assert_convert_ast('escape insane list',
  '\\* a',
  [a('P', [t('* a')])],
);
// https://github.com/cirosantilli/cirodown/issues/81
assert_convert_ast('insane list immediately inside insane list',
  `* * aa
  * bb
  * cc
`,
  [
    a('Ul', [
      a('L', [
        a('Ul', [
          a('L', [t('aa')]),
          a('L', [t('bb')]),
          a('L', [t('cc')]),
        ]),
      ]),
    ]),
  ]
);

// Table.
const tr_with_explicit_table_expect = [
  a('P', [t('ab')]),
  a('Table', [
    a('Tr', [
      a('Th', [t('cd')]),
      a('Th', [t('ef')]),
    ]),
    a('Tr', [
      a('Td', [t('00')]),
      a('Td', [t('01')]),
    ]),
    a('Tr', [
      a('Td', [t('10')]),
      a('Td', [t('11')]),
    ]),
  ]),
  a('P', [t('gh')]),
];
assert_convert_ast('tr with explicit table',
  `ab

\\Table[
\\Tr[
\\Th[cd]
\\Th[ef]
]
\\Tr[
\\Td[00]
\\Td[01]
]
\\Tr[
\\Td[10]
\\Td[11]
]
]

gh
`,
  tr_with_explicit_table_expect
);
assert_convert_ast('tr with implicit table',
  `ab

\\Tr[
\\Th[cd]
\\Th[ef]
]
\\Tr[
\\Td[00]
\\Td[01]
]
\\Tr[
\\Td[10]
\\Td[11]
]

gh
`,
  tr_with_explicit_table_expect
);
assert_convert_ast('fully implicit table',
  `ab

|| cd
|| ef

| 00
| 01

| 10
| 11

gh
`,
  tr_with_explicit_table_expect
);
assert_convert_ast('insane table inside insane list inside insane table',
  `| 00
| 01

  * l1
  * l2

    | 20
    | 21

    | 30
    | 31

| 10
| 11
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        a('Td', [
          a('P', [t('01')]),
          a('Ul', [
            a('L', [t('l1')]),
            a('L', [
              a('P', [t('l2')]),
              a('Table', [
                a('Tr', [
                  a('Td', [t('20')]),
                  a('Td', [t('21')]),
                ]),
                a('Tr', [
                  a('Td', [t('30')]),
                  a('Td', [t('31')]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]),
      a('Tr', [
        a('Td', [t('10')]),
        a('Td', [t('11')]),
      ]),
    ]),
  ]
);
// https://github.com/cirosantilli/cirodown/issues/81
assert_convert_ast('insane table immediately inside insane list',
  `* | 00
  | 01

  | 10
  | 11
`,
  [
    a('Ul', [
      a('L', [
        a('Table', [
          a('Tr', [
            a('Td', [t('00')]),
            a('Td', [t('01')]),
          ]),
          a('Tr', [
            a('Td', [t('10')]),
            a('Td', [t('11')]),
          ]),
        ]),
      ]),
    ])
  ]
);
assert_convert_ast('insane table body with empty cell and no space',
  `| 00
|
| 02
`, [
  a('Table', [
    a('Tr', [
      a('Td', [t('00')]),
      a('Td', []),
      a('Td', [t('02')]),
    ]),
  ]),
],
);
assert_convert_ast('insane table head with empty cell and no space',
  `|| 00
||
|| 02
`, [
  a('Table', [
    a('Tr', [
      a('Th', [t('00')]),
      a('Th', []),
      a('Th', [t('02')]),
    ]),
  ]),
],
);
assert_convert_ast('implicit table escape', '\\| a\n',
  [a('P', [t('| a')])],
);
assert_convert_ast("pipe space in middle of line don't need escape", 'a | b\n',
  [a('P', [t('a | b')])],
);
assert_convert_ast('auto_parent consecutive implicit tr and l',
  `\\Tr[\\Td[ab]]
\\L[cd]
`,
[
  a('P', [
    a('Table', [
      a('Tr', [
        a('Td', [t('ab')]),
      ]),
    ]),
    a('Ul', [
      a('L', [t('cd')]),
    ]),
  ]),
]
);
assert_convert_ast('table with id has caption',
  `\\Table{id=ab}
[
| 00
| 01
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        // TODO get rid of the \n.
        a('Td', [t('01\n')]),
      ]),
    ], {}, { id: 'ab' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_convert_ast('table with title has caption',
  `\\Table{title=a b}
[
| 00
| 01
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        // TODO get rid of the \n.
        a('Td', [t('01\n')]),
      ]),
    ], {}, { id: 'table-a-b' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_convert_ast('table with description has caption',
  `\\Table{description=a b}
[
| 00
| 01
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        // TODO get rid of the \n.
        a('Td', [t('01\n')]),
      ]),
    ], {}, { id: '_1' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_convert_ast('table without id, title, nor description does not have caption',
  `\\Table[
| 00
| 01
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        a('Td', [t('01\n')]),
      ]),
    ]),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_convert_ast('table without id, title, nor description does not increment the table count',
  `\\Table{id=0}[
| 00
| 01
]

\\Table[
| 10
| 11
]

\\Table{id=1}[
| 20
| 21
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        a('Td', [t('01\n')]),
      ]),
    ]),
    a('Table', [
      a('Tr', [
        a('Td', [t('10')]),
        a('Td', [t('11\n')]),
      ]),
    ]),
    a('Table', [
      a('Tr', [
        a('Td', [t('20')]),
        a('Td', [t('21\n')]),
      ]),
    ]),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
      "//x:span[@class='caption-prefix' and text()='Table 2']",
    ],
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Table 3']",
    ],
  },
);

// Images.
assert_convert_ast('image simple',
  `ab

\\Image[cd]

gh
`,
[
  a('P', [t('ab')]),
  a('Image', undefined, {src: [t('cd')]}),
  a('P', [t('gh')]),
],
  {
    filesystem: { cd: '' },
    assert_xpath_matches: [
      "//x:img[@src='cd']",
    ],
  },
);
assert_convert_ast('video simple',
  `ab

\\Video[cd]

gh
`,
[
  a('P', [t('ab')]),
  a('Video', undefined, {src: [t('cd')]}),
  a('P', [t('gh')]),
],
  {
    filesystem: { cd: '' },
    assert_xpath_matches: [
      "//x:video[@src='cd']",
    ],
  },
);
assert_convert_ast('image title',
  `\\Image[ab]{title=c d}`,
[
  a('Image', undefined, {
    src: [t('ab')],
    title: [t('c d')],
  }),
],
  { filesystem: { ab: '' } },
);
assert_error('image with unknown provider',
  `\\Image[ab]{provider=reserved_undefined}`,
  1, 11
);
assert_error('image provider that does not match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=local}`,
  1, 96
);
assert_no_error('image provider that does match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=wikimedia}`,
  1, 96
);
assert_convert_ast('image with id has caption',
  `\\Image[aa]{id=bb}{check=0}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      id: [t('bb')],
    }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_convert_ast('image with title has caption',
  `\\Image[aa]{title=b b}{check=0}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      title: [t('b b')],
    }, {}, { id: 'b-b' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_convert_ast('image with description has caption',
  `\\Image[aa]{description=b b}{check=0}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      description: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_convert_ast('image with source has caption',
  `\\Image[aa]{source=b b}{check=0}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      source: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_convert_ast('image without id, title, description nor source does not have caption',
  `\\Image[aa]{check=0}
`,
  [
    a('Image', undefined, {
      src: [t('aa')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
)
assert_convert_ast('image without id, title, description nor source does not increment the image count',
  `\\Image[aa]{id=aa}{check=0}

\\Image[bb]{check=0}

\\Image[cc]{id=cc}{check=0}
`,
  [
    a('Image', undefined, { src: [t('aa')], }, {}, { id: 'aa' }),
    a('Image', undefined, { src: [t('bb')], }, {}, { id: '_2' }),
    a('Image', undefined, { src: [t('cc')], }, {}, { id: 'cc' }),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
      "//x:span[@class='caption-prefix' and text()='Figure 2']",
    ],
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Figure 3']",
    ],
  },
)
assert_convert_ast('image title with x to header in another file',
  `\\Image[aa]{title=My \\x[notindex]}{check=0}`,
  [
    a('Image', undefined, { src: [t('aa')], }, {}, { id: 'my-notindex-h1' }),
  ],
  {
    convert_before: ['notindex.ciro'],
    filesystem: {
     'notindex.ciro': `= notindex h1
`,
    },
  }
);

// Escapes.
assert_convert_ast('escape backslash',            'a\\\\b\n', [a('P', [t('a\\b')])]);
assert_convert_ast('escape left square bracket',  'a\\[b\n',  [a('P', [t('a[b')])]);
assert_convert_ast('escape right square bracket', 'a\\]b\n',  [a('P', [t('a]b')])]);
assert_convert_ast('escape left curly brace',     'a\\{b\n',  [a('P', [t('a{b')])]);
assert_convert_ast('escape right curly brace',    'a\\}b\n',  [a('P', [t('a}b')])]);

// Positional arguments.
// Has no content argument.
assert_convert_ast('p with no content argument', '\\P\n', [a('P')]);
assert_convert_ast('table with no content argument', '\\Table\n', [a('Table')]);
// Has empty content argument.
assert_convert_ast('p with empty content argument', '\\P[]\n', [a('P', [])]);

// Named arguments.
assert_convert_ast('p with id before', '\\P{id=ab}[cd]\n',
  [a('P', [t('cd')], {id: [t('ab')]})]);
assert_convert_ast('p with id after', '\\P[cd]{id=ab}\n',
  [a('P', [t('cd')], {id: [t('ab')]})]);
// https://github.com/cirosantilli/cirodown/issues/101
assert_error('named argument given multiple times',
  '\\P[ab]{id=cd}{id=ef}', 1, 14);
assert_error(
  'non-empty named argument without = is an error',
  '\\P{id ab}[cd]',
  1, 6, 'notindex.ciro',
  {
    input_path_noext: 'notindex',
  }
);
assert_convert_ast('empty named argument without = is allowed',
  '\\P[cd]{id=}\n',
  [a('P', [t('cd')], {id: []})]
);

// Newline after close.
assert_convert_ast('text after block element',
  `a

\\C[
b
c
]
d

e
`,
[
  a('P', [t('a')]),
  a('P', [
    a('C', [t('b\nc\n')]),
    t('\nd'),
  ]),
  a('P', [t('e')]),
]
);
assert_convert_ast('macro after block element',
  `a

\\C[
b
c
]
\\c[d]

e
`,
[
  a('P', [t('a')]),
  a('P', [
    a('C', [t('b\nc\n')]),
    t('\n'),
    a('c', [t('d')]),
  ]),
  a('P', [t('e')]),
]
);

// Literal arguments.
assert_convert_ast('literal argument code inline',
  '\\c[[\\ab[cd]{ef}]]\n',
  [a('P', [a('c', [t('\\ab[cd]{ef}')])])],
);
assert_convert_ast('literal argument code block',
  `a

\\C[[
\\[]{}
\\[]{}
]]

d
`,
[
  a('P', [t('a')]),
  a('C', [t('\\[]{}\n\\[]{}\n')]),
  a('P', [t('d')]),
],
);
assert_convert_ast('non-literal argument leading newline gets removed',
  `\\P[
a
b
]
`,
  [a('P', [t('a\nb\n')])],
);
assert_convert_ast('literal argument leading newline gets removed',
  `\\P[[
a
b
]]
`,
  [a('P', [t('a\nb\n')])],
);
assert_convert_ast('literal argument leading newline gets removed but not the second one',
  `\\P[[

a
b
]]
`,
  [a('P', [t('\na\nb\n')])],
);
assert_convert_ast('literal agument escape leading open no escape',
  '\\c[[\\ab]]\n',
  [a('P', [a('c', [t('\\ab')])])],
);
assert_convert_ast('literal agument escape leading open one backslash',
  '\\c[[\\[ab]]\n',
  [a('P', [a('c', [t('[ab')])])],
);
assert_convert_ast('literal agument escape leading open two backslashes',
  '\\c[[\\\\[ab]]\n',
  [a('P', [a('c', [t('\\[ab')])])],
);
assert_convert_ast('literal agument escape trailing close no escape',
  '\\c[[\\]]\n',
  [a('P', [a('c', [t('\\')])])],
);
assert_convert_ast('literal agument escape trailing one backslash',
  '\\c[[\\]]]\n',
  [a('P', [a('c', [t(']')])])],
);
assert_convert_ast('literal agument escape trailing two backslashes',
  '\\c[[\\\\]]]\n',
  [a('P', [a('c', [t('\\]')])])],
);

// Newline between arguments.
const newline_between_arguments_expect = [
  a('C', [t('ab\n')], {id: [t('cd')]}),
];
assert_convert_ast('not literal argument with argument after newline',
  `\\C[
ab
]
{id=cd}
`,
  newline_between_arguments_expect
);
assert_convert_ast('yes literal argument with argument after newline',
  `\\C[[
ab
]]
{id=cd}
`,
  newline_between_arguments_expect
);
assert_convert_ast('yes insane literal argument with argument after newline',
  `\`\`
ab
\`\`
{id=cd}
`,
  newline_between_arguments_expect
);

// Links.
assert_convert_ast('link simple to external URL',
  'a \\a[http://example.com][example link] b\n',
  [
    a('P', [
      t('a '),
      a('a', [t('example link')], {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_convert_ast('link auto sane',
  'a \\a[http://example.com] b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_convert_ast('link auto insane space start and end',
  'a http://example.com b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_convert_ast('link simple to local file that exists',
  'a \\a[local-path.txt] b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('local-path.txt')]}),
      t(' b'),
    ]),
  ],
  { filesystem: { 'local-path.txt': '' } }
);
assert_error('link simple to local file that does not exist give an error without check=0',
  'a \\a[local-path.txt] b\n',
  1, 5,
);
assert_no_error('link simple to local file that does not exist does not give an error with check=0',
  'a \\a[local-path.txt]{check=0} b\n',
);
assert_convert_ast('link auto insane start end document',
  'http://example.com',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_convert_ast('link auto insane start end square brackets',
  '\\P[http://example.com]\n',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_convert_ast('link auto insane with alpha character before it',
  'ahttp://example.com',
  [a('P', [
    t('a'),
    a('a', undefined, {'href': [t('http://example.com')]})
  ])]
);
assert_convert_ast('link auto insane with literal square brackets around it',
  '\\[http://example.com\\]\n',
  [a('P', [
    t('['),
    a('a', undefined, {'href': [t('http://example.com]')]})
  ])]
);
assert_convert_ast('link auto insane can be escaped with a backslash',
  '\\http://example.com\n',
  [a('P', [t('http://example.com')])],
);
assert_convert_ast('link auto insane is not a link if the domain is empty at eof',
  'http://\n',
  [a('P', [t('http://')])],
);
assert_convert_ast('link auto insane is not a link if the domain is empty at space',
  'http:// a\n',
  [a('P', [t('http:// a')])],
);
assert_convert_ast('link auto insane start end named argument',
  '\\Image[aaa.jpg]{description=http://example.com}\n',
  [a('Image', undefined, {
    description: [a('a', undefined, {'href': [t('http://example.com')]})],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
);
assert_convert_ast('link auto insane start end named argument',
  '\\Image[aaa.jpg]{source=http://example.com}\n',
  [a('Image', undefined, {
    source: [t('http://example.com')],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
);
assert_convert_ast('link auto insane newline',
  `a

http://example.com

b
`,
  [
    a('P', [t('a')]),
    a('P', [a('a', undefined, {'href': [t('http://example.com')]})]),
    a('P', [t('b')]),
  ]
);
assert_convert_ast('link insane with custom body no newline',
  'http://example.com[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
);
assert_convert_ast('link insane with custom body with newline',
  'http://example.com\n[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
);
assert_convert_ast('link auto end in space',
  `a http://example.com b`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ])
  ]
);
assert_convert_ast('link auto end in square bracket',
  `\\P[a http://example.com]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
    ])
  ]
);
assert_convert_ast('link auto containing escapes',
  `\\P[a http://example.com\\]a\\}b\\\\c\\ d]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com]a}b\\c d')]}),
    ])
  ]
);
assert_convert_ast('link with multiple paragraphs',
  '\\a[http://example.com][aaa\n\nbbb]\n',
  [
    a('P', [
      a(
        'a',
        [
          a('P', [t('aaa')]),
          a('P', [t('bbb')]),
        ],
        {'href': [t('http://example.com')]},
      ),
    ]),
  ]
);
assert_convert_ast('xss: a content and href',
  '\\a[ab&<>"\'cd][ef&<>"\'gh]{check=0}\n',
  undefined,
  {
    assert_xpath_matches: [
      "//x:a[@href=concat('ab&<>\"', \"'\", 'cd') and text()=concat('ef&<>\"', \"'\", 'gh')]",
    ]
  }
);

// Internal cross references \x
assert_convert_ast('cross reference simple',
  `= My header

\\x[my-header][link body]
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('My header')],
    }),
    a('P', [
      a('x', undefined, {
        content: [t('link body')],
        href: [t('my-header')],
      }),
    ]),
  ],
);
assert_convert_ast('cross reference full boolean style without value',
  `= My header

\\x[my-header]{full}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('My header')],
    }),
    a('P', [
      a('x', undefined, {
        full: [],
        href: [t('my-header')],
      }),
    ]),
  ]
);
assert_convert_ast('cross reference full boolean style with value 0',
  `= abc

\\x[abc]{full=0}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('abc')],
    }),
    a('P', [
      a('x', undefined, {
        full: [t('0')],
        href: [t('abc')],
      }),
    ]),
  ]
);
assert_convert_ast('cross reference full boolean style with value 1',
  `= abc

\\x[abc]{full=1}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('abc')],
    }),
    a('P', [
      a('x', undefined, {
        full: [t('1')],
        href: [t('abc')],
      }),
    ]),
  ]
);
// https://cirosantilli.com/cirodown#the-id-of-the-first-header-is-derived-from-the-filename
assert_convert_ast('id of first header comes from the file name if not index',
  `= abc

\\x[notindex]
`,
  [
    a('H', undefined,
      {
        level: [t('1')],
        title: [t('abc')],
      },
      {
        id: 'notindex',
      }
    ),
    a('P', [
      a('x', undefined, {
        full: [t('0')],
        href: [t('notindex')],
      }),
    ]),
  ],
  {
    input_path_noext: 'notindex'
  },
);
assert_convert_ast('id of first header comes from header title if index',
  `= abc

\\x[abc]
`,
  [
    a('H', undefined,
      {
        level: [t('1')],
        title: [t('abc')],
      },
      {
        id: 'abc',
      }
    ),
    a('P', [
      a('x', undefined, {
        full: [t('0')],
        href: [t('abc')],
      }),
    ]),
  ],
  {
    extra_convert_opts: {
      input_path: cirodown.INDEX_BASENAME_NOEXT + cirodown.CIRODOWN_EXT
    }
  },
);
assert_error('cross reference full boolean style with invalid value 2',
  `= abc

\\x[abc]{full=2}
`, 3, 8);
assert_error('cross reference full boolean style with invalid value true',
  `= abc

\\x[abc]{full=true}
`, 3, 8);
assert_no_error('cross reference to image',
  `\\Image[ab]{id=cd}{title=ef}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_no_error('cross reference without content nor target title style full',
  `\\Image[ab]{id=cd}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_error('cross reference undefined fails gracefully', '\\x[ab]', 1, 3);
assert_error('cross reference with child to undefined id fails gracefully',
  `= h1

\\x[ab]{child}
`, 3, 3, undefined, {toplevel: true});
// https://cirosantilli.com/cirodown#order-of-reported-errors
assert_error('cross reference undefined errors show after other errors',
  `= a

\\x[b]

\`\`
== b
`, 5, 1);
assert_error('cross reference full and ref are incompatible',
  `= abc

\\x[abc]{full}{ref}
`, 3, 1);
assert_convert_ast('cross reference to non-included header in another file',
  `\\x[another-file]
`,
  undefined,
  {
    assert_xpath_matches: [
      "//x:a[@href='another-file.html' and text()='another file']",
    ],
    convert_before: [
      'another-file.ciro',
    ],
    filesystem: {
      'another-file.ciro': '= Another file'
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference to non-included ids in another file',
  `= Notindex

\\x[notindex]

\\x[bb]

\\x[include-two-levels]

\\x[gg]

\\x[image-bb][image bb 1]

== bb

\\x[notindex][bb to notindex]

\\x[bb][bb to bb]

\\x[image-bb][bb to image bb]

\\Image[bb.png]{title=bb}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Notindex')]}),
    a('P', [a('x', undefined, {href: [t('notindex')]})]),
    a('P', [a('x', undefined, {href: [t('bb')]})]),
    a('P', [a('x', undefined, {href: [t('include-two-levels')]})]),
    a('P', [a('x', undefined, {href: [t('gg')]})]),
    a('P', [a('x', [t('image bb 1')], {href: [t('image-bb')]})]),
    // TODO: to enable this, we have to also update the test infrastructure to also pass:
    // new_options.toplevel_has_scope = true;
    // new_options.toplevel_parent_scope = undefined;
    // like ./cirodown does from the CLI.
    //
    //\\x[include-two-levels-subdir]
    //
    //\\x[include-two-levels-subdir/h2]
    //a('P', [a('x', undefined, {href: [t('include-two-levels-subdir')]})]),
    //a('P', [a('x', undefined, {href: [t('include-two-levels-subdir/h2')]})]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('bb')]}),
    a('P', [a('x', [t('bb to notindex')], {href: [t('notindex')]})]),
    a('P', [a('x', [t('bb to bb')], {href: [t('bb')]})]),
    a('P', [a('x', [t('bb to image bb')], {href: [t('image-bb')]})]),
    a(
      'Image',
      undefined,
      {
        src: [t('bb.png')],
        title: [t('bb')],
      },
    ),
  ],
  {
    assert_xpath_matches: [
      // Empty URL points to start of the document, which is exactly what we want.
      // https://stackoverflow.com/questions/5637969/is-an-empty-href-valid
      "//x:div[@class='p']//x:a[@href='' and text()='notindex']",
      "//x:a[@href='#bb' and text()='bb']",
      // https://github.com/cirosantilli/cirodown/issues/94
      "//x:a[@href='include-two-levels.html' and text()='ee']",
      "//x:a[@href='include-two-levels.html#gg' and text()='gg']",
      "//x:a[@href='#bb' and text()='bb to bb']",
      "//x:a[@href='#image-bb' and text()='image bb 1']",

      // Links to the split versions.
      xpath_header_split(1, 'notindex', 'notindex-split.html', cirodown.SPLIT_MARKER),
      xpath_header_split(2, 'bb', 'bb.html', cirodown.SPLIT_MARKER),
    ],
    assert_xpath_split_headers: {
      'notindex-split.html': [
        "//x:a[@href='include-two-levels.html' and text()='ee']",
        "//x:a[@href='include-two-levels.html#gg' and text()='gg']",
        "//x:a[@href='notindex.html#bb' and text()='bb']",
        // Link to the split version.
        xpath_header_split(1, 'notindex', 'notindex.html', cirodown.NOSPLIT_MARKER),
        // Internal cross reference inside split header.
        "//x:a[@href='notindex.html#image-bb' and text()='image bb 1']",
      ],
      'bb.html': [
        // Cross-page split-header parent link.
        xpath_header_parent(1, 'bb', 'notindex.html', 'Notindex'),
        "//x:a[@href='notindex.html' and text()='bb to notindex']",
        "//x:a[@href='notindex.html#bb' and text()='bb to bb']",
        // Link to the split version.
        xpath_header_split(1, 'bb', 'notindex.html#bb', cirodown.NOSPLIT_MARKER),
        // Internal cross reference inside split header.
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
    },
    convert_before: [
      'include-two-levels.ciro',
      // https://github.com/cirosantilli/cirodown/issues/116
      'include-two-levels-subdir/index.ciro',
    ],
    filesystem: Object.assign({}, default_filesystem, {
      'bb.png': ''
    }),
    input_path_noext: 'notindex',
  },
);
// TODO was working, but lazy now, will have to worry about
// mock ID provider or modify index.js.
//it('output_path_parts', () => {
//  const context = {options: {path_sep: '/'}};
//
//  // Non-split headers.
//  assert.deepStrictEqual(
//    cirodown.output_path_parts(
//      'notindex.ciro',
//      'notindex',
//      context,
//    ),
//    ['', 'notindex']
//  );
//  assert.deepStrictEqual(
//    cirodown.output_path_parts(
//      'index.ciro',
//      'index',
//      context,
//    ),
//    ['', 'index']
//  );
//  assert.deepStrictEqual(
//    cirodown.output_path_parts(
//      'README.ciro',
//      'index',
//      context,
//    ),
//    ['', 'index']
//  );
//});

// Infinite recursion.
// failing https://github.com/cirosantilli/cirodown/issues/34
assert_error('cross reference from header title without ID to following header is not allowed',
  `= \\x[myh2]

== h2
{id=myh2}
`, 1, 5);
assert_error('cross reference from header title without ID to previous header is not allowed',
  `= h1
{id=myh1}

== \\x[myh1]
`, 4, 4);
assert_error('cross reference from image title without ID to previous non-header is not allowed',
  `\\Image[ab]{title=cd}

\\Image[ef]{title=gh \\x[image-cd]}
`, 3, 21, undefined, { filesystem: { ab: '', ef: '' } });
assert_error('cross reference from image title without ID to following non-header is not allowed',
  `\\Image[ab]{title=cd \\x[image-gh]}

\\Image[ef]{title=gh}
`, 1, 23, undefined, { filesystem: { ab: '', ef: '' } });
assert_error('cross reference infinite recursion with explicit IDs fails gracefully',
  `= \\x[h2]
{id=h1}

== \\x[h1]
{id=h2}
`, 1, 3);
assert_convert_ast('cross reference from image to previous header with x content without image ID works',
  `= ab

\\Image[cd]{title=\\x[ab][cd]}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('ab')],
    }),
    a(
      'Image',
      undefined,
      {
        src: [t('cd')],
        title: [a('x', [t('cd')], {'href': [t('ab')]})],
      },
    ),
  ],
  { filesystem: { cd: '' } },
);
assert_convert_ast('cross reference from image to previous header without x content with image ID works',
  `= ab

\\Image[cd]{title=\\x[ab]}{id=cd}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('ab')],
    }),
    a('Image', undefined, {
      id: [t('cd')],
      src: [t('cd')],
      title: [a('x', undefined, {'href': [t('ab')]})],
    }),
  ],
  { filesystem: { cd: '' } },
);
assert_convert_ast('cross reference from image to previous header without x content without image ID works',
  `= ab

\\Image[cd]{title=\\x[ab] cd}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('ab')],
    }),
    a(
      'Image',
      undefined,
      {
        src: [t('cd')],
        title: [
          a('x', undefined, {'href': [t('ab')]}),
          t(' cd')
        ],
      },
      {
        id: 'image-ab-cd',
      }
    ),
  ],
  { filesystem: { cd: '' } },
);
assert_convert_ast('cross reference from image to following header without x content without image id works',
  `= ab

\\Image[cd]{title=ef \\x[gh]}

== gh
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('ab')],
    }),
    a(
      'Image',
      undefined,
      {
        src: [t('cd')],
        title: [
          t('ef '),
          a('x', undefined, {'href': [t('gh')]})
        ],
      },
      {
        id: 'image-ef-gh'
      }
    ),
    a('Toc'),
    a('H', undefined, {
      level: [t('2')],
      title: [t('gh')],
    }),
  ],
  { filesystem: { cd: '' } },
);
assert_error('cross reference with parent to undefined ID does not throw',
  `= aa

\\x[bb]{parent}
`,
  3, 3
);

// Scope.
assert_no_error("internal cross references work with header scope and don't throw",
`= h1

\\x[h2-1/h3-1].

== h2 1
{scope}

\\x[h3-1]

=== h3 1

\\x[h3-2]

\\x[/h2-2]

\\x[h2-2]

==== h4 1
{scope}

===== h5 1
{scope}

=== h3 2

=== h2 2

== h2 2
`
);
assert_convert_ast('scope with parent leading slash conflict resolution',
  `= h1

= h2
{parent=h1}

= h3
{scope}
{parent=h2}

= h2
{parent=h3}

= h4
{parent=h2}

= h4
{parent=/h2}
`, [
  a('H', undefined, {level: [t('1')], title: [t('h1')]}, {id: 'h1'}),
  a('Toc'),
  a('H', undefined, {level: [t('2')], title: [t('h2')]}, {id: 'h2'}),
  a('H', undefined, {level: [t('3')], title: [t('h3')]}, {id: 'h3'}),
  a('H', undefined, {level: [t('4')], title: [t('h2')]}, {id: 'h3/h2'}),
  a('H', undefined, {level: [t('5')], title: [t('h4')]}, {id: 'h3/h4'}),
  a('H', undefined, {level: [t('3')], title: [t('h4')]}, {id: 'h4'}),
]
);
assert_convert_ast('scope with parent breakout with no leading slash',
  `= h1

= h2
{parent=h1}

= h3
{scope}
{parent=h2}

= h4
{parent=h3}

= h5
{parent=h2}
`, [
  a('H', undefined, {level: [t('1')], title: [t('h1')]}, {id: 'h1'}),
  a('Toc'),
  a('H', undefined, {level: [t('2')], title: [t('h2')]}, {id: 'h2'}),
  a('H', undefined, {level: [t('3')], title: [t('h3')]}, {id: 'h3'}),
  a('H', undefined, {level: [t('4')], title: [t('h4')]}, {id: 'h3/h4'}),
  a('H', undefined, {level: [t('3')], title: [t('h5')]}, {id: 'h5'}),
]
);
// https://github.com/cirosantilli/cirodown/issues/120
assert_convert_ast('nested scope with parent',
  `= h1
{scope}

= h1 1
{parent=h1}
{scope}

= h1 1 1
{parent=h1-1}

= h1 1 2
{parent=h1-1}

= h1 1 3
{parent=h1/h1-1}

= h1 2
{parent=h1}
{scope}

= h1 2 1
{parent=h1-2}
{scope}

= h1 2 1 1
{parent=h1-2/h1-2-1}
`, [
  a('H', undefined, {level: [t('1')], title: [t('h1')]}, {id: 'h1'}),
  a('Toc'),
  a('H', undefined, {level: [t('2')], title: [t('h1 1')]}, {id: 'h1/h1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 1')]}, {id: 'h1/h1-1/h1-1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 2')]}, {id: 'h1/h1-1/h1-1-2'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 3')]}, {id: 'h1/h1-1/h1-1-3'}),
  a('H', undefined, {level: [t('2')], title: [t('h1 2')]}, {id: 'h1/h1-2'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 2 1')]}, {id: 'h1/h1-2/h1-2-1'}),
  a('H', undefined, {level: [t('4')], title: [t('h1 2 1 1')]}, {id: 'h1/h1-2/h1-2-1/h1-2-1-1'}),
]
);
assert_convert_ast('nested scope internal cross references resolves progressively',
  `= h1
{scope}

= h1 1
{parent=h1}
{scope}

= h1 1 1
{parent=h1-1}

\\x[h1-1]
`, [
  a('H', undefined, {level: [t('1')], title: [t('h1')]}, {id: 'h1'}),
  a('Toc'),
  a('H', undefined, {level: [t('2')], title: [t('h1 1')]}, {id: 'h1/h1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 1')]}, {id: 'h1/h1-1/h1-1-1'}),
  a('P', [a('x', undefined, {href: [t('h1-1')]})]),
]
);
// https://github.com/cirosantilli/cirodown/issues/100
assert_error('broken parent still generates a header ID',
  `= h1

\\x[h2]

= h2
{parent=reserved-undefined}

`, 6, 1
);
assert_convert_ast('cross reference to toplevel scoped split header',
  `= Notindex
{scope}

== bb

\\x[cc][bb to cc]

\\x[image-bb][bb to image bb]

\\Image[bb.png]{title=bb}

== cc

\\x[image-bb][cc to image bb]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Notindex')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('bb')]}),
    a('P', [a('x', [t('bb to cc')], {href: [t('cc')]})]),
    a('P', [a('x', [t('bb to image bb')], {href: [t('image-bb')]})]),
    a(
      'Image',
      undefined,
      {
        src: [t('bb.png')],
        title: [t('bb')],
      },
    ),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [a('x', [t('cc to image bb')], {href: [t('image-bb')]})]),
  ],
  {
    assert_xpath_matches: [
      // Not `#notindex/image-bb`.
      // https://cirosantilli.com/cirodown#header-scope-argument-of-toplevel-headers
      "//x:a[@href='#image-bb' and text()='bb to image bb']",
    ],
    assert_xpath_split_headers: {
      'notindex/bb.html': [
        "//x:a[@href='../notindex.html#cc' and text()='bb to cc']",
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
      'notindex/cc.html': [
        "//x:a[@href='../notindex.html#image-bb' and text()='cc to image bb']",
      ],
    },
    input_path_noext: 'notindex',
    filesystem: { 'bb.png': '' },
  },
);
// https://github.com/cirosantilli/cirodown/issues/173
assert_convert_ast('cross reference to non-toplevel scoped split header',
  `= tmp

== tmp 2
{scope}

=== tmp 3

\\x[tmp][tmp 3 to tmp]

\\x[tmp-2][tmp 3 to tmp 2]

\\x[tmp-3][tmp 3 to tmp 3]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('tmp')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('tmp 2')]}),
    a('H', undefined, {level: [t('3')], title: [t('tmp 3')]}),
    a('P', [a('x', [t('tmp 3 to tmp')], {href: [t('tmp')]})]),
    a('P', [a('x', [t('tmp 3 to tmp 2')], {href: [t('tmp-2')]})]),
    a('P', [a('x', [t('tmp 3 to tmp 3')], {href: [t('tmp-3')]})]),
  ],
  {
    assert_xpath_split_headers: {
      'tmp-2/tmp-3.html': [
        "//x:a[@href='../tmp.html' and text()='tmp 3 to tmp']",
        "//x:a[@href='../tmp.html#tmp-2' and text()='tmp 3 to tmp 2']",
        "//x:a[@href='../tmp.html#tmp-2/tmp-3' and text()='tmp 3 to tmp 3']",
      ],
    },
    input_path_noext: 'tmp',
  },
);
// https://cirosantilli.com/cirodown#header-scope-argument-of-toplevel-headers
assert_convert_ast('cross reference to non-included file with toplevel scope',
  `\\x[toplevel-scope]

\\x[toplevel-scope/h2]

\\x[toplevel-scope/image-h1][image h1]

\\x[toplevel-scope/image-h2][image h2]
`,
  [
    a('P', [a('x', undefined, {href: [t('toplevel-scope')]})]),
    a('P', [a('x', undefined, {href: [t('toplevel-scope/h2')]})]),
    a('P', [a('x', undefined, {href: [t('toplevel-scope/image-h1')]})]),
    a('P', [a('x', undefined, {href: [t('toplevel-scope/image-h2')]})]),
  ],
  {
    assert_xpath_matches: [
      // Not `toplevel-scope.html#toplevel-scope`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html' and text()='toplevel scope']",
      // Not `toplevel-scope.html#toplevel-scope/h2`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html#h2' and text()='h2']",
    ],
    assert_xpath_split_headers: {
      // TODO https://github.com/cirosantilli/cirodown/issues/139
      //'notindex-split.html': [
      //  "//x:a[@href='toplevel-scope.html#image-h1' and text()='image h1']",
      //  "//x:a[@href='toplevel-scope/h2.html#image-h2' and text()='image h2']",
      //],
    },
    convert_before: ['toplevel-scope.ciro'],
    input_path_noext: 'notindex',
    filesystem: {
      'toplevel-scope.ciro': `= Toplevel scope
{scope}

\\Image[h1.png]{title=h1}

== h2

\\Image[h2.png]{title=h2}
`
    }
  }
);
assert_convert_ast('toplevel scope gets removed from IDs in the file',
  `= Notindex
{scope}

\\x[notindex][link to notindex]

\\x[h2][link to h2]

== h2
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Notindex')]}),
    a('P', [a('x', undefined, {href: [t('notindex')]})]),
    a('P', [a('x', undefined, {href: [t('h2')]})]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('h2')]}),
  ],
  {
    assert_xpath_matches: [
      xpath_header(1, 'notindex'),
      "//x:div[@class='p']//x:a[@href='' and text()='link to notindex']",
      "//x:div[@class='p']//x:a[@href='#h2' and text()='link to h2']",
      xpath_header(2, 'h2'),
    ],
  }
);

// Headers.
assert_convert_ast('header simple',
  `\\H[1][My header]

\\H[2][My header 2]

\\H[3][My header 3]

\\H[4][My header 4]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('My header')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('My header 2')]}),
    a('H', undefined, {level: [t('3')], title: [t('My header 3')]}),
    a('H', undefined, {level: [t('4')], title: [t('My header 4')]}),
  ],
  {
    assert_xpath_matches: [
      // The toplevel header does not have any numerical prefix, e.g. "1. My header",
      // it is just "My header".
      xpath_header(1, 'notindex', "x:a[@href='' and text()='My header']"),
      xpath_header(2, 'my-header-2', "x:a[@href='#my-header-2' and text()='1. My header 2']"),
    ],
    assert_xpath_split_headers: {
      'my-header-2.html': [
        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'my-header-2', "x:a[@href='' and text()='My header 2']"),
      ],
      'my-header-3.html': [
        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'my-header-3', "x:a[@href='' and text()='My header 3']"),
      ],
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('header and implicit paragraphs',
  `\\H[1][My header 1]

My paragraph 1.

\\H[2][My header 2]

My paragraph 2.
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('My header 1')]}),
    a('P', [t('My paragraph 1.')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('My header 2')]}),
    a('P', [t('My paragraph 2.')]),
  ]
);
const header_7_expect = [
  a('H', undefined, {level: [t('1')], title: [t('1')]}),
  a('Toc'),
  a('H', undefined, {level: [t('2')], title: [t('2')]}),
  a('H', undefined, {level: [t('3')], title: [t('3')]}),
  a('H', undefined, {level: [t('4')], title: [t('4')]}),
  a('H', undefined, {level: [t('5')], title: [t('5')]}),
  a('H', undefined, {level: [t('6')], title: [t('6')]}),
  a('H', undefined, {level: [t('7')], title: [t('7')]}),
];
assert_convert_ast('header 7 sane',
  `\\H[1][1]

\\H[2][2]

\\H[3][3]

\\H[4][4]

\\H[5][5]

\\H[6][6]

\\H[7][7]
`,
  header_7_expect
);
// https://github.com/cirosantilli/cirodown/issues/32
assert_convert_ast('header 7 insane',
  `= 1

== 2

=== 3

==== 4

===== 5

====== 6

======= 7
`,
  header_7_expect
);
assert_convert_ast('header 7 parent',
  `= 1

= 2
{parent=1}

= 3
{parent=2}

= 4
{parent=3}

= 5
{parent=4}

= 6
{parent=5}

= 7
{parent=6}
`,
  header_7_expect
);
assert_error('header with parent argument must have level equal 1',
  `= 1

== 2
{parent=1}
`,
  3, 1
);
assert_error('header parent cannot be an older id of a level',
  `= 1

== 2

== 2 2

= 3
{parent=2}
`,
  8, 1
);
assert_error('header child argument to id that does not exist gives an error',
  `= 1
{child=2}
{child=3}

== 2
`,
  3, 1
);
assert_error('header tag argument to id that does not exist gives an error',
  `= 1
{tag=2}
{tag=3}

== 2
`,
  3, 1
);
// This almost worked, but "Other children" links were not showing.
// Either we support it fully, or it blows up clearly, this immediately
// confused me a bit on cirosantilli.com.
assert_error('header child and synonym arguments are incompatible',
  `= 1

= 1 2
{synonym}
{child=2}

== 2
`,
  5, 1
);
assert_error('header tag and synonym arguments are incompatible',
  `= 1

= 1 2
{synonym}
{tag=2}

== 2
`,
  5, 1
);
const header_id_new_line_expect =
  [a('H', undefined, {level: [t('1')], title: [t('aa')], id: [t('bb')]})];
assert_convert_ast('header id new line sane',
  '\\H[1][aa]\n{id=bb}',
  header_id_new_line_expect,
);
assert_convert_ast('header id new line insane no trailing elment',
  '= aa\n{id=bb}',
  header_id_new_line_expect,
);
assert_convert_ast('header id new line insane trailing element',
  '= aa \\c[bb]\n{id=cc}',
  [a('H', undefined, {
      level: [t('1')],
      title: [
        t('aa '),
        a('c', [t('bb')]),
      ],
      id: [t('cc')],
  })],
);
assert_error('header level must be an integer', '\\H[a][b]\n', 1, 3);
assert_error('non integer h2 header level in a document with a toc does not throw',
  `\\H[1][h1]

\\Toc

\\H[][h2 1]

\\H[2][h2 2]

\\H[][h2 3]
`, 5, 3);
assert_error('non integer h1 header level a in a document with a toc does not throw',
  `\\H[][h1]

\\Toc
`, 1, 3);
assert_error('header must be an integer empty', '\\H[][b]\n', 1, 3);
assert_error('header must not be zero', '\\H[0][b]\n', 1, 3);
assert_error('header skip level is an error', '\\H[1][a]\n\n\\H[3][b]\n', 3, 3);
const header_numbered_input = `= tmp

\\Q[
\\x[tmp]{full}

\\x[tmp-2]{full}

\\x[tmp-3]{full}

\\x[tmp-4]{full}

\\x[tmp-5]{full}

\\x[tmp-6]{full}

\\x[tmp-7]{full}

\\x[tmp-8]{full}
]

== tmp 2

=== tmp 3
{numbered=0}

==== tmp 4

===== tmp 5

====== tmp 6
{numbered}

======= tmp 7

======== tmp 8

== tmp 2 2

=== tmp 2 2 3
`
assert_convert_ast('header numbered argument',
  header_numbered_input,
  undefined,
  {
    assert_xpath_matches: [
      "//x:blockquote//x:a[@href='#tmp-2' and text()='Section 1. \"tmp 2\"']",
      "//x:blockquote//x:a[@href='#tmp-4' and text()='Section \"tmp 4\"']",
      "//x:blockquote//x:a[@href='#tmp-8' and text()='Section 1.1. \"tmp 8\"']",
      "//*[@id='toc']//x:a[@href='#tmp-2' and text()='1. tmp 2']",
      "//*[@id='toc']//x:a[@href='#tmp-3' and text()='1.1. tmp 3']",
      "//*[@id='toc']//x:a[@href='#tmp-4' and text()='tmp 4']",
      "//*[@id='toc']//x:a[@href='#tmp-5' and text()='tmp 5']",
      "//*[@id='toc']//x:a[@href='#tmp-6' and text()='tmp 6']",
      "//*[@id='toc']//x:a[@href='#tmp-7' and text()='1. tmp 7']",
      "//*[@id='toc']//x:a[@href='#tmp-8' and text()='1.1. tmp 8']",
      "//*[@id='toc']//x:a[@href='#tmp-2-2' and text()='2. tmp 2 2']",
      "//*[@id='toc']//x:a[@href='#tmp-2-2-3' and text()='2.1. tmp 2 2 3']",
    ],
    assert_xpath_split_headers: {
      'tmp-6.html': [
        "//*[@id='toc']//x:a[@href='tmp-7.html' and text()='1. tmp 7']",
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1. tmp 8']",
      ],
    },
  },
);
assert_convert_ast('header numbered cirodown.json',
  header_numbered_input,
  undefined,
  {
    assert_xpath_matches: [
      "//x:blockquote//x:a[@href='#tmp-2' and text()='Section \"tmp 2\"']",
      "//x:blockquote//x:a[@href='#tmp-4' and text()='Section \"tmp 4\"']",
      "//x:blockquote//x:a[@href='#tmp-8' and text()='Section 1.1. \"tmp 8\"']",
      "//*[@id='toc']//x:a[@href='#tmp-2' and text()='tmp 2']",
      "//*[@id='toc']//x:a[@href='#tmp-3' and text()='tmp 3']",
      "//*[@id='toc']//x:a[@href='#tmp-4' and text()='tmp 4']",
      "//*[@id='toc']//x:a[@href='#tmp-5' and text()='tmp 5']",
      "//*[@id='toc']//x:a[@href='#tmp-6' and text()='tmp 6']",
      "//*[@id='toc']//x:a[@href='#tmp-7' and text()='1. tmp 7']",
      "//*[@id='toc']//x:a[@href='#tmp-8' and text()='1.1. tmp 8']",
      "//*[@id='toc']//x:a[@href='#tmp-2-2' and text()='tmp 2 2']",
      "//*[@id='toc']//x:a[@href='#tmp-2-2-3' and text()='tmp 2 2 3']",
    ],
    assert_xpath_split_headers: {
      'tmp-6.html': [
        "//*[@id='toc']//x:a[@href='tmp-7.html' and text()='1. tmp 7']",
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1. tmp 8']",
      ],
    },
    extra_convert_opts: { cirodown_json: { numbered: false } }
  },
);
assert_convert_ast('header file argument works',
  `= h1

== path/to/my-file.txt
{file}

My txt

== path/to/my-file.png
{file}

My png

== path/to/my-file.mp4
{file}

My mp4

== Path to YouTube
{file=https://www.youtube.com/watch?v=YeFzeNAHEhU}

My youtube
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.txt')]}),
    a('P', [t('My txt')]),
    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.png')]}),
    a('P', [t('My png')]),
    a('Image', undefined, {src: [t('path/to/my-file.png')]}),
    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.mp4')]}),
    a('P', [t('My mp4')]),
    a('Video', undefined, {src: [t('path/to/my-file.mp4')]}),
    a('H', undefined, {level: [t('2')], title: [t('Path to YouTube')]}),
    a('P', [t('My youtube')]),
    a('Video', undefined, {src: [t('https://www.youtube.com/watch?v=YeFzeNAHEhU')]}),
  ],
  {
    filesystem: {
      'path/to/my-file.txt': '',
      'path/to/my-file.png': '',
      'path/to/my-file.mp4': '',
    },
  },
);
assert_convert_ast('header file argument that is the last header adds the preview',
  `= h1

== path/to/my-file.png
{file}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.png')]}),
    a('Image', undefined, {src: [t('path/to/my-file.png')]}),
  ],
  {
    filesystem: {
      'path/to/my-file.txt': '',
      'path/to/my-file.png': '',
      'path/to/my-file.mp4': '',
    },
  },
);
assert_error('header file argument to a file that does not exist give an error',
  `= h1

== dont-exist
{file}
`, 3, 1);

// Code.
assert_convert_ast('code inline sane',
  'a \\c[b c] d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('b c')]),
      t(' d'),
    ]),
  ],
);
assert_convert_ast('code inline insane simple',
  'a `b c` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('b c')]),
      t(' d'),
    ]),
  ]
);
// https://github.com/cirosantilli/cirodown/issues/171
assert_convert_ast('code inline insane with only a backslash',
  'a `\\` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('\\')]),
      t(' d'),
    ]),
  ]
);
assert_convert_ast('code inline insane escape backtick',
  'a \\`b c\n',
  [a('P', [t('a `b c')])]
);
assert_convert_ast('code block sane',
  `a

\\C[[
b
c
]]

d
`,
  [
    a('P', [t('a')]),
    a('C', [t('b\nc\n')]),
    a('P', [t('d')]),
  ]
);
assert_convert_ast('code block insane',
  `a

\`\`
b
c
\`\`

d
`,
  [
    a('P', [t('a')]),
    a('C', [t('b\nc\n')]),
    a('P', [t('d')]),
  ]
);
assert_convert_ast('code with id has caption',
  `\`\`
aa
\`\`
{id=bb}
`,
  [
    a('C', [t('aa\n')], { id: [t('bb')] }, { id: 'bb'} ),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_convert_ast('code with title has caption',
  `\`\`
aa
\`\`
{title=b b}
`,
  [
    a('C', [t('aa\n')], { title: [t('b b')] }, { id: 'code-b-b'} ),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_convert_ast('code with description has caption',
  `\`\`
aa
\`\`
{description=b b}
`,
  [
    a('C', [t('aa\n')], { description: [t('b b')] }, { id: '_1'} ),
  ],
  {
    assert_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_convert_ast('code without id, title, nor description does not have caption',
  `\`\`
aa
\`\`
`,
  [
    a('C', [t('aa\n')], {}, { id: '_1'} ),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
)
assert_convert_ast('code without id, title, nor description does not increment the code count',
  `\`\`
aa
\`\`
{id=00}

\`\`
bb
\`\`

\`\`
cc
\`\`
{id=22}
`,
  [
    a('C', [t('aa\n')], { id: [t('00')] }, { id: '00'} ),
    a('C', [t('bb\n')], {}, { id: '_1'} ),
    a('C', [t('cc\n')], { id: [t('22')] }, { id: '22'} ),
  ],
  {
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
      "//x:span[@class='caption-prefix' and text()='Code 2']",
    ],
    assert_not_xpath_matches: [
      "//x:span[@class='caption-prefix' and text()='Code 3']",
    ],
  },
)

// lint h-parent
assert_no_error('header parent works with cirodown.json lint h-parent equal parent and no includes',
  `= 1

= 2
{parent=1}
`,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_error('header number fails with cirodown.json lint h-parent = parent',
  `= 1

== 2
`,
  3, 1, undefined,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_no_error('header number works with cirodown.json lint h-parent = number',
  `= 1

== 2
`,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-parent': 'number', } } } }
);
assert_error('header parent fails with cirodown.json lint h-parent = number',
  `= 1

= 2
{parent=1}
`,
  3, 1, undefined,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-parent': 'number', } } } }
);
assert_no_error('header parent works with cirodown.json lint h-parent equal parent and includes with parent',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels-parent]
`,
  {
    extra_convert_opts: {
      cirodown_json: { lint: { 'h-parent': 'parent', } },
      embed_includes: true,
    }
  }
);
assert_error('header parent fails with cirodown.json lint h-parent equal parent and includes with number',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels]
`,
  5, 1, 'include-two-levels.ciro',
  {
    extra_convert_opts: {
      cirodown_json: { lint: { 'h-parent': 'parent', } },
      embed_includes: true,
    }
  }
);
// lint h-tag
assert_error('lint h-tag child failure',
  `= 1
{tag=2}

== 2
`,
  2, 1, undefined,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-tag': 'child', } } } }
);
assert_no_error('lint h-tag child pass',
  `= 1
{child=2}

== 2
`,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-tag': 'child', } } } }
);
assert_error('lint h-tag tag failure',
  `= 1
{child=2}

== 2
`,
  2, 1, undefined,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-tag': 'tag', } } } }
);
assert_no_error('lint h-tag child pass',
  `= 1
{tag=2}

== 2
`,
  { extra_convert_opts: { cirodown_json: { lint: { 'h-tag': 'tag', } } } }
);

// Toc
assert_convert_ast('second explicit toc is removed',
  `a

\\Toc

b

\\Toc
`,
[
  a('P', [t('a')]),
  a('Toc'),
  a('P', [t('b')]),
]
);
assert_convert_ast('implicit toc after explcit toc is removed',
  `= aa

bb

\\Toc

cc

== dd
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('P', [t('cc')]),
    a('H', undefined, {level: [t('2')], title: [t('dd')]}),
]
);
assert_convert_ast('explicit toc after implicit toc is removed',
  `= aa

bb

== cc

\\Toc

`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
]
);
// https://github.com/cirosantilli/cirodown/issues/143
assert_convert_ast('header with insane paragraph in the content does not blow up',
  `\\H[1][a

b]
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [
        a('P', [t('a')]),
        a('P', [t('b')]),
      ]
    },
      { id: 'a-b' }
    )
  ]
);
assert_convert_ast('explicit toc after implicit toc is removed',
  `= aa

bb

== cc

\\Toc

`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
]
);
assert_convert_ast('xss: H id',
  `= tmp
{id=&<>"'}
`,
  undefined,
  {
    assert_xpath_matches: [
      "//x:div[@class=\"h\" and @id=concat('&<>\"', \"'\")]",
    ]
  }
);

// Table of contents
assert_convert_ast('split headers have correct table of contents',
  `= h1

== h1 1

== h1 2

=== h1 2 1

==== h1 2 1 1
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('h1 1')]}),
    a('H', undefined, {level: [t('2')], title: [t('h1 2')]}),
    a('H', undefined, {level: [t('3')], title: [t('h1 2 1')]}),
    a('H', undefined, {level: [t('4')], title: [t('h1 2 1 1')]}),
  ],
  {
    assert_xpath_matches: [
      // There is a self-link to the Toc.
      "//*[@id='toc']",
      "//*[@id='toc']//x:a[@href='#toc' and text()='Table of contents']",

      // ToC links have parent toc entry links.
      // Toplevel entries point to the ToC toplevel.
      `//*[@id='toc']//*[@id='toc-h1-1']//x:a[@href='#toc' and text()='${cirodown.PARENT_MARKER} \"h1\"']`,
      `//*[@id='toc']//*[@id='toc-h1-2']//x:a[@href='#toc' and text()='${cirodown.PARENT_MARKER} \"h1\"']`,
      // Inner entries point to their parent entries.
      `//*[@id='toc']//*[@id='toc-h1-2-1']//x:a[@href='#toc-h1-2' and text()='${cirodown.PARENT_MARKER} \"h1 2\"']`,

      // The ToC numbers look OK.
      "//*[@id='toc']//x:a[@href='#h1-2' and text()='2. h1 2']",

      // The headers have ToC links.
      `${xpath_header(2, 'h1-1')}//x:a[@href='#toc-h1-1' and text()='\u21d1 toc']`,
      `${xpath_header(2, 'h1-2')}//x:a[@href='#toc-h1-2' and text()='\u21d1 toc']`,
      `${xpath_header(3, 'h1-2-1')}//x:a[@href='#toc-h1-2-1' and text()='\u21d1 toc']`,

      // Descendant count.
      "//*[@id='toc']//*[@class='title-div']//*[@class='descendant-count' and text()='4']",
      "//*[@id='toc']//*[@id='toc-h1-2']//*[@class='descendant-count' and text()='2']",
    ],
    assert_xpath_split_headers: {
      'notindex-split.html': [
        // Split output files get their own ToCs.
        "//*[@id='toc']",
        "//*[@id='toc']//x:a[@href='#toc' and text()='Table of contents']",
      ],
      'h1-2.html': [
        // Split output files get their own ToCs.
        "//*[@id='toc']",
        "//*[@id='toc']//x:a[@href='#toc' and text()='Table of contents']",

        // The Toc entries of split output headers automatically cull out a level
        // of the full number tree. E.g this entry is `2.1` on the toplevel ToC,
        // but on this sub-ToC it is just `1.`.
        "//*[@id='toc']//x:a[@href='h1-2-1.html' and text()='1. h1 2 1']",
        "//*[@id='toc']//x:a[@href='h1-2-1-1.html' and text()='1.1. h1 2 1 1']",

        // ToC links in split headers have parent toc entry links.
        `//*[@id='toc']//*[@id='toc-h1-2-1']//x:a[@href='#toc' and text()='${cirodown.PARENT_MARKER} \"h1 2\"']`,
        `//*[@id='toc']//*[@id='toc-h1-2-1-1']//x:a[@href='#toc-h1-2-1' and text()='${cirodown.PARENT_MARKER} \"h1 2 1\"']`,

        // Descendant count.
        "//*[@id='toc']//*[@class='title-div']//*[@class='descendant-count' and text()='2']",
        "//*[@id='toc']//*[@id='toc-h1-2-1']//*[@class='descendant-count' and text()='1']",
      ],
    },
    assert_not_xpath_split_headers: {
      // A node without no children headers has no ToC,
      // as it would just be empty and waste space.
      'h1-2-1-1.html': ["//*[text()='Table of contents']"],
    },
    input_path_noext: 'notindex',
  },
);
assert_error('toc is a reserved id',
  `= h1

== toc
`,
  3, 1);

// Math. Minimal testing since this is mostly factored out with code tests.
assert_convert_ast('math inline sane',
  '\\m[[\\sqrt{1 + 1}]]\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
);
assert_convert_ast('math inline insane simple',
  '$\\sqrt{1 + 1}$\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
);
assert_convert_ast('math inline escape dollar',
  'a \\$b c\n',
  [a('P', [t('a $b c')])],
);
assert_no_error('math block sane',
  '\\M[[\\sqrt{1 + 1}]]',
  [a('M', [t('\\sqrt{1 + 1}')])],
);
assert_no_error('math block insane',
  '$$\\sqrt{1 + 1}$$',
  [a('M', [t('\\sqrt{1 + 1}')])],
);
assert_error('math undefined macro', '\\m[[\\reserved_undefined]]', 1, 3);

// Include.
const include_opts = {extra_convert_opts: {
  embed_includes: true,
}};
const include_two_levels_ast_args = [
  a('H', undefined, {level: [t('2')], title: [t('ee')]}),
  a('P', [t('ff')]),
  a('H', undefined, {level: [t('3')], title: [t('gg')]}),
  a('P', [t('hh')]),
]
assert_convert_ast('include simple with paragraph with embed',
  `= aa

bb

\\Include[include-one-level-1]

\\Include[include-one-level-2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [t('ff')]),
  ],
  include_opts
);
assert_convert_ast('include parent argument with embed',
  `= h1

== h2

\\Include[include-one-level-1]{parent=h1}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('h2')]}),
    // This is level 2, not three, since it's parent is h1.
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ],
  include_opts
);
assert_error('include parent argument to old ID fails gracefully',
  `= h1

== h2

== h2 2

\\Include[include-one-level-1]{parent=h2}
`,
  7, 30, undefined, include_opts,
);
assert_convert_ast('include simple without parent in the include with embed',
  `= aa

bb

\\Include[include-two-levels]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [t('ff')]),
    a('H', undefined, {level: [t('3')], title: [t('gg')]}),
    a('P', [t('hh')]),
  ],
  include_opts
);
assert_convert_ast('include simple with parent in the include with embed',
  `= aa

bb

\\Include[include-two-levels-parent]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('Include two levels parent')]}),
    a('P', [t('h1 content')]),
    a('H', undefined, {level: [t('3')], title: [t('Include two levels parent h2')]}),
    a('P', [t('h2 content')]),
  ],
  include_opts
);
assert_convert_ast('include simple with paragraph with no embed',
  `= aa

bb

\\Include[include-two-levels]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [
      a(
        'x',
        [t('This section is present in another page, follow this link to view it.')],
        {'href': [t('include-two-levels')]}
      ),
    ]),
  ],
  {
    convert_before: ['include-two-levels.ciro'],
  },
);
// https://github.com/cirosantilli/cirodown/issues/74
assert_convert_ast('cross reference to embed include header',
  `= aa

\\x[include-two-levels]

\\x[gg]

\\Include[include-two-levels]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [
      a('x', undefined, {href: [t('include-two-levels')]}),
    ]),
    a('P', [
      a('x', undefined, {href: [t('gg')]}),
    ]),
    a('Toc'),
  ].concat(include_two_levels_ast_args),
  Object.assign({
    assert_xpath_matches: [
      "//x:div[@class='p']//x:a[@href='#include-two-levels' and text()='ee']",
      "//x:div[@class='p']//x:a[@href='#gg' and text()='gg']",
    ]},
    include_opts
  ),
);
assert_convert_ast('include multilevel with paragraph',
  `= aa

bb

\\Include[include-two-levels]

\\Include[include-one-level-1]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
  ].concat(include_two_levels_ast_args)
  .concat([
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ]),
  include_opts
);
// https://github.com/cirosantilli/cirodown/issues/35
assert_convert_ast('include simple no paragraph',
  `= aa

bb

\\Include[include-one-level-1]
\\Include[include-one-level-2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [t('ff')]),
  ],
  include_opts
);
assert_convert_ast('include multilevel no paragraph',
  `= aa

bb

\\Include[include-two-levels]
\\Include[include-one-level-1]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('Toc'),
  ].concat(include_two_levels_ast_args)
  .concat([
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ]),
  include_opts
);
// https://github.com/cirosantilli/cirodown/issues/23
assert_error('include with error',
  `= aa

bb

\\Include[include-with-error]
`,
  3, 1, 'include-with-error.ciro',
  include_opts
);

const circular_entry = `= notindex

\\Include[include-circular]
`;
assert_error('include circular dependency 1 <-> 2',
  circular_entry,
  // TODO works from CLI call......... fuck, why.
  // Similar problem as in test below.
  //3, 1, 'include-circular.ciro',
  undefined, undefined, undefined,
  {
    extra_convert_opts: {
      embed_includes: true,
      input_path_noext: 'notindex',
    },
    has_error: true,
    filesystem: {
      'notindex.ciro': circular_entry,
      'include-circular.ciro': `= include-circular

\\Include[notindex]
`
    }
  }
);
// TODO error this is legitimately failing on CLI, bad error messages show
// up on CLI reproduction.
// The root problem is that include_path_set does not contain
// include-circular-2.ciro, and that leads to several:
// ```
// file not found on database: "${target_input_path}", needed for toplevel scope removal
// on ToC conversion.
assert_error('include circular dependency 1 -> 2 <-> 3',
  `= aa

\\Include[include-circular-1]
`,
  // 3, 1, 'include-circular-2.ciro',
  undefined, undefined, undefined,
  cirodown.clone_and_set(include_opts, 'has_error', true)
);
// TODO https://github.com/cirosantilli/cirodown/issues/73
//assert_convert_ast('include without parent header',
//  '\\Include[include-one-level-1]',
//  [
//    a('H', undefined, {level: [t('1')], title: [t('cc')]}),
//    a('P', [t('dd')]),
//  ],
//  include_opts
//);

// CirodownExample
assert_convert_ast('CirodownExample basic',
  `\\CirodownExample[[aa \\i[bb] cc]]`,
  [
    // TODO get rid of this paragaraph.
    a('P', [
      a('C', [t('aa \\i[bb] cc')]),
      a('P', [t('which renders as:')]),
      a('Q', [
        // TODO get rid of this paragaraph.
        a('P', [
          t('aa '),
          a('i', [t('bb')]),
          t(' cc'),
        ])
      ]),
    ])
  ],
);
assert_convert_ast('CirodownExample that links to id in another file',
  `\\CirodownExample[[\\x[notindex\\]]]`,
  undefined,
  {
    assert_xpath_matches: [
      "//x:a[@href='notindex.html' and text()='notindex h1']",
    ],
    convert_before: ['notindex.ciro'],
    filesystem: {
     'notindex.ciro': `= notindex h1
`,
    },
    input_path_noext: 'abc',
  },
);

// ID auto-gneration.
// https://cirosantilli.com/cirodown/automatic-id-from-title
assert_convert_ast('id autogeneration without title',
  '\\P[aa]\n',
  [a('P', [t('aa')], {}, {id: '_1'})],
);
assert_error('id conflict with previous autogenerated id',
  `\\P[aa]

\\P[bb]{id=_1}`,
  3, 1
);
assert_error('id conflict with later autogenerated id',
  `\\P[aa]{id=_1}

\\P[bb]`,
  3, 1
);
// https://github.com/cirosantilli/cirodown/issues/4
assert_convert_ast('id autogeneration nested',
  '\\Q[\\P[aa]]\n\n\\P[bb]\n',
  [
    a('Q', [
        a('P', [t('aa')], {}, {id: '_2'})
      ],
      {},
      {id: '_1'}
    ),
    a('P', [t('bb')], {}, {id: '_3'}),
  ],
);
assert_convert_ast('id autogeneration unicode normalize',
  `= 0A.你ÉŁŒy++z

\\x[0a-你eloey-plus-plus-z]
`,
  [
    a('H', undefined, {title: [t('0A.你ÉŁŒy++z')]}, {id: '0a-你eloey-plus-plus-z'}),
    a('P', [
      a('x', undefined, {href: [t('0a-你eloey-plus-plus-z')]})
    ])
  ],
);
assert_convert_ast('id autogeneration unicode no normalize',
  `= 0A.你ÉŁŒy++z

\\x[0a-你éłœy-z]
`,
  [
    a('H', undefined, {title: [t('0A.你ÉŁŒy++z')]}, {id: '0a-你éłœy-z'}),
    a('P', [
      a('x', undefined, {href: [t('0a-你éłœy-z')]})
    ])
  ],
  { extra_convert_opts: { cirodown_json: { id: { normalize: { latin: false, punctuation: false } } } } }
);
assert_convert_ast('id autogeneration with disambiguate',
  `= ab
{disambiguate=cd}

\\x[ab-cd]
`,
  [
    a('H', undefined, {title: [t('ab')], disambiguate: [t('cd')]}, {id: 'ab-cd'}),
    a('P', [
      a('x', undefined, {href: [t('ab-cd')]})
    ])
  ],
);
assert_error('id autogeneration with undefined reference in title fails gracefully',
  `= \\x[reserved_undefined]
`, 1, 5);
// https://github.com/cirosantilli/cirodown/issues/45
assert_convert_ast('id autogeneration with nested elements does an id conversion and works',
  `= ab \`cd\` ef

\\x[ab-cd-ef]
`,
  [
    a(
      'H',
      undefined,
      {
        level: [t('1')],
        title: [
          t('ab '),
          a('c', [t('cd')]),
          t(' ef'),
        ],
      },
      {
        id: 'ab-cd-ef',
      }
    ),
    a('P', [
      a('x', undefined, { href: [t('ab-cd-ef')]}),
    ]),
  ]
);

// ID conflicts.
assert_error('id conflict with previous id on the same file',
  `= tmp
{id=tmp}

== tmp
`,
  4, 1, 'index.ciro',
  {
    error_message: cirodown.duplicate_id_error_message('tmp', 'index.ciro', 1, 1),
    input_path_noext: 'index',
  },
);
assert_error('id conflict with previous id on another file',
  `= index

== notindex h2
`,
  3, 1, 'index.ciro',
  {
    convert_before: ['notindex.ciro'],
    error_message: cirodown.duplicate_id_error_message('notindex-h2', 'notindex.ciro', 3, 1),
    filesystem: {
     'notindex.ciro': `= notindex

== notindex h2
`,
    },
    input_path_noext: 'index'
  }
);

// title_to_id
assert_equal('title_to_id with hyphen', cirodown.title_to_id('.0A. - z.a Z..'), '0a-z-a-z');
assert_equal('title_to_id with unicode chars', cirodown.title_to_id('0A.你好z'), '0a-你好z');

// Toplevel.
assert_convert_ast('toplevel arguments',
  `{title=aaa}

bbb
`,
  a('Toplevel', [a('P', [t('bbb')])], {'title': [t('aaa')]}),
  {toplevel: true}
);
assert_error('toplevel explicit content',
  `[]`, 1, 1,
);
// https://github.com/cirosantilli/cirodown/issues/10
assert_error('explicit toplevel macro',
  `\\toplevel`, 1, 1,
);

// split_headers
// A split headers hello world.
assert_convert_ast('one paragraph implicit split headers',
  'ab\n',
  [a('P', [t('ab')])],
  {
    extra_convert_opts: {split_headers: true},
    input_path_noext: 'notindex',
  }
);
function assert_split_header_output_keys(description, options, keys_expect) {
  it(description, async ()=>{
    const input_string = `= h1

== h1 1

== h1 1 1

== h1 1 2

== h1 2

== h1 2 1

== h1 2 2
`
    const new_options = Object.assign({
      split_headers: true,
      file_provider: new MockFileProvider(),
    }, options);
    const extra_returns = {};
    await cirodown.convert(
      input_string,
      new_options,
      extra_returns
    );
    assert.deepStrictEqual(
      Object.keys(extra_returns.rendered_outputs),
      keys_expect
    )
  });
}
assert_split_header_output_keys(
  'split headers returns the expected header to output keys with input_path and no toplevel_id on notindex',
  {
    input_path: 'notindex' + cirodown.CIRODOWN_EXT
  },
  [
    'notindex.html',
    'notindex-split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
  ]
)
assert_split_header_output_keys(
  'split headers returns the expected header to output keys with input_path and toplevel_id on notindex',
  {
    input_path: 'notindex' + cirodown.CIRODOWN_EXT,
    toplevel_id: 'notindex'
  },
  [
    'notindex.html',
    'notindex-split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
  ]
)
assert_split_header_output_keys(
  'split headers returns the expected header to output keys with input_path and no toplevel_id on index',
  {
    input_path: cirodown.INDEX_BASENAME_NOEXT + cirodown.CIRODOWN_EXT
  },
  [
    cirodown.INDEX_BASENAME_NOEXT + '.html',
    'split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
  ]
)

// Errors. Check that they return gracefully with the error line number,
// rather than blowing up an exception, or worse, not blowing up at all!
assert_error('backslash without macro', '\\ a', 1, 1);
assert_error('unknown macro without args', '\\reserved_undefined', 1, 1);
assert_error('unknown macro with positional arg', '\\reserved_undefined[aa]', 1, 1);
assert_error('unknown macro with named arg', '\\reserved_undefined{aa=bb}', 1, 1);
assert_error('too many positional arguments', '\\P[ab][cd]', 1, 7);
assert_error('unknown named macro argument', '\\c{reserved_undefined=abc}[]', 1, 4);
assert_error('missing mandatory positional argument href of a', '\\a', 1, 1);
assert_error('missing mandatory positional argument level of h', '\\H', 1, 1);
assert_error('stray open positional argument start', 'a[b\n', 1, 2);
assert_error('stray open named argument start', 'a{b\n', 1, 2);
assert_error('argument without close empty', '\\c[\n', 1, 3);
assert_error('argument without close nonempty', '\\c[ab\n', 1, 3);
assert_error('stray positional argument end', 'a]b', 1, 2);
assert_error('stray named argument end}', 'a}b', 1, 2);
assert_error('unterminated literal positional argument', '\\c[[\n', 1, 3);
assert_error('unterminated literal named argument', '\\c{{id=\n', 1, 3);
assert_error('unterminated insane inline code', '`\n', 1, 1);

// cirodown executable tests.
assert_executable(
  'executable: input from stdin produces output on stdout',
  {
    stdin: 'aabb',
    expect_not_exists: ['out'],
    expect_stdout_xpath: ["//x:div[@class='p' and text()='aabb']"],
  }
);
assert_executable(
  // Was blowing up on file existence check.
  'executable: input from stdin with relative link does not blow up',
  {
    stdin: '\\a[asdf]',
    expect_not_exists: ['out'],
    expect_stdout_xpath: ["//x:a[@href='asdf']"],
    filesystem: { 'asdf': '' },
  }
);
assert_executable(
  'executable: input from file produces an output file',
  {
    args: ['notindex.ciro'],
    filesystem: {
      'notindex.ciro': `= Notindex\n`,
    },
    expect_filesystem_xpath: {
      'notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
const complex_filesystem = {
  'README.ciro': `= Index

\\x[notindex][link to notindex]

\\x[h2]{full}

\\x[notindex-h2][link to notindex h2]

\\x[has-split-suffix][link to has split suffix]

\\x[toplevel-scope]

\\x[toplevel-scope/toplevel-scope-h2]

\\x[subdir][link to subdir]

\\x[subdir/index-h2][link to subdir index h2]

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]

\\x[included-by-index][link to included by index]

$$
\\newcommand{\\mycmd}[0]{hello}
$$

\\CirodownExample[[
\\Q[A Cirodown example!]
]]

\\Include[included-by-index]

== h2

$$
\\mycmd
$$

\\Include[included-by-h2-in-index]

== h2 2

\\x[h2]{full}

\\x[h4-3-2-1]{full}

=== h3 2 1

\\x[h4-3-2-1]{full}

== h2 3

\\x[h4-3-2-1]{full}

=== h3 3 1

=== h3 3 2

==== h4 3 2 1

== Index scope
{scope}

=== Index scope child

=== Index scope 2
{scope}

== Has split suffix
{splitSuffix}
`,
  'notindex.ciro': `= Notindex

\\x[index][link to index]

\\x[h2][link to h2]

== notindex h2

= notindex h2 synonym
{synonym}
`,
  'toplevel-scope.ciro': `= Toplevel scope
{scope}

== Toplevel scope h2

= Toplevel scope h2 synonym
{synonym}

== Nested scope
{scope}

=== Nested scope 2
{scope}
`,
  'included-by-index.ciro': `= Included by index

== Included by index h2
`,
  'included-by-h2-in-index.ciro': `= Included by h2 in index

== Included by h2 in index h2
`,
  'notindex-splitsuffix.ciro': `= Notindex splitsuffix
{splitSuffix=asdf}
`,
  'scss.scss': `body { color: red }`,
  'cirodown.json': `{}\n`,
  'subdir/index.ciro': `= Subdir index

\\x[index][link to toplevel]

\\x[h2][link to toplevel subheader]

\\Include[subdir/included-by-subdir-index]

== Scope
{scope}

=== h3

\\x[scope][scope/h3 to scope]

\\x[h3][scope/h3 to scope/h3]

== Index h2
`,
  'subdir/notindex.ciro': `= Subdir notindex

== Notindex h2

== Notindex scope
{scope}

=== h3
`,
  'subdir/included-by-subdir-index.ciro': `= Included by subdir index

== Included by subdir index h2
`,
  'subdir/myfile.txt': `Hello world

Goodbye world.
`,
};
assert_executable(
  'executable: input from directory with cirodown.json produces several output files',
  {
    args: ['--split-headers', '.'],
    filesystem: complex_filesystem,
    expect_filesystem_xpath: {
      'index.html': [
        xpath_header(1, 'index'),
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='link to notindex h2']",
        "//x:div[@class='p']//x:a[@href='#has-split-suffix' and text()='link to has split suffix']",
        "//x:a[@href='subdir/index.html' and text()='link to subdir']",
        "//x:a[@href='subdir/index.html#index-h2' and text()='link to subdir index h2']",
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']",

        // ToC entries of includes point directly to the separate file, not to the plceholder header.
        // e.g. `included-by-index.html` instead of `#included-by-index`.
        "//x:a[@href='included-by-index.html' and text()='link to included by index']",
        "//*[@id='toc']//x:a[@href='included-by-index.html' and text()='Included by index']",

        xpath_header(2, 'included-by-index'),
        "//x:blockquote[text()='A Cirodown example!']",
        xpath_header_split(2, 'index-scope', 'index-scope.html', cirodown.SPLIT_MARKER),
        xpath_header_split(3, 'index-scope/index-scope-2', 'index-scope/index-scope-2.html', cirodown.SPLIT_MARKER),
      ],
      'included-by-index.html': [
        // Cross input file header.
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Index'),
      ],
      'included-by-index-split.html': [
        // Cross input file header on split header.
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Index'),
      ],
      'included-by-h2-in-index.html': [
        xpath_header_parent(1, 'included-by-h2-in-index', 'index.html#h2', 'h2'),
      ],
      'included-by-h2-in-index-split.html': [
        xpath_header_parent(1, 'included-by-h2-in-index', 'index.html#h2', 'h2'),
      ],
      'split.html': [
        // Full links between split header pages have correct numbering.
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='Section 2. \"h2\"']",

        // CirodownExample renders in split header.
        "//x:blockquote[text()='A Cirodown example!']",

        // ToC entries point to the split version of articles.
        "//*[@id='toc']//x:a[@href='h2.html' and text()='2. h2']",
        // ToC entries of includes always point directly to the separate file.
        "//*[@id='toc']//x:a[@href='included-by-index.html' and text()='Included by index']",
        // TODO This is more correct with the `1. `. Maybe wait for https://github.com/cirosantilli/cirodown/issues/126
        // to make sure we don't have to rewrite everything.
        //"//*[@id='toc']//x:a[@href='included-by-index-split.html' and text()='1. Included by index']",
      ],
      'h2-2.html': [
        // These headers are not children of the current toplevel header.
        // Therefore, they do not get a number like "Section 2.".
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='Section \"h2\"']",
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section \"h4 3 2 1\"']",
      ],
      'h3-2-1.html': [
        // Not a child of the current toplevel either.
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section \"h4 3 2 1\"']",
      ],
      'h2-3.html': [
        // This one is under the current tree, so it shows fully.
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section 2.1. \"h4 3 2 1\"']",
      ],
      'notindex.html': [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='index.html' and text()='link to index']",
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='link to h2']",
      ],
      'has-split-suffix-split.html': [
        xpath_header(1, 'has-split-suffix'),
      ],
      // Custom splitSuffix `-asdf` instead of the default `-split`.
      'notindex-splitsuffix-asdf.html': [
      ],
      'subdir/index.html': [
        xpath_header(1, 'subdir'),
        xpath_header_split(1, 'subdir', 'split.html', cirodown.SPLIT_MARKER),
        xpath_header(2, 'index-h2'),
        xpath_header_split(2, 'index-h2', 'index-h2.html', cirodown.SPLIT_MARKER),
        xpath_header(2, 'scope'),
        xpath_header_split(2, 'scope', 'scope.html', cirodown.SPLIT_MARKER),
        xpath_header(3, 'scope/h3'),
        xpath_header_split(3, 'scope/h3', 'scope/h3.html', cirodown.SPLIT_MARKER),
        "//x:a[@href='../index.html' and text()='link to toplevel']",
        "//x:a[@href='../index.html#h2' and text()='link to toplevel subheader']",
      ],
      'subdir/split.html': [
        xpath_header(1, 'index'),
        xpath_header_split(1, 'subdir', 'index.html', cirodown.NOSPLIT_MARKER),
        // Check that split suffix works. Should be has-split-suffix-split.html,
        // not has-split-suffix.html.
        "//x:div[@class='p']//x:a[@href='has-split-suffix-split.html' and text()='link to has split suffix']",
      ],
      'subdir/scope/h3.html': [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../index.html#scope/h3', cirodown.NOSPLIT_MARKER),
        "//x:div[@class='p']//x:a[@href='../index.html#scope' and text()='scope/h3 to scope']",
        "//x:div[@class='p']//x:a[@href='../index.html#scope/h3' and text()='scope/h3 to scope/h3']",
      ],
      'subdir/notindex.html': [
        xpath_header(1, 'notindex'),
        xpath_header(2, 'notindex-h2'),
        xpath_header_split(2, 'notindex-h2', 'notindex-h2.html', cirodown.SPLIT_MARKER),
      ],
      'subdir/notindex-scope/h3.html': [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../notindex.html#notindex-scope/h3', cirodown.NOSPLIT_MARKER),
      ],
      'subdir/split.html': [
        xpath_header(1, 'subdir'),
      ],
      'subdir/index-h2.html': [
        xpath_header(1, 'index-h2'),
      ],
      'subdir/notindex-h2.html': [
        xpath_header(1, 'notindex-h2'),
      ],
      'subdir/notindex-split.html': [
        xpath_header(1, 'notindex'),
      ],
      'subdir/notindex-h2.html': [
        xpath_header(1, 'notindex-h2'),
      ],
      'index-scope.html': [
        xpath_header_split(1, 'index-scope', 'index.html#index-scope', cirodown.NOSPLIT_MARKER),
      ],
      'index-scope/index-scope-child.html': [
        // https://github.com/cirosantilli/cirodown/issues/159
        xpath_header_split(1, 'index-scope-child', '../index.html#index-scope/index-scope-child', cirodown.NOSPLIT_MARKER),
      ],
      'index-scope/index-scope-2.html': [
        // https://github.com/cirosantilli/cirodown/issues/159
        xpath_header_split(1, 'index-scope-2', '../index.html#index-scope/index-scope-2', cirodown.NOSPLIT_MARKER),
      ],
      'toplevel-scope.html': [
        xpath_header_split(2, 'nested-scope', 'toplevel-scope/nested-scope.html', cirodown.SPLIT_MARKER),
        xpath_header_split(3, 'nested-scope/nested-scope-2', 'toplevel-scope/nested-scope/nested-scope-2.html', cirodown.SPLIT_MARKER),
      ],
      'toplevel-scope-split.html': [
        xpath_header_split(1, 'toplevel-scope', 'toplevel-scope.html', cirodown.NOSPLIT_MARKER),
      ],
      'toplevel-scope/toplevel-scope-h2.html': [
        xpath_header_split(1, 'toplevel-scope-h2', '../toplevel-scope.html#toplevel-scope-h2', cirodown.NOSPLIT_MARKER),
      ],
      'toplevel-scope/nested-scope.html': [
        xpath_header_split(1, 'nested-scope', '../toplevel-scope.html#nested-scope', cirodown.NOSPLIT_MARKER),
      ],
      'toplevel-scope/nested-scope/nested-scope-2.html': [
        // https://github.com/cirosantilli/cirodown/issues/159
        xpath_header_split(1, 'nested-scope-2', '../../toplevel-scope.html#nested-scope/nested-scope-2', cirodown.NOSPLIT_MARKER),
      ],

      // Non converted paths.
      'scss.css': [],
      'cirodown.json': [],
    },
    expect_filesystem_not_xpath: {
      'split.html': [
        // Included header placeholders are removed from split headers.
        xpath_header(1, 'included-by-index'),
        xpath_header(2, 'included-by-index'),
      ],
    },
  }
);
assert_executable(
  'executable: directory name is removed from link to subdir h2',
  {
    args: ['.'],
    filesystem: {
      'README.ciro': `= Index

\\x[subdir/index-h2][link to subdir index h2]
    `,
      'cirodown.json': `{}\n`,
      'subdir/index.ciro': `= Subdir index

== Index h2
    `,
    },
    expect_filesystem_xpath: {
      'index.html': [
        xpath_header(1, 'index'),
        "//x:a[@href='subdir/index.html#index-h2' and text()='link to subdir index h2']",
      ]
    },
  }
);
assert_executable(
  // https://github.com/cirosantilli/cirodown/issues/123
  'executable: includers should show as a parents of the includee',
  {
    args: ['.'],
    filesystem: {
      'README.ciro': `= Index

\\Include[included-by-index]
`,
      'not-readme.ciro': `= Not readme

\\Include[included-by-index]
`,
  'included-by-index.ciro': `= Included by index
`,
    },
    expect_filesystem_xpath: {
      'included-by-index.html': [
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Index'),
        xpath_header_parent(1, 'included-by-index', 'not-readme.html', 'Not readme'),
      ],
    }
  }
);
assert_executable(
  'executable: include should not generate an incoming links entry',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.ciro': `= Index

\\Include[included-by-index]
`,
  'included-by-index.ciro': `= Included by index
`,
    },
    expect_filesystem_not_xpath: {
      'included-by-index.html': [
        `//x:h2[@id='incoming-links']`,
      ],
    }
  }
);
assert_executable(
  'executable: --dry-run --split-headers --publish works',
  {
    args: ['--dry-run', '--split-headers', '--publish', '.'],
    filesystem: complex_filesystem,
    pre_exec: [
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
    ],
    expect_filesystem_xpath: {
      'out/publish/out/publish/index.html': [
        "//x:div[@class='p']//x:a[@href='notindex' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex#notindex-h2' and text()='link to notindex h2']",
        "//x:style[contains(text(),'@import \"cirodown.css\"')]",
      ],
      'out/publish/out/publish/notindex.html': [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='.' and text()='link to index']",
        "//x:div[@class='p']//x:a[@href='.#h2' and text()='link to h2']",
      ],
      'out/publish/out/publish/toplevel-scope/toplevel-scope-h2.html': [
        "//x:style[contains(text(),'@import \"../cirodown.css\"')]",
      ],
      'out/publish/out/publish/subdir/index.html': [
        "//x:style[contains(text(),'@import \"../cirodown.css\"')]",
      ],
      // Non-converted files are copied over.
      'out/publish/out/publish/scss.css': [],
      'out/publish/out/publish/cirodown.json': [],
      'out/publish/out/publish/subdir/myfile.txt': [],
    },
  }
);
assert_executable(
  'executable: convert subdirectory only with cirodown.json',
  {
    args: ['subdir'],
    filesystem: {
      'cirodown.json': `{}\n`,
      'README.ciro': `= Index`,
      'subdir/index.ciro': `= Subdir index`,
      'subdir/notindex.ciro': `= Subdir notindex`,
      // A Sass file.
      'subdir/scss.scss': `body { color: red }`,
      // A random non-cirodown file.
      'subdir/xml.xml': `<?xml version='1.0'?><a/>`,
    },
    // Place out next to cirodown.json which should be the toplevel.
    expect_exists: [
      'out',
      'subdir/scss.css',
      'subdir/xml.xml',
    ],
    expect_not_exists: [
      'subdir/out',
      'xml.xml',
      'scss.css',
      'index.html',
    ],
    expect_filesystem_xpath: {
      'subdir/index.html': [xpath_header(1, 'subdir')],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: convert subdirectory only without cirodown.json',
  {
    args: ['subdir'],
    filesystem: {
      'README.ciro': `= Index`,
      'subdir/index.ciro': `= Subdir index`,
      'subdir/notindex.ciro': `= Subdir notindex`,
      'subdir/scss.scss': `body { color: red }`,
      'subdir/xml.xml': `<?xml version='1.0'?><a/>`,
    },
    // Don't know a better place to place out, so just put it int subdir.
    expect_exists: [
      'out',
      'subdir/scss.css',
      'subdir/xml.xml',
    ],
    expect_not_exists: [
      'index.html',
      'scss.css',
      'subdir/out',
      'xml.xml',
    ],
    expect_filesystem_xpath: {
      'subdir/index.html': [xpath_header(1, 'subdir')],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: convert a subdirectory file only with cirodown.json',
  {
    args: ['subdir/notindex.ciro'],
    filesystem: {
      'README.ciro': `= Index`,
      'subdir/index.ciro': `= Subdir index`,
      'subdir/notindex.ciro': `= Subdir notindex`,
      'cirodown.json': `{}`,
    },
    // Place out next to cirodown.json which should be the toplevel.
    expect_exists: ['out'],
    expect_not_exists: ['subdir/out', 'index.html', 'subdir/index.html'],
    expect_filesystem_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_executable(
  'executable: convert a subdirectory file only without cirodown.json',
  {
    args: ['subdir/notindex.ciro'],
    filesystem: {
      'README.ciro': `= Index`,
      'subdir/index.ciro': `= Subdir index`,
      'subdir/notindex.ciro': `= Subdir notindex`,
    },
    // Don't know a better place to place out, so just put it int subdir.
    expect_exists: ['out'],
    expect_not_exists: ['subdir/out', 'index.html', 'subdir/index.html'],
    expect_filesystem_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_executable(
  'executable: convert with --outdir',
  {
    args: ['--outdir', 'my_outdir', '.'],
    filesystem: {
      'README.ciro': `= Index`,
      'subdir/index.ciro': `= Subdir index`,
      'subdir/notindex.ciro': `= Subdir notindex`,
      'cirodown.json': `{}\n`,
    },
    expect_exists: [
      'my_outdir/out',
      'my_outdir/cirodown.json',
    ],
    expect_not_exists: [
      'out',
      'index.html',
      'subdir/index.html',
      'subdir/notindex.html',
    ],
    expect_filesystem_xpath: {
      'my_outdir/index.html': [xpath_header(1, 'index')],
      'my_outdir/subdir/index.html': [xpath_header(1, 'subdir')],
      'my_outdir/subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: cirodown.tex does not blow up',
  {
    args: ['README.ciro'],
    filesystem: {
      'README.ciro': `$$\\mycmd$$`,
      'cirodown.tex': `\\newcommand{\\mycmd}[0]{hello}`,
    },
  }
);
// https://github.com/cirosantilli/cirodown/issues/114
assert_executable(
  'executable: synonym',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.ciro': `= Index

== h2

= My h2 synonym
{c}
{synonym}

\\x[h2]

\\x[my-h2-synonym]

\\x[my-notindex-h2-synonym]

= h3 parent
{parent=h2}
`,
      'notindex.ciro': `= Notindex

== Notindex h2

= My notindex h2 synonym
{synonym}
`,
    },
    expect_filesystem_xpath: {
      'index.html': [
        "//x:div[@class='p']//x:a[@href='#h2' and text()='h2']",
        "//x:div[@class='p']//x:a[@href='#h2' and text()='My h2 synonym']",
        // Across files to test sqlite db.
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='my notindex h2 synonym']",
      ],
      'h2.html': [
        // It does not generate a split header for `My h2 synonym`.
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='h2']",
      ],
      // Redirect generated by synonym.
      'my-notindex-h2-synonym.html': [
        "//x:script[text()=\"location='notindex.html#notindex-h2'\"]",
      ],
    }
  }
);
// https://github.com/cirosantilli/cirodown/issues/131
assert_executable(
  'executable: splitDefault',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.ciro': `= Toplevel
{splitDefault}

\\x[toplevel][toplevel to toplevel]

\\x[image-my-image-toplevel][toplevel to my image toplevel]

\\x[h2][toplevel to h2]

\\x[image-my-image-h2][toplevel to my image h2]

\\x[notindex][toplevel to notindex]

\\x[notindex-h2][toplevel to notindex h2]

\\Image[img.jpg]{title=My image toplevel}

== H2

\\x[toplevel][h2 to toplevel]

\\x[image-my-image-toplevel][h2 to my image toplevel]

\\x[h2][h2 to h2]

\\x[image-my-image-h2][h2 to my image h2]

\\x[notindex][h2 to notindex]

\\x[notindex-h2][h2 to notindex h2]

\\Image[img.jpg]{title=My image h2}

== Split suffix
{splitSuffix}
`,
      'notindex.ciro': `= Notindex

\\x[toplevel][notindex to toplevel]

\\x[image-my-image-toplevel][notindex to my image toplevel]

\\x[h2][notindex to h2]

\\x[image-my-image-h2][notindex to my image h2]

\\x[notindex][notindex to notindex]

\\x[notindex-h2][notindex to notindex h2]

\\Image[img.jpg]{title=My image notindex}

== Notindex h2

\\x[toplevel][notindex h2 to toplevel]

\\x[image-my-image-toplevel][notindex h2 to my image toplevel]

\\x[h2][notindex h2 to h2]

\\x[image-my-image-h2][notindex h2 to my image h2]

\\x[notindex][notindex h2 to notindex]

\\x[notindex-h2][notindex h2 to notindex h2]

\\Image[img.jpg]{title=My image notindex h2}
`,
      'img.jpg': '',
    },
    expect_filesystem_xpath: {
      // This is he split one.
      'index.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='toplevel to h2']",
        // That one is nosplit by default.
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='toplevel to notindex']",
        // A child of a nosplit also becomes nosplit by default.
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='toplevel to notindex h2']",

        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'toplevel', "x:a[@href='' and text()='Toplevel']"),

        // Images.
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='toplevel to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html#image-my-image-h2' and text()='toplevel to my image h2']",

        // Split/nosplit.
        xpath_header_split(1, 'toplevel', 'nosplit.html', cirodown.NOSPLIT_MARKER),
      ],
      'nosplit.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel']",
        // Although h2 is split by defualt, it is already rendered in the curent page,
        // so just link to the current page render instead.
        "//x:div[@class='p']//x:a[@href='#h2' and text()='toplevel to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='toplevel to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='toplevel to notindex h2']",

        "//x:div[@class='p']//x:a[@href='' and text()='h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='#h2' and text()='h2 to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='h2 to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='h2 to notindex h2']",

        // Images.
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='toplevel to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-h2' and text()='toplevel to my image h2']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='h2 to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-h2' and text()='h2 to my image h2']",

        // Headers.
        xpath_header(1, 'toplevel', "x:a[@href='' and text()='Toplevel']"),
        xpath_header(2, 'h2', "x:a[@href='#h2' and text()='1. H2']"),

        // Spilt/nosplit.
        xpath_header_split(1, 'toplevel', 'index.html', cirodown.SPLIT_MARKER),
      ],
      'h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='' and text()='h2 to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='h2 to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='h2 to notindex h2']",

        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'h2', "x:a[@href='' and text()='H2']"),

        // Images.
        "//x:div[@class='p']//x:a[@href='index.html#image-my-image-toplevel' and text()='h2 to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-h2' and text()='h2 to my image h2']",

        // Spilt/nosplit.
        xpath_header_split(1, 'h2', 'nosplit.html#h2', cirodown.NOSPLIT_MARKER),
      ],
      'split-suffix-split.html': [
      ],
      'notindex.html': [
        // Link so the split one of index because that's the default of that page.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='notindex to h2']",
        "//x:div[@class='p']//x:a[@href='' and text()='notindex to notindex']",
        "//x:div[@class='p']//x:a[@href='#notindex-h2' and text()='notindex to notindex h2']",

        // This is he nosplit one, so notindex h2 is also here.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='notindex h2 to h2']",
        "//x:div[@class='p']//x:a[@href='' and text()='notindex h2 to notindex']",
        "//x:div[@class='p']//x:a[@href='#notindex-h2' and text()='notindex h2 to notindex h2']",

        // Images.
        "//x:div[@class='p']//x:a[@href='h2.html#image-my-image-h2' and text()='notindex to my image h2']",
        "//x:div[@class='p']//x:a[@href='h2.html#image-my-image-h2' and text()='notindex h2 to my image h2']",

        // Headers.
        xpath_header(1, 'notindex', "x:a[@href='' and text()='Notindex']"),
        xpath_header(2, 'notindex-h2', "x:a[@href='#notindex-h2' and text()='1. Notindex h2']"),

        // Spilt/nosplit.
        xpath_header_split(1, 'notindex', 'notindex-split.html', cirodown.SPLIT_MARKER),
      ],
      'notindex-split.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='notindex to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='notindex to notindex']",

        // Link from split to another header inside the same nonsplit page.
        // Although external links to this header would to to its default which is nosplit,
        // mabe when we are inside it in split mode (a rarer use case) then we should just remain
        // inside of split mode.
        //"//x:div[@class='p']//x:a[@href='notindex-h2.html' and text()='notindex to notindex h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='notindex to notindex h2']",

        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'notindex', "x:a[@href='' and text()='Notindex']"),

        // Spilt/nosplit.
        xpath_header_split(1, 'notindex', 'notindex.html', cirodown.NOSPLIT_MARKER),
      ],
      'notindex-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='notindex h2 to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='notindex h2 to notindex h2']",

        // Link from split to another header inside the same nonsplit page.
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='notindex h2 to notindex']",

        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'notindex-h2', "x:a[@href='' and text()='Notindex h2']"),

        // Spilt/nosplit.
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', cirodown.NOSPLIT_MARKER),
      ],
    }
  }
);
assert_executable(
  'executable: --generate min followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['cirodown', ['--generate', 'min']],
    ],
  }
);
assert_executable(
  'executable: --generate min in subdir does not alter toplevel',
  {
    args: ['.'],
    filesystem: {
      'cirodown.json': `{}`
    },
    cwd: 'subdir',
    pre_exec: [
      ['cirodown', ['--generate', 'min']],
    ],
    expect_exists: [
      'subdir/README.ciro',
    ],
    expect_not_exists: [
      'README.ciro',
    ],
  }
);
assert_executable(
  'executable: --generate default followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['cirodown', ['--generate', 'default']],
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
    ],
  }
);
assert_executable(
  'executable: --generate min followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['cirodown', ['--generate', 'min']],
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
      ['git', ['remote', 'add', 'origin', 'git@github.com:cirosantilli/cirodown-generate.git']],
    ],
  }
);
assert_executable(
  'executable: --generate default followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['cirodown', ['--generate', 'default']],
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
      ['git', ['remote', 'add', 'origin', 'git@github.com:cirosantilli/cirodown-generate.git']],
    ],
  }
);
assert_executable(
  'executable: --embed-resources actually embeds resources',
  {
    args: ['--embed-resources', '.'],
    filesystem: {
      'README.ciro': `= Index
`,
    },
    expect_filesystem_xpath: {
      'index.html': [
        // The start of a minified CSS rule from cirodown.scss.
        "//x:style[contains(text(),'.cirodown{')]",
      ],
    },
    expect_filesystem_not_xpath: {
      'index.html': [
        // The way that we import other sheets.
        "//x:style[contains(text(),'@import ')]",
      ],
    }
  }
);
assert_executable(
  // At "cross reference to non-included header in another file"
  // we have a commented out stub for this without executable:
  // but it would require generalizing the test system a bit,
  // and we are lazy right now.
  'executable: reference to subdir with --embed-includes',
  {
    args: ['--embed-includes', 'README.ciro'],
    filesystem: {
      'README.ciro': `= Index

\\x[subdir]

\\x[subdir/h2]

\\x[subdir/notindex]

\\x[subdir/notindex-h2]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'subdir/index.ciro': `= Subdir

== h2
`,
      'subdir/notindex.ciro': `= Notindex

== Notindex h2
`,
    },
  }
);

// executable: link:
assert_executable(
  'executable: link: relative reference to nonexistent file leads to failure',
  {
    args: ['README.ciro'],
    filesystem: {
      'README.ciro': `\\a[i-dont-exist]
`,
    },
    expect_exit_status: 1,
  }
);
assert_executable(
  "executable: link: relative reference to existent files do not lead to failure",
  {
    args: ['README.ciro'],
    filesystem: {
      'README.ciro': `\\a[i-exist]`,
      'i-exist': ``,
    },
  }
);
assert_executable(
  "executable: link: check=0 prevents existence checks",
  {
    args: ['README.ciro'],
    filesystem: {
      'README.ciro': `\\a[i-dont-exist]{check=0}
`,
    },
  }
);
assert_executable(
  "executable: link: relative links and images are corrected for different output paths with scope and split-headers",
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.ciro': `= Index

== h2
{scope}

=== h3

\\a[i-exist][h3 i-exist]

\\Image[i-exist][h3 i-exist img]

\\Video[i-exist][h3 i-exist video]

\\a[subdir/i-exist-subdir][h3 i-exist-subdir]

\\a[https://cirosantilli.com][h3 abs]
`,
      'subdir/README.ciro': `= Subdir

\\a[../i-exist][subdir i-exist]

\\a[/i-exist][subdir /i-exist]

\\a[i-exist-subdir][subdir i-exist-subdir]

== subdir h2
{scope}

=== subdir h3

\\a[../i-exist][subdir h3 i-exist]

\\a[/i-exist][subdir h3 /i-exist]

\\a[i-exist-subdir][subdir h3 i-exist-subdir]
`,
      'subdir/not-readme.ciro': `= Subdir Not Readme

\\a[../i-exist][subdir not readme i-exist]

\\a[i-exist-subdir][subdir not readme i-exist-subdir]
`,
      'i-exist': ``,
      'subdir/i-exist-subdir': ``,
    },
    expect_filesystem_xpath: {
      'index.html': [
        "//x:a[@href='i-exist' and text()='h3 i-exist']",
        "//x:img[@src='i-exist' and @alt='h3 i-exist img']",
        "//x:video[@src='i-exist' and @alt='h3 i-exist video']",
        "//x:a[@href='subdir/i-exist-subdir' and text()='h3 i-exist-subdir']",
        "//x:a[@href='https://cirosantilli.com' and text()='h3 abs']",
      ],
      'h2/h3.html': [
        "//x:a[@href='../i-exist' and text()='h3 i-exist']",
        "//x:img[@src='../i-exist' and @alt='h3 i-exist img']",
        "//x:video[@src='../i-exist' and @alt='h3 i-exist video']",
        "//x:a[@href='https://cirosantilli.com' and text()='h3 abs']",
      ],
      'subdir/index.html': [
        "//x:a[@href='../i-exist' and text()='subdir i-exist']",
        "//x:a[@href='/i-exist' and text()='subdir /i-exist']",
        "//x:a[@href='i-exist-subdir' and text()='subdir i-exist-subdir']",
      ],
      'subdir/subdir-h2/subdir-h3.html': [
        "//x:a[@href='../../i-exist' and text()='subdir h3 i-exist']",
        "//x:a[@href='/i-exist' and text()='subdir h3 /i-exist']",
        "//x:a[@href='../i-exist-subdir' and text()='subdir h3 i-exist-subdir']",
      ],
      'subdir/not-readme.html': [
        "//x:a[@href='../i-exist' and text()='subdir not readme i-exist']",
        "//x:a[@href='i-exist-subdir' and text()='subdir not readme i-exist-subdir']",
      ],
    },
  }
);

// executable cwd tests
assert_executable(
  "executable: cwd outside project directory given by cirodown.json",
  {
    args: ['myproject'],
    filesystem: {
      'myproject/README.ciro': `= Index

\\x[not-readme]

\\x[subdir]

\\Include[not-readme]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-readme.ciro': `= Not readme
`,
      'myproject/scss.scss': `body { color: red }`,
      'myproject/cirodown.json': `{}
`,
      'myproject/subdir/index.ciro': `= Subdir
`,
      'myproject/subdir/notindex.ciro': `= Subdir Notindex
`,
    },
    expect_exists: [
      'myproject/out',
      'myproject/scss.css',
      'myproject/cirodown.json',
    ],
    expect_filesystem_xpath: {
      'myproject/index.html': [
          xpath_header(1, 'index'),
      ],
      'myproject/subdir/index.html': [
          xpath_header(1, 'subdir'),
      ]
    }
  }
);
assert_executable(
  "executable: if there is no cirodown.json and the input is not under cwd then the project dir is the input dir",
  {
    args: [path.join('..', 'myproject')],
    cwd: 'notmyproject',
    filesystem: {
      'myproject/README.ciro': `= Index

\\x[not-readme]

\\x[subdir]

\\Include[not-readme]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-readme.ciro': `= Not readme
`,
      'myproject/scss.scss': `body { color: red }`,
      'myproject/subdir/index.ciro': `= Subdir
`,
      'myproject/subdir/notindex.ciro': `= Subdir Notindex
`,
    },
    expect_exists: [
      'myproject/out',
      'myproject/scss.css',
    ],
    expect_filesystem_xpath: {
      'myproject/index.html': [
          xpath_header(1, 'index'),
      ],
      'myproject/subdir/index.html': [
          xpath_header(1, 'subdir'),
      ]
    }
  }
);

assert_executable(
  'executable: root_relpath and root_path in main.liquid.html work',
  {
    args: ['-S', '.'],
    filesystem: {
      'README.ciro': `= Index

== h2
`,
      'notindex.ciro': `= Notindex

== Notindex h2
{scope}

=== h3
`,
      'cirodown.json': `{
  "template": "main.liquid.html"
}
`,
      'main.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<body>
<header>
<a id="root-relpath" href="{{ root_relpath }}">Root relpath</a>
<a id="root-page" href="{{ root_page }}">Root page</a>
{{ post_body }}
</body>
</html>
`
    },
    expect_filesystem_xpath: {
      'index.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='']",
      ],
      'split.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      'h2.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      'notindex.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      'notindex-split.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      'notindex-h2.html': [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      'notindex-h2/h3.html': [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
    }
  }
);

assert_executable(
  'executable: incoming links and other children',
  {
    args: ['--add-test-instrumentation', '-S', '.'],
    filesystem: {
      'README.ciro': `= Index

\\x[index]

\\x[h2]

\\x[notindex]

\\x[h2-2]{child}

\\x[scope/scope-1]

== h2
{child=h2-3}
{child=h2-4}
{child=notindex-h2-2}

\\x[index]

\\x[notindex]

\\x[h2-2]{child}

\\x[scope/scope-2]{child}

== h2 2

== h2 3

== h2 4

== h2 5
{tag=h2}

== No incoming

== Scope
{scope}

=== Scope 1

=== Scope 2

\\x[scope-1]

\\x[scope-3]{child}

=== Scope 3
`,
      'notindex.ciro': `= Notindex

\\x[index]

\\x[h2]

== Notindex h2
{tag=h2-2}

=== Notindex h3

== Notindex h2 2
`,
    },
    expect_filesystem_xpath: {
      'index.html': [
        // Would like to test like this, but it doesn't seem implemented in this crappy xpath implementation.
        // So we revert to instrumentation instead then.
        //`//x:h2[@id='incoming-links']/following:://x:a[@href='#h2']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='#h2']`,
        // https://github.com/cirosantilli/cirodown/issues/155
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='#h2-2']`,
      ],
      'h2.html': [
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        // https://github.com/cirosantilli/cirodown/issues/155
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-2']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-3']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-4']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-5']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#scope/scope-2']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2-2']`,
      ],
      'h2-2.html': [
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html#h2']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2']`,
      ],
      'scope/scope-1.html': [
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='../index.html']`,
        // https://github.com/cirosantilli/cirodown/issues/173
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='../index.html#scope/scope-2']`,
      ],
      'scope/scope-2.html': [
        // https://github.com/cirosantilli/cirodown/issues/173
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='../index.html#scope/scope-3']`,
      ],
      'notindex.html': [
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html#h2']`,
      ],
    },
    expect_filesystem_not_xpath: {
      'no-incoming.html': [
        `//x:ul[@${cirodown.Macro.TEST_DATA_HTML_PROP}='incoming-links']`,
      ],
    },
  }
);

assert_executable(
  'executable: cirodown.json: outputOutOfTree',
  {
    args: ['-S', '.'],
    filesystem: {
      'README.ciro': `= Index

== h2
`,
      'notindex.ciro': `= Notindex

== Notindex h2
`,
      'cirodown.json': `{
  "outputOutOfTree": true
}
`,
    },
    expect_exists: [
      'out/html/index.html',
      'out/html/split.html',
      'out/html/h2.html',
      'out/html/notindex.html',
      'out/html/notindex-h2.html',
      'out/db.sqlite3',
    ],
    expect_not_exists: [
      'index.html',
      'split.html',
      'h2.html',
      'notindex.html',
      'notindex-h2.html',
      'out/html/out',
    ]
  }
);
assert_executable(
  'executable: IDs are removed from the database after you removed them from the source file and convert the file',
  {
    args: ['notindex.ciro'],
    filesystem: {
      'README.ciro': `= Index

== h2
`,
      'notindex.ciro': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['cirodown', ['README.ciro']],
      // Remove h2 from README.ciro
      {
        filesystem_update: {
          'README.ciro': `= Index
`,
        }
      },
      ['cirodown', ['README.ciro']],
    ],
  }
);
assert_executable(
  'executable: IDs are removed from the database after you removed them from the source file and convert the directory',
  {
    args: ['.'],
    filesystem: {
      'README.ciro': `= Index

== h2
`,
      'notindex.ciro': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['cirodown', ['README.ciro']],
      // Remove h2 from README.ciro
      {
        filesystem_update: {
          'README.ciro': `= Index
`,
        }
      },
    ],
  }
);

assert_executable(
  "executable: toplevel index file without a header produces output to index.html",
  {
    args: ['README.ciro'],
    filesystem: {
      'README.ciro': `asdf
`,
    },
    expect_filesystem_xpath: {
      'index.html': [
        "//x:div[@class='p' and text()='asdf']",
      ],
    },
  }
);
