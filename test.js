const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const { Sequelize } = require('sequelize')

const ourbigbook = require('./index')
const ourbigbook_nodejs = require('./nodejs');
const ourbigbook_nodejs_front = require('./nodejs_front');
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe');
const { read_include } = require('./web_api');
const models = require('./models');
const {
  assert_xpath,
  xpath_header,
  xpath_header_split,
  xpath_header_parent,
} = require('./test_lib')

const MAKE_GIT_REPO_PRE_EXEC = [
  ['git', ['init']],
  ['git', ['add', '.']],
  ['git', ['commit', '-m', '0']],
  ['git', ['remote', 'add', 'origin', 'git@github.com:ourbigbook/ourbigbook-generate.git']],
]
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

// assert_lib helper for Ast tests.
function assert_lib_ast(
  description,
  stdin,
  assert_ast,
  options={}
) {
  options.stdin = stdin
  options.assert_ast = assert_ast
  return assert_lib(description, options)
}

/** THE ASSERT EVERYTHING ENTRYPOINT for library based tests.
 *
 * For full CLI tests, use assert_cli instead.
 *
 * assert_lib uses very minimal mocking, so tests are highly meaningful.
 *
 * Its interface is highly compatible with assert_cli, in many cases you can just
 * switch between the two freely by just converting assert_cli 'args' to the corresponding
 *
 * and assert_lib generally preferred
 * as it runs considerably faster.
 */
function assert_lib(
  description,
  options={}
) {
  it('lib: ' + description, async function () {
    options = Object.assign({}, options);
    if (!('assert_ast' in options)) {
      // Assert that this given Ast subset is present in the output.
      // Only considers the content argument of the toplevel node for convenience.
      options.assert_ast = undefined;
    }
    if (!('assert_xpath_stdout' in options)) {
      // Like assert_xpath, but for the input coming from options.stdin.
      // This is analogous to stdout output on the CLI.
      options.assert_xpath_stdout = [];
    }
    if (!('assert_not_xpath_stdout' in options)) {
      options.assert_not_xpath_stdout = [];
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
    //if (!('assert_bigb_stdout' in options)) {
    //  options.assert_bigb_stdout = undefined;
    //}
    if (!('assert_bigb' in options)) {
      options.assert_bigb = {};
    }
    if (!('convert_before' in options)) {
      // List of strings. Convert files at these paths from default_file_reader
      // before the main conversion to build up the cross-file reference database.
      options.convert_before = [];
    }
    if (!('convert_before_norender' in options)) {
      options.convert_before_norender = [];
    }
    if (!('convert_dir' in options)) {
      // Convert all OurBigBook input files in the directory as in `ourbigbook .` from the CLI.
      // First do an extract IDs pass, and then a render pass just like for the CLI.
      // This option overrides both convert_before and convert_before_norender.
      // You generally just want to use this option always.
      options.convert_dir = false;
    }
    if (!('convert_opts' in options)) {
      // Extra convert options on top of the default ones
      // to be passed to ourbigbook.convert.
      options.convert_opts = {};
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
    if (!('stdin' in options)) {
      // A string to be converted directly. Input can also be provided via filesystem:
      // through our mock filesystem. This option is somewhat analogous to stdin input on CLI.
      // This is the preferred approach for when the filename doesn't matter to the test.
      options.stdin = undefined
    }
    if (!('invalid_title_titles' in options)) {
      options.invalid_title_titles = []
    }
    if (!('assert_not_exists' in options)) {
      options.assert_not_exists = [];
    }
    if (!('path_sep' in options.convert_opts)) {
      options.convert_opts.path_sep = PATH_SEP;
    }
    if (!('read_include' in options.convert_opts)) {
      options.convert_opts.read_include = read_include({
        exists: (inpath) => inpath in options.filesystem,
        read: (inpath) => options.filesystem[inpath],
        path_sep: PATH_SEP,
      })
    }
    options.convert_opts.fs_exists_sync = (my_path) => {
      return options.filesystem.hasOwnProperty(my_path)
    }
    options.convert_opts.read_file = (readpath, context) => {
      if (readpath in filesystem_dirs) {
        return {
          type: 'directory',
        }
      } else {
        return {
          type: 'file',
          content: options.filesystem[readpath],
        }
      }
    }
    let filesystem = options.filesystem
    const filesystem_dirs = {}
    for (f in filesystem) {
      do {
        f = path.dirname(f)
        if (f === '.')
          break
        filesystem_dirs[f] = {}
      } while (true)
    }

    // Add directory to filesystem so that exist checks won't blow up.
    for (let p in filesystem) {
      do {
        p = path.dirname(p)
        filesystem[p] = undefined
      } while (p !== '.')
    }

    if (options.stdin !== undefined) {
      if (!('input_path_noext' in options) && options.convert_opts.split_headers) {
        options.input_path_noext = ourbigbook.INDEX_BASENAME_NOEXT;
      }
      const main_input_path = options.input_path_noext + '.' + ourbigbook.OURBIGBOOK_EXT
      assert(!(main_input_path in options.filesystem))
      filesystem = Object.assign({}, filesystem)
      filesystem[main_input_path] = options.stdin
    }
    let convert_before, convert_before_norender
    if (options.convert_dir) {
      convert_before_norender = Object.keys(filesystem).filter((inpath) => path.parse(inpath).ext === '.' + ourbigbook.OURBIGBOOK_EXT)
      convert_before = convert_before_norender
    } else {
      convert_before_norender = options.convert_before_norender
      convert_before = options.convert_before
    }

    // Convenience parameter that sets both input_path_noext and toplevel_id.
    // options.input_path_noext
    if (!('toplevel' in options)) {
      options.toplevel = false;
    }
    const new_convert_opts = Object.assign({}, convert_opts);
    Object.assign(new_convert_opts, options.convert_opts);
    if (options.toplevel) {
      new_convert_opts.body_only = false;
    }
    if (Object.keys(options.assert_bigb).length || 'assert_bigb_stdout' in options) {
      new_convert_opts.output_format = ourbigbook.OUTPUT_FORMAT_OURBIGBOOK
    }

    // SqlDbProvider with in-memory database.
    const sequelize = await ourbigbook_nodejs_webpack_safe.create_sequelize({
        storage: ':memory:',
        logging: false,
      },
      Sequelize,
      { force: true },
    )
    let exception
    try {
      const db_provider = new ourbigbook_nodejs_webpack_safe.SqlDbProvider(sequelize);
      new_convert_opts.db_provider = db_provider
      const rendered_outputs = {}
      async function convert(input_path, render) {
        //console.error({input_path});
        const extra_returns = {};
        assert(input_path in filesystem)
        const input_string = filesystem[input_path];
        const dependency_convert_opts = Object.assign({}, new_convert_opts);
        dependency_convert_opts.input_path = input_path;
        dependency_convert_opts.toplevel_id = path.parse(input_path).name;
        dependency_convert_opts.render = render;
        await ourbigbook.convert(input_string, dependency_convert_opts, extra_returns);
        Object.assign(rendered_outputs, extra_returns.rendered_outputs)
        if (extra_returns.errors.length !== 0) {
          console.error(extra_returns.errors.join('\n'));
          assert.strictEqual(extra_returns.errors.length, 0)
        }
        await ourbigbook_nodejs_webpack_safe.update_database_after_convert({
          extra_returns,
          db_provider,
          is_render_after_extract: render && convert_before_norender_set.has(input_path),
          sequelize,
          path: input_path,
          render,
        })
      }
      const convert_before_norender_set = new Set(convert_before_norender)
      for (const input_path of convert_before_norender) {
        await convert(input_path, false)
      }
      const check_db_error_messages = await ourbigbook_nodejs_webpack_safe.check_db(sequelize, convert_before_norender)
      if (check_db_error_messages.length > 0) {
        console.error(check_db_error_messages.join('\n'))
        assert.strictEqual(check_db_error_messages.length, 0);
      }
      for (const input_path of convert_before) {
        await convert(input_path, true)
      }
      //console.error('main');
      if (options.stdin === undefined) {
        if (options.input_path_noext !== undefined) throw new Error('input_string === undefined && input_path_noext !== undefined')
        if (options.assert_xpath_stdout.length) throw new Error('input_string === undefined && options.assert_xpath_stdout !== []')
        if (options.assert_not_xpath_stdout.length) throw new Error('input_string === undefined && options.assert_not_xpath_stdout !== []')
      } else {
        if (options.input_path_noext !== undefined) {
          new_convert_opts.input_path = options.input_path_noext + '.' + ourbigbook.OURBIGBOOK_EXT;
          new_convert_opts.toplevel_id = options.input_path_noext;
        }
        const extra_returns = {};
        const output = await ourbigbook.convert(options.stdin, new_convert_opts, extra_returns);
        Object.assign(rendered_outputs, extra_returns.rendered_outputs)
        if (new_convert_opts.input_path !== undefined) {
          await ourbigbook_nodejs_webpack_safe.update_database_after_convert({
            extra_returns,
            db_provider,
            sequelize,
            path: new_convert_opts.input_path,
            render: true,
          })
        }

        // Post conversion checks.
        const has_subset_extra_returns = { fail_reason: '' };
        let is_subset;
        let content;
        let content_array;
        if (options.assert_bigb_stdout) {
          assert.strictEqual(output, options.assert_bigb_stdout);
        }
        if (options.assert_ast === undefined) {
          is_subset = true;
        } else {
          if (options.toplevel) {
            content = extra_returns.ast;
            content_array = [content]
            is_subset = ast_has_subset(content, options.assert_ast, has_subset_extra_returns);
          } else {
            content = extra_returns.ast.args.content;
            content_array = content
            is_subset = ast_arg_has_subset(content, options.assert_ast, has_subset_extra_returns);
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
          if (options.assert_ast !== undefined) {
            console.error('ast output toString:');
            console.error(content_array.map(c => c.toString()).join('\n'));
            console.error();
            console.error('ast expect:');
            console.error(JSON.stringify(options.assert_ast, null, 2));
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
          console.error('input ' + util.inspect(options.stdin));
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
        for (const xpath_expr of options.assert_xpath_stdout) {
          assert_xpath(xpath_expr, output);
        }
        for (const xpath_expr of options.assert_not_xpath_stdout) {
          assert_xpath(xpath_expr, output, { count: 0 });
        }
      }
      for (const key in options.assert_bigb) {
        assert.strictEqual(rendered_outputs[key].full, options.assert_bigb[key], `bigb output different than expected for "${key}"`);
      }
      for (const key in options.assert_xpath) {
        const output = rendered_outputs[key];
        assert.notStrictEqual(output, undefined, `missing output path "${key}", existing: ${Object.keys(rendered_outputs)}`);
        for (const xpath_expr of options.assert_xpath[key]) {
          assert_xpath(xpath_expr, output.full, { message: key, stdout: false });
        }
      }
      for (const key in options.assert_not_xpath) {
        const output = rendered_outputs[key];
        assert.notStrictEqual(output, undefined);
        for (const xpath_expr of options.assert_not_xpath[key]) {
          assert_xpath(xpath_expr, output.full, {
            count: 0,
            message: key,
            stdout: false,
          });
        }
      }
      for (const key of options.assert_not_exists) {
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

/** Similar to assert_lib, but allow input not coming from files, analogous to stdin. */
function assert_lib_stdin(description, input, options) {
  assert_lib_ast(description, input, undefined, options)
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
function assert_lib_error(description, input, line, column, path, options={}) {
  const new_convert_opts = Object.assign({}, options);
  new_convert_opts.error_line = line;
  new_convert_opts.error_column = column;
  new_convert_opts.error_path = path;
  assert_lib_ast(
    description,
    input,
    undefined,
    new_convert_opts
  );
}

const testdir = path.join(__dirname, ourbigbook_nodejs_webpack_safe.TMP_DIRNAME, 'test')
fs.rmSync(testdir, { recursive: true, force: true });
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
function assert_cli(
  description,
  options={}
) {
  it('cli: ' + description, async function () {
    options = Object.assign({}, options);
    if (!('args' in options)) {
      options.args = [];
    }
    if (!('assert_bigb' in options)) {
      options.assert_bigb = {};
    }
    if (!('assert_exists' in options)) {
      options.assert_exists = [];
    }
    if (!('assert_exists_sqlite' in options)) {
      options.assert_exists_sqlite = [];
    }
    if (!('assert_exit_status' in options)) {
      options.assert_exit_status = 0;
    }
    if (!('assert_not_exists' in options)) {
      options.assert_not_exists = [];
    }
    if (!('assert_not_xpath' in options)) {
      options.assert_not_xpath = {};
    }
    if (!('assert_xpath_stdout' in options)) {
      options.assert_xpath_stdout = [];
    }
    if (!('assert_xpath' in options)) {
      options.assert_xpath = {};
    }
    if (!('cwd' in options)) {
      options.cwd = '.';
    }
    if (!('filesystem' in options)) {
      options.filesystem = {};
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
      if (entry.filesystem_update) {
        update_filesystem(entry.filesystem_update, tmpdir)
      }

      let cmd, args, status = 0;
      if (Array.isArray(entry)) {
        ;[cmd, args] = entry
      } else if (entry.cmd) {
        ;[cmd, args] = entry.cmd
        if (entry.status !== undefined) {
          status = entry.status
        }
      }
      if (cmd !== undefined) {
        if (cmd === 'ourbigbook') {
          args = common_args.concat(args)
        }
        const out = child_process.spawnSync(cmd, args, {cwd: cwd});
        assert.strictEqual(out.status, status, 'bad exit status\n' + exec_assert_message(out, cmd, args, cwd));
      }
    }
    const cmd = 'ourbigbook'
    const args = common_args.concat(options.args)
    const out = child_process.spawnSync(cmd, args, {
      cwd: cwd,
      input: options.stdin,
    });
    const assert_msg = exec_assert_message(out, cmd, args, cwd);
    assert.strictEqual(out.status, options.assert_exit_status, assert_msg);
    for (const xpath_expr of options.assert_xpath_stdout) {
      assert_xpath(
        xpath_expr,
        out.stdout.toString(ourbigbook_nodejs_webpack_safe.ENCODING),
        {message: assert_msg},
      );
    }
    for (const relpath in options.assert_xpath) {
      const assert_msg_xpath = `path should match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), `path does not exist: ${fullpath}\n\n` + assert_msg);
      const html = fs.readFileSync(fullpath).toString(ourbigbook_nodejs_webpack_safe.ENCODING);
      for (const xpath_expr of options.assert_xpath[relpath]) {
        assert_xpath(xpath_expr, html, {message: assert_msg_xpath});
      }
    }
    for (const relpath in options.assert_not_xpath) {
      const assert_msg_xpath = `path should not match xpath: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), assert_msg_xpath);
      const html = fs.readFileSync(fullpath).toString(ourbigbook_nodejs_webpack_safe.ENCODING);
      for (const xpath_expr of options.assert_not_xpath[relpath]) {
        assert_xpath(xpath_expr, html, { message: assert_msg_xpath, count: 0 });
      }
    }
    for (const relpath of options.assert_exists) {
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), exec_assert_message(
        out, cmd, args, cwd, 'path should exist: ' + relpath));
    }
    for (const relpath in options.assert_bigb) {
      const assert_msg_bigb = `path should contain: ${relpath}\n\n` + assert_msg;
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(fs.existsSync(fullpath), `path does not exist: ${fullpath}`);
      const content = fs.readFileSync(fullpath).toString(ourbigbook_nodejs_webpack_safe.ENCODING);
      assert.strictEqual(options.assert_bigb[relpath], content, assert_msg_bigb);
    }
    if (!ourbigbook_nodejs_front.postgres) {
      for (const relpath of options.assert_exists_sqlite) {
        const fullpath = path.join(tmpdir, relpath);
        assert.ok(fs.existsSync(fullpath), exec_assert_message(
          out, cmd, args, cwd, 'path should exist: ' + relpath));
      }
    }
    for (const relpath of options.assert_not_exists) {
      const fullpath = path.join(tmpdir, relpath);
      assert.ok(!fs.existsSync(fullpath), exec_assert_message(
        out, cmd, args, cwd, 'path should not exist: ' + relpath));
    }
  });
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

// TODO we should get rid of this overbloated mess.
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
// Saner version of default_filesystem to which we can slowly migrate.
const default_filesystem2 = {
  'include-one-level-1.bigb': `= Include one level 1

Include one level 1 paragraph.
`,
  'include-one-level-2.bigb': `= Include one level 2

Include one level 2 paragraph.
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

function header_file_about_ast(path, type='file') {
  return a('P', [
    t(`This section is about the ${type}: `),
    a('b', [
      a('a', undefined, {href: [t(path)]})
    ]),
  ])
}

/** Shortcut to create plaintext nodes for ast_arg_has_subset, we have too many of those. */
function t(text) { return {'macro_name': 'plaintext', 'text': text}; }

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
      fs.mkdirSync(dirpath, { recursive: true });
      fs.writeFileSync(file_path, file_content);
    }
  }
}

// Empty document.
assert_lib_ast('empty document', '', []);

// Paragraphs.
assert_lib_ast('one paragraph implicit no split headers', 'ab\n',
  [a('P', [t('ab')])],
);
assert_lib_ast('one paragraph explicit', '\\P[ab]\n',
  [a('P', [t('ab')])],
);
assert_lib_ast('two paragraphs', 'p1\n\np2\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
  ]
);
assert_lib_ast('three paragraphs',
  'p1\n\np2\n\np3\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
    a('P', [t('p3')]),
  ]
);
assert_lib_ast('insane paragraph at start of sane quote',
  '\\Q[\n\naa]\n',
  [
    a('Q', [
      a('P', [t('aa')])]
    ),
  ]
);
assert_lib_ast('sane quote without inner paragraph',
  '\\Q[aa]\n',
  [a('Q', [t('aa')])],
);
assert_lib_error('paragraph three newlines', 'p1\n\n\np2\n', 3, 1);
assert_lib_ast('both quotes and paragraphs get the on-hover link',
  `= tmp

aa

\\Q[bb]
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('tmp')],
    }),
    a('P', [t('aa')], {}, {id: '_1'}),
    a('Q', [t('bb')], {}, {id: '_2'}),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='hide-hover']//x:a[@href='#_1']",
      "//x:span[@class='hide-hover']//x:a[@href='#_2']",
    ],
  }
);
assert_lib_ast('a non-header first element has a on-hover link with its id',
  `aa`,
  [
    a('P', [t('aa')], {}, {id: '_1'}),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='hide-hover']//x:a[@href='#_1']",
    ],
  }
);
assert_lib_ast('a header first element has an empty on-hover link',
  `= tmp`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('tmp')],
    }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='hide-hover']//x:a[@href='']",
    ],
    assert_not_xpath_stdout: [
      "//x:span[@class='hide-hover']//x:a[@href='#tmp']",
    ],
  }
);
assert_lib_error('paragraph three newlines', 'p1\n\n\np2\n', 3, 1);
assert_lib_ast('one newline at the end of document is ignored', 'p1\n', [a('P', [t('p1')])]);
assert_lib_error('two newlines at the end of document are an error', 'p1\n\n', 1, 3);
assert_lib_error('three newline at the end of document an error', 'p1\n\n\n', 2, 1);

