const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const lodash = require('lodash')
const { Sequelize } = require('sequelize')

const ourbigbook = require('./index')
const ourbigbook_nodejs = require('./nodejs');
const ourbigbook_nodejs_front = require('./nodejs_front');
const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe');
const { TMP_DIRNAME } = ourbigbook_nodejs_webpack_safe
const { read_include } = require('./web_api');
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
    //'ast-inside-simple': true,
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
  options = Object.assign({}, options)
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
    if (!('assert_check_db_errors' in options)) {
      // TODO would be better to assert the precise lines of errors, but lazy to implement now.
      options.assert_check_db_errors = 0
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
      // There can be no errors in these conversions, there is no way to check for them.
      options.convert_before = [];
    }
    if (!('convert_before_norender' in options)) {
      // Same as convert_before but without render. check_db is done after this step.
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
      return options.filesystem.hasOwnProperty(my_path) || filesystem_dirs.hasOwnProperty(my_path)
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
    const filesystem_dirs = {'': {}}
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

    let ourbigbookJson
    const ourbigbookJsonString = filesystem[ourbigbook.OURBIGBOOK_JSON_BASENAME]
    if (ourbigbookJsonString) {
      ourbigbookJson = JSON.parse(ourbigbookJsonString)
    } else {
      ourbigbookJson = {}
    }
    let convertOptions = options.convert_opts
    if (convertOptions.ourbigbook_json) {
      ourbigbookJson = lodash.merge(convertOptions.ourbigbook_json, ourbigbookJson)
    }
    convertOptions.ourbigbook_json = ourbigbookJson
    convertOptions = ourbigbook.convertInitOptions(convertOptions)
    ourbigbookJson = convertOptions.ourbigbook_json
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
    convert_before_norender = [...convert_before_norender, ...convert_before]

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
    const sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize({
        storage: ourbigbook_nodejs_webpack_safe.SQLITE_MAGIC_MEMORY_NAME,
        logging: false,
      },
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
      const check_db_error_messages = await ourbigbook_nodejs_webpack_safe.check_db(
        sequelize,
        undefined,
        {
          ref_prefix: new_convert_opts.ref_prefix,
          options: convertOptions,
        }
      )
      // TODO create a way to check location of these errors. This would require returning ErrorMessage objects
      // and not strings from check_db. Easy, but some other day.
      assert.strictEqual(check_db_error_messages.length, options.assert_check_db_errors, check_db_error_messages.join('\n'))
      for (const input_path of convert_before) {
        await convert(input_path, true)
      }
      const extra_returns = {};
      if (options.stdin === undefined) {
        if (options.input_path_noext !== undefined) throw new Error('input_string === undefined && input_path_noext !== undefined')
        if (options.assert_xpath_stdout.length) throw new Error('input_string === undefined && options.assert_xpath_stdout !== []')
        if (options.assert_not_xpath_stdout.length) throw new Error('input_string === undefined && options.assert_not_xpath_stdout !== []')
      } else {
        if (options.input_path_noext !== undefined) {
          new_convert_opts.input_path = options.input_path_noext + '.' + ourbigbook.OURBIGBOOK_EXT;
          new_convert_opts.toplevel_id = options.input_path_noext;
        }
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
        if (options.assert_bigb_stdout) {
          assert.strictEqual(output, options.assert_bigb_stdout);
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
            )
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

const testdir = path.join(__dirname, TMP_DIRNAME, 'test')
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
    // These slightly modified titles should still be unique, but who knows.
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
      const sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize(
        { logging: false },
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
assert_lib_ast('p: one paragraph implicit no split headers', 'ab\n',
  [a('P', [t('ab')])],
)
assert_lib_ast('p: one paragraph explicit', '\\P[ab]\n',
  [a('P', [t('ab')])],
)
assert_lib_ast('p: two paragraphs', 'p1\n\np2\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
  ]
)
assert_lib_ast('p: three paragraphs',
  'p1\n\np2\n\np3\n',
  [
    a('P', [t('p1')]),
    a('P', [t('p2')]),
    a('P', [t('p3')]),
  ]
)
assert_lib_ast('p: shorthand paragraph at start of sane quote',
  '\\Q[\n\naa]\n',
  [
    a('Q', [
      a('P', [t('aa')])]
    ),
  ]
)
assert_lib_ast('p: space-only line is not ignored outside of list indent',
  // Otherwise it would blow up on 3 newline detection. And this happens on bigb output from:
  // ``
  // \TestSaneOnly[]<space>
  //
  //
  // b
  // ``
  // so making a valid construct lead to a conversion error.
  'a\n \n\nb',
  [
    a('P', [
      t('a'),
      a('br'),
      t(' '),
    ]),
    a('P', [
      t('b'),
    ]),
  ],
)
assert_lib_error('p: paragraph with three newlines is an error', 'p1\n\n\np2\n', 3, 1);
assert_lib_error('p: paragraph with four newlines is an error', 'p1\n\n\n\np2\n', 3, 1);
assert_lib_error('p: list indented paragraph with three newlines is an error', '* p1\n  \n  \n  p2\n', 3, 1);
assert_lib_error('p: list semi indented paragraph with three newlines is an error', '* p1\n  \n\n  p2\n', 3, 1);
assert_lib_ast('p: one newline at the end of document is ignored', 'p1\n', [a('P', [t('p1')])]);
assert_lib_error('p: two newlines at the end of document gives an error', 'p1\n\n', 2, 1);
assert_lib_error('p: three newlines at the end of document gives an error', 'p1\n\n\n', 2, 1);

// List.
// \L
const l_with_explicit_ul_expect = [
  a('P', [t('ab')]),
  a('Ul', [
    a('L', [t('cd')]),
    a('L', [t('ef')]),
  ]),
  a('P', [t('gh')]),
];
assert_lib_ast('list: with explicit ul and no extra spaces',
  `ab

\\Ul[\\L[cd]\\L[ef]]

gh
`,
  l_with_explicit_ul_expect
)
assert_lib_ast('list: shorthand with empty line after spaces',
  `ab

* cd
\u{20}\u{20}
  ef

gh
`,
  [
    a('P', [t('ab')]),
    a('Ul', [
      a('L', [
        a('P', [t('cd')]),
        a('P', [t('ef')]),
      ])
    ]),
    a('P', [t('gh')]),
  ],
)
assert_lib_ast('list: with implicit ul sane',
  `ab

\\L[cd]
\\L[ef]

gh
`,
  l_with_explicit_ul_expect
)
assert_lib_ast('list: with implicit ul shorthand simple',
  `ab

* cd
* ef

gh
`,
  l_with_explicit_ul_expect
)
assert_lib_ast('list: with implicit ul shorthand and title',
  `ab

* cd
{id=asdf}

ef
`,
  [
    a('P', [t('ab')]),
    a('Ul', [
      a('L', [t('cd')], {id : [t('asdf')]}),
    ]),
    a('P', [t('ef')]),
  ]
)
assert_lib_ast('list: empty shorthand item without a space',
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
)
assert_lib_ast('list: ordered list',
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
)
assert_lib_ast('list: with paragraph sane',
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
assert_lib_ast('list: with paragraph shorthand',
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
)
assert_lib_ast('list: with multiline paragraph shorthand',
  `* aa

  bb
  cc
`,
  [
    a('Ul', [
      a('L', [
        a('P', [t('aa')]),
        a('P', [
          t('bb'),
          a('br'),
          t('cc'),
        ]),
      ]),
    ]),
  ]
)
// https://github.com/ourbigbook/ourbigbook/issues/54
assert_lib_ast('list: shorthand list with literal no error',
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
)
assert_lib_error('list: shorthand list with literal with error',
  `* aa

  \`\`
  bb
cc
  \`\`
`,
  4, 1
)
assert_lib_ast('list: shorthand list with literal with double newline is not an error',
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
)
// https://github.com/ourbigbook/ourbigbook/issues/53
assert_lib_ast('list: shorthand list with element with newline separated arguments',
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
)
assert_lib_ast('list: shorthand list inside paragraph',
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
        a('L', [t('cc')]),
      ]),
      t('dd'),
    ]),
  ]
)
assert_lib_ast('list: shorthand list at start of positional argument with newline',
  `\\Q[
* bb
* cc
]
`,
  [
    a('Q', [
      a('Ul', [
        a('L', [t('bb')]),
        a('L', [t('cc')]),
      ]),
    ]),
  ]
)
assert_lib_ast('list: shorthand list at start of positional argument without newline',
  `\\Q[* bb
* cc
]
`,
  [
    a('Q', [
      a('Ul', [
        a('L', [t('bb')]),
        a('L', [t('cc')]),
      ]),
    ]),
  ]
)
assert_lib_ast('list: shorthand list at end of positional argument without newline',
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
)
assert_lib_ast('list: shorthand list at start of named argument with newline',
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
          a('L', [t('cc')]),
        ]),
      ],
    }),
  ]
)
assert_lib_ast('list: shorthand list at start of named argument without newline',
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
          a('L', [t('cc')]),
        ]),
      ],
    }),
  ]
)
//assert_lib_ast('list: shorthand list at end of named argument without newline',
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
assert_lib_ast('list: nested list shorthand',
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
)
assert_lib_ast('list: extra nesting outside of list does not create a list',
  // https://github.com/ourbigbook/ourbigbook/issues/345
  `  * aa\n`,
  [ a('P', [t('  * aa')]) ],
)
assert_lib_ast('list: extra nesting inside of list does not create a list',
  // https://github.com/ourbigbook/ourbigbook/issues/345
  `* aa
    * bb
`,
  [
    a('Ul', [
      a('L', [
        t('aa'),
        a('br'),
        t('  * bb')
      ]),
    ]),
  ]
)
assert_lib_ast('list: escape shorthand list at start of document',
  '\\* a',
  [a('P', [t('* a')])],
)
assert_lib_ast('list: escape shorthand list after a newline',
  `a
\\* b`,
  [a('P', [
    t('a'),
    a('br'),
    t('* b'),
  ])],
)
assert_lib_ast('list: escape shorthand list inside list indent',
  `* a
  \\* b`,
  [
    a('Ul', [
      a('L', [
        t('a'),
        a('br'),
        t('* b'),
      ]),
    ]),
  ]
)
assert_lib_ast('list: asterisk in the middle of line does not need to be escaped',
  'a * b',
  [a('P', [t('a * b')])],
)
// https://github.com/ourbigbook/ourbigbook/issues/81
assert_lib_ast('list: shorthand list immediately inside shorthand list',
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
)
// https://github.com/ourbigbook/ourbigbook/issues/81
assert_lib_ast('list: with Unicode characters',
  // https://www.compart.com/en/unicode/U+1F331 Seedling
  `* \u{1F331}
* bb
`,
  [
    a('Ul', [
      a('L', [t('\u{1F331}')]),
      a('L', [t('bb')]),
    ]),
  ]
)

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
assert_lib_ast('table: tr with explicit table',
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
)
assert_lib_ast('table: tr with implicit table',
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
)
assert_lib_ast('table: fully implicit table',
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
)
assert_lib_ast('table: shorthand table inside shorthand list inside shorthand table',
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
)
// https://github.com/ourbigbook/ourbigbook/issues/81
assert_lib_ast('table: shorthand table immediately inside shorthand list',
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
)
assert_lib_ast('table: shorthand table body with empty cell and no space',
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
)
assert_lib_ast('table: shorthand table head with empty cell and no space',
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
)
assert_lib_ast('table: implicit table escape', '\\| a\n',
  [a('P', [t('| a')])],
)
assert_lib_ast("table: pipe space in middle of line don't need escape", 'a | b\n',
  [a('P', [t('a | b')])],
)
assert_lib_ast('table: auto_parent consecutive implicit tr and l',
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
)
assert_lib_ast('table: table with id has caption',
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
        a('Td', [t('01')]),
      ]),
    ], {}, { id: 'ab' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
)
assert_lib_ast('table: table with title has caption',
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
        a('Td', [t('01')]),
      ]),
    ], {}, { id: 'table-a-b' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1. ']",
    ]
  }
)
assert_lib_ast('table: table with description has caption',
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
        a('Td', [t('01')]),
      ]),
    ], {}, { id: '_1' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1. ']",
    ]
  }
)
assert_lib_ast('table: table without id, title, nor description does not have caption',
  `\\Table[
| 00
| 01
]
`,
  [
    a('Table', [
      a('Tr', [
        a('Td', [t('00')]),
        a('Td', [t('01')]),
      ]),
    ]),
  ],
  {
    assert_not_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Table 1']",
    ]
  }
)
assert_lib_ast('table: without id, title, nor description does not increment the table count',
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
        a('Td', [t('01')]),
      ]),
    ]),
    a('Table', [
      a('Tr', [
        a('Td', [t('10')]),
        a('Td', [t('11')]),
      ]),
    ]),
    a('Table', [
      a('Tr', [
        a('Td', [t('20')]),
        a('Td', [t('21')]),
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
)

// Images.
// \Image
// \image
assert_lib_ast('image: block simple',
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
)
assert_lib_ast('image: inline simple',
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
)
assert_lib_ast('image: link argument',
  `ab

\\Image[cd]{link=http://example.com}

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
      `//x:a[@href='http://example.com']//x:img[@src='${ourbigbook.RAW_PREFIX}/cd']`,
    ],
  },
)
assert_lib_ast('video: simple',
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
)
assert_lib_ast('image: title',
  `\\Image[ab]{title=c d}`,
  [
    a('Image', undefined, {
      src: [t('ab')],
      title: [t('c d')],
    }),
  ],
  { filesystem: { ab: '' } },
)
assert_lib_error('image: unknown provider',
  `\\Image[ab]{provider=reserved_undefined}`,
  1, 11
)
assert_lib_error('image: provider that does not match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=local}`,
  1, 96
)
assert_lib_stdin('image: provider that does match actual source',
  `\\Image[https://upload.wikimedia.org/wikipedia/commons/5/5b/Gel_electrophoresis_insert_comb.jpg]{provider=wikimedia}`,
)
assert_lib_ast('image: image with id has caption',
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
)
assert_lib_ast('image: image with title has caption',
  `\\Image[aa]{title=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      title: [t('b b')],
    }, {}, { id: 'b-b' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1. ']",
    ]
  }
)
assert_lib_ast('image: image with description has caption',
  `\\Image[aa]{description=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      description: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1. ']",
    ]
  }
)
assert_lib_ast('image: image with source has caption',
  `\\Image[aa]{source=b b}{external}\n`,
  [
    a('Image', undefined, {
      src: [t('aa')],
      source: [t('b b')],
    }, {}, { id: '_1' }),
  ],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Figure 1. ']",
    ]
  }
)
assert_lib_ast('image: image without id, title, description nor source does not have caption',
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
assert_lib_ast('image: image without id, title, description nor source does not increment the image count',
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
assert_lib_ast('image: title with x to header in another file does not blow up',
  `= Toplevel

\\Image[aa]{title=My \\x[notindex]}{external}

\\Include[notindex]
`,
  undefined,
  {
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
    filesystem: {
     'notindex.bigb': `= notindex h1
`,
    },
    input_path_noext: 'index',
  }
)
assert_lib('link to image in other files that has title with x to header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[image-my-notindex]

\\Include[image]
\\Include[notindex]
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
)
assert_lib('link to image in other files that has title with x to synonym header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[image-my-notindex-h1-2]

\\Include[image]
\\Include[notindex]
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
)
assert_lib('link to image in other files that has title with two x to other headers',
  // check_db extra ID removal was removing the first ID because the link line/columns were the same for both,
  // fixed at title= argument position, and not at the \x position.
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[image-my-notindex-2-notindex-3]

\\Include[notindex]
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
)
assert_lib('image: dot added automatically between title and description if title does not end in punctuation',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Image[http://a]
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
        // TODO move sep . into title. This makes it more uniform with explicit punctuation in title.
        "//x:figcaption[text()='. My image 1.']//x:div[@class='title' and text()='My title 1']",
        "//x:figcaption[text()=' My image 2.']//x:div[@class='title' and text()='My title 2.']",
        "//x:figcaption[text()=' My image 3.']//x:div[@class='title' and text()='My title 3?']",
        "//x:figcaption[text()=' My image 4.']//x:div[@class='title' and text()='My title 4!']",
        "//x:figcaption[text()=' My image 5.']//x:div[@class='title' and text()='My title 5 (2000)']",
        "//x:figcaption[text()='. My video 1.']//x:div[@class='title' and text()='My title 1']",
        "//x:figcaption[text()=' My video 2.']//x:div[@class='title' and text()='My title 2.']",
        // TODO any way to test this properly? I would like something like:
        //"//x:figcaption[text()='. My title with source 2. . My image with source 2.']",
        // There are multiple text nodes because of the <a from source in the middle.
        "//x:figcaption//x:div[@class='title' and text()='My title with source 1']",
        "//x:figcaption//x:div[@class='title' and text()='My title with source 2.']",
        "//x:div[@class='caption' and text()='. My code 1.']//x:div[@class='title' and text()='My title 1']",
        "//x:div[@class='caption' and text()=' My code 2.']//x:div[@class='title' and text()='My title 2.']",
        "//x:div[@class='caption' and text()='. My table 1.']//x:div[@class='title' and text()='My title 1']",
        "//x:div[@class='caption' and text()=' My table 2.']//x:div[@class='title' and text()='My title 2.']",
        "//x:div[@class='caption' and text()='. My quote 1.']//x:div[@class='title' and text()='My title 1']",
        "//x:div[@class='caption' and text()=' My quote 2.']//x:div[@class='title' and text()='My title 2.']",
        "//x:figcaption[text()='My image no title.']",
        "//x:figcaption[text()='. My image source no title.']",
      ],
    },
  }
)
assert_lib_ast('image: escapes HTML correctly block',
  `\\Image["'\\<&]["'\\<&]{source="'\\<&}`,
  [
    a('Image', undefined, {
      source: [t(`"'<&`)],
      src: [t(`"'<&`)],
    }),
  ],
  {
    filesystem: { [`"'<&`]: '' },
    assert_xpath_stdout: [
      `//x:a[@href="${ourbigbook.RAW_PREFIX}/%22'%3C&"]//x:img[@src="${ourbigbook.RAW_PREFIX}/%22'%3C&" and @alt=concat('"', "'<&")]`,
      `//x:a[@href="%22'%3C&" and text()='Source']`,
    ],
  },
)
assert_lib_ast('image: escapes HTML correctly inline',
  `\\image["'\\<]`,
  [
    a('P', [
      a('image', undefined, {
        src: [t(`"'<`)],
      }),
    ])
  ],
  {
    filesystem: { [`"'<`]: '' },
    assert_xpath_stdout: [
      `//x:a[@href="${ourbigbook.RAW_PREFIX}/%22'%3C"]//x:img[@src="${ourbigbook.RAW_PREFIX}/%22'%3C"]`,
    ],
  },
)
assert_lib_ast('image: escapes link argument HTML correctly block',
  `\\Image[http://example.com]{link="\\<}`,
  [
    a('Image', undefined, {
      link: [t('"<')],
      src: [t('http://example.com')],
    }),
  ],
  {
    filesystem: { '"<': '' },
    assert_xpath_stdout: [
      `//x:a[@href='%22%3C']//x:img[@src='http://example.com']`,
    ],
  },
)
assert_lib_ast('image: escapes link argument HTML correctly inline',
  `\\image[http://example.com]{link="\\<}`,
  [
    a('P', [
      a('image', undefined, {
        link: [t('"<')],
        src: [t('http://example.com')],
      }),
    ])
  ],
  {
    filesystem: { '"<': '' },
    assert_xpath_stdout: [
      `//x:a[@href='%22%3C']//x:img[@src='http://example.com']`,
    ],
  },
)
assert_lib_ast('video: escapes HTML correctly',
  `\\Video["\\<]{source="\\<}`,
  [
    a('Video', undefined, {
      source: [t('"<')],
      src: [t('"<')],
    }),
  ],
  {
    filesystem: { '"<': '' },
    assert_xpath_stdout: [
      `//x:video[@src='${ourbigbook.RAW_PREFIX}/%22%3C']`,
      `//x:a[@href='%22%3C' and text()='Source']`,
    ],
  },
)

// Escapes.
assert_lib_ast('escape backslash',            'a\\\\b\n', [a('P', [t('a\\b')])]);
assert_lib_ast('escape newline',              'a\\\nb\n', [a('P', [t('a\nb')])]);
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
)

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
  `= Toplevel

\\P{id ab}[cd]
`,
  3, 6, 'index.bigb',
  {
    input_path_noext: 'index',
  }
)
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
)
assert_lib_error(
  'named argument: positive_nonzero_integer fails gracefully if not an integer',
  '\\Image[http://example.com]\n{height=asdf}',
  2, 1, 'notindex.bigb',
  { input_path_noext: 'notindex', }
)
assert_lib_error(
  'named argument: positive_nonzero_integer fails gracefully if it contains a link',
  '\\Image[http://example.com]\n{height=600 http://example.com}',
  2, 1, 'notindex.bigb',
  { input_path_noext: 'notindex', }
)

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
    a('C', [
      t('b'),
      a('br'),
      t('c'),
    ]),
    t('d'),
  ]),
  a('P', [t('e')]),
]
)
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
    a('C', [
      t('b'),
      a('br'),
      t('c'),
    ]),
    a('c', [t('d')]),
  ]),
  a('P', [t('e')]),
]
)

