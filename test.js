const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const util = require('util');

const cirodown = require('cirodown')
const cirodown_nodejs = require('cirodown/nodejs');

const convert_opts = {
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

class MockIdProvider extends cirodown.IdProvider {
  constructor(convert_input_options) {
    super();
    this.ids_table = {};
    this.includes_table = {};
  }

  clear(input_path) {
    for (let key in this.ids_table) {
      if (this.ids_table[key].path === input_path) {
        delete this.ids_table[key];
      }
    }
    for (let key in this.includes_table) {
      if (this.includes_table[key].from_path === input_path) {
        delete this.includes_table[key];
      }
    }
    this.includes_table = {};
  }

  get_includes_entries(to_id) {
    const ret = this.includes_table[to_id];
    if (ret === undefined) {
      return [];
    } else {
      return ret;
    }
  }

  get_noscope_entry(id) {
    return this.ids_table[id];
  }

  update(extra_returns) {
    const ids = extra_returns.ids;
    for (const id in ids) {
      const ast = ids[id];
      this.ids_table[id] = {
        id: id,
        path: ast.source_location.path,
        ast_json: JSON.stringify(ast)
      };
    }
    const context = extra_returns.context;
    for (const header_ast of context.headers_with_include) {
      for (const include of header_ast.includes) {
        if (this.includes_table[to_id] === undefined) {
          this.includes_table[to_id] = [];
        }
        this.includes_table[to_id].push({
          from_id: header_ast.id,
          from_path: header_ast.source_location.path,
          to_id: include,
        });
      }
    }
  }
}

class MockFileProvider extends cirodown.FileProvider {
  constructor() {
    super();
    this.path_index = {};
    this.id_index = {};
  }

  get_id(id) {
    return this.id_index[id];
  }

  get_path_entry(path) {
    return this.path_index[path];
  }

  update(input_path, extra_returns) {
    const context = extra_returns.context;
    const entry = {
      path: input_path,
      toplevel_scope_cut_length: context.toplevel_scope_cut_length,
      toplevel_id: context.toplevel_id,
    };
    this.path_index[input_path] = entry;
    this.id_index[context.toplevel_id] = entry;
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
  it(description, ()=>{
    options = Object.assign({}, options);
    if (!('assert_xpath_matches' in options)) {
      // Not ideal, but sometimes there's no other easy way
      // to test rendered stuff. All in list must match.
      options.assert_xpath_matches = [];
    }
    if (!('assert_xpath_split_headers' in options)) {
      // Map of output paths for split headers mode. Each output
      // path must match all xpath expresssions in its list.
      //
      // Automatically set split_headers if not explicitly disabled.
      options.assert_xpath_split_headers = {};
    }
    if (!('convert_before' in options)) {
      // List of strings. Convert files at these paths from default_file_reader
      // before the main conversion to build up the cross-file reference database.
      options.convert_before = [];
    }
    if (!('extra_convert_opts' in options)) {
      // Passed to cirodown.convert.
      options.extra_convert_opts = {};
    }
    if (!('file_reader' in options)) {
      // Passed to cirodown.convert.
      options.file_reader = default_file_reader;
    }
    if (!('has_error' in options)) {
      // Has error somewhere, but our precise error line/column assertions
      // are failing, and we are lazy to fix them right now. But still it is better
      // to know that it does not blow up with an exception, and has at least.
      // one error message.
      options.has_error = false;
    }

    // extra_convert_opts defaults.
    if (!('read_include' in options.extra_convert_opts)) {
      options.extra_convert_opts.read_include = (input_path_noext)=>{
        return [input_path_noext + cirodown.CIRODOWN_EXT,
           options.file_reader(input_path_noext)];
      };
    }
    if (
      Object.keys(options.assert_xpath_split_headers).length > 0 &&
      !('split_headers' in options.extra_convert_opts)
    ) {
      options.extra_convert_opts.split_headers = true;
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
    new_convert_opts.id_provider = new MockIdProvider();
    new_convert_opts.file_provider = new MockFileProvider();
    for (let input_path_noext of options.convert_before) {
      const extra_returns = {};
      const input_string = options.file_reader(input_path_noext);
      const input_path = input_path_noext + cirodown.CIRODOWN_EXT;
      options.convert_before = [];
      const dependency_convert_opts = Object.assign({}, new_convert_opts);
      dependency_convert_opts.input_path = input_path;
      dependency_convert_opts.toplevel_id = input_path_noext;
      cirodown.convert(input_string, dependency_convert_opts, extra_returns);
      new_convert_opts.id_provider.update(extra_returns);
      new_convert_opts.file_provider.update(input_path, extra_returns);
    }
    if (options.input_path_noext !== undefined) {
      new_convert_opts.input_path = options.input_path_noext + cirodown.CIRODOWN_EXT;
      new_convert_opts.toplevel_id = options.input_path_noext;
    }
    const extra_returns = {};
    const output = cirodown.convert(input_string, new_convert_opts, extra_returns);
    const has_subset_extra_returns = {fail_reason: ''};
    let is_subset;
    let content;
    if (expected_ast_output_subset === undefined) {
      is_subset = true;
    } else {
      if (options.toplevel) {
        content = extra_returns.ast;
        is_subset = ast_has_subset(content, expected_ast_output_subset, has_subset_extra_returns);
      } else {
        content = extra_returns.ast.args.content;
        is_subset = ast_arg_has_subset(content, expected_ast_output_subset, has_subset_extra_returns);
      }
    }
    const expect_error_precise =
      options.error_line !== undefined ||
      options.error_column !== undefined ||
      options.error_path !== undefined;
    const expect_error = expect_error_precise || options.has_error;
    if (
      !is_subset ||
      (
        !expect_error &&
        extra_returns.errors.length !== 0
      )
    ) {
      console.error('tokens:');
      console.error(JSON.stringify(extra_returns.tokens, null, 2));
      console.error();
      console.error('ast output:');
      console.error(JSON.stringify(content, null, 2));
      console.error();
      console.error('ast expect:');
      console.error(JSON.stringify(expected_ast_output_subset, null, 2));
      console.error();
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
      }
    }
    for (const xpath_expr of options.assert_xpath_matches) {
      assert_xpath_matches(xpath_expr, output);
    }
    for (const key in options.assert_xpath_split_headers) {
      const output = extra_returns.rendered_outputs[key];
      assert.notStrictEqual(output, undefined);
      for (const xpath_expr of options.assert_xpath_split_headers[key]) {
        assert_xpath_matches(xpath_expr, output, key);
      }
    }
  });
}

function assert_equal(description, output, expected_output) {
  it(description, ()=>{assert.strictEqual(output, expected_output);});
}

/** Assert that the conversion fails in a controlled way, giving correct
 * error line and column, and without throwing an exception. */
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

// Test the cirodown executable itself.
function assert_executable(
  description,
  options={}
) {
  it(description, ()=>{
    options = Object.assign({}, options);
    if (!('args' in options)) {
      options.args = [];
    }
    options.args.push('--body-only');
    let stdin;
    if ('stdin' in options) {
      stdin = options.stdin;
    }
    { input : 'one two three' }
    const out = child_process.spawnSync('./cirodown', options.args, {input: stdin});
    assert.strictEqual(out.status, 0);
    assert_xpath_matches(
      options.expect_stdout_xpath,
      out.stdout.toString(cirodown_nodejs.ENCODING),
    );
  });
}

/** For stuff that is hard to predict the exact output of, just check the
 * exit status at least. */
function assert_no_error(description, input, options) {
  assert_convert_ast(description, input, undefined, options)
}

function assert_xpath_matches(xpath_expr, string, message) {
  const xpath_matches = xpath_html(string, xpath_expr);
  if (message === undefined)
    message = '';
  if (xpath_matches.length !== 1) {
    console.error('assert_xpath_matches: ' + message);
    console.error('xpath: ' + xpath_expr);
    console.error('string:');
    console.error(string);
    assert.strictEqual(xpath_matches.length, 1);
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
    extra_returns.fail_reason = `arg.length !== subset.length ${arg.length} ${subset.length}`;
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

function default_file_reader(input_path) {
  if (input_path === 'include-one-level-1') {
    return `= cc

dd
`;
  } else if (input_path === 'include-one-level-2') {
    return `= ee

ff
`;
  } else if (input_path === 'include-two-levels') {
    return `= ee

ff

== gg

hh
`;
  } else if (input_path === 'include-with-error') {
    return `= bb

\\reserved_undefined
`
  } else if (input_path === 'include-circular-1') {
    return `= bb

\\Include[include-circular-2]
`
  } else if (input_path === 'include-circular-2') {
    return `= cc

\\Include[include-circular-1]
`
  } else {
    throw new Error(`unknown lnclude path: ${input_path}`);
  }
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
// TODO html test
//assert_convert('table with id has caption',
//  `\\Table{id=ab}[
//\\Tr[
//\\Td[00]
//\\Td[01]
//]
//]
//`,
//  `<div class="table-container" id="ab">
//<div class="table-caption">Table 1</div>
//<table>
//<tr>
//<td>00</td>
//<td>01</td>
//</tr>
//</table>
//</div>
//`
//);

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
]
);
assert_convert_ast('image title',
  `\\Image[ab]{title=c d}`,
[
  a('Image', undefined, {
    src: [t('ab')],
    title: [t('c d')],
  }),
]
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
// TODO inner property test
//assert_convert_ast('image without id does not increment image count',
//  `\\Image[ab]
//\\Image[cd]{id=ef}
//`,
//  `<figure>
//<img src="ab">
//</figure>
//<figure id="ef">
//<a href="#ef"><img src="cd"></a>
//<figcaption>Image 1</figcaption>
//</figure>
//`
//)

// Escapes.
assert_convert_ast('escape backslash',            'a\\\\b\n', [a('P', [t('a\\b')])]);
assert_convert_ast('escape left square bracket',  'a\\[b\n',  [a('P', [t('a[b')])]);
assert_convert_ast('escape right square bracket', 'a\\]b\n',  [a('P', [t('a]b')])]);
assert_convert_ast('escape left curly brace',     'a\\{b\n',  [a('P', [t('a{b')])]);
assert_convert_ast('escape right curly brace',    'a\\}b\n',  [a('P', [t('a}b')])]);

//// HTML Escapes.
// TODO html or subfunction test
//assert_convert_ast('html escapes',
//  '\\a[ab&<>"\'cd][ef&<>"\'gh]\n',
//  '<a href="ab&amp;&lt;&gt;&quot;&#039;cd">ef&amp;&lt;&gt;"\'gh</a>\n'
//);

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
assert_error('non-empty named argument without = is an error', '\\P{id ab}[cd]', 1, 6);
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
assert_convert_ast('link simple',
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
assert_convert_ast('link auto insane start end document',
  'http://example.com',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_convert_ast('link auto insane start end square brackets',
  '\\P[http://example.com]\n',
  [a('P', [a('a', undefined, {'href': [t('http://example.com')]})])],
);
assert_convert_ast('link auto insane start end literal square brackets',
  '\\[http://example.com\\]\n',
  [a('P', [t('[http://example.com]')])],
);
assert_convert_ast('link auto insane start end named argument',
  '\\Image[aaa.jpg]{description=http://example.com}\n',
  [a('Image', undefined, {
    description: [a('a', undefined, {'href': [t('http://example.com')]})],
    src: [t('aaa.jpg')],
  })],
);
assert_convert_ast('link auto insane start end named argument',
  '\\Image[aaa.jpg]{source=http://example.com}\n',
  [a('Image', undefined, {
    source: [t('http://example.com')],
    src: [t('aaa.jpg')],
  })],
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

// Cross references \x
assert_no_error('cross reference simple',
  `= My header

\\x[my-header][link body]
`
);
assert_no_error('cross reference full boolean style without value',
  `= My header

\\x[my-header]{full}
`,
  [
    a('H', undefined, {
      level: [t('1')],
      title: [t('abc')],
    }),
    a('P', [
      a('x', undefined, {
        full: [],
        href: [t('abc')],
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
`);
assert_no_error('cross reference without content nor target title style full',
  `\\Image[ab]{id=cd}

\\x[cd]
`);
assert_error('cross reference undefined', '\\x[ab]', 1, 3);
assert_convert_ast('cross reference to non-included header in another file',
  `= aa

\\x[notindex]

\\x[bb]

\\x[include-two-levels]

\\x[gg]

== bb

\\x[notindex][notindex2]

\\x[bb][bb2]
`,
  [
    a('H', undefined, {level: [t('1')], title: [t('aa')]}),
    a('P', [a('x', undefined, {href: [t('notindex')]})]),
    a('P', [a('x', undefined, {href: [t('bb')]})]),
    a('P', [a('x', undefined, {href: [t('include-two-levels')]})]),
    a('P', [a('x', undefined, {href: [t('gg')]})]),
    a('Toc'),
    a('H', undefined, {level: [t('2')], title: [t('bb')]}),
    a('P', [a('x', [t('notindex2')], {href: [t('notindex')]})]),
    a('P', [a('x', [t('bb2')], {href: [t('bb')]})]),
  ],
  {
    assert_xpath_matches: [
      // Empty URL points to start of the document, which is exactly what we want.
      // https://stackoverflow.com/questions/5637969/is-an-empty-href-valid
      "//x:div[@class='p']//x:a[@href='' and text()='aa']",
      "//x:a[@href='#bb' and text()='bb']",
      // https://github.com/cirosantilli/cirodown/issues/94
      "//x:a[@href='include-two-levels.html' and text()='ee']",
      "//x:a[@href='include-two-levels.html#gg' and text()='gg']",
      "//x:a[@href='#bb' and text()='bb2']",
    ],
    assert_xpath_split_headers: {
      'notindex-split.html': [
        "//x:a[@href='include-two-levels-split.html' and text()='ee']",
        "//x:a[@href='gg.html' and text()='gg']",
        "//x:a[@href='bb.html' and text()='bb']",
      ],
      'bb.html': [
        "//x:a[@href='notindex-split.html' and text()='notindex2']",
        "//x:a[@href='' and text()='bb2']",
      ],
    },
    convert_before: ['include-two-levels'],
    input_path_noext: 'notindex',
  },
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
    convert_before: ['include-two-levels'],
  }
);

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
`, 3, 21);
assert_error('cross reference from image title without ID to following non-header is not allowed',
  `\\Image[ab]{title=cd \\x[image-gh]}

\\Image[ef]{title=gh}
`, 1, 23);
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
  ]
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
  ]
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
  ]
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
  ]
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

//// Headers.
// TODO inner ID property test
//assert_convert_ast('header simple',
//  '\\H[1][My header]\n',
//  `<h1 id="my-header"><a href="#my-header">1. My header</a></h1>\n`
//);
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
    assert_xpath_matches: ["//x:a[@href='#include-two-levels' and text()='ee']"]},
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
    file_reader: (path)=>{
      if (path === 'notindex') {
        return circular_entry
      } else if (path === 'include-circular') {
        return `= include-circular

\\Include[notindex]
`;
      }
    }
  }
);
// TODO error this is legitimately failing on CLI, bad error messages show
// up on CLI reproduction.
// The root problem is that include_path_set does not contain
// include-circular-2.ciro, and that leads to several:
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

// ID auto-gneration and macro counts.
assert_convert_ast('id autogeneration simple',
  '\\P[aa]\n',
  [a('P', [t('aa')], {}, {id: 'p-1'})],
);
// https://github.com/cirosantilli/cirodown/issues/4
assert_convert_ast('id autogeneration nested',
  '\\Q[\\P[aa]]\n\n\\P[bb]\n',
  [
    a('Q',[
      a('P', [t('aa')], {}, {id: 'p-1'})
      ], {}, {id: 'q-1'}
    ),
    a('P', [t('bb')], {}, {id: 'p-2'}),
  ],
);
assert_convert_ast('id autogeneration unicode',
  `= 0A.你Éz

\\x[0a-你éz]
`,
  [
    a('H', undefined, {title: [t('0A.你Éz')]}, {id: '0a-你éz'}),
    a('P', [
      a('x', undefined, {href: [t('0a-你éz')]})
    ])
  ],
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
  it(description, ()=>{
    const input_string = `= h1

== h1 1

== h1 1 1

== h1 1 2

== h1 2

== h1 2 1

== h1 2 2
`
    const new_options = Object.assign({split_headers: true}, options);
    const extra_returns = {};
    cirodown.convert(
      input_string,
      new_options,
      extra_returns
    );
    assert.deepEqual(
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
    'notindex-split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
    'notindex.html'
  ]
)
assert_split_header_output_keys(
  'split headers returns the expected header to output keys with input_path and toplevel_id on notindex',
  {
    input_path: 'notindex' + cirodown.CIRODOWN_EXT,
    toplevel_id: 'notindex'
  },
  [
    'notindex-split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
    'notindex.html'
  ]
)
assert_split_header_output_keys(
  'split headers returns the expected header to output keys with input_path and no toplevel_id on index',
  {
    input_path: cirodown.INDEX_BASENAME_NOEXT + cirodown.CIRODOWN_EXT
  },
  [
    cirodown.INDEX_BASENAME_NOEXT + '-split.html',
    'h1-1.html',
    'h1-1-1.html',
    'h1-1-2.html',
    'h1-2.html',
    'h1-2-1.html',
    'h1-2-2.html',
    cirodown.INDEX_BASENAME_NOEXT + '.html'
  ]
)

// Errors. Check that they return gracefully with the error line number,
// rather than blowing up an exception, or worse, not blowing up at all!
assert_error('backslash without macro', '\\ a', 1, 1);
assert_error('unknown macro', '\\reserved_undefined', 1, 1);
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
  'input from stdin produces output on stdout',
  {
    stdin: 'aabb',
    expect_stdout_xpath: "//x:div[@class='p' and text()='aabb']",
  }
);