// List.
const l_with_explicit_ul_expect = [
  a('P', [t('ab')]),
  a('Ul', [
    a('L', [t('cd')]),
    a('L', [t('ef')]),
  ]),
  a('P', [t('gh')]),
];
assert_lib_ast('l with explicit ul and no extra spaces',
  `ab

\\Ul[\\L[cd]\\L[ef]]

gh
`,
  l_with_explicit_ul_expect
);
assert_lib_ast('l with implicit ul sane',
  `ab

\\L[cd]
\\L[ef]

gh
`,
  l_with_explicit_ul_expect
);
assert_lib_ast('l with implicit ul insane',
  `ab

* cd
* ef

gh
`,
  l_with_explicit_ul_expect
);
assert_lib_ast('empty insane list item without a space',
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
assert_lib_ast('l with explicit ul and extra spaces',
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
assert_lib_ast('ordered list',
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
assert_lib_ast('list with paragraph sane',
  `\\L[
aa

bb
]
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('P', [t('bb')]),
      ]),
    ]),
  ]
)
assert_lib_ast('list with paragraph insane',
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
assert_lib_ast('list with multiline paragraph insane',
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
// https://github.com/ourbigbook/ourbigbook/issues/54
assert_lib_ast('insane list with literal no error',
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
        a('C', [t('bb\ncc')]),
      ]),
    ]),
  ]
);
assert_lib_error('insane list with literal with error',
  `* aa

  \`\`
  bb
cc
  \`\`
`,
  4, 1
);
assert_lib_ast('insane list with literal with double newline is not an error',
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
        a('C', [t('bb\n\ncc')]),
      ]),
    ]),
  ]
);
// https://github.com/ourbigbook/ourbigbook/issues/53
assert_lib_ast('insane list with element with newline separated arguments',
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
        a('C', [t('bb')], {id: [t('cc')]}),
      ]),
    ]),
  ]
);
assert_lib_ast('insane list inside paragraph',
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
assert_lib_ast('insane list at start of positional argument with newline',
  `\\Q[
* bb
* cc
]
`,
  [
    a('Q', [
      a('Ul', [
        a('L', [t('bb')]),
        // TODO get rid of that newline
        // https://github.com/ourbigbook/ourbigbook/issues/245
        a('L', [t('cc\n')]),
      ]),
    ]),
  ]
);
assert_lib_ast('insane list at start of positional argument without newline',
  `\\Q[* bb
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
assert_lib_ast('insane list at end of positional argument without newline',
  `\\Q[
* bb
* cc]
`,
  [
    a('Q', [
      a('Ul', [
        a('L', [t('bb')]),
        a('L', [t('cc')]),
      ]),
    ]),
  ]
);
assert_lib_ast('insane list at start of named argument with newline',
  `\\Image[http://example.com]
{description=
* bb
* cc
}
`,
  [
    a('Image', undefined, {
      description: [
        a('Ul', [
          a('L', [t('bb')]),
          a('L', [t('cc\n')]),
        ]),
      ],
    }),
  ]
);
assert_lib_ast('insane list at start of named argument without newline',
  `\\Image[http://example.com]
{description=* bb
* cc
}
`,
  [
    a('Image', undefined, {
      description: [
        a('Ul', [
          a('L', [t('bb')]),
          a('L', [t('cc\n')]),
        ]),
      ],
    }),
  ]
);
//assert_lib_ast('insane list at end of named argument without newline',
//  // TODO https://github.com/ourbigbook/ourbigbook/issues/246
//  `\\Image[http://example.com]
//{description=
//* bb
//* cc}
//`,
//  [
//    a('Image', undefined, {
//      description: [
//        a('Ul', [
//          a('L', [t('bb')]),
//          a('L', [t('cc')]),
//        ]),
//      ],
//    }),
//  ]
//);
assert_lib_ast('nested list insane',
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
assert_lib_ast('escape insane list at start of document',
  '\\* a',
  [a('P', [t('* a')])],
);
assert_lib_ast('escape insane list after a newline',
  `a
\\* b`,
  [a('P', [t('a\n* b')])],
);
assert_lib_ast('escape insane list inside list indent',
  `* a
  \\* b`,
  [
    a('Ul', [
      a('L', [
        t('a\n* b'),
      ]),
    ]),
  ]
);
assert_lib_ast('asterisk in the middle of line does not need to be escaped',
  'a * b',
  [a('P', [t('a * b')])],
);
// https://github.com/ourbigbook/ourbigbook/issues/81
assert_lib_ast('insane list immediately inside insane list',
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
assert_lib_ast('tr with explicit table',
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
assert_lib_ast('tr with implicit table',
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
assert_lib_ast('fully implicit table',
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
assert_lib_ast('insane table inside insane list inside insane table',
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
// https://github.com/ourbigbook/ourbigbook/issues/81
assert_lib_ast('insane table immediately inside insane list',
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
assert_lib_ast('insane table body with empty cell and no space',
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
assert_lib_ast('insane table head with empty cell and no space',
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
assert_lib_ast('implicit table escape', '\\| a\n',
  [a('P', [t('| a')])],
);
assert_lib_ast("pipe space in middle of line don't need escape", 'a | b\n',
  [a('P', [t('a | b')])],
);
assert_lib_ast('auto_parent consecutive implicit tr and l',
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
assert_lib_ast('table with id has caption',
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
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_lib_ast('table with title has caption',
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
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_lib_ast('table with description has caption',
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
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_lib_ast('table without id, title, nor description does not have caption',
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
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
);
assert_lib_ast('table without id, title, nor description does not increment the table count',
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
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
      "//x:span[@class='caption-prefix' and text()='Table 2']",
    ],
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 3']",
    ],
  },
);

// Images.
assert_lib_ast('block image simple',
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
    assert_xpath_stdout: [
      `//x:a[@href='${ourbigbook.RAW_PREFIX}/cd']//x:img[@src='${ourbigbook.RAW_PREFIX}/cd']`,
    ],
  },
);
assert_lib_ast('inline image simple',
  `ab

\\image[cd]

gh
`,
[
  a('P', [t('ab')]),
  a('P', [a('image', undefined, {src: [t('cd')]})] ),
  a('P', [t('gh')]),
],
  {
    filesystem: { cd: '' },
    assert_xpath_stdout: [
      `//x:img[@src='${ourbigbook.RAW_PREFIX}/cd']`,
    ],
  },
);
assert_lib_ast('video simple',
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
    assert_xpath_stdout: [
      `//x:video[@src='${ourbigbook.RAW_PREFIX}/cd']`,
    ],
  },
);
assert_lib_ast('image title',
  `\\Image[ab]{title=c d}`,
[
  a('Image', undefined, {
    src: [t('ab')],
    title: [t('c d')],
  }),
],
  { filesystem: { ab: '' } },
);
assert_lib_error('image with unknown provider',
  `\\Image[ab]{provider=reserved_undefined}`,
  1, 11
);
assert_lib_error('image provider that does not match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=local}`,
  1, 96
);
assert_lib_stdin('image provider that does match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=wikimedia}`,
);
assert_lib_ast('image with id has caption',
  `\\Image[aa]{id=bb}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      id: [t('bb')],
    }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_lib_ast('image with title has caption',
  `\\Image[aa]{title=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      title: [t('b b')],
    }, {}, { id: 'b-b' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_lib_ast('image with description has caption',
  `\\Image[aa]{description=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      description: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_lib_ast('image with source has caption',
  `\\Image[aa]{source=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      source: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
);
assert_lib_ast('image without id, title, description nor source does not have caption',
  `\\Image[aa]{external}
`,
  [
    a('Image', undefined, {
      src: [t('aa')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
    ]
  }
)
assert_lib_ast('image without id, title, description nor source does not increment the image count',
  `\\Image[aa]{id=aa}{external}

\\Image[bb]{external}

\\Image[cc]{id=cc}{external}
`,
  [
    a('Image', undefined, { src: [t('aa')], }, {}, { id: 'aa' }),
    a('Image', undefined, { src: [t('bb')], }, {}, { id: '_2' }),
    a('Image', undefined, { src: [t('cc')], }, {}, { id: 'cc' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1']",
      "//x:span[@class='caption-prefix' and text()='Figure 2']",
    ],
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 3']",
    ],
  },
)
assert_lib_ast('image title with x to header in another file',
  `\\Image[aa]{title=My \\x[notindex]}{external}`,
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
assert_lib('link to image in other files that has title with x to header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Index

\\x[image-my-notindex]
`,
     'image.bigb': `= image h1

\\Image[aa]{title=My \\x[notindex]}{external}
`,
     'notindex.bigb': `= notindex h1
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@href='image.html#image-my-notindex' and text()='Figure \"My notindex h1\"']",
      ],
    },
  }
);
assert_lib('link to image in other files that has title with x to synonym header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Index

\\x[image-my-notindex-h1-2]
`,
     'image.bigb': `= image h1

\\Image[aa]{title=My \\x[notindex-h1-2]}{external}
`,
     'notindex.bigb': `= notindex h1

= notindex h1 2
{synonym}
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@href='image.html#image-my-notindex-h1-2' and text()='Figure \"My notindex h1 2\"']",
      ],
    },
  }
);
assert_lib('link to image in other files that has title with two x to other headers',
  // check_db extra ID removal was removing the first ID because the link line/columns were the same for both,
  // fixed at title= argument position, and not at the \x position.
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Index

\\x[image-my-notindex-2-notindex-3]
`,
     'notindex.bigb': `= Notindex

\\Image[aa]{title=My \\x[notindex-2] \\x[notindex-3]}{external}

== Notindex 2

== Notindex 3
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@href='notindex.html#image-my-notindex-2-notindex-3' and text()='Figure \"My notindex 2 notindex 3\"']",
      ],
    },
  }
);
assert_lib('image: dot added automatically between title and description if title does not end in punctuation',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `\\Image[http://a]
{title=My title 1}
{description=My image 1.}

\\Image[http://a]
{title=My title 2.}
{description=My image 2.}

\\Image[http://a]
{title=My title 3?}
{description=My image 3.}

\\Image[http://a]
{title=My title 4!}
{description=My image 4.}

\\Image[http://a]
{title=My title 5 (2000)}
{description=My image 5.}

\\Image[http://a]
{title=My title with source 1}
{description=My image with source 1.}
{source=http://example.com}

\\Image[http://a]
{title=My title with source 2.}
{description=My image with source 2.}
{source=http://example.com}

\\Video[http://a]
{title=My title 1}
{description=My video 1.}

\\Video[http://a]
{title=My title 2.}
{description=My video 2.}

\`\`
f()
\`\`
{title=My title 1}
{description=My code 1.}

\`\`
f()
\`\`
{title=My title 2.}
{description=My code 2.}

\\Table[
| a
| b
]
{title=My title 1}
{description=My table 1.}

\\Table[
| a
| b
]
{title=My title 2.}
{description=My table 2.}

\\Q[To be]
{title=My title 1}
{description=My quote 1.}

\\Q[To be]
{title=My title 2.}
{description=My quote 2.}

\\Image[http://a]
{description=My image no title.}

\\Image[http://a]
{description=My image source no title.}
{source=http://example.com}
`
    },
    assert_xpath: {
      'index.html': [
        "//x:figcaption[text()='. My title 1. My image 1.']",
        "//x:figcaption[text()='. My title 2. My image 2.']",
        "//x:figcaption[text()='. My title 3? My image 3.']",
        "//x:figcaption[text()='. My title 4! My image 4.']",
        "//x:figcaption[text()='. My title 5 (2000) My image 5.']",
        "//x:figcaption[text()='. My title 1. My video 1.']",
        "//x:figcaption[text()='. My title 2. My video 2.']",
        // TODO any way to test this properly? I would like something like:
        //"//x:figcaption[text()='. My title with source 2. . My image with source 2.']",
        // There are multiple text nodes because of the <a from source in the middle.
        "//x:figcaption[text()='. My title with source 1. ']",
        "//x:figcaption[text()='. My title with source 2. ']",
        "//x:div[@class='caption' and text()='. My title 1. My code 1.']",
        "//x:div[@class='caption' and text()='. My title 2. My code 2.']",
        "//x:div[@class='caption' and text()='. My title 1. My table 1.']",
        "//x:div[@class='caption' and text()='. My title 2. My table 2.']",
        "//x:div[@class='caption' and text()='. My title 1. My quote 1.']",
        "//x:div[@class='caption' and text()='. My title 2. My quote 2.']",
        "//x:figcaption[text()='. My image no title.']",
        "//x:figcaption[text()='. My image source no title.']",
      ],
    },
  }
);

// Escapes.
assert_lib_ast('escape backslash',            'a\\\\b\n', [a('P', [t('a\\b')])]);
assert_lib_ast('escape left square bracket',  'a\\[b\n',  [a('P', [t('a[b')])]);
assert_lib_ast('escape right square bracket', 'a\\]b\n',  [a('P', [t('a]b')])]);
assert_lib_ast('escape left curly brace',     'a\\{b\n',  [a('P', [t('a{b')])]);
assert_lib_ast('escape right curly brace',    'a\\}b\n',  [a('P', [t('a}b')])]);
assert_lib_ast('escape header id', `= tmp

\\x["'\\<>&]

== tmp 2
{id="'\\<>&}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//*[@id=concat('\"', \"'<>&\")]",
    ],
  }
);

// Positional arguments.
// Has no content argument.
assert_lib_ast('p with no content argument', '\\P\n', [a('P')]);
assert_lib_ast('table with no content argument', '\\Table\n', [a('Table')]);
// Has empty content argument.
assert_lib_ast('p with empty content argument', '\\P[]\n', [a('P', [])]);

// Named arguments.
assert_lib_ast('p with id before', '\\P{id=ab}[cd]\n',
  [a('P', [t('cd')], {id: [t('ab')]})]);
assert_lib_ast('p with id after', '\\P[cd]{id=ab}\n',
  [a('P', [t('cd')], {id: [t('ab')]})]);
// https://github.com/ourbigbook/ourbigbook/issues/101
assert_lib_error('named argument given multiple times',
  '\\P[ab]{id=cd}{id=ef}', 1, 14);
assert_lib_error(
  'non-empty named argument without = is an error',
  '\\P{id ab}[cd]',
  1, 6, 'notindex.bigb',
  {
    input_path_noext: 'notindex',
  }
);
assert_lib_error(
  'named argument: open bracket at end of file fails gracefully',
  '\\P[ab]{',
  1, 7, 'notindex.bigb',
  {
    input_path_noext: 'notindex',
  }
)
assert_lib_ast('empty named argument without = is allowed',
  '\\Image[img.png]{description=}{external}\n',
  [a('Image', undefined, {
    src: [t('img.png')],
    description: [],
  })]
);

// Newline after close.
assert_lib_ast('text after block element',
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
    a('C', [t('b\nc')]),
    t('\nd'),
  ]),
  a('P', [t('e')]),
]
);
assert_lib_ast('macro after block element',
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
    a('C', [t('b\nc')]),
    t('\n'),
    a('c', [t('d')]),
  ]),
  a('P', [t('e')]),
]
);

// Literal arguments.
assert_lib_ast('literal argument code inline',
  '\\c[[\\ab[cd]{ef}]]\n',
  [a('P', [a('c', [t('\\ab[cd]{ef}')])])],
);
assert_lib_ast('literal argument code block',
  `a

\\C[[
\\[]{}
\\[]{}
]]

d
`,
[
  a('P', [t('a')]),
  a('C', [t('\\[]{}\n\\[]{}')]),
  a('P', [t('d')]),
],
);
assert_lib_ast('non-literal argument leading and trailing newline get removed',
  `\\P[
a
b
]
`,
  [a('P', [t('a\nb')])],
);
assert_lib_ast('literal argument leading and trailing newlines get removed',
  `\\P[[
a
b
]]
`,
  [a('P', [t('a\nb')])],
);
assert_lib_ast('literal argument leading and trailing newlines get removed but not the second one',
  `\\P[[

a
b

]]
`,
  [a('P', [t('\na\nb\n')])],
);
assert_lib_ast('literal agument escape leading open no escape',
  '\\c[[\\ab]]\n',
  [a('P', [a('c', [t('\\ab')])])],
);
assert_lib_ast('literal agument escape leading open one backslash',
  '\\c[[\\[ab]]\n',
  [a('P', [a('c', [t('[ab')])])],
);
assert_lib_ast('literal agument escape leading open two backslashes',
  '\\c[[\\\\[ab]]\n',
  [a('P', [a('c', [t('\\[ab')])])],
);
assert_lib_ast('literal agument escape trailing close no escape',
  '\\c[[\\]]\n',
  [a('P', [a('c', [t('\\')])])],
);
assert_lib_ast('literal agument escape trailing one backslash',
  '\\c[[\\]]]\n',
  [a('P', [a('c', [t(']')])])],
);
assert_lib_ast('literal agument escape trailing two backslashes',
  '\\c[[\\\\]]]\n',
  [a('P', [a('c', [t('\\]')])])],
);

// Newline between arguments.
const newline_between_arguments_expect = [
  a('C', [t('ab')], {id: [t('cd')]}),
];
assert_lib_ast('not literal argument with argument after newline',
  `\\C[
ab
]
{id=cd}
`,
  newline_between_arguments_expect
);
assert_lib_ast('yes literal argument with argument after newline',
  `\\C[[
ab
]]
{id=cd}
`,
  newline_between_arguments_expect
);
assert_lib_ast('yes insane literal argument with argument after newline',
  `\`\`
ab
\`\`
{id=cd}
`,
  newline_between_arguments_expect
);

// Links.
// \a
assert_lib_ast('link: simple to external URL',
  'a \\a[http://example.com][example link] b\n',
  [
    a('P', [
      t('a '),
      a('a', [t('example link')], {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_lib_ast('link: auto sane',
  'a \\a[http://example.com] b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_lib_ast('link: auto insane space start and end',
  'a http://example.com b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
);
assert_lib_ast('link: simple to local file that exists',
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
assert_lib_error('link: simple to local file that does not exist give an error without external',
  'a \\a[local-path.txt] b\n',
  1, 5,
);
assert_lib_stdin('link: simple to local file that does not exist does not give an error with external',
  'a \\a[local-path.txt]{external} b\n',
);
assert_lib_ast('link: auto insane start end document',
  'http://example.com',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_lib_ast('link: auto insane start end square brackets',
  '\\P[http://example.com]\n',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_lib_ast('link: auto insane with alpha character before it',
  'ahttp://example.com',
  [a('P', [
    t('a'),
    a('a', undefined, {'href': [t('http://example.com')]})
  ])]
);
assert_lib_ast('link: auto insane with literal square brackets around it',
  '\\[http://example.com\\]\n',
  [a('P', [
    t('['),
    a('a', undefined, {'href': [t('http://example.com]')]})
  ])]
);
assert_lib_ast('link: auto insane can be escaped with a backslash',
  '\\http://example.com\n',
  [a('P', [t('http://example.com')])],
);
assert_lib_ast('link: auto insane is not a link if the domain is empty at eof',
  'http://\n',
  [a('P', [t('http://')])],
);
assert_lib_ast('link: auto insane is not a link if the domain is empty at space',
  'http:// a\n',
  [a('P', [t('http:// a')])],
);
assert_lib_ast('link: auto insane start end named argument',
  '\\Image[aaa.jpg]{description=http://example.com}\n',
  [a('Image', undefined, {
    description: [a('a', undefined, {'href': [t('http://example.com')]})],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
);
assert_lib_ast('link: auto insane start end named argument',
  '\\Image[aaa.jpg]{source=http://example.com}\n',
  [a('Image', undefined, {
    source: [t('http://example.com')],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
);
assert_lib_ast('link: auto insane newline',
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
assert_lib_ast('link: insane with custom body no newline',
  'http://example.com[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
);
assert_lib_ast('link: insane with custom body with newline',
  'http://example.com\n[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
);
assert_lib_ast('link: auto end in space',
  `a http://example.com b`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ])
  ]
);
assert_lib_ast('link: auto end in square bracket',
  `\\P[a http://example.com]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
    ])
  ]
);
assert_lib_ast('link: auto containing escapes',
  `\\P[a http://example.com\\]a\\}b\\\\c\\ d]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com]a}b\\c d')]}),
    ])
  ]
);
assert_lib_ast('link: auto sane http https removal',
  '\\a[http://example.com] \\a[https://example.com] \\a[ftp://example.com]',
  [
    a('P', [
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' '),
      a('a', undefined, {'href': [t('https://example.com')]}),
      t(' '),
      a('a', undefined, {'href': [t('ftp://example.com')]}),
    ]),
  ],
  {
    assert_xpath_stdout: [
      "//x:a[@href='http://example.com' and text()='example.com']",
      "//x:a[@href='https://example.com' and text()='example.com']",
      "//x:a[@href='ftp://example.com' and text()='ftp://example.com']",
    ]
  }
);
assert_lib_ast('link: auto insane http https removal',
  'http://example.com https://example.com',
  [
    a('P', [
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' '),
      a('a', undefined, {'href': [t('https://example.com')]}),
    ]),
  ],
  {
    assert_xpath_stdout: [
      "//x:a[@href='http://example.com' and text()='example.com']",
      "//x:a[@href='https://example.com' and text()='example.com']",
    ]
  }
);
assert_lib_ast('link: with multiple paragraphs',
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
assert_lib_ast('xss: content and href',
  '\\a[ab&\\<>"\'cd][ef&\\<>"\'gh]{external}\n',
  undefined,
  {
    assert_xpath_stdout: [
      `//x:a[@href=concat('ab&<>"', "'", 'cd') and text()=concat('ef&<>"', "'", 'gh')]`,
    ]
  }
);
assert_lib_error(
  // {check} local file existence of \a and \Image and local link automodifications.
  'link: relative reference to nonexistent file leads to failure in link',
  `\\a[i-dont-exist]
`, 1, 3, 'README.bigb',
  {
    input_path_noext: 'README',
  }
);
assert_lib_error(
  'link: relative reference to nonexistent file leads to failure in image',
  `\\Image[i-dont-exist]
`, 1, 7, 'README.bigb',
  {
    input_path_noext: 'README',
  }
);
assert_lib_ast(
  'link: relative reference to existent file does not lead to failure in link',
  `\\a[i-exist]
`,
  undefined,
  {
    input_path_noext: 'README',
    filesystem: {
      'i-exist': '',
    }
  }
);
assert_lib_ast(
  'link: relative reference to existent file does not lead to failure in image',
  `\\Image[i-exist]
`,
  undefined,
  {
    input_path_noext: 'README',
    filesystem: {
      'i-exist': '',
    }
  }
);
assert_lib_ast(
  'link: external prevents existence checks in link',
  `\\a[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'README',
  }
);
assert_lib_ast(
  'link: external prevents existence checks in block image',
  `\\Image[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'README',
  }
);
assert_lib_ast(
  'link: external prevents existence checks in inline image',
  `\\image[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'README',
  }
);
assert_lib_ast(
  'link: existence checks are skipped when media provider converts them to absolute url',
  `\\Image[i-dont-exist]
`,
  undefined,
  {
    input_path_noext: 'README',
    convert_opts: {
      ourbigbook_json: {
        "media-providers": {
          "github": {
            "default-for": ["image"],
            "remote": "cirosantilli/media"
          },
        }
      },
    }
  }
);
assert_lib(
  'link: relative links and images are corrected for different output paths with scope and split-headers',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
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

\\a[file:///etc/fstab][h3 file:///etc/fstab]
`,
      'subdir/README.bigb': `= Subdir

\\a[../i-exist][subdir i-exist]

\\a[/i-exist][subdir /i-exist]

\\a[/i-dont-exist][subdir /i-dont-exist external]{external}

\\a[i-exist-subdir][subdir i-exist-subdir]

== subdir h2
{scope}

=== subdir h3

\\a[../i-exist][subdir h3 i-exist]

\\a[/i-exist][subdir h3 /i-exist]

\\a[/i-dont-exist][subdir h3 /i-dont-exist external]{external}

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
      // TODO patch test system to make work.
      //[`${ourbigbook.RAW_PREFIX}/i-exist`]: [],
      //[`${ourbigbook.RAW_PREFIX}/subdir/i-exist`]: [],
      'index.html': [
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/i-exist' and text()='h3 i-exist']`,
        `//x:img[@src='${ourbigbook.RAW_PREFIX}/i-exist' and @alt='h3 i-exist img']`,
        `//x:video[@src='${ourbigbook.RAW_PREFIX}/i-exist' and @alt='h3 i-exist video']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/i-exist-subdir' and text()='h3 i-exist-subdir']`,
        `//x:a[@href='https://cirosantilli.com' and text()='h3 abs']`,
      ],
      'h2/h3.html': [
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/i-exist' and text()='h3 i-exist']`,
        `//x:a[@href='file:///etc/fstab' and text()='h3 file:///etc/fstab']`,
        `//x:img[@src='../${ourbigbook.RAW_PREFIX}/i-exist' and @alt='h3 i-exist img']`,
        `//x:video[@src='../${ourbigbook.RAW_PREFIX}/i-exist' and @alt='h3 i-exist video']`,
        `//x:a[@href='https://cirosantilli.com' and text()='h3 abs']`,
      ],
      'subdir.html': [
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir i-exist']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir /i-exist']`,
        `//x:a[@href='/i-dont-exist' and text()='subdir /i-dont-exist external']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/i-exist-subdir' and text()='subdir i-exist-subdir']`,
      ],
      'subdir/subdir-h2/subdir-h3.html': [
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir h3 i-exist']`,
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir h3 /i-exist']`,
        `//x:a[@href='/i-dont-exist' and text()='subdir h3 /i-dont-exist external']`,
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/i-exist-subdir' and text()='subdir h3 i-exist-subdir']`,
      ],
      'subdir/not-readme.html': [
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir not readme i-exist']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/subdir/i-exist-subdir' and text()='subdir not readme i-exist-subdir']`,
      ],
    },
  }
);

// Internal cross references
// \x
assert_lib_ast('x: cross reference simple',
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
assert_lib_ast('x: cross reference full boolean style without value',
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
assert_lib_ast('x: cross reference full boolean style with value 0',
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
assert_lib_ast('x: cross reference full boolean style with value 1',
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
assert_lib_error('x: cross reference full boolean style with invalid value 2',
  `= abc

\\x[abc]{full=2}
`, 3, 8);
assert_lib_error('x: cross reference full boolean style with invalid value true',
  `= abc

\\x[abc]{full=true}
`, 3, 8);
assert_lib_stdin('x: cross reference to image',
  `\\Image[ab]{id=cd}{title=ef}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_lib_stdin('x: cross reference without content nor target title style full',
  `\\Image[ab]{id=cd}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_lib_error('x: cross reference undefined fails gracefully', '\\x[ab]', 1, 3);
assert_lib_error('x: cross reference with child to undefined id fails gracefully',
  `= h1

\\x[ab]{child}
`, 3, 3, undefined, {toplevel: true});
// https://docs.ourbigbook.com#order-of-reported-errors
assert_lib_error('x: cross reference undefined errors show after other errors',
  `= a

\\x[b]

\`\`
== b
`, 5, 1);
assert_lib_error('x: cross reference full and ref are incompatible',
  `= abc

\\x[abc]{full}{ref}
`, 3, 1);
assert_lib_error('x: cross reference content and full are incompatible',
  `= abc

\\x[abc][def]{full}
`, 3, 1);
assert_lib_error('x: cross reference content and ref are incompatible',
  `= abc

\\x[abc][def]{ref}
`, 3, 1);
assert_lib_error('x: cross reference full and c are incompatible',
  `= abc

\\x[abc]{c}{full}
`, 3, 1);
assert_lib_error('x: cross reference full and p are incompatible',
  `= abc

\\x[abc]{p}{full}
`, 3, 1);
assert_lib('x: cross reference to non-included toplevel header in another file',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': '\\x[another-file]',
      'another-file.bigb': '= Another file',
    },
    assert_xpath: {
      'notindex.html': [
        "//x:a[@href='another-file.html' and text()='another file']",
      ]
    },
  },
);
assert_lib('x: cross reference to non-included non-toplevel header in another file',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': '\\x[another-file-2]',
      'another-file.bigb': `= Another file

== Another file 2
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:a[@href='another-file.html#another-file-2' and text()='another file 2']",
      ]
    },
  },
);
assert_lib('x: cross reference to included header in another file',
  // I kid you not. Everything breaks everything.
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

\\x[another-file]

\\x[another-file-h2]

\\Include[another-file]
`,
      'another-file.bigb': `= Another file

== Another file h2
`
    },
    assert_xpath: {
      'notindex.html': [
        "//x:a[@href='another-file.html' and text()='another file']",
        "//x:a[@href='another-file.html#another-file-h2' and text()='another file h2']",
      ]
    }
  },
);
assert_lib_ast('x: cross reference to ids in the current file with split',
  // TODO this test is ridiculously overbloated and is likely covered in other tests already.
  `= Notindex

\\x[notindex]

\\x[bb]

\\Q[\\x[bb]{full}]

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
    a('P', [a('x', [t('image bb 1')], {href: [t('image-bb')]})]),
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
    assert_xpath_stdout: [
      // Empty URL points to start of the document, which is exactly what we want.
      // https://stackoverflow.com/questions/5637969/is-an-empty-href-valid
      "//x:div[@class='p']//x:a[@href='' and text()='notindex']",
      "//x:a[@href='#bb' and text()='bb']",
      "//x:blockquote//x:a[@href='#bb' and text()='Section 1. \"bb\"']",
      // https://github.com/ourbigbook/ourbigbook/issues/94
      "//x:a[@href='#bb' and text()='bb to bb']",
      "//x:a[@href='#image-bb' and text()='image bb 1']",

      // Links to the split versions.
      xpath_header_split(1, 'notindex', 'notindex-split.html', ourbigbook.SPLIT_MARKER_TEXT),
      xpath_header_split(2, 'bb', 'bb.html', ourbigbook.SPLIT_MARKER_TEXT),
    ],
    assert_xpath: {
      'notindex-split.html': [
        "//x:a[@href='notindex.html#bb' and text()='bb']",
        // https://github.com/ourbigbook/ourbigbook/issues/130
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
    convert_opts: { split_headers: true },
    filesystem: Object.assign({}, default_filesystem, {
      'bb.png': ''
    }),
    input_path_noext: 'notindex',
  },
);
assert_lib('x: splitDefault true and splitDefaultNotToplevel true',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: {
        h: {
          splitDefault: true,
          splitDefaultNotToplevel: true,
        }
      },
    },
    filesystem: {
      'notindex.bigb': `= Notindex

\\x[index][notindex to index]

\\x[index-h2][notindex to index h2]

== Notindex h2

\\x[index][notindex h2 to index]

\\x[index-h2][notindex h2 to index h2]

=== Notindex h3

\\x[index][notindex h3 to index]
`,
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
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to index']",
        "//x:div[@class='p']//x:a[@href='index-h2.html' and text()='notindex to index h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to index']",
        "//x:div[@class='p']//x:a[@href='index-h2.html' and text()='notindex h2 to index h2']",
      ],
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
    assert_not_exists: [
      'split.html',
      'nosplit.html',
      'notindex-split.html',
      'notindex-nosplit.html',
    ],
  },
);
assert_lib('x: splitDefault false and splitDefaultNotToplevel true',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: {
        h: {
          splitDefault: false,
          splitDefaultNotToplevel: true,
        }
      },
    },
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
      'notindex.bigb': `= Notindex

\\x[index][notindex to index]

\\x[index-h2][notindex to index h2]

== Notindex h2

\\x[index][notindex h2 to index]

\\x[index-h2][notindex h2 to index h2]

=== Notindex h3

\\x[index][notindex h3 to index]
`,
      'no-children.bigb': `= No children
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to index']",
        "//x:div[@class='p']//x:a[@href='index.html#index-h2' and text()='notindex to index h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to index']",
        "//x:div[@class='p']//x:a[@href='index.html#index-h2' and text()='notindex h2 to index h2']",
      ],
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
        "//x:div[@class='p']//x:a[@href='index.html#index-h2' and text()='index h2 to index h2']",
        // https://github.com/ourbigbook/ourbigbook/issues/271
        xpath_header_split(1, 'index-h2', 'index.html#index-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'notindex-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to index']",
        "//x:div[@class='p']//x:a[@href='index.html#index-h2' and text()='notindex h2 to index h2']",
        // https://github.com/ourbigbook/ourbigbook/issues/271
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    },
    assert_not_xpath: {
      'index.html': [
        // There is no split version of this header.
        xpath_header_split(1, 'index', undefined, ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'no-children.html': [
        // There is no split version of this header.
        xpath_header_split(1, 'no-children', undefined, ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(1, 'no-children', undefined, ourbigbook.NOSPLIT_MARKER_TEXT),
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
    assert_not_exists: [
      'split.html',
      'nosplit.html',
      'notindex-split.html',
      'notindex-nosplit.html',
    ],
  },
);
assert_lib(
  'x: header splitDefault argument',
  // https://github.com/ourbigbook/ourbigbook/issues/131
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
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
        xpath_header(1, 'toplevel', "x:a[@href='index.html' and text()='Toplevel']"),
        xpath_header(2, 'h2', "x:a[@href='h2.html' and text()='1. H2']"),

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
        xpath_header(1, 'notindex', "x:a[@href='notindex-split.html' and text()='Notindex']"),
        xpath_header(2, 'notindex-h2', "x:a[@href='notindex-h2.html' and text()='1. Notindex h2']"),

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
assert_lib('x: cross reference to non-included image in another file',
  // https://github.com/ourbigbook/ourbigbook/issues/199
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

\\x[image-bb]
`,
      'notindex2.bigb': `= Notindex2

== Notindex2 2

\\Image[aa]{external}
{title=bb}
`
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html#image-bb' and text()='Figure \"bb\"']",
      ],
    }
  },
);
assert_lib_ast('x: cross reference with link inside it does not blow up',
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
assert_lib('x: to image in another file that has x title in another file',
  // https://github.com/ourbigbook/ourbigbook/issues/198
  {
    convert_dir: true,
    filesystem: {
     'tmp.bigb': `= Tmp

\\x[image-tmp2-2]
`,
     'tmp2.bigb': `= Tmp2

\\Image[a]{external}
{title=\\x[tmp2-2]}

== Tmp2 2
`,
    },
  }
);
// TODO
//it('output_path_base', () => {
//  function assert(args, dirname, basename) {
//    args.path_sep = '/'
//    if (args.ast_undefined === undefined ) { args.ast_undefined = false }
//    const ret = ourbigbook.output_path_base(args)
//    assert.strictEqual(ret.dirname, dirname)
//    assert.strictEqual(ret.basename, basename)
//  }
//
//  assert({
//    ast_undefined: false,
//    ast_id,
//    ast_input_path,
//    ast_is_first_header_in_input_file,
//    ast_split_default,
//    ast_toplevel_id,
//    context_to_split_headers,
//    cur_toplevel_id,
//    splitDefaultNotToplevel,
//    split_suffix,
//  }, )
//
//  //assert(
//  //  {
//  //    'notindex.bigb',
//  //    'notindex',
//  //  },
//  //);
//  //assert.deepStrictEqual(
//  //  ourbigbook.output_path_parts(
//  //    'index.bigb',
//  //    'index',
//  //    context,
//  //  ),
//  //  ['', 'index']
//  //);
//  //assert.deepStrictEqual(
//  //  ourbigbook.output_path_parts(
//  //    'README.bigb',
//  //    'index',
//  //    context,
//  //  ),
//  //  ['', 'index']
//  //);
//});
// Internal cross references \x
// https://github.com/ourbigbook/ourbigbook/issues/213
assert_lib_ast('x: cross reference magic simple sane',
  `= Notindex

== My header

\\x[My headers]{magic}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='My headers']",
    ],
  }
);
assert_lib_ast('x: cross reference magic simple insane',
  `= Notindex

== My header

<My headers>
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='My headers']",
    ],
  }
);
assert_lib_ast('x: cross reference magic in title',
  `= Notindex

== My header

\\Image[a.png]{external}
{title=<My headers> are amazing}

\\x[image-my-headers-are-amazing]
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#image-my-headers-are-amazing' and text()='Figure 1. \"My headers are amazing\"']",
    ],
  }
);
assert_lib_ast('x: cross reference magic insane escape',
  `a\\<>b`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p' and text()='a<>b']",
    ],
  }
);
assert_lib_ast('x: cross reference magic with full uses full content',
  `= Notindex

== My header

\\x[My headers]{magic}{full}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='Section 1. \"My header\"']",
    ],
  }
);
assert_lib('x: cross reference magic cross file plural resolution',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

<dogs>

<two dogs>

<my scope/in scope>
`,
      'notindex2.bigb': `= Notindex2

== Dog

== Two dogs

== My Scope
{scope}

=== In scope
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html#dog' and text()='dogs']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#two-dogs' and text()='two dogs']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#my-scope/in-scope' and text()='in scope']",
      ],
    },
  },
);
assert_lib('x: cross reference magic detects capitalization and plural on output',
  {
    convert_dir: true,
    filesystem: {
     'notindex.bigb': `= Notindex

<Dog>

<two dogs>

<cat>

<one cats>
`,
     'notindex2.bigb': `= Notindex2

== DoG

== Two Dogs

== Cat
{c}

== one Cat
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html#dog' and text()='DoG']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#two-dogs' and text()='two Dogs']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#cat' and text()='Cat']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#one-cat' and text()='one Cats']",
      ],
    },
  },
);
assert_lib_ast('x: cross reference magic insane to scope',
  `= Notindex

\\Q[<My scope/In scope>]{id=same}

\\Q[<My scope/in scope>]{id=lower}

== My scope
{scope}

=== In scope
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@id='same']//x:blockquote//x:a[@href='#my-scope/in-scope' and text()='In scope']",
      // Case is controlled only by the last scope component.
      "//x:div[@id='lower']//x:blockquote//x:a[@href='#my-scope/in-scope' and text()='in scope']",
    ],
  }
);
assert_lib_ast('cross reference magic insane to header file argument',
  `= Notindex

<path/to/my_file.jpg>{file}

== path/to/my_file.jpg
{file}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#_file/path/to/my_file.jpg' and text()='path/to/my_file.jpg']",
    ],
    filesystem: {
      'path/to/my_file.jpg': '',
    },
  }
);
assert_lib_ast('x: cross reference c simple',
  `= Tmp

== Dog

\\x[dog]{c}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#dog' and text()='Dog']",
    ],
  }
)
assert_lib_ast('cross reference p simple',
  `= Tmp

== Dog

\\x[dog]{p}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#dog' and text()='dogs']",
    ],
  }
)
assert_lib_ast('x: cross reference c ignores non plaintext first argument',
  // Maybe we shoud go deep into the first argument tree. But let's KISS for now.
  `= Tmp

== \\i[Good] dog

\\x[good-dog]
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#good-dog']//x:i[text()='Good']",
    ],
  }
)
assert_lib_ast('x: cross reference p ignores non plaintext last argument',
  // Maybe we shoud go deep into the last argument tree. But let's KISS for now.
  `= Tmp

== Good \\i[dog]

\\x[good-dog]{p}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#good-dog']//x:i[text()='dog']",
    ],
  }
)
assert_lib('x: x_external_prefix option',
  {
    convert_dir: true,
    filesystem: {
     'notindex.bigb': `= Notindex

\\x[notindex][notindex to notindex]

\\x[notindex-2][notindex to notindex 2]

\\x[notindex2][notindex to notindex2]

\\x[notindex2-2][notindex to notindex2 2]

== Notindex 2
`,
     'notindex2.bigb': `= Notindex2

== Notindex2 2
`,
    },
    convert_opts: {
      x_external_prefix: 'asdf/'
    },
    assert_xpath: {
      'notindex.html': [
        // Internal links: unchanged.
        "//x:div[@class='p']//x:a[@href='' and text()='notindex to notindex']",
        "//x:div[@class='p']//x:a[@href='#notindex-2' and text()='notindex to notindex 2']",
        // External links: add the prefix.
        "//x:div[@class='p']//x:a[@href='asdf/notindex2.html' and text()='notindex to notindex2']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex2.html#notindex2-2' and text()='notindex to notindex2 2']",
      ],
    },
  }
);
assert_lib('x: ourbigbook.json xPrefix',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: {
        xPrefix: 'asdf/',
      },
    },
    filesystem: {
      'index.bigb': `= Index

<Index>[index to index]

<Index 2>[index to index 2]

<Notindex>[index to notindex]

<Notindex 2>[index to notindex 2]

== Index 2
`,
      'notindex.bigb': `= Notindex

== Notindex 2
`,
      'subdir/notindex.bigb': `= Notindex

<Notindex 2>[notindex to notindex 2]

<Notindex2 2>[notindex to notindex2 2]

== Notindex 2
`,
      'subdir/notindex2.bigb': `= Notindex2

== Notindex2 2
`,
      'subdir/subdir2/notindex.bigb': `= Notindex

</Notindex 2>[subdir/subdir2/notindex to notindex 2]
`,
    },
    assert_xpath: {
      'index.html': [
        // Maybe we'd want:
        //`//x:h1//x:a[@href='asdf']`,
        // but would be slightly inconsistent with the following, so not sure...
        "//x:div[@class='p']//x:a[@href='' and text()='index to index']",
        "//x:div[@class='p']//x:a[@href='#index-2' and text()='index to index 2']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html' and text()='index to notindex']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html#notindex-2' and text()='index to notindex 2']",
      ],
      'split.html': [
        "//x:div[@class='p']//x:a[@href='asdf/index.html#index-2' and text()='index to index 2']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html#notindex-2' and text()='index to notindex 2']",
      ],
      'notindex.html': [
        // Don't add the suffix for -split or -nosplit outputs. Rationale: they don't
        // exist on Web, which is the main use case that we redirect to. Just keep them working locally instead.
        xpath_header_split(1, 'notindex', 'notindex-split.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'subdir/notindex.html': [
        "//x:div[@class='p']//x:a[@href='#notindex-2' and text()='notindex to notindex 2']",
        "//x:div[@class='p']//x:a[@href='asdf/subdir/notindex2.html#notindex2-2' and text()='notindex to notindex2 2']",
      ],
      'subdir/subdir2/notindex.html': [
        "//x:div[@class='p']//x:a[@href='asdf/subdir/subdir2/../../notindex.html#notindex-2' and text()='subdir/subdir2/notindex to notindex 2']",
      ],
    },
  },
);
assert_lib(
  'x: directory name is removed from link to subdir h2',
  {
    convert_dir: true,
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

// Infinite recursion.
// failing https://github.com/ourbigbook/ourbigbook/issues/34
assert_lib_error('cross reference from header title to following header is not allowed',
  `= \\x[h2] aa

== h2
`, 1, 3);
assert_lib_error('cross reference from header title to previous header is not allowed',
  `= h1

== \\x[h1] aa
`, 3, 4);
assert_lib_ast('cross reference from image title to previous non-header is not allowed',
  `\\Image[ab]{title=cd}{external}

\\Image[ef]{title=gh \\x[image-cd]}{external}
`,
  undefined,
  {
    input_path_noext: 'tmp',
    invalid_title_titles: [
      ['image-gh-image-cd', 'tmp.bigb', 3, 1],
    ],
  }
);
assert_lib_ast('cross reference from image title to following non-header is not allowed',
  `\\Image[ef]{title=gh \\x[image-cd]}{external}

\\Image[ab]{title=cd}{external}
`,
  undefined,
  {
    input_path_noext: 'tmp',
    invalid_title_titles: [
      ['image-gh-image-cd', 'tmp.bigb', 1, 1],
    ],
  }
);
assert_lib_error('cross reference infinite recursion with explicit IDs fails gracefully',
  `= \\x[h2]
{id=h1}

== \\x[h1]
{id=h2}
`, 1, 3);
assert_lib_error('cross reference infinite recursion to self IDs fails gracefully',
  `= \\x[tmp]
`, 1, 3, 'tmp.bigb',
  {
    input_path_noext: 'tmp',
  }
);
assert_lib_ast('cross reference from image to previous header with x content without image ID works',
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
assert_lib_ast('cross reference from image to previous header without x content with image ID works',
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
assert_lib_ast('cross reference from image to previous header without x content without image ID works',
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
assert_lib_ast('cross reference from image to following header without x content without image id works',
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
    a('H', undefined, {
      level: [t('2')],
      title: [t('gh')],
    }),
  ],
  { filesystem: { cd: '' } },
);
assert_lib_error('cross reference with parent to undefined ID does not throw',
  `= aa

\\x[bb]{parent}
`,
  3, 3
);

// Scope.
assert_lib_stdin("scope: internal cross references work with header scope and don't throw",
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
assert_lib_ast('scope: with parent leading slash conflict resolution',
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
  a('H', undefined, {level: [t('2')], title: [t('h2')]}, {id: 'h2'}),
  a('H', undefined, {level: [t('3')], title: [t('h3')]}, {id: 'h3'}),
  a('H', undefined, {level: [t('4')], title: [t('h2')]}, {id: 'h3/h2'}),
  a('H', undefined, {level: [t('5')], title: [t('h4')]}, {id: 'h3/h4'}),
  a('H', undefined, {level: [t('3')], title: [t('h4')]}, {id: 'h4'}),
]
);
assert_lib_ast('scope: with parent breakout with no leading slash',
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
  a('H', undefined, {level: [t('2')], title: [t('h2')]}, {id: 'h2'}),
  a('H', undefined, {level: [t('3')], title: [t('h3')]}, {id: 'h3'}),
  a('H', undefined, {level: [t('4')], title: [t('h4')]}, {id: 'h3/h4'}),
  a('H', undefined, {level: [t('3')], title: [t('h5')]}, {id: 'h5'}),
]
);
// https://github.com/ourbigbook/ourbigbook/issues/120
assert_lib_ast('scope: nested with parent',
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
  a('H', undefined, {level: [t('2')], title: [t('h1 1')]}, {id: 'h1/h1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 1')]}, {id: 'h1/h1-1/h1-1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 2')]}, {id: 'h1/h1-1/h1-1-2'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 3')]}, {id: 'h1/h1-1/h1-1-3'}),
  a('H', undefined, {level: [t('2')], title: [t('h1 2')]}, {id: 'h1/h1-2'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 2 1')]}, {id: 'h1/h1-2/h1-2-1'}),
  a('H', undefined, {level: [t('4')], title: [t('h1 2 1 1')]}, {id: 'h1/h1-2/h1-2-1/h1-2-1-1'}),
]
);
assert_lib_ast('scope: nested internal cross references resolves progressively',
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
  a('H', undefined, {level: [t('2')], title: [t('h1 1')]}, {id: 'h1/h1-1'}),
  a('H', undefined, {level: [t('3')], title: [t('h1 1 1')]}, {id: 'h1/h1-1/h1-1-1'}),
  a('P', [a('x', undefined, {href: [t('h1-1')]})]),
]
);
// https://github.com/ourbigbook/ourbigbook/issues/100
assert_lib_error('scope: broken parent still generates a header ID',
  `= h1

\\x[h2]

= h2
{parent=reserved-undefined}

`, 6, 1
);
assert_lib_ast('scope: cross reference to toplevel scoped split header',
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
    assert_xpath_stdout: [
      // Not `#notindex/image-bb`.
      // https://docs.ourbigbook.com#header-scope-argument-of-toplevel-headers
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
    convert_opts: { split_headers: true },
    filesystem: { 'bb.png': '' },
  },
);
assert_lib_ast('scope: cross reference to non-toplevel scoped split header',
  // https://github.com/ourbigbook/ourbigbook/issues/173
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
    convert_opts: { split_headers: true },
    input_path_noext: 'tmp',
  },
);
// https://docs.ourbigbook.com#header-scope-argument-of-toplevel-headers
assert_lib_ast('scope: cross reference to non-included file with toplevel scope',
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
    assert_xpath_stdout: [
      // Not `toplevel-scope.html#toplevel-scope`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html' and text()='toplevel scope']",
      // Not `toplevel-scope.html#toplevel-scope/h2`.
      "//x:div[@class='p']//x:a[@href='toplevel-scope.html#h2' and text()='h2']",
    ],
    assert_xpath: {
      // TODO https://github.com/ourbigbook/ourbigbook/issues/139
      //'notindex-split.html': [
      //  "//x:a[@href='toplevel-scope.html#image-h1' and text()='image h1']",
      //  "//x:a[@href='toplevel-scope/h2.html#image-h2' and text()='image h2']",
      //],
    },
    convert_before: ['toplevel-scope.bigb'],
    input_path_noext: 'notindex',
    convert_opts: { split_headers: true },
    filesystem: {
      'toplevel-scope.bigb': `= Toplevel scope
{scope}

\\Image[h1.png]{title=h1}

== h2

\\Image[h2.png]{title=h2}
`,
      'h1.png': '',
      'h2.png': '',
    }
  }
);
assert_lib_ast('scope: toplevel scope gets removed from IDs in the file',
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
    a('H', undefined, {level: [t('2')], title: [t('h2')]}),
  ],
  {
    assert_xpath_stdout: [
      xpath_header(1, 'notindex'),
      "//x:div[@class='p']//x:a[@href='' and text()='link to notindex']",
      "//x:div[@class='p']//x:a[@href='#h2' and text()='link to h2']",
      xpath_header(2, 'h2'),
    ],
  }
);
assert_lib(
  'incoming links: cross reference incoming links and other children simple',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
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

== Scope 1

== Scope
{scope}

=== Scope 1

=== Scope 2

\\x[scope-1]

\\x[scope-3]{child}

=== Scope 3

== Dog

== Cats
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
        //`//x:h2[@id='_incoming-links']/following:://x:a[@href='#h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='#h2']`,
        // https://github.com/ourbigbook/ourbigbook/issues/155
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='#h2-2']`,
      ],
      'h2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
        // https://github.com/ourbigbook/ourbigbook/issues/155
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
        // https://github.com/ourbigbook/ourbigbook/issues/173
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='../index.html#scope/scope-2']`,
      ],
      'scope/scope-2.html': [
        // https://github.com/ourbigbook/ourbigbook/issues/173
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
      'scope-1.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html#scope/scope-2']`,
      ],
    },
  }
);
assert_lib(
  'incoming links: cross reference incoming links from other file min notindex to index',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'README.bigb': `= Index