// Literal arguments.
assert_lib_ast('literal argument code inline',
  '\\c[[\\ab[cd]{ef}]]\n',
  [a('P', [a('c', [t('\\ab[cd]{ef}')])])],
)
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
)
assert_lib_ast('non-literal argument leading and trailing newline get removed',
  `\\P[
a
b
]
`,
  [a('P', [
    t('a'),
    a('br'),
    t('b')
  ])],
)
assert_lib_ast('literal argument leading and trailing newlines get removed',
  `\\P[[
a
b
]]
`,
  [a('P', [t('a\nb')])],
)
assert_lib_ast('literal argument leading and trailing newlines get removed but not the second one',
  `\\P[[

a
b

]]
`,
  [a('P', [t('\na\nb\n')])],
)
assert_lib_ast('literal agument escape leading open no escape',
  '\\c[[\\ab]]\n',
  [a('P', [a('c', [t('\\ab')])])],
)
assert_lib_ast('literal agument escape leading open one backslash',
  '\\c[[\\[ab]]\n',
  [a('P', [a('c', [t('[ab')])])],
)
assert_lib_ast('literal agument escape leading open two backslashes',
  '\\c[[\\\\[ab]]\n',
  [a('P', [a('c', [t('\\[ab')])])],
)
assert_lib_ast('literal agument escape trailing close no escape',
  '\\c[[\\]]\n',
  [a('P', [a('c', [t('\\')])])],
)
assert_lib_ast('literal agument escape trailing one backslash',
  '\\c[[\\]]]\n',
  [a('P', [a('c', [t(']')])])],
)
assert_lib_ast('literal agument escape trailing two backslashes',
  '\\c[[\\\\]]]\n',
  [a('P', [a('c', [t('\\]')])])],
)

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
)
assert_lib_ast('yes literal argument with argument after newline',
  `\\C[[
ab
]]
{id=cd}
`,
  newline_between_arguments_expect
)
assert_lib_ast('yes shorthand literal argument with argument after newline',
  `\`\`
ab
\`\`
{id=cd}
`,
  newline_between_arguments_expect
)

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
)
assert_lib_ast('link: auto sane',
  'a \\a[http://example.com] b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
)
assert_lib_ast('link: auto shorthand space start and end',
  'a http://example.com b\n',
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ]),
  ]
)
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
)
assert_lib_error('link: simple to local file that does not exist give an error without external',
  'a \\a[local-path.txt] b\n',
  1, 5,
)
assert_lib_stdin('link: simple to local file that does not exist does not give an error with external',
  'a \\a[local-path.txt]{external} b\n',
)
assert_lib_ast('link: auto shorthand start end document',
  'http://example.com',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
)
assert_lib_ast('link: auto shorthand start end square brackets',
  '\\P[http://example.com]\n',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
)
assert_lib_ast('link: auto shorthand with alpha character before it',
  'ahttp://example.com',
  [a('P', [
    t('a'),
    a('a', undefined, {'href': [t('http://example.com')]})
  ])]
)
assert_lib_ast('link: auto shorthand with literal square brackets around it',
  '\\[http://example.com\\]\n',
  [a('P', [
    t('['),
    a('a', undefined, {'href': [t('http://example.com]')]})
  ])]
)
assert_lib_ast('link: auto shorthand can be escaped with a backslash',
  '\\http://example.com\n',
  [a('P', [t('http://example.com')])],
)
assert_lib_ast('link: auto shorthand is not a link if the domain is empty at eof',
  'http://\n',
  [a('P', [t('http://')])],
)
assert_lib_ast('link: auto shorthand is not a link if the domain is empty at space',
  'http:// a\n',
  [a('P', [t('http:// a')])],
)
assert_lib_ast('link: auto shorthand start end named argument',
  '\\Image[aaa.jpg]{description=http://example.com}\n',
  [a('Image', undefined, {
    description: [a('a', undefined, {'href': [t('http://example.com')]})],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
)
assert_lib_ast('link: auto shorthand start end named argument',
  '\\Image[aaa.jpg]{source=http://example.com}\n',
  [a('Image', undefined, {
    source: [t('http://example.com')],
    src: [t('aaa.jpg')],
  })],
  { filesystem: { 'aaa.jpg': '' } }
)
assert_lib_ast('link: auto shorthand newline',
  `a

http://example.com

b
`,
  [
    a('P', [t('a')]),
    a('P', [a('a', undefined, {'href': [t('http://example.com')]})]),
    a('P', [t('b')]),
  ]
)
assert_lib_ast('link: shorthand with custom body no newline',
  'http://example.com[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
)
assert_lib_ast('link: shorthand with custom body with newline',
  'http://example.com\n[aa]',
  [
    a('P', [
      a('a', [t('aa')], {'href': [t('http://example.com')]}),
    ]),
  ]
)
assert_lib_ast('link: auto end in space',
  `a http://example.com b`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
      t(' b'),
    ])
  ]
)
assert_lib_ast('link: auto end in square bracket',
  `\\P[a http://example.com]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com')]}),
    ])
  ]
)
assert_lib_ast('link: auto containing escapes',
  `\\P[a http://example.com\\]a\\}b\\\\c\\ d&Á%C3%81]`,
  [
    a('P', [
      t('a '),
      a('a', undefined, {'href': [t('http://example.com]a}b\\c d&Á%C3%81')]}),
    ])
  ],
  {
    assert_xpath_stdout: [
      "//x:a[@href='http://example.com%5Da%7Db%5Cc%20d&%C3%81%C3%81']",
    ],
  }
)
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
)
assert_lib_ast('link: auto shorthand http https removal',
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
)
assert_lib_ast('link: xss: content and href',
  `\\a[ab&\\<>"'cd][ef&\\<>"'gh]{external}\n`,
  undefined,
  {
    assert_xpath_stdout: [
      `//x:a[@href=concat('ab&%3C%3E%22', "'", 'cd') and text()=concat('ef&<>"', "'", 'gh')]`,
    ]
  }
)
assert_lib_error(
  // {check} local file existence of \a and \Image and local link automodifications.
  'link: relative reference to nonexistent file leads to failure in link',
  `\\a[i-dont-exist]
`, 1, 3, 'index.bigb',
  {
    input_path_noext: 'index',
  }
)
assert_lib_error(
  'link: relative reference to nonexistent file leads to failure in image',
  `\\Image[i-dont-exist]
`, 1, 7, 'index.bigb',
  {
    input_path_noext: 'index',
  }
)
assert_lib_ast(
  'link: relative reference to existent file does not lead to failure in link',
  `\\a[i-exist]
`,
  undefined,
  {
    input_path_noext: 'index',
    filesystem: {
      'i-exist': '',
    }
  }
)
assert_lib_ast(
  'link: relative reference to existent file does not lead to failure in image',
  `\\Image[i-exist]
`,
  undefined,
  {
    input_path_noext: 'index',
    filesystem: {
      'i-exist': '',
    }
  }
)
assert_lib_ast(
  'link: external prevents existence checks in link',
  `\\a[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'index',
  }
)
assert_lib_ast(
  'link: external prevents existence checks in block image',
  `\\Image[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'index',
  }
)
assert_lib_ast(
  'link: external prevents existence checks in inline image',
  `\\image[i-dont-exist]{external}
`,
  undefined,
  {
    input_path_noext: 'index',
  }
)
assert_lib_ast(
  'link: existence checks are skipped when media provider converts them to absolute url',
  `\\Image[i-dont-exist]
`,
  undefined,
  {
    input_path_noext: 'index',
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
)
assert_lib(
  'link: relative links and images are corrected for different output paths with scope and split-headers',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/not-index]

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
      'subdir/index.bigb': `= Subdir

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
      'subdir/not-index.bigb': `= Subdir Not Index

\\a[../i-exist][subdir not index i-exist]

\\a[i-exist-subdir][subdir not index i-exist-subdir]
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
      'subdir/not-index.html': [
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/i-exist' and text()='subdir not index i-exist']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/subdir/i-exist-subdir' and text()='subdir not index i-exist-subdir']`,
      ],
    },
  }
)

// Forbidden nestings
assert_lib_error('nest: a inside a gives an error explicit',
  // Invalid HTML
  '\\a[http://example2.com][\\a[http://example1.com][example1.com]{external}]{external}\n',
  1,
  // This points to the '\\' in the second \\a
  25,
)
assert_lib_error('nest: a inside a gives an error implicit',
  // Invalid HTML
  '\\a[http://example2.com][http://example1.com]{external}\n',
  1,
  // This points to the 'h' in "http://example1.com"
  25
)
assert_lib_error('nest: a inside H gives an error explicit',
  // Invalid HTML because we put <h> contents inside <a> for self link
  '\\H[1][\\a[http://example.com][my content]]\n',
  1, 7
)
assert_lib_error('nest: a inside H gives an error implicit',
  // Invalid HTML because we put <h> contents inside <a> for self link
  '= http://example.com\n',
  1, 3
)
assert_lib_error('nest: H inside H gives and error',
  `= \\H[2]
`,
  1, 3, 'index.bigb',
  { input_path_noext: 'index' }
)
assert_lib_error('nest: Video inside a gives an error',
  // Invalid HTML, <video> is interactive when controls is given which we do.
  // And is shorthand for YouTube videos too, so just forbid it as well.
  '\\a[http://example2.com][\\Video[http://example1.com]]{external}\n',
  1,
  // This points to the '\\' of \\Video
  25,
)
assert_lib_error('nest: Video inside H gives an error',
  // Invalid HTML, <video> is interactive and we put <h> contents inside <a>.
  '= a \\Video[http://example.com]\n',
  1,
  5,
)
assert_lib_error('nest: Image inside a gives an error',
  // This could be allowed, but then we'd need to worry about not creating sublinks on
  // all of: link to image, {source=, {link= so we're just blocking it for now as there isn't
  // much of a use case, especially given that {link already exists.
  `\\a[http://mylink.com][\\Image[http://myimg.com]]`,
  1,
  // Points to '\\' in '\\Image'
  23
)
assert_lib_error('nest: text inside Ul gives an error',
  `\\Ul[asdf]`,
  1,
  // Points to 'a' in 'asdf'
  5
)
assert_lib_error('nest: non-L inside Ul gives an error',
  `\\Ul[\\Q[asdf]]`,
  1,
  // Points to \ in '\Q'
  5
)
assert_lib_error('nest: non-L inside Ol gives an error',
  `\\Ol[\\Q[asdf]]`,
  1,
  // Points to \ in \Q
  5
)
assert_lib_error('nest: text inside Table gives an error',
  `\\Table[asdf]`,
  1,
  // Points to 'a' in 'asdf'
  8
)
assert_lib_error('nest: non-Tr inside Table gives an error',
  `\\Table[\\Q[asdf]]`,
  1,
  // Points to \ in \Q
  8
)
assert_lib_error('nest: text inside Tr gives an error',
  `\\Table[\\Tr[asdf]]`,
  1,
  // Points to 'a' in 'asdf'
  12
)
assert_lib_error('nest: non-Td non-Th inside Tr gives an error',
  `\\Table[\\Tr[\\Q[asdf]]]`,
  1,
  // Points to \ in \Q
  12
)
assert_lib_ast('nest: image inside a is allowed and does not create nested a',
  `\\a[http://mylink.com][\\image[http://myimg.com]]`,
  undefined,
  {
    assert_xpath_stdout: [
      `//x:a[@href='http://mylink.com']//x:img[@src='http://myimg.com']`,
    ],
    assert_not_xpath_stdout: [
      `//x:a[@href='http://myimg.com']`,
    ],
  },
)
assert_lib_error('nest: Image inside H gives an error',
  // We add div and other block stuff to block images, which is invalid HTML.
  '= a \\Image[http://example.com]\n',
  1,
  5,
)
assert_lib_error('nest: image inside H gives an error',
  // Valid HTML, but feels like a bad idea, especially for web, as it would generate
  // extra requests on places like indices and ToC, where it is not expected.
  '= a \\image[http://example.com]\n',
  1,
  5,
)
assert_lib_error('nest: any block macro inside H gives an error explicit',
  '= a \\Hr\n',
  1,
  5,
)
assert_lib_error('nest: any block macro inside H gives an error implicit paragraph',
  '\\H[1][a\n\nb]',
  1,
  7,
)
assert_lib_error('nest: br inside H gives an error',
  '= a \\br b',
  1,
  5,
)
assert_lib_error('nest: inline macros can only contain inline macros explicit',
  '\\i[ab \\Hr cd]\n',
  1,
  7,
)
assert_lib_error('nest: inline macros can only contain inline macros implicit paragraph',
  '\\i[ab \\Hr cd]\n',
  1,
  7,
)
assert_lib_error('nest: header source cannot contain newlines',
  // While this could be allowed in principle, it requires better implementation on web
  // to avoid serious issues related to title splitting. So let's just forbid for now.
  '= a `b\nc` d',
  1,
  7,
)

// Line break and Horizontal lines
// \br, \Hr
assert_lib_error('br: empty argument must be empty',
  `\\br[a]
`, 1, 5);
assert_lib_error('Hr: empty argument must be empty',
  `\\Hr[a]
`, 1, 5);

// Internal links
// \x
assert_lib_ast('x: internal link simple',
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
)
assert_lib_ast('x: internal link full boolean style without value',
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
)
assert_lib_ast('x: internal link full boolean style with value 0',
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
)
assert_lib_ast('x: internal link full boolean style with value 1',
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
)
assert_lib_error('x: internal link full boolean style with invalid value 2',
  `= abc

\\x[abc]{full=2}
`, 3, 8);
assert_lib_error('x: internal link full boolean style with invalid value true',
  `= abc

\\x[abc]{full=true}
`, 3, 8);
assert_lib_stdin('x: internal link to image',
  `\\Image[ab]{id=cd}{title=ef}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_lib_stdin('x: internal link without content nor target title style full',
  `\\Image[ab]{id=cd}

\\x[cd]
`, { filesystem: { ab: '' } });
assert_lib_error('x: internal link undefined fails gracefully', '\\x[ab]', 1, 3);
assert_lib_error('x: internal link with child to undefined id fails gracefully',
  `= h1

\\x[ab]
`, 3, 3, undefined, {toplevel: true});
assert_lib_error('x: using a disabled macro argument fails gracefully',
  `= h1

\\x[h1]{child}
`, 3, 7, undefined, {toplevel: true});
// https://docs.ourbigbook.com#order-of-reported-errors
assert_lib_error('x: internal link undefined errors show after other errors',
  `= a

\\x[b]

\`\`
== b
`, 5, 1);
assert_lib_error('x: internal link full and ref are incompatible',
  `= abc

\\x[abc]{full}{ref}
`, 3, 1);
assert_lib_error('x: internal link content and full are incompatible',
  `= abc

\\x[abc][def]{full}
`, 3, 1);
assert_lib_error('x: internal link content and ref are incompatible',
  `= abc

\\x[abc][def]{ref}
`, 3, 1);
assert_lib_error('x: internal link full and c are incompatible',
  `= abc

\\x[abc]{c}{full}
`, 3, 1);
assert_lib_error('x: internal link full and p are incompatible',
  `= abc

\\x[abc]{p}{full}
`, 3, 1);
assert_lib('x: internal link to non-included toplevel header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[another-file]
`,
      'notindex.bigb': `= Notindex

\\x[another-file]
`,
      'another-file.bigb': '= Another file',
    },
    assert_xpath: {
      'notindex.html': [
        "//x:a[@href='another-file.html' and text()='another file']",
      ]
    },
  },
)
assert_lib('x: to toplevel home and synthetic synonym',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= My toplevel

<>{id=toplevel-to-toplevel-empty}

<My toplevel>{id=toplevel-to-toplevel-nonempty}

<Notindex>

\\Include[notindex]

= Toplevel 2
{parent=}

<>{id=toplevel-2-to-toplevel-empty}

<My toplevel>{id=toplevel-2-to-toplevel-nonempty}
`,
      'notindex.bigb': `= Notindex
{tag=}

<>{id=notindex-to-toplevel-empty}

<My toplevel>{id=notindex-to-toplevel-nonempty}
`,
    },
    assert_xpath: {
      'index.html': [
        // Empty link renders as Home.
        `//x:a[@id='toplevel-to-toplevel-empty' and @href='' and text()=' Home']`,
        // Non-empty link renders as its actual text.
        `//x:a[@id='toplevel-to-toplevel-nonempty' and @href='' and text()='My toplevel']`,
        // Toplevel project header renders as actual text in static.
        xpath_header(1, '', "x:a[@href='split.html' and text()='My toplevel']"),
        // Parent link of children of toplevel project header show as "Home".
        xpath_header_parent(2, 'toplevel-2', '', 'Home'),
      ],
      'split.html': [
        `//x:a[@id='toplevel-to-toplevel-empty' and @href='index.html' and text()=' Home']`,
        `//x:a[@id='toplevel-to-toplevel-nonempty' and @href='index.html' and text()='My toplevel']`,
      ],
      'toplevel-2.html': [
        `//x:a[@id='toplevel-2-to-toplevel-empty' and @href='index.html' and text()=' Home']`,
        `//x:a[@id='toplevel-2-to-toplevel-nonempty' and @href='index.html' and text()='My toplevel']`,
        xpath_header_parent(1, 'toplevel-2', 'index.html', 'Home'),
      ],
      'notindex.html': [
        `//x:a[@id='notindex-to-toplevel-empty' and @href='index.html' and text()=' Home']`,
        `//x:a[@id='notindex-to-toplevel-nonempty' and @href='index.html' and text()='My toplevel']`,
        xpath_header_parent(1, 'notindex', 'index.html', 'Home'),
        // Ancestors metadata show Home as Home.
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html' and text()=' Home']`,
        // Incoming links show Home as Home.
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='index.html' and text()=' Home']`,
      ]
    },
  },
)
assert_lib('x: to empty home header',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      // We are requiring a space after the = for now. Not ideal
      // but not in the mood for changing the tokenizer either...
      'index.bigb': `=${' '}

<>{id=toplevel-to-toplevel-empty}
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:a[@id='toplevel-to-toplevel-empty' and @href='' and text()=' Home']`,
      ],
    },
  },
)
assert_lib('x: internal link to non-included non-toplevel header in another file',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[another-file]
`,
      'notindex.bigb': `= Notindex

\\x[another-file-2]
`,
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
)
assert_lib('x: internal link to included header in another file',
  // I kid you not. Everything breaks everything.
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[another-file]

\\x[another-file-h2]

\\Include[another-file]
`,
      'another-file.bigb': `= Another file

== Another file h2
`
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@href='another-file.html' and text()='another file']",
        "//x:a[@href='another-file.html#another-file-h2' and text()='another file h2']",
      ]
    }
  },
)
assert_lib_ast('x: internal link to ids in the current file with split',
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
    assert_xpath: {
      'notindex.html': [
        // Empty URL points to start of the document, which is exactly what we want.
        // https://stackoverflow.com/questions/5637969/is-an-empty-href-valid
        "//x:div[@class='p']//x:a[@href='' and text()='notindex']",
        "//x:div[@class='p']//x:a[@href='#bb' and text()='bb']",
        "//x:blockquote//x:a[@href='#bb' and text()='Section \"bb\"']",
        // https://github.com/ourbigbook/ourbigbook/issues/94
        "//x:a[@href='#bb' and text()='bb to bb']",
        "//x:a[@href='#image-bb' and text()='image bb 1']",

        // Links to the split versions.
        xpath_header_split(1, 'notindex', 'notindex-split.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(2, 'bb', 'bb.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'notindex-split.html': [
        "//x:div[@class='p']//x:a[@href='notindex.html#bb' and text()='bb']",
        // https://github.com/ourbigbook/ourbigbook/issues/130
        "//x:blockquote//x:a[@href='notindex.html#bb' and text()='Section \"bb\"']",
        // Link to the split version.
        xpath_header_split(1, 'notindex', 'notindex.html', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Internal link inside split header.
        "//x:a[@href='notindex.html#image-bb' and text()='image bb 1']",
      ],
      'bb.html': [
        // Cross-page split-header parent link.
        xpath_header_parent(1, 'bb', 'notindex.html', 'Notindex'),
        "//x:a[@href='notindex.html' and text()='bb to notindex']",
        "//x:a[@href='notindex.html#bb' and text()='bb to bb']",
        // Link to the split version.
        xpath_header_split(1, 'bb', 'notindex.html#bb', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Internal link inside split header.
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
    },
    convert_opts: { split_headers: true },
    convert_before_norender: ['notindex.bigb', 'index.bigb'],
    filesystem: Object.assign({}, default_filesystem, {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'bb.png': ''
    }),
    input_path_noext: 'notindex',
  },
)
assert_lib_ast('x: full link to numbered header shows the number',
  `= Notindex

\\Q[\\x[bb]{full}]

== bb
`,
  undefined,
  {
    assert_xpath: {
      'notindex.html': [
        "//x:blockquote//x:a[@href='#bb' and text()='Section 1. \"bb\"']",
      ],
      'notindex-split.html': [
        "//x:blockquote//x:a[@href='notindex.html#bb' and text()='Section 1. \"bb\"']",
      ],
    },
    convert_opts: { split_headers: true },
    convert_before_norender: ['notindex.bigb', 'index.bigb'],
    filesystem: Object.assign({}, default_filesystem, {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'bb.png': '',
      'ourbigbook.json': '{ "h": { "numbered": true } }',
    }),
    input_path_noext: 'notindex',
  },
)
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
      'index.bigb': `= Toplevel

\\x[toplevel][toplevel to toplevel]

\\x[toplevel-h2][toplevel to toplevel h2]

\\Include[notindex]

== Toplevel h2

\\x[toplevel][toplevel h2 to toplevel]

\\x[toplevel-h2][toplevel h2 to toplevel h2]

=== Toplevel h3

\\x[toplevel][toplevel h3 to toplevel]

== Toplevel h2 2

\\x[toplevel-h2][toplevel h2 2 to toplevel h2]
`,
      'notindex.bigb': `= Notindex

\\x[toplevel][notindex to toplevel]

\\x[toplevel-h2][notindex to toplevel h2]

== Notindex h2

\\x[toplevel][notindex h2 to toplevel]

\\x[toplevel-h2][notindex h2 to toplevel h2]

=== Notindex h3

\\x[toplevel][notindex h3 to toplevel]
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to toplevel']",
        "//x:div[@class='p']//x:a[@href='toplevel-h2.html' and text()='notindex to toplevel h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='toplevel-h2.html' and text()='notindex h2 to toplevel h2']",
      ],
      'index.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel']",
        "//x:div[@class='p']//x:a[@href='#toplevel-h2' and text()='toplevel to toplevel h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='#toplevel-h2' and text()='toplevel h2 to toplevel h2']",

        // Links to the split versions.
        xpath_header_split(2, 'toplevel-h2', 'toplevel-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'toplevel-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='toplevel h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel h2 to toplevel h2']",
        xpath_header_split(1, 'toplevel-h2', 'index.html#toplevel-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'notindex-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='toplevel-h2.html' and text()='notindex h2 to toplevel h2']",
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    },
    assert_not_xpath: {
      'index.html': [
        // There is no split version of this header.
        xpath_header_split(1, '', undefined, ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'toplevel-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='index h3 to toplevel']",
      ],
      'notindex-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='notindex h3 to toplevel']",
      ],
    },
    assert_not_exists: [
      'split.html',
      'nosplit.html',
      'notindex-split.html',
      'notindex-nosplit.html',
    ],
  },
)
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
      'index.bigb': `= Toplevel

\\x[toplevel][toplevel to toplevel]

\\x[toplevel-h2][toplevel to toplevel h2]

\\Include[notindex]
\\Include[no-children]

== Toplevel h2

\\x[toplevel][toplevel h2 to toplevel]

\\x[toplevel-h2][toplevel h2 to toplevel h2]

=== Toplevel h3

\\x[toplevel][toplevel h3 to toplevel]

== Toplevel h2 2

\\x[toplevel-h2][toplevel h2 2 to toplevel h2]
`,
      'notindex.bigb': `= Notindex

\\x[toplevel][notindex to toplevel]

\\x[toplevel-h2][notindex to toplevel h2]

== Notindex h2

\\x[toplevel][notindex h2 to toplevel]

\\x[toplevel-h2][notindex h2 to toplevel h2]

=== Notindex h3

\\x[toplevel][notindex h3 to toplevel]
`,
      'no-children.bigb': `= No children
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#toplevel-h2' and text()='notindex to toplevel h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#toplevel-h2' and text()='notindex h2 to toplevel h2']",
      ],
      'index.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel']",
        "//x:div[@class='p']//x:a[@href='#toplevel-h2' and text()='toplevel to toplevel h2']",

        // This output is not split.
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='#toplevel-h2' and text()='toplevel h2 to toplevel h2']",

        // Links to the split versions.
        xpath_header_split(2, 'toplevel-h2', 'toplevel-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'toplevel-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='toplevel h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#toplevel-h2' and text()='toplevel h2 to toplevel h2']",
        // https://github.com/ourbigbook/ourbigbook/issues/271
        xpath_header_split(1, 'toplevel-h2', 'index.html#toplevel-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'notindex-h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='notindex h2 to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#toplevel-h2' and text()='notindex h2 to toplevel h2']",
        // https://github.com/ourbigbook/ourbigbook/issues/271
        xpath_header_split(1, 'notindex-h2', 'notindex.html#notindex-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
    },
    assert_not_xpath: {
      'index.html': [
        // There is no split version of this header.
        xpath_header_split(1, '', undefined, ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'no-children.html': [
        // There is no split version of this header.
        xpath_header_split(1, 'no-children', undefined, ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(1, 'no-children', undefined, ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'toplevel-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='index h3 to toplevel']",
      ],
      'notindex-h2.html': [
        // This output is split.
        "//x:div[@class='p']//x:a[text()='notindex h3 to toplevel']",
      ],
    },
    assert_not_exists: [
      'split.html',
      'nosplit.html',
      'notindex-split.html',
      'notindex-nosplit.html',
    ],
  },
)
assert_lib(
  'x: header splitDefault argument',
  // https://github.com/ourbigbook/ourbigbook/issues/131
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel
{splitDefault}

\\x[][toplevel to toplevel empty]

\\x[toplevel][toplevel to toplevel synonym]

\\x[image-my-image-toplevel][toplevel to my image toplevel]

\\x[h2][toplevel to h2]

\\x[image-my-image-h2][toplevel to my image h2]

\\x[notindex][toplevel to notindex]

\\x[notindex-h2][toplevel to notindex h2]

\\Image[img.jpg]{title=My image toplevel}

\\Include[notindex]

== H2

\\x[][h2 to toplevel empty]

\\x[toplevel][h2 to toplevel synonym]

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
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel empty']",
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel synonym']",
        "//x:div[@class='p']//x:a[@href='h2.html' and text()='toplevel to h2']",
        // That one is nosplit by default.
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='toplevel to notindex']",
        // A child of a nosplit also becomes nosplit by default.
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='toplevel to notindex h2']",

        // The toplevel split header does not get a numerical prefix.
        xpath_header(1, '', "x:a[@href='' and text()='Toplevel']"),

        // Images.
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='toplevel to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='h2.html#image-my-image-h2' and text()='toplevel to my image h2']",

        // Split/nosplit.
        xpath_header_split(1, '', 'nosplit.html', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      'nosplit.html': [
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel empty']",
        // Although h2 is split by default, it is already rendered in the current page,
        // so just link to the current page render instead.
        "//x:div[@class='p']//x:a[@href='#h2' and text()='toplevel to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='toplevel to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='toplevel to notindex h2']",

        "//x:div[@class='p']//x:a[@href='' and text()='h2 to toplevel empty']",
        "//x:div[@class='p']//x:a[@href='' and text()='h2 to toplevel synonym']",
        "//x:div[@class='p']//x:a[@href='#h2' and text()='h2 to h2']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='h2 to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='h2 to notindex h2']",

        // Images.
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='toplevel to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-h2' and text()='toplevel to my image h2']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-toplevel' and text()='h2 to my image toplevel']",
        "//x:div[@class='p']//x:a[@href='#image-my-image-h2' and text()='h2 to my image h2']",

        // Headers.
        xpath_header(1, '', "x:a[@href='index.html' and text()='Toplevel']"),
        xpath_header(2, 'h2', "x:a[@href='h2.html' and text()='H2']"),

        // Spilt/nosplit.
        xpath_header_split(1, '', 'index.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      'h2.html': [
        "//x:div[@class='p']//x:a[@href='index.html' and text()='h2 to toplevel empty']",
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
        xpath_header(2, 'notindex-h2', "x:a[@href='notindex-h2.html' and text()='Notindex h2']"),

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
)
assert_lib('x: internal link to non-included image in another file',
  // https://github.com/ourbigbook/ourbigbook/issues/199
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
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
)
assert_lib_ast('x: internal link with link inside it does not blow up',
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
)
assert_lib('x: to image in another file that has x title in another file',
  // https://github.com/ourbigbook/ourbigbook/issues/198
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[tmp]
\\Include[tmp2]
`,
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
)
// TODO
//it('outputPathBase', () => {
//  function assert(args, dirname, basename) {
//    args.path_sep = '/'
//    if (args.ast_undefined === undefined ) { args.ast_undefined = false }
//    const ret = ourbigbook.outputPathBase(args)
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
//  //    'index.bigb',
//  //    'index',
//  //    context,
//  //  ),
//  //  ['', 'index']
//  //);
//});
// Internal links \x
// https://github.com/ourbigbook/ourbigbook/issues/213
assert_lib_ast('x: internal link magic simple sane',
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
)
assert_lib_ast('x: internal link magic simple shorthand',
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
)
assert_lib_ast('x: internal link magic in title',
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
)
assert_lib_ast('x: internal link magic shorthand escape',
  `a\\<>b`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p' and text()='a<>b']",
    ],
  }
)
assert_lib_ast('x: internal link magic with full uses full content',
  `= Notindex

== My header

\\x[My headers]{magic}{full}
`,
  undefined,
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='#my-header' and text()='Section \"My header\"']",
    ],
  }
)
assert_lib('x: internal link magic cross file plural resolution',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
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
)
assert_lib('x: tuberculosis hysteresis bug',
  // https://github.com/plurals/pluralize/issues/172
  {
    filesystem: {
      'index.bigb': `= Toplevel

<Hysteresis>{id=x1}

<Hysteresis>{c}{id=x2}

== Hysteresis
`,
    },
    convert_dir: true,
    assert_xpath: {
      'index.html': [
        "//x:a[@id='x1' and text()='Hysteresis']",
        "//x:a[@id='x2' and text()='Hysteresis']",
      ]
    },
  }
)
assert_lib('x: internal link magic detects capitalization and plural on output',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
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
)
assert_lib_ast('x: internal link magic shorthand to scope',
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
)
assert_lib_ast('x: internal link magic shorthand to header file argument',
  `= Notindex

<path/to/my_file.jpg>{file}

== path/to/my_file.jpg
{file}
`,
  undefined,
  {
    assert_xpath_stdout: [
      `//x:div[@class='p']//x:a[@href='#${ourbigbook.FILE_PREFIX}/path/to/my_file.jpg' and text()='path/to/my_file.jpg']`,
    ],
    filesystem: {
      'path/to/my_file.jpg': '',
    },
  }
)
assert_lib_ast('x: topic link: basic shorthand',
  `a #Dogs b\n`,
  [
    a('P', [
      t('a '),
      a('x', undefined, {
        href: [t('Dogs')],
        topic: [],
      }),
      t(' b'),
    ]),
  ],
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/dog' and text()='Dogs']",
    ]
  },
)
assert_lib_ast('x: topic link: at start of document does not blow up',
  `#Dog\n`,
  [
    a('P', [
      a('x', undefined, {
        href: [t('Dog')],
        topic: [],
      }),
    ]),
  ],
  {
    assert_xpath_stdout: [
      "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/dog' and text()='Dog']",
    ]
  },
)
assert_lib_ast('x: topic link: shorthand escape',
  'a \\#Dogs b\n',
  [
    a('P', [
      t('a #Dogs b'),
    ]),
  ],
)
assert_lib('x: topic link: sane',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= tmp

\\x[Sane Link]{topic}

\\x[Sane Link With Content][My Content]{topic}

\\x[Many Dogs]{topic}

\\x[Many Cats]{topic}{p=1}

<#Shorthand Link>
`
    },
    assert_xpath: {
      'index.html': [
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/sane-link' and text()='Sane Link']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/sane-link-with-content' and text()='My Content']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/shorthand-link' and text()='Shorthand Link']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/many-dog' and text()='Many Dogs']",
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/go/topic/many-cats' and text()='Many Cats']",
      ],
    },
  },
)
assert_lib_ast('x: internal link c simple',
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
assert_lib_ast('x: internal link p simple',
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
assert_lib_ast('x: internal link c ignores non plaintext first argument',
  // Maybe we should go deep into the first argument tree. But let's KISS for now.
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
assert_lib_ast('x: internal link p ignores non plaintext last argument',
  // Maybe we should go deep into the last argument tree. But let's KISS for now.
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
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
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
)
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
      'index.bigb': `= Toplevel

<Toplevel>[toplevel to toplevel]

<Toplevel 2>[toplevel to toplevel 2]

<Notindex>[toplevel to notindex]

<Notindex 2>[toplevel to notindex 2]

\\Include[notindex]
\\Include[subdir/notindex]
\\Include[subdir/notindex2]
\\Include[subdir/subdir2/notindex]

== Toplevel 2
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
        "//x:div[@class='p']//x:a[@href='' and text()='toplevel to toplevel']",
        "//x:div[@class='p']//x:a[@href='#toplevel-2' and text()='toplevel to toplevel 2']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html' and text()='toplevel to notindex']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html#notindex-2' and text()='toplevel to notindex 2']",
      ],
      'split.html': [
        "//x:div[@class='p']//x:a[@href='asdf/index.html#toplevel-2' and text()='toplevel to toplevel 2']",
        "//x:div[@class='p']//x:a[@href='asdf/notindex.html#notindex-2' and text()='toplevel to notindex 2']",
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
)
assert_lib(
  'x: directory name is removed from link to subdir h2',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[subdir/subdir-index-h2][link to subdir index h2]

\\Include[subdir]
`,
      'ourbigbook.json': `{}\n`,
      'subdir/index.bigb': `= Subdir index

== Subdir index h2
`,
    },
    assert_xpath: {
      'index.html': [
        xpath_header(1, ''),
        "//x:a[@href='subdir.html#subdir-index-h2' and text()='link to subdir index h2']",
      ]
    },
  }
)

// Infinite recursion.
// failing https://github.com/ourbigbook/ourbigbook/issues/34
assert_lib_error('x: internal link from header title to following header is not allowed',
  `= \\x[h2] aa

== h2
`, 1, 3);
assert_lib_error('x: internal link from header title to previous header is not allowed',
  `= h1

== \\x[h1] aa
`, 3, 4);
assert_lib('x: internal link from image title to previous non-header without content is not allowed',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Image[ab]{title=cd}{external}

\\Image[ef]{title=gh \\x[image-cd]}{external}
`,
    },
    convert_dir: true,
    assert_check_db_errors: 1,
  }
)
//// TODO https://docs.ourbigbook.com/todo/image-title-with-x-to-image-with-content-incorrectly-disallowed
//assert_lib(
//  'x: internal link from image title to previous non-header with content is allowed',
//  {
//    convert_dir: true,
//    filesystem: {
//      'index.bigb': `= Toplevel
//
//\\Image[ab]{title=cd}{external}
//
//\\Image[ef]{title=gh \\x[image-cd][asdf]}{external}
//`,
//    },
//    assert_xpath: {
//      'index.html': [
//        `//x:figure[@id='image-gh-asdf']`,
//      ],
//    },
//  }
//);
//assert_lib(
//  'x: internal link from image title to previous non-header with id is allowed',
//  {
//    convert_dir: true,
//    filesystem: {
//      'index.bigb': `= Toplevel
//
//\\Image[ab]{title=cd}{external}
//
//\\Image[ef]{title=gh \\x[image-cd]}{id=image-gh-asdf}{external}
//`,
//    },
//    assert_xpath: {
//      'index.html': [
//        `//x:figure[@id='image-gh-asdf']`,
//      ],
//    },
//  }
//);
assert_lib('x: internal link from image title to following non-header is not allowed',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Image[ef]{title=gh \\x[image-cd]}{external}

\\Image[ab]{title=cd}{external}
`,
    },
    convert_dir: true,
    assert_check_db_errors: 1,
  }
)
assert_lib_error('x: internal link infinite recursion with explicit IDs fails gracefully',
  `= \\x[h2]
{id=h1}

== \\x[h1]
{id=h2}
`, 1, 3);
assert_lib_error('x: internal link infinite recursion to self IDs fails gracefully',
  `= \\x[tmp]
`, 1, 3, 'tmp.bigb',
  {
    input_path_noext: 'tmp',
    // TODO https://github.com/ourbigbook/ourbigbook/issues/342
    convert_opts: { ourbigbook_json: { lint: { filesAreIncluded: false } } },
  }
)
assert_lib_ast('x: internal link from image to previous header with x content without image ID works',
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
)
assert_lib_ast('x: internal link from image to previous header without x content with image ID works',
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
)
assert_lib_ast('x: internal link from image to previous header without x content without image ID works',
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
)
assert_lib_ast('x: internal link from image to following header without x content without image id works',
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
)
assert_lib_error('x: internal link with parent to undefined ID does not throw',
  `= aa

\\x[bb]{parent}
`,
  3, 3, undefined,
  { convert_opts: { ourbigbook_json: { enableArg: { 'x': { 'parent': true } } } } },
)

// Scope.
assert_lib_stdin("scope: internal links work with header scope and don't throw",
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
)
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
)
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
)
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
)
assert_lib_ast('scope: nested internal link resolves progressively',
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
)
// https://github.com/ourbigbook/ourbigbook/issues/100
assert_lib_error('scope: broken parent still generates a header ID',
  `= h1

\\x[h2]

= h2
{parent=reserved-undefined}

`, 6, 1
)
assert_lib_ast('scope: internal link to toplevel scoped split header',
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
    assert_xpath: {
      'notindex.html': [
        "//x:a[@href='#image-bb' and text()='bb to image bb']",
      ],
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
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'bb.png': ''
    },
  },
)
assert_lib_ast('scope: internal link to non-toplevel scoped split header',
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
    convert_before_norender: ['index.bigb', 'tmp.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[tmp]
`,
    }
  },
)
// https://docs.ourbigbook.com#header-scope-argument-of-toplevel-headers
assert_lib_ast('scope: internal link to non-included file with toplevel scope',
  `= Notindex

\\x[toplevel-scope]

\\x[toplevel-scope/h2]

\\x[toplevel-scope/image-h1][image h1]

\\x[toplevel-scope/image-h2][image h2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Notindex')]}),
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
    convert_before_norender: ['index.bigb', 'notindex.bigb', 'toplevel-scope.bigb'],
    input_path_noext: 'notindex',
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[toplevel-scope]
`,
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
)
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
)
assert_lib(
  'scope: scope of toplevel header shows up on h1 render and on page title',
  {
    convert_opts: {
      body_only: false,
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

== Scope 1
{scope}

=== No scope 1

==== Scope 2
{scope}

===== No scope 2
`,
    },
    assert_xpath: {
      'scope-1/scope-2/no-scope-2.html': [
        "//x:h1//x:a[@href='../../index.html#scope-1' and text()='Scope 1']",
        "//x:h1//x:a[@href='../../index.html#scope-1/scope-2' and text()='Scope 2']",
        "//x:h1//x:a[@href='' and text()='No scope 2']",
        "//x:head//x:title[text()='Scope 1 / Scope 2 / No scope 2']",
      ],
    },
  }
)
assert_lib(
  'incoming links: internal link incoming links and other children simple',
  {
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { enableArg: {
        'H': { 'child': true },
        'x': { 'child': true },
      } },
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[]

\\x[h2]

\\x[notindex]

\\x[h2-2]{child}

\\x[scope/scope-1]

\\Include[notindex]

== h2
{child=h2-3}
{child=h2-4}
{child=notindex-h2-2}

\\x[]

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

\\x[]

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
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
        // Check that incoming links are capitalized, e.g. here to "H2 2".
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']` +
          `//x:a[@href='#h2' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1' and text()='H2']`,
        // https://github.com/ourbigbook/ourbigbook/issues/155
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='2']`,
        // Check that tagged are capitalized, e.g. here to "H2 2".
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='#h2-2' and text()='H2 2']`,
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
)
assert_lib(
  'incoming links: tagged not at toplevel',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

== h2 1

\\Include[notindex]

== h2 2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
{tag=h2 1}
{tag=h2 2}

== Notindex h2 2
{tag=h2 1}
{tag=}
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:a[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged-not-toplevel_h2-1_notindex-h2' and text()='Notindex h2']`,
        `//x:a[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged-not-toplevel_h2-1_notindex-h2-2']`,
        `//x:a[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged-not-toplevel_h2-2_notindex-h2']`,
      ],
    },
    assert_not_xpath: {
      'index.html': [
        `//x:a[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged-not-toplevel__notindex-h2-2']`,
      ],
    },
  }
)
assert_lib(
  'incoming links: internal link incoming links from other file min notindex to index',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

\\x[]
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
  }
)
//assert_lib(
//  // TODO https://docs.ourbigbook.com/incoming-links-and-tagged-metadata-does-not-show-synonyms
//  'incoming links: links to synonyms show up on the list as incoming links',
//  {
//    convert_opts: {
//      split_headers: true,
//    },
//    convert_dir: true,
//    filesystem: {
//      'index.bigb': `= Toplevel
//
//== Toplevel 2
//
//= Toplevel 2 synonym
//{synonym}
//`,
//      'notindex.bigb': `= Notindex
//
//== Notindex 2
//
//\\x[toplevel-2-synonym]
//`,
//    },
//    assert_xpath: {
//      'toplevel-2.html': [
//        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#notindex-2']`,
//      ],
//    },
//  }
//)
assert_lib(
  'incoming links: internal link incoming links from other file min toplevel to notindex',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[notindex]

\\Include[notindex]
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
)
assert_lib(
  // We can have confusion between singular and plural here unless proper resolution is done.
  'incoming links: internal link incoming links and other children with magic',
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

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
)
assert_lib(
  'incoming links: from another source file to split header simple',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

== Dog

\\Include[notindex]
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
)
assert_lib(
  'incoming links: from subdir without direct link to it resolves correctly',
  // Hit a bug where the incoming link was resolving wrongly to subdir/notindex.html#subdir/to-dog
  // because the File was not being fetched from DB. Adding an explicit link from "Dog" to "To dog"
  // would then fix it as it fetched the File.
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]

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
)
assert_lib('x leading slash to escape scopes works across files',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[/notindex]

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
    },
  }
)
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
//      'index.bigb': `= Toplevel
//
//== Toplevel scope
//{scope}
//
//\\Include[notindex]
//
//== Toplevel scope 2
//{scope}
//
//\\x[notindex-h2][toplevel scope 2 to notindex h2]`,
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
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]
\\Include[subdir/notindex2]
\\Include[subdir/subdir/notindex]
`,
      'subdir/notindex.bigb': `= Notindex

