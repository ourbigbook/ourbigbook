const assert = require('assert');
const util = require('util');

const cirodown = require('cirodown')

const convert_opts = {
  body_only: true,
  //show_ast: true,
  //show_parse: true,
  //show_tokens: true,
  //show_tokenize: true,
};

const convert_opts_norender = Object.assign({render: false}, convert_opts);

function assert_convert_ast_func(input_string, expected_ast_output_subset) {
  const extra_returns = {};
  cirodown.convert(input_string, convert_opts_norender, extra_returns);
  const is_subset = ast_arg_has_subset(extra_returns.ast.args.content, expected_ast_output_subset);
  if (!is_subset || extra_returns.errors.length !== 0) {
    console.error('tokens:');
    console.error(JSON.stringify(extra_returns.tokens, null, 2));
    console.error();
    console.error('ast expect:');
    console.error(JSON.stringify(extra_returns.ast, null, 2));
    console.error();
    console.error('ast output:');
    console.error(JSON.stringify(expected_ast_output_subset, null, 2));
    console.error();
    for (const error of extra_returns.errors) {
      console.error(error.toString());
    }
    console.error('input ' + util.inspect(input_string));
    assert.ok(is_subset);
    assert.strictEqual(extra_returns.errors.length, 0);
  }
}

function assert_convert_func(input_string, expected_output) {
  const extra_returns = {};
  const output = cirodown.convert(input_string, convert_opts, extra_returns);
  if (output !== expected_output || extra_returns.errors.length !== 0) {
    console.error('tokens:');
    console.error(JSON.stringify(extra_returns.tokens, null, 2));
    console.error();
    console.error('ast:');
    console.error(JSON.stringify(extra_returns.ast, null, 2));
    console.error();
    for (const error of extra_returns.errors) {
      console.error(error.toString());
    }
    console.error('input ' + util.inspect(input_string));
    console.error('output ' + util.inspect(output));
    console.error('expect ' + util.inspect(expected_output));
    assert.strictEqual(output, expected_output);
    assert.strictEqual(extra_returns.errors.length, 0);
  }
}

function assert_error_func(input_string, line, column) {
  let extra_returns = {};
  let output = cirodown.convert(input_string, convert_opts, extra_returns);
  assert.ok(extra_returns.errors.length >= 1);
  let error = extra_returns.errors[0];
  assert.strictEqual(error.line, line);
  assert.strictEqual(error.column, column);
}

/** For stuff that is hard to predict the exact output of, which is most of the HTML,
 * we can check just that a certain key subset of the AST is present.
 *
 * This tests just the input parse to AST, but not the output generation from the AST.
 *
 * This function automaticlaly only considers the content argument of the
 * toplevel node for further convenience.
 */
function assert_convert_ast(description, input_string, expected_ast_output_subset) {
  it(description, ()=>{assert_convert_ast_func(input_string, expected_ast_output_subset);});
}

function assert_convert(description, input, output) {
  it(description, ()=>{assert_convert_func(input, output);});
}

function assert_error(description, input, line, column) {
  it(description, ()=>{assert_error_func(input, line, column);});
}

/** For stuff that is hard to predict the exact output of, just check the
 * exit status at least. */
function assert_no_error(description, input) {
  it(description, ()=>{
    let extra_returns = {};
    cirodown.convert(input, convert_opts, extra_returns);
    assert.strictEqual(extra_returns.errors.length, 0);
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
function ast_arg_has_subset(arg, subset) {
  if (arg.length !== subset.length)
    return false;
  for (let i = 0; i < arg.length; i++) {
    if (!ast_has_subset(arg[i], subset[i]))
      return false;
  }
  return true;
}

/** See: ast_arg_has_subset. */
function ast_has_subset(ast, ast_subset) {
  for (const ast_subset_prop_name in ast_subset) {
    if (!(ast_subset_prop_name in ast))
      return false
    const ast_prop = ast[ast_subset_prop_name];
    const ast_subset_prop = ast_subset[ast_subset_prop_name];
    if (ast_subset_prop_name === 'args') {
      for (const ast_subset_arg_name in ast_subset_prop) {
        if (!(ast_subset_arg_name in ast_prop))
          return false;
        if (!ast_arg_has_subset(ast_prop[ast_subset_arg_name], ast_subset_prop[ast_subset_arg_name]))
          return false;
      }
    } else {
      if (ast_prop !== ast_subset_prop)
        return false;
    }
  }
  return true;
}

// Paragraphs.
assert_convert_ast('one paragraph implicit', 'ab\n',
  [
    // TODO actually, this would be better.
    //{'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
    {'macro_name': 'plaintext', 'text': 'ab'}
  ],
);
assert_convert_ast('one paragraph explicit', '\\p[ab]\n',
  [
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
  ],
);
assert_convert_ast('two paragraphs', 'p1\n\np2\n',
  [
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'p1'}]}},
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'p2'}]}},
  ]
);
assert_convert_ast('three paragraphs',
  'p1\n\np2\n\np3\n',
  [
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'p1'}]}},
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'p2'}]}},
    {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'p3'}]}},
  ]
);