`,
      'notindex.bigb': `= Notindex

\\x[index]
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
  }
);
assert_lib(
  'incoming links: cross reference incoming links from other file min index to notindex',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'README.bigb': `= Index

\\x[notindex]
`,
      'notindex.bigb': `= Notindex
`,
    },
    assert_xpath: {
      'notindex.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html']`,
      ],
    },
  }
);
assert_lib(
  // We can have confusion between singular and plural here unless proper resolution is done.
  'incoming links: cross reference incoming links and other children with magic',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'README.bigb': `= Index

== Dog

== Dogs
`,
      'notindex.bigb': `= Notindex

== To dog

<dog>

== To dogs

<dogs>
`,
    },
    assert_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
      ],
      'dogs.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
      ],
    },
    assert_not_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
      ],
      'dogs.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
      ],
    },
  }
);
assert_lib(
  'incoming links: from another source file to split header simple',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'README.bigb': `= Index

== Dog
`,
      'notindex.bigb': `= Notindex

== To dog

<dog>
`,
    },
    assert_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
      ],
    },
  }
);
assert_lib(
  'incoming links: from subdir without direct link to it resolves correctly',
  // Hit a bug where the incoming link was resolving wrongly to subdir/notindex.html#subdir/to-dog
  // because the File was not being fetched from DB. Adding an explicit link from "Dog" to "To dog"
  // would then fix it as it fetched the File.
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'README.bigb': `= Index