\\x[notindex2][toplevel to notindex2]

\\x[notindex2-h2][toplevel to notindex2 h2]

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
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-h2' and text()='toplevel to notindex2 h2']",
        "//x:div[@id='notindex-h2']//x:span[@class='tags']//x:a[@href='notindex2.html' and text()='Notindex2']",
        "//x:div[@id='notindex-h2']//x:span[@class='tags']//x:a[@href='notindex2.html#notindex2-h2']",
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
)
assert_lib('scope: hierarchy resolution works across files with directories and magic plural',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]
\\Include[subdir/notindex2]
`,
      'subdir/notindex.bigb': `= Notindex

\\x[dogs]{magic}
`,
     'subdir/notindex2.bigb': `= Notindex2

== Dog
`,
    },
  }
)
assert_lib('scope: link from non subdir scope to subdir scope works',
  // https://github.com/ourbigbook/ourbigbook/issues/284
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex/notindex2]
`,
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
)
assert_lib('x: ref_prefix gets appended to absolute targets',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ref_prefix: 'subdir',
    },
    filesystem: {
      'subdir/index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
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
)
assert_lib(
  'x: link to image in another file after link to the toplevel header of that file does not blow up',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Image[img.jpg]{title=My image toplevel}

\\Include[notindex]
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
      'index.bigb': `= tmp

<tmp 2>[toplevel to tmp 2]

== tmp 2
`
    },
    assert_xpath: {
      'split.html': [
        "//x:div[@class='p']//x:a[@href='index.html#tmp-2' and text()='toplevel to tmp 2']",
      ],
    },
    convert_opts: { split_headers: true },
  },
)
assert_lib('x: redirect from cirosantilli.com to ourbigbook.com',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= tmp

<tmp 2>[tmp to tmp 2]

<tmp2>[tmp to tmp2]

<tmp2 2>[tmp to tmp2 2]

\\Include[tmp2]

== tmp 2
`,
      'tmp2.bigb': `= tmp2

== tmp2 2
`,
    },
    convert_opts: {
      htmlXExtension: false,
      split_headers: true,
      ourbigbook_json: {
        toSplitHeaders: true,
        xPrefix: 'https://ourbigbook.com/cirosantilli/',
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
)
assert_lib('x: disambiguate shows in ancestors',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

== With dis
{disambiguate=mydis}

=== Without dis
`,
    },
    assert_xpath: {
      [`without-dis.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']` +
          `//x:a[@href='index.html#with-dis-mydis' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0' and text()='With dis (mydis)']`
        ,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']` +
          `//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1']`,
      ],
    },
  }
)
assert_lib('x: disambiguate shows in incoming links',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

== With dis
{disambiguate=mydis}

<without dis>

=== Without dis
`,
    },
    assert_xpath: {
      [`without-dis.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']` +
          `//x:a[@href='index.html#with-dis-mydis' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0' and text()='With dis (mydis)']`
        ,
      ],
    },
  }
)
assert_lib('x: disambiguate shows in breadcrumb',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

== With dis
{disambiguate=mydis}

<without dis>

=== Without dis
`,
    },
    assert_xpath: {
      [`without-dis.html`]: [
        `//x:div[@class='h top']` +
          `//x:div[@class='nav ancestors']` +
          `//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`
        ,
        `//x:div[@class='h top']` +
          `//x:div[@class='nav ancestors']` +
          `//x:a[@href='index.html#with-dis-mydis' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1' and text()=' With dis (mydis)']`
        ,
      ],
    },
  }
)
assert_lib(`x: disambiguate shows in {full} links but title2 doesn't`,
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

<With dis (My dis)>{id=dut}{full}

== With dis
{disambiguate=My dis}
{title2=My Title 2}
`,
    },
    assert_xpath: {
      [`index.html`]: [
        `//x:a[@id='dut' and text()='Section "With dis (My dis)"']`
      ],
    },
  }
)

// Subdir.
assert_lib('header: subdir argument basic',
  // This was introduced to handle Web uploads without path: API parameter.
  // But in the end for some reason we ended up sticking with the path parameter to start with.
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

\\x[asdf/qwer/notindex2][notindex to notindex2]

\\x[asdf/qwer/notindex2-2][notindex to notindex2 2]
`,
      'notindex2.bigb': `= Notindex2
{subdir=asdf/qwer}

== Notindex2 2
`,
      // TODO get rid of this.
      // Includes to subdir headers don't work obviously:
      //  \\Include[asdf/qwer/notindex2]
      // fails with:
      // error: notindex.bigb:7:1: could not find include: "asdf/qwer/notindex2"
      'ourbigbook.json': '{ "lint": { "filesAreIncluded": false } }',
    },
    assert_xpath: {
      'notindex.html': [
        "//x:div[@class='p']//x:a[@href='notindex2.html' and text()='notindex to notindex2']",
        "//x:div[@class='p']//x:a[@href='notindex2.html#notindex2-2' and text()='notindex to notindex2 2']",
      ]
    },
  }
)

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
      xpath_header(2, 'my-header-2', "x:a[@href='my-header-2.html' and text()='My header 2']"),
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
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
  },
)
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
)
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
)
assert_lib_ast('header: 7 shorthand',
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
)
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
)
assert_lib_ast('header: parent does title to ID conversion',
  `= 1

= a b%c \`d\`
{parent=1}

= 3
{parent=a b%c \`d\`}
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('1')]}),
    a(
      'H',
      undefined,
      {
        level: [t('2')],
        title: [
          t('a b%c '),
          a('c', [t('d')]),
        ],
      },
      {
        id: 'a-b-percent-c-d'
      }
    ),
    a('H', undefined, {level: [t('3')], title: [t('3')]}),
  ],
)
assert_lib_error('header: with parent argument must have level equal 1',
  `= 1

== 2
{parent=1}
`,
  3, 1
)
assert_lib_error('header: parent cannot be an older id of a level',
  `= 1

== 2

== 2 2

= 3
{parent=2}
`,
  8, 1
)
assert_lib_error('header: header inside parent',
  `= 1

= 2
{parent=1

== 3
}
`,
  6, 1, undefined,
  {
    error_message: 'headers (\\H) must be directly at document toplevel, not as children of other elements. Parent was instead: \\H'
  }
)
assert_lib_error('header: implicit line break inside parent',
  `= ab cd

= 2
{parent=ab
cd}
`,
  5, 1, undefined,
  {
    error_message: 'cannot place \\br inside of \\H'
  }
)
assert_lib_error('header: child argument to id that does not exist gives an error',
  `= 1
{child=2}
{child=3}

== 2
`,
  3, 1, undefined,
  { convert_opts: { ourbigbook_json: { enableArg: { 'H': { 'child': true } } } } },
)
assert_lib_error('header: tag argument to id that does not exist gives an error',
  `= 1
{tag=2}
{tag=3}

== 2
`,
  3, 1
)
assert_lib('header: tag and child argument does title to ID conversion',
  {
    convert_dir: true,
    convert_opts: { ourbigbook_json: { enableArg: { 'H': { 'child': true } } } },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= 1

== a b%c \`d\`
{child=d e%f}

== 3
{tag=a b%c \`d\`}

== d e%f
`,
    },
  }
)
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
)
assert_lib_error('header: tag and synonym arguments are incompatible',
  `= 1

= 1 2
{synonym}
{tag=2}

== 2
`,
  5, 1
)
assert_lib_error('header: synonym without preceeding header fails gracefully',
  `asdf

= qwer
{synonym}
`,
  4, 1
)
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
      "//x:blockquote//x:a[@href='#1-2' and text()='Section \"1 3\"']",
    ],
  }
)
assert_lib_ast('header: title2 shows next to title',
  `= Asdf
{title2=qwer}
{title2=zxcv}
`,
  undefined,
  {
    assert_xpath_stdout: [
      xpath_header(1, 'asdf', "x:a[@href='' and text()='Asdf ']//x:span[text()='(qwer, zxcv)']"),
    ],
  }
)
assert_lib_error('header: title2 of synonym must be empty',
  `= 1

= 1 2
{synonym}
{title2=asdf}
`,
  // 5, 9 would be better, pointing to the start of asdf
  5, 1
)
assert_lib_error('header: title2 of synonym cannot be given multiple times',
  `= 1

= 1 2
{synonym}
{title2}
{title2}
`,
  // 6, 1 would be better, pointing to second title2
  5, 1
)
assert_lib('header: synonym basic',
  // https://github.com/ourbigbook/ourbigbook/issues/114
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

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
)
assert_lib('header: synonym in splitDefault',
  // https://github.com/ourbigbook/ourbigbook/issues/225
  {
    convert_opts: {
      split_headers: true,
    },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel
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
)
assert_lib('header: link to synonym toplevel does not have fragment',
  // https://docs.ourbigbook.com/todo/links-to-synonym-header-have-fragment
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

<notindex>

<notindex 2>

\\Include[notindex]
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
)
const header_id_new_line_expect =
  [a('H', undefined, {level: [t('1')], title: [t('aa')], id: [t('bb')]})];
assert_lib_ast('header id new line sane',
  '\\H[1][aa]\n{id=bb}',
  header_id_new_line_expect,
)
assert_lib_ast('header id new line shorthand no trailing elment',
  '= aa\n{id=bb}',
  header_id_new_line_expect,
)
assert_lib_ast('header id new line shorthand trailing element',
  '= aa \\c[bb]\n{id=cc}',
  [a('H', undefined, {
      level: [t('1')],
      title: [
        t('aa '),
        a('c', [t('bb')]),
      ],
      id: [t('cc')],
  })],
)
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
      'index.bigb': header_numbered_input,
      'ourbigbook.json': '{ "h": { "numbered": true } }',
    },
    assert_xpath: {
      'index.html': [
        "//x:blockquote//x:a[@href='#tmp-2' and text()='Section 1. \"tmp 2\"']",
        "//x:blockquote//x:a[@href='#tmp-4' and text()='Section \"tmp 4\"']",
        "//x:blockquote//x:a[@href='#tmp-8' and text()='Section 1.1. \"tmp 8\"']",
        "//*[@id='_toc']//x:a[@href='#tmp-2' and text()='tmp 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-2']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-3' and text()='tmp 3']",
        "//*[@id='_toc']//x:a[@href='#tmp-3']//x:i[@class='n' and text()='1.1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-4' and text()='tmp 4']",
        "//*[@id='_toc']//x:a[@href='#tmp-5' and text()='tmp 5']",
        "//*[@id='_toc']//x:a[@href='#tmp-6' and text()='tmp 6']",
        "//*[@id='_toc']//x:a[@href='#tmp-7' and text()='tmp 7']",
        "//*[@id='_toc']//x:a[@href='#tmp-7']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-8' and text()='tmp 8']",
        "//*[@id='_toc']//x:a[@href='#tmp-8']//x:i[@class='n' and text()='1.1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2' and text()='tmp 2 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2']//x:i[@class='n' and text()='2. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3' and text()='tmp 2 2 3']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3']//x:i[@class='n' and text()='2.1. ']",
      ],
      'tmp-6.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-7' and text()='tmp 7']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-7']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='tmp 8']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8']//x:i[@class='n' and text()='1.1. ']",
      ],
      'tmp-7.html': [
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='tmp 8']",
        "//*[@id='_toc']//x:a[@href='index.html#tmp-8']//x:i[@class='n' and text()='1. ']",
      ],
    },
    assert_not_xpath: {
      'index.html': [
        "//*[@id='_toc']//x:a[@href='#tmp-4']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-5']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-6']//x:i[@class='n']",
      ]
    },
    convert_opts: { split_headers: true },
  },
)
assert_lib('header: numbered ourbigbook.json',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': header_numbered_input,
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
        "//*[@id='_toc']//x:a[@href='#tmp-7' and text()='tmp 7']",
        "//*[@id='_toc']//x:a[@href='#tmp-7']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-8' and text()='tmp 8']",
        "//*[@id='_toc']//x:a[@href='#tmp-8']//x:i[@class='n' and text()='1.1. ']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2' and text()='tmp 2 2']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3' and text()='tmp 2 2 3']",
      ],
      'tmp-6.html': [
        //"//*[@id='_toc']//x:a[@href='index.html#tmp-7' and text()='1. tmp 7']",
        //"//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1.1. tmp 8']",
      ],
      'tmp-7.html': [
        //"//*[@id='_toc']//x:a[@href='index.html#tmp-8' and text()='1. tmp 8']",
      ],
    },
    assert_not_xpath: {
      'index.html': [
        "//*[@id='_toc']//x:a[@href='#tmp-2']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-3']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-4']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-5']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-6']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#tmp-2-2-3']//x:i[@class='n']",
      ],
    },
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    }
  },
)
assert_lib('header: splitDefault on ourbigbook.json',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { splitDefault: true } }
    },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`
    },
    assert_xpath: {
      'index.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex-h2.html' and text()='Notindex h2']",
      ],
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex-h2.html' and text()='Notindex h2']",
      ],
    },
  },
)
assert_lib('header: file argument works',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= Toplevel

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
      'path/to/my-file.txt': `My Line 1