// List.
const l_with_explicit_ul_expect = [
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
  {
    'macro_name': 'ul',
    'args': {
      'content': [
        {
          'macro_name': 'l',
          'args': {
            'content': [
              {'macro_name': 'plaintext', 'text': 'cd'}
            ],
          },
        },
        {
          'macro_name': 'l',
          'args': {
            'content': [
              {'macro_name': 'plaintext', 'text': 'ef'}
            ],
          },
        },
      ],
    },
  },
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'gh'}]}},
];
assert_convert_ast('l with explicit ul',
  `ab

\\ul[
\\l[cd]
\\l[ef]
]

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('l with implicit ul',
  `ab

\\l[cd]
\\l[ef]

gh
`,
  l_with_explicit_ul_expect
);
assert_convert_ast('ordered list',
  `ab

\\ol[
\\l[cd]
\\l[ef]
]

gh
`,
[
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
  {
    'macro_name': 'ol',
    'args': {
      'content': [
        {
          'macro_name': 'l',
          'args': {
            'content': [
              {'macro_name': 'plaintext', 'text': 'cd'}
            ],
          },
        },
        {
          'macro_name': 'l',
          'args': {
            'content': [
              {'macro_name': 'plaintext', 'text': 'ef'}
            ],
          },
        },
      ],
    },
  },
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'gh'}]}},
]
);

// Table.
const tr_with_explicit_table_expect = [
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
  {
    'macro_name': 'table',
    'args': {
      'content': [
        {
          'macro_name': 'tr',
          'args': {
            'content': [
              {
                'macro_name': 'th',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': 'cd'},
                  ],
                },
              },
              {
                'macro_name': 'th',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': 'ef'},
                  ],
                },
              },
            ],
          },
        },
        {
          'macro_name': 'tr',
          'args': {
            'content': [
              {
                'macro_name': 'td',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': '00'},
                  ],
                },
              },
              {
                'macro_name': 'td',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': '01'},
                  ],
                },
              },
            ],
          },
        },
        {
          'macro_name': 'tr',
          'args': {
            'content': [
              {
                'macro_name': 'td',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': '10'},
                  ],
                },
              },
              {
                'macro_name': 'td',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': '11'},
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'gh'}]}},
];
assert_convert_ast('tr with explicit table',
  `ab

\\table[
\\tr[
\\th[cd]
\\th[ef]
]
\\tr[
\\td[00]
\\td[01]
]
\\tr[
\\td[10]
\\td[11]
]
]

gh
`,
  tr_with_explicit_table_expect
);
assert_convert_ast('tr with implicit table',
  `ab

\\tr[
\\th[cd]
\\th[ef]
]
\\tr[
\\td[00]
\\td[01]
]
\\tr[
\\td[10]
\\td[11]
]

gh
`,
  tr_with_explicit_table_expect
);
assert_convert_ast('auto_parent consecutive implicit tr and l',
  `\\tr[\\td[ab]]
\\l[cd]
`,
[
  {
    'macro_name': 'table',
    'args': {
      'content': [
        {
          'macro_name': 'tr',
          'args': {
            'content': [
              {
                'macro_name': 'td',
                'args': {
                  'content': [
                    {'macro_name': 'plaintext', 'text': 'ab'},
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    'macro_name': 'ul',
    'args': {
      'content': [
        {
          'macro_name': 'l',
          'args': {
            'content': [
              {'macro_name': 'plaintext', 'text': 'cd'}
            ],
          },
        },
      ],
    },
  },
]
);
//assert_convert('table with id has caption',
//  `\\table{id=ab}[
//\\tr[
//\\td[00]
//\\td[01]
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
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'ab'}]}},
  {
    'macro_name': 'Image',
    'args': {
      'src': [
        {'macro_name': 'plaintext', 'text': 'cd'},
      ],
    },
  },
  {'macro_name': 'p', 'args': {'content': [{'macro_name': 'plaintext', 'text': 'gh'}]}},
]
);
assert_convert_ast('image title',
  `\\Image[ab]{title=c d}`,
[
  {
    'macro_name': 'Image',
    'args': {
      'src': [
        {'macro_name': 'plaintext', 'text': 'ab'},
      ],
      'title': [
        {'macro_name': 'plaintext', 'text': 'c d'},
      ],
    },
  },
]
)
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
//
//// Escapes.
//assert_convert_ast('escape backslash',            'a\\\\b\n', 'a\\b\n');
//assert_convert_ast('escape left square bracket',  'a\\[b\n',  'a[b\n');
//assert_convert_ast('escape right square bracket', 'a\\]b\n',  'a]b\n');
//assert_convert_ast('escape left curly brace',     'a\\{b\n',  'a{b\n');
//assert_convert_ast('escape right curly brace',    'a\\}b\n',  'a}b\n');
//
//// HTML Escapes.
//assert_convert_ast('html escapes',
//  '\\a[ab&<>"\'cd][ef&<>"\'gh]\n',
//  '<a href="ab&amp;&lt;&gt;&quot;&#039;cd">ef&amp;&lt;&gt;"\'gh</a>\n'
//);
//
//// Positional arguments.
//assert_convert_ast('p with no content argument', '\\p\n', '<p></p>\n');
//assert_convert_ast('p with empty content argument', '\\p[]\n', '<p></p>\n');
//
//// Named arguments.
//assert_convert_ast('p with id before', '\\p{id=ab}[cd]\n', '<p id="ab">cd</p>\n');
//assert_convert_ast('p with id after', '\\p[cd]{id=ab}\n', '<p id="ab">cd</p>\n');
//
//// Literal arguments.
//assert_convert_ast('literal argument code inline',
//  '\\c[[\\ab[cd]{ef}]]\n',
//  '<code>\\ab[cd]{ef}</code>\n'
//);
//assert_convert_ast('literal argument code block',
//  `a
//
//\\C[[
//\\[]{}
//\\[]{}
//]]
//
//d
//`,
//  `<p>a</p>
//<pre><code>\\[]{}
//\\[]{}
//</code></pre>
//<p>d</p>
//`
//);
//assert_convert_ast("non-literal argument leading newline gets removed",
//  `\\p[
//a
//b
//]
//`,
//  `<p>a
//b
//</p>
//`
//);
//assert_convert_ast('literal argument leading newline gets removed',
//  `\\p[[
//a
//b
//]]
//`,
//  `<p>a
//b
//</p>
//`
//);
//assert_convert_ast('literal argument leading newline gets removed but not second',
//  `\\p[[
//
//a
//b
//]]
//`,
//  `<p>
//a
//b
//</p>
//`
//);
//assert_convert_ast('literal agument escape leading open no escape',
//  '\\c[[\\ab]]\n',
//  '<code>\\ab</code>\n'
//);
//assert_convert_ast('literal agument escape leading open one backslash',
//  '\\c[[\\[ab]]\n',
//  '<code>[ab</code>\n'
//);
//assert_convert_ast('literal agument escape leading open two backslashes',
//  '\\c[[\\\\[ab]]\n',
//  '<code>\\[ab</code>\n'
//);
//assert_convert_ast('literal agument escape trailing close no escape',
//  '\\c[[\\]]\n',
//  '<code>\\</code>\n'
//);
//assert_convert_ast('literal agument escape trailing one backslash',
//  '\\c[[\\]]]\n',
//  '<code>]</code>\n'
//);
//assert_convert_ast('literal agument escape trailing two backslashes',
//  '\\c[[\\\\]]]\n',
//  '<code>\\]</code>\n'
//);
//
//// Links.
//assert_convert_ast('link simple',
//  'a \\a[http://example.com][example link] b\n',
//  'a <a href="http://example.com">example link</a> b\n'
//);
//assert_convert_ast('link auto',
//  'a \\a[http://example.com] b\n',
//  'a <a href="http://example.com">http://example.com</a> b\n'
//);
//assert_convert_ast('link with multiple paragraphs',
//  '\\a[http://example.com][Multiple\n\nparagraphs]\n',
//  '<a href="http://example.com"><p>Multiple</p>\n<p>paragraphs</p>\n</a>\n'
//);
//
//// Cross references \x
//assert_convert_ast('cross reference simple',
//  `\\h[1][My header]
//
//\\x[my-header][link body]
//`,
//  `<h1 id="my-header"><a href="#my-header">1. My header</a></h1>
//<p><a href="#my-header">link body</a></p>
//`
//);
//assert_convert_ast('cross reference auto default',
//  `\\h[1][My header]
//
//\\x[my-header]
//`,
//  `<h1 id="my-header"><a href="#my-header">1. My header</a></h1>
//<p><a href="#my-header">My header</a></p>
//`
//);
//assert_convert_ast('cross reference auto style full',
//  `\\h[1][My header]
//
//\\x[my-header]{style=full}
//`,
//  `<h1 id="my-header"><a href="#my-header">1. My header</a></h1>
//<p><a href="#my-header">Section 1. "My header"</a></p>
//`
//);
assert_error('cross reference with unknown style',
  `\\h[1][My header]

\\x[my-header]{style=reserved_undefined}
`,
  3, 21
);
//assert_convert_ast('cross reference to image',
//  `\\Image[ab]{id=cd}{title=ef}
//
//\\x[cd]
//`,
//  `<figure id="cd">
//<a href="#cd"><img src="ab"></a>
//<figcaption>Image 1. ef</figcaption>
//</figure>
//<p><a href="#cd">Image 1. "ef"</a></p>
//`
//);
//assert_convert_ast('cross reference without content nor target title style full',
//  `\\Image[ab]{id=cd}
//
//\\x[cd]
//`,
//  `<figure id="cd">
//<a href="#cd"><img src="ab"></a>
//<figcaption>Image 1</figcaption>
//</figure>
//<p><a href="#cd">Image 1</a></p>
//`
//);
assert_error('cross reference undefined', '\\x[ab]', 1, 4);
assert_error('cross reference without content nor target title style short',
  `\\Image[ab]{id=cd}

\\x[cd]{style=short}
`, 3, 2);

