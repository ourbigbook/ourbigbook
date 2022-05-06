const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const { Sequelize } = require('sequelize')

const ourbigbook = require('./index')
const ourbigbook_nodejs_front = require('./nodejs_front');
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe');
const models = require('./models');

const PATH_SEP = ourbigbook.Macro.HEADER_SCOPE_SEPARATOR

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

/** THE ASSERT EVERYTHING ENTRYPOINT.
 *
 * This is named after the most common use case, which is asserting a
 * certain subset of the AST.
 *
 * But we extended it to actually test everything possible given the correct options,
 * in order to factor out all the settings across all asserts. Other asserts are just
 * convenience functions for this function.
 *
 * Asserting the AST is ideal whenever possible as opposed to HTML,
 * since the HTML is more complicated, and change more often.
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
    if (!('assert_xpath_main' in options)) {
      // Not ideal that this exists in addition to assert_xpath, but
      // sometimes there's no other easy way to test rendered stuff.
      // Notably, we would like to support the case of output to stdout.
      // All in list must match.
      options.assert_xpath_main = [];
    }
    if (!('assert_not_xpath_main' in options)) {
      options.assert_not_xpath_main = [];
    }
    if (!('assert_xpath' in options)) {
      // Assert xpath on other outputs besides the main output.
      // These can come either from split headers, from from separate
      // files via convert_before.
      options.assert_xpath = {};
    }
    if (!('assert_not_xpath' in options)) {
      // Like assert_xpath but assert it does not match.
      options.assert_not_xpath = {};
    }
    if (!('convert_before' in options)) {
      // List of strings. Convert files at these paths from default_file_reader
      // before the main conversion to build up the cross-file reference database.
      options.convert_before = [];
    }
    if (!('convert_before_norender' in options)) {
      options.convert_before_norender = [];
    }
    if (!('duplicate_ids' in options)) {
      options.duplicate_ids = []
    }
    if (!('filesystem' in options)) {
      // Passed to ourbigbook.convert.
      options.filesystem = default_filesystem;
    }
    if (!('has_error' in options)) {
      // Has error somewhere, but our precise error line/column assertions
      // are failing, and we are lazy to fix them right now. But still it is better
      // to know that it does not blow up with an exception, and has at least.
      // one error message.
      options.has_error = false;
    }
    if (!('invalid_title_titles' in options)) {
      options.invalid_title_titles = []
    }

    // extra_convert_opts defaults.
    if (!('extra_convert_opts' in options)) {
      // Passed to ourbigbook.convert.
      options.extra_convert_opts = {};
    }
    if (!('expect_not_exists' in options)) {
      options.expect_not_exists = [];
    }
    if (!('path_sep' in options.extra_convert_opts)) {
      options.extra_convert_opts.path_sep = PATH_SEP;
    }
    if (!('read_include' in options.extra_convert_opts)) {
      options.extra_convert_opts.read_include = ourbigbook_nodejs_webpack_safe.read_include({
        exists: (inpath) => inpath in options.filesystem,
        read: (inpath) => options.filesystem[inpath],
        path_sep: PATH_SEP,
      })
    }
    options.extra_convert_opts.fs_exists_sync = (my_path) => options.filesystem[my_path] !== undefined
    if (!('input_path_noext' in options) && options.extra_convert_opts.split_headers) {
      options.input_path_noext = ourbigbook.INDEX_BASENAME_NOEXT;
    }
    const main_input_path = options.input_path_noext + ourbigbook.OURBIGBOOK_EXT
    assert(!(main_input_path in options.filesystem))
    const filesystem = Object.assign({}, options.filesystem)
    filesystem[main_input_path] = input_string

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
    const sequelize = await ourbigbook_nodejs_webpack_safe.create_sequelize({
        storage: ':memory:',
        logging: false,
      },
      Sequelize,
      { force: true },
    )
    let exception
    try {
      const id_provider = new ourbigbook_nodejs_webpack_safe.SqliteIdProvider(sequelize);
      new_convert_opts.id_provider = id_provider
      new_convert_opts.file_provider = new ourbigbook_nodejs_webpack_safe.SqliteFileProvider(
        sequelize, id_provider);
      const rendered_outputs = {}
      async function convert(input_path, render) {
        //console.error({input_path});
        const extra_returns = {};
        assert(input_path in filesystem)
        const input_string = filesystem[input_path];
        const dependency_convert_opts = Object.assign({}, new_convert_opts);
        dependency_convert_opts.input_path = input_path;
        dependency_convert_opts.toplevel_id = path.parse(input_path).ext;
        dependency_convert_opts.render = render;
        await ourbigbook.convert(input_string, dependency_convert_opts, extra_returns);
        Object.assign(rendered_outputs, extra_returns.rendered_outputs)
        assert.strictEqual(extra_returns.errors.length, 0)
        await ourbigbook_nodejs_webpack_safe.update_database_after_convert({
          extra_returns,
          id_provider,
          sequelize,
          path: input_path,
          render,
        })
      }
      for (const input_path of options.convert_before_norender) {
        await convert(input_path, false)
      }
      for (const input_path of options.convert_before) {
        await convert(input_path, true)
      }
      //console.error('main');
      if (options.input_path_noext !== undefined) {
        new_convert_opts.input_path = options.input_path_noext + ourbigbook.OURBIGBOOK_EXT;
        new_convert_opts.toplevel_id = options.input_path_noext;
      }
      const extra_returns = {};
      const output = await ourbigbook.convert(input_string, new_convert_opts, extra_returns);
      Object.assign(rendered_outputs, extra_returns.rendered_outputs)
      if (new_convert_opts.input_path !== undefined) {
        await ourbigbook_nodejs_webpack_safe.update_database_after_convert({
          extra_returns,
          id_provider,
          sequelize,
          path: new_convert_opts.input_path,
          render: true,
        })
      }

      // Post conversion checks.
      const [duplicate_rows, invalid_title_title_rows] = await Promise.all([
        await sequelize.models.Id.findDuplicates(),
        await sequelize.models.Id.findInvalidTitleTitle(),
      ])
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
            new ourbigbook.SourceLocation(
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
      for (const xpath_expr of options.assert_xpath_main) {
        assert_xpath_main(xpath_expr, output);
      }
      for (const xpath_expr of options.assert_not_xpath_main) {
        assert_xpath_main(xpath_expr, output, { count: 0 });
      }
      for (const key in options.assert_xpath) {
        const output = rendered_outputs[key];
        assert.notStrictEqual(output, undefined, `"${key}" not in ${Object.keys(rendered_outputs)}`);
        for (const xpath_expr of options.assert_xpath[key]) {
          assert_xpath_main(xpath_expr, output.full, {message: key});
        }
      }
      for (const key in options.assert_not_xpath) {
        const output = rendered_outputs[key];
        assert.notStrictEqual(output, undefined);
        for (const xpath_expr of options.assert_not_xpath[key]) {
          assert_xpath_main(xpath_expr, output.full, {
            count: 0,
            message: key,
          });
        }
      }
      for (const key of options.expect_not_exists) {
        assert.ok(!(key in rendered_outputs))
      }
    } catch(e) {
      exception = e
    }
    await ourbigbook_nodejs_webpack_safe.destroy_sequelize(sequelize)
    if (exception) {
      throw exception
    }
  })
}

function assert_db_checks(actual_rows, expects) {
  for (let i = 0; i < actual_rows.length; i++) {
    const actual_row = actual_rows[i]
    const expect = expects[i]
    const ast = ourbigbook.AstNode.fromJSON(actual_row.ast_json)
    const source_location = ast.source_location
    assert.strictEqual(actual_row.idid, expect[0])
    assert.strictEqual(actual_row.path, expect[1])
    assert.strictEqual(source_location.line, expect[2])
    assert.strictEqual(source_location.column, expect[3])
  }
  assert.strictEqual(actual_rows.length, expects.length)
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

const testdir = path.join(__dirname, ourbigbook_nodejs_webpack_safe.TMP_DIRNAME, 'test')
fs.rmSync(testdir, { recursive: true });
fs.mkdirSync(testdir, { recursive: true });

// Test the ourbigbook executable via a separate child process call.
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
  it(description, async function () {
    options = Object.assign({}, options);
    if (!('args' in options)) {
      options.args = [];
    }
    if (!('assert_xpath' in options)) {
      options.assert_xpath = {};
    }
    if (!('assert_not_xpath' in options)) {
      options.assert_not_xpath = {};
    }
    if (!('assert_xpath_stdout' in options)) {
      options.assert_xpath_stdout = [];
    }
    if (!('cwd' in options)) {
      options.cwd = '.';
    }
    if (!('filesystem' in options)) {
      options.filesystem = {};
    }
    if (!('expect_exit_status' in options)) {
      options.expect_exit_status = 0;
    }
    if (!('expect_exists' in options)) {
      options.expect_exists = [];
    }
    if (!('expect_exists_sqlite' in options)) {
      options.expect_exists_sqlite = [];
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
    const common_args = ['--add-test-instrumentation', '--fakeroot', tmpdir]
    if (ourbigbook_nodejs_front.postgres) {
      // Clear the database.
      const sequelize = await ourbigbook_nodejs_webpack_safe.create_sequelize({
          logging: false,
        },
        Sequelize,
        { force: true },
      )
      await ourbigbook_nodejs_webpack_safe.destroy_sequelize(sequelize)
    }
    for (const entry of options.pre_exec) {
      if (Array.isArray(entry)) {
        let [cmd, args] = entry
        if (cmd === 'ourbigbook') {
          args = common_args.concat(args)
        }
        const out = child_process.spawnSync(cmd, args, {cwd: cwd});
        assert.strictEqual(out.status, 0, exec_assert_message(out, cmd, args, cwd));
      } else {
        update_filesystem(entry.filesystem_update, tmpdir)
      }
    }
    const cmd = 'ourbigbook'
    const args = common_args.concat(options.args)
    const out = child_process.spawnSync(cmd, args, {
      cwd: cwd,
      input: options.stdin,
    });
    const assert_msg = exec_assert_message(out, cmd, args, cwd);
    assert.strictEqual(out.status, options.expect_exit_status, assert_msg);
    for (const xpath_expr of options.assert_xpath_stdout) {
      assert_xpath_main(
        xpath_expr,
        out.stdout.toString(ourbigbook_nodejs_webpack_safe.ENCODING),
        {message: assert_msg},
      );
    }
    for (const relpath in options.assert_xpath) {
      const assert_msg_xpath = `path should match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), assert_msg_xpath);
      const html = fs.readFileSync(fullpath).toString(ourbigbook_nodejs_webpack_safe.ENCODING);
      for (const xpath_expr of options.assert_xpath[relpath]) {
        assert_xpath_main(xpath_expr, html, {message: assert_msg_xpath});
      }
    }
    for (const relpath in options.assert_not_xpath) {
      const assert_msg_xpath = `path should not match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), assert_msg_xpath);
      const html = fs.readFileSync(fullpath).toString(ourbigbook_nodejs_webpack_safe.ENCODING);
      for (const xpath_expr of options.assert_not_xpath[relpath]) {
        assert_xpath_main(xpath_expr, html, {message: assert_msg_xpath, count: 0});
      }
    }
    for (const relpath of options.expect_exists) {
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), exec_assert_message(
        out, cmd, args, cwd, 'path should exist: ' + relpath));
    }
    if (!ourbigbook_nodejs_front.postgres) {
      for (const relpath of options.expect_exists_sqlite) {
        const fullpath = path.join(tmpdir, relpath);
        assert.ok(fs.existsSync(fullpath), exec_assert_message(
          out, cmd, args, cwd, 'path should exist: ' + relpath));
      }
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

function assert_xpath_main(xpath_expr, string, options={}) {
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
    console.error(`assert_xpath_main${count_str}: ` + options.message);
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
  if (arg.length() !== subset.length) {
    extra_returns.fail_reason = `arg.length !== subset.length ${arg.length()} ${subset.length}
arg: ${JSON.stringify(arg, null, 2)}
subset: ${JSON.stringify(subset, null, 2)}
`;
    return false;
  }
  for (let i = 0; i < arg.length(); i++) {
    if (!ast_has_subset(arg.get(i), subset[i], extra_returns))
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
  'include-one-level-1.bigb': `= cc

dd
`,
  'include-one-level-2.bigb': `= ee

ff
`,
  'include-two-levels.bigb': `= ee

ff

== gg

hh
`,
  'include-two-levels-parent.bigb': `= Include two levels parent

h1 content

= Include two levels parent h2
{parent=include-two-levels-parent}

h2 content
`,
  'include-two-levels-subdir/index.bigb': `= Include two levels subdir h1

== Include two levels subdir h2
`,
  'include-with-error.bigb': `= bb

\\reserved_undefined
`,
  'include-circular-1.bigb': `= bb

\\Include[include-circular-2]
`,
  'include-circular-2.bigb': `= cc

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
${out.stdout.toString(ourbigbook_nodejs_webpack_safe.ENCODING)}

stderr:
${out.stderr.toString(ourbigbook_nodejs_webpack_safe.ENCODING)}`;
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
    const file_content = filesystem[relpath]
    const file_path = path.join(tmpdir, relpath)
    if (
      // This special value means deletion.
      file_content === null
    ) {
      fs.unlinkSync(file_path)
    } else {
      // This is the string that will be written to the file.
      const dirpath = path.join(tmpdir, path.parse(relpath).dir);
      if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath);
      }
      fs.writeFileSync(file_path, file_content);
    }
  }
}

// xpath to match the parent div of a given header.
function xpath_header(n, id, insideH) {
  if (insideH) {
    insideH = '//' + insideH
  } else {
    insideH = ''
  }
  let ret = `//x:div[@class='h'`
  if (id) {
    ret += ` and @id='${id}'`
  }
  ret += ` and .//x:h${n}${insideH}]`
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
  return `${xpath_header(n, id)}//x:a[${href_xpath}text()=' ${marker}']`;
}

// xpath to match the parent link inside of a header.
function xpath_header_parent(n, id, href, title) {
  return `${xpath_header(n, id)}//x:a[@href='${href}' and text()=' \"${title}\"']`;
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
      "//x:span[@class='hide-hover']//x:a[@href='']",
    ],
    assert_not_xpath_main: [
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
// https://github.com/cirosantilli/ourbigbook/issues/54
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
// https://github.com/cirosantilli/ourbigbook/issues/53
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
// https://github.com/cirosantilli/ourbigbook/issues/81
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
// https://github.com/cirosantilli/ourbigbook/issues/81
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_not_xpath_main: [
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
    assert_xpath_main: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
      "//x:span[@class='caption-prefix' and text()='Table 2']",
    ],
    assert_not_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_not_xpath_main: [
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
    assert_xpath_main: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
      "//x:span[@class='caption-prefix' and text()='Figure 2']",
    ],
    assert_not_xpath_main: [
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
    convert_before: ['notindex.bigb'],
    filesystem: {
     'notindex.bigb': `= notindex h1
`,
    },
  }
);
assert_convert_ast('link to image in nother files that has title with x to header in another file',
  `= Index

\\x[image-my-notindex]`,
  undefined,
  {
    assert_xpath_main: [
      "//x:a[@href='image.html#image-my-notindex' and text()='Figure \"My notindex h1\"']",
    ],
    convert_before: [
      'notindex.bigb',
      'image.bigb',
    ],
    filesystem: {
     'image.bigb': `= image h1

\\Image[aa]{title=My \\x[notindex]}{check=0}
`,
     'notindex.bigb': `= notindex h1
`,
    },
    input_path_noext: 'index',
  }
);

// Escapes.
assert_convert_ast('escape backslash',            'a\\\\b\n', [a('P', [t('a\\b')])]);
assert_convert_ast('escape left square bracket',  'a\\[b\n',  [a('P', [t('a[b')])]);
assert_convert_ast('escape right square bracket', 'a\\]b\n',  [a('P', [t('a]b')])]);
assert_convert_ast('escape left curly brace',     'a\\{b\n',  [a('P', [t('a{b')])]);
assert_convert_ast('escape right curly brace',    'a\\}b\n',  [a('P', [t('a}b')])]);
assert_convert_ast('escape header id', `= tmp

\\x["'\\<>&]

== tmp 2
{id="'\\<>&}
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[@id=concat('\"', \"'<>&\")]",
    ],
  }
);

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
// https://github.com/cirosantilli/ourbigbook/issues/101
assert_error('named argument given multiple times',
  '\\P[ab]{id=cd}{id=ef}', 1, 14);
assert_error(
  'non-empty named argument without = is an error',
  '\\P{id ab}[cd]',
  1, 6, 'notindex.bigb',
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
  '\\a[ab&\\<>"\'cd][ef&\\<>"\'gh]{check=0}\n',
  undefined,
  {
    assert_xpath_main: [
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
// https://cirosantilli.com/ourbigbook#the-id-of-the-first-header-is-derived-from-the-filename
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
      input_path: ourbigbook.INDEX_BASENAME_NOEXT + ourbigbook.OURBIGBOOK_EXT
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
// https://cirosantilli.com/ourbigbook#order-of-reported-errors
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
    assert_xpath_main: [
      "//x:a[@href='another-file.html' and text()='another file']",
    ],
    convert_before: [
      'another-file.bigb',
    ],
    filesystem: {
      'another-file.bigb': '= Another file'
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference to included header in another file',
  // I kid you not. Everything breaks everything.
  `= Notindex

\\x[another-file]

\\x[another-file-h2]

\\Include[another-file]
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:a[@href='another-file.html' and text()='another file']",
      "//x:a[@href='another-file.html#another-file-h2' and text()='another file h2']",
    ],
    convert_before: [
      'another-file.bigb',
    ],
    filesystem: {
      'another-file.bigb': `= Another file

== Another file h2
`
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference to non-included ids in another file',
  `= Notindex

\\x[notindex]

\\x[bb]

\\Q[\\x[bb]{full}]

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
    a('Q', [a('x', undefined, {href: [t('bb')]})]),
    a('P', [a('x', undefined, {href: [t('include-two-levels')]})]),
    a('P', [a('x', undefined, {href: [t('gg')]})]),
    a('P', [a('x', [t('image bb 1')], {href: [t('image-bb')]})]),
    // TODO: to enable this, we have to also update the test infrastructure to also pass:
    // new_options.toplevel_has_scope = true;
    // new_options.toplevel_parent_scope = undefined;
    // like ./ourbigbook does from the CLI.
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
    assert_xpath_main: [
      // Empty URL points to start of the document, which is exactly what we want.
      // https://stackoverflow.com/questions/5637969/is-an-empty-href-valid
      "//x:div[@class='p']//x:a[@href='' and text()='notindex']",
      "//x:a[@href='#bb' and text()='bb']",
      "//x:blockquote//x:a[@href='#bb' and text()='Section 1. \"bb\"']",
      // https://github.com/cirosantilli/ourbigbook/issues/94
      "//x:a[@href='include-two-levels.html' and text()='ee']",
      "//x:a[@href='include-two-levels.html#gg' and text()='gg']",
      "//x:a[@href='#bb' and text()='bb to bb']",
      "//x:a[@href='#image-bb' and text()='image bb 1']",

      // Links to the split versions.
      xpath_header_split(1, 'notindex', 'notindex-split.html', ourbigbook.SPLIT_MARKER_TEXT),
      xpath_header_split(2, 'bb', 'bb.html', ourbigbook.SPLIT_MARKER_TEXT),
    ],
    assert_xpath: {
      'notindex-split.html': [
        "//x:a[@href='include-two-levels.html' and text()='ee']",
        "//x:a[@href='include-two-levels.html#gg' and text()='gg']",
        "//x:a[@href='notindex.html#bb' and text()='bb']",
        // https://github.com/cirosantilli/ourbigbook/issues/130
        "//x:blockquote//x:a[@href='notindex.html#bb' and text()='Section 1. \"bb\"']",
        // Link to the split version.
        xpath_header_split(1, 'notindex', 'notindex.html', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Internal cross reference inside split header.
        "//x:a[@href='notindex.html#image-bb' and text()='image bb 1']",
      ],
      'bb.html': [
        // Cross-page split-header parent link.
        xpath_header_parent(1, 'bb', 'notindex.html', 'Notindex'),
        "//x:a[@href='notindex.html' and text()='bb to notindex']",
        "//x:a[@href='notindex.html#bb' and text()='bb to bb']",
        // Link to the split version.
        xpath_header_split(1, 'bb', 'notindex.html#bb', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Internal cross reference inside split header.
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
    },
    convert_before: [
      'include-two-levels.bigb',
      // https://github.com/cirosantilli/ourbigbook/issues/116
      'include-two-levels-subdir/index.bigb',
    ],
    extra_convert_opts: { split_headers: true },
    filesystem: Object.assign({}, default_filesystem, {
      'bb.png': ''
    }),
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference to non-included ids in another file with splitDefaultNotToplevel true',
  `= Notindex

\\x[index][notindex to index]

\\x[index-h2][notindex to index h2]

== Notindex h2

\\x[index][notindex h2 to index]

\\x[index-h2][notindex h2 to index h2]

=== Notindex h3

\\x[index][notindex h3 to index]
`,
  undefined,
  {
    filesystem: {
      'index.bigb': `= Index

\\x[index][index to index]

\\x[index-h2][index to index h2]

== Index h2

\\x[index][index h2 to index]

\\x[index-h2][index h2 to index h2]

=== Index h3

\\x[index][index h3 to index]

== Index h2 2

\\x[index-h2][index h2 2 to index h2]
`,
    },
    expect_not_exists: ['out'],
    assert_xpath_main: [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to index']",
        "//x:div[@class='p']//x:a[@href='index-h2.html' and text()='notindex to index h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to index']",
        "//x:div[@class='p']//x:a[@href='index-h2.html' and text()='notindex h2 to index h2']",
    ],
    assert_xpath: {
      'index.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='index to index']",
        "//x:div[@class='p']//x:a[@href='#index-h2' and text()='index to index h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='' and text()='index h2 to index']",
        "//x:div[@class='p']//x:a[@href='#index-h2' and text()='index h2 to index h2']",

        // Links to the split versions.
        xpath_header_split(2, 'index-h2', 'index-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'index-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='index h2 to index']",
        "//x:div[@class='p']//x:a[@href='' and text()='index h2 to index h2']",
        xpath_header_split(1, 'index-h2', 'index.html#index-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'notindex-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to index']",
        "//x:div[@class='p']//x:a[@href='index-h2.html' and text()='notindex h2 to index h2']",
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    },
    assert_not_xpath: {
      'index.html': [
        // There is no split version of this header.
        xpath_header_split(1, 'index', undefined, ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'index-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='index h3 to index']",
      ],
      'notindex-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='notindex h3 to index']",
      ],
    },
    convert_before: [
      'index.bigb',
    ],
    expect_not_exists: [
      'split.html',
      'nosplit.html',
      'notindex-split.html',
      'notindex-nosplit.html',
    ],
    extra_convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: {
        splitDefault: true,
        splitDefaultNotToplevel: true,
      } },
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference to non-included image in another file',
  // https://github.com/cirosantilli/ourbigbook/issues/199
  `= Notindex

\\x[image-bb]
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:div[@class='p']//x:a[@href='notindex2.html#image-bb' and text()='Figure \"bb\"']",
    ],
    convert_before: [
      'notindex2.bigb',
    ],
    filesystem: {
      'notindex2.bigb': `= Notindex2

== Notindex2 2

\\Image[aa]{check=0}
{title=bb}
`
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('cross reference with link inside it does not blow up',
  `= asdf
{id=http://example.com}

\\x[http://example.com]
`,
  [
    a('H', undefined,
      {
        level: [t('1')],
        title: [t('asdf')],
      },
      {
        id: 'http:\/\/example.com',
      }
    ),
    a('P', [
      a('x', undefined, {
        href: [
          a('a', undefined, {'href': [t('http:\/\/example.com')]}),
        ],
      }),
    ]),
  ],
);
assert_convert_ast('x to image in another file that has x title in another file',
  // https://github.com/cirosantilli/ourbigbook/issues/198
  `= Tmp

\\x[image-tmp2-2]
`,
  undefined,
  {
    convert_before: ['tmp2.bigb'],
    filesystem: {
     'tmp2.bigb': `= Tmp2

\\Image[a]{check=0}
{title=\\x[tmp2-2]}

== Tmp2 2
`,
    },
    input_path_noext: 'tmp'
  }
);
// TODO was working, but lazy now, will have to worry about
// mock ID provider or modify index.js. Edit: there is no more mock
// ID provider. Just lazy now.
//it('output_path_parts', () => {
//  const context = {options: {path_sep: PATH_SEP}};
//
//  // Non-split headers.
//  assert.deepStrictEqual(
//    ourbigbook.output_path_parts(
//      'notindex.bigb',
//      'notindex',
//      context,
//    ),
//    ['', 'notindex']
//  );
//  assert.deepStrictEqual(
//    ourbigbook.output_path_parts(
//      'index.bigb',
//      'index',
//      context,
//    ),
//    ['', 'index']
//  );
//  assert.deepStrictEqual(
//    ourbigbook.output_path_parts(
//      'README.bigb',
//      'index',
//      context,
//    ),
//    ['', 'index']
//  );
//});
// Internal cross references \x
// https://github.com/cirosantilli/ourbigbook/issues/213
assert_convert_ast('cross reference magic simple sane',
  `= Notindex

== My header

\\x[My headers]{magic}
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='My headers']",
    ],
  }
);
assert_convert_ast('cross reference magic simple insane',
  `= Notindex

== My header

<My headers>
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='My headers']",
    ],
  }
);
assert_convert_ast('cross reference magic in title',
  `= Notindex

== My header

\\Image[a.png]{check=0}
{title=<My headers> are amazing}

\\x[image-my-headers-are-amazing]
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:div[@class='p']//x:a[@href='#image-my-headers-are-amazing' and text()='Figure 1. \"My headers are amazing\"']",
    ],
  }
);
assert_convert_ast('cross reference magic insane escape',
  `a\\<>b`,
  undefined,
  {
    assert_xpath_main: [
      "//x:div[@class='p' and text()='a<>b']",
    ],
  }
);

// Infinite recursion.
// failing https://github.com/cirosantilli/ourbigbook/issues/34
assert_error('cross reference from header title to following header is not allowed',
  `= \\x[h2] aa

== h2
`, 1, 3);
assert_error('cross reference from header title to previous header is not allowed',
  `= h1

== \\x[h1] aa
`, 3, 4);
assert_convert_ast('cross reference from image title to previous non-header is not allowed',
  `\\Image[ab]{title=cd}{check=0}

\\Image[ef]{title=gh \\x[image-cd]}{check=0}
`,
  undefined,
  {
    input_path_noext: 'tmp',
    invalid_title_titles: [
      ['image-gh-image-cd', 'tmp.bigb', 3, 1],
    ],
  }
);
assert_convert_ast('cross reference from image title to following non-header is not allowed',
  `\\Image[ef]{title=gh \\x[image-cd]}{check=0}

\\Image[ab]{title=cd}{check=0}
`,
  undefined,
  {
    input_path_noext: 'tmp',
    invalid_title_titles: [
      ['image-gh-image-cd', 'tmp.bigb', 1, 1],
    ],
  }
);
assert_executable('executable: cross reference from image title to previous non-header is not allowed',
  {
    args: ['.'],
    expect_exit_status: 1,
    filesystem: {
      'README.bigb': `\\Image[ab]{title=cd}{check=0}

\\Image[ef]{title=gh \\x[image-cd]}{check=0}
`,
    }
  }
);
assert_error('cross reference infinite recursion with explicit IDs fails gracefully',
  `= \\x[h2]
{id=h1}

== \\x[h1]
{id=h2}
`, 1, 3);
assert_error('cross reference infinite recursion to self IDs fails gracefully',
  `= \\x[tmp]
`, 1, 3, 'tmp.bigb',
  {
    input_path_noext: 'tmp',
  }
);
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
// https://github.com/cirosantilli/ourbigbook/issues/120
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
// https://github.com/cirosantilli/ourbigbook/issues/100
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
    assert_xpath_main: [
      // Not `#notindex/image-bb`.
      // https://cirosantilli.com/ourbigbook#header-scope-argument-of-toplevel-headers
      "//x:a[@href='#image-bb' and text()='bb to image bb']",
    ],
    assert_xpath: {
      'notindex/bb.html': [
        "//x:a[@href='../notindex.html#cc' and text()='bb to cc']",
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
      'notindex/cc.html': [
        "//x:a[@href='../notindex.html#image-bb' and text()='cc to image bb']",
      ],
    },
    input_path_noext: 'notindex',
    extra_convert_opts: { split_headers: true },
    filesystem: { 'bb.png': '' },
  },
);
// https://github.com/cirosantilli/ourbigbook/issues/173
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
    assert_xpath: {
      'tmp-2/tmp-3.html': [
        "//x:a[@href='../tmp.html' and text()='tmp 3 to tmp']",
        "//x:a[@href='../tmp.html#tmp-2' and text()='tmp 3 to tmp 2']",
        "//x:a[@href='../tmp.html#tmp-2/tmp-3' and text()='tmp 3 to tmp 3']",
      ],
    },
    extra_convert_opts: { split_headers: true },
    input_path_noext: 'tmp',
  },
);
// https://cirosantilli.com/ourbigbook#header-scope-argument-of-toplevel-headers
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
    assert_xpath_main: [
      // Not `toplevel-scope.html#toplevel-scope`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html' and text()='toplevel scope']",
      // Not `toplevel-scope.html#toplevel-scope/h2`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html#h2' and text()='h2']",
    ],
    assert_xpath: {
      // TODO https://github.com/cirosantilli/ourbigbook/issues/139
      //'notindex-split.html': [
      //  "//x:a[@href='toplevel-scope.html#image-h1' and text()='image h1']",
      //  "//x:a[@href='toplevel-scope/h2.html#image-h2' and text()='image h2']",
      //],
    },
    convert_before: ['toplevel-scope.bigb'],
    input_path_noext: 'notindex',
    extra_convert_opts: { split_headers: true },
    filesystem: {
      'toplevel-scope.bigb': `= Toplevel scope
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
    assert_xpath_main: [
      xpath_header(1, 'notindex'),
      "//x:div[@class='p']//x:a[@href='' and text()='link to notindex']",
      "//x:div[@class='p']//x:a[@href='#h2' and text()='link to h2']",
      xpath_header(2, 'h2'),
    ],
  }
);
assert_convert_ast('x leading slash to escape scopes works across files',
  `\\x[/notindex]`,
  undefined,
  {
    convert_before: ['notindex.bigb'],
    filesystem: {
     'notindex.bigb': `= Notindex
`,
    },
  }
);
// This test can only work after:
// https://github.com/cirosantilli/ourbigbook/issues/188
// There is no other way to test this currently, as we can't have scopes
// across source files, and since scope is a boolean, and therefore can only
// match the header's ID itself. The functionality has in theory been implemented
// in the commit that adds this commented out test.
//assert_convert_ast('scopes hierarchy resolution works across files',
//  `= Index
//
//== Index scope
//{scope}
//
//\\Include[notindex]
//
//== Index scope 2
//{scope}
//
//\\x[notindex-h2][index scope 2 to notindex h2]`,
//  undefined,
//  {
//    convert_before: ['notindex.bigb'],
//    filesystem: {
//     'notindex.bigb': `= Notindex
//
//== Notindex h2
//`,
//    },
//    assert_xpath_main: [
//      "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='index scope 2 to notindex h2']",
//    ]
//  }
//);
assert_convert_ast('scopes hierarchy resolution works across files with directories',
  `= Notindex

\\x[notindex2][index to notindex2]

\\x[notindex2-h2][index to notindex2 h2]

== Notindex h2
{tag=notindex2}
{tag=notindex2-h2}
`,
  undefined,
  {
    assert_xpath: {
      'subdir/notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-h2' and text()='index to notindex2 h2']",
        "//*[contains(@class, 'h-nav')]//x:span[@class='test-tags']//x:a[@href='notindex2.html#notindex2-h2']",
      ],
      'subdir/notindex2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
    convert_before_norender: ['subdir/notindex.bigb', 'subdir/notindex2.bigb'],
    convert_before: ['subdir/notindex2.bigb'],
    extra_convert_opts: {
      // Get rid of this and fix:
      // https://github.com/cirosantilli/ourbigbook/issues/229
      split_headers: true,
      ref_prefix: 'subdir',
    },
    filesystem: {
     'subdir/notindex2.bigb': `= Notindex2

== Notindex2 h2
`,
    },
    input_path_noext: 'subdir/notindex',
  }
);

// Subdir.
assert_convert_ast('subdir basic',
  `= Notindex

\\x[asdf/qwer/notindex2][notindex to notindex2]

\\x[asdf/qwer/notindex2-2][notindex to notindex2 2]
`,
  undefined,
  {
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html' and text()='notindex to notindex2']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-2' and text()='notindex to notindex2 2']",
      ]
    },
    convert_before: ['notindex2.bigb'],
    filesystem: {
     'notindex2.bigb': `= Notindex2
{subdir=asdf/qwer}

== Notindex2 2
`,
    },
    input_path_noext: 'notindex',
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
    assert_xpath_main: [
      // The toplevel header does not have any numerical prefix, e.g. "1. My header",
      // it is just "My header".
      xpath_header(1, 'notindex', "x:a[@href='' and text()='My header']"),
      xpath_header(2, 'my-header-2', "x:a[@href='#my-header-2' and text()='1. My header 2']"),
    ],
    assert_xpath: {
      'my-header-2.html': [
        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'my-header-2', "x:a[@href='' and text()='My header 2']"),
      ],
      'my-header-3.html': [
        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, 'my-header-3', "x:a[@href='' and text()='My header 3']"),
      ],
    },
    extra_convert_opts: { split_headers: true },
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
// https://github.com/cirosantilli/ourbigbook/issues/32
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
//// This would be the ideal behaviour, but I'm lazy now.
//// https://github.com/cirosantilli/ourbigbook/issues/200
//assert_convert_ast('full link to synonym renders the same as full link to the main header',
//  `= 1
//
//\\Q[\\x[1-3]{full}]
//
//== 1 2
//
//= 1 3
//{synonym}
//`,
//  undefined,
//  {
//    assert_xpath_main: [
//      "//x:blockquote//x:a[@href='#1-2' and text()='Section 1. \"1 2\"']",
//    ],
//  }
//);
// This is not the ideal behaviour, the above test would be the ideal.
// But it will be good enough for now.
// https://github.com/cirosantilli/ourbigbook/issues/200
assert_convert_ast('full link to synonym with title2 does not get dummy empty parenthesis',
  `= 1

\\Q[\\x[1-3]{full}]

== 1 2

= 1 3
{synonym}
{title2}
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:blockquote//x:a[@href='#1-2' and text()='Section 1. \"1 3\"']",
    ],
  }
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
    assert_xpath_main: [
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
    assert_xpath: {
      'tmp-6.html': [
        "//*[@id='toc']//x:a[@href='tmp-7.html' and text()='1. tmp 7']",
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1. tmp 8']",
      ],
    },
    extra_convert_opts: { split_headers: true },
  },
);
assert_convert_ast('header numbered ourbigbook.json',
  header_numbered_input,
  undefined,
  {
    assert_xpath_main: [
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
    assert_xpath: {
      'tmp-6.html': [
        "//*[@id='toc']//x:a[@href='tmp-7.html' and text()='1. tmp 7']",
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='toc']//x:a[@href='tmp-8.html' and text()='1. tmp 8']",
      ],
    },
    extra_convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    }
  },
);
assert_convert_ast('header splitDefault on ourbigbook.json',
  `= Index

\\Include[notindex]

== h2
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[@id='toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
      "//*[@id='toc']//x:a[@href='notindex-h2.html' and text()='1.1. Notindex h2']",
    ],
    assert_xpath: {
      'notindex.html': [
        "//*[@id='toc']//x:a[@href='notindex-h2.html' and text()='1. Notindex h2']",
      ],
    },
    convert_before: ['notindex.bigb'],
    extra_convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { splitDefault: true } }
    },
    filesystem: {
      'notindex.bigb': `= Notindex

== Notindex h2
`
    }
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
// https://github.com/cirosantilli/ourbigbook/issues/171
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_xpath_main: [
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
    assert_not_xpath_main: [
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
    assert_xpath_main: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
      "//x:span[@class='caption-prefix' and text()='Code 2']",
    ],
    assert_not_xpath_main: [
      "//x:span[@class='caption-prefix' and text()='Code 3']",
    ],
  },
)

// lint h-parent
assert_no_error('header parent works with ourbigbook.json lint h-parent equal parent and no includes',
  `= 1

= 2
{parent=1}
`,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_error('header number fails with ourbigbook.json lint h-parent = parent',
  `= 1

== 2
`,
  3, 1, undefined,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_no_error('header number works with ourbigbook.json lint h-parent = number',
  `= 1

== 2
`,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
);
assert_error('header parent fails with ourbigbook.json lint h-parent = number',
  `= 1

= 2
{parent=1}
`,
  3, 1, undefined,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
);
assert_no_error('header parent works with ourbigbook.json lint h-parent equal parent and includes with parent',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels-parent]
`,
  {
    extra_convert_opts: {
      ourbigbook_json: { lint: { 'h-parent': 'parent', } },
      embed_includes: true,
    }
  }
);
assert_error('header parent fails with ourbigbook.json lint h-parent equal parent and includes with number',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels]
`,
  5, 1, 'include-two-levels.bigb',
  {
    extra_convert_opts: {
      ourbigbook_json: { lint: { 'h-parent': 'parent', } },
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
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'child', } } } }
);
assert_no_error('lint h-tag child pass',
  `= 1
{child=2}

== 2
`,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'child', } } } }
);
assert_error('lint h-tag tag failure',
  `= 1
{child=2}

== 2
`,
  2, 1, undefined,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
);
assert_no_error('lint h-tag tag pass',
  `= 1
{tag=2}

== 2
`,
  { extra_convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
);

// Word counts.
assert_convert_ast('word count simple',
  `= h1

11 22 33
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='3']",
    ],
  }
);
assert_convert_ast('word count x',
  `= h1

I like \\x[my-h2]

== My h2
`,
  undefined,
  {
    assert_xpath_main: [
      // TODO the desired value is 4. 2 is not terrible though, better than 3 if we were considering the href.
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='2']",
    ],
  }
);
assert_convert_ast('word count descendant in source',
  `= h1

11 22 33

== h2

44 55
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='3']",
      "//*[contains(@class, 'h-nav')]//*[@class='word-count-descendant' and text()='5']",
    ],
    assert_xpath: {
      'h2.html': [
        "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='2']",
      ]
    },
    extra_convert_opts: { split_headers: true },
  }
);
assert_convert_ast('word count descendant from include without embed includes',
  `= h1

11 22 33

\\Include[notindex]
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[contains(@class, 'h-nav')]//*[contains(@class, 'word-count') and text()='3']",
      "//*[contains(@class, 'h-nav')]//*[contains(@class, 'word-count-descendant') and text()='5']",
    ],
    convert_before: ['notindex.bigb'],
    filesystem: {
      'notindex.bigb': `= Notindex

44 55
`
    }
  }
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
// https://github.com/cirosantilli/ourbigbook/issues/143
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
{id=&\\<>"'}
`,
  undefined,
  {
    assert_xpath_main: [
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
    assert_xpath_main: [
      // There is a self-link to the Toc.
      "//*[@id='toc']",
      "//*[@id='toc']//x:a[@href='#toc' and text()='Table of contents']",

      // ToC links have parent toc entry links.
      // Toplevel entries point to the ToC toplevel.
      `//*[@id='toc']//*[@id='toc-h1-1']//x:a[@href='#toc' and text()=' \"h1\"']`,
      `//*[@id='toc']//*[@id='toc-h1-2']//x:a[@href='#toc' and text()=' \"h1\"']`,
      // Inner entries point to their parent entries.
      `//*[@id='toc']//*[@id='toc-h1-2-1']//x:a[@href='#toc-h1-2' and text()=' \"h1 2\"']`,

      // The ToC numbers look OK.
      "//*[@id='toc']//x:a[@href='#h1-2' and text()='2. h1 2']",

      // The headers have ToC links.
      `${xpath_header(2, 'h1-1')}//x:a[@href='#toc-h1-1' and text()=' toc']`,
      `${xpath_header(2, 'h1-2')}//x:a[@href='#toc-h1-2' and text()=' toc']`,
      `${xpath_header(3, 'h1-2-1')}//x:a[@href='#toc-h1-2-1' and text()=' toc']`,

      // Descendant count.
      "//*[@id='toc']//*[@class='title-div']//*[@class='descendant-count' and text()='4']",
      "//*[@id='toc']//*[@id='toc-h1-2']//*[@class='descendant-count' and text()='2']",
    ],
    assert_xpath: {
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
        `//*[@id='toc']//*[@id='toc-h1-2-1']//x:a[@href='#toc' and text()=' \"h1 2\"']`,
        `//*[@id='toc']//*[@id='toc-h1-2-1-1']//x:a[@href='#toc-h1-2-1' and text()=' \"h1 2 1\"']`,

        // Descendant count.
        "//*[@id='toc']//*[@class='title-div']//*[@class='descendant-count' and text()='2']",
        "//*[@id='toc']//*[@id='toc-h1-2-1']//*[@class='descendant-count' and text()='1']",
      ],
    },
    assert_not_xpath: {
      // A node without no children headers has no ToC,
      // as it would just be empty and waste space.
      'h1-2-1-1.html': ["//*[text()='Table of contents']"],
    },
    extra_convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  },
);
assert_error('toc is a reserved id',
  `= h1

== toc
`,
  3, 1);
assert_convert_ast('table of contents contains included headers numbered without embed includes',
  `= Notindex

\\Q[\\x[notindex2]{full}]

\\Include[notindex2]

== Notindex h2
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:blockquote//x:a[@href='notindex2.html' and text()='Section 1. \"Notindex2\"']",
      "//*[@id='toc']//x:a[@href='notindex2.html' and @data-test='0' and text()='1. Notindex2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2' and @data-test='1' and text()='1.1. Notindex2 h2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h3' and @data-test='2' and text()='1.2. Notindex2 h3']",
      "//*[@id='toc']//x:a[@href='notindex3.html' and @data-test='3' and text()='1.2.1. Notindex3']",
      "//*[@id='toc']//x:a[@href='notindex3.html#notindex3-h2' and @data-test='4' and text()='1.2.1.1. Notindex3 h2']",
      "//*[@id='toc']//x:a[@href='notindex3.html#notindex3-h3' and @data-test='5' and text()='1.2.1.2. Notindex3 h3']",
      "//*[@id='toc']//x:a[@href='#notindex-h2' and @data-test='6' and text()='2. Notindex h2']",
    ],
    assert_xpath: {
      'notindex-split.html': [
        // Links to external source files keep the default split just like regular links.
        "//*[@id='toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
        "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1.1. Notindex2 h2']",
        "//*[@id='toc']//x:a[@href='notindex-h2.html' and text()='2. Notindex h2']",
      ],
    },
    convert_before: [
      'notindex3.bigb',
      'notindex2.bigb',
    ],
    extra_convert_opts: { split_headers: true },
    filesystem: {
      'notindex2.bigb': `= Notindex2

== Notindex2 h2

== Notindex2 h3

\\Include[notindex3]
`,
      'notindex3.bigb': `= Notindex3

== Notindex3 h2

== Notindex3 h3
`,
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('table of contents respects numbered=0 of included headers',
  `= Notindex

\\Include[notindex2]

== Notindex h2
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[@id='toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
      "//*[@id='toc']//x:a[@href='#notindex-h2' and text()='2. Notindex h2']",
    ],
    convert_before: [
      'notindex2.bigb',
    ],
    filesystem: {
      'notindex2.bigb': `= Notindex2
{numbered=0}

== Notindex2 h2
`,
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('table of contents include placeholder header has no number when under numbered=0',
  `= Notindex
{numbered=0}

\\Q[\\x[notindex2]{full}]

\\Include[notindex2]

== Notindex h2
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:blockquote//x:a[@href='notindex2.html' and text()='Section \"Notindex2\"']",
      "//*[@id='toc']//x:a[@href='notindex2.html' and text()='Notindex2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1. Notindex2 h2']",
      "//*[@id='toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
    ],
    convert_before: [
      'notindex2.bigb',
    ],
    filesystem: {
      'notindex2.bigb': `= Notindex2

== Notindex2 h2
`,
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('table of contents does not show synonyms of included headers',
  `= Notindex

\\Include[notindex2]
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[@id='toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1.1. Notindex2 h2']",
      "//*[@id='toc']//x:a[@href='notindex2.html#notindex2-h2-2' and text()='1.2. Notindex2 h2 2']",
    ],
    assert_not_xpath_main: [
      "//*[@id='toc']//x:a[contains(text(),'synonym')]",
    ],
    convert_before: [
      'notindex2.bigb',
    ],
    filesystem: {
      'notindex2.bigb': `= Notindex2

== Notindex2 h2

= Notindex2 h2 synonym
{synonym}

== Notindex2 h2 2
`,
    },
    input_path_noext: 'notindex',
  },
);
assert_convert_ast('header numbered=0 in ourbigbook.json works across source files and on table of contents',
  `= Index

\\Include[notindex]

== H2
`,
  undefined,
  {
    assert_xpath_main: [
      "//*[@id='toc']//x:a[@href='notindex.html' and text()='Notindex']",
      "//*[@id='toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
      "//*[@id='toc']//x:a[@href='#h2' and text()='H2']",
    ],
    assert_xpath: {
      'notindex.html': [
        "//*[@id='toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
      ],
    },

    convert_before: ['notindex.bigb'],
    extra_convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'notindex.bigb': `= Notindex

== Notindex h2
`,
    },
  },
);
assert_convert_ast('split header with an include and no headers has a single table of contents',
  // At 074bacbdd3dc9d3fa8dafec74200043f42779bec was getting two.
  `= Index

\\Include[notindex]
`,
  undefined,
  {
    assert_xpath: {
      'split.html': [
        "//*[@id='toc']",
      ],
    },
    convert_before: ['notindex.bigb'],
    extra_convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'notindex.bigb': `= Notindex
`,
    },
    input_path_noext: 'index',
  },
);
assert_convert_ast('toplevel scope gets removed on table of contents of included headers',
  `= Index

\\Q[\\x[notindex/notindex-h2]{full}]

\\Include[notindex]
`,
  undefined,
  {
    assert_xpath_main: [
      "//x:blockquote//x:a[@href='notindex.html#notindex-h2' and text()='Section 1.1. \"Notindex h2\"']",
      "//*[@id='toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
      "//*[@id='toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
    ],
    assert_xpath: {
      'split.html': [
        "//*[@id='toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
    },
    convert_before: ['notindex.bigb'],
    extra_convert_opts: { split_headers: true },
    filesystem: {
      'notindex.bigb': `= Notindex
{scope}

== Notindex h2
`,
    },
  },
);

assert_executable('executable: toplevel scope gets removed on table of contents of included headers',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{scope}

== Notindex h2
`,
    },
    assert_xpath: {
      'index.html': [
        "//*[@id='toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
      'split.html': [
        "//*[@id='toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
    },
  },
);
assert_convert_ast('the toc is added before the first h1 when there are multiple toplevel h1',
  `aa

= h1

= h2
`,
  [
    a('P', [t('aa')]),
    a('Toc'),
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('H', undefined, {level: [t('1')], title: [t('h2')]}),
  ],
)
assert_convert_ast('ancestors list shows after toc on toplevel',
  `= Index

\\Include[notindex]

== h2

=== h3

==== h4
`,
  undefined,
  {
    filesystem: {
      'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'notindex2.bigb': `= Notindex 2

\\Include[notindex3]
`,
      'notindex3.bigb': `= Notindex 2
`
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb', 'notindex2.bigb', 'notindex3.bigb'],
    convert_before: ['notindex.bigb', 'notindex2.bigb', 'notindex3.bigb'],
    input_path_noext: 'index',
    extra_convert_opts: { split_headers: true },
    assert_xpath: {
      'h2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      ],
      'h3.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h2']`,
      ],
      'h4.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h3']`,
      ],
      'notindex.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      ],
      'notindex2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
      ],
      'notindex3.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html']`,
      ],
    },
    assert_not_xpath: {
      'index.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
);

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
    convert_before: ['include-two-levels.bigb'],
  },
);
// https://github.com/cirosantilli/ourbigbook/issues/74
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
      assert_xpath_main: [
        "//x:div[@class='p']//x:a[@href='#include-two-levels' and text()='ee']",
        "//x:div[@class='p']//x:a[@href='#gg' and text()='gg']",
      ],
      extra_convert_opts: { split_headers: true },
    },
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
// https://github.com/cirosantilli/ourbigbook/issues/35
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
// https://github.com/cirosantilli/ourbigbook/issues/23
assert_error('include with error reports error on the include source',
  `= aa

bb

\\Include[include-with-error]
`,
  3, 1, 'include-with-error.bigb',
  include_opts
);
const circular_entry = `= notindex

\\Include[include-circular]
`;
assert_error('include circular dependency 1 <-> 2',
  circular_entry,
  // TODO works from CLI call......... fuck, why.
  // Similar problem as in test below.
  //3, 1, 'include-circular.bigb',
  undefined, undefined, undefined,
  {
    extra_convert_opts: {
      embed_includes: true,
      input_path_noext: 'notindex',
    },
    has_error: true,
    filesystem: {
      'notindex.bigb': circular_entry,
      'include-circular.bigb': `= include-circular

\\Include[notindex]
`
    }
  }
);
// TODO error this is legitimately failing on CLI, bad error messages show
// up on CLI reproduction.
// The root problem is that include_path_set does not contain
// include-circular-2.bigb, and that leads to several:
// ```
// file not found on database: "${target_input_path}", needed for toplevel scope removal
// on ToC conversion.
assert_error('include circular dependency 1 -> 2 <-> 3',
  `= aa

\\Include[include-circular-1]
`,
  // 3, 1, 'include-circular-2.bigb',
  undefined, undefined, undefined,
  ourbigbook.clone_and_set(include_opts, 'has_error', true)
);
assert_convert_ast('include without parent header with embed includes',
  // https://github.com/cirosantilli/ourbigbook/issues/73
  `\\Include[include-one-level-1]
\\Include[include-one-level-2]
`,
  [
    // TODO this is what we really want.
    //a('Toc'),
    a('H', undefined, {level: [t('1')], title: [t('cc')]}),
    a('P', [t('dd')]),
    a('H', undefined, {level: [t('1')], title: [t('ee')]}),
    a('P', [t('ff')]),
  ],
  {
    //assert_xpath_main: [
    //  // TODO getting corrupt <hNaN>
    //  xpath_header(1, 'include-one-level-1'),
    //  xpath_header(1, 'include-one-level-2'),
    //],
    extra_convert_opts: {
      embed_includes: true,
    }
  },
);
assert_convert_ast('include without parent header without embed includes',
  // https://github.com/cirosantilli/ourbigbook/issues/73
  `aa

\\Include[include-one-level-1]
\\Include[include-one-level-2]
`,
  [
    a('P', [t('aa')]),
    a('Toc'),
    a('H', undefined, {level: [t('1')], title: [t('cc')]}),
    a('P', [
      a(
        'x',
        [t('This section is present in another page, follow this link to view it.')],
        {'href': [t('include-one-level-1')]}
      ),
    ]),
    a('H', undefined, {level: [t('1')], title: [t('ee')]}),
    a('P', [
      a(
        'x',
        [t('This section is present in another page, follow this link to view it.')],
        {'href': [t('include-one-level-2')]}
      ),
    ]),
  ],
  {
    convert_before: [
      'include-one-level-1.bigb',
      'include-one-level-2.bigb',
    ],
    assert_xpath_main: [
      // TODO getting corrupt <hNaN>
      //xpath_header(1, 'include-one-level-1'),
      //xpath_header(1, 'include-one-level-2'),
    ],
  },
);
assert_error('empty include in header title fails gracefully',
  // https://github.com/cirosantilli/ourbigbook/issues/195
  `= tmp

== \\Include
`,
  3, 4
);
assert_error('empty x in header title fails gracefully',
  `= tmp

== \\x
`,
  3, 4
);
assert_error('header inside header fails gracefully',
  `= \\H[2]
`,
  1, 3, 'tmp.bigb',
  {
    input_path_noext: 'tmp',
  }
);

assert_error('include to file that exists in header title fails gracefully',
  // https://github.com/cirosantilli/ourbigbook/issues/195
  `= tmp

== \\Include[tmp2]
`,
  3, 4, 'tmp.bigb',
  {
    filesystem: {
      'tmp2.bigb': `= Tmp2
`
    },
    convert_before: ['tmp2.bigb'],
    input_path_noext: 'tmp',
  }
);
assert_error('include to file that does not exist fails gracefully',
  `= h1

\\Include[asdf]
`,
  3, 1
);
assert_error('include to file that does exists without embed includes before extracting IDs fails gracefully',
  `= h1

\\Include[asdf]
`,
  3, 1, undefined, {
    // No error with this.
    //convert_before: ['asdf.bigb'],
    filesystem: {
      'asdf.bigb': '= asdf'
    }
  }
);
assert_convert_ast('relative include in subdirectory',
  `= Index

\\Include[notindex]
`,
  undefined,
  {
    convert_before: ['s1/notindex2.bigb', 's1/notindex.bigb'],
    filesystem: {
      's1/notindex.bigb': `= Notindex

\\Include[notindex2]

== Notindex h2`,
      's1/notindex2.bigb': `= Notindex2
`,
      // https://github.com/cirosantilli/ourbigbook/issues/214
      'top.bigb': `= Top
`,
    },
    assert_xpath_main: [
      "//*[@id='toc']//x:a[@href='s1/notindex.html' and @data-test='0' and text()='1. Notindex']",
      "//*[@id='toc']//x:a[@href='s1/notindex2.html' and @data-test='1' and text()='1.1. Notindex2']",
      "//*[@id='toc']//x:a[@href='s1/notindex.html#notindex-h2' and @data-test='2' and text()='1.2. Notindex h2']",
      // https://github.com/cirosantilli/ourbigbook/issues/214
      //"//*[@id='toc']//x:a[@href='../top.html' and @data-test='2' and text()='2. Top']",
    ],
    input_path_noext: 's1/index',
  }
);
assert_convert_ast('include from parent to subdirectory',
  `= Index

\\x[subdir][index to subdir]

\\x[subdir/h2][index to subdir h2]

\\Include[subdir]
\\Include[subdir/notindex]
`,
  undefined,
  {
    convert_before: ['subdir/index.bigb', 'subdir/notindex.bigb'],
    filesystem: {
      'subdir/index.bigb': `= Index

== h2
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    input_path_noext: 'index',
    assert_xpath: {
      'index.html': [
        "//x:a[@href='subdir.html' and text()='index to subdir']",
        "//x:a[@href='subdir.html#h2' and text()='index to subdir h2']",
      ],
    },
  }
);
assert_convert_ast('subdir index.bigb outputs to subdir without trailing slash with html_x_extension=true',
  `= Subdir

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]
`,
  undefined,
  {
    convert_before: ['subdir/notindex.bigb'],
    filesystem: {
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    input_path_noext: 'subdir/index',
    extra_convert_opts: { html_x_extension: true },
    assert_xpath: {
      'subdir.html': [
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']" ,
      ],
    },
  }
);
assert_convert_ast('subdir index.bigb outputs to subdir without trailing slash with html_x_extension=false',
  `= Subdir

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]
`,
  undefined,
  {
    convert_before: ['subdir/notindex.bigb', 'subdir/index.bigb'],
    filesystem: {
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    input_path_noext: 'subdir/index',
    extra_convert_opts: { html_x_extension: false },
    assert_xpath: {
      'subdir.html': [
        "//x:a[@href='subdir/notindex' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex#notindex-h2' and text()='link to subdir notindex h2']",
      ],
    },
  }
);
assert_convert_ast('subdir index.bigb removes leading @ from links with the remove_leading_at option',
  `= Subdir

\\x[notindex][link to subdir notindex]

\\x[notindex-h2][link to subdir notindex h2]

\\Include[notindex]
`,
  undefined,
  {

    convert_before_norender: ['@subdir/index.bigb'],
    convert_before: ['@subdir/notindex.bigb', '@subdir/@notindexat.bigb'],
    filesystem: {
      '@subdir/notindex.bigb': `= Notindex

\\x[@subdir][link to subdir]

== Notindex h2
`,
      '@subdir/@notindexat.bigb': `= Notindexat

== Notindexat h2
`,
    },
    input_path_noext: '@subdir/index',
    extra_convert_opts: {
      remove_leading_at: true,
      magic_leading_at: false,
    },
    assert_xpath: {
      '@subdir.html': [
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']" ,
      ],
      '@subdir/notindex.html': [
        "//x:a[@href='../subdir.html' and text()='link to subdir']",
        xpath_header_parent(1, 'notindex', '../subdir.html', 'Subdir'),
      ],
    },
  }
);
assert_convert_ast('include of a header with a tag or child in a third file does not blow up',
  `= Index

\\Include[notindex]
`,
  undefined,
  {
    filesystem: {
      'notindex.bigb': `= Notindex
{child=notindex2}
{tag=notindex2}
`,
      'notindex2.bigb': `= Notindex 2
`,
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb', 'notindex2.bigb'],
    input_path_noext: 'index',
  }
);
assert_convert_ast('tags show on embed include',
  `= Index

\\Include[notindex]
`,
  undefined,
  {
    filesystem: {
      'notindex.bigb': `= Notindex
{tag=notindex2}
`,
      'notindex2.bigb': `= Notindex 2
`,
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb', 'notindex2.bigb'],
    input_path_noext: 'index',
    assert_xpath_main: [
      "//*[contains(@class, 'h-nav')]//x:span[@class='test-tags']//x:a[@href='notindex2.html']",
    ],
    extra_convert_opts: {
      embed_includes: true,
    }
  }
);

// OurbigbookExample
assert_convert_ast('OurbigbookExample basic',
  `\\OurbigbookExample[[aa \\i[bb] cc]]`,
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
assert_convert_ast('OurbigbookExample that links to id in another file',
  `\\OurbigbookExample[[\\x[notindex\\]]]`,
  undefined,
  {
    assert_xpath_main: [
      "//x:a[@href='notindex.html' and text()='notindex h1']",
    ],
    convert_before: ['notindex.bigb'],
    filesystem: {
     'notindex.bigb': `= notindex h1
`,
    },
    input_path_noext: 'abc',
  },
);

// ID auto-generation.
// https://cirosantilli.com/ourbigbook/automatic-id-from-title
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
// https://github.com/cirosantilli/ourbigbook/issues/4
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
  { extra_convert_opts: { ourbigbook_json: { id: { normalize: { latin: false, punctuation: false } } } } }
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
`, 1, 3);
// https://github.com/cirosantilli/ourbigbook/issues/45
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
  4, 1, 'index.bigb',
  {
    error_message: ourbigbook.duplicate_id_error_message('tmp', 'index.bigb', 1, 1),
    input_path_noext: 'index',
  },
);
assert_convert_ast('id conflict with id on another file simple',
  // https://github.com/cirosantilli/ourbigbook/issues/201
  `= index

== notindex h2
`,
  undefined,
  {
    convert_before: ['notindex.bigb'],
    duplicate_ids: [
      ['notindex-h2', 'index.bigb', 3, 1],
      ['notindex-h2', 'notindex.bigb', 3, 1],
    ],
    filesystem: {
      'notindex.bigb': `= notindex

== notindex h2
`,
    },
    input_path_noext: 'index'
  }
);
assert_executable('executable: id conflict with id on another file simple',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= index

== notindex h2
`,
      'notindex.bigb': `= notindex

== notindex h2
`,
    },
    expect_exit_status: 1,
  }
);
assert_convert_ast('id conflict with id on another file where conflict header has a child heder',
  // Bug introduced at ef9e2445654300c4ac41e1d06d3d2a1889dd0554
  `= tmp

== aa
`,
  undefined,
  {
    convert_before: ['tmp2.bigb'],
    duplicate_ids: [
      ['aa', 'tmp.bigb', 3, 1],
      ['aa', 'tmp2.bigb', 3, 1],
    ],
    filesystem: {
      'tmp2.bigb': `= tmp2

== aa

=== bb
`,
    },
    input_path_noext: 'tmp'
  }
);

// title_to_id
assert_equal('title_to_id with hyphen', ourbigbook.title_to_id('.0A. - z.a Z..'), '0a-z-a-z');
assert_equal('title_to_id with unicode chars', ourbigbook.title_to_id('0A.你好z'), '0a-你好z');

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
// https://github.com/cirosantilli/ourbigbook/issues/10
assert_error('explicit toplevel macro',
  `\\toplevel`, 1, 1,
);

// split_headers
// A split headers hello world.
assert_convert_ast('one paragraph implicit split headers',
  'ab\n',
  [a('P', [t('ab')])],
  {
    extra_convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  }
);

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

// API minimal tests.
it(`api: x does not blow up without ID provider`, async function () {
  const out = await ourbigbook.convert(`= h1

\\x[h2]

== h2
`, {'body_only': true})
})

// ourbigbook executable tests.
assert_executable(
  'executable: input from stdin produces output on stdout',
  {
    stdin: 'aabb',
    expect_not_exists: ['out'],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
);
assert_executable(
  // Was blowing up on file existence check.
  'executable: input from stdin with relative link does not blow up',
  {
    stdin: '\\a[asdf]',
    expect_not_exists: ['out'],
    assert_xpath_stdout: ["//x:a[@href='asdf']"],
    filesystem: { 'asdf': '' },
  }
);
assert_executable(
  'executable: input from file produces an output file',
  {
    args: ['notindex.bigb'],
    filesystem: {
      'notindex.bigb': `= Notindex\n`,
    },
    assert_xpath: {
      'notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
const complex_filesystem = {
  'README.bigb': `= Index

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

\\OurbigbookExample[[
\\Q[A Ourbigbook example!]
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
  'notindex.bigb': `= Notindex

\\x[index][link to index]

\\x[h2][link to h2]

== notindex h2
`,
  'toplevel-scope.bigb': `= Toplevel scope
{scope}

== Toplevel scope h2

== Nested scope
{scope}

=== Nested scope 2
{scope}
`,
  'included-by-index.bigb': `= Included by index

== Included by index h2
`,
  'included-by-h2-in-index.bigb': `= Included by h2 in index

== Included by h2 in index h2
`,
  'notindex-splitsuffix.bigb': `= Notindex splitsuffix
{splitSuffix=asdf}
`,
  'scss.scss': `body { color: red }`,
  'ourbigbook.json': `{}\n`,
  'subdir/index.bigb': `= Subdir index

\\x[index][link to toplevel]

\\x[h2][link to toplevel subheader]

\\x[has-split-suffix][link to has split suffix]

\\x[notindex][link to subdir notindex]

\\Include[included-by-subdir-index]

== Scope
{scope}

=== h3

\\x[scope][scope/h3 to scope]

\\x[h3][scope/h3 to scope/h3]

== Index h2
`,
  'subdir/notindex.bigb': `= Subdir notindex

== Notindex h2

== Notindex scope
{scope}

=== h3
`,
  'subdir/included-by-subdir-index.bigb': `= Included by subdir index

== Included by subdir index h2
`,
  'subdir/myfile.txt': `Hello world

Goodbye world.
`,
};
assert_executable(
  'executable: input from directory with ourbigbook.json produces several output files',
  {
    args: ['--split-headers', '.'],
    filesystem: complex_filesystem,
    assert_xpath: {
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
      'index.html': [
        xpath_header(1, 'index'),
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='link to notindex h2']",
        "//x:div[@class='p']//x:a[@href='#has-split-suffix' and text()='link to has split suffix']",
        "//x:a[@href='subdir.html' and text()='link to subdir']",
        "//x:a[@href='subdir.html#index-h2' and text()='link to subdir index h2']",
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']",

        // ToC entries of includes point directly to the separate file, not to the plceholder header.
        // e.g. `included-by-index.html` instead of `#included-by-index`.
        "//x:a[@href='included-by-index.html' and text()='link to included by index']",
        "//*[@id='toc']//x:a[@href='included-by-index.html' and text()='1. Included by index']",

        xpath_header(2, 'included-by-index'),
        "//x:blockquote[text()='A Ourbigbook example!']",
        xpath_header_split(2, 'index-scope', 'index-scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(3, 'index-scope/index-scope-2', 'index-scope/index-scope-2.html', ourbigbook.SPLIT_MARKER_TEXT),
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
      'notindex-splitsuffix-asdf.html': [
      ],
      'split.html': [
        // Full links between split header pages have correct numbering.
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='Section 2. \"h2\"']",

        // OurbigbookExample renders in split header.
        "//x:blockquote[text()='A Ourbigbook example!']",

        // ToC entries point to the split version of articles.
        "//*[@id='toc']//x:a[@href='h2.html' and text()='2. h2']",
        // ToC entries of includes always point directly to the separate file.
        "//*[@id='toc']//x:a[@href='included-by-index.html' and text()='1. Included by index']",
        // TODO This is more correct with the `1. `. Maybe wait for https://github.com/cirosantilli/ourbigbook/issues/126
        // to make sure we don't have to rewrite everything.
        //"//*[@id='toc']//x:a[@href='included-by-index-split.html' and text()='1. Included by index']",
      ],
      'subdir.html': [
        xpath_header(1),
        xpath_header_split(1, '', 'subdir/split.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(2, 'index-h2'),
        xpath_header_split(2, 'index-h2', 'subdir/index-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(2, 'scope'),
        xpath_header_split(2, 'scope', 'subdir/scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(3, 'scope/h3'),
        xpath_header_split(3, 'scope/h3', 'subdir/scope/h3.html', ourbigbook.SPLIT_MARKER_TEXT),
        "//x:a[@href='index.html' and text()='link to toplevel']",
        "//x:a[@href='index.html#h2' and text()='link to toplevel subheader']",
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
      ],
      'subdir/split.html': [
        xpath_header(1, ''),
        xpath_header_split(1, '', '../subdir.html', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Check that split suffix works. Should be has-split-suffix-split.html,
        // not has-split-suffix.html.
        "//x:div[@class='p']//x:a[@href='../index.html#has-split-suffix' and text()='link to has split suffix']",
      ],
      'subdir/scope/h3.html': [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../../subdir.html#scope/h3', ourbigbook.NOSPLIT_MARKER_TEXT),
        "//x:div[@class='p']//x:a[@href='../../subdir.html#scope' and text()='scope/h3 to scope']",
        "//x:div[@class='p']//x:a[@href='../../subdir.html#scope/h3' and text()='scope/h3 to scope/h3']",
      ],
      'subdir/notindex.html': [
        xpath_header(1, 'notindex'),
        xpath_header(2, 'notindex-h2'),
        xpath_header_split(2, 'notindex-h2', 'notindex-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'subdir/notindex-scope/h3.html': [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../notindex.html#notindex-scope/h3', ourbigbook.NOSPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'index-scope', 'index.html#index-scope', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'index-scope/index-scope-child.html': [
        // https://github.com/cirosantilli/ourbigbook/issues/159
        xpath_header_split(1, 'index-scope-child', '../index.html#index-scope/index-scope-child', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'index-scope/index-scope-2.html': [
        // https://github.com/cirosantilli/ourbigbook/issues/159
        xpath_header_split(1, 'index-scope-2', '../index.html#index-scope/index-scope-2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'toplevel-scope.html': [
        xpath_header_split(2, 'nested-scope', 'toplevel-scope/nested-scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(3, 'nested-scope/nested-scope-2', 'toplevel-scope/nested-scope/nested-scope-2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'toplevel-scope-split.html': [
        xpath_header_split(1, 'toplevel-scope', 'toplevel-scope.html', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'toplevel-scope/toplevel-scope-h2.html': [
        xpath_header_split(1, 'toplevel-scope-h2', '../toplevel-scope.html#toplevel-scope-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'toplevel-scope/nested-scope.html': [
        xpath_header_split(1, 'nested-scope', '../toplevel-scope.html#nested-scope', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'toplevel-scope/nested-scope/nested-scope-2.html': [
        // https://github.com/cirosantilli/ourbigbook/issues/159
        xpath_header_split(1, 'nested-scope-2', '../../toplevel-scope.html#nested-scope/nested-scope-2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],

      // Non converted paths.
      'scss.css': [],
      'ourbigbook.json': [],
    },
    assert_not_xpath: {
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
      'README.bigb': `= Index

\\x[subdir/index-h2][link to subdir index h2]
    `,
      'ourbigbook.json': `{}\n`,
      'subdir/index.bigb': `= Subdir index

== Index h2
`,
    },
    assert_xpath: {
      'index.html': [
        xpath_header(1, 'index'),
        "//x:a[@href='subdir.html#index-h2' and text()='link to subdir index h2']",
      ]
    },
  }
);
assert_executable(
  // https://github.com/cirosantilli/ourbigbook/issues/123
  'executable: includers should show as a parents of the includee',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

\\Include[included-by-index]
`,
      'not-readme.bigb': `= Not readme

\\Include[included-by-index]
`,
  'included-by-index.bigb': `= Included by index
`,
    },
    assert_xpath: {
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
      'README.bigb': `= Index

\\Include[included-by-index]
`,
  'included-by-index.bigb': `= Included by index
`,
    },
    assert_not_xpath: {
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
    expect_exists: [
      'out/publish/out/publish/dist/ourbigbook.css',
    ],
    assert_xpath: {
      'out/publish/out/publish/index.html': [
        "//x:div[@class='p']//x:a[@href='notindex' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex#notindex-h2' and text()='link to notindex h2']",
        "//x:style[contains(text(),'@import \"dist/ourbigbook.css\"')]",
      ],
      'out/publish/out/publish/notindex.html': [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='.' and text()='link to index']",
        "//x:div[@class='p']//x:a[@href='.#h2' and text()='link to h2']",
      ],
      'out/publish/out/publish/toplevel-scope/toplevel-scope-h2.html': [
        "//x:style[contains(text(),'@import \"../dist/ourbigbook.css\"')]",
      ],
      'out/publish/out/publish/subdir.html': [
        "//x:style[contains(text(),'@import \"dist/ourbigbook.css\"')]",
      ],
      // Non-converted files are copied over.
      'out/publish/out/publish/scss.css': [],
      'out/publish/out/publish/ourbigbook.json': [],
      'out/publish/out/publish/subdir/myfile.txt': [],
    },
  }
);
assert_executable(
  'executable: convert subdirectory only with ourbigbook.json',
  {
    args: ['subdir'],
    filesystem: {
      'ourbigbook.json': `{}\n`,
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      // A Sass file.
      'subdir/scss.scss': `body { color: red }`,
      // A random non-ourbigbook file.
      'subdir/xml.xml': `<?xml version='1.0'?><a/>`,
    },
    // Place out next to ourbigbook.json which should be the toplevel.
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
    assert_xpath: {
      'subdir.html': [xpath_header(1)],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: convert subdirectory only without ourbigbook.json',
  {
    args: ['subdir'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
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
    assert_xpath: {
      'subdir.html': [xpath_header(1, '')],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: convert a subdirectory file only with ourbigbook.json',
  {
    args: ['subdir/notindex.bigb'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      'ourbigbook.json': `{}`,
    },
    // Place out next to ourbigbook.json which should be the toplevel.
    expect_exists: ['out'],
    expect_not_exists: ['subdir/out', 'index.html', 'subdir.html'],
    assert_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_executable(
  'executable: convert a subdirectory file only without ourbigbook.json',
  {
    args: ['subdir/notindex.bigb'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
    },
    // Don't know a better place to place out, so just put it int subdir.
    expect_exists: ['out'],
    expect_not_exists: ['subdir/out', 'index.html', 'subdir.html'],
    assert_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_executable(
  'executable: convert with --outdir',
  {
    args: ['--outdir', 'my_outdir', '.'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      'ourbigbook.json': `{}\n`,
    },
    expect_exists: [
      'my_outdir/out',
      'my_outdir/ourbigbook.json',
    ],
    expect_not_exists: [
      'out',
      'index.html',
      'subdir.html',
      'subdir/notindex.html',
    ],
    assert_xpath: {
      'my_outdir/index.html': [xpath_header(1, '')],
      'my_outdir/subdir.html': [xpath_header(1, '')],
      'my_outdir/subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_executable(
  'executable: ourbigbook.tex does not blow up',
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `$$\\mycmd$$`,
      'ourbigbook.tex': `\\newcommand{\\mycmd}[0]{hello}`,
    },
  }
);
assert_executable(
  // https://github.com/cirosantilli/ourbigbook/issues/114
  'executable: synonym basic',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Index

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
      'notindex.bigb': `= Notindex

== Notindex h2

= My notindex h2 synonym
{synonym}
`,
    },
    assert_xpath: {
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
      'my-h2-synonym.html': [
        "//x:script[text()=\"location='index.html#h2'\"]",
      ],
      // Redirect generated by synonym.
      'my-notindex-h2-synonym.html': [
        "//x:script[text()=\"location='notindex.html#notindex-h2'\"]",
      ],
    }
  }
);
assert_executable(
  // https://github.com/cirosantilli/ourbigbook/issues/225
  'executable: synonym in splitDefault',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Index
{splitDefault}

== h2

= My h2 synonym
{c}
{synonym}

== h2 2

\\x[my-h2-synonym][h2 2 to my h2 synonym]
`,
    },
    assert_xpath: {
      'h2-2.html': [
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='h2 2 to my h2 synonym']",
      ],
    }
  }
);
assert_executable(
  'executable: synonym to outdir generates correct redirct',
  {
    args: ['--outdir', 'asdf', '--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Index

== h2

= My h2 synonym
{c}
{synonym}
`,
    },
    assert_xpath: {
      'asdf/my-h2-synonym.html': [
        "//x:script[text()=\"location='index.html#h2'\"]",
      ],
    }
  }
);
 https://github.com/cirosantilli/ourbigbook/issues/131
assert_executable(
  'executable: splitDefault',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Toplevel
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
      'notindex.bigb': `= Notindex

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
    assert_xpath: {
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
        xpath_header_split(1, 'toplevel', 'nosplit.html', ourbigbook.NOSPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'toplevel', 'index.html', ourbigbook.SPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'h2', 'nosplit.html#h2', ourbigbook.NOSPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'notindex', 'notindex-split.html', ourbigbook.SPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'notindex', 'notindex.html', ourbigbook.NOSPLIT_MARKER_TEXT),
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
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    }
  }
);
assert_executable(
  'executable: link to image in another file after link to the toplevel header of that file does not blow up',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Toplevel

\\Image[img.jpg]{title=My image toplevel}
`,
      'notindex.bigb': `= Notindex

\\x[toplevel]

\\x[image-my-image-toplevel]
`,
      'img.jpg': '',
    },
  }
)
assert_executable(
  'executable: --generate min followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ],
  }
);
assert_executable(
  'executable: --generate min in subdir does not alter toplevel',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{}`
    },
    cwd: 'subdir',
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ],
    expect_exists: [
      'subdir/README.bigb',
    ],
    expect_not_exists: [
      'README.bigb',
    ],
  }
);
assert_executable(
  'executable: --generate default followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'default']],
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
      ['ourbigbook', ['--generate', 'min']],
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
      ['git', ['remote', 'add', 'origin', 'git@github.com:cirosantilli/ourbigbook-generate.git']],
    ],
  }
);
assert_executable(
  'executable: --generate default followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'default']],
      ['git', ['init']],
      ['git', ['add', '.']],
      ['git', ['commit', '-m', '0']],
      ['git', ['remote', 'add', 'origin', 'git@github.com:cirosantilli/ourbigbook-generate.git']],
    ],
  }
);
assert_executable(
  'executable: --embed-resources actually embeds resources',
  {
    args: ['--embed-resources', '.'],
    filesystem: {
      'README.bigb': `= Index
`,
    },
    assert_xpath: {
      'index.html': [
        // The start of a minified CSS rule from ourbigbook.scss.
        "//x:style[contains(text(),'.ourbigbook{')]",
      ],
    },
    assert_not_xpath: {
      'index.html': [
        // The way that we import other sheets.
        "//x:style[contains(text(),'@import ')]",
      ],
    }
  }
);
assert_executable(
  'executable: reference to subdir with --embed-includes',
  {
    args: ['--embed-includes', 'README.bigb'],
    filesystem: {
      'README.bigb': `= Index

\\x[subdir]

\\x[subdir/h2]

\\x[subdir/notindex]

\\x[subdir/notindex-h2]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Subdir

== h2
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
  }
);

// executable: link:
assert_executable(
  'executable: link: relative reference to nonexistent file leads to failure',
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `\\a[i-dont-exist]
`,
    },
    expect_exit_status: 1,
  }
);
assert_executable(
  "executable: link: relative reference to existent files do not lead to failure",
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `\\a[i-exist]`,
      'i-exist': ``,
    },
  }
);
assert_executable(
  "executable: link: check=0 prevents existence checks",
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `\\a[i-dont-exist]{check=0}
`,
    },
  }
);
assert_executable(
  'executable: link: relative links and images are corrected for different output paths with scope and split-headers',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Index

== h2
{scope}

=== h3

\\a[i-exist][h3 i-exist]

\\Image[i-exist][h3 i-exist img]

\\Video[i-exist][h3 i-exist video]

\\a[subdir/i-exist-subdir][h3 i-exist-subdir]

\\a[https://cirosantilli.com][h3 abs]
`,
      'subdir/README.bigb': `= Subdir

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
      'subdir/not-readme.bigb': `= Subdir Not Readme

\\a[../i-exist][subdir not readme i-exist]

\\a[i-exist-subdir][subdir not readme i-exist-subdir]
`,
      'i-exist': ``,
      'subdir/i-exist-subdir': ``,
    },
    assert_xpath: {
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
      'subdir.html': [
        "//x:a[@href='i-exist' and text()='subdir i-exist']",
        "//x:a[@href='/i-exist' and text()='subdir /i-exist']",
        "//x:a[@href='subdir/i-exist-subdir' and text()='subdir i-exist-subdir']",
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
  "executable: cwd outside project directory given by ourbigbook.json",
  {
    args: ['myproject'],
    filesystem: {
      'myproject/README.bigb': `= Index

\\x[not-readme]

\\x[subdir]

\\Include[not-readme]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-readme.bigb': `= Not readme
`,
      'myproject/scss.scss': `body { color: red }`,
      'myproject/ourbigbook.json': `{}
`,
      'myproject/subdir/index.bigb': `= Subdir
`,
      'myproject/subdir/notindex.bigb': `= Subdir Notindex
`,
    },
    expect_exists: [
      'myproject/out',
      'myproject/scss.css',
      'myproject/ourbigbook.json',
    ],
    assert_xpath: {
      'myproject/index.html': [
          xpath_header(1, ''),
      ],
      'myproject/subdir.html': [
          xpath_header(1, ''),
      ]
    }
  }
);
assert_executable(
  "executable: if there is no ourbigbook.json and the input is not under cwd then the project dir is the input dir",
  {
    args: [path.join('..', 'myproject')],
    cwd: 'notmyproject',
    filesystem: {
      'myproject/README.bigb': `= Index

\\x[not-readme]

\\x[subdir]

\\Include[not-readme]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-readme.bigb': `= Not readme
`,
      'myproject/scss.scss': `body { color: red }`,
      'myproject/subdir/index.bigb': `= Subdir
`,
      'myproject/subdir/notindex.bigb': `= Subdir Notindex
`,
    },
    expect_exists: [
      'myproject/out',
      'myproject/scss.css',
    ],
    assert_xpath: {
      'myproject/index.html': [
          xpath_header(1, ''),
      ],
      'myproject/subdir.html': [
          xpath_header(1, ''),
      ]
    }
  }
);

assert_executable(
  'executable: root_relpath and root_path in main.liquid.html work',
  {
    args: ['-S', '.'],
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
{scope}

=== h3
`,
      'ourbigbook.json': `{
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
    assert_xpath: {
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
    args: ['-S', '.'],
    filesystem: {
      'README.bigb': `= Index

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
      'notindex.bigb': `= Notindex

\\x[index]

\\x[h2]

== Notindex h2
{tag=h2-2}

=== Notindex h3

== Notindex h2 2
`,
    },
    assert_xpath: {
      'index.html': [
        // Would like to test like this, but it doesn't seem implemented in this crappy xpath implementation.
        // So we revert to instrumentation instead then.
        //`//x:h2[@id='incoming-links']/following:://x:a[@href='#h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='#h2']`,
        // https://github.com/cirosantilli/ourbigbook/issues/155
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='#h2-2']`,
      ],
      'h2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        // https://github.com/cirosantilli/ourbigbook/issues/155
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-3']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-4']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#h2-5']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='index.html#scope/scope-2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2-2']`,
      ],
      'h2-2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html#h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2']`,
      ],
      'scope/scope-1.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='../index.html']`,
        // https://github.com/cirosantilli/ourbigbook/issues/173
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='../index.html#scope/scope-2']`,
      ],
      'scope/scope-2.html': [
        // https://github.com/cirosantilli/ourbigbook/issues/173
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='../index.html#scope/scope-3']`,
      ],
      'notindex.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html#h2']`,
      ],
    },
    assert_not_xpath: {
      'no-incoming.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']`,
      ],
    },
  }
);
assert_executable(
  "executable: multiple incoming child and parent links don't blow up",
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

\\x[notindex]{child}

\\x[notindex]{child}
`,
      'notindex.bigb': `= Notindex

\\x[index]{parent}

\\x[index]{parent}
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html']`,
      ],
    },
  }
);

assert_executable(
  'executable: ourbigbook.json: outputOutOfTree',
  {
    args: ['-S', '.'],
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`,
      'ourbigbook.json': `{
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
    ],
    expect_exists_sqlite: [
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
    args: ['notindex.bigb'],
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['README.bigb']],
      // Remove h2 from README.bigb
      {
        filesystem_update: {
          'README.bigb': `= Index
`,
        }
      },
      ['ourbigbook', ['README.bigb']],
    ],
  }
);
assert_executable(
  'executable: IDs are removed from the database after you removed them from the source file and convert the directory one way',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['README.bigb']],
      // Remove h2 from README.bigb
      {
        filesystem_update: {
          'README.bigb': `= Index
`,
        }
      },
    ],
  }
);
assert_executable(
  'executable: IDs are removed from the database after you removed them from the source file and convert the directory reverse',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['notindex.bigb']],
      // Remove h2 from README.bigb
      {
        filesystem_update: {
          'notindex.bigb': `= Index
`,
        }
      },
    ],
  }
);
assert_executable(
  'executable: IDs are removed from the database after you delete the source file they were present in and convert the directory',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['.']],
      {
        filesystem_update: {
          'README.bigb': `= Index

== h2
`,
          'notindex.bigb': null,
        }
      },
    ],
  }
);
assert_executable(
  'executable: when invoking with a single file timestamps are automatically ignored and render is forced',
  {
    args: ['notindex.bigb'],
    assert_xpath: {
      'notindex.html': [
        `//x:a[@href='index.html#h2' and text()='h2 hacked']`,
      ],
    },
    filesystem: {
      'README.bigb': `= Index

== h2
`,
      'notindex.bigb': `= Notindex

\\x[h2]
`,
    },
    pre_exec: [
      ['ourbigbook', ['.']],
      {
        filesystem_update: {
          'README.bigb': `= Index

== h2 hacked
{id=h2}
`,
        }
      },
      ['ourbigbook', ['README.bigb']],
    ],
  }
);

assert_executable(
  "executable: toplevel index file without a header produces output to index.html",
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `asdf
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:div[@class='p' and text()='asdf']",
      ],
    },
  }
);
assert_executable('executable: cross file ancestors work on single file conversions at toplevel',
  {
    // After we pre-convert everything, we convert just one file to ensure that the ancestors are coming
    // purely from the database, and not from a cache shared across several input files.
    args: ['notindex3.bigb'],
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'notindex2.bigb': `= Notindex 2

\\Include[notindex3]
`,
      'notindex3.bigb': `= Notindex 2
`
    },
    pre_exec: [
      // First we pre-convert everything.
      ['ourbigbook', ['.']],
    ],
    assert_xpath: {
      'notindex.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      ],
      'notindex2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
      ],
      'notindex3.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html']`,
      ],
    },
    assert_not_xpath: {
      'index.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
);
assert_executable('executable: cross file ancestors work on single file conversions in subdir',
  {
    // After we pre-convert everything, we convert just one file to ensure that the ancestors are coming
    // purely from the database, and not from a cache shared across several input files.
    args: ['subdir/notindex3.bigb'],
    filesystem: {
      'subdir/index.bigb': `= Index

\\Include[notindex]
`,
      'subdir/notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'subdir/notindex2.bigb': `= Notindex 2

\\Include[notindex3]
`,
      'subdir/notindex3.bigb': `= Notindex 2
`
    },
    pre_exec: [
      // First we pre-convert everything.
      ['ourbigbook', ['.']],
    ],
    assert_xpath: {
      'subdir/notindex.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html']`,
      ],
      'subdir/notindex2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
      ],
      'subdir/notindex3.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html']`,
      ],
    },
    assert_not_xpath: {
      'subdir.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
);