My Line 2
`,
      'path/to/my-file.png': '',
      'path/to/my-file.mp4': '',
    },
    assert_xpath: {
      'index.html': [
        `//x:a[@href='_dir/path/index.html' and text()='path' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to__path']`,
        `//x:a[@href='_dir/path/to/index.html' and text()='to' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to__path/to']`,
        "//x:div[@class='p' and text()='My directory']",

        "//x:a[@href='_raw/path/to/my-file.txt' and text()='my-file.txt']",
        "//x:div[@class='p' and text()='My txt']",
        // Don't know how to include newlines in xPath!
        "//x:code[starts-with(text(), 'My Line 1')]",
        `//x:a[@href='_dir/path/index.html' and text()='path' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to/my-file.txt__path']`,
        `//x:a[@href='_dir/path/to/index.html' and text()='to' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to/my-file.txt__path/to']`,

        "//x:a[@href='_raw/path/to/my-file.png' and text()='my-file.png']",
        "//x:img[@src='_raw/path/to/my-file.png']",
        "//x:div[@class='p' and text()='My png']",

        "//x:a[@href='_raw/path/to/my-file.mp4' and text()='my-file.mp4']",
        "//x:video[@src='_raw/path/to/my-file.mp4']",
        "//x:div[@class='p' and text()='My mp4']",

        "//x:a[@href='https://www.youtube.com/watch?v=YeFzeNAHEhU' and text()='www.youtube.com/watch?v=YeFzeNAHEhU']",
        "//x:iframe[@src='https://www.youtube.com/embed/YeFzeNAHEhU']",
        "//x:div[@class='p' and text()='My youtube']",
      ]
    },
  },
)
assert_lib('header: file argument that is the last header adds the preview',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= h1

== path/to/my-file.png
{file}
`,
      'path/to/my-file.png': '',
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@href='_raw/path/to/my-file.png' and text()='my-file.png']",
        "//x:img[@src='_raw/path/to/my-file.png']",
      ]
    }
  },
)
assert_lib('header: file argument ignores text files on nosplit if they are too large',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= Toplevel

== small.txt
{file}

== big.txt
{file}
`,
      'small.txt': 'aaaa',
      'big.txt': 'b'.repeat(ourbigbook.FILE_PREVIEW_MAX_SIZE + 1),
    },
    assert_xpath: {
      'index.html': [
        `//x:pre//x:code[text()='aaaa']`,
      ],
      [`${ourbigbook.FILE_PREFIX}/small.txt.html`]: [
        `//x:pre//x:code[text()='aaaa']`,
      ],
      [`${ourbigbook.FILE_PREFIX}/big.txt.html`]: [
        // Always show on split headers however.
        `//x:pre//x:code[starts-with(text(), 'bbbb')]`,
      ],
    },
    assert_not_xpath: {
      'index.html': [
        `//x:pre//x:code[starts-with(text(), 'bbbb')]`,
      ],
    }
  },
)
assert_lib('header: file argument in subdir',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[path/to/notindex]
`,
      'path/to/notindex.bigb': `= notindex

<my-file.txt>{file}

== my-file.txt
{file}
`,
      'path/to/my-file.txt': `My Line 1

My Line 2
`,
    },
    assert_xpath: {
      [`path/to/notindex.html`]: [
        `//x:div[@class='p']//x:a[@href='#${ourbigbook.FILE_PREFIX}/my-file.txt' and text()='path/to/my-file.txt']`,
        // Maybe ID should be full path for _file. It's 3AM and I don't have the brains for this kind of stuff now.
        xpath_header(2, `${ourbigbook.FILE_PREFIX}/my-file.txt`, `x:a[@href='#${ourbigbook.FILE_PREFIX}/my-file.txt' and text()='path/to/my-file.txt']`),
      ],
    }
  },
)
assert_lib('header: file argument in _file directory toplevel header',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

<path/to/my-file.txt>{file}{id=toplevel-to-txt}

\\Include[_file/path/to/my-file.txt]
\\Include[_file/path/to/my-file.png]
`,
      [`${ourbigbook.FILE_PREFIX}/path/to/my-file.txt.bigb`]: `= my-file.txt
{file}

My txt.
`,
      [`${ourbigbook.FILE_PREFIX}/path/to/my-file.png.bigb`]: `= my-file.png
{file}

My png txt.
`,
      'path/to/my-file.txt': `My Line 1

My Line 2
`,
      'path/to/my-file.png': `aaaa`,
    },
    assert_xpath: {
      [`index.html`]: [
        // TODO text() should show path/to/my-file.txt. Maybe this could likely be factored out with
        // the existing header handling code that adds full path to h1.
        `//x:a[@id='toplevel-to-txt' and @href='${ourbigbook.FILE_PREFIX}/path/to/my-file.txt.html' and text()='my-file.txt']`,
      ],
      [`${ourbigbook.FILE_PREFIX}/path/to/my-file.txt.html`]: [
        "//x:a[@href='../../../_raw/path/to/my-file.txt' and text()='my-file.txt']",
        // We actually get the full path always on the title of a {file} header.
        "//x:h1//x:a[text()='path/to/my-file.txt']",
        "//x:div[@class='p' and text()='My txt.']",
        // Don't know how to include newlines in xPath!
        "//x:code[starts-with(text(), 'My Line 1')]",
        `//x:a[@href='../../../${ourbigbook.DIR_PREFIX}/index.html' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
        `//x:a[@href='../../../${ourbigbook.DIR_PREFIX}/path/index.html' and text()='path' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to/my-file.txt__path']`,
        `//x:a[@href='../../../${ourbigbook.DIR_PREFIX}/path/to/index.html' and text()='to' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/path/to/my-file.txt__path/to']`,
      ],
      [`${ourbigbook.FILE_PREFIX}/path/to/my-file.png.html`]: [
        "//x:img[@src='../../../_raw/path/to/my-file.png']",
      ],
    }
  },
)
assert_lib_error('header: file argument to a toplevel file that does not exist fails gracefully',
  `= h1

== dont-exist
{file}
`, 3, 1);
assert_lib_ast('header: escape shorthand header at start of document',
  '\\= a',
  [a('P', [t('= a')])],
)
assert_lib('header: toplevel argument',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= Toplevel

<h 1>[toplevel to h 1]

<h 1 1>[toplevel to h 1 1]

<h 1 1 1>[toplevel to h 1 1 1]

<image 1 1 1>[toplevel to image 1 1 1]

<h 1 1 1 1>[toplevel to h 1 1 1 1]

<h 1 1 1 1 1>[toplevel to h 1 1 1 1 1]

<h 1 1 1 1 1 1>[toplevel to h 1 1 1 1 1 1]

<h 2>[toplevel to h 2]

<h 2/h 2 1>[toplevel to h 2 1]

<h 2/h 2 1 1>[toplevel to h 2 1 1]

<h 2/h 2 1 1 1>[toplevel to h 2 1 1 1]

<notindex>[toplevel to notindex]

<notindex 1>[toplevel to notindex 1]

<notindex 1 1>[toplevel to notindex 1 1]

<notindex 1 1 1>[toplevel to notindex 1 1 1]

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
        xpath_header(1, ''),
        xpath_header(2, 'h-1'),
        "//x:div[@class='p']//x:a[@href='#h-1' and text()='toplevel to h 1']",
        "//x:div[@class='p']//x:a[@href='#h-2' and text()='toplevel to h 2']",
        "//x:div[@class='p']//x:a[@href='#h-2/h-2-1' and text()='toplevel to h 2 1']",
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='toplevel to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-1' and text()='toplevel to notindex 1']",
        "//x:div[@class='p']//x:a[@href='notindex-1-1.html' and text()='toplevel to notindex 1 1']",
        "//x:div[@class='p']//x:a[@href='notindex-1-1.html#notindex-1-1-1' and text()='toplevel to notindex 1 1 1']",
        "//*[@id='_toc']//x:a[@href='#h-1' and text()='h 1']",
        "//*[@id='_toc']//x:a[@href='h-1-1.html' and text()='h 1 1']",
        "//*[@id='_toc']//x:a[@href='h-1-1.html#h-1-1-1' and text()='h 1 1 1']",

        // Modified by toplevel.
        "//x:div[@class='p']//x:a[@href='h-1-1.html' and text()='toplevel to h 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#h-1-1-1' and text()='toplevel to h 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#image-1-1-1' and text()='toplevel to image 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1.html#h-1-1-1-1' and text()='toplevel to h 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1-1-1-1.html' and text()='toplevel to h 1 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-1-1-1-1-1.html#h-1-1-1-1-1-1' and text()='toplevel to h 1 1 1 1 1 1']",
        "//x:div[@class='p']//x:a[@href='h-2/h-2-1-1.html' and text()='toplevel to h 2 1 1']",
        "//x:div[@class='p']//x:a[@href='h-2/h-2-1-1.html#h-2-1-1-1' and text()='toplevel to h 2 1 1 1']",

        //// How it would be without toplevel.
        //xpath_header(3, 'h-1-1'),
        //xpath_header(4, 'h-1-1-1'),
        //xpath_header(5, 'h-1-1-1-1'),
        //xpath_header(6, 'h-1-1-1-1-1'),
        //xpath_header(7, 'h-1-1-1-1-1-1'),
        //"//x:div[@class='p']//x:a[@href='#h-1-1' and text()='toplevel to h 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1' and text()='toplevel to h 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1' and text()='toplevel to h 1 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1-1' and text()='toplevel to h 1 1 1 1 1']",
        //"//x:div[@class='p']//x:a[@href='#h-1-1-1-1-1-1' and text()='toplevel to h 1 1 1 1 1 1']",
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
)
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
    input_path_noext: 'notindex',
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
  },
)
assert_lib_ast('header: id of first header is empty if index',
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
        id: '',
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
)
assert_lib('header: README is a regular filename',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\x[README]{id=index-to-readme}

\\Include[README]
`,
      'README.bigb': `= README
{c}
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:a[@id='index-to-readme' and @href='README.html' and text()='README']",
      ],
      'README.html': [
        xpath_header(1, 'README'),
      ],
    },
  }
)
assert_lib_error('header: empty include in header title fails gracefully',
  // https://github.com/ourbigbook/ourbigbook/issues/195
  `= tmp

== \\Include
`,
  3, 4
)
assert_lib_error('header: empty x in header title fails gracefully',
  `= tmp

== a \\x
`,
  3, 6
)
assert_lib_error('header: forbid_multiheader option forbids multiple headers',
  `= h1

== h2
`,
  3, 1, 'index.bigb',
  {
    convert_opts: {
      forbid_multiheader: 'denied',
    },
    input_path_noext: 'index',
  }
)
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
)
assert_lib_error('header: forbid_multi_h1 option forbids multiple h1 headers',
  `= h1

= h1 1
`,
  3, 1, 'index.bigb',
  {
    convert_opts: { forbid_multi_h1: true },
    input_path_noext: 'index',
  }
)
assert_lib('header: forbid_multi_h1 option does not forbid multiple non-h1 headers',
  {
    convert_opts: { forbid_multi_h1: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= h1

== h2

== h2 2

=== h3
`,
    },
  }
)
assert_lib('header: forbid_multi_h1 option does not forbid synonym headers',
  {
    convert_opts: { forbid_multi_h1: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= h1

= h1 2
{synonym}
`,
    },
  }
)
assert_lib('header: forbid_multi_h1 option does not forbid h1 headers with parent',
  {
    convert_opts: { forbid_multi_h1: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= h1

= h2
{parent=}
`,
    },
  }
)
assert_lib_stdin('header: wiki argument without value adds a link to wikipedia based on the title',
  `= My topic
{wiki}
`,
  {
    assert_xpath_stdout: [
      "//x:a[@href='https://en.wikipedia.org/wiki/My_topic']",
    ]
  }
)
assert_lib_stdin('header: wiki argument with a value adds a link to wikipedia with that value',
  `= My topic
{wiki=Another_one}
`,
  {
    assert_xpath_stdout: [
      "//x:a[@href='https://en.wikipedia.org/wiki/Another_one']",
    ]
  }
)

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
)
assert_lib_ast('code: inline shorthand simple',
  'a `b c` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('b c')]),
      t(' d'),
    ]),
  ]
)
// https://github.com/ourbigbook/ourbigbook/issues/171
assert_lib_ast('code: inline shorthand with only a backslash',
  'a `\\` d\n',
  [
    a('P', [
      t('a '),
      a('c', [t('\\')]),
      t(' d'),
    ]),
  ]
)
assert_lib_ast('code: inline shorthand escape backtick',
  'a \\`b c\n',
  [a('P', [t('a `b c')])]
)
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
)
assert_lib_ast('code: block shorthand',
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
)
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
)
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
      "//x:span[@class='caption-prefix' and text()='Code 1. ']",
    ]
  }
)
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
      "//x:span[@class='caption-prefix' and text()='Code 1. ']",
    ]
  }
)
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
assert_lib_stdin('header: parent works with ourbigbook.json lint h-parent equal parent and no includes',
  `= 1

= 2
{parent=1}
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
)
assert_lib_error('header: number fails with ourbigbook.json lint h-parent = parent',
  `= 1

== 2
`,
  3, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'parent', } } } }
)
assert_lib_stdin('header: number works with ourbigbook.json lint h-parent = number',
  `= 1

== 2
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
)
assert_lib_error('header: parent fails with ourbigbook.json lint h-parent = number',
  `= 1

= 2
{parent=1}
`,
  3, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-parent': 'number', } } } }
)
assert_lib_stdin('header: parent works with ourbigbook.json lint h-parent equal parent and includes with parent',
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
)
assert_lib_error('header: parent fails with ourbigbook.json lint h-parent equal parent and includes with number',
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
)
// lint h-tag
assert_lib_error('header: lint: h-tag child failure',
  `= 1
{tag=2}

== 2
`,
  2, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'child', } } } }
)
assert_lib_stdin('lint h-tag child pass',
  `= 1
{child=2}

== 2
`,
  { convert_opts: { ourbigbook_json: {
    lint: { 'h-tag': 'child' },
    enableArg: { 'H': { 'child': true } },
  } } }
)
assert_lib_error('lint h-tag tag failure',
  `= 1
{child=2}

== 2
`,
  2, 1, undefined,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
)
assert_lib_stdin('header: lint: h-tag tag pass',
  `= 1
{tag=2}

== 2
`,
  { convert_opts: { ourbigbook_json: { lint: { 'h-tag': 'tag', } } } }
)
assert_lib_error('header: lint: has to be direct child of toplevel explicit',
  // While not stricly necessary for static convert, it leads to blowup only in web.
  // It also leads to hard to understand issues. Just prevent this insanity one and for all.
  //
  // We add the "asdf" to the quote otherwise there's a bug where it converts it down to:
  //
  // \Q[== h2]
  //
  // and it stops being a header.
  `= Toplevel

\\Q[
asdf

== h2
]
`,
  6, 1
)
assert_lib_error('header: lint: has to be direct child of toplevel implicit paragraph',
  `= Toplevel

== h2
asdf
`,
  3, 1
)
assert_lib_error('header: home article cannot have non-empty id',
  `= My home
{id=asdf}
`,
  2, 1, 'index.bigb',
  {
    input_path_noext: 'index',
  }
)
assert_lib_error('header: home article cannot have disambiguate',
  `= My home
{disambiguate=asdf}
`,
  2, 1, 'index.bigb',
  {
    input_path_noext: 'index',
  }
)
assert_lib_ast('header: home article can have empty id',
  // This is useful for web upload, where empty id allows identifying the article ID as being the index
  // without the need for out of band path which we kind of want to erradicate.
  `= My home
{id=}
`,
  undefined,
  {
    input_path_noext: 'index',
  }
)

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
)
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
)
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
)
assert_lib('word count descendant from include without embed includes',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= h1

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
)