//// Headers.
//assert_convert_ast('header simple',
//  '\\h[1][My header]\n',
//  `<h1 id="my-header"><a href="#my-header">1. My header</a></h1>\n`
//);
//assert_convert_ast('header and implicit paragraphs',
//  `\\h[1][My header 1]
//
//My paragraph 1.
//
//\\h[2][My header 2]
//
//My paragraph 2.
//`,
//  `<h1 id="my-header-1"><a href="#my-header-1">1. My header 1</a></h1>
//<p>My paragraph 1.</p>
//<h2 id="my-header-2"><a href="#my-header-2">2. My header 2</a></h2>
//<p>My paragraph 2.</p>
//`
//);
//assert_convert_ast('header 7',
//  `\\h[1][1]
//\\h[2][2]
//\\h[3][3]
//\\h[4][4]
//\\h[5][5]
//\\h[6][6]
//\\h[7][7]
//`,
//  `<h1 id="1"><a href="#1">1. 1</a></h1>
//<h2 id="2"><a href="#2">2. 2</a></h2>
//<h3 id="3"><a href="#3">3. 3</a></h3>
//<h4 id="4"><a href="#4">4. 4</a></h4>
//<h5 id="5"><a href="#5">5. 5</a></h5>
//<h6 id="6"><a href="#6">6. 6</a></h6>
//<h6 data-level="7" id="7"><a href="#7">7. 7</a></h6>
//`
//);
assert_error('header must be an integer', '\\h[a][b]\n', 1, 4);
assert_error('header must not be zero', '\\h[0][b]\n', 1, 4);
assert_error('header skip level is an error', '\\h[1][a]\n\\h[3][b]\n', 2, 4);
//
//// Code.
//assert_convert_ast('code inline',
//  'a \\c[b c] d\n',
//  'a <code>b c</code> d\n'
//);
//assert_convert_ast('code block simple',
//  `a
//
//\\C[[
//b
//c
//]]
//
//d
//`,
//  `<p>a</p>
//<pre><code>b
//c
//</code></pre>
//<p>d</p>
//`
//);
//
//// Math.
//assert_no_error('math inline', '\\m[[\\sqrt{1 + 1}]]');
//assert_no_error('math block', '\\M[[\\sqrt{1 + 1}]]');
assert_error('math undefined macro', '\\m[[\\reserved_undefined]]', 1, 5);
//
// Errors. Check that they return gracefully with the error line number,
// rather than blowing up an exception.
// TODO
//assert_error('backslash without macro', '\\ a', 1, 1);
assert_error('unknown macro', '\\reserved_undefined', 1, 2);
assert_error('too many positional arguments', '\\p[ab][cd]', 1, 7);
assert_error('unknown named macro argument', '\\c{reserved_undefined=abc}[]', 1, 4);
assert_error('named argument without =', '\\p{id ab}[cd]', 1, 6);
//assert_error('argument without close', '\\p[', 1, 3);
//assert_error('argument without open', ']', 1, 1);
//assert_error('unterminated literal argument', '\\c[[ab]', 1, 3;
//assert_error('unterminated argument', '\\c[ab', 1, 3;