== Dog
`,
      'subdir/notindex.bigb': `= Notindex

== To dog

<dog>
`,
    },
    assert_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html#to-dog']`,
      ],
    },
  }
);
assert_lib('x leading slash to escape scopes works across files',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': `\\x[/notindex]`,
      'notindex.bigb': `= Notindex
`,
    },
  }
);
// TODO This test can only work after:
// https://github.com/ourbigbook/ourbigbook/issues/188
// There is no other way to test this currently, as we can't have scopes
// across source files, and since scope is a boolean, and therefore can only
// match the header's ID itself. The functionality has in theory been implemented
// in the commit that adds this commented out test.
//assert_lib('scopes hierarchy resolution works across files',
//  {
//    convert_dir: true,
//    filesystem: {
//      'README.bigb': `= Index
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
//     'notindex.bigb': `= Notindex
//
//== Notindex h2
//`,
//    },
//    assert_xpath: {
//      'index.html': [
//        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='index scope 2 to notindex h2']",
//      ]
//    }
//  }
//);
assert_lib('scope: hierarchy resolution works across files with directories and not magic',
  // https://github.com/ourbigbook/ourbigbook/issues/229
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'subdir/notindex.bigb': `= Notindex

\\x[notindex2][index to notindex2]

\\x[notindex2-h2][index to notindex2 h2]

== Notindex h2
{tag=notindex2}
{tag=notindex2-h2}
`,
     'subdir/notindex2.bigb': `= Notindex2

== Notindex2 h2
`,
     'subdir/subdir/notindex.bigb': `= Notindex

\\x[notindex-h2][subdir/subdir/notindex to subdir/notindex-h2]
`,
    },
    assert_xpath: {
      'subdir/notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-h2' and text()='index to notindex2 h2']",
        "//x:div[@id='notindex-h2']//x:span[@class='test-tags']//x:a[@href='notindex2.html']",
        "//x:div[@id='notindex-h2']//x:span[@class='test-tags']//x:a[@href='notindex2.html#notindex2-h2']",
      ],
      'subdir/notindex2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html#notindex-h2']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
      'subdir/notindex-h2.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html']`,
      ],
      'subdir/subdir/notindex.html': [
        "//x:div[@class='p']//x:a[@href='../notindex.html#notindex-h2' and text()='subdir/subdir/notindex to subdir/notindex-h2']",
      ],
    },
  }
);
assert_lib('scope: hierarchy resolution works across files with directories and magic plural',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'subdir/notindex.bigb': `= Notindex

\\x[dogs]{magic}
`,
     'subdir/notindex2.bigb': `= Notindex2

== Dog
`,
    },
  }
);
assert_lib('scope: link from non subdir scope to subdir scope works',
  // https://github.com/ourbigbook/ourbigbook/issues/284
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex
{scope}

<notindex2>[notindex to notindex2]

== Notindex 2

<notindex2>[notindex 2 to notindex2]
`,
     'notindex/notindex2.bigb': `= Notindex2
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex/notindex2.html' and text()='notindex to notindex2']",
        "//x:div[@class='p']//x:a[@href='notindex/notindex2.html' and text()='notindex 2 to notindex2']",
      ]
    },
  }
);
assert_lib('x: ref_prefix gets appeneded to absolute targets',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ref_prefix: 'subdir',
    },
    filesystem: {
      'subdir/notindex.bigb': `= Notindex

== Scope
{scope}

=== Notindex2

\\x[/notindex2][scope/notindex2 to notindex2]
`,
     'subdir/notindex2.bigb': `= Notindex2
`,
    },
    assert_xpath: {
      'subdir/notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html' and text()='scope/notindex2 to notindex2']",
      ],
      'subdir/notindex2.html': [
        //`//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
  }
);
assert_lib(
  'x: link to image in another file after link to the toplevel header of that file does not blow up',
  {
    convert_dir: true,
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
assert_lib('x: split renders by default links back to nosplit render of another header in the same file',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': `= tmp

<tmp 2>[index to tmp 2]

== tmp 2
`
    },
    assert_xpath: {
      'split.html': [
        "//x:div[@class='p']//x:a[@href='index.html#tmp-2' and text()='index to tmp 2']",
      ],
    },
    convert_opts: { split_headers: true },
  },
);
assert_lib('x: redirect from cirosantilli.com to ourbigbook.com',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': `= tmp

<tmp 2>[tmp to tmp 2]

<tmp2>[tmp to tmp2]

<tmp2 2>[tmp to tmp2 2]

== tmp 2
`,
      'tmp2.bigb': `= tmp2

== tmp2 2
`,
    },
    convert_opts: {
      split_headers: true,
      ourbigbook_json: {
        toSplitHeaders: true,
        xPrefix: 'https://ourbigbook.com/cirosantilli/',
        htmlXExtension: false,
      },
    },
    assert_xpath: {
      'index.html': [
        "//x:div[@class='p']//x:a[@href='#tmp-2' and text()='tmp to tmp 2']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/cirosantilli/tmp2' and text()='tmp to tmp2']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/cirosantilli/tmp2-2' and text()='tmp to tmp2 2']",
      ],
    },
    assert_not_xpath: {
      'index.html': [
        xpath_header_split(1, 'tmp', 'tmp.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'split.html': [
        xpath_header_split(1, 'tmp', 'index.html', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    },
  },
);

// Subdir.
assert_lib('header: subdir argument basic',
  // This was introduced to handle Web uploads without path: API parameter.
  // But in the end for some reason we ended up sticking with the path parameter to start with.
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

\\x[asdf/qwer/notindex2][notindex to notindex2]

\\x[asdf/qwer/notindex2-2][notindex to notindex2 2]
`,
      'notindex2.bigb': `= Notindex2
{subdir=asdf/qwer}

== Notindex2 2
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html' and text()='notindex to notindex2']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-2' and text()='notindex to notindex2 2']",
      ]
    },
  }
);

// Headers.
// \H
assert_lib_ast('header: simple',
  `\\H[1][My header]

\\H[2][My header 2]

\\H[3][My header 3]

\\H[4][My header 4]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('My header')]}),
    a('H', undefined, {level: [t('2')], title: [t('My header 2')]}),
    a('H', undefined, {level: [t('3')], title: [t('My header 3')]}),
    a('H', undefined, {level: [t('4')], title: [t('My header 4')]}),
  ],
  {
    assert_xpath_stdout: [
      // The toplevel header does not have any numerical prefix, e.g. "1. My header",
      // it is just "My header".
      xpath_header(1, 'notindex', "x:a[@href='notindex-split.html' and text()='My header']"),
      xpath_header(2, 'my-header-2', "x:a[@href='my-header-2.html' and text()='1. My header 2']"),
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
    convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  },
);
assert_lib_ast('header: and implicit paragraphs',
  `\\H[1][My header 1]

My paragraph 1.

\\H[2][My header 2]

My paragraph 2.
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('My header 1')]}),
    a('P', [t('My paragraph 1.')]),
    a('H', undefined, {level: [t('2')], title: [t('My header 2')]}),
    a('P', [t('My paragraph 2.')]),
  ]
);
const header_7_expect = [
  a('H', undefined, {level: [t('1')], title: [t('1')]}),
  a('H', undefined, {level: [t('2')], title: [t('2')]}),
  a('H', undefined, {level: [t('3')], title: [t('3')]}),
  a('H', undefined, {level: [t('4')], title: [t('4')]}),
  a('H', undefined, {level: [t('5')], title: [t('5')]}),
  a('H', undefined, {level: [t('6')], title: [t('6')]}),
  a('H', undefined, {level: [t('7')], title: [t('7')]}),
];
assert_lib_ast('header: 7 sane',
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
assert_lib_ast('header: 7 insane',
  // https://github.com/ourbigbook/ourbigbook/issues/32
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
assert_lib_ast('header: 7 parent',
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
assert_lib_ast('header: parent does title to ID conversion',
  `= 1

= a b%c
{parent=1}

= 3
{parent=a b%c}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('1')]}),
    a('H', undefined, {level: [t('2')], title: [t('a b%c')]}, { id: 'a-b-percent-c' }),
    a('H', undefined, {level: [t('3')], title: [t('3')]}),
  ],
);
assert_lib_error('header: with parent argument must have level equal 1',
  `= 1

== 2
{parent=1}
`,
  3, 1
);
assert_lib_error('header: parent cannot be an older id of a level',
  `= 1

== 2

== 2 2

= 3
{parent=2}
`,
  8, 1
);
assert_lib_error('header: header inside parent',
  `= 1

== 2
{parent=1

== 3
}
`,
  3, 1
);
assert_lib_error('header: child argument to id that does not exist gives an error',
  `= 1
{child=2}
{child=3}

== 2
`,
  3, 1
);
assert_lib_error('header: tag argument to id that does not exist gives an error',
  `= 1
{tag=2}
{tag=3}

== 2
`,
  3, 1
);
assert_lib('header: tag and child argument does title to ID conversion',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= 1

== a b%c
{child=d e%f}

== 3
{tag=a b%c}

== d e%f
`,
    },
  }
);
assert_lib_error('header: child and synonym arguments are incompatible',
  // This almost worked, but "Other children" links were not showing.
  // Either we support it fully, or it blows up clearly, this immediately
  // confused me a bit on cirosantilli.com.
  `= 1

= 1 2
{synonym}
{child=2}

== 2
`,
  5, 1
);
assert_lib_error('header: tag and synonym arguments are incompatible',
  `= 1

= 1 2
{synonym}
{tag=2}

== 2
`,
  5, 1
);
assert_lib_error('header: synonym without preceeding header fails gracefully',
  `asdf

= qwer
{synonym}
`,
  4, 1
);
//// This would be the ideal behaviour, but I'm lazy now.
//// https://github.com/ourbigbook/ourbigbook/issues/200
//assert_lib_ast('full link to synonym renders the same as full link to the main header',
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
//    assert_xpath_stdout: [
//      "//x:blockquote//x:a[@href='#1-2' and text()='Section 1. \"1 2\"']",
//    ],
//  }
//);
// This is not the ideal behaviour, the above test would be the ideal.
// But it will be good enough for now.
// https://github.com/ourbigbook/ourbigbook/issues/200
assert_lib_ast('header: title2 full link to synonym with title2 does not get dummy empty parenthesis',
  `= 1

\\Q[\\x[1-3]{full}]

== 1 2

= 1 3
{synonym}
{title2}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:blockquote//x:a[@href='#1-2' and text()='Section 1. \"1 3\"']",
    ],
  }
);
assert_lib_ast('header: title2 shows next to title',
  `= Asdf
{title2=qwer}
{title2=zxcv}
`,
  undefined,
  {
    assert_xpath_stdout: [
      xpath_header(1, 'asdf', "x:a[@href='' and text()='Asdf (qwer, zxcv)']"),
    ],
  }
);
assert_lib_error('header: title2 of synonym must be empty',
  `= 1

= 1 2
{synonym}
{title2=asdf}
`,
  // 5, 9 would be better, pointing to the start of asdf
  5, 1
);
assert_lib_error('header: title2 of synonym cannot be given multiple times',
  `= 1

= 1 2
{synonym}
{title2}
{title2}
`,
  // 6, 1 would be better, pointing to second title2
  5, 1
);
assert_lib('header: synonym basic',
  // https://github.com/ourbigbook/ourbigbook/issues/114
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
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
      //// Redirect generated by synonym.
      //'my-h2-synonym.html': [
      //  "//x:script[text()=\"location='index.html#h2'\"]",
      //],
      // Redirect generated by synonym.
      //'my-notindex-h2-synonym.html': [
      //  "//x:script[text()=\"location='notindex.html#notindex-h2'\"]",
      //],
    }
  }
);
assert_lib('header: synonym in splitDefault',
  // https://github.com/ourbigbook/ourbigbook/issues/225
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
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
assert_lib('header: link to synonym toplevel does not have fragment',
  // https://docs.ourbigbook.com/todo/links-to-synonym-header-have-fragment
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': `= Index

<notindex>

<notindex 2>
`,
      'notindex.bigb': `= Notindex

= Notindex 2
{synonym}
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='notindex 2']",
      ],
    }
  }
);
const header_id_new_line_expect =
  [a('H', undefined, {level: [t('1')], title: [t('aa')], id: [t('bb')]})];