// Toc
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
)

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
    ],
    assert_xpath: {
      'notindex.html': [
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
        "//*[@id='_toc']//x:a[@href='#h1-2' and text()='h1 2']",

        // The headers have ToC links.
        `${xpath_header(2, 'h1-1')}//x:a[@href='#_toc/h1-1' and @class='toc']`,
        `${xpath_header(2, 'h1-2')}//x:a[@href='#_toc/h1-2' and @class='toc']`,
        `${xpath_header(3, 'h1-2-1')}//x:a[@href='#_toc/h1-2-1' and @class='toc']`,

        // Descendant count.
        "//*[@id='_toc']//*[@class='title-div']//*[@class='descendant-count' and text()='4']",
        "//*[@id='_toc']//*[@id='_toc/h1-2']//*[@class='descendant-count' and text()='2']",
      ],
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
        "//*[@id='_toc']//x:a[@href='notindex.html#h1-2-1' and text()='h1 2 1']",
        "//*[@id='_toc']//x:a[@href='notindex.html#h1-2-1-1' and text()='h1 2 1 1']",

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
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
    },
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
  },
)
assert_lib('toc: toplevel scope is removed from table of content IDs',
  {
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= h1
{scope}

== h1 1

== h1 2

=== h1 2 1

==== h1 2 1 1
`,
    },
    assert_xpath: {
      'notindex.html': [
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
        "//*[@id='_toc']//x:a[@href='#h1-2' and text()='h1 2']",

        // The headers have ToC links.
        `${xpath_header(2, 'h1-1')}//x:a[@href='#_toc/h1-1' and @class='toc']`,
        `${xpath_header(2, 'h1-2')}//x:a[@href='#_toc/h1-2' and @class='toc']`,
        `${xpath_header(3, 'h1-2-1')}//x:a[@href='#_toc/h1-2-1' and @class='toc']`,

        // Descendant count.
        "//*[@id='_toc']//*[@class='title-div']//*[@class='descendant-count' and text()='4']",
        "//*[@id='_toc']//*[@id='_toc/h1-2']//*[@class='descendant-count' and text()='2']",
      ],
      'notindex-split.html': [
        // Split output files get their own ToCs.
        "//*[@id='_toc']",
        "//*[@id='_toc']//x:a[@href='#_toc' and text()=' Table of contents']",
      ],
      'notindex/h1-2.html': [
        // Split output files get their own ToCs.
        "//*[@id='_toc']",
        "//*[@id='_toc']//x:a[@href='#_toc' and text()=' Table of contents']",

        // The Toc entries of split output headers automatically cull out a level
        // of the full number tree. E.g this entry is `2.1` on the toplevel ToC,
        // but on this sub-ToC it is just `1.`.
        "//*[@id='_toc']//x:a[@href='../notindex.html#h1-2-1' and text()='h1 2 1']",
        "//*[@id='_toc']//x:a[@href='../notindex.html#h1-2-1-1' and text()='h1 2 1 1']",

        // We have gone a bit back and forth on split vs nosplit here.
        // Related: https://github.com/ourbigbook/ourbigbook/issues/146
        `//*[@id='_toc']//*[@id='_toc/h1-2-1']//x:a[@href='#_toc' and text()=' h1 2']`,
        `//*[@id='_toc']//*[@id='_toc/h1-2-1-1']//x:a[@href='#_toc/h1-2-1' and text()=' h1 2 1']`,

        // Descendant count.
        "//*[@id='_toc']//*[@class='title-div']//*[@class='descendant-count' and text()='2']",
        "//*[@id='_toc']//*[@id='_toc/h1-2-1']//*[@class='descendant-count' and text()='1']",
      ],
    },
  },
)
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
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
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
      'ourbigbook.json': '{ "h": { "numbered": true } }',
    },
    assert_xpath: {
      'notindex.html': [
        "//x:blockquote//x:a[@href='notindex2.html' and text()='Section 1. \"Notindex2\"']",
        "//*[@id='_toc']//x:a[@href='notindex2.html' and @data-test='0' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and @data-test='1' and text()='Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2']//x:i[@class='n' and text()='1.1. ']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h3' and @data-test='2' and text()='Notindex2 h3']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h3']//x:i[@class='n' and text()='1.2. ']",
        "//*[@id='_toc']//x:a[@href='notindex3.html' and @data-test='3' and text()='Notindex3']",
        "//*[@id='_toc']//x:a[@href='notindex3.html']//x:i[@class='n' and text()='1.2.1. ']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h2' and @data-test='4' and text()='Notindex3 h2']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h2']//x:i[@class='n' and text()='1.2.1.1. ']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h3' and @data-test='5' and text()='Notindex3 h3']",
        "//*[@id='_toc']//x:a[@href='notindex3.html#notindex3-h3']//x:i[@class='n' and text()='1.2.1.2. ']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and @data-test='6' and text()='Notindex h2']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2']//x:i[@class='n' and text()='2. ']",
      ],
      'notindex-split.html': [
        // Links to external source files keep the default split just like regular links.
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2']//x:i[@class='n' and text()='1.1. ']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2']//x:i[@class='n' and text()='2. ']",
      ],
    },
  },
)
assert_lib('toc: table of contents respects numbered=0 of included headers',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

\\Include[notindex2]

== Notindex h2
`,
      'notindex2.bigb': `= Notindex2
{numbered=0}

== Notindex2 h2
`,
      'ourbigbook.json': '{ "h": { "numbered": true } }',
    },
    assert_xpath: {
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2']//x:i[@class='n' and text()='2. ']",
      ],
    },
    assert_not_xpath: {
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2']//x:i[@class='n']",
      ],
    },
  },
)
if (false) {
// Not implemented yet.
assert_lib('toc: json: table of contents respects tocMaxCrossSource',
  {
    convert_dir: true,
    filesystem: {
      'notindex.bigb': `= Notindex h1

== Notindex h2

\\Include[notindex2]

=== Notindex h3

`,
      'notindex2.bigb': `= Notindex2
{numbered=0}

== Notindex2 h2

=== Notindex2 h3

==== Notindex2 h4

===== Notindex2 h5
`,
    },
    assert_xpath: {
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='1. Notindex h2']",
        //"//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='2. Notindex h2']",
        //"//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
        //"//*[@id='_toc']//x:a[@href='notindex2.html' and text()='1.1. Notindex h3']",
      ],//
    },
  },
)
}
assert_lib('toc: table of contents include placeholder header has no number when under numbered=0',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{numbered=0}

\\Q[\\x[notindex2]{full}]

\\Include[notindex2]

== Notindex h2
`,
      'notindex2.bigb': `= Notindex2

== Notindex2 h2
`,
      'ourbigbook.json': '{ "h": { "numbered": true } }',
    },
    assert_xpath: {
      'notindex.html': [
        "//x:blockquote//x:a[@href='notindex2.html' and text()='Section \"Notindex2\"']",
        "//*[@id='_toc']//x:a[@href='notindex2.html' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2' and text()='Notindex2 h2']",
        "//*[@id='_toc']//x:a[@href='notindex2.html#notindex2-h2']//x:i[@class='n' and text()='1. ']",
        "//*[@id='_toc']//x:a[@href='#notindex-h2' and text()='Notindex h2']",
      ],
    },
    assert_not_xpath: {
      'notindex.html': [
        "//*[@id='_toc']//x:a[@href='notindex2.html']//x:i[@class='n']",
        "//*[@id='_toc']//x:a[@href='#notindex2-h2']//x:i[@class='n']",
      ],
    },
  },
)
assert_lib('toc: table of contents does not show synonyms of included headers',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
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
)
assert_lib('toc: header numbered=0 in ourbigbook.json works across source files and on table of contents',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_lib('toc: split header with an include and no headers has a single table of contents',
  // At 074bacbdd3dc9d3fa8dafec74200043f42779bec was getting two.
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
      ourbigbook_json: { h: { numbered: false } }
    },
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_lib('toc: toplevel scope gets removed on table of contents of included headers',
  {
    convert_dir: true,
    convert_opts: { split_headers: true },
    filesystem: {
      'index.bigb': `= Toplevel

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
        "//x:blockquote//x:a[@href='notindex.html#notindex-h2' and text()='Section \"Notindex h2\"']",
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
      ],
      'split.html': [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
      ],
    },
  },
)

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
      'index.bigb': `= Asdf

== h2

=== h3
`,
    },
    convert_dir: true,
    convert_opts: { split_headers: true },
    assert_xpath: {
      'h2.html': [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      ],
      'h3.html': [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h2']`,
      ],
      //'h4.html': [
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h2']`,
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html#h3']`,
      //],
      //'notindex.html': [
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      //],
      //'notindex2.html': [
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
      //],
      //'notindex3.html': [
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html']`,
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html']`,
      //  `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html']`,
      //],
    },
    assert_not_xpath: {
      'index.html': [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
)

// Math.
// \M
// Minimal testing since this is mostly factored out with code tests.
assert_lib_ast('math: inline sane',
  '\\m[[\\sqrt{1 + 1}]]\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
)
assert_lib_ast('math: inline shorthand simple',
  '$\\sqrt{1 + 1}$\n',
  [a('P', [a('m', [t('\\sqrt{1 + 1}')])])],
)
assert_lib_ast('math: inline escape dollar',
  'a \\$b c\n',
  [a('P', [t('a $b c')])],
)
assert_lib_ast('math: block sane',
  '\\M[[\\sqrt{1 + 1}]]',
  [a('M', [t('\\sqrt{1 + 1}')])],
)
assert_lib_ast('math: block shorthand',
  '$$\\sqrt{1 + 1}$$',
  [a('M', [t('\\sqrt{1 + 1}')])],
)
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
assert_lib_stdin('math: block with comment on last line',
  // KaTeX parse error: LaTeX-incompatible input and strict mode is set to 'error': % comment has no terminating newline; LaTeX would fail because of commenting the end of math mode (e.g. $) [commentAtEnd]
  `$$
% my comment
$$
`,
)
assert_lib_error('math: undefined macro', '\\m[[\\reserved_undefined]]', 1, 3);
assert_lib_ast('math: with description has caption',
  `$$
aa
$$
{description=b b}
`,
  [a('M', [t('aa')], { description: [t('b b')] }, { id: '_1'})],
  {
    assert_xpath_stdout: [
      "//x:span[@class='caption-prefix' and text()='Equation 1. ']",
    ]
  }
)

// Quote.
// \Q
assert_lib_ast('quotation: sane quote without inner paragraph',
  '\\Q[aa]\n',
  [a('Q', [t('aa')])],
)
assert_lib_ast('quotation: generates valid HTML with title sane',
  `\\Q[My quote]{title=My title}
`,
  [a('Q', [t('My quote')], { title: [t('My title')] }, { id: 'quote-my-title'})],
  {
    assert_xpath_stdout: [
      `//x:div[@id='quote-my-title']//x:blockquote[text()='My quote']`,
    ],
  }
)
assert_lib_ast('quotation: generates valid HTML with title shorthand',
  `> My quote
{title=My title}
`,
  [a('Q', [t('My quote')], { title: [t('My title')] }, { id: 'quote-my-title'})],
  {
    assert_xpath_stdout: [
      `//x:div[@id='quote-my-title']//x:blockquote[text()='My quote']`,
    ],
  }
)
assert_lib_ast('quotation: shorthand simple',
  `Before quote

> My quote

After quote
`,
  [
    a('P', [t('Before quote')]),
    a('Q', [t('My quote')]),
    a('P', [t('After quote')]),
  ],
)
assert_lib_ast('quotation: shorthand with paragraph',
  `Before quote

> My quote

  Another paragraph

After quote
`,
  [
    a('P', [t('Before quote')]),
    a('Q', [
      a('P', [t('My quote')]),
      a('P', [t('Another paragraph')]),
    ]),
    a('P', [t('After quote')]),
  ],
)
assert_lib_ast('quotation: backslash escape works',
  `Before quote

\\> My quote

After quote
`,
  [
    a('P', [t('Before quote')]),
    a('P', [t('> My quote')]),
    a('P', [t('After quote')]),
  ],
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

// \Include
assert_lib_ast('include: simple with paragraph with embed includes',
  `= Toplevel

Toplevel paragraph.

\\Include[include-one-level-1]

\\Include[include-one-level-2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Toplevel')]}),
    a('P', [t('Toplevel paragraph.')]),
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
)
assert_lib('include: with unscoped parent after scope does not force pick the scope',
  // https://github.com/ourbigbook/ourbigbook/issues/232#issuecomment-2402776284
  {
    filesystem: {
      'index.bigb': `= Toplevel

== No scope

=== My scope
{scope}

==== In my scope 1

\\Include[notindex]{parent=No scope}
`,
      'notindex.bigb': `= Notindex
`,
    },
    convert_dir: true,
  },
)
assert_lib_error('include: cannot be added in the middle of headers',
  // https://github.com/ourbigbook/ourbigbook/issues/344
  `= Toplevel

asdf

\\Include[notindex]

qwer

== h2
`,
  5, 1, 'index.bigb',
  {
    filesystem: {
      'notindex.bigb': `= Notindex
`,
    },
    input_path_noext: 'index',
    // TODO https://github.com/ourbigbook/ourbigbook/issues/342
    convert_opts: { ourbigbook_json: { lint: { filesAreIncluded: false } } },
    convert_before_norender: ['notindex.bigb'],
  },
)
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
  include_opts,
  //{
  //  convert_opts: {
  //    embed_includes: true,
  //  }
  //},
)
assert_lib('include: parent argument works for toplevel',
  // https://github.com/ourbigbook/ourbigbook/issues/231
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]{parent=}
`,
      'notindex.bigb': `= Notindex
`,
    },
    convert_dir: true,
  }
)
assert_lib_error('include: parent argument to old ID fails gracefully with levels',
  // Related to https://github.com/ourbigbook/ourbigbook/issues/341
  `= h1

== h2

== h2 2

\\Include[include-one-level-1]{parent=h2}
`,
  7, 30, undefined, include_opts,
)
// TODO test not quite correct, have to remember how to do a error check with multiple files.
assert_lib_error('include: parent argument to old ID fails gracefully with parent',
  // Related to https://github.com/ourbigbook/ourbigbook/issues/341
  `= h1

= h2
{parent=}

= h2 2
{parent=}

\\Include[include-one-level-1]{parent=h2}
`,
  9,
  // Points to the `{` in `{parent=h2}`.
  30,
  'index.bigb',
  {
    input_path_noext: 'index',
    convert_opts: {
      embed_includes: true,
    }
  }
)
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
  {
    convert_opts: { embed_includes: true },
    input_path_noext: 'index',
    filesystem: {
      'include-two-levels.bigb': `= ee

ff

== gg

hh
`,
    },
  }
)
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
)
assert_lib_ast('include: simple with paragraph with no embed includes',
  `= Toplevel

bb

\\Include[notindex]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('Toplevel')]}),
    a('P', [t('bb')]),
    a('H', undefined, {level: [t('2')], title: [t('Notindex')]}),
    a('P', [
      a(
        'x',
        [t('This section is present in another page, follow this link to view it.')],
        {'href': [t('notindex')]}
      ),
    ]),
  ],
  {
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
    convert_opts: { split_headers: true },
    filesystem: {
      'notindex.bigb': `= Notindex
`,
    },
    assert_xpath: {
      'index.html': [
        xpath_header(1, '', "x:a[@href='split.html' and text()='Toplevel']"),
        xpath_header(2, 'notindex', "x:a[@href='notindex.html' and text()='Notindex']"),
      ]
    },
    input_path_noext: 'index',
  },
)
// https://github.com/ourbigbook/ourbigbook/issues/74
assert_lib_ast('include: internal link to embed include header',
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
  Object.assign(
    {
      assert_xpath_stdout: [
        "//x:div[@class='p']//x:a[@href='#include-two-levels' and text()='ee']",
        "//x:div[@class='p']//x:a[@href='#gg' and text()='gg']",
      ],
      convert_opts: { split_headers: true },
    },
    include_opts
  ),
)
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
)
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
)
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
)
// https://github.com/ourbigbook/ourbigbook/issues/23
assert_lib_error('include: with error reports error on the include source',
  `= aa

bb

\\Include[include-with-error]
`,
  3, 1, 'include-with-error.bigb',
  include_opts
)
const circular_entry = `= notindex

\\Include[include-circular]
`;
assert_lib_error('include: circular dependency loop 1 <-> 2',
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
)
// TODO error this is legitimately failing on CLI, bad error messages show
// up on CLI reproduction.
// The root problem is that include_path_set does not contain
// include-circular-2.bigb, and that leads to several:
// ```
// file not found on database: "${target_input_path}", needed for toplevel scope removal
// on ToC conversion.
assert_lib_error('include: circular dependency loop 1 -> 2 <-> 3',
  `= Toplevel

\\Include[include-circular-1]
`,
  // 3, 1, 'include-circular-2.bigb',
  undefined, undefined, undefined,
  {
    embed_includes: true,
    has_error: true,
    input_path_noext: 'index',
    filesystem:  {
      'include-circular-1.bigb': `= bb

\\Include[include-circular-2]
`,
      'include-circular-2.bigb': `= cc

\\Include[include-circular-1]
`,

    }
  }
)
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
)
assert_lib_error('include: to file that exists in header title fails gracefully',
  // https://github.com/ourbigbook/ourbigbook/issues/195
  `= Toplevel

== \\Include[tmp2]
`,
  3, 4, 'tmp.bigb',
  {
    filesystem: {
      'tmp2.bigb': `= Tmp2
`
    },
    // TODO https://github.com/ourbigbook/ourbigbook/issues/342
    convert_opts: { ourbigbook_json: { lint: { filesAreIncluded: false } } },
    convert_before_norender: ['tmp2.bigb'],
    input_path_noext: 'tmp',
  }
)
assert_lib_error('include: to file that does not exist fails gracefully',
  `= h1

\\Include[asdf]
`,
  3, 1
)
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
)
assert_lib('include: relative include in subdirectory',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[s1]
\\Include[top]
`,
      's1/index.bigb': `= Toplevel

\\Include[notindex]
`,
      's1/notindex.bigb': `= Notindex

\\Include[notindex2]

== Notindex h2`,
      's1/notindex2.bigb': `= Notindex2
`,
      // TODO https://github.com/ourbigbook/ourbigbook/issues/214
      'top.bigb': `= Top
`,
    },
    convert_dir: true,
    assert_xpath: {
      's1.html': [
        "//*[@id='_toc']//x:a[@href='s1/notindex.html' and @data-test='0' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='s1/notindex2.html' and @data-test='1' and text()='Notindex2']",
        "//*[@id='_toc']//x:a[@href='s1/notindex.html#notindex-h2' and @data-test='2' and text()='Notindex h2']",
        // TODO https://github.com/ourbigbook/ourbigbook/issues/214
        //"//*[@id='_toc']//x:a[@href='../top.html' and @data-test='2' and text()='2. Top']",
      ],
    },
  }
)
assert_lib('include: from parent to subdirectory',
  // https://github.com/ourbigbook/ourbigbook/issues/116
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\x[subdir][toplevel to subdir]

\\x[subdir/h2][toplevel to subdir h2]

\\Include[subdir]
\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Toplevel

== h2
`,
      'subdir/notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    convert_dir: true,
    assert_xpath: {
      'index.html': [
        "//x:a[@href='subdir.html' and text()='toplevel to subdir']",
        "//x:a[@href='subdir.html#h2' and text()='toplevel to subdir h2']",
      ],
    },
  }
)
assert_lib('include: subdir index.bigb outputs to subdir without trailing slash with htmlXExtension=true',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/notindex]
`,
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
)
assert_lib('include: subdir index.bigb outputs to subdir without trailing slash with htmlXExtension=false',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/notindex]
`,
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
)
assert_lib('include: subdir index.bigb removes leading @ from links with the x_remove_leading_at option',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[@subdir]
\\Include[@subdir/@notindexat]
`,
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
        xpath_header_parent(1, 'notindex', '../index.html', 'Home'),
      ],
    },
  }
)
assert_lib('include: subdir index.bigb outputs to subdir.html when there is a toplevel header',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
`,
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
)
// This is forbidden by default lintings (files must start with h1 and files must be included)
// and allowing it would require a bit more option work. I don't think we care enough for now.
//assert_lib('include: subdir index.bigb outputs to subdir.html when there is no toplevel header',
//  // https://github.com/ourbigbook/ourbigbook/issues/247
//  {
//    filesystem: {
//      'subdir/index.bigb': `Hello world
//`,
//    },
//    convert_dir: true,
//    assert_xpath: {
//      'subdir.html': [
//        "//x:div[@class='p' and text()='Hello world']",
//      ],
//    },
//  }
//)
assert_lib('include: include of a header with a tag or child in a third file does not blow up',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
      'notindex.bigb': `= Notindex
{child=notindex2}
{tag=notindex2}
`,
      'notindex2.bigb': `= Notindex 2
`,
    },
    convert_dir: true,
    convert_opts: { ourbigbook_json: { enableArg: { 'H': { 'child': true } } } },
  }
)
assert_lib(
  // https://github.com/ourbigbook/ourbigbook/issues/123
  'include: includers should show as a parents of the includee',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[included-by-index]
`,
  'included-by-index.bigb': `= Included by index
`,
    },
    assert_xpath: {
      'included-by-index.html': [
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Home'),
      ],
    }
  }
)
assert_lib(
  'include: incoming links: does not generate an incoming links entry',
  {
    convert_dir: true,
    convert_opts: {
      split_headers: true,
    },
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_lib('include: parent_id option',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
      'notindex2.bigb': `= Notindex2
`,
    },
    convert_before: [
      'notindex2.bigb',
    ],

    // This setup is to only render notindex2.bigb with that parent_id,
    // not index.bigb nor notindex.bigb, which leads to an infinite loop.
    convert_before_norender: [ 'index.bigb', 'notindex.bigb' ],
    convert_opts: {
      parent_id: 'notindex',
      // Not ideal, but it is impossible to test this otherwise:
      // * parent_id only affects render and not the DB (for web usage)
      // * if we were to include notindex2.bigb, it would a have similar effect
      //   and possibly hide the effect of parent_id
      ourbigbook_json: { lint: { filesAreIncluded: false } },
    },

    assert_xpath: {
      'notindex2.html': [
        xpath_header_parent(1, 'notindex2', 'notindex.html', 'Home'),
      ],
    },
  }
)

// OurBigBookExample
assert_lib_ast('OurBigBookExample: basic',
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
)
assert_lib('OurBigBookExample: that links to id in another file',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[abc]
\\Include[notindex]
`,
      'abc.bigb': `= Abc

\\OurBigBookExample[[\\x[notindex\\]]]
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
)

// passthrough
assert_lib('passthrough: basic',
  {
    convert_dir: true,
    filesystem: {
      'index.bigb': `\\passthrough[[<div id="my-passthrough"></div>]]
`,
    },
    assert_xpath: {
      'index.html': [
        "//x:div[@id='my-passthrough']",
      ],
    },
  }
)
assert_lib('passthrough: xss_safe',
  {
    convert_dir: true,
    convert_opts: { xss_safe: true },
    filesystem: {
      'index.bigb': `\\passthrough[[<div id="my-passthrough"></div>]]
`,
    },
    assert_xpath: {
      'index.html': [
        `//x:pre//x:code[text()='<div id="my-passthrough"></div>']`,
      ],
    },
  }
)

// ID auto-generation.
// https://docs.ourbigbook.com/automatic-id-from-title
assert_lib_ast('id autogen: without title',
  '\\P[aa]\n',
  [a('P', [t('aa')], {}, {id: '_1'})],
)
assert_lib_error('id autogen: conflict with previous autogenerated id',
  `\\P[aa]

\\P[bb]{id=_1}`,
  3, 1
)
assert_lib_error('id autogen: conflict with later autogenerated id',
  `\\P[aa]{id=_1}

\\P[bb]`,
  1, 1
)
assert_lib_error('id autogen: cannot be empty simple',
  `= Toplevel

==${' '}
`,
  3, 1
)
assert_lib_error('id autogen: cannot be empty with scope',
  `= Toplevel

== Asdf
{scope}

=== .
`,
  6, 1
)
// https://github.com/ourbigbook/ourbigbook/issues/4
assert_lib_ast('id autogen: nested',
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
)
assert_lib_ast('id autogen: unicode normalize',
  // 00C9: Latin capital letter E with acute
  // 00DE: capital Thorn: https://en.wikipedia.org/wiki/Thorn_(letter)
  // 0141: capital L with a stroke: https://en.wikipedia.org/wiki/%C5%81
  // 0152: Latin capital ligature oe: https://en.wikipedia.org/wiki/%C5%92
  // 0152: capital ligature oe (ethel): https://en.wikipedia.org/wiki/%C5%92
  // 0391: capital alpha: https://en.wikipedia.org/wiki/Alpha[].
  // 03B1: lowercase alpha
  // 2013: en-dash -> -
  // 2014: em-dash -> -
  // 2212: Unicode minus sign
  // 4F60: Chinese ni3 (you): https://en.wiktionary.org/wiki/%E4%BD%A0
  `= 0\u{2013}A.\u{4F60}\u{00C9}\u{2014}\u{0141}\u{0152}y++z\u{00DE}\u{0391}\u{2212}

\\x[0-a-\u{4F60}e-loey-plus-plus-zth-alpha-minus]
`,
  [
    a('H', undefined, {title: [t('0\u{2013}A.\u{4F60}\u{00C9}\u{2014}\u{0141}\u{0152}y++z\u{00DE}\u{0391}\u{2212}')]}, {id: '0-a-\u{4F60}e-loey-plus-plus-zth-alpha-minus'}),
    a('P', [
      a('x', undefined, {href: [t('0-a-\u{4F60}e-loey-plus-plus-zth-alpha-minus')]})
    ])
  ],
)
assert_lib_ast('id autogen: unicode no normalize',
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
)
assert_lib_ast('id autogen: with disambiguate',
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
)
assert_lib_error('id autogen: with undefined reference in title fails gracefully',
  `= \\x[reserved_undefined]
`, 1, 3);
// https://github.com/ourbigbook/ourbigbook/issues/45
assert_lib_ast('id autogen: with nested elements does an id conversion and works',
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
)

// check_db lib

// ID conflicts.
assert_lib_error('id conflict: with previous id on the same file',
  `= tmp

== tmp 2

== tmp 2
`,
  5, 1, 'index.bigb',
  {
    error_message: ourbigbook.duplicateIdErrorMessage('tmp-2', 'index.bigb', 3, 1),
    input_path_noext: 'index',
  },
)
assert_lib_ast('id conflict: with id on another file simple',
  // https://github.com/ourbigbook/ourbigbook/issues/201
  `= Toplevel

== Notindex h2
`,
  undefined,
  {
    convert_before: ['index.bigb', 'notindex.bigb'],
    // Multiple errors because the duplicated header is also spotted as having multiple parents.
    // Not in the modd
    assert_check_db_errors: 5,
    filesystem: {
      'notindex.bigb': `= Notindex

== Notindex h2
`,
    },
    input_path_noext: 'index'
  }
)
assert_lib_ast('id conflict: with id on another file where conflict header has a child header',
  // Bug introduced at ef9e2445654300c4ac41e1d06d3d2a1889dd0554
  `= Toplevel

== aa
`,
  undefined,
  {
    convert_before_norender: ['index.bigb', 'notindex.bigb'],
    assert_check_db_errors: 5,
    filesystem: {
      'notindex.bigb': `= Notindex

== aa

=== bb
`,
    },
    input_path_noext: 'index'
  }
)
assert_lib('id conflict: on file with the same toplevel_id as another',
  {
    convert_dir: true,
    assert_check_db_errors: 2,
    filesystem: {
      'index.bigb': `= Notindex

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
    },
  }
)

// titleToId
assert_equal('titleToId with hyphen', ourbigbook.titleToId('.0A. - z.a Z..'), '0a-z-a-z');
assert_equal('titleToId with unicode chars', ourbigbook.titleToId('0A.你好z'), '0a-你好z');

// Toplevel.
assert_lib_ast('toplevel: arguments',
  `{title=aaa}

bbb
`,
  a('Toplevel', [a('P', [t('bbb')])], {'title': [t('aaa')]}),
  {toplevel: true}
)
assert_lib_error('toplevel explicit content',
  `[]`, 1, 1,
)
// https://github.com/ourbigbook/ourbigbook/issues/10
assert_lib_error('explicit toplevel macro',
  `\\toplevel`, 1, 1,
)

// split_headers
// A split headers hello world.
assert_lib_ast('one paragraph implicit split headers',
  'ab\n',
  [a('P', [t('ab')])],
  {
    convert_opts: { split_headers: true },
    input_path_noext: 'notindex',
  }
)

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
assert_lib_error('unterminated shorthand inline code', '`\n', 1, 1);
assert_lib_error('unterminated shorthand link', '<ab', 1, 1);
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
    input_path_noext: 'index',
    convert_dir: true,
    filesystem: {
      'test-bigb-output-2.bigb': '= Test bigb output 2\n',
      'test-bigb-output-3.bigb': '= Test bigb output 3\n',
    }
  },
)
assert_lib('bigb output: link to empty toplevel header does not blow up',
  {
    stdin: `=${' '}

<>
`,
    assert_bigb_stdout: `=${' '}

<>
`,
    input_path_noext: 'index',
  },
)
assert_lib('bigb output: inline sane macro simple',
  {
    stdin: `Test sane only inline: \\testSaneOnly[inside TestSaneOnly inline]\n`,
    assert_bigb_stdout: `Test sane only inline: \\testSaneOnly[inside TestSaneOnly inline]\n`,
  }
)
assert_lib('bigb output: double br does not render as a double newline paragraph',
  {
    stdin: `ab\\br[]\\br[]cd`,
    assert_bigb_stdout: `ab
\\br[]cd
`,
  }
)
assert_lib('bigb output: br at start of argument gets rendered explicitly',
  {
    stdin: `\\TestSaneOnly[\\br[]ab]\n`,
    assert_bigb_stdout: `\\TestSaneOnly[\\br[]ab]\n`
  }
)
assert_lib('bigb output: br at end of argument gets rendered explicitly',
  {
    stdin: `\\TestSaneOnly[ab\\br[]]\n`,
    assert_bigb_stdout: `\\TestSaneOnly[ab\\br[]]\n`
  }
)
assert_lib('bigb output: br before block macro gets rendered explicitly',
  {
    stdin: `ab\\br[]\\TestSaneOnly[]\n`,
    assert_bigb_stdout: `ab\\br[]
\\TestSaneOnly[]\n`,
  }
)
assert_lib('bigb output: br after block macro gets rendered explicitly',
  {
    stdin: `\\TestSaneOnly[]\\br[]ab\n`,
    assert_bigb_stdout: `\\TestSaneOnly[]
\\br[]ab\n`,
  }
)
assert_lib('bigb output: named args are ordered alphabetically except title, id and disambiguate are on top',
  {
    stdin: `\\Image[http://example.com]{description=My description}{title=My title}{border}{id=asdf}\n`,
    assert_bigb_stdout: `\\Image[http://example.com]
{title=My title}
{id=asdf}
{border}
{description=My description}
`,
  }
)
assert_lib('bigb output: space after macro argument before newline',
  {
    stdin: `\\TestSaneOnly[ab]\u{20}

\\TestSaneOnly[cd]
`,
    assert_bigb_stdout: `\\TestSaneOnly[ab]
\u{20}

\\TestSaneOnly[cd]
`,
  }
)
assert_lib('bigb output: non-space after macro argument before newline',
  {
    stdin: `\\TestSaneOnly[ab]x

\\TestSaneOnly[cd]
`,
    assert_bigb_stdout: `\\TestSaneOnly[ab]
x

\\TestSaneOnly[cd]
`,
  }
)
assert_lib('bigb output: br in the middle of text gets converted to newline',
  {
    stdin: `ab\\br[]cd\n`,
    assert_bigb_stdout: `ab\ncd\n`
  }
)
assert_lib('bigb output: text block text block text',
  {
    stdin: `txt1\\TestSaneOnly[blk1]txt2\\TestSaneOnly[blk2]txt3\n`,
    assert_bigb_stdout: `txt1
\\TestSaneOnly[blk1]
txt2
\\TestSaneOnly[blk2]
txt3
`,
  }
)
assert_lib('bigb output: adds newlines around positional arguments that contain block',
  {
    stdin: `\\TestSaneOnly[\\TestSaneOnly[txt]]\n`,
    assert_bigb_stdout: `\\TestSaneOnly[
\\TestSaneOnly[txt]
]
`,
  }
)
assert_lib('bigb output: adds newlines around named arguments that contain block',
  {
    stdin: `\\TestSaneOnly{named=\\TestSaneOnly[txt]}\n`,
    assert_bigb_stdout: `\\TestSaneOnly{named=
\\TestSaneOnly[txt]
}
`,
  }
)
assert_lib_stdin('bigb output: converts plaintext literal arguments to arguments with escapes when possible',
  `\\TestSaneOnly[[\\ [ ] { } < \` $]]

\\TestSaneOnly[[* *]]

\\TestSaneOnly[[= =]]

\\TestSaneOnly[[|| ||]]

\\TestSaneOnly[[| |]]

\\TestSaneOnly[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$ \\i[asdf]]

\\TestSaneOnly[\\* \\i[asdf]]

\\TestSaneOnly[\\= \\i[asdf]]

\\TestSaneOnly[\\|| \\i[asdf]]

\\TestSaneOnly[\\| \\i[asdf]]
`,
  {
    assert_bigb_stdout: `\\TestSaneOnly[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$]

\\TestSaneOnly[\\* *]

\\TestSaneOnly[\\= =]

\\TestSaneOnly[\\|| ||]

\\TestSaneOnly[\\| |]

\\TestSaneOnly[\\\\ \\[ \\] \\{ \\} \\< \\\` \\$ \\i[asdf]]

\\TestSaneOnly[\\* \\i[asdf]]

\\TestSaneOnly[\\= \\i[asdf]]

\\TestSaneOnly[\\|| \\i[asdf]]

\\TestSaneOnly[\\| \\i[asdf]]
`,
  },
)
assert_lib_stdin('bigb output: converts sane refs to shorthand ones',
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
)
assert_lib_stdin('bigb output: adds newlines to start and end of multiline arguments',
  `\\TestSaneOnly[Positional oneline first]

\\TestSaneOnly[Positional multiline first

Positional multiline second]

\\Image[a.png]
{description=Named oneline first}

\\Image[a.png]
{description=Named multiline first

Named multiline second}
`,
  {
    assert_bigb_stdout: `\\TestSaneOnly[Positional oneline first]

\\TestSaneOnly[
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
)
assert_lib_stdin('bigb output: nested sane list followed by paragraph',
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
)
assert_lib_stdin('bigb output: list at the end of article does not lead to double trailing newlines',
  `aaa

* bbb
* ccc
`,
  {
    assert_bigb_stdout: `aaa

* bbb
* ccc
`
  },
)
assert_lib('bigb output: checks target IDs to decide between plural or not on converting non magic to magic links',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\x[dog]

\\x[dog]{p}

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Dog

== Dogs
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

<dog>

<dog>{p}

\\Include[notindex]
`,
    }
  }
)
assert_lib('bigb output: include with parent',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]{parent}
`,
      'notindex.bigb': `= Notindex
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

\\Include[notindex]{parent}
`,
    }
  }
)
assert_lib('bigb output: unused ID check does not blow up across files with magic plural',
  {
    filesystem: {
      'index.bigb': `= Toplevel

<dogs>

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Dog
`,
    },
    convert_dir: true,
    convert_opts: { output_format: ourbigbook.OUTPUT_FORMAT_OURBIGBOOK },
  }
)
assert_lib('bigb output: x uses text conversion as the target link',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\x[dog-and-cat]{c}{p}

\\x[asdf-asdf]

\\x[matching-id]

\\x[plural-apples]

<plural apples>

<accounts>

\\Include[notindex]
\\Include[accounts]
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
      'index.bigb': `= Toplevel

<Dog and Cats>

<asdf asdf>

<matching ID>

<plural Apples>

<plural Apples>

<accounts>

\\Include[notindex]
\\Include[accounts]
`,
    }
  }
)
assert_lib('bigb output: x magic input across files',
  {
    filesystem: {
      'index.bigb': `= Toplevel

<Dog and cat>

<Dog and cats>

<Uppercase>

<uppercase>

<Lowercase>

<lowercase>

<my plurals>

\\Include[notindex]
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
      'index.bigb': `= Toplevel

<Dog and cat>

<Dog and cats>

<Uppercase>

<Uppercase>

<lowercase>

<lowercase>

<my plurals>

\\Include[notindex]
`,
    }
  }
)
assert_lib('bigb output: x to disambiguate',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\x[python-animal]

\\x[python-animal]{p}

<python animal>

<Python (animal)>

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Python
{disambiguate=animal}
`,
    },
    convert_dir: true,
    // TODO maybe https://github.com/ourbigbook/ourbigbook/issues/244
    assert_bigb: {
      'index.bigb': `= Toplevel

<python (animal)>

\\x[python-animal]{p}

<python (animal)>

<Python (animal)>

\\Include[notindex]
`,
    }
  }
)
assert_lib('bigb output: x to plural disambiguate',
  // Happens notably with pluralize false plural bugs such as "Mathematics".
  {
    filesystem: {
      'index.bigb': `= Toplevel

<field cats>

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Field
{disambiguate=cats}
`,
    },
    convert_dir: true,
    // TODO maybe https://github.com/ourbigbook/ourbigbook/issues/244
    assert_bigb: {
      'index.bigb': `= Toplevel

<field (cats)>

\\Include[notindex]
`,
    }
  }
)
assert_lib('bigb output: x to scope',
  {
    filesystem: {
      'index.bigb': `= Toplevel

<my dog/pit bull>

<my dog/Pit bull>

<my dog/pit bulls>

<fruit/banana>

<fruit/orange>

\\Include[animal]

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
      'index.bigb': `= Toplevel

<my dog/pit bull>

<my dog/Pit bull>

<my dog/pit bulls>

<fruit/banana>

<fruit/orange>

\\Include[animal]

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
)
assert_lib('bigb output: x with leading slash to escape scope',
  {
    filesystem: {
      'index.bigb': `= Toplevel

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
      'index.bigb': `= Toplevel

== Fruit
{scope}

=== Fruit
{scope}

<fruit>

</fruit>
`,
    }
  }
)
assert_lib('bigb output: magic x in subdir scope',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[myscope/notindex]
\\Include[myscope/notindex2]
`,
      'myscope/notindex.bigb': `= Toplevel

<dog>
`,
      'myscope/notindex2.bigb': `= Animal

== Dog
`,
    },
    convert_dir: true,
    assert_bigb: {
      'myscope/notindex.bigb': `= Toplevel

<dog>
`,
    }
  }
)
assert_lib('bigb output: magic x to image',
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Toplevel

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
      'notindex.bigb': `= Toplevel

<image My dog>

\\Image[dog.jpg]
{title=My dog}

<video My cat>

\\Video[dog.jpg]
{title=My cat}
`,
    }
  }
)
assert_lib('bigb output: x to slash in title',
  // We have to remove slashes, otherwise it searches for scopes instead.
  // Don't have a solution for that now.
  {
    filesystem: {
      'index.bigb': `= Toplevel

<my title>

== My/title
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

<my title>

== My/title
`,
    }
  }
)
assert_lib('bigb output: id from filename',
  // We have to remove slashes, otherwise it searches for scopes instead.
  // Don't have a solution for that now.
  {
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
      'notindex.bigb': `= Toplevel

<notindex2>
`,
      'notindex2.bigb': `= My notindex2
`
    },
    convert_dir: true,
    assert_bigb: {
      'notindex.bigb': `= Toplevel

<notindex2>
`,
    }
  }
)
assert_lib('bigb output: tuberculosis pluralize fail',
  // Was blowing up on pluralize failures. Notably, pluralize is wrong for every -osis suffix,
  // common in scientific literature. This is the current buggy behaviour of pluralize:
  // https://github.com/plurals/pluralize/issues/172
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
      'index.bigb': `= Toplevel

\\x[tuberculosis]{id=x1}

\\x[tuberculosis]{p}{id=x2}

\\x[tuberculosis]{magic}{id=x3}

== Tuberculosis
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

<tuberculosis>{id=x1}

\\x[tuberculosis]{id=x2}{p}

<tuberculosis>{id=x3}

== Tuberculosis
`,
    },
  }
)
assert_lib('bigb output: acronym plural',
  // https://github.com/plurals/pluralize/issues/127
  {
    filesystem: {
      'index.bigb': `= Toplevel

== PC

<PCs>
`,
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

== PC

<PCs>
`,
    }
  }
)
assert_lib('bigb output: to file',
  {
    filesystem: {
      'index.bigb': `= Toplevel

<path/to/my file>{file}

== path/to/my file
{file}
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

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
      'index.bigb': `= Toplevel

<asdf/qwer>

== Qwer
{id=asdf/qwer}
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

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
      'index.bigb': `= Toplevel

<so 3>

== $SO(3)$
`,
      'path/to/my file': '',
    },
    convert_dir: true,
    assert_bigb: {
      'index.bigb': `= Toplevel

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
assert_lib_error('bigb output: newline in header title fails gracefully',
  `\\H[1][ab
cd]`,
  2, 1, undefined,
  {
    convert_opts: { output_format: ourbigbook.OUTPUT_FORMAT_OURBIGBOOK },
    error_message: 'cannot place \\br inside of \\H',
  }
)
assert_lib('bigb output: x convert parent, tag and child IDs to shorthand magic',
  {
    filesystem: {
      'index.bigb': `= Toplevel

= My \\i[h2] é \\}
{disambiguate=dis}
{parent=}

= My h3
{parent=my-h2-e-dis}
{tag=my-h2-e-dis}

= Myscope
{parent=}
{scope}

= Myscope
{parent=myscope}

= Escape scope
{parent=/myscope}
`,
    },
    convert_dir: true,
    convert_opts: { ourbigbook_json: { enableArg: { 'H': { 'child': true } } } },
    assert_bigb: {
      'index.bigb': `= Toplevel

= My \\i[h2] é \\}
{disambiguate=dis}
{parent}

= My h3
{parent=My h2 é (dis)}
{tag=My h2 é (dis)}

= Myscope
{parent}
{scope}

= Myscope
{parent=Myscope}

= Escape scope
{parent=/Myscope}
`,
    }
  }
)
assert_lib('bigb output: header parent simple works',
  {
    stdin: `= Toplevel

== H2

= H3
{parent=H2}
`,
    assert_bigb_stdout: `= Toplevel

== H2

= H3
{parent=H2}
`,
  }
)
assert_lib('bigb output: header tag works does not blow up',
  {
    stdin: `= Toplevel

== H2

=== H3
{tag=H2}
`,
    assert_bigb_stdout: `= Toplevel

== H2

=== H3
{tag=H2}
`,
  }
)
assert_lib('bigb output: split_headers',
  {
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
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
assert_lib('bigb output: sane quotes to shorthand quotes',
  {
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Q[in1]

After:

\\Q[in2]
\\Q[in3]

And at last.
`,
    },
    assert_bigb: {
      'index.bigb': `= Toplevel

> in1

After:

> in2
> in3

And at last.
`,
    }
  }
)