assert_lib_ast('header id new line sane',
  '\\H[1][aa]\n{id=bb}',
  header_id_new_line_expect,
);
assert_lib_ast('header id new line insane no trailing elment',
  '= aa\n{id=bb}',
  header_id_new_line_expect,
);
assert_lib_ast('header id new line insane trailing element',
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
assert_lib_error('header: level must be an integer', '\\H[a][b]\n', 1, 3);
assert_lib_error('header: non integer h2 header level does not throw',
  `\\H[1][h1]

\\H[][h2 1]

\\H[2][h2 2]

\\H[][h2 3]
`, 3, 3);
assert_lib_error('header: non integer h1 header level does not throw',
  `\\H[][h1]
`, 1, 3);
assert_lib_error('header: must be an integer empty', '\\H[][b]\n', 1, 3);
assert_lib_error('header: must not be zero', '\\H[0][b]\n', 1, 3);
assert_lib_error('header: skip level is an error', '\\H[1][a]\n\n\\H[3][b]\n', 3, 3);
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
assert_lib('header: numbered argument',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': header_numbered_input,
    },
    assert_xpath: {
      'index.html': [
        "//x:blockquote//x:a[@href='#tmp-2' and text()='Section 1. \"tmp 2\"']",
        "//x:blockquote//x:a[@href='#tmp-4' and text()='Section \"tmp 4\"']",
        "//x:blockquote//x:a[@href='#tmp-8' and text()='Section 1.1. \"tmp 8\"']",
        "//*[@id='_toc']//x:a[@href='#tmp-2' and text()='1. tmp 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-3' and text()='1.1. tmp 3']",
        "//*[@id='_toc']//x:a[@href='#tmp-4' and text()='tmp 4']",
        "//*[@id='_toc']//x:a[@href='#tmp-5' and text()='tmp 5']",
        "//*[@id='_toc']//x:a[@href='#tmp-6' and text()='tmp 6']",
        "//*[@id='_toc']//x:a[@href='#tmp-7' and text()='1. tmp 7']",
        "//*[@id='_toc']//x:a[@href='#tmp-8' and text()='1.1. tmp 8']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2' and text()='2. tmp 2 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3' and text()='2.1. tmp 2 2 3']",
      ],
      'tmp-6.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-7' and text()='1. tmp 7']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1. tmp 8']",
      ],
    },
    convert_opts: { split_headers: true },
  },
);
assert_lib('header: numbered ourbigbook.json',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': header_numbered_input,
    },
    assert_xpath: {
      'index.html': [
        "//x:blockquote//x:a[@href='#tmp-2' and text()='Section \"tmp 2\"']",
        "//x:blockquote//x:a[@href='#tmp-4' and text()='Section \"tmp 4\"']",
        "//x:blockquote//x:a[@href='#tmp-8' and text()='Section 1.1. \"tmp 8\"']",
        "//*[@id='_toc']//x:a[@href='#tmp-2' and text()='tmp 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-3' and text()='tmp 3']",
        "//*[@id='_toc']//x:a[@href='#tmp-4' and text()='tmp 4']",
        "//*[@id='_toc']//x:a[@href='#tmp-5' and text()='tmp 5']",
        "//*[@id='_toc']//x:a[@href='#tmp-6' and text()='tmp 6']",
        "//*[@id='_toc']//x:a[@href='#tmp-7' and text()='1. tmp 7']",
        "//*[@id='_toc']//x:a[@href='#tmp-8' and text()='1.1. tmp 8']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2' and text()='tmp 2 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3' and text()='tmp 2 2 3']",
      ],
      'tmp-6.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-7' and text()='1. tmp 7']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1. tmp 8']",
      ],
    },
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    }
  },
);
assert_lib('header: splitDefault on ourbigbook.json',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { splitDefault: true } }
    },
    filesystem: {
      'README.bigb': `= Index

\\Include[notindex]

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`
    },
    assert_xpath: {
      'index.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex-h2.html' and text()='1.1. Notindex h2']",
      ],
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex-h2.html' and text()='1. Notindex h2']",
      ],
    },
  },
);
assert_lib_ast('header: file argument works',
  `= h1

== path/to
{file}

My directory

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

    a('H', undefined, {level: [t('2')], title: [t('path/to')]}),
    header_file_about_ast('path/to', 'directory'),
    a('P', [t('My directory')]),

    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.txt')]}),
    header_file_about_ast('path/to/my-file.txt'),
    a('P', [t('My txt')]),
    a('P', [a('b', [t('path/to/my-file.txt')])]),
    a('C', [t(`My Line 1

My Line 2
`
    )]),

    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.png')]}),
    header_file_about_ast('path/to/my-file.png'),
    a('Image', undefined, {src: [t('path/to/my-file.png')]}),
    a('P', [t('My png')]),

    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.mp4')]}),
    header_file_about_ast('path/to/my-file.mp4'),
    a('Video', undefined, {src: [t('path/to/my-file.mp4')]}),
    a('P', [t('My mp4')]),

    a('H', undefined, {level: [t('2')], title: [t('Path to YouTube')]}),
    header_file_about_ast('https://www.youtube.com/watch?v=YeFzeNAHEhU', 'video'),
    a('Video', undefined, {src: [t('https://www.youtube.com/watch?v=YeFzeNAHEhU')]}),
    a('P', [t('My youtube')]),
  ],
  {
    filesystem: {
      'path/to/my-file.txt': `My Line 1

My Line 2
`,
      'path/to/my-file.png': '',
      'path/to/my-file.mp4': '',
    },
  },
);
assert_lib_ast('header file argument that is the last header adds the preview',
  `= h1

== path/to/my-file.png
{file}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('H', undefined, {level: [t('2')], title: [t('path/to/my-file.png')]}),
    header_file_about_ast('path/to/my-file.png'),
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
assert_lib_error('header: file argument to a file that does not exist gives an error',
  `= h1

== dont-exist
{file}
`, 3, 1);
assert_lib_ast('header: escape insane header at start of document',
  '\\= a',
  [a('P', [t('= a')])],
);
assert_lib('header: toplevel argument',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'README.bigb': `= Index

<h 1>[index to h 1]

<h 1 1>[index to h 1 1]

<h 1 1 1>[index to h 1 1 1]

<image 1 1 1>[index to image 1 1 1]

<h 1 1 1 1>[index to h 1 1 1 1]

<h 1 1 1 1 1>[index to h 1 1 1 1 1]

<h 1 1 1 1 1 1>[index to h 1 1 1 1 1 1]

<h 2>[index to h 2]

<h 2/h 2 1>[index to h 2 1]

<h 2/h 2 1 1>[index to h 2 1 1]

<h 2/h 2 1 1 1>[index to h 2 1 1 1]

<notindex>[index to notindex]

<notindex 1>[index to notindex 1]

<notindex 1 1>[index to notindex 1 1]

<notindex 1 1 1>[index to notindex 1 1 1]

== h 1

=== h 1 1
{toplevel}

==== h 1 1 1

\\Image[asdf.png]{title=1 1 1}{external}

\\Include[notindex]

===== h 1 1 1 1

====== h 1 1 1 1 1
{toplevel}

======= h 1 1 1 1 1 1

======= h 1 1 1 1 1 2

====== h 1 1 1 1 2

==== h 1 1 2

== h 2
{scope}

=== h 2 1

==== h 2 1 1
{toplevel}

===== h 2 1 1 1
`,
      'notindex.bigb': `= Notindex

== Notindex 1

=== Notindex 1 1
{toplevel}

==== Notindex 1 1 1
`
    },
    assert_xpath: {
      'index.html': [
        // Same as without toplevel sanity checks.
        xpath_header(1, 'index'),
        xpath_header(2, 'h-1'),
        "//x:div[@class='p']//x:a[@href='#h-1' and text()='index to h 1']",
        "//x:div[@class='p']//x:a[@href='#h-2' and text()='index to h 2']",
        "//x:div[@class='p']//x:a[@href='#h-2/h-2-1' and text()='index to h 2 1']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='index to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-1' and text()='index to notindex 1']",
        "//x:div[@class='p']//x:a[@href='notindex-1-1.html' and text()='index to notindex 1 1']",
        "//x:div[@class='p']//x:a[@href='notindex-1-1.html#notindex-1-1-1' and text()='index to notindex 1 1 1']",
        "//*[@id='_toc']//x:a[@href='#h-1' and text()='1. h 1']",
        "//*[@id='_toc']//x:a[@href='h-1-1.html' and text()='1.1. h 1 1']",
        "//*[@id='_toc']//x:a[@href='h-1-1.html#h-1-1-1' and text()='1.1.1. h 1 1 1']",

        // Modified by toplevel.
        "//x:div[@class='p']//x:a[@href='h-1-1.html' and text()='index to h 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#h-1-1-1' and text()='index to h 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#image-1-1-1' and text()='index to image 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#h-1-1-1-1' and text()='index to h 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1-1-1-1.html' and text()='index to h 1 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1-1-1-1.html#h-1-1-1-1-1-1' and text()='index to h 1 1 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-2/h-2-1-1.html' and text()='index to h 2 1 1']",
        "//x:div[@class='p']//x:a[@href='h-2/h-2-1-1.html#h-2-1-1-1' and text()='index to h 2 1 1 1']",

        //// How it would be without toplevel.
        //xpath_header(3, 'h-1-1'),
        //xpath_header(4, 'h-1-1-1'),
        //xpath_header(5, 'h-1-1-1-1'),
        //xpath_header(6, 'h-1-1-1-1-1'),
        //xpath_header(7, 'h-1-1-1-1-1-1'),
        //"//x:div[@class='p']//x:a[@href='#h-1-1' and text()='index to h 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1' and text()='index to h 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1' and text()='index to h 1 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1-1' and text()='index to h 1 1 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1-1-1' and text()='index to h 1 1 1 1 1 1']",
      ],
      'h-1-1.html': [
        xpath_header(1, 'h-1-1'),
        xpath_header(2, 'h-1-1-1'),
        xpath_header(3, 'h-1-1-1-1'),
      ],
      'h-1-1-split.html': [
        xpath_header(1, 'h-1-1'),
      ],
      'h-1-1-1-1-1.html': [
        xpath_header(1, 'h-1-1-1-1-1'),
        xpath_header(2, 'h-1-1-1-1-1-1'),
      ],
      'h-2/h-2-1-1.html': [
        xpath_header(1, 'h-2-1-1'),
        xpath_header(2, 'h-2-1-1-1'),
      ],
      'h-2/h-2-1-1-split.html': [
        xpath_header(1, 'h-2-1-1'),
      ],
      'notindex.html': [
        xpath_header(1, 'notindex'),
        xpath_header(2, 'notindex-1'),
      ],
      'notindex-1-1.html': [
        xpath_header(1, 'notindex-1-1'),
        xpath_header(2, 'notindex-1-1-1'),
      ],
      'notindex-1-1-split.html': [
        xpath_header(1, 'notindex-1-1'),
      ],
    },
    assert_not_xpath: {
      'index.html': [
        xpath_header(4, 'h-1-1-1'),
        xpath_header(5, 'h-1-1-1-1'),
        xpath_header(6, 'h-1-1-1-1-1'),
        xpath_header(7, 'h-1-1-1-1-1-1'),
      ],
      'h-1-1-split.html': [
        xpath_header(2, 'h-1-1-1'),
        xpath_header(3, 'h-1-1-1-1'),
      ],
      'h-2/h-2-1-1-split.html': [
        xpath_header(2, 'h-2-1-1-1'),
      ],
      'notindex.html': [
        xpath_header(3, 'notindex-1-1'),
        xpath_header(4, 'notindex-1-1-1'),
      ],
      'notindex-1-1-split.html': [
        xpath_header(2, 'notindex-1-1-1'),
      ],
    }
  },
);
assert_lib_ast('header: id of first header comes from the file name if not index',
  // https://docs.ourbigbook.com#the-id-of-the-first-header-is-derived-from-the-filename
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
assert_lib_ast('header: id of first header comes from header title if index',
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
    convert_opts: {
      input_path: ourbigbook.INDEX_BASENAME_NOEXT + '.' + ourbigbook.OURBIGBOOK_EXT
    }
  },
);
assert_lib_error('header: empty include in header title fails gracefully',
  // https://github.com/ourbigbook/ourbigbook/issues/195
  `= tmp

== \\Include
`,
  3, 4
);
assert_lib_error('header: empty x in header title fails gracefully',
  `= tmp

== a \\x
`,
  3, 6
);
assert_lib_error('header: inside header fails gracefully',
  `= \\H[2]
`,
  1, 3, 'tmp.bigb',
  {
    input_path_noext: 'tmp',
  }
);
assert_lib_error('header: forbid_multiheader option forbids multiple headers',
  `= h1

== h2
`,
  3, 1, 'tmp.bigb',
  {
    convert_opts: {
      forbid_multiheader: 'denied',
    },
    input_path_noext: 'tmp',
  }
);
assert_lib_stdin('header: forbid_multiheader option allows synonyms',
  `= h1

= h2
{synonym}
`,
  {
    convert_opts: {
      forbid_multiheader: 'denied',
    },
  }
);
assert_lib_stdin('header: wiki argument without value adds a link to wikipedia based on the title',
  `= My topic
{wiki}
`,
  {
    assert_xpath_stdout: [
      "//x:a[@href='https://en.wikipedia.org/wiki/My_topic']",
    ]
  }
);
assert_lib_stdin('header: wiki argument with a value adds a link to wikipedia with that value',
  `= My topic
{wiki=Another_one}
`,
  {
    assert_xpath_stdout: [
      "//x:a[@href='https://en.wikipedia.org/wiki/Another_one']",
    ]
  }
);

// Code.
assert_lib_ast('code: inline sane',
  'a \\c[b c] d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('b c')]),
      t(' d'),
    ]),
  ],
);
assert_lib_ast('code: inline insane simple',
  'a `b c` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('b c')]),
      t(' d'),
    ]),
  ]
);
// https://github.com/ourbigbook/ourbigbook/issues/171
assert_lib_ast('code: inline insane with only a backslash',
  'a `\\` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('\\')]),
      t(' d'),
    ]),
  ]
);
assert_lib_ast('code: inline insane escape backtick',
  'a \\`b c\n',
  [a('P', [t('a `b c')])]
);
assert_lib_ast('code: block literal sane',
  `a

\\C[[
b
c
]]

d
`,
  [
    a('P', [t('a')]),
    a('C', [t('b\nc')]),
    a('P', [t('d')]),
  ]
);
assert_lib_ast('code: block insane',
  `a

\`\`
b
c
\`\`

d
`,
  [
    a('P', [t('a')]),
    a('C', [t('b\nc')]),
    a('P', [t('d')]),
  ]
);
assert_lib_ast('code: with id has caption',
  `\`\`
aa
\`\`
{id=bb}
`,
  [
    a('C', [t('aa')], { id: [t('bb')] }, { id: 'bb'} ),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_lib_ast('code: with title has caption',
  `\`\`
aa
\`\`
{title=b b}
`,
  [
    a('C', [t('aa')], { title: [t('b b')] }, { id: 'code-b-b'} ),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_lib_ast('code: with description has caption',
  `\`\`
aa
\`\`
{description=b b}
`,
  [
    a('C', [t('aa')], { description: [t('b b')] }, { id: '_1'} ),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
);
assert_lib_ast('code: without id, title, nor description does not have caption',
  `\`\`
aa
\`\`
`,
  [
    a('C', [t('aa')], {}, { id: '_1'} ),
  ],
  {
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
    ]
  }
)
assert_lib_ast('code: without id, title, nor description does not increment the code count',
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
    a('C', [t('aa')], { id: [t('00')] }, { id: '00'} ),
    a('C', [t('bb')], {}, { id: '_1'} ),
    a('C', [t('cc')], { id: [t('22')] }, { id: '22'} ),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 1']",
      "//x:span[@class='caption-prefix' and text()='Code 2']",
    ],
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Code 3']",
    ],
  },
)

// lint h-parent
assert_lib_stdin('header parent works with ourbigbook.json lint h-parent equal parent and no includes',
  `= 1

= 2
{parent=1}
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_lib_error('header number fails with ourbigbook.json lint h-parent = parent',
  `= 1

== 2
`,
  3, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
);
assert_lib_stdin('header number works with ourbigbook.json lint h-parent = number',
  `= 1

== 2
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
);
assert_lib_error('header parent fails with ourbigbook.json lint h-parent = number',
  `= 1

= 2
{parent=1}
`,
  3, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
);
assert_lib_stdin('header parent works with ourbigbook.json lint h-parent equal parent and includes with parent',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels-parent]
`,
  {
    convert_opts: {
      ourbigbook_json: { lint: { 'h-parent': 'parent', } },
      embed_includes: true,
    }
  }
);
assert_lib_error('header parent fails with ourbigbook.json lint h-parent equal parent and includes with number',
  `= 1

= 2
{parent=1}

\\Include[include-two-levels]
`,
  5, 1, 'include-two-levels.bigb',
  {
    convert_opts: {
      ourbigbook_json: { lint: { 'h-parent': 'parent', } },
      embed_includes: true,
    }
  }
);
// lint h-tag
assert_lib_error('lint h-tag child failure',
  `= 1
{tag=2}

== 2
`,
  2, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'child', } } } }
);
assert_lib_stdin('lint h-tag child pass',
  `= 1
{child=2}

== 2
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'child', } } } }
);
assert_lib_error('lint h-tag tag failure',
  `= 1
{child=2}

== 2
`,
  2, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
);
assert_lib_stdin('lint h-tag tag pass',
  `= 1
{tag=2}

== 2
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
);

// Word counts.
assert_lib_ast('word count simple',
  `= h1

11 22 33
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='3']",
    ],
  }
);
assert_lib_ast('word count x',
  `= h1

I like \\x[my-h2]

== My h2
`,
  undefined,
  {
    assert_xpath_stdout: [
      // TODO the desired value is 4. 2 is not terrible though, better than 3 if we were considering the href.
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='2']",
    ],
  }
);
assert_lib_ast('word count descendant in source',
  `= h1

11 22 33

== h2

44 55
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='3']",
      "//*[contains(@class, 'h-nav')]//*[@class='word-count-descendant' and text()='5']",
    ],
    assert_xpath: {
      'h2.html': [
        "//*[contains(@class, 'h-nav')]//*[@class='word-count' and text()='2']",
      ]
    },
    convert_opts: { split_headers: true },
  }
);
assert_lib('word count descendant from include without embed includes',
  {
    convert_dir: true,
    filesystem: {
      'README.bigb': `= h1

11 22 33

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

44 55
`
    },
    assert_xpath: {
      'index.html': [
        "//*[contains(@class, 'h-nav')]//*[contains(@class, 'word-count') and text()='3']",
        "//*[contains(@class, 'h-nav')]//*[contains(@class, 'word-count-descendant') and text()='5']",
      ]
    },
  }
);

// Toc
// https://github.com/ourbigbook/ourbigbook/issues/143
assert_lib_ast('header with insane paragraph in the content does not blow up',
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
assert_lib_ast('xss: H id',
  `= tmp
{id=&\\<>"'}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[contains(@class, \"h \") and @id=concat('&<>\"', \"'\")]",
    ]
  }
);

// Table of contents
assert_lib_ast('toc: split headers have correct table of contents',
  `= h1

== h1 1

== h1 2

=== h1 2 1

==== h1 2 1 1
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('H', undefined, {level: [t('2')], title: [t('h1 1')]}),
    a('H', undefined, {level: [t('2')], title: [t('h1 2')]}),
    a('H', undefined, {level: [t('3')], title: [t('h1 2 1')]}),
    a('H', undefined, {level: [t('4')], title: [t('h1 2 1 1')]}),
  ],
  {
    assert_xpath_stdout: [
      // There is a self-link to the Toc.
      "//*[@id='_toc']",
      "//*[@id='_toc']//x:a[@href='#_toc' and text()=' Table of contents']",

      // ToC links have parent toc entry links.
      // Toplevel entries point to the ToC toplevel.
      `//*[@id='_toc']//*[@id='_toc/h1-1']//x:a[@href='#_toc' and text()=' h1']`,
      `//*[@id='_toc']//*[@id='_toc/h1-2']//x:a[@href='#_toc' and text()=' h1']`,
      // Inner entries point to their parent entries.
      `//*[@id='_toc']//*[@id='_toc/h1-2-1']//x:a[@href='#_toc/h1-2' and text()=' h1 2']`,

      // The ToC numbers look OK.
      "//*[@id='_toc']//x:a[@href='#h1-2' and text()='2. h1 2']",

      // The headers have ToC links.
      `${xpath_header(2, 'h1-1')}//x:a[@href='#_toc/h1-1' and text()=' toc']`,
      `${xpath_header(2, 'h1-2')}//x:a[@href='#_toc/h1-2' and text()=' toc']`,
      `${xpath_header(3, 'h1-2-1')}//x:a[@href='#_toc/h1-2-1' and text()=' toc']`,

      // Descendant count.
      "//*[@id='_toc']//*[@class='title-div']//*[@class='descendant-count' and text()='4']",
      "//*[@id='_toc']//*[@id='_toc/h1-2']//*[@class='descendant-count' and text()='2']",
    ],
    assert_xpath: {
      'notindex-split.html': [
        // Split output files get their own ToCs.
        "//*[@id='_toc']",
        "//*[@id='_toc']//x:a[@href='#_toc' and text()=' Table of contents']",
      ],
      'h1-2.html': [
        // Split output files get their own ToCs.
        "//*[@id='_toc']",
        "//*[@id='_toc']//x:a[@href='#_toc' and text()=' Table of contents']",

        // The Toc entries of split output headers automatically cull out a level
        // of the full number tree. E.g this entry is `2.1` on the toplevel ToC,
        // but on this sub-ToC it is just `1.`.
        "//*[@id='_toc']//x:a[@href='notindex.html#h1-2-1' and text()='1. h1 2 1']",
        "//*[@id='_toc']//x:a[@href='notindex.html#h1-2-1-1' and text()='1.1. h1 2 1 1']",

        // We have gone a bit back and forth on split vs nosplit here.
        // Related: https://github.com/ourbigbook/ourbigbook/issues/146
        `//*[@id='_toc']//*[@id='_toc/h1-2-1']//x:a[@href='#_toc' and text()=' h1 2']`,
        `//*[@id='_toc']//*[@id='_toc/h1-2-1-1']//x:a[@href='#_toc/h1-2-1' and text()=' h1 2 1']`,

        // Descendant count.
        "//*[@id='_toc']//*[@class='title-div']//*[@class='descendant-count' and text()='2']",
        "//*[@id='_toc']//*[@id='_toc/h1-2-1']//*[@class='descendant-count' and text()='1']",
      ],
    },
    assert_not_xpath: {
      // A node without no children headers has no ToC,
      // as it would just be empty and waste space.
      'h1-2-1-1.html': ["//*[text()=' Table of contents']"],
    },
    convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  },
);
assert_lib_error('toc: _toc is a reserved id',
  `= h1

== toc
{id=_toc}
`,
  3, 1);
assert_lib('toc: table of contents contains included headers numbered without embed includes',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'notindex.bigb': `= Notindex

\\Q[\\x[notindex2]{full}]

\\Include[notindex2]

== Notindex h2
`,
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
    assert_xpath: {
      'notindex.html': [
        "//x:blockquote//x:a[@href='notindex2.html' and text()='Section 1. \"Notindex2\"']",
        "//*[@id='_toc']//x:a[@href='notindex2.html' and @data-test='0' and text()='1. Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and @data-test='1' and text()='1.1. Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h3' and @data-test='2' and text()='1.2. Notindex2 h3']",
        "//*[@id='_toc']//x:a[@href='notindex3.html' and @data-test='3' and text()='1.2.1. Notindex3']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h2' and @data-test='4' and text()='1.2.1.1. Notindex3 h2']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h3' and @data-test='5' and text()='1.2.1.2. Notindex3 h3']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and @data-test='6' and text()='2. Notindex h2']",
      ],
      'notindex-split.html': [
        // Links to external source files keep the default split just like regular links.
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1.1. Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='2. Notindex h2']",
      ],
    },
  },
);
assert_lib('toc: table of contents respects numbered=0 of included headers',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

\\Include[notindex2]

== Notindex h2
`,
      'notindex2.bigb': `= Notindex2
{numbered=0}

== Notindex2 h2
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='2. Notindex h2']",
      ],
    },
  },
);
assert_lib('toc: table of contents include placeholder header has no number when under numbered=0',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex
{numbered=0}

\\Q[\\x[notindex2]{full}]

\\Include[notindex2]

== Notindex h2
`,
      'notindex2.bigb': `= Notindex2

== Notindex2 h2
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:blockquote//x:a[@href='notindex2.html' and text()='Section \"Notindex2\"']",
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1. Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
      ],
    },
  },
);
assert_lib('toc: table of contents does not show synonyms of included headers',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'notindex2.bigb': `= Notindex2

== Notindex2 h2

= Notindex2 h2 synonym
{synonym}

== Notindex2 h2 2
`,
    },
    //assert_xpath: {
    //  'notindex.html': [
    //    "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='1. Notindex2']",
    //    "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='1.1. Notindex2 h2']",
    //    "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2-2' and text()='1.2. Notindex2 h2 2']",
    //  ],
    //},
    //assert_not_xpath: {
    //  'notindex.html': [
    //    "//*[@id='_toc']//x:a[contains(text(),'synonym')]",
    //  ],
    //},
  },
);
assert_lib('toc: header numbered=0 in ourbigbook.json works across source files and on table of contents',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'README.bigb': `= Index

\\Include[notindex]

== H2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    assert_xpath: {
      'index.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
        "//*[@id='_toc']//x:a[@href='#h2' and text()='H2']",
      ],
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
      ],
    },
  },
);
assert_lib('toc: split header with an include and no headers has a single table of contents',
  // At 074bacbdd3dc9d3fa8dafec74200043f42779bec was getting two.
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
    },
    assert_xpath: {
      'split.html': [
        "//*[@id='_toc']",
      ],
    },
  },
);
assert_lib('toc: toplevel scope gets removed on table of contents of included headers',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Index

\\Q[\\x[notindex/notindex-h2]{full}]

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{scope}

== Notindex h2
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:blockquote//x:a[@href='notindex.html#notindex-h2' and text()='Section 1.1. \"Notindex h2\"']",
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
      'split.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
    },
  },
);

assert_lib_ast('toc: the toc is added before the first h1 when there are multiple toplevel h1',
  `aa

= h1

= h2
`,
  [
    a('P', [t('aa')]),
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('H', undefined, {level: [t('1')], title: [t('h2')]}),
  ],
  {
    assert_xpath_stdout: [
      "//x:div[@class='p' and text()='aa']",
      "//*[@id='_toc']",
      xpath_header(1, 'h1', undefined, { hasToc: true }),
      xpath_header(1, 'h2', undefined, { hasToc: false }),
    ],
  }
)
assert_lib_ast('toc: the toc is added before the first h2 when there is a single h1 and a single h2',
  `= h1

== h2
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//*[@id='_toc']",
      xpath_header(1, 'h1', undefined, { hasToc: false }),
      xpath_header(2, 'h2', undefined, { hasToc: true }),
    ],
  }
)
assert_lib_ast('toc: the toc is added before the first h2 when there is a single h1 and a two h2',
  `= h1

== h2

== h2 2
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//*[@id='_toc']",
      xpath_header(1, 'h1', undefined, { hasToc: false }),
      xpath_header(2, 'h2', undefined, { hasToc: true }),
      xpath_header(2, 'h2-2', undefined, { hasToc: false }),
    ],
  }
)
assert_lib('toc: ancestors list shows after toc on toplevel',
  {
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]

== h2

=== h3

==== h4
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
    convert_dir: true,
    convert_opts: { split_headers: true },
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

// Math.
// \M
// Minimal testing since this is mostly factored out with code tests.
assert_lib_ast('math: inline sane',
  '\\m[[\\sqrt{1 + 1}]]\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
);
assert_lib_ast('math: inline insane simple',
  '$\\sqrt{1 + 1}$\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
);
assert_lib_ast('math: inline escape dollar',
  'a \\$b c\n',
  [a('P', [t('a $b c')])],
);
assert_lib_ast('math: block sane',
  '\\M[[\\sqrt{1 + 1}]]',
  [a('M', [t('\\sqrt{1 + 1}')])],
);
assert_lib_ast('math: block insane',
  '$$\\sqrt{1 + 1}$$',
  [a('M', [t('\\sqrt{1 + 1}')])],
);
assert_lib_stdin('math: define and use in another block with split headers',
  // Can lead to double redefinition errors if we are not careful on implementation.
  `$$
  \\newcommand{\\mycmd}[0]{hello}
  $$

$$
\\mycmd
$$
`,
  {
    convert_opts: { split_headers: true },
  }
)
assert_lib_stdin('math block with comment on last line',
  // KaTeX parse error: LaTeX-incompatible input and strict mode is set to 'error': % comment has no terminating newline; LaTeX would fail because of commenting the end of math mode (e.g. $) [commentAtEnd]
  `$$
% my comment
$$
`,
);
assert_lib_error('math undefined macro', '\\m[[\\reserved_undefined]]', 1, 3);

// Quote.
// \Q
assert_lib_stdin('quotation: generates valid HTML with title',
  `\\Q[My quote]{title=My title}
`,
  {
    assert_xpath_stdout: [
      `//x:div[@id='quote-my-title']//x:blockquote[text()='My quote']`,
    ],
  }
)