// ourbigbook executable tests.
assert_cli(
  'stdin: input from stdin produces output on stdout simple',
  {
    stdin: 'aabb',
    assert_not_exists: [TMP_DIRNAME],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
)
assert_cli(
  'stdin: input from stdin produces output on stdout when in git repository',
  {
    pre_exec: [['git', ['init']]],
    stdin: 'aabb',
    assert_not_exists: [TMP_DIRNAME],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
)
assert_cli(
  // Was blowing up on file existence check.
  'stdin: input from stdin with relative link does not blow up',
  {
    stdin: '\\a[asdf]',
    assert_not_exists: [TMP_DIRNAME],
    assert_xpath_stdout: [`//x:a[@href='${ourbigbook.RAW_PREFIX}/asdf']`],
    filesystem: { 'asdf': '' },
  }
)
assert_cli(
  'stdin: input from stdin ignores ourbigbook.liquid.html',
  {
    stdin: 'qwer',
    assert_xpath_stdout: [`//x:div[@class='p' and text()='qwer']`],
    filesystem: {
      'ourbigbook.liquid.html': 'asdf'
    },
  }
)
assert_cli(
  'input from file and --stdout produces output on stdout',
  {
    args: ['--stdout', 'index.bigb'],
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
    filesystem: { 'index.bigb': '= Notindex\n\naabb\n' },
  }
)
assert_cli(
  'input from file produces an output file',
  {
    args: ['notindex.bigb'],
    pre_exec: [
      { cmd: ['ourbigbook', ['--no-render', '.']], },
    ],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex\n`,
      'ourbigbook.json': '{}\n',
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/notindex.html`]: [xpath_header(1, 'notindex')],
    }
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/340
  'input from a file must start with an h1 header, plaintext leads to error',
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `aaa\n`,
    },
    assert_exit_status: 1,
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/340
  'input from a file must start with an h1 header, h2 leads to error',
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `== aaa\n`,
    },
    assert_exit_status: 1,
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/340
  'input from a file cannot be empty',
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `\n`,
    },
    assert_exit_status: 1,
  }
)
assert_cli(
  'input from stdin does not need to start with a header',
  {
    stdin: 'aabb',
    assert_xpath_stdout: ["//x:div[@class='p' and text()='aabb']"],
  }
)
assert_cli(
  'input from two files produces two output files',
  {
    pre_exec: [
      { cmd: ['ourbigbook', ['--no-render', '.']], },
    ],
    args: ['index.bigb', 'notindex.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex\n`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [xpath_header(1, '')],
      [`${TMP_DIRNAME}/html/notindex.html`]: [xpath_header(1, 'notindex')],
    }
  }
)
assert_cli(
  '--no-render prevents rendering',
  {
    args: ['--no-render', 'index.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel\n`,
    },
    assert_exists: [
      // This would be good to assert, but it then fails the test on PostgreSQL
      //`${TMP_DIRNAME}/db.sqlite3`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/index.html`
    ],
  }
)
assert_cli(
  'db is checked for duplicates by default',
  {
    args: ['--no-render', '.'],
    filesystem: {
      'notindex.bigb': `= Notindex

== Duplicated
`,
      'notindex2.bigb': `= Notindex2

== Duplicated
`,
    },
    assert_exit_status: 1,
  }
)
assert_cli(
  '--check-db-only exits with error status on failure',
  {
    pre_exec: [
      { cmd: ['ourbigbook', ['--no-check-db', '--no-render', '.']], },
    ],
    args: ['--check-db-only'],
    filesystem: {
      'notindex.bigb': `= Notindex

== Duplicated
`,
      'notindex2.bigb': `= Notindex2

== Duplicated
`,
    },
    assert_exit_status: 1,
  }
)
const complex_filesystem = {
  'index.bigb': `= Toplevel

\\x[notindex][link to notindex]

\\x[h2]{full}

\\x[notindex-h2][link to notindex h2]

\\x[has-split-suffix][link to has split suffix]

\\x[toplevel-scope]

\\x[toplevel-scope/toplevel-scope-h2]

\\x[subdir][link to subdir]

\\x[subdir/toplevel-h2][link to subdir toplevel h2]

\\x[subdir/notindex][link to subdir notindex]

\\x[subdir/notindex-h2][link to subdir notindex h2]

\\x[included-by-index][link to included by index]

$$
\\newcommand{\\mycmd}[0]{hello}
$$

\\OurBigBookExample[[
\\Q[A Ourbigbook example!]
]]

\\Include[notindex]
\\Include[included-by-index]
\\Include[toplevel-scope]
\\Include[notindex-splitsuffix]
\\Include[subdir]
\\Include[subdir/notindex]

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

== My toplevel scope
{scope}

=== My toplevel scope child

=== My toplevel scope 2
{scope}

== Has split suffix
{splitSuffix}
`,
  'notindex.bigb': `= Notindex

\\x[toplevel][link to toplevel]

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

\\x[toplevel][link to toplevel]

\\x[h2][link to toplevel subheader]

\\x[has-split-suffix][link to has split suffix]

\\x[notindex][link to subdir notindex]

\\Include[included-by-subdir-index]

== Scope
{scope}

=== h3

\\x[scope][scope/h3 to scope]

\\x[h3][scope/h3 to scope/h3]

== Toplevel h2
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
  // Was blowing up during the implementation of
  // https://github.com/ourbigbook/ourbigbook/issues/340
  // because the OurBigBookExample creates a new toplevel parse,
  // but it should not lint startsWithH1Header.
  'OurBigBook Example: does not blow up in CLI file conversion when not starting in header',
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\OurBigBookExample[[aaa]]`
    }
  }
)
assert_cli(
  // This is a big catch-all and should likely be split.
  'input from directory with ourbigbook.json produces several output files',
  {
    args: ['--split-headers', '.'],
    filesystem: complex_filesystem,
    assert_xpath: {
      [`${TMP_DIRNAME}/html/h2-2.html`]: [
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='Section \"h2\"']",
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section \"h4 3 2 1\"']",
      ],
      [`${TMP_DIRNAME}/html/h3-2-1.html`]: [
        // Not a child of the current toplevel either.
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section \"h4 3 2 1\"']",
      ],
      [`${TMP_DIRNAME}/html/h2-3.html`]: [
        // This one is under the current tree, so it shows fully.
        "//x:div[@class='p']//x:a[@href='index.html#h4-3-2-1' and text()='Section \"h4 3 2 1\"']",
      ],
      [`${TMP_DIRNAME}/html/notindex.html`]: [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='index.html' and text()='link to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='link to h2']",
      ],
      [`${TMP_DIRNAME}/html/has-split-suffix-split.html`]: [
        xpath_header(1, 'has-split-suffix'),
      ],
      // Custom splitSuffix `-asdf` instead of the default `-split`.
      [`${TMP_DIRNAME}/html/index.html`]: [
        xpath_header(1, ''),
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='link to notindex h2']",
        "//x:div[@class='p']//x:a[@href='#has-split-suffix' and text()='link to has split suffix']",
        "//x:a[@href='subdir.html' and text()='link to subdir']",
        "//x:a[@href='subdir.html#toplevel-h2' and text()='link to subdir toplevel h2']",
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
        "//x:a[@href='subdir/notindex.html#notindex-h2' and text()='link to subdir notindex h2']",

        // ToC entries of includes point directly to the separate file, not to the plceholder header.
        // e.g. `included-by-index.html` instead of `#included-by-index`.
        "//x:a[@href='included-by-index.html' and text()='link to included by index']",
        "//*[@id='_toc']//x:a[@href='included-by-index.html' and text()='Included by index']",

        xpath_header(2, 'included-by-index'),
        "//x:blockquote[text()='A Ourbigbook example!']",
        xpath_header_split(2, 'my-toplevel-scope', 'my-toplevel-scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(3, 'my-toplevel-scope/my-toplevel-scope-2', 'my-toplevel-scope/my-toplevel-scope-2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/included-by-index.html`]: [
        // Cross input file header.
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Home'),
      ],
      [`${TMP_DIRNAME}/html/included-by-index-split.html`]: [
        // Cross input file header on split header.
        xpath_header_parent(1, 'included-by-index', 'index.html', 'Home'),
      ],
      [`${TMP_DIRNAME}/html/included-by-h2-in-index.html`]: [
        xpath_header_parent(1, 'included-by-h2-in-index', 'index.html#h2', 'h2'),
      ],
      [`${TMP_DIRNAME}/html/included-by-h2-in-index-split.html`]: [
        xpath_header_parent(1, 'included-by-h2-in-index', 'index.html#h2', 'h2'),
      ],
      [`${TMP_DIRNAME}/html/notindex-splitsuffix-asdf.html`]: [
      ],
      [`${TMP_DIRNAME}/html/split.html`]: [
        // Full links between split header pages have correct numbering.
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='Section \"h2\"']",

        // OurBigBookExample renders in split header.
        "//x:blockquote[text()='A Ourbigbook example!']",

        // We have gone back and forth on split vs nosplit here a bit.
        // Related: https://github.com/ourbigbook/ourbigbook/issues/146
        "//*[@id='_toc']//x:a[@href='index.html#h2' and text()='h2']",
        // ToC entries of includes always point directly to the separate file.
        "//*[@id='_toc']//x:a[@href='included-by-index.html' and text()='Included by index']",
        // TODO This is more correct with the `1. `. Maybe wait for https://github.com/ourbigbook/ourbigbook/issues/126
        // to make sure we don't have to rewrite everything.
        //"//*[@id='_toc']//x:a[@href='included-by-index-split.html' and text()='1. Included by index']",
      ],
      [`${TMP_DIRNAME}/html/subdir.html`]: [
        xpath_header(1),
        xpath_header_split(1, '', 'subdir/split.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(2, 'toplevel-h2'),
        xpath_header_split(2, 'toplevel-h2', 'subdir/toplevel-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(2, 'scope'),
        xpath_header_split(2, 'scope', 'subdir/scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header(3, 'scope/h3'),
        xpath_header_split(3, 'scope/h3', 'subdir/scope/h3.html', ourbigbook.SPLIT_MARKER_TEXT),
        "//x:a[@href='index.html' and text()='link to toplevel']",
        "//x:a[@href='index.html#h2' and text()='link to toplevel subheader']",
        "//x:a[@href='subdir/notindex.html' and text()='link to subdir notindex']",
      ],
      [`${TMP_DIRNAME}/html/subdir/split.html`]: [
        xpath_header(1, ''),
        xpath_header_split(1, '', '../subdir.html', ourbigbook.NOSPLIT_MARKER_TEXT),
        // Check that split suffix works. Should be has-split-suffix-split.html,
        // not has-split-suffix.html.
        "//x:div[@class='p']//x:a[@href='../index.html#has-split-suffix' and text()='link to has split suffix']",
      ],
      [`${TMP_DIRNAME}/html/subdir/scope/h3.html`]: [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../../subdir.html#scope/h3', ourbigbook.NOSPLIT_MARKER_TEXT),
        "//x:div[@class='p']//x:a[@href='../../subdir.html#scope' and text()='scope/h3 to scope']",
        "//x:div[@class='p']//x:a[@href='../../subdir.html#scope/h3' and text()='scope/h3 to scope/h3']",
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [
        xpath_header(1, 'notindex'),
        xpath_header(2, 'notindex-h2'),
        xpath_header_split(2, 'notindex-h2', 'notindex-h2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex-scope/h3.html`]: [
        xpath_header(1, 'h3'),
        xpath_header_split(1, 'h3', '../notindex.html#notindex-scope/h3', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/subdir/toplevel-h2.html`]: [
        xpath_header(1, 'toplevel-h2'),
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex-h2.html`]: [
        xpath_header(1, 'notindex-h2'),
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex-split.html`]: [
        xpath_header(1, 'notindex'),
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex-h2.html`]: [
        xpath_header(1, 'notindex-h2'),
      ],
      [`${TMP_DIRNAME}/html/my-toplevel-scope.html`]: [
        xpath_header_split(1, 'my-toplevel-scope', 'index.html#my-toplevel-scope', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/my-toplevel-scope/my-toplevel-scope-child.html`]: [
        // https://github.com/ourbigbook/ourbigbook/issues/159
        xpath_header_split(1, 'my-toplevel-scope-child', '../index.html#my-toplevel-scope/my-toplevel-scope-child', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/my-toplevel-scope/my-toplevel-scope-2.html`]: [
        // https://github.com/ourbigbook/ourbigbook/issues/159
        xpath_header_split(1, 'my-toplevel-scope-2', '../index.html#my-toplevel-scope/my-toplevel-scope-2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/toplevel-scope.html`]: [
        xpath_header_split(2, 'nested-scope', 'toplevel-scope/nested-scope.html', ourbigbook.SPLIT_MARKER_TEXT),
        xpath_header_split(3, 'nested-scope/nested-scope-2', 'toplevel-scope/nested-scope/nested-scope-2.html', ourbigbook.SPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/toplevel-scope-split.html`]: [
        xpath_header_split(1, 'toplevel-scope', 'toplevel-scope.html', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/toplevel-scope/toplevel-scope-h2.html`]: [
        xpath_header_split(1, 'toplevel-scope-h2', '../toplevel-scope.html#toplevel-scope-h2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/toplevel-scope/nested-scope.html`]: [
        xpath_header_split(1, 'nested-scope', '../toplevel-scope.html#nested-scope', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],
      [`${TMP_DIRNAME}/html/toplevel-scope/nested-scope/nested-scope-2.html`]: [
        // https://github.com/ourbigbook/ourbigbook/issues/159
        xpath_header_split(1, 'nested-scope-2', '../../toplevel-scope.html#nested-scope/nested-scope-2', ourbigbook.NOSPLIT_MARKER_TEXT),
      ],

      // Non converted paths.
      [`${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss.css`]: [],
      [`${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ourbigbook.json`]: [],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/split.html`]: [
        // Included header placeholders are removed from split headers.
        xpath_header(1, 'included-by-index'),
        xpath_header(2, 'included-by-index'),
      ],
    },
  }
)
const publish_filesystem = {
  'ourbigbook.json': `{}\n`,
  'index.bigb': `= Toplevel

\\x[notindex][link to notindex]

\\x[notindex-h2][link to notindex h2]

\\Include[notindex]
\\Include[toplevel-scope]
\\Include[subdir]

== h2
`,
  'notindex.bigb': `= Notindex

\\x[toplevel][link to toplevel]

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
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css`,
      // Non-converted files are copied over.
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/scss.css`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/ourbigbook.json`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/subdir/myfile.txt`,

      // Directories listings are generated.
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.DIR_PREFIX}/index.html`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.DIR_PREFIX}/subdir/index.html`,
    ],
    assert_not_exists: [
      // logo.svg is not added when web.linkFromStaticHeaderMetaToWeb is not enabled on ourbigbook.json
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/_obb/logo.svg`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/index.html`]: [
        "//x:div[@class='p']//x:a[@href='notindex' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex#notindex-h2' and text()='link to notindex h2']",
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/notindex.html`]: [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='.' and text()='link to toplevel']",
        "//x:div[@class='p']//x:a[@href='.#h2' and text()='link to h2']",
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/toplevel-scope/toplevel-scope-h2.html`]: [
        `//x:style[contains(text(),'@import \"../${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/subdir.html`]: [
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
    },
  }
)
assert_cli(
  'publish: --publish-target local works',
  {
    args: ['--dry-run', '--split-headers', '--publish', '--publish-target', 'local', '.'],
    filesystem: publish_filesystem,
    pre_exec: publish_pre_exec,
    assert_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/index.html`]: [
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='link to notindex']",
        "//x:div[@class='p']//x:a[@href='notindex.html#notindex-h2' and text()='link to notindex h2']",
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/notindex.html`]: [
        xpath_header(1, 'notindex'),
        "//x:div[@class='p']//x:a[@href='index.html' and text()='link to toplevel']",
        "//x:div[@class='p']//x:a[@href='index.html#h2' and text()='link to h2']",
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/toplevel-scope/toplevel-scope-h2.html`]: [
        `//x:style[contains(text(),'@import \"../${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/subdir.html`]: [
        `//x:style[contains(text(),'@import \"${ourbigbook_nodejs.PUBLISH_ASSET_DIST_PREFIX}/ourbigbook.css\"')]`,
      ],
      // Non-converted files are copied over.
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/${ourbigbook.RAW_PREFIX}/scss.css`]: [],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/${ourbigbook.RAW_PREFIX}/ourbigbook.json`]: [],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/${ourbigbook.RAW_PREFIX}/subdir/myfile.txt`]: [],
    },
  }
)
assert_cli(
  'publish: --publish-target local sets publishTargetIsWebsite to false',
  {
    args: ['--dry-run', '--split-headers', '--publish', '--publish-target', 'local', '.'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
  'ourbigbook.json': `{}\n`,
      'ourbigbook.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
{% unless publishTargetIsWebsite %}<div id="dut"></div>{% endunless %}
</body>
</html>
` ,
},
    pre_exec: publish_pre_exec,
    assert_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/local/index.html`]: [
        "//x:div[@id='dut']",
      ],
    },
  }
)
assert_cli(
  'publish: publishTargetIsWebsite is true without --publish-target local',
  {
    args: ['--dry-run', '--split-headers', '--publish'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
  'ourbigbook.json': `{}\n`,
      'ourbigbook.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
{% if publishTargetIsWebsite %}<div id="dut"></div>{% endif %}
</body>
</html>
` ,
},
    pre_exec: publish_pre_exec,
    assert_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/index.html`]: [
        "//x:div[@id='dut']",
      ],
    },
  }
)
assert_cli(
  'json: web.linkFromStaticHeaderMetaToWeb = true with publish',
  {
    args: ['--dry-run', '--split-headers', '--publish', '.'],
    filesystem: {
      'ourbigbook.json': `{
  "web": {
    "linkFromStaticHeaderMetaToWeb": true,
    "username": "myusername"
  }
}
`,
      'index.bigb': `= Toplevel

== h2
{scope}

=== h2 2
`,
    },
    pre_exec: publish_pre_exec,
    assert_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/_obb/logo.svg`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/index.html`]: [
        "//x:div[contains(@class, \"h \")]//x:img[@class='logo' and @src='_obb/logo.svg']",
        "//x:div[contains(@class, \"h \")]//x:a[@href='https://ourbigbook.com/myusername' and text()=' OurBigBook.com']",
        "//x:div[@class='h' and @id='h2']//x:a[@href='https://ourbigbook.com/myusername/h2' and text()=' OurBigBook.com']",
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/h2/h2-2.html`]: [
        "//x:div[contains(@class, \"h \") and @id='h2-2']//x:img[@class='logo' and @src='../_obb/logo.svg']",
        "//x:div[contains(@class, \"h \") and @id='h2-2']//x:a[@href='https://ourbigbook.com/myusername/h2/h2-2' and text()=' OurBigBook.com']",
      ],
    },
  }
)
assert_cli(
  'json: web.host changes web.linkFromStaticHeaderMetaToWeb host',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{
  "web": {
    "linkFromStaticHeaderMetaToWeb": true,
    "host": "asdf.com",
    "username": "myusername"
  }
}
`,
      'index.bigb': `= Toplevel
`,
    },
    pre_exec: publish_pre_exec,
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[contains(@class, \"h \")]//x:a[@href='https://asdf.com/myusername' and text()=' asdf.com']",
      ],
    },
  }
)
assert_cli(
  'json: web.hostCapitalized takes precedence over web.host with web.linkFromStaticHeaderMetaToWeb',
  {
    args: ['.'],
    filesystem: {
      'ourbigbook.json': `{
  "web": {
    "linkFromStaticHeaderMetaToWeb": true,
    "host": "asdf.com",
    "hostCapitalized": "AsDf.com",
    "username": "myusername"
  }
}
`,
      'index.bigb': `= Toplevel
`,
    },
    pre_exec: publish_pre_exec,
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[contains(@class, \"h \")]//x:a[@href='https://asdf.com/myusername' and text()=' AsDf.com']",
      ],
    },
  }
)
assert_cli(
  'json: web.linkFromStaticHeaderMetaToWeb = true without publish',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'ourbigbook.json': `{
  "web": {
    "linkFromStaticHeaderMetaToWeb": true,
    "username": "myusername"
  }
}
`,
      'index.bigb': `= Toplevel

== h2
{scope}

=== h2 2
`,
    },
    pre_exec: publish_pre_exec,
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:div[contains(@class, "h ")]//x:img[@class='logo' and @src='${ourbigbook_nodejs.LOGO_PATH}']`,
        "//x:div[contains(@class, \"h \")]//x:a[@href='https://ourbigbook.com/myusername' and text()=' OurBigBook.com']",
        `//x:div[@class='h' and @id='h2']//x:img[@class='logo' and @src='${ourbigbook_nodejs.LOGO_PATH}']`,
        "//x:div[@class='h' and @id='h2']//x:a[@href='https://ourbigbook.com/myusername/h2' and text()=' OurBigBook.com']",
      ],
      [`${TMP_DIRNAME}/html/h2/h2-2.html`]: [
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
    pre_exec: [['ourbigbook', ['--no-render', '.']]],
    filesystem: {
      'ourbigbook.json': `{}\n`,
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Subdir index\n`,
      'subdir/notindex.bigb': `= Subdir notindex\n`,
      // A Sass file.
      'subdir/scss.scss': `body { color: red }\n`,
      // A random non-ourbigbook file.
      'subdir/xml.xml': `<?xml version='1.0'?><a/>\n`,
    },
    // Place out next to ourbigbook.json which should be the toplevel.
    assert_exists: [
      TMP_DIRNAME,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/scss.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/xml.xml`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/subdir/${TMP_DIRNAME}`,
      `${TMP_DIRNAME}/html/xml.xml`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss.css`,
      `${TMP_DIRNAME}/html/index.html`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/subdir.html`]: [xpath_header(1)],
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [xpath_header(1, 'notindex')],
    }
  }
)
assert_cli(
  'convert a subdirectory file only with ourbigbook.json',
  {
    args: ['subdir/notindex.bigb'],
    pre_exec: [['ourbigbook', ['--no-render', '.']]],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Subdir index\n`,
      'subdir/notindex.bigb': `= Subdir notindex\n`,
      'ourbigbook.json': `{}\n`,
    },
    // Place out next to ourbigbook.json which should be the toplevel.
    assert_exists: [TMP_DIRNAME],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/subdir/${TMP_DIRNAME}`,
      `${TMP_DIRNAME}/html/index.html`,
      `${TMP_DIRNAME}/html/subdir.html`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [xpath_header(1, 'notindex')],
    },
  }
)
assert_cli(
  'convert with --outdir',
  {
    args: ['--outdir', 'my_outdir', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
\\Include[subdir/notindex]
`,
      'subdir/index.bigb': `= Subdir index`,
      'subdir/notindex.bigb': `= Subdir notindex`,
      'ourbigbook.json': `{}\n`,
    },
    assert_exists: [
      `my_outdir/${ourbigbook.RAW_PREFIX}`,
      `my_outdir/${ourbigbook.RAW_PREFIX}/ourbigbook.json`,
    ],
    assert_not_exists: [
      TMP_DIRNAME,
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
)
assert_cli(
  'ourbigbook.tex does not blow up',
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel\n\n$$\\mycmd$$\n`,
      'ourbigbook.tex': `\\newcommand{\\mycmd}[0]{hello}`,
    },
  }
)
assert_cli(
  'synonym to outdir generates correct redirct with outdir',
  {
    args: ['--outdir', 'asdf', '--split-headers', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/114
  'synonym to outdir generates correct redirct without outdir',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

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
      [`${TMP_DIRNAME}/html/my-h2-synonym.html`]: [
        "//x:script[text()=\"location='index.html#h2'\"]",
      ],
      [`${TMP_DIRNAME}/html/my-notindex-h2-synonym.html`]: [
        "//x:script[text()=\"location='notindex.html#notindex-h2'\"]",
      ],
    }
  }
)
assert_cli(
  '--generate min followed by conversion does not blow up',
  {
    args: ['.'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ],
  }
)
assert_cli(
  '--generate min followed by publish does not blow up',
  {
    args: ['--publish', '--dry-run'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
)
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
      'subdir/index.bigb',
    ],
    assert_not_exists: [
      'index.bigb',
    ],
  }
)
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
)
assert_cli(
  '--generate subdir followed by conversion does not blow up',
  {
    args: ['docs'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'subdir']],
    ],
  }
)
assert_cli(
  '--generate min followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'min']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
)
assert_cli(
  '--generate default followed by publish conversion does not blow up',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'default']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
)
assert_cli(
  '--generate subdir followed by publish conversion does not blow up', {
    args: ['--dry-run', '--publish', 'docs'],
    pre_exec: [
      ['ourbigbook', ['--generate', 'subdir']],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
  }
)
assert_cli(
  '--embed-resources actually embeds resources',
  {
    args: ['--embed-resources', '.'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        // The start of a minified CSS rule from ourbigbook.scss.
        "//x:style[contains(text(),'.ourbigbook{')]",
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        // The way that we import other sheets.
        "//x:style[contains(text(),'@import ')]",
      ],
    }
  }
)
assert_cli(
  'include with --embed-includes does not blow up filesAreIncluded',
  {
    args: ['--embed-includes', 'index.bigb'],
    pre_exec: [['ourbigbook', ['--no-render', '.']]],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`,
    },
  }
)
assert_cli(
  'reference to subdir with --embed-includes',
  {
    args: ['--embed-includes', 'index.bigb'],
    pre_exec: [['ourbigbook', ['--no-render', '.']]],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
`,
      'subdir/index.bigb': `= Subdir

== h2
`,
    },
  }
)

// executable cwd tests
assert_cli(
  "cwd outside project directory given by ourbigbook.json",
  {
    args: ['myproject'],
    filesystem: {
      'myproject/index.bigb': `= Toplevel

\\x[not-index]

\\x[subdir]

\\Include[not-index]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-index.bigb': `= not index
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
      `myproject/${TMP_DIRNAME}/html`,
      `myproject/${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss.css`,
      `myproject/${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ourbigbook.json`,
    ],
    assert_xpath: {
      [`myproject/${TMP_DIRNAME}/html/index.html`]: [
          xpath_header(1, ''),
      ],
      [`myproject/${TMP_DIRNAME}/html/subdir.html`]: [
          xpath_header(1, ''),
      ]
    }
  }
)
assert_cli(
  "if there is no ourbigbook.json and the input is not under cwd then the project dir is the input dir",
  {
    args: [path.join('..', 'myproject')],
    cwd: 'notmyproject',
    filesystem: {
      'myproject/index.bigb': `= Toplevel

\\x[not-index]

\\x[subdir]

\\Include[not-index]

\\Include[subdir]

\\Include[subdir/notindex]
`,
      'myproject/not-index.bigb': `= not index
`,
      'myproject/scss.scss': `body { color: red }`,
      'myproject/subdir/index.bigb': `= Subdir
`,
      'myproject/subdir/notindex.bigb': `= Subdir Notindex
`,
    },
    assert_exists: [
      `myproject/${TMP_DIRNAME}`,
      `myproject/${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss.css`,
    ],
    assert_xpath: {
      [`myproject/${TMP_DIRNAME}/html/index.html`]: [
          xpath_header(1, ''),
      ],
      [`myproject/${TMP_DIRNAME}/html/subdir.html`]: [
          xpath_header(1, ''),
      ]
    }
  }
)

assert_cli(
  'template: root_relpath and root_path in ourbigbook.liquid.html work',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
{scope}

=== h3
`,
      'ourbigbook.json': `{}
`,
      'ourbigbook.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
<a id="root-relpath" href="{{ root_relpath }}">Root relpath</a>
<a id="root-page" href="{{ root_page }}">Root page</a>
{{ post_body }}
</body>
</html>
`
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='']",
      ],
      [`${TMP_DIRNAME}/html/split.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      [`${TMP_DIRNAME}/html/h2.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      [`${TMP_DIRNAME}/html/notindex.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      [`${TMP_DIRNAME}/html/notindex-split.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      [`${TMP_DIRNAME}/html/notindex-h2.html`]: [
        "//x:a[@id='root-relpath' and @href='']",
        "//x:a[@id='root-page' and @href='index.html']",
      ],
      [`${TMP_DIRNAME}/html/notindex-h2/h3.html`]: [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
    }
  }
)
assert_cli(
  'template: is_index_article',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[subdir]

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
{scope}

=== h3
`,
      'subdir/index.bigb': `= Subdir

== h2
`,
      'ourbigbook.json': `{}
`,
      'ourbigbook.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
{% if is_index_article %}<div id="is-index-article"></div>{% endif %}
</body>
</html>
`
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/split.html`]: [
        "//x:div[@id='is-index-article']",
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/h2.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/notindex.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/notindex-split.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/notindex-h2.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/notindex-h2/h3.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/subdir.html`]: [
        "//x:div[@id='is-index-article']",
      ],
      [`${TMP_DIRNAME}/html/subdir/h2.html`]: [
        "//x:div[@id='is-index-article']",
      ],
    },
  }
)
assert_cli(
  'template: root_relpath and root_page work from subdirs',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]
`,
      'subdir/notindex.bigb': `= Notindex
`,
      'ourbigbook.json': `{}
`,
      'ourbigbook.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
<a id="root-relpath" href="{{ root_relpath }}">Root relpath</a>
<a id="root-page" href="{{ root_page }}">Root page</a>
</body>
</html>
`
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex-split.html`]: [
        "//x:a[@id='root-relpath' and @href='../']",
        "//x:a[@id='root-page' and @href='../index.html']",
      ],
    }
  }
)
assert_cli(
  'template: a custom template can be selected from ourbigbook.json',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]
`,
      'subdir/notindex.bigb': `= Notindex
`,
      'ourbigbook.json': `{
  "template": "custom.liquid.html"
}
`,
      'custom.liquid.html': `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
</head>
<body>
<p>asdf</p>
</body>
</html>
`
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [
        "//x:p[text()='asdf']",
      ],
    }
  }
)
assert_cli(
  'template: null ignores template file',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

asdf
`,
      'ourbigbook.json': `{
  "template": null
}
`,
      'ourbigbook.liquid.html': `asdf`
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[@class='p' and text()='asdf']",
      ],
    }
  }
)

assert_cli(
  "multiple incoming child and parent links don't blow up",
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\x[notindex]{child}

\\x[notindex]{child}

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

\\x[toplevel]{parent}

\\x[toplevel]{parent}
`,
      'ourbigbook.json': `{ "enableArg": { "x": {
  "child": true,
  "parent": true
} } }`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='tagged']//x:a[@href='notindex.html']`,
      ],
    },
  }
)
assert_cli(
  'ourbigbook.json: outputOutOfTree=true',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

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
      `${TMP_DIRNAME}/html/index.html`,
      `${TMP_DIRNAME}/html/split.html`,
      `${TMP_DIRNAME}/html/h2.html`,
      `${TMP_DIRNAME}/html/notindex.html`,
      `${TMP_DIRNAME}/html/notindex-h2.html`,
    ],
    assert_exists_sqlite: [
      `${TMP_DIRNAME}/db.sqlite3`,
    ],
    assert_not_exists: [
      'index.html',
      'split.html',
      'h2.html',
      'notindex.html',
      'notindex-h2.html',
      `${TMP_DIRNAME}/html/${TMP_DIRNAME}`,
    ]
  }
)
assert_cli(
  'ourbigbook.json: outputOutOfTree=false',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

== h2
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`,
      'ourbigbook.json': `{
  "outputOutOfTree": false
}
`,
    },
    assert_exists: [
      'index.html',
      'split.html',
      'h2.html',
      'notindex.html',
      'notindex-h2.html',
    ],
    assert_exists_sqlite: [
      `${TMP_DIRNAME}/db.sqlite3`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/index.html`,
      `${TMP_DIRNAME}/split.html`,
      `${TMP_DIRNAME}/h2.html`,
      `${TMP_DIRNAME}/notindex.html`,
      `${TMP_DIRNAME}/notindex-h2.html`,
      `${TMP_DIRNAME}/html/${TMP_DIRNAME}`,
    ]
  }
)
assert_cli(
  'IDs are removed from the database after you removed them from the source file and convert the file',
  {
    args: ['notindex.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

== h2
`,
      'notindex.bigb': `= Notindex
`,
    },
    pre_exec: [
      ['ourbigbook', ['.']],
      // Remove h2 from index.bigb
      {
        filesystem_update: {
          'index.bigb': `= Toplevel

\\Include[notindex]
`,
        }
      },
      ['ourbigbook', ['index.bigb']],
      // Add h2 to notindex.bigb
      {
        filesystem_update: {
          'notindex.bigb': `= Notindex

== h2
`,
        }
      },
    ],
  }
)
assert_cli(
  'IDs are removed from the database after you removed them from the source file and convert the directory',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['.']],
      // Remove h2 from notindex.bigb
      {
        filesystem_update: {
          'notindex.bigb': `= Toplevel
`,
        }
      },
      ['ourbigbook', ['.']],
      // Add h2 to index..bigb
      {
        filesystem_update: {
          'index.bigb': `= Toplevel

\\Include[notindex]

== h2
`,
        }
      },
    ],
  }
)
assert_cli(
  'IDs are removed from the database after you delete the source file they were present in and convert the directory',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== h2
`,
    },
    pre_exec: [
      ['ourbigbook', ['.']],
      {
        filesystem_update: {
          'index.bigb': `= Toplevel

== h2
`,
          'notindex.bigb': null,
        }
      },
    ],
  }
)
assert_cli(
  'when invoking with a single file timestamps are automatically ignored and render is forced',
  {
    args: ['notindex.bigb'],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/notindex.html`]: [
        `//x:a[@href='index.html#h2' and text()='h2 hacked']`,
      ],
    },
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]

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
          'index.bigb': `= Toplevel

\\Include[notindex]

== h2 hacked
{id=h2}
`,
        }
      },
      ['ourbigbook', ['index.bigb']],
    ],
  }
)

assert_cli(
  // Related: https://github.com/ourbigbook/ourbigbook/issues/340
  "toplevel index file without a header produces output to index.html",
  {
    args: ['index.bigb'],
    filesystem: {
      'index.bigb': `asdf\n`,
      'ourbigbook.json': `{ "lint": { "startsWithH1Header": false } }\n`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[@class='p' and text()='asdf']",
      ],
    },
  }
)
assert_cli('cross file ancestors work on single file conversions at toplevel',
  {
    // After we pre-convert everything, we convert just one file to ensure that the ancestors are coming
    // purely from the database, and not from a cache shared across several input files.
    args: ['notindex3.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

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
      [`${TMP_DIRNAME}/html/notindex.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
      ],
      [`${TMP_DIRNAME}/html/notindex2.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1']`,
      ],
      [`${TMP_DIRNAME}/html/notindex3.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='2']`,
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
)
assert_cli('cross file ancestors work on single file conversions in subdir',
  {
    // After we pre-convert everything, we convert just one file to ensure that the ancestors are coming
    // purely from the database, and not from a cache shared across several input files.
    args: ['subdir/notindex3.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir]
`,
      'subdir/index.bigb': `= Toplevel

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
      [`${TMP_DIRNAME}/html/subdir.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='index.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex2.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/notindex3.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex2.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='0']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='notindex.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='1']`,
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']//x:a[@href='../subdir.html' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='2']`,
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:ol[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='ancestors']`,
      ],
    },
  }
)
assert_cli(
  // See also corresponding lib: test.
  'incoming links: internal link incoming links and other children with magic',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[subdir/notindex]

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
      [`${TMP_DIRNAME}/html/dog.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html#to-dog']`,
      ],
      [`${TMP_DIRNAME}/html/dogs.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='subdir/notindex.html#to-dogs']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/cat.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html']`,
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/dog.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dogs']`,
      ],
      [`${TMP_DIRNAME}/html/dogs.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']//x:a[@href='notindex.html#to-dog']`,
      ],
      [`${TMP_DIRNAME}/html/cat.html`]: [
        `//x:ul[@${ourbigbook.Macro.TEST_DATA_HTML_PROP}='incoming-links']`,
      ],
    },
  }
)

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
      [`${TMP_DIRNAME}/html/from.html`]: [
        "//x:script[text()=\"location='tourl.html'\"]",
      ],
      [`${TMP_DIRNAME}/html/from2.html`]: [
        // .html not added because it is an absolute URL.
        "//x:script[text()=\"location='https://tourl.com'\"]",
      ],
    },
  }
)

assert_cli('toplevel scope gets removed on table of contents of included headers',
  {
    args: ['--split-headers', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
{scope}

== Notindex h2
`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
      ],
      [`${TMP_DIRNAME}/html/split.html`]: [
        "//*[@id='_toc']//x:a[@href='notindex.html' and text()='Notindex']",
        "//*[@id='_toc']//x:a[@href='notindex.html#notindex-h2' and text()='Notindex h2']",
      ],
    },
  },
)
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
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/241
  'fixing a header parent bug on a file in the include chain does not blow up afterwards',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_cli(
  // This is a bit annoying to test from _lib because ourbigbook CLI
  // has to pass several variables for it to work.
  'link: media-provider github local path with outputOutOfTree',
  {
    args: ['myproj'],
    filesystem: {
      'myproj/index.bigb': `= Toplevel

\\Image[myimg.png]{provider=github}
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
      [`myproj/${TMP_DIRNAME}/html/index.html`]: [
        // Two .. to get out from under _out/html, and one from the media-providers ../myproj-media.
        "//x:a[@href='../../../myproj-media/myimg.png']//x:img[@src='../../../myproj-media/myimg.png']",
      ],
    },
  }
)
assert_cli(
  // This is a bit annoying to test from _lib because ourbigbook CLI
  // has to pass several variables for it to work.
  'link: media-provider github local path with outputOutOfTree=false',
  {
    args: ['myproj'],
    filesystem: {
      'myproj/index.bigb': `= Toplevel

\\Image[myimg.png]{provider=github}
`,
      'myproj/ourbigbook.json': `{
  "media-providers": {
    "github": {
      "path": "../myproj-media",
      "remote": "cirosantilli/myproj-media"
    }
  },
  "outputOutOfTree": false
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
)
assert_cli(
  'link: media-provider github local path is not used when publishing',
  {
    args: ['--dry-run', '--publish'],
    cwd: 'myproj',
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'myproj/index.bigb': `= Toplevel

\\Image[myimg.png]{provider=github}
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
      [`myproj/${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/index.html`]: [
        "//x:a[@href='https://raw.githubusercontent.com/cirosantilli/myproj-media/master/myimg.png']//x:img[@src='https://raw.githubusercontent.com/cirosantilli/myproj-media/master/myimg.png']",
      ],
    },
  }
)
assert_cli(
  'timestamps are tracked separately for different --output-format',
  {
    args: ['--output-format', 'bigb', '.'],
    filesystem: {
      'index.bigb': `= Toplevel\n\nHello \\i[world]!\n`,
      'ourbigbook.json': `{
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
          'index.bigb': `= Toplevel\n\nHello \\i[world2]!\n`,
        }
      },
      {
        cmd: ['ourbigbook', ['--output-format', 'html', '.']],
      },
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:i[text()='world2']",
      ],
    },
    assert_bigb: {
      [`${TMP_DIRNAME}/bigb/index.bigb`]: `= Toplevel\n\nHello \\i[world2]!\n`,
    },
  }
)
assert_cli('bigb output: synonym with split_headers does not produce redirect files',
  {
    args: ['--split-headers', '--output-format', 'bigb', '.'],
    convert_opts: { split_headers: true },
    convert_dir: true,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Notindex 2

= Notindex 2 2
{synonym}
`,
    },
    // Just for sanity, not the actual test.
    assert_bigb: {
      [`${TMP_DIRNAME}/bigb/notindex-split.bigb`]: `= Notindex
`,
      [`${TMP_DIRNAME}/bigb/notindex-2.bigb`]: `= Notindex 2

= Notindex 2 2
{synonym}
`,
    },
    assert_not_exists: [
      `${TMP_DIRNAME}/bigb/notindex-2-2.bigb`,
      // The actual test.
      `${TMP_DIRNAME}/bigb/notindex-2-2.html`,
      `${TMP_DIRNAME}/html/notindex-2-2.bigb`,
      `${TMP_DIRNAME}/html/notindex-2-2.html`,
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
)
assert_cli(
  'raw: bigb source files are copied into raw',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[subdir]
\\Include[subdir/notindex]
`,
      'notindex.bigb': `= Notindex\n`,
      'subdir/index.bigb': `= Subdir\n`,
      'subdir/notindex.bigb': `= Subdir/notindex\n`,
      'main.scss': ``,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/index.bigb`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/notindex.bigb`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/index.bigb`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/notindex.bigb`,
      // Also the source of other converted formats like SCSS.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/main.scss`,
    ]
  }
)
assert_cli(
  // Due to https://docs.github.com/todo/1 should be 1 triple conversion
  // stopped failing. But it should fail.
  'x: to undefined ID fails each time despite timestamp skip',
  {
    args: ['.'],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel

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
)
assert_cli(
  'raw: directory listings simple',
  {
    args: ['-S', '.'],
    filesystem: {
      'index.bigb': `= Toplevel

\\a[.][link to root]

\\a[subdir][link to subdir]

\\a[subdir/subdir2][link to subdir2]

\\a[index.html][toplevel to index.html]

\\a[_index.html][toplevel to _index.html]

\\a[subdir/index.html][toplevel to subdir/index.html]

\\Include[subdir]
\\Include[subdir/subdir2]

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
      'myfile.txt': `myfile.txt line1

myfile.txt line2
`,
      // An image and video to make sure the image handling is taken care of on file autogen. Yes there was a bug.
      'myfile-autogen.png': `aaa`,
      'myfile-autogen.mp4': `aaa`,

      // File and dir autogen escaping of magic OBB characters. Everything breaks everything.
      // Directory.
      '[/hello.txt': `aaa`,
      // File.
      '[.txt': `aaa`,

      // HTML escapes don't blow things up.
      '&.txt': `aaa`,

      'index.html': '',
      '_index.html': '',
      'subdir/myfile-subdir.txt': `myfile-subdir.txt line1

myfile-subdir.txt line2
`,
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
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/myfile.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/myfile-autogen.png`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/myfile-autogen.mp4`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/_index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/[.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/[/hello.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/&.txt`,

      // Auto-generated {file} by ourbigbook CLI.
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/myfile.txt.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/_index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html`,
    ],
    assert_not_exists: [
      // Ignored directories are not listed.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/.git/index.html`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='subdir' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir__subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='subdir2' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir/subdir2__subdir/subdir2']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,

        `//x:a[@href='${ourbigbook.RAW_PREFIX}/index.html' and text()='toplevel to index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/_index.html' and text()='toplevel to _index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='toplevel to subdir/index.html']`,
      ],
      [`${TMP_DIRNAME}/html/subdir.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/subdir2.html`]: [
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/index.html' and text()='link to root']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='link to subdir']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html' and text()='link to subdir2']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`]: [
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/myfile.txt.html' and text()='myfile.txt']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/index.bigb.html' and text()='index.bigb']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/index.html.html' and text()='index.html']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/_index.html.html' and text()='_index.html']`,

        `//x:a[@href='subdir/index.html' and text()='subdir/']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir/index.html`]: [
        `//x:a[@href='../../${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html' and text()='myfile-subdir.txt']`,
        `//x:a[@href='../../${ourbigbook.FILE_PREFIX}/subdir/index.html.html' and text()='index.html']`,

        `//x:a[@href='subdir2/index.html' and text()='subdir2/']`,
        `//x:a[@href='../index.html' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html`]: [
        `//x:a[@href='../../index.html' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
        `//x:a[@href='../index.html' and text()='subdir']`,
      ],

      // Auto-generated {file} by ourbigbook CLI.
      // It feels natural to slot testing for that here.
      [`${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/myfile.txt.html`]: [
        // We actually get the full path always on the title of a {file} header.
        "//x:h1//x:a[text()='myfile.txt']",
        "//x:code[starts-with(text(), 'myfile.txt line1')]",
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/index.html' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
        `//x:a[@href='../${ourbigbook.RAW_PREFIX}/myfile.txt' and text()='myfile.txt' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/myfile.txt__myfile.txt']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html`]: [
        "//x:h1//x:a[text()='subdir/myfile-subdir.txt']",
        "//x:code[starts-with(text(), 'myfile-subdir.txt line1')]",
        `//x:a[@href='../../${ourbigbook.DIR_PREFIX}/index.html' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
        `//x:a[@href='../../${ourbigbook.DIR_PREFIX}/subdir/index.html' and text()='subdir' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt__subdir']`,
        `//x:a[@href='../../${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt' and text()='myfile-subdir.txt' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt__subdir/myfile-subdir.txt']`,
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        `//x:a[text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,

        // Ignored files don't show on listing.
        "//x:a[text()='.git']",
        "//x:a[text()='.git/']",
      ],
    },
  }
)
assert_cli(
  'raw: directory listings without .html',
  {
    args: ['-S', '.'],
    filesystem: {
      'ourbigbook.json': `{
  "htmlXExtension": false
}`,
      'index.bigb': `= Toplevel

\\a[.][link to root]

\\a[subdir][link to subdir]

\\a[subdir/subdir2][link to subdir2]

\\a[index.html][toplevel to index.html]

\\a[_index.html][toplevel to _index.html]

\\a[subdir/index.html][toplevel to subdir/index.html]

\\Include[subdir]
\\Include[subdir/subdir2]

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
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/myfile.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/_index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt`,

      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/myfile.txt.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/_index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/index.html.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html`,
    ],
    assert_not_exists: [
      // Ignored directories are not listed.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/.git/index.html`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='subdir' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir__subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='subdir2' and @${ourbigbook.Macro.TEST_DATA_HTML_PROP}='${ourbigbook.FILE_PREFIX}/subdir/subdir2__subdir/subdir2']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,

        `//x:a[@href='${ourbigbook.RAW_PREFIX}/index.html' and text()='toplevel to index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/_index.html' and text()='toplevel to _index.html']`,
        `//x:a[@href='${ourbigbook.RAW_PREFIX}/subdir/index.html' and text()='toplevel to subdir/index.html']`,
      ],
      [`${TMP_DIRNAME}/html/subdir.html`]: [
        `//x:a[@href='${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,
      ],
      [`${TMP_DIRNAME}/html/subdir/subdir2.html`]: [
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}' and text()='link to root']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir' and text()='link to subdir']`,
        `//x:a[@href='../${ourbigbook.DIR_PREFIX}/subdir/subdir2' and text()='link to subdir2']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`]: [
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/myfile.txt' and text()='myfile.txt']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/index.bigb' and text()='index.bigb']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/index.html' and text()='index.html']`,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/_index.html' and text()='_index.html']`,

        `//x:a[@href='subdir' and text()='subdir/']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir/index.html`]: [
        `//x:a[@href='../../${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt' and text()='myfile-subdir.txt']`,
        `//x:a[@href='../../${ourbigbook.FILE_PREFIX}/subdir/index.html' and text()='index.html']`,

        `//x:a[@href='subdir2' and text()='subdir2/']`,
        `//x:a[@href='..' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir/subdir2/index.html`]: [
        `//x:a[@href='../..' and text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,
        `//x:a[@href='..' and text()='subdir']`,
      ],
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        `//x:a[text()='${ourbigbook.FILE_ROOT_PLACEHOLDER}']`,

        // Ignored files don't show on listing.
        "//x:a[text()='.git']",
        "//x:a[text()='.git/']",
      ],
    },
  }
)
assert_cli(
  'raw: directory listings link to _file when split pages are turned off',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel

== hasbigb.txt
{file}

Some content
`,
      'myfile.txt': `myfile.txt line1

myfile.txt line2
`,
      'hasbigb.txt': `hasbigb.txt line1

hasbigb.txt line2
`,
      'subdir/myfile-subdir.txt': `myfile-subdir.txt line1

myfile-subdir.txt line2
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/myfile.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/myfile-subdir.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/myfile.txt.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/hasbigb.txt.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html`,
    ],
    assert_xpath: {
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`]: [
        // Link to _raw without split. This is a simple behaviour to work reasonably when {file} headers
        // don't get their own separate file. The other possibility would be to always autogen without split,
        // but then we would have to worry about not adding autogen to db to avoid ID conflicts. Doable as well,
        `//x:a[@href='../${ourbigbook.FILE_PREFIX}/myfile.txt.html' and text()='myfile.txt']`,
      ],
      [`${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir/index.html`]: [
        `//x:a[@href='../../${ourbigbook.FILE_PREFIX}/subdir/myfile-subdir.txt.html' and text()='myfile-subdir.txt']`,
      ],
    },
  }
)
assert_cli(
  'raw: root directory listing in publish does not show publish',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'not-ignored.txt': ``,
      'ourbigbook.json': `{
}
`,
    },
    assert_not_xpath: {
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.DIR_PREFIX}/index.html`]: [
        // ../ not added to root listing.
        "//x:a[text()='..']",
      ],
    },
  }
)

// ignores
assert_cli(
  'json: ignore: is used in conversion',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel
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
  ]
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,

      // Only applies to full matches.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/ignored-top.txt`,

      // dontIgnore overrides previous ignores.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir-dont/a.ignore`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir-dont/subdir/a.ignore`,

      // Directory conversion does not blow up when all files in directory are ignored.
      `${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir-ignore-files/index.html`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ignored-top.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,

      // If a directory is ignored, we don't recurse into it at all.
      `${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/subdir-ignored/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir-ignored/default.txt`,

      // Ignore by extension.
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/a.ignore`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/a.ignore`,
    ],
  }
)
assert_cli(
  'json: ignore is used in publish',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'ignored.txt': ``,
      'not-ignored.txt': ``,
      'ourbigbook.json': `{
  "ignore": [
    "ignored.txt"
  ]
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/ignored.txt`,
    ],
  }
)
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
  ]
}
`,
    },
  }
)
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
  ]
}
`,
    },
  }
)
// ignores
assert_cli(
  'json: ignoreConvert: ignores files for convertion but adds them on listings',
  {
    args: ['.'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'bigb-ignored.bigb': `= Bigb ignored
`,
      'scss-ignored.scss': ``,
      'scss-not-ignored.scss': ``,
      'subdir-ignored/style.scss': ``,
      'ourbigbook.json': `{
  "ignoreConvert": [
    "bigb-ignored\\\\.bigb",
    "scss-ignored\\\\.scss",
    "subdir-ignored"
  ]
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.DIR_PREFIX}/index.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/bigb-ignored.bigb`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-ignored.scss`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-not-ignored.scss`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-not-ignored.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir-ignored/style.scss`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/bigb-ignored.html`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-ignored.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir-ignored/style.css.`,
    ],
  }
)
assert_cli(
  'json: dontIgnoreConvert: overrides ignoreConvert basic',
  {
    args: ['.'],
    filesystem: {
      'scss-dont.scss': ``,
      'scss-ignored.scss': ``,
      'subdir/scss-ignored.scss': ``,
      'ourbigbook.json': `{
  "ignoreConvert": [
    ".*\\\\.scss"
  ],
  "dontIgnoreConvert": [
    "scss-dont.scss"
  ]
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-dont.scss`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-dont.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-ignored.scss`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/scss-ignored.scss`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/scss-ignored.css`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/scss-ignored.css.`,
    ],
  }
)
assert_cli(
  'json: dontIgnoreConvert: overrides ignoreConvert for publish',
  {
    args: ['--dry-run', '--publish'],
    pre_exec: publish_pre_exec,
    filesystem: {
      'scss-dont.scss': ``,
      'scss-ignored.scss': ``,
      'subdir/scss-ignored.scss': ``,
      'ourbigbook.json': `{
  "ignoreConvert": [
    ".*\\\\.scss"
  ],
  "dontIgnoreConvert": [
    "scss-dont.scss"
  ]
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/scss-dont.scss`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/scss-dont.css`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/scss-ignored.scss`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/subdir/scss-ignored.scss`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/scss-ignored.css`,
      `${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/${ourbigbook.RAW_PREFIX}/subdir/scss-ignored.css.`,
    ],
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores files from toplevel directory conversion',
  {
    args: ['.'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
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
      'ourbigbook.json': `{}`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ignored-subdir/1.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ignored-subdir/2.txt`,
    ],
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores files from subdirectory conversion',
  {
    args: ['subdir'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'ignored.txt': ``,
      'not-ignored.txt': ``,
      'subdir/ignored.txt': ``,
      'subdir/not-ignored.txt': ``,
      '.gitignore': `ignored.txt
ignored-subdir
`,
      'ourbigbook.json': `{
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/not-ignored.txt`,
    ],
    assert_not_exists: [
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/not-ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/ignored.txt`,
      `${TMP_DIRNAME}/html/${ourbigbook.RAW_PREFIX}/subdir/ignored.txt`,
    ],
  }
)
assert_cli(
  // https://github.com/ourbigbook/ourbigbook/issues/253
  'git: .gitignore ignores individual files from conversion',
  {
    args: ['tmp.bigb'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'tmp.bigb': `= Tmp

\\asdf
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
}
`,
    },
  }
)
assert_cli(
  'git: .gitignore is used in --web conversion',
  {
    args: ['--web', '--web-dry', '.'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'tmp.bigb': `= Tmp

\\asdf
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
}
`,
    },
  }
)
assert_cli(
  'git: conversion of single file in git directory works',
  {
    args: ['index.bigb'],
    pre_exec: MAKE_GIT_REPO_PRE_EXEC,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      '.gitignore': `tmp.bigb
`,
      'ourbigbook.json': `{
}
`,
    },
    assert_exists: [
      `${TMP_DIRNAME}/html/index.html`,
    ],
  }
)

assert_cli(
  '--web-dry on simple repository',
  {
    args: ['--web', '--web-dry', '.'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'ourbigbook.json': `{
}
`,
    },
  }
)
assert_cli(
  '--web-dry on single file',
  {
    args: ['--web', '--web-dry', 'index.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'ourbigbook.json': `{
}
`,
    },
  }
)
assert_cli(
  `ourbgbook.json: publishOptions takes effect when publishing`,
  {
    args: ['--dry-run', '--publish', '.'],
    pre_exec: [
      ['ourbigbook', '.'],
    ].concat(MAKE_GIT_REPO_PRE_EXEC),
    filesystem: {
      'index.bigb': `= Toplevel

<Notindex>

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
      'ourbigbook.json': `{
  "publishOptions": {
    "htmlXExtension": false,
    "ourbigbook_json": {
      "toSplitHeaders": true,
      "xPrefix": "https://ourbigbook.com/cirosantilli/"
    }
  }
}
`,
    },
    assert_xpath: {
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//x:div[@class='p']//x:a[@href='notindex.html' and text()='Notindex']",
      ],
      [`${TMP_DIRNAME}/publish/${TMP_DIRNAME}/github-pages/index.html`]: [
        "//x:div[@class='p']//x:a[@href='https://ourbigbook.com/cirosantilli/notindex' and text()='Notindex']",
      ],
    },
  }
)
assert_cli('file: _file auto-generation conversion image media provider works',
  {
    args: ['-S', 'project'],
    filesystem: {
      'project/myimg.png': `aaa`,
      'media/outside.png': `aaa`,
      'project/ourbigbook.json': `{
  "media-providers": {
    "github": {
      "default-for": ["image"],
      "title-from-src": false,
      "path": "../media",
      "remote": "ourbigbook/ourbigbook-media"
    }
  }
}`
    },
    assert_xpath: {
      [`project/${TMP_DIRNAME}/html/${ourbigbook.FILE_PREFIX}/myimg.png.html`]: [
        `//x:img[@src='../${ourbigbook.RAW_PREFIX}/myimg.png']`,
      ],
    },
  },
)

// CLI include: tests
assert_cli(
  'include: double parents are forbidden clean',
  {
    args: ['.'],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex2]
`,
      'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'notindex2.bigb': `= Notindex2
`,
    },
  }
)
assert_cli(
  'include: double parents are forbidden incremental',
  {
    args: ['notindex.bigb'],
    assert_exit_status: 1,
    pre_exec: [
      { cmd: ['ourbigbook', ['.']], },
      {
        filesystem_update: {
          'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
        }
      },
    ],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
`,
      'notindex.bigb': `= Notindex
`,
      'notindex2.bigb': `= Notindex2
`,
    },
  }
)
// TODO https://github.com/ourbigbook/ourbigbook/issues/204
//assert_cli(
//  'include: circular dependency loop index <-> 1',
//  {
//    args: ['.'],
//    assert_exit_status: 1,
//    filesystem: {
//      'index.bigb': `= Toplevel
//
//\\Include[notindex]
//`,
//      'notindex.bigb': `= Notindex
//
//\\Include[index]
//`,
//    },
//  }
//)
assert_cli(
  'include: circular dependency loop index -> 1 <-> 2',
  {
    args: ['.'],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'notindex.bigb': `= Notindex

\\Include[notindex2]
`,
      'notindex2.bigb': `= Notindex2

\\Include[notindex]
`,
    },
  }
)
assert_cli('include: tags show on embed include',
  {
    args: ['--embed-includes', 'index.bigb'],
    pre_exec: [
      { cmd: ['ourbigbook', ['.']], },
    ],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
\\Include[notindex2]
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
      [`${TMP_DIRNAME}/html/index.html`]: [
        "//*[contains(@class, 'h-nav')]//x:span[@class='tags']//x:a[@href='#notindex2']",
      ],
    },
  }
)

// check_db cli

assert_cli(
  'include: all files must be included',
  {
    args: ['.'],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
      'notindex2.bigb': `= Notindex2
`,
    },
  }
)
assert_cli(
  'include: check_db does not run when converting a single file with --no-render',
  // Otherwise a conversion of type:
  // ``
  // ourbigbook --no-render notindex.bigb
  // ourbigbook --no-render index.bigb
  // ``
  // would fail filesAreIncluded just because of ordering, while:
  // ``
  // ourbigbook --no-render notindex.bigb
  // ourbigbook --no-render index.bigb
  // ``
  // would work. It is nicer if the pre render ordering does not matter.
  {
    args: ['--no-render', 'notindex.bigb'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex
`,
    },
  }
)
assert_cli(
  'include: check_db does not run when converting a subdirectory with --no-render',
  {
    args: ['--no-render', 'subdir'],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[subdir/notindex]
`,
      'subdir/notindex.bigb': `= Notindex
`,
    },
  }
)
assert_cli(
  'include: check_db runs when converting toplevel with --no-render',
  // When converting toplevel however, we expect the final DB to be coherent
  // as there can't be ordering issues anymore.
  {
    args: ['--no-render', '.'],
    assert_exit_status: 1,
    filesystem: {
      'index.bigb': `= Toplevel
`,
      'subdir/notindex.bigb': `= Notindex
`,
    },
  }
)
assert_cli(
  'include: --embed-includes does not mess up parent refs in db',
  // Correctly updating the refs would require work. But let's at least
  // try to not mess everything up. This was removing the notindex-h2
  // parent ref and making lint.filesAreIncluded fail. Related:
  // https://github.com/ourbigbook/ourbigbook/issues/343
  {
    args: ['--check-db-only', '.'],
    pre_exec: [
      { cmd: ['ourbigbook', ['--no-render', '.']] },
      { cmd: ['ourbigbook', ['--embed-includes', 'index.bigb']] },
    ],
    filesystem: {
      'index.bigb': `= Toplevel

\\Include[notindex]
`,
      'notindex.bigb': `= Notindex

== Notindex h2
`,
    }
  }
)