// Include.
const include_opts = {
  convert_opts: {
    embed_includes: true,
  }
};
const include_two_levels_ast_args = [
  a('H', undefined, {level: [t('2')], title: [t('ee')]}),
  a('P', [t('ff')]),
  a('H', undefined, {level: [t('3')], title: [t('gg')]}),
  a('P', [t('hh')]),
]
assert_lib_ast('include: simple with paragraph with embed includes',
  `= Index

Index paragraph.

\\Include[include-one-level-1]

\\Include[include-one-level-2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Index')]}),
    a('P', [t('Index paragraph.')]),
    a('H', undefined, {level: [t('2')], title: [t('Include one level 1')]}),
    a('P', [t('Include one level 1 paragraph.')]),
    a('H', undefined, {level: [t('2')], title: [t('Include one level 2')]}),
    a('P', [t('Include one level 2 paragraph.')]),
  ],
  {
    convert_opts: {
      embed_includes: true,
    },
    filesystem: default_filesystem2,
    assert_xpath_stdout: [
        "//x:div[@class='p' and text()='Include one level 1 paragraph.']",
    ],
  },
);
assert_lib_ast('include: parent argument with embed includes',
  `= h1

== h2

\\Include[include-one-level-1]{parent=h1}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('h1')]}),
    a('H', undefined, {level: [t('2')], title: [t('h2')]}),
    // This is level 2, not three, since it's parent is h1.
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ],
  include_opts
);
assert_lib_error('include: parent argument to old ID fails gracefully',
  `= h1

== h2

== h2 2

\\Include[include-one-level-1]{parent=h2}
`,
  7, 30, undefined, include_opts,
);
assert_lib_ast('include: simple without parent in the include with embed includes',
  `= aa

bb

\\Include[include-two-levels]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [t('ff')]),
    a('H', undefined, {level: [t('3')], title: [t('gg')]}),
    a('P', [t('hh')]),
  ],
  include_opts
);
assert_lib_ast('include: simple with parent in the include with embed includes',
  `= aa

bb

\\Include[include-two-levels-parent]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('H', undefined, {level: [t('2')], title: [t('Include two levels parent')]}),
    a('P', [t('h1 content')]),
    a('H', undefined, {level: [t('3')], title: [t('Include two levels parent h2')]}),
    a('P', [t('h2 content')]),
  ],
  include_opts
);
assert_lib_ast('include: simple with paragraph with no embed includes',
  `= Notindex

bb

\\Include[notindex2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Notindex')]}),
    a('P', [t('bb')]),
    a('H', undefined, {level: [t('2')], title: [t('Notindex2')]}),
    a('P', [
      a(
        'x',
        [t('This section is present in another page, follow this link to view it.')],
        {'href': [t('notindex2')]}
      ),
    ]),
  ],
  {
    convert_before: ['notindex2.bigb'],
    convert_opts: { split_headers: true },
    filesystem: {
      'notindex2.bigb': `= Notindex2
`,
    },
    assert_xpath_stdout: [
      xpath_header(1, 'notindex', "x:a[@href='notindex-split.html' and text()='Notindex']"),
      xpath_header(2, 'notindex2', "x:a[@href='notindex2.html' and text()='1. Notindex2']"),
    ],
    input_path_noext: 'notindex',
  },
);
// https://github.com/ourbigbook/ourbigbook/issues/74
assert_lib_ast('include: cross reference to embed include header',
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
  ].concat(include_two_levels_ast_args),
  Object.assign({
      assert_xpath_stdout: [
        "//x:div[@class='p']//x:a[@href='#include-two-levels' and text()='ee']",
        "//x:div[@class='p']//x:a[@href='#gg' and text()='gg']",
      ],
      convert_opts: { split_headers: true },
    },
    include_opts
  ),
);
assert_lib_ast('include: multilevel with paragraph',
  `= aa

bb

\\Include[include-two-levels]

\\Include[include-one-level-1]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
  ].concat(include_two_levels_ast_args)
  .concat([
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ]),
  include_opts
);
// https://github.com/ourbigbook/ourbigbook/issues/35
assert_lib_ast('include: simple no paragraph',
  `= aa

bb

\\Include[include-one-level-1]
\\Include[include-one-level-2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
    a('H', undefined, {level: [t('2')], title: [t('ee')]}),
    a('P', [t('ff')]),
  ],
  include_opts
);
assert_lib_ast('include: multilevel no paragraph',
  `= aa

bb

\\Include[include-two-levels]
\\Include[include-one-level-1]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [t('bb')]),
  ].concat(include_two_levels_ast_args)
  .concat([
    a('H', undefined, {level: [t('2')], title: [t('cc')]}),
    a('P', [t('dd')]),
  ]),
  include_opts
);
// https://github.com/ourbigbook/ourbigbook/issues/23
assert_lib_error('include: with error reports error on the include source',
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
assert_lib_error('include: circular dependency 1 <-> 2',
  circular_entry,
  // TODO works from CLI call......... fuck, why.
  // Similar problem as in test below.
  //3, 1, 'include-circular.bigb',
  undefined, undefined, undefined,
  {
    convert_opts: {
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
assert_lib_error('include: circular dependency 1 -> 2 <-> 3',
  `= aa

\\Include[include-circular-1]
`,
  // 3, 1, 'include-circular-2.bigb',
  undefined, undefined, undefined,
  ourbigbook.clone_and_set(include_opts, 'has_error', true)
);
assert_lib_ast('include without parent header with embed includes',
  // https://github.com/ourbigbook/ourbigbook/issues/73
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
    //assert_xpath_stdout: [
    //  // TODO getting corrupt <hNaN>
    //  xpath_header(1, 'include-one-level-1'),
    //  xpath_header(1, 'include-one-level-2'),
    //],
    convert_opts: {
      embed_includes: true,
    }
  },
);
assert_lib_ast('include: without parent header without embed includes',
  // https://github.com/ourbigbook/ourbigbook/issues/73
  `aa

\\Include[include-one-level-1]
\\Include[include-one-level-2]
`,
  [
    a('P', [t('aa')]),
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
    assert_xpath_stdout: [
      // TODO getting corrupt <hNaN>
      //xpath_header(1, 'include-one-level-1'),
      //xpath_header(1, 'include-one-level-2'),
    ],
  },
);
assert_lib_error('include: to file that exists in header title fails gracefully',
  // https://github.com/ourbigbook/ourbigbook/issues/195
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
assert_lib_error('include: to file that does not exist fails gracefully',
  `= h1

\\Include[asdf]
`,
  3, 1
);
assert_lib_error('include: to file that does exists without embed includes before extracting IDs fails gracefully',
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
assert_lib('include: relative include in subdirectory',
  {
    filesystem: {
      's1/index.bigb': `= Index

\\Include[notindex]
`,
      's1/notindex.bigb': `= Notindex

\\Include[notindex2]

== Notindex h2`,
      's1/notindex2.bigb': `= Notindex2
`,
      // https://github.com/ourbigbook/ourbigbook/issues/214
      'top.bigb': `= Top
`,
    },
    convert_dir: true,
    assert_xpath: {
      's1.html': [
        "//*[@id='_toc']//x:a[@href='s1/notindex.html' and @data-test='0' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='s1/notindex2.html' and @data-test='1' and text()='1.1. Notindex2']",
        "//*[@id='_toc']//x:a[@href='s1/notindex.html#notindex-h2' and @data-test='2' and text()='1.2. Notindex h2']",
        // https://github.com/ourbigbook/ourbigbook/issues/214
        //"//*[@id='_toc']//x:a[@href='../top.html' and @data-test='2' and text()='2. Top']",
      ],
    },
  }
);
assert_lib('include: from parent to subdirectory',
  // https://github.com/ourbigbook/ourbigbook/issues/116
  {
    filesystem: {
      'index.bigb': `= Index

\\x[subdir][index to subdir]

\\x[subdir/h2][index to subdir h2]

\\Include[subdir]
\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Index

== h2
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    convert_dir: true,
    assert_xpath: {
      'index.html': [
        "//x:a[@href='subdir.html' and text()='index to subdir']",
        "//x:a[@href='subdir.html#h2' and text()='index to subdir h2']",
      ],
    },
  }
);
assert_lib('include: subdir index.bigb outputs to subdir without trailing slash with htmlXExtension=true',
  {
    filesystem: {
      'subdir/index.bigb': `= Subdir

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    convert_dir: true,
    convert_opts: { htmlXExtension: true },
    assert_xpath: {
      'subdir.html': [
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']" ,
      ],
    },
  }
);
assert_lib('include: subdir index.bigb outputs to subdir without trailing slash with htmlXExtension=false',
  {
    filesystem: {
      'subdir/index.bigb': `= Subdir

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    convert_dir: true,
    convert_opts: { htmlXExtension: false },
    assert_xpath: {
      'subdir.html': [
        "//x:a[@href='subdir/notindex' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex#notindex-h2' and text()='link to subdir notindex h2']",
      ],
    },
  }
);
assert_lib('include: subdir index.bigb removes leading @ from links with the x_remove_leading_at option',
  {
    filesystem: {
      '@subdir/index.bigb': `= Subdir

\\x[notindex][link to subdir notindex]

\\x[notindex-h2][link to subdir notindex h2]

<@subdir/notindex>

\\Include[notindex]
`,
      '@subdir/notindex.bigb': `= Notindex

\\x[@subdir][link to subdir]

== Notindex h2
`,
      '@subdir/@notindexat.bigb': `= Notindexat

== Notindexat h2
`,
    },
    convert_dir: true,
    convert_opts: {
      x_remove_leading_at: true,
      x_leading_at_to_web: false,
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
assert_lib('include: subdir index.bigb outputs to subdir.html when there is a toplevel header',
  {
    filesystem: {
      'subdir/index.bigb': `= Subdir

Hello world
`,
    },
    convert_dir: true,
    assert_xpath: {
      'subdir.html': [
        "//x:div[@class='p' and text()='Hello world']",
      ],
    },
  }
);
assert_lib('include: subdir index.bigb outputs to subdir.html when there is no toplevel header',
  // https://github.com/ourbigbook/ourbigbook/issues/247
  {
    filesystem: {
      'subdir/index.bigb': `Hello world
`,
    },
    convert_dir: true,
    assert_xpath: {
      'subdir.html': [
        "//x:div[@class='p' and text()='Hello world']",
      ],
    },
  }
);
assert_lib('include: include of a header with a tag or child in a third file does not blow up',
  {
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{child=notindex2}
{tag=notindex2}
`,
      'notindex2.bigb': `= Notindex 2
`,
    },
    convert_dir: true,
  }
);
assert_cli('include: tags show on embed include',
  {
    args: ['--embed-includes', 'index.bigb'],
    pre_exec: [
      {
        cmd: ['ourbigbook', ['.']],
      },
    ],
    filesystem: {
      'index.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{tag=notindex2}
`,
      'notindex2.bigb': `= Notindex 2
`,
    },
    // TODO fails on lib with duplicate id notindex.
    //
    // This started happening when we moved Id.path from a string
    // to Id.defined_at as a reference to a File.
    //
    // Apparently this fails because of convert_dir which
    // creates the ID, and then things don't get cleaned up.
    // But works on CLI, so not worrying for now.
    //convert_dir: true,
    //convert_opts: {
    //  embed_includes: true,
    //},
    assert_xpath: {
      'index.html': [
        "//*[contains(@class, 'h-nav')]//x:span[@class='test-tags']//x:a[@href='notindex2.html']",
      ],
    },
  }
);
assert_lib(
  // https://github.com/ourbigbook/ourbigbook/issues/123
  'include: includers should show as a parents of the includee',
  {
    convert_dir: true,
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
assert_lib(
  'include: incoming links: does not generate an incoming links entry',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'README.bigb': `= Index

\\Include[included-by-index]
`,
  'included-by-index.bigb': `= Included by index
`,
    },
    assert_not_xpath: {
      'included-by-index.html': [
        `//x:h2[@id='_incoming-links']`,
      ],
    }
  }
);
assert_lib('include: parent_id option',
  {
    filesystem: {
      'notindex.bigb': `= Notindex
`,
      'notindex2.bigb': `= Notindex2
`,
    },
    convert_before: [
      'notindex2.bigb',
    ],

    // This setup is to not render notindex.bigb with that parent_id, otherwise we get an infinite loop.
    convert_before_norender: [ 'notindex.bigb' ],
    convert_opts: { parent_id: 'notindex' },

    assert_xpath: {
      'notindex2.html': [
        xpath_header_parent(1, 'notindex2', 'notindex.html', 'Notindex'),
      ],
    },
  }
);

// OurBigBookExample
assert_lib_ast('OurBigBookExample basic',
  `\\OurBigBookExample[[aa \\i[bb] cc]]`,
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
assert_lib('OurBigBookExample that links to id in another file',
  {
    filesystem: {
      'abc.bigb': `\\OurBigBookExample[[\\x[notindex\\]]]
`,
      'notindex.bigb': `= notindex h1
`,
    },
    convert_dir: true,
    assert_xpath: {
      'abc.html': [
        "//x:a[@href='notindex.html' and text()='notindex h1']",
      ],
    },
  },
);

// ID auto-generation.
// https://docs.ourbigbook.com/automatic-id-from-title
assert_lib_ast('id autogeneration without title',
  '\\P[aa]\n',
  [a('P', [t('aa')], {}, {id: '_1'})],
);
assert_lib_error('id conflict with previous autogenerated id',
  `\\P[aa]

\\P[bb]{id=_1}`,
  3, 1
);
assert_lib_error('id conflict with later autogenerated id',
  `\\P[aa]{id=_1}

\\P[bb]`,
  1, 1
);
assert_lib_error('id cannot be empty',
  `= Index

== 
`,
  3, 1
);
// https://github.com/ourbigbook/ourbigbook/issues/4
assert_lib_ast('id autogeneration nested',
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
assert_lib_ast('id autogeneration unicode normalize',
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
assert_lib_ast('id autogeneration unicode no normalize',
  `= 0A.你ÉŁŒy++z

\\x[0a-你éłœy-z]
`,
  [
    a('H', undefined, {title: [t('0A.你ÉŁŒy++z')]}, {id: '0a-你éłœy-z'}),
    a('P', [
      a('x', undefined, {href: [t('0a-你éłœy-z')]})
    ])
  ],
  { convert_opts: { ourbigbook_json: { id: { normalize: { latin: false, punctuation: false } } } } }
);
assert_lib_ast('id autogeneration with disambiguate',
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
assert_lib_error('id autogeneration with undefined reference in title fails gracefully',
  `= \\x[reserved_undefined]
`, 1, 3);
// https://github.com/ourbigbook/ourbigbook/issues/45
assert_lib_ast('id autogeneration with nested elements does an id conversion and works',
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
assert_lib_error('id conflict with previous id on the same file',
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
assert_lib_ast('id conflict with id on another file simple',
  // https://github.com/ourbigbook/ourbigbook/issues/201
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
assert_lib_ast('id conflict with id on another file where conflict header has a child header',
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
assert_lib_error('id conflict on file with the same toplevel_id as another',
  undefined,
  1, 1, 'index.bigb',
  {
    convert_before_norender: ['notindex.bigb'],
    convert_before: ['index.bigb'],
    filesystem: {
      'index.bigb': `= Notindex
`,
      'notindex.bigb': `= Notindex
`,
    },
  }
);

// title_to_id
assert_equal('title_to_id with hyphen', ourbigbook.title_to_id('.0A. - z.a Z..'), '0a-z-a-z');
assert_equal('title_to_id with unicode chars', ourbigbook.title_to_id('0A.你好z'), '0a-你好z');

// Toplevel.
assert_lib_ast('toplevel: arguments',
  `{title=aaa}

bbb
`,
  a('Toplevel', [a('P', [t('bbb')])], {'title': [t('aaa')]}),
  {toplevel: true}
);
assert_lib_error('toplevel explicit content',
  `[]`, 1, 1,
);
// https://github.com/ourbigbook/ourbigbook/issues/10
assert_lib_error('explicit toplevel macro',
  `\\toplevel`, 1, 1,
);

// split_headers
// A split headers hello world.
assert_lib_ast('one paragraph implicit split headers',
  'ab\n',
  [a('P', [t('ab')])],
  {
    convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  }
);

// Errors. Check that they return gracefully with the error line number,
// rather than blowing up an exception, or worse, not blowing up at all!
assert_lib_ast('backslash without macro', '\\ a', [a('P', [t(' a')])],);
assert_lib_error('unknown macro without args', '\\reserved_undefined', 1, 1);
assert_lib_error('unknown macro with positional arg', '\\reserved_undefined[aa]', 1, 1);
assert_lib_error('unknown macro with named arg', '\\reserved_undefined{aa=bb}', 1, 1);
assert_lib_error('too many positional arguments', '\\P[ab][cd]', 1, 7);
assert_lib_error('unknown named macro argument', '\\c{reserved_undefined=abc}[]', 1, 4);
assert_lib_error('missing mandatory positional argument href of a', '\\a', 1, 1);
assert_lib_error('missing mandatory positional argument level of h', '\\H', 1, 1);
assert_lib_error('stray open positional argument start', 'a[b\n', 1, 2);
assert_lib_error('stray open named argument start', 'a{b\n', 1, 2);
assert_lib_error('argument without close empty', '\\c[\n', 1, 3);
assert_lib_error('argument without close nonempty', '\\c[ab\n', 1, 3);
assert_lib_error('stray positional argument end', 'a]b', 1, 2);
assert_lib_error('stray named argument end}', 'a}b', 1, 2);
assert_lib_error('unterminated literal positional argument', '\\c[[\n', 1, 3);
assert_lib_error('unterminated literal named argument', '\\Image[img.png]{external}{description=\n', 1, 26);
assert_lib_error('unterminated insane inline code', '`\n', 1, 1);
assert_lib_error('unterminated insane link', '<ab', 1, 1);
assert_lib_error('unescaped trailing backslash', '\\', 1, 1);

// API minimal tests.
it(`lib: x does not blow up without ID provider`, async function () {
  const out = await ourbigbook.convert(`= h1

\\x[h2]

== h2
`, {'body_only': true})
})

// TODO
const bigb_input = fs.readFileSync(path.join(__dirname, 'test_bigb_output.bigb'), ourbigbook_nodejs_webpack_safe.ENCODING)
assert_lib('bigb output: format is unchanged for the preferred format',
  // https://github.com/ourbigbook/ourbigbook/issues/83
  {
    stdin: bigb_input,
    assert_bigb_stdout: bigb_input,
    convert_dir: true,
    filesystem: {
      'test-bigb-output-2.bigb': '= Test bigb output 2\n',
      'test-bigb-output-3.bigb': '= Test bigb output 3\n',
    }
  },
);
assert_lib_stdin('bigb output: converts plaintext arguments with escapes to literal arguments when possible',
  `\\Q[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$]

\\Q[\\* *]

\\Q[\\= =]

\\Q[\\|| ||]

\\Q[\\| |]

\\Q[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$ \\i[asdf]]

\\Q[\\* \\i[asdf]]

\\Q[\\= \\i[asdf]]

\\Q[\\|| \\i[asdf]]

\\Q[\\| \\i[asdf]]
`,
  {
    assert_bigb_stdout: `\\Q[[\\ [ ] { } < \` $]]

\\Q[[* *]]

\\Q[[= =]]

\\Q[[|| ||]]

\\Q[[| |]]

\\Q[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$ \\i[asdf]]

\\Q[\\* \\i[asdf]]

\\Q[\\= \\i[asdf]]

\\Q[\\|| \\i[asdf]]

\\Q[\\| \\i[asdf]]
`
  },
);
assert_lib_stdin('bigb output: converts sane refs to insane ones',
  `= Animal

\\x[black-cat]

\\x[black-cat]{c}

\\x[black-cat]{p}

== Black cat
`,
  {
    assert_bigb_stdout: `= Animal

<black cat>

<Black cat>

<black cats>

== Black cat
`
  },
);
assert_lib_stdin('bigb output: adds newlines to start and end of multiline arguments',
  `\\Q[Positional oneline first]

\\Q[Positional multiline first

Positional multiline second]

\\Image[a.png]
{description=Named oneline first}

\\Image[a.png]
{description=Named multiline first

Named multiline second}
`,
  {
    assert_bigb_stdout: `\\Q[Positional oneline first]

\\Q[
Positional multiline first

Positional multiline second
]

\\Image[a.png]
{description=Named oneline first}

\\Image[a.png]
{description=
Named multiline first

Named multiline second
}
`,
    filesystem: {
      'a.png': '',
    }
  },
);
assert_lib_stdin('bigb output: nested sane list followed by paragraph',
  // This was leading to an AST change because the input has inner list as
  // `ccc\n` but the output only `ccc`. But lazy to fix now, what we want is the
  // input to parse as `ccc` without the `\n`: https://github.com/ourbigbook/ourbigbook/issues/245
  `aaa

* bbb
  \\Ul[
  * ccc
  ]

ddd
`,
  {
    assert_bigb_stdout: `aaa

* bbb
  * ccc

ddd
`
  },
);
assert_lib('bigb output: checks target IDs to decide between plural or not on converting non magic to magic links',
  {
    filesystem: {
      'index.bigb': `= Index

\\x[dog]

\\x[dog]{p}
`,
      'notindex.bigb': `= Notindex

== Dog

== Dogs
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Index

<dog>

<dog>{p}
`,
    }
  }
);
assert_lib('bigb output: unused ID check does not blow up across files with magic plural',
  {
    filesystem: {
      'index.bigb': `= Index

<dogs>
`,
      'notindex.bigb': `= Notindex

== Dog
`,
    },
    convert_dir: true,
    convert_opts: { output_format: ourbigbook.OUTPUT_FORMAT_OURBIGBOOK },
  }
);
assert_lib('bigb output: x uses text conversion as the target link',
  {
    filesystem: {
      'index.bigb': `= Index

\\x[dog-and-cat]{c}{p}

\\x[asdf-asdf]

\\x[matching-id]

\\x[plural-apples]

<plural apples>

<accounts>
`,
      'notindex.bigb': `= Notindex

== Dog $and$ Cat

== Qwer Qwer
{id=asdf-asdf}

== Matching ID
{id=matching-id}

== Plural Apples
{id=plural-apples}
`,
      'accounts.bigb': `= My accounts
`
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Index

<Dog and Cats>

<asdf asdf>

<matching ID>

<plural Apples>

<plural Apples>

<accounts>
`,
    }
  }
);
assert_lib('bigb output: x magic input across files',
  {
    filesystem: {
      'index.bigb': `= Index

<Dog and cat>

<Dog and cats>

<Uppercase>

<uppercase>

<Lowercase>

<lowercase>

<my plurals>
`,
      'notindex.bigb': `= Notindex

== Dog and cat

== Uppercase
{c}

== lowercase
{c}

== My plurals
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Index

<Dog and cat>

<Dog and cats>

<Uppercase>

<Uppercase>

<lowercase>

<lowercase>

<my plurals>
`,
    }
  }
);
assert_lib('bigb output: x to disambiguate',
  {
    filesystem: {
      'index.bigb': `= Index

\\x[python-animal]

\\x[python-animal]{p}

<python animal>

<Python (animal)>
`,
      'notindex.bigb': `= Notindex

== Python
{disambiguate=animal}
`,
    },
    convert_dir: true,
    // TODO maybe https://github.com/ourbigbook/ourbigbook/issues/244
    assert_bigb: {
      'index.bigb': `= Index

<python (animal)>

\\x[python-animal]{p}

<python (animal)>

<Python (animal)>
`,
    }
  }
);
assert_lib('bigb output: x to plural disambiguate',
  // Happens notably with pluralize false plural bugs such as "Mathematics".
  {
    filesystem: {
      'index.bigb': `= Index

<field cats>
`,
      'notindex.bigb': `= Notindex

== Field
{disambiguate=cats}
`,
    },
    convert_dir: true,
    // TODO maybe https://github.com/ourbigbook/ourbigbook/issues/244
    assert_bigb: {
      'index.bigb': `= Index

<field (cats)>
`,
    }
  }
);
assert_lib('bigb output: x to scope',
  {
    filesystem: {
      'index.bigb': `= Index

<my dog/pit bull>

<my dog/Pit bull>

<my dog/pit bulls>

<fruit/banana>

<fruit/orange>

== Fruit
{scope}

<banana>

<bananas>

<car/ferrari>

=== Banana

=== Orange
{id=orange}

== Car
{scope}

=== Ferrari
`,
      'animal.bigb': `= Animal

== My dog
{scope}

=== Pit bull
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Index

<my dog/pit bull>

<my dog/Pit bull>

<my dog/pit bulls>

<fruit/banana>

<fruit/orange>

== Fruit
{scope}

<banana>

<bananas>

<car/ferrari>

=== Banana

=== Orange
{id=orange}

== Car
{scope}

=== Ferrari
`,
    }
  }
);
assert_lib('bigb output: x with leading slash to escape scope',
  {
    filesystem: {
      'index.bigb': `= Index

== Fruit
{scope}

=== Fruit
{scope}

<fruit>

</fruit>
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Index

== Fruit
{scope}

=== Fruit
{scope}

<fruit>

</fruit>
`,
    }
  }
);
assert_lib('bigb output: magic x in subdir scope',
  {
    filesystem: {
      'myscope/notindex.bigb': `= Index

<dog>
`,
      'myscope/notindex2.bigb': `= Animal

== Dog
`,
    },
    convert_dir: true,
    assert_bigb: {
      'myscope/notindex.bigb': `= Index

<dog>
`,
    }
  }
);
assert_lib('bigb output: magic x to image',
  {
    filesystem: {
      'notindex.bigb': `= Index

<image My dog>

\\Image[dog.jpg]
{title=My dog}

<video My cat>

\\Video[dog.jpg]
{title=My cat}
`,
      'dog.jpg': '',
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<image My dog>

\\Image[dog.jpg]
{title=My dog}

<video My cat>

\\Video[dog.jpg]
{title=My cat}
`,
    }
  }
);
assert_lib('bigb output: x to slash in title',
  // We have to remove slashes, otherwise it searches for scopes instead.
  // Don't have a solution for that now.
  {
    filesystem: {
      'notindex.bigb': `= Index

<my title>

== My/title
`,
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<my title>

== My/title
`,
    }
  }
);
assert_lib('bigb output: id from filename',
  // We have to remove slashes, otherwise it searches for scopes instead.
  // Don't have a solution for that now.
  {
    filesystem: {
      'notindex.bigb': `= Index

<notindex2>
`,
      'notindex2.bigb': `= My notindex2
`
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<notindex2>
`,
    }
  }
);
assert_lib('bigb output: pluralize fail',
  // Was blowing up on pluralize failures. Notably, pluralize is wrong for every -osis suffix,
  // common in scientific literature. This is the current buggy behaviour of pluralize:
  //
  // So for now, if pluralize is wrong, we just abort and do a sane link.
  //
  //> pluralize('tuberculosis', 1)
  // 'tuberculosi'
  // > pluralize('tuberculosis', 2)
  // 'tuberculoses'
  // > pluralize('tuberculoses', 2)
  // 'tuberculoses'
  // > pluralize('tuberculoses', 1)
  // 'tuberculose'
  {
    filesystem: {
      'notindex.bigb': `= Index

\\x[tuberculosis]

\\x[tuberculosis]{p}

\\x[tuberculosis]{magic}

== Tuberculosis
`,
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<tuberculosis>

\\x[tuberculosis]{p}

\\x[tuberculosis]{magic}

== Tuberculosis
`,
    }
  }
);
assert_lib('bigb output: acronym plural',
  // https://github.com/plurals/pluralize/issues/127
  {
    filesystem: {
      'notindex.bigb': `= Notindex

== PC

<PCs>
`,
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Notindex

== PC

<PCs>
`,
    }
  }
);
assert_lib('bigb output: to file',
  {
    filesystem: {
      'notindex.bigb': `= Index

<path/to/my file>{file}

== path/to/my file
{file}
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<path/to/my file>{file}

== path/to/my file
{file}
`,
    }
  }
)
assert_lib('bigb output: to explicit id with slash',
  {
    filesystem: {
      'notindex.bigb': `= Index

<asdf/qwer>

== Qwer
{id=asdf/qwer}
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<asdf/qwer>

== Qwer
{id=asdf/qwer}
`,
    }
  }
)
assert_lib('bigb output: x do not change capitalization if the first ast is not plaintext',
  {
    filesystem: {
      'notindex.bigb': `= Index

<so 3>

== $SO(3)$
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Index

<SO(3)>

== $SO(3)$
`,
    }
  }
)
assert_lib_error('bigb output: x to undefined does not blow up',
  `<asdf>`,
  1, 2, undefined,
  {
    convert_opts: { output_format: ourbigbook.OUTPUT_FORMAT_OURBIGBOOK },
  }
)
assert_lib_error('bigb output: undefined tag does not blow up',
  `= My header
{tag=Asdf}`,
  2, 1, undefined,
  {
    convert_opts: { output_format: ourbigbook.OUTPUT_FORMAT_OURBIGBOOK },
  }
)
assert_lib('bigb output: x convert parent, tag and child IDs to insane magic',
  {
    filesystem: {
      'notindex.bigb': `= Notindex

= My \\i[h2] é \\}
{disambiguate=dis}
{parent=notindex}

= My h3
{child=my-h2-e-dis}
{parent=my-h2-e-dis}
{tag=my-h2-e-dis}

= Myscope
{parent=notindex}
{scope}

= Myscope
{parent=myscope}

= Escape scope
{parent=/myscope}
`,
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Notindex

= My \\i[h2] é \\}
{disambiguate=dis}
{parent=Notindex}

= My h3
{child=My h2 é (dis)}
{parent=My h2 é (dis)}
{tag=My h2 é (dis)}

= Myscope
{parent=Notindex}
{scope}

= Myscope
{parent=Myscope}

= Escape scope
{parent=/Myscope}
`,
    }
  }
)
assert_lib('bigb output: split_headers',
  {
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

Paragraph in notindex.

== Notindex 2

Paragraph in notindex 2.

= Notindex 3
{parent=Notindex 2}

Paragraph in notindex 3.
`,
    },
    assert_bigb: {
      'notindex.bigb': `= Notindex

Paragraph in notindex.

== Notindex 2

Paragraph in notindex 2.

= Notindex 3
{parent=Notindex 2}

Paragraph in notindex 3.
`,
      'notindex-split.bigb': `= Notindex

Paragraph in notindex.
`,
      'notindex-2.bigb': `= Notindex 2

Paragraph in notindex 2.
`,
      // Parent is auto-removed on splits.
      'notindex-3.bigb': `= Notindex 3

Paragraph in notindex 3.
`,
    }
  }
)

// ourbigbook executable tests.
assert_cli(
  'input from stdin produces output on stdout simple',
  {
    stdin: 'aabb',
    assert_not_exists: ['out'],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
);
assert_cli(
  'input from stdin produces output on stdout when in git repository',
  {
    pre_exec: [['git', ['init']]],
    stdin: 'aabb',
    assert_not_exists: ['out'],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
);
assert_cli(
  'input from file and --stdout produces output on stdout',
  {
    args: ['--stdout', 'notindex.bigb'],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
    filesystem: { 'notindex.bigb': 'aabb' },
  }
);
assert_cli(
  // Was blowing up on file existence check.
  'input from stdin with relative link does not blow up',
  {
    stdin: '\\a[asdf]',
    assert_not_exists: ['out'],
    assert_xpath_stdout: [`//x:a[@href='${ourbigbook.RAW_PREFIX}/asdf']`],
    filesystem: { 'asdf': '' },
  }
);
assert_cli(
  'input from file produces an output file',
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

\\OurBigBookExample[[
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
assert_cli(
  // This is a big catch-all and should likely be split.
  'input from directory with ourbigbook.json produces several output files',
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
        "//*[@id='_toc']//x:a[@href='included-by-index.html' and text()='1. Included by index']",

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

        // OurBigBookExample renders in split header.
        "//x:blockquote[text()='A Ourbigbook example!']",

        // We have gone back and forth on split vs nosplit here a bit.
        // Related: https://github.com/ourbigbook/ourbigbook/issues/146
        "//*[@id='_toc']//x:a[@href='index.html#h2' and text()='2. h2']",
        // ToC entries of includes always point directly to the separate file.
        "//*[@id='_toc']//x:a[@href='included-by-index.html' and text()='1. Included by index']",
        // TODO This is more correct with the `1. `. Maybe wait for https://github.com/ourbigbook/ourbigbook/issues/126
        // to make sure we don't have to rewrite everything.
        //"//*[@id='_toc']//x:a[@href='included-by-index-split.html' and text()='1. Included by index']",
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
        // https://github.com/ourbigbook/ourbigbook/issues/159
        xpath_header_split(1, 'index-scope-child', '../index.html#index-scope/index-scope-child', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'index-scope/index-scope-2.html': [
        // https://github.com/ourbigbook/ourbigbook/issues/159
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
        // https://github.com/ourbigbook/ourbigbook/issues/159
        xpath_header_split(1, 'nested-scope-2', '../../toplevel-scope.html#nested-scope/nested-scope-2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],

      // Non converted paths.
      [`${ourbigbook.RAW_PREFIX}/scss.css`]: [],
      [`${ourbigbook.RAW_PREFIX}/ourbigbook.json`]: [],
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
const publish_filesystem = {
  'ourbigbook.json': `{}\n`,
  'README.bigb': `= Index

\\x[notindex][link to notindex]

\\x[notindex-h2][link to notindex h2]

== h2
`,
  'notindex.bigb': `= Notindex

\\x[index][link to index]

\\x[h2][link to h2]

== notindex h2
`,
  'toplevel-scope.bigb': `= Toplevel scope
{scope}

== Toplevel scope h2
`,
  'subdir/index.bigb': `= Subdir index
`,
  'scss.scss': `body { color: red }`,
  'subdir/myfile.txt': `Hello world

Goodbye world.
`,
};
const publish_pre_exec = [
  ['git', ['init']],
  ['git', ['add', '.']],
  ['git', ['commit', '-m', '0']],
  ['git', ['remote', 'add', 'origin', 'git@github.com:ourbigbook/test.git']],
]
assert_cli(
  'publish: --dry-run --split-headers --publish works',
  {
    args: ['--dry-run', '--split-headers', '--publish', '.'],
    filesystem: publish_filesystem,
    pre_exec: publish_pre_exec,
    assert_exists: [
      `out/publish/out/github-pages/${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css`,
      // Non-converted files are copied over.
      `out/publish/out/github-pages/${ourbigbook.RAW_PREFIX}/scss.css`,
      `out/publish/out/github-pages/${ourbigbook.RAW_PREFIX}/ourbigbook.json`,
      `out/publish/out/github-pages/${ourbigbook.RAW_PREFIX}/subdir/myfile.txt`,

      // Directories listings are generated.
      `out/publish/out/github-pages/${ourbigbook.DIR_PREFIX}/index.html`,
      `out/publish/out/github-pages/${ourbigbook.DIR_PREFIX}/subdir/index.html`,
    ],
    assert_not_exists: [
      // logo.svg is not added when web.linkFromHeaderMeta is not enabled on ourbigbook.json
      `out/publish/out/github-pages/_obb/logo.svg`,
    ],
    assert_xpath: {
      'out/publish/out/github-pages/index.html': [
        "//x:div[@class='p']//x:a[@href='notindex' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex#notindex-h2' and text()='link to notindex h2']",
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      'out/publish/out/github-pages/notindex.html': [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='.' and text()='link to index']",
        "//x:div[@class='p']//x:a[@href='.#h2' and text()='link to h2']",
      ],
      'out/publish/out/github-pages/toplevel-scope/toplevel-scope-h2.html': [
        `//x:style[contains(text(),'@import \"../${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      'out/publish/out/github-pages/subdir.html': [
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
    },
  }
);
assert_cli(
  'publish: --publish-target local works',
  {
    args: ['--dry-run', '--split-headers', '--publish', '--publish-target', 'local', '.'],
    filesystem: publish_filesystem,
    pre_exec: publish_pre_exec,
    assert_exists: [
      `out/publish/out/local/${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css`,
    ],
    assert_xpath: {
      'out/publish/out/local/index.html': [
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='link to notindex h2']",
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      'out/publish/out/local/notindex.html': [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='index.html' and text()='link to index']",
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='link to h2']",
      ],
      'out/publish/out/local/toplevel-scope/toplevel-scope-h2.html': [
        `//x:style[contains(text(),'@import \"../${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      'out/publish/out/local/subdir.html': [
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      // Non-converted files are copied over.
      [`out/publish/out/local/${ourbigbook.RAW_PREFIX}/scss.css`]: [],
      [`out/publish/out/local/${ourbigbook.RAW_PREFIX}/ourbigbook.json`]: [],
      [`out/publish/out/local/${ourbigbook.RAW_PREFIX}/subdir/myfile.txt`]: [],
    },
  }
);
assert_cli(
  'json: web.linkFromHeaderMeta = true with publish',
  {
    args: ['--dry-run', '--split-headers', '--publish', '.'],
    filesystem: {
      'ourbigbook.json': `{
  "web": {
    "linkFromHeaderMeta": true,
    "username": "myusername"
  }
}
`,
      'README.bigb': `= Index

== h2
{scope}

=== h2 2
`,
    },
    pre_exec: publish_pre_exec,
    assert_exists: [
      `out/publish/out/github-pages/_obb/logo.svg`,
    ],
    assert_xpath: {
      'out/publish/out/github-pages/index.html': [
        "//x:div[contains(@class, \"h \") and @id='index']//x:img[@class='logo' and @src='_obb/logo.svg']",
        "//x:div[contains(@class, \"h \") and @id='index']//x:a[@href='https://ourbigbook.com/myusername' and text()=' OurBigBook.com']",
        "//x:div[@class='h' and @id='h2']//x:a[@href='https://ourbigbook.com/myusername/h2' and text()=' OurBigBook.com']",
      ],
      'out/publish/out/github-pages/h2/h2-2.html': [
        "//x:div[contains(@class, \"h \") and @id='h2-2']//x:img[@class='logo' and @src='../_obb/logo.svg']",
        "//x:div[contains(@class, \"h \") and @id='h2-2']//x:a[@href='https://ourbigbook.com/myusername/h2/h2-2' and text()=' OurBigBook.com']",
      ],
    },
  }
)
assert_cli(
  'json: web.linkFromHeaderMeta = true without publish',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'ourbigbook.json': `{
  "outputOutOfTree": true,
  "web": {
    "linkFromHeaderMeta": true,
    "username": "myusername"
  }
}
`,
      'README.bigb': `= Index

== h2
{scope}

=== h2 2
`,
    },
    pre_exec: publish_pre_exec,
    assert_xpath: {
      'out/html/index.html': [
        `//x:div[contains(@class, "h ") and @id='index']//x:img[@class='logo' and @src='${ourbigbook_nodejs.LOGO_PATH}']`,
        "//x:div[contains(@class, \"h \") and @id='index']//x:a[@href='https://ourbigbook.com/myusername' and text()=' OurBigBook.com']",
        `//x:div[@class='h' and @id='h2']//x:img[@class='logo' and @src='${ourbigbook_nodejs.LOGO_PATH}']`,
        "//x:div[@class='h' and @id='h2']//x:a[@href='https://ourbigbook.com/myusername/h2' and text()=' OurBigBook.com']",
      ],
      'out/html/h2/h2-2.html': [
        `//x:div[contains(@class, "h ") and @id='h2-2']//x:img[@class='logo' and @src='${ourbigbook_nodejs.LOGO_PATH}']`,
        "//x:div[contains(@class, \"h \") and @id='h2-2']//x:a[@href='https://ourbigbook.com/myusername/h2/h2-2' and text()=' OurBigBook.com']",
      ],
    },
  }
)
assert_cli(
  'convert subdirectory only with ourbigbook.json',
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
    assert_exists: [
      'out',
      `${ourbigbook.RAW_PREFIX}/subdir/scss.css`,
      'subdir/xml.xml',
    ],
    assert_not_exists: [
      'subdir/out',
      'xml.xml',
      `${ourbigbook.RAW_PREFIX}/scss.css`,
      'index.html',
    ],
    assert_xpath: {
      'subdir.html': [xpath_header(1)],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_cli(
  'convert subdirectory only without ourbigbook.json',
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
    assert_exists: [
      'out',
      `${ourbigbook.RAW_PREFIX}/subdir/scss.css`,
      'subdir/xml.xml',
    ],
    assert_not_exists: [
      'index.html',
      `${ourbigbook.RAW_PREFIX}/scss.css`,
      'subdir/out',
      'xml.xml',
    ],
    assert_xpath: {
      'subdir.html': [xpath_header(1, '')],
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    }
  }
);
assert_cli(
  'convert a subdirectory file only with ourbigbook.json',
  {
    args: ['subdir/notindex.bigb'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      'ourbigbook.json': `{}`,
    },
    // Place out next to ourbigbook.json which should be the toplevel.
    assert_exists: ['out'],
    assert_not_exists: ['subdir/out', 'index.html', 'subdir.html'],
    assert_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_cli(
  'convert a subdirectory file only without ourbigbook.json',
  {
    args: ['subdir/notindex.bigb'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
    },
    // Don't know a better place to place out, so just put it int subdir.
    assert_exists: ['out'],
    assert_not_exists: ['subdir/out', 'index.html', 'subdir.html'],
    assert_xpath: {
      'subdir/notindex.html': [xpath_header(1, 'notindex')],
    },
  }
);
assert_cli(
  'convert with --outdir',
  {
    args: ['--outdir', 'my_outdir', '.'],
    filesystem: {
      'README.bigb': `= Index`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      'ourbigbook.json': `{}\n`,
    },
    assert_exists: [
      'my_outdir/out',
      `my_outdir/${ourbigbook.RAW_PREFIX}/ourbigbook.json`,
    ],
    assert_not_exists: [
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
assert_cli(
  'ourbigbook.tex does not blow up',
  {
    args: ['README.bigb'],
    filesystem: {
      'README.bigb': `$$\\mycmd$$`,
      'ourbigbook.tex': `\\newcommand{\\mycmd}[0]{hello}`,
    },
  }
);
assert_cli(
  'synonym to outdir generates correct redirct with outdir',
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
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/114
  'synonym to outdir generates correct redirct without outdir',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'README.bigb': `= Index

== h2

= My h2 synonym
{c}
{synonym}
`,
      'notindex.bigb': `= Notindex

== Notindex h2

= My notindex h2 synonym
{synonym}
`,
    },
    assert_xpath: {
      'my-h2-synonym.html': [
        "//x:script[text()=\"location='index.html#h2'\"]",
      ],
      'my-notindex-h2-synonym.html': [
        "//x:script[text()=\"location='notindex.html#notindex-h2'\"]",
      ],
    }
  }
);
assert_cli(
  '--generate min followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ],
  }
);
assert_cli(
  '--generate min followed by publish does not blow up',
  {
    args: ['--publish', '--dry-run'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'subdir']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
);
assert_cli(
  '--generate min in subdir does not alter toplevel',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{}`
    },
    cwd: 'subdir',
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ],
    assert_exists: [
      'subdir/README.bigb',
    ],
    assert_not_exists: [
      'README.bigb',
    ],
  }
);
assert_cli(
  '--generate default followed by conversion does not blow up',
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
assert_cli(
  '--generate subdir followed by conversion does not blow up',
  {
    args: ['docs'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'subdir']],
    ],
  }
);
assert_cli(
  '--generate min followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
);
assert_cli(
  '--generate default followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'default']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
);
assert_cli(
  '--generate subdir followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    cwd: 'docs',
    pre_exec: [
      ['ourbigbook', ['--generate', 'subdir']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
);
assert_cli(
  '--embed-resources actually embeds resources',
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
assert_cli(
  'reference to subdir with --embed-includes',
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

// executable cwd tests
assert_cli(
  "cwd outside project directory given by ourbigbook.json",
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
    assert_exists: [
      'myproject/out',
      `myproject/${ourbigbook.RAW_PREFIX}/scss.css`,
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
assert_cli(
  "if there is no ourbigbook.json and the input is not under cwd then the project dir is the input dir",
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
    assert_exists: [
      'myproject/out',
      `myproject/${ourbigbook.RAW_PREFIX}/scss.css`,
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

assert_cli(
  'root_relpath and root_path in main.liquid.html work',
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
assert_cli(
  'root_relpath and root_page work from subdirs',
  {
    args: ['-S', '.'],
    filesystem: {
      'subdir/notindex.bigb': `= Notindex
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
</body>
</html>
`
    },
    assert_xpath: {
      'subdir/notindex.html': [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
      'subdir/notindex-split.html': [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
    }
  }
);
assert_cli(
  "multiple incoming child and parent links don't blow up",
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
assert_cli(
  'ourbigbook.json: outputOutOfTree',
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
    assert_exists: [
      'out/html/index.html',
      'out/html/split.html',
      'out/html/h2.html',
      'out/html/notindex.html',
      'out/html/notindex-h2.html',
    ],
    assert_exists_sqlite: [
      'out/db.sqlite3',
    ],
    assert_not_exists: [
      'index.html',
      'split.html',
      'h2.html',
      'notindex.html',
      'notindex-h2.html',
      'out/html/out',
    ]
  }
);
assert_cli(
  'IDs are removed from the database after you removed them from the source file and convert the file',
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
assert_cli(
  'IDs are removed from the database after you removed them from the source file and convert the directory one way',
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
assert_cli(
  'IDs are removed from the database after you removed them from the source file and convert the directory reverse',
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
assert_cli(
  'IDs are removed from the database after you delete the source file they were present in and convert the directory',
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
assert_cli(
  'when invoking with a single file timestamps are automatically ignored and render is forced',
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

assert_cli(
  "toplevel index file without a header produces output to index.html",
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
assert_cli('cross file ancestors work on single file conversions at toplevel',
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
assert_cli('cross file ancestors work on single file conversions in subdir',
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
assert_cli(
  // See also corresponding lib:.
  'incoming links: cross reference incoming links and other children with magic',
  {
    args: ['-S', '.'],
    filesystem: {
      'README.bigb': `= Index

== Dog

== Dogs

== Cat
`,
      'notindex.bigb': `= Notindex

== To dog

<dog>

== To dogs

<dogs>
`,
      'subdir/notindex.bigb': `= Notindex

<cats>

== To dog

<dog>

== To dogs

<dogs>

== Cat
`,
    },
    assert_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html#to-dog']`,
      ],
      'dogs.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html#to-dogs']`,
      ],
      'subdir/cat.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
    assert_not_xpath: {
      'dog.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
      ],
      'dogs.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
      ],
      'cat.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']`,
      ],
    },
  }
);

// JSON
// ourbigbook.json
assert_cli('ourbigbook.json redirects',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{
  "redirects": [
    ["from", "tourl"],
    ["from2", "https://tourl.com"]
  ]
}
`,
    },
    assert_xpath: {
      'from.html': [
        "//x:script[text()=\"location='tourl.html'\"]",
      ],
      'from2.html': [
        // .html not added because it is an absolute URL.
        "//x:script[text()=\"location='https://tourl.com'\"]",
      ],
    },
  }
);

assert_cli('toplevel scope gets removed on table of contents of included headers',
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
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
      'split.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='1. Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='1.1. Notindex h2']",
      ],
    },
  },
);
assert_cli('id conflict with id on another file simple',
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
    assert_exit_status: 1,
  }
);
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/241
  'fixing a header parent bug on a file in the include chain does not blow up afterwards',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

= h2
{parent=notindex}

= h3
{parent=notindex}

= h4
{parent=h2}
`,
    },
    pre_exec: [
      {
        cmd: ['ourbigbook', ['.']],
        status: 1,
      },
      {
        filesystem_update: {
          'notindex.bigb': `= Notindex

= h2
{parent=notindex}

= h3
{parent=notindex}

= h4
{parent=h3}
`,
        }
      },
    ],
  }
);
assert_cli(
  // This is a bit annoying to test from _lib because ourbigbook CLI
  // has to pass several variables for it to work.
  'link: media-provider github local path with outputOutOfTree',
  {
    args: ['myproj'],
    filesystem: {
      'myproj/README.bigb': `\\Image[myimg.png]{provider=github}
`,
      'myproj/ourbigbook.json': `{
  "outputOutOfTree": true,
  "media-providers": {
    "github": {
      "path": "../myproj-media",
      "remote": "cirosantilli/myproj-media"
    }
  }
}
`,
      'myproj-media/myimg.png': 'a',
    },
    assert_xpath: {
      'myproj/out/html/index.html': [
        // Two .. to get out from under out/html, and one from the media-providers ../myproj-media.
        "//x:a[@href='../../../myproj-media/myimg.png']//x:img[@src='../../../myproj-media/myimg.png']",
      ],
    },
  }
);
assert_cli(
  // This is a bit annoying to test from _lib because ourbigbook CLI
  // has to pass several variables for it to work.
  'link: media-provider github local path without outputOutOfTree',
  {
    args: ['myproj'],
    filesystem: {
      'myproj/README.bigb': `\\Image[myimg.png]{provider=github}
`,
      'myproj/ourbigbook.json': `{
  "media-providers": {
    "github": {
      "path": "../myproj-media",
      "remote": "cirosantilli/myproj-media"
    }
  }
}
`,
      'myproj-media/myimg.png': 'a',
    },
    assert_xpath: {
      'myproj/index.html': [
        "//x:a[@href='../myproj-media/myimg.png']//x:img[@src='../myproj-media/myimg.png']",
      ],
    },
  }
);
assert_cli(
  'link: media-provider github local path is not used when publishing',
  {
    args: ['--dry-run', '--publish'],
    cwd: 'myproj',
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'myproj/README.bigb': `\\Image[myimg.png]{provider=github}
`,
      'myproj/ourbigbook.json': `{
  "media-providers": {
    "github": {
      "path": "../myproj-media",
      "remote": "cirosantilli/myproj-media"
    }
  }
}
`,
      'myproj-media/myimg.png': 'a',
    },
    assert_xpath: {
      'myproj/out/publish/out/github-pages/index.html': [
        "//x:a[@href='https://raw.githubusercontent.com/cirosantilli/myproj-media/master/myimg.png']//x:img[@src='https://raw.githubusercontent.com/cirosantilli/myproj-media/master/myimg.png']",
      ],
    },
  }
);
assert_cli(
  'timestamps are tracked separately for different --output-format',
  {
    args: ['--output-format', 'bigb', '.'],
    filesystem: {
      'notindex.bigb': `Hello \\i[world]!
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
    pre_exec: [
      {
        cmd: ['ourbigbook', ['--output-format', 'html', '.']],
      },
      {
        cmd: ['ourbigbook', ['--output-format', 'bigb', '.']],
      },
      {
        filesystem_update: {
          'notindex.bigb': `Hello \\i[world2]!
`,
        }
      },
      {
        cmd: ['ourbigbook', ['--output-format', 'html', '.']],
      },
    ],
    assert_xpath: {
      'out/html/notindex.html': [
        "//x:i[text()='world2']",
      ],
    },
    assert_bigb: {
      'out/bigb/notindex.bigb': `Hello \\i[world2]!
`,
    },
  }
);
assert_cli('bigb output: synonym with split_headers does not produce redirect files',
  {
    args: ['--split-headers', '--output-format', 'bigb', '.'],
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex

== Notindex 2

= Notindex 2 2
{synonym}
`,
    },
    // Just for sanity, not the actual test.
    assert_bigb: {
      'notindex-split.bigb': `= Notindex
`,
      'notindex-2.bigb': `= Notindex 2

= Notindex 2 2
{synonym}
`,
    },
    assert_not_exists: [
      'notindex-2-2.bigb',
      // The actual test.
      'notindex-2-2.html',
    ],
  }
)
assert_cli(
  'math: builtin math defines work',
  {
    stdin: `$$
\\dv{x^2}{x}
$$
`,
  }
);
assert_cli(
  'raw: bigb source files are copied into raw',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': ``,
      'notreadme.bigb': ``,
      'subdir/README.bigb': ``,
      'subdir/notreadme.bigb': ``,
      'main.scss': ``,
    },
    assert_exists: [
      `${ourbigbook.RAW_PREFIX}/README.bigb`,
      `${ourbigbook.RAW_PREFIX}/notreadme.bigb`,
      `${ourbigbook.RAW_PREFIX}/subdir/README.bigb`,
      `${ourbigbook.RAW_PREFIX}/subdir/notreadme.bigb`,
      // Also the source of other converted formats like SCSS.
      `${ourbigbook.RAW_PREFIX}/main.scss`,
    ]
  }
);
assert_cli(
  // Due to https://docs.github.com/todo/1 should be 1 triple conversion
  // stopped failing. But it should fail.
  'x: to undefined ID fails each time despite timestamp skip',
  {
    args: ['.'],
    assert_exit_status: 1,
    filesystem: {
      'README.bigb': `= Index

<asdf>
`,
    },
    pre_exec: [
      {
        cmd: ['ourbigbook', ['.']],
        status: 1,
      },
      {
        cmd: ['ourbigbook', ['.']],
        status: 1,
      },
    ],
  }
);
assert_cli(
  'raw: directory listings simple',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index

\\a[.][link to root]

\\a[subdir][link to subdir]

\\a[subdir/subdir2][link to subdir2]

\\a[index.html][index to index.html]

\\a[_index.html][index to _index.html]

\\a[subdir/index.html][index to subdir/index.html]

== subdir
{file}

== subdir/subdir2
{file}
`,
      'subdir/index.bigb': `= Subdir

\\a[..][link to root]

\\a[.][link to subdir]

\\a[subdir2][link to subdir2]
`,
      'myfile.txt': `ab`,
      'index.html': '',
      '_index.html': '',
      'subdir/myfile-subdir.txt': `ab`,
      'subdir/index.html': '',
      'subdir/subdir2/index.bigb': `= Subdir2

\\a[../..][link to root]

\\a[..][link to subdir]

\\a[.][link to subdir2]
`,
      'subdir/subdir2/myfile-subdir2.txt': `ab`,
      '.git/myfile-git.txt': `ab`,
    },
    assert_exists: [
      `${ourbigbook.RAW_PREFIX}/myfile.txt`,
      `${ourbigbook.RAW_PREFIX}/index.html`,
      `${ourbigbook.RAW_PREFIX}/_index.html`,
      `${ourbigbook.RAW_PREFIX}/subdir/index.html`,
      `${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt`,
    ],
    assert_not_exists: [
      // Ignored directories are not listed.
      `${ourbigbook.RAW_PREFIX}/.git/index.html`,
    ],
    assert_xpath: {
      [`index.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='View file']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='View file']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,

        `//x:a[@href='${ourbigbook.RAW_PREFIX}/index.html' and text()='index to index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/_index.html' and text()='index to _index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='index to subdir/index.html']`,
      ],
      [`subdir.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,
      ],
      [`subdir/subdir2.html`]: [
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/index.html`]: [
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/myfile.txt' and text()='myfile.txt']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/README.bigb' and text()='README.bigb']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/index.html' and text()='index.html']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/_index.html' and text()='_index.html']`,

        `//x:a[@href='subdir/index.html' and text()='subdir/']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/subdir/index.html`]: [
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt' and text()='myfile-subdir.txt']`,
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='index.html']`,

        `//x:a[@href='subdir2/index.html' and text()='subdir2/']`,
        `//x:a[@href='../index.html' and text()='(root)']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html`]: [
        `//x:a[@href='../../index.html' and text()='(root)']`,
        `//x:a[@href='../index.html' and text()='subdir']`,
      ],
    },
    assert_not_xpath: {
      [`${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        "//x:a[text()='(root)']",

        // Ignored files don't show on listing.
        "//x:a[text()='.git']",
        "//x:a[text()='.git/']",
      ],
    },
  }
);
assert_cli(
  'raw: directory listings without .html',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{
  "htmlXExtension": false
}`,
      'README.bigb': `= Index

\\a[.][link to root]

\\a[subdir][link to subdir]

\\a[subdir/subdir2][link to subdir2]

\\a[index.html][index to index.html]

\\a[_index.html][index to _index.html]

\\a[subdir/index.html][index to subdir/index.html]

== subdir
{file}

== subdir/subdir2
{file}
`,
      'subdir/index.bigb': `= Subdir

\\a[..][link to root]

\\a[.][link to subdir]

\\a[subdir2][link to subdir2]
`,
      'myfile.txt': `ab`,
      'index.html': '',
      '_index.html': '',
      'subdir/myfile-subdir.txt': `ab`,
      'subdir/index.html': '',
      'subdir/subdir2/index.bigb': `= Subdir2

\\a[../..][link to root]

\\a[..][link to subdir]

\\a[.][link to subdir2]
`,
      'subdir/subdir2/myfile-subdir2.txt': `ab`,
      '.git/myfile-git.txt': `ab`,
    },
    assert_exists: [
      `${ourbigbook.RAW_PREFIX}/myfile.txt`,
      `${ourbigbook.RAW_PREFIX}/index.html`,
      `${ourbigbook.RAW_PREFIX}/_index.html`,
      `${ourbigbook.RAW_PREFIX}/subdir/index.html`,
      `${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt`,
    ],
    assert_not_exists: [
      // Ignored directories are not listed.
      `${ourbigbook.RAW_PREFIX}/.git/index.html`,
    ],
    assert_xpath: {
      [`index.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='View file']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='View file']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,

        `//x:a[@href='${ourbigbook.RAW_PREFIX}/index.html' and text()='index to index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/_index.html' and text()='index to _index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='index to subdir/index.html']`,
      ],
      [`subdir.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,
      ],
      [`subdir/subdir2.html`]: [
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/index.html`]: [
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/myfile.txt' and text()='myfile.txt']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/README.bigb' and text()='README.bigb']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/index.html' and text()='index.html']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/_index.html' and text()='_index.html']`,

        `//x:a[@href='subdir' and text()='subdir/']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/subdir/index.html`]: [
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt' and text()='myfile-subdir.txt']`,
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='index.html']`,

        `//x:a[@href='subdir2' and text()='subdir2/']`,
        `//x:a[@href='..' and text()='(root)']`,
      ],
      [`${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html`]: [
        `//x:a[@href='../..' and text()='(root)']`,
        `//x:a[@href='..' and text()='subdir']`,
      ],
    },
    assert_not_xpath: {
      [`${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        "//x:a[text()='(root)']",

        // Ignored files don't show on listing.
        "//x:a[text()='.git']",
        "//x:a[text()='.git/']",
      ],
    },
  }
);
assert_cli(
  'raw: root directory listing in publish does not show publish',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'not-ignored.txt': ``,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
    assert_not_xpath: {
      [`out/publish/out/github-pages/${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        "//x:a[text()='..']",
      ],
    },
  }
);

// ignores
assert_cli(
  'json: ignore: is used in conversion',
  {
    args: ['.'],
    filesystem: {
      'README.bigb': `= Index
`,
      'ignored-top.txt': ``,
      'not-ignored.txt': ``,
      'a.ignore': ``,

      'subdir/ignored.txt': ``,
      'subdir/ignored-top.txt': ``,
      'subdir/not-ignored.txt': ``,
      'subdir/a.ignore': ``,

      'subdir-dont/a.ignore': ``,
      'subdir-dont/subdir/a.ignore': ``,

      'subdir-ignored/default.txt': ``,

      // All files of this subdir are ignored, but not the subdir itself.
      'subdir-ignore-files/a.ignore': ``,

      'ourbigbook.json': `{
  "ignore": [
    "ignored-top\\\\.txt",
    "subdir/ignored\\\\.txt",
    "subdir-ignored",
    ".*\\\\.ignore"
  ],
  "dontIgnore": [
    "subdir-dont/.*\\\\.ignore"
  ],
  "outputOutOfTree": true
}
`,
    },
    assert_exists: [
      `out/html/${ourbigbook.DIR_PREFIX}/index.html`,
      `out/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,

      // Only applies to full matches.
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/ignored-top.txt`,

      // dontIgnore overrides previous ignores.
      `out/html/${ourbigbook.RAW_PREFIX}/subdir-dont/a.ignore`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir-dont/subdir/a.ignore`,

      // Directory conversion does not blow up when all files in directory are ignored.
      `out/html/${ourbigbook.DIR_PREFIX}/subdir-ignore-files/index.html`,
    ],
    assert_not_exists: [
      `out/html/${ourbigbook.RAW_PREFIX}/ignored-top.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,

      // If a directory is ignored, we don't recurse into it at all.
      `out/html/${ourbigbook.DIR_PREFIX}/subdir-ignored/index.html`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir-ignored/default.txt`,

      // Ignore by extension.
      `out/html/${ourbigbook.RAW_PREFIX}/a.ignore`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/a.ignore`,
    ],
  }
);
assert_cli(
  'json: ignore is used in publish',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'ignored.txt': ``,
      'not-ignored.txt': ``,
      'ourbigbook.json': `{
  "ignore": [
    "ignored.txt"
  ],
  "outputOutOfTree": true
}
`,
    },
    assert_exists: [
      `out/publish/out/github-pages/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
    ],
    assert_not_exists: [
      `out/publish/out/github-pages/${ourbigbook.RAW_PREFIX}/ignored.txt`,
    ],
  }
);
assert_cli(
  'json: ignore: works if pointing to ignored directory',
  {
    args: ['ignored'],
    filesystem: {
      'ignored/notindex.bigb': `\\reserved_undefined
`,
      'ourbigbook.json': `{
  "ignore": [
    "ignored"
  ],
  "outputOutOfTree": true
}
`,
    },
  }
);
assert_cli(
  'json: ignore: works if pointing inside ignored directory',
  {
    args: ['ignored/subdir'],
    filesystem: {
      'ignored/subdir/notindex.bigb': `\\reserved_undefined
`,
      'ourbigbook.json': `{
  "ignore": [
    "ignored"
  ],
  "outputOutOfTree": true
}
`,
    },
  }
);
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores files from toplevel directory conversion',
  {
    args: ['.'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'ignored.txt': ``,
      'not-ignored.txt': ``,
      'subdir/ignored.txt': ``,
      'subdir/not-ignored.txt': ``,
      'ignored-subdir/1.txt': ``,
      'ignored-subdir/2.txt': ``,
      '.gitignore': `ignored.txt
ignored-subdir
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
    assert_exists: [
      `out/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,
    ],
    assert_not_exists: [
      `out/html/${ourbigbook.RAW_PREFIX}/ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/ignored-subdir/1.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/ignored-subdir/2.txt`,
    ],
  }
);
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores files from subdirectory conversion',
  {
    args: ['subdir'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'ignored.txt': ``,
      'not-ignored.txt': ``,
      'subdir/ignored.txt': ``,
      'subdir/not-ignored.txt': ``,
      '.gitignore': `ignored.txt
ignored-subdir
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
    assert_exists: [
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,
    ],
    assert_not_exists: [
      `out/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/ignored.txt`,
      `out/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,
    ],
  }
);
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores individual files from conversion',
  {
    args: ['tmp.bigb'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'tmp.bigb': `= Tmp

\\asdf
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
  }
);
assert_cli(
  'git: .gitignore is used in --web conversion',
  {
    args: ['--web', '--web-dry', '.'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      'tmp.bigb': `= Tmp

\\asdf
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
  }
);
assert_cli(
  'git: conversion of single file in git directory works',
  {
    args: ['README.bigb'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'README.bigb': `= Index
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
  "outputOutOfTree": true
}
`,
    },
    assert_exists: [
      `out/html/index.html`,
    ],
  }
);

assert_cli(
  '--web-dry on simple repository',
  {
    args: ['--web', '--web-dry', '.'],
    filesystem: {
      'README.bigb': `= Index
`,
      'ourbigbook.json': `{
}
`,
    },
  }
);
assert_cli(
  '--web-dry on single file',
  {
    args: ['--web', '--web-dry', 'README.bigb'],
    filesystem: {
      'README.bigb': `= Index
`,
      'ourbigbook.json': `{
}
`,
    },
  }
);
// This doesn't really test anything as options are not doing anything to ourbigbook, only lib.
//assert_cli(
//  "ourbigbook.json: publishOptions are not active when not publishing",
//  {
//    args: ['.'],
//    filesystem: {
//      'README.bigb': `= Index
//`,
//      'ourbigbook.json': `{
//  "publishOptions": {
//    "ignore": [
//      "README.bigb"
//    ]
//  },
//  "outputOutOfTree": true
//}
//`,
//    },
//    assert_exists: [
//      `out/html/index.html`,
//    ],
//  }
//);
