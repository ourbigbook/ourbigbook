const katex = require('katex')

class AstNode {
  /**
   * @param {AstType} node_type -
   * @param {String} macro_name - if node_type === AstType.PLAINTEXT: fixed to 'plaintext'
   *                              elif node_type === AstType.PARAGRAPH: fixed to undefined
   *                              else: arbitrary regular macro
   * @param {Object[String, Array[AstNode]|String]} args -
   *        If type is macro, the Object with child args.
   *        Otherwise, it type is text, the raw String.
   * @param {Number} line - the best representation of where the macro is starts in the document
   *                        used primarily to present useful debug messages
   * @param {Number} column
   * @param {Object} attrs
   *                 {boolean} has_paragraph_siblings: is the macro surrounded directly by \n\n paragraphs
   */
  constructor(node_type, macros, macro_name, args, line, column, attrs={}) {
    this.node_type = node_type;
    this.macro_name = macro_name;
    this.args = args;
    this.line = line;
    this.column = column;
    // {String} or undefined.
    this.id = undefined;
    this.macro = macros[this.macro_name];

    // Set all non-given arguments to empty plaintext nodes by default,
    // and store which args were given or not.
    this.args_given = new Set();
    if (this.node_type === AstType.MACRO) {
      for (const arg_name in this.macro.name_to_arg) {
        if (arg_name in this.args) {
          this.args_given.add(arg_name);
        } else {
          // Default arguments not given to ''.
          this.args[arg_name] = [new AstNode(
            AstType.PLAINTEXT, macros, 'plaintext', '', this.line, this.column)];
        }
      }
    }

    // Set the parents of all children.
    this.parent_node = undefined;
    if (this.node_type === AstType.MACRO) {
      for (const arg_name in this.args) {
        this.args[arg_name].parent_node = this;
      }
    }
  }

  arg_given(arg_name) {
    return this.args_given.has(arg_name);
  }

  /**
   * @param {Object} context
   *        If a call will change this object, it must first make a copy,
   *        otherwise future calls to non descendants would also be affected by the change.
   *
   *        - {Object} options - global options passed in from toplevel. Never modified by calls
   *        - {bool} html_is_attr - are we inside an HTML attribute, which implies implies different
   *                 escape rules, e.g. " and ' must be escaped.
   *        - {bool} html_escape - if false, disable HTML escaping entirely. This is needed for
   *                 content that is passed for an external tool for processing, for example
   *                 Math equations to KaTeX, In that case, the arguments need to be passed as is,
   *                 otherwise e.g. `1 < 2` would escape the `<` to `&lt;` and KaTeX would receive bad input.
   *        - {TreeNode} header_graph - TreeNode graph containing AstNode headers
   *        - {Object} ids - map of document IDs to their description:
   *                 - 'prefix': prefix to add if style=full, e.g. `Figure 1`, `Section 2`, etc.
   *                 - {List[AstNode]} 'title': the title of the element linked to
   *        - {Object[String,Macro]} macros - map of macro name to Macro. Mandatory argument.
   */
  convert(context) {
    if (context === undefined) {
      context = {};
    }
    if (!('macros' in context)) {
      throw new Error('missing mandatory argument macros');
    }
    if (!('html_is_attr' in context)) {
      context.html_is_attr = false;
    }
    if (!('html_escape' in context)) {
      context.html_escape = true;
    }
    if (!('ids' in context)) {
      context.ids = {};
    }
    if (!('errors' in context)) {
      context.errors = [];
    }
    if (!('katex_macros' in context)) {
      context.katex_macros = {};
    }
    return context.macros[this.macro_name].convert(this, context);
  }

  toJSON() {
    let args;
    if (this.node_type === AstType.MACRO) {
      args = object_subset(this.args, this.args_given);
    } else {
      args = this.args;
    }
    return {
      args:       args,
      column:     this.column,
      line:       this.line,
      macro_name: this.macro_name,
      node_type:  this.node_type.toString(),
      id:         this.id,
    }
  }
}

class ErrorMessage {
  constructor(message, line, column) {
    this.message = message;
    this.line = line;
    this.column = column;
  }

  toString() {
    let ret = 'error: ';
    let had_line_or_col = false;
    if (this.line !== undefined) {
      ret += `line ${this.line} `;
      had_line_or_col = true;
    }
    if (this.column !== undefined) {
      ret += `column ${this.column} `;
      had_line_or_col = true;
    }
    if (had_line_or_col)
      ret += ': ';
    ret += this.message;
    return ret
  }
}

class MacroArgument {
  /**
   * @param {String} name
   */
  constructor(options) {
    this.name = options.name;
  }
}

class Macro {
  /**
   * Encapsulates properties of macros, including how to convert
   * them to various output formats.
   *
   * @param {String} name
   * @param {Array[MacroArgument]} args
   * @param {Function} convert
   * @param {Object}
   *        {boolean} phrasing - is this phrasing content?
   *                  (HTML5 elements that can go in paragraphs). This matters to determine
   *                  where `\n\n` paragraphs will split.
   *        {String} auto_parent - automatically surround consecutive sequences of macros with
   *                 the same parent auto_parent into a node with auto_parent type. E.g.,
   *                 to group list items into ul.
   *        {Set[String]} auto_parent_skip - don't do auto parent generation if the parent is one of these types.
   */
  constructor(name, positional_args, convert, options={}) {
    if (!('auto_parent' in options)) {
      options.auto_parent = undefined;
    }
    if (!('auto_parent_skip' in options)) {
      options.auto_parent_skip = new Set([]);
    }
    if (!('named_args' in options)) {
      options.named_args = [];
    }
    if (!('properties' in options)) {
      options.properties = {};
    }
    if (!('id_prefix' in options)) {
      options.id_prefix = title_to_id(name);
    }
    if (!('caption_prefix' in options)) {
      options.caption_prefix = capitalize_first_letter(name);
    }
    if (!('x_style' in options)) {
      options.x_style = XStyle.full;
    }
    this.name = name;
    this.positional_args = positional_args;
    {
      let named_args = {};
      for (const arg of options.named_args) {
        named_args[arg.name] = arg;
      }
      this.named_args = named_args;
    }
    this.auto_parent = options.auto_parent;
    this.auto_parent_skip = options.auto_parent_skip;
    this.convert = convert;
    this.options = options;
    this.id_prefix = options.id_prefix;
    this.properties = options.properties;
    if (!('phrasing' in this.properties)) {
      this.properties['phrasing'] = false;
    }
    this.name_to_arg = {};
    for (const arg of this.positional_args) {
      let name = arg.name;
      this.check_name(name);
      this.name_to_arg[name] = arg;
    }
    for (const name in this.named_args) {
      this.check_name(name);
      this.name_to_arg[name] = this.named_args[name];
    }
    // Add the ID argument.
    this.named_args[Macro.ID_ARGUMENT_NAME] = new MacroArgument({
      name: Macro.ID_ARGUMENT_NAME,
    })
    this.name_to_arg[Macro.ID_ARGUMENT_NAME] = this.named_args[Macro.ID_ARGUMENT_NAME];
  }

  check_name(name) {
    if (name === Macro.ID_ARGUMENT_NAME) {
      throw new Error(`name "${Macro.ID_ARGUMENT_NAME}" is reserved and automatically added`);
    }
    if (name in this.name_to_arg) {
      throw new Error('name already taken: ' + name);
    }
  }

  error(context, message, line, column) {
    context.errors.push(new ErrorMessage(message, line, column));
  }

  katex_convert(ast, context) {
    try {
      return katex.renderToString(
        convert_arg(ast.args.content, clone_and_set(context, 'html_escape', false)),
        {
          macros: context.katex_macros,
          throwOnError: true,
          globalGroup: true,
        }
      );
    } catch(error) {
      // TODO get working remove the crap KaTeX adds to the end of the string.
      // It uses Unicode char hacks to add underlines... and there are two trailing
      // chars after the final newline, so the error message is taking up two lines
      let message = error.toString().replace(/\n\xcc\xb2$/, '');
      this.error(context, message, ast.args.content[0].line, ast.args.content[0].column);
      return error_message_in_output(message);
    }
  }

  self_link(ast) {
    return ` href="#${html_escape_attr(ast.id)}"`;
  }

  toJSON() {
    return {
      name: this.name,
      positional_args: this.positional_args,
      named_args: this.named_args,
      properties: this.properties,
    }
  }

  x_text(ast, context, options={}) {
    if (!('quote' in options)) {
      options.quote = false;
    }
    if (!('show_caption_prefix' in options)) {
      options.show_caption_prefix = true;
    }
    if (!('style' in options)) {
      options.style = XStyle.full;
    }
    let ret = ``;
    if (options.style === XStyle.full) {
      if (options.show_caption_prefix) {
        ret += `${ast.macro.options.caption_prefix} `;
      }
      ret += ast.macro_count;
    }
    if (ast.arg_given(Macro.TITLE_ARGUMENT_NAME)) {
      if (options.style === XStyle.full) {
        ret += html_escape_context(context, `. `);
        if (options.quote)
          ret += html_escape_context(context, `"`);
      }
      ret += convert_arg(ast.args[Macro.TITLE_ARGUMENT_NAME], context);
      if (options.style === XStyle.full && options.quote) {
        ret += html_escape_context(context, `"`);
      }
    }
    return ret;
  }
}
Macro.ID_ARGUMENT_NAME = 'id';
Macro.HEADER_MACRO_NAME = 'h';
Macro.TITLE_ARGUMENT_NAME = 'title';

class Token {
  /**
   * @param {String} type
   * @param {String} value - Default: undefined
   * @param {number} line
   * @param {number} column
   */
  constructor(type, line, column, value) {
    this.type = type;
    this.line = line;
    this.column = column;
    this.value = value;
  }

  toJSON() {
    return {
      type:   this.type.toString(),
      line:   this.line,
      column: this.column,
      value:  this.value
    }
  }
}

class Tokenizer {
  /**
   * @param {String} input_string
   */
  constructor(input_string, extra_returns={}, show_tokenize=false) {
    this.chars = Array.from(input_string);
    this.cur_c = this.chars[0];
    this.column = 1;
    this.extra_returns = extra_returns;
    this.extra_returns.errors = [];
    this.i = 0;
    this.line = 1;
    this.tokens = [];
    this.show_tokenize = show_tokenize;
  }

  // Advance the current character and set cur_c to the next one.
  //
  // Maintain the newline count up to date for debug messages.
  //
  // The current index must only be incremented through this function
  // and never directly.
  consume() {
    this.log_debug('consume');
    this.log_debug('this.i: ' + this.i);
    this.log_debug('this.cur_c: ' + this.cur_c);
    this.log_debug();
    if (this.chars[this.i] === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    this.i += 1;
    if (this.i >= this.chars.length) {
      this.cur_c = undefined;
      return false;
    }
    this.cur_c = this.chars[this.i];
    return true;
  }

  consume_plaintext_char() {
    this.plaintext_append_or_create(this.cur_c);
  }

  consume_optional_newline(literal) {
    if (
      !this.is_end() &&
      this.cur_c === '\n' &&
      (literal || this.peek() !== '\n')
    ) {
      this.consume();
    }
  }

  error(message) {
    this.extra_returns.errors.push(
      new ErrorMessage(message, this.line, this.column));
  }

  is_end() {
    return this.i === this.chars.length;
  }

  log_debug(message='') {
    if (this.show_tokenize) {
      console.error('tokenize: ' + message);
    }
  }

  peek() {
    return this.chars[this.i + 1];
  }

  plaintext_append_or_create(s) {
    let last_token = this.tokens[this.tokens.length - 1];
    if (last_token.type === TokenType.PLAINTEXT) {
      last_token.value += s;
    } else {
      this.push_token(TokenType.PLAINTEXT, s);
    }
    this.consume();
  }

  push_token(token, value, token_line, token_column) {
    this.log_debug('push_token');
    this.log_debug('token: ' + token.toString());
    this.log_debug('value: ' + value);
    this.log_debug();
    if (token_line === undefined)
      token_line = this.line;
    if (token_column === undefined)
      token_column = this.column;
    this.tokens.push(new Token(token, token_line, token_column, value));
  }

  /**
   * @return {Array[Token]}
   */
  tokenize() {
    // Ignore the last newline of the file.
    // It is good practice to always have a newline
    // at the end of files, but it doesn't really mean
    // that the user wants the last element to contain one.
    if (this.chars[this.chars.length - 1] === '\n') {
      this.chars.pop();
    }
    // Add the magic implicit toplevel element.
    this.push_token(TokenType.MACRO_NAME, 'toplevel');
    this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
    while (!this.is_end()) {
      this.log_debug('tokenize loop');
      this.log_debug('this.i: ' + this.i);
      this.log_debug('this.cur_c: ' + this.cur_c);
      this.log_debug();
      if (this.cur_c === ESCAPE_CHAR) {
        this.consume();
        let start_line = this.line;
        let start_column = this.column;
        if (this.is_end()) {
          // Maybe this should be an error.
        } else if (ESCAPABLE_CHARS.has(this.cur_c)) {
          this.consume_plaintext_char();
        } else {
          let macro_name = this.tokenize_func(char_is_identifier);
          this.consume_optional_newline();
          this.push_token(
            TokenType.MACRO_NAME,
            macro_name,
            start_line,
            start_column
          );
        }
      } else if (this.cur_c === START_NAMED_ARGUMENT_CHAR) {
        this.push_token(TokenType.NAMED_ARGUMENT_START);
        // Tokenize past the last open char.
        let open_length = this.tokenize_func(
          (c)=>{return c === START_NAMED_ARGUMENT_CHAR}
        ).length;
        let line = this.line;
        let column = this.column;
        let arg_name = this.tokenize_func(char_is_identifier);
        this.push_token(TokenType.NAMED_ARGUMENT_NAME, arg_name, line, column);
        if (this.cur_c !== NAMED_ARGUMENT_EQUAL_CHAR) {
          this.error(`expected character: '${NAMED_ARGUMENT_EQUAL_CHAR}' got '${this.cur_c}'`);
        }
        // Consume the = sign.
        this.consume();
        if (open_length === 1) {
          this.consume_optional_newline(true);
        } else {
          // Literal argument.
          let close_string = closing_char(
            START_NAMED_ARGUMENT_CHAR).repeat(open_length);
          this.tokenize_literal(START_NAMED_ARGUMENT_CHAR, close_string);
          this.push_token(TokenType.NAMED_ARGUMENT_END);
        }
      } else if (this.cur_c === END_NAMED_ARGUMENT_CHAR) {
        this.push_token(TokenType.NAMED_ARGUMENT_END);
        this.consume();
        this.consume_optional_newline();
      } else if (this.cur_c === START_POSITIONAL_ARGUMENT_CHAR) {
        this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
        // Tokenize past the last open char.
        let open_length = this.tokenize_func(
          (c)=>{return c === START_POSITIONAL_ARGUMENT_CHAR}
        ).length;
        if (open_length === 1) {
          this.consume_optional_newline(true);
        } else {
          // Literal argument.
          let close_string = closing_char(
            START_POSITIONAL_ARGUMENT_CHAR).repeat(open_length);
          this.tokenize_literal(START_POSITIONAL_ARGUMENT_CHAR, close_string);
          this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        }
      } else if (this.cur_c === END_POSITIONAL_ARGUMENT_CHAR) {
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        this.consume();
        this.consume_optional_newline();
      } else if (this.cur_c === '\n') {
        if (this.peek() === '\n') {
          this.push_token(TokenType.PARAGRAPH);
          this.consume();
          this.consume();
        } else {
          this.consume_plaintext_char();
        }
      } else {
        this.consume_plaintext_char();
      }
    }
    // Close the opening of toplevel.
    this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
    return this.tokens;
  }

  // Create a token with all consecutive chars that are accepted
  // by the given function.
  tokenize_func(f) {
    this.log_debug('tokenize_func');
    this.log_debug('this.i: ' + this.i);
    this.log_debug('this.cur_c: ' + this.cur_c);
    this.log_debug('');
    let value = '';
    while (f(this.cur_c)) {
      value += this.cur_c;
      this.consume();
      if (this.is_end())
        break;
    }
    return value;
  }

  /**
   * Start inside the literal argument after the opening,
   * and consume until its end.
   *
   * @returns {boolean} - true if OK, false if EOF unexpected EOF
   */
  tokenize_literal(open_char, close_string) {
    // Remove leading escapes.
    let i = this.i;
    while (this.chars[i] === ESCAPE_CHAR) {
      i++;
      if (this.is_end())
        return false;
    }
    if (this.chars[i] === open_char) {
      // Skip one of the escape chars if they are followed by an open.
      this.consume();
    } else {
      this.consume_optional_newline(true);
    }

    // Now consume the following unescaped part.
    let start_i = this.i;
    let start_line = this.line;
    let start_column = this.column;
    while (
      this.chars.slice(this.i, this.i + close_string.length).join('')
      !== close_string
    ) {
      if (!this.consume())
        return false;
    }
    // Handle trailing escape.
    let append;
    let end_i;
    if (
      this.chars[this.i - 1] === ESCAPE_CHAR &&
      this.chars.slice(this.i + 1, this.i + close_string.length + 1).join('') === close_string
    ) {
      // Ignore the trailing backslash.
      end_i = this.i - 1;
      // Consume the escaped closing char.
      this.consume();
      append = closing_char(open_char);
    } else {
      end_i = this.i;
      append = '';
    }
    this.push_token(
      TokenType.PLAINTEXT,
      this.chars.slice(start_i, end_i).join('') + append,
      start_line,
      start_column
    );

    // Skip over the closing string.
    for (let i = 0; i < close_string.length; i++)
      this.consume();
    return true;
  }
}

class TreeNode {
  constructor(value, parent_node) {
    this.value = value;
    this.parent_node = parent_node;
    this.children = [];
  }
  add_child(child) {
    this.children.push(child);
  }
}

// https://stackoverflow.com/questions/7837456/how-to-compare-arrays-in-javascript
function array_equals(arr1, arr2) {
  if (arr1.length !== arr2.length)
    return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i])
      return false;
  }
  return true;
}

function capitalize_first_letter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function char_is_alphanumeric(c) {
  let code = c.codePointAt(0);
  return (
    // 0-9
    (code > 47 && code < 58) ||
    // A-Z
    (code > 64 && code < 91) ||
    // a-z
    (code > 96 && code < 123)
  )
}

// Valid macro name / argument characters.
// Compatible with JavaScript-like function names / variables.
function char_is_identifier (c) {
  return char_is_alphanumeric(c) || c === '_';
};

/* Clone an object, and set a given value on the cloned one. */
function clone_and_set(obj, key, value) {
  let new_obj = {...obj};
  new_obj[key] = value;
  return new_obj;
}

function closing_char(c) {
  if (c === START_POSITIONAL_ARGUMENT_CHAR)
    return END_POSITIONAL_ARGUMENT_CHAR;
  if (c === START_NAMED_ARGUMENT_CHAR)
    return END_NAMED_ARGUMENT_CHAR;
  throw new Error('char does not have a close: ' + c);
}

function closing_token(token) {
  if (token === TokenType.POSITIONAL_ARGUMENT_START)
    return TokenType.POSITIONAL_ARGUMENT_END;
  if (token === TokenType.NAMED_ARGUMENT_START)
    return TokenType.NAMED_ARGUMENT_END;
  throw new Error('token does not have a close: ' + token);
}

/**
 * Main cirodown input to HTML/LaTeX/etc. output JavaScript API.
 *
 * The CLI interface basically just feeds this.
 *
 * @returns {String}
 */
function convert(
  input_string,
  options,
  extra_returns={},
) {
  if (options === undefined) {
    options = {};
  }
  if (!('body_only'     in options)) { options.body_only     = false; }
  if (!('show_ast'      in options)) { options.show_ast      = false; }
  if (!('show_parse'    in options)) { options.show_parse    = false; }
  if (!('show_tokenize' in options)) { options.show_tokenize = false; }
  if (!('show_tokens'   in options)) { options.show_tokens   = false; }
  macros = macro_list_to_macros();
  extra_returns.errors = [];
  let sub_extra_returns;
  sub_extra_returns = {};
  let tokens = (new Tokenizer(input_string, sub_extra_returns, options.show_tokenize)).tokenize();
  if (options.show_tokens) {
    console.error('tokens:');
    for (let i = 0; i < tokens.length; i++) {
      console.error(`${i}: ${JSON.stringify(tokens[i], null, 2)}`);
    }
    console.error();
  }
  extra_returns.tokens = tokens;
  extra_returns.errors.push(...sub_extra_returns.errors);
  sub_extra_returns = {};
  let ast = parse(tokens, macros, options, sub_extra_returns);
  if (options.show_ast) {
    console.error('ast:');
    console.error(JSON.stringify(ast, null, 2));
    console.error();
  }
  extra_returns.ast = ast;
  extra_returns.errors.push(...sub_extra_returns.errors);
  let errors = [];
  let context = {
    errors: errors,
    extra_returns: extra_returns,
    header_graph: sub_extra_returns.header_graph,
    ids: sub_extra_returns.ids,
    macros: macros,
    options: options,
  };
  output = ast.convert(context);
  extra_returns.errors.push(...errors);
  if (output[output.length - 1] !== '\n') {
    output += '\n';
  }
  return output;
}
exports.convert = convert;

/** Convert an argument to a string.
 *
 * An argument contains a list of nodes, loop over that list of nodes,
 * converting them to strings and concatenate all strings.
 *
 * @param {Array[AstNode]} arg
 * @return {String}
 */
function convert_arg(arg, context) {
  let converted_arg = '';
  for (const ast of arg) {
    converted_arg += ast.convert(context);
  }
  return converted_arg;
}

/* Similar to convert_arg, but used for IDs.
 *
 * Because IDs are used programmatically in cirodown, we don't escape
 * HTML characters at this point.
 *
 * @param {Array[AstNode]} arg
 * @return {String}
 */
function convert_arg_noescape(arg, context={}) {
  return convert_arg(arg, clone_and_set(context, 'html_escape', false));
}

/** Error message to be rendered inside the generated output itself. */
function error_message_in_output(msg) {
  return `[CIRODOWN_ERROR: ${msg}]`
}

/** Convert a key value fully HTML escaped strings to an HTML attribute.
 *
 * @param {String} key
 * @param {Array[AstNode]} arg
 * @return {String} - of form ' a="b"' (with a leading space)
 */
function html_attr(key, value) {
  return ` ${key}="${value}"`;
}

/** Convert an argument to an HTML attribute value.
 *
 * @param {Array[AstNode]} arg
 * @param {Object} context
 * @return {String}
 */
function html_attr_value(arg, context) {
  return convert_arg(arg, clone_and_set(context, 'html_is_attr', true));
}

/** Helper to convert multiple parameters directly to HTML attributes.
 *
 * The ID is automatically included.
 *
 * @param {AstNode} ast
 * @param {Object} options
 * @param {Array[String]} arg_names - which argument names should be added as properties.
 *         Only arguments that were given in the text input are used.
 * @param {Object[String, AstNode]} custom_args - attributes that were not just passed in
 *        directly from the input text, but may rather have been calculated from the node.
 */
function html_convert_attrs(
  ast, context, arg_names=[], custom_args={}
) {
  // Determine the arguments.
  let args = [];
  for (const arg_name in custom_args) {
    args.push([arg_name, custom_args[arg_name]]);
  }
  for (const arg_name of arg_names) {
    if (ast.arg_given(arg_name)) {
      args.push([arg_name, ast.args[arg_name]]);
    }
  }

  // Build the output string.
  let ret = '';
  for (const name_arg_pair of args) {
    [arg_name, arg] = name_arg_pair;
    ret += html_attr(arg_name, html_attr_value(arg, context));
  }
  return ret;
}

function title_to_id(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9-]+/g, ID_SEPARATOR)
    .replace(new RegExp('^' + ID_SEPARATOR + '+'), '')
    .replace(new RegExp(ID_SEPARATOR + '+$'), '')
  ;
}

/**
 * Same interface as html_convert_attrs, but automatically add the ID to the list
 * of arguments.
 *
 * If the ID argument is not explicitly given, derive it from the title argument.
 */
function html_convert_attrs_id(
  ast, context, arg_names=[], custom_args={}
) {
  if (ast.id !== undefined) {
    custom_args[Macro.ID_ARGUMENT_NAME] = [new AstNode(AstType.PLAINTEXT, context.macros,
        'plaintext', ast.id, ast.line, ast.column)];
  }
  return html_convert_attrs(ast, context, arg_names, custom_args);
}

function html_escape_attr(str) {
  return html_escape_content(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  ;
}

function html_escape_content(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  ;
}

function html_escape_context(context, str) {
  if (context.html_escape) {
    if (context.html_is_attr) {
      return html_escape_attr(str);
    } else {
      return html_escape_content(str);
    }
  } else {
    return str;
  }
}

/** Helper for the most common HTML function type that does "nothing magic":
 * only has "id" as a possible attribute, and uses ast.args.content as the
 * main element child.
 */
function html_convert_simple_elem(elem_name, options={}) {
  if (!('newline_after_open' in options)) {
    options.newline_after_open = false;
  }
  if (!('newline_after_close' in options)) {
    options.newline_after_close = true;
  }
  let newline_after_open_str;
  if (options.newline_after_open) {
    newline_after_open_str = '\n';
  } else {
    newline_after_open_str = '';
  }
  let newline_after_close_str;
  if (options.newline_after_close) {
    newline_after_close_str = '\n';
  } else {
    newline_after_close_str = '';
  }
  return function(ast, context) {
    let attrs = html_convert_attrs_id(ast, context);
    let content = convert_arg(ast.args.content, context);
    return `<${elem_name}${attrs}>${newline_after_open_str}${content}</${elem_name}>${newline_after_close_str}`;
  };
}

function macro_list_to_macros() {
  const macros = {};
  for (const macro of DEFAULT_MACRO_LIST) {
    macros[macro.name] = macro;
  }
  return macros;
}

// https://stackoverflow.com/questions/44447847/enums-in-javascript-with-es6/49709701#49709701
function make_enum(arr) {
  let obj = {};
  for (let val of arr){
    obj[val] = Symbol(val);
  }
  return Object.freeze(obj);
}

// https://stackoverflow.com/questions/17781472/how-to-get-a-subset-of-a-javascript-objects-properties/17781518#17781518
function object_subset(source_object, keys) {
  const new_object = {};
  keys.forEach((obj, key) => { new_object[key] = source_object[key]; });
  return new_object;
}

/** Parse tokens into the AST tree.
 *
 * @param {Array[Token]} tokens
 * @return {Object} extra_returns
 *         - {Array[ErrorMessage]} errors
 *         - {Object} ids
 * @return {AstNode}
 */
function parse(tokens, macros, options, extra_returns={}) {
  extra_returns.errors = [];
  let state = {
    extra_returns: extra_returns,
    i: 0,
    macros: macros,
    options: options,
    token: tokens[0],
    tokens: tokens,
  };
  // Call parse_macro on the toplevel macro. The entire document is
  // under that macro, so this will recursively parse everything.
  let ast_toplevel = parse_macro(state);
  if (state.i < tokens.length) {
    parse_error(state, `unexpected tokens at the end of input`);
  }

  // Post process the AST breadth first to support:
  // * the insane but necessary paragraphs double newline syntax
  // * automatic ul parent to li and table to tr
  // * extract all IDs into an ID index
  let todo_visit = [ast_toplevel];
  let macro_counts = {};
  extra_returns.ids = {};
  let header_graph_last_level = 0;
  extra_returns.header_graph = new TreeNode();
  let header_graph_stack = {0: extra_returns.header_graph};
  while (todo_visit.length > 0) {
    const node = todo_visit.shift();
    const macro_name = node.macro_name;

    // Calculate node ID and add it to the ID index.
    let id_context = {'macros': macros};
    if (node.arg_given(Macro.ID_ARGUMENT_NAME)) {
      node.id = convert_arg_noescape(node.args[Macro.ID_ARGUMENT_NAME], id_context);
    } else if (node.arg_given(Macro.TITLE_ARGUMENT_NAME)) {
      // TODO correct unicode aware algorithm.
      let id_text = '';
      let id_prefix = macros[node.macro_name].id_prefix;
      if (id_prefix !== '') {
        id_text += id_prefix + ID_SEPARATOR
      }
      id_text += title_to_id(convert_arg_noescape(node.args.title, id_context));
      node.id = id_text;
    }
    if (node.id !== undefined) {
      extra_returns.ids[node.id] = node;
    }

    // Linear count of each macro type for macros that have IDs.
    if (node.id !== undefined) {
      if (!(macro_name in macro_counts)) {
        macro_counts[macro_name] = 0;
      }
      macro_count = macro_counts[macro_name] + 1;
      macro_counts[macro_name] = macro_count;
      node.macro_count = macro_count;
    }

    // Linear count of each macro type for macros that have IDs.
    if (macro_name === Macro.HEADER_MACRO_NAME) {
      let level = parseInt(convert_arg_noescape(node.args.level, id_context));
      let new_tree_node = new TreeNode(node, header_graph_stack[level - 1]);
      if ((level - header_graph_last_level) > 1) {
        parse_error(
          state,
          `skipped a header level from ${header_graph_last_level} to ${level}`,
          node.args.level[0].line,
          node.args.level[0].column
        );
      }
      let parent_tree_node = header_graph_stack[level - 1];
      if (parent_tree_node !== undefined) {
        parent_tree_node.add_child(new_tree_node);
      }
      header_graph_stack[level] = new_tree_node;
      header_graph_last_level = level;
    }

    // Loop over the child arguments.
    if (node.node_type === AstType.MACRO) {
      for (const arg_name in node.args) {
        let arg = node.args[arg_name];

        // Add ul and table implicit parents.
        let new_arg = [];
        for (let i = 0; i < arg.length; i++) {
          let child_node = arg[i];
          let new_child_node;
          if (child_node.node_type === AstType.MACRO) {
            let child_name = child_node.macro_name;
            let child_macro = state.macros[child_name];
            if (child_macro.auto_parent !== undefined) {
              let auto_parent_name = child_macro.auto_parent;
              if (
                node.macro_name !== auto_parent_name &&
                !child_macro.auto_parent_skip.has(node.macro_name)
              ) {
                let start_auto_child_index = i;
                let start_auto_child_node = child_node;
                i++;
                while (
                  i < arg.length &&
                  arg[i].node_type === AstType.MACRO &&
                  state.macros[arg[i].macro_name].auto_parent === auto_parent_name
                ) {
                  i++;
                }
                new_child_node = new AstNode(
                  AstType.MACRO,
                  state.macros,
                  auto_parent_name,
                  {
                    'content': arg.slice(start_auto_child_index, i),
                  },
                  start_auto_child_node.line,
                  start_auto_child_node.column,
                )
                // Because the for loop will advance past it.
                i--;
              }
            }
          }
          if (new_child_node === undefined) {
            new_child_node = child_node;
          }
          new_arg.push(new_child_node);
        }
        arg = new_arg;

        // Add paragraphs.
        let paragraph_indexes = [];
        for (let i = 0; i < arg.length; i++) {
          const child_node = arg[i];
          if (child_node.node_type === AstType.PARAGRAPH) {
            paragraph_indexes.push(i);
          }
        }
        if (paragraph_indexes.length > 0) {
          new_arg = [];
          let paragraph_start = 0;
          for (const paragraph_index of paragraph_indexes) {
            parse_add_paragraph(state, new_arg, arg, paragraph_start, paragraph_index);
            paragraph_start = paragraph_index + 1;
          }
          parse_add_paragraph(state, new_arg, arg, paragraph_start, arg.length);
          arg = new_arg;
        }

        // Push children to continue the search.
        for (const child_node of arg) {
          todo_visit.push(child_node);
        }

        // Update the argument.
        node.args[arg_name] = arg;
      }
    }
  }

  return ast_toplevel;
}

// Maybe add a paragraph after a \n\n.
function parse_add_paragraph(
  state, new_arg, arg, paragraph_start, paragraph_end
) {
  parse_log_debug(state, 'function: parse_add_paragraph');
  parse_log_debug(state, 'arg: ' + JSON.stringify(arg, null, 2));
  parse_log_debug(state, 'paragraph_start: ' + paragraph_start);
  parse_log_debug(state, 'paragraph_end: ' + paragraph_end);
  parse_log_debug(state);
  const slice = arg.slice(paragraph_start, paragraph_end);
  const macro = state.macros[arg[paragraph_start].macro_name];
  if (macro.properties.phrasing) {
    // If the first element after the double newline is phrasing content,
    // create a paragraph and put all elements inside the paragraph.
    new_arg.push(
      new AstNode(
        AstType.MACRO,
        state.macros,
        'p',
        {
          'content': slice
        },
        arg[paragraph_start].line,
        arg[paragraph_start].column,
      )
    );
  } else {
    // Otherwise, don't create the paragraph, and keep all elements as they were.
    new_arg.push(...slice);
  }
}

// Consume one token.
function parse_consume(state) {
  state.i += 1;
  if (state.i >= state.tokens.length)
    return undefined;
  state.token = state.tokens[state.i];
  parse_log_debug(state, 'function: parse_consume');
  parse_log_debug(state, 'state.i = ' + state.i.toString())
  parse_log_debug(state, 'state.token = ' + JSON.stringify(state.token));
  parse_log_debug(state);
  return state.token;
}

function parse_log_debug(state, msg='') {
  if (state.options.show_parse) {
    console.error('show_parse: ' + msg);
  }
}

// Parse one macro.
function parse_macro(state) {
  parse_log_debug(state, 'function: parse_macro');
  parse_log_debug(state, 'state = ' + JSON.stringify(state.token));
  parse_log_debug(state);
  if (state.token.type === TokenType.MACRO_NAME) {
    const macro_name = state.token.value;
    const macro_line = state.token.line;
    const macro_column = state.token.column;
    let positional_arg_count = 0;
    const args = {};
    let macro;
    let macro_type;
    const unknown_macro_message = `unknown macro name: "${macro_name}"`;
    if (macro_name in state.macros) {
      macro = state.macros[macro_name];
      macro_type = AstType.MACRO;
    } else {
      macro_type = AstType.ERROR;
      parse_error(state, unknown_macro_message);
    }
    // Consume the MACRO_NAME token out.
    parse_consume(state);
    while (
      state.token.type === TokenType.POSITIONAL_ARGUMENT_START ||
      state.token.type === TokenType.NAMED_ARGUMENT_START
    ) {
      let arg_name;
      let open_type = state.token.type;
      let open_argument_line = state.token.line;
      let open_argument_column = state.token.column;
      // Consume the *_ARGUMENT_START token out.
      parse_consume(state);
      if (open_type === TokenType.POSITIONAL_ARGUMENT_START) {
        if (macro_type === AstType.ERROR) {
          arg_name = positional_arg_count.toString();
        } else {
          if (positional_arg_count >= macro.positional_args.length) {
            parse_error(state,
              `unknown named macro argument "${arg_name}" of macro "${macro_name}"`,
              open_argument_line,
              open_argument_column
            );
            arg_name = positional_arg_count.toString();
          } else {
            arg_name = macro.positional_args[positional_arg_count].name;
          }
          positional_arg_count += 1;
        }
      } else {
        // Named argument.
        let name_line = state.token.line;
        let name_column = state.token.column;
        arg_name = state.token.value;
        if (macro_type !== AstType.ERROR && !(arg_name in macro.named_args)) {
          parse_error(state,
            `unknown named macro argument "${arg_name}" of macro "${macro_name}"`,
            name_line,
            name_column
          );
        }
        // Parse the argument name out.
        parse_consume(state);
      }
      let arg_children = [];
      while (
        state.token.type !== TokenType.POSITIONAL_ARGUMENT_END &&
        state.token.type !== TokenType.NAMED_ARGUMENT_END
      ) {
        // The recursive case.
        arg_children.push(parse_macro(state));
      }
      if (state.token.type !== closing_token(open_type)) {
        parse_error(state,
          `expected a closing '${END_POSITIONAL_ARGUMENT_CHAR}' found '${state.token.type.toString()}'`);
      }
      args[arg_name] = arg_children;
      // Consume the *_ARGUMENT_END token out.
      parse_consume(state);
    }
    if (macro_type === AstType.ERROR) {
      return new AstNode(
        macro_type,
        state.macros,
        'plaintext',
        error_message_in_output(unknown_macro_message),
        state.token.line,
        state.token.column
      );
    } else {
      return new AstNode(macro_type, macros, macro_name, args, macro_line, macro_column);
    }
  } else if (state.token.type === TokenType.PLAINTEXT) {
    // Non-recursive case.
    let node = new AstNode(
      AstType.PLAINTEXT,
      state.macros,
      'plaintext',
      state.token.value,
      state.token.line,
      state.token.column
    );
    // Consume the PLAINTEXT node out.
    parse_consume(state);
    return node;
  } else if (state.token.type === TokenType.PARAGRAPH) {
    let node = new AstNode(
      AstType.PARAGRAPH,
      state.macros,
      undefined,
      undefined,
      state.token.line,
      state.token.column
    );
    // Consume the PLAINTEXT node out.
    parse_consume(state);
    return node;
  } else {
    parse_error(
      state,
      `unexpected token ${state.token.type.toString()}`
    );
    let node = new AstNode(
      AstType.PLAINTEXT,
      state.macros,
      'plaintext',
      error_message_in_output('unexpected token'),
      state.token.line,
      state.token.column
    );
    // Consume past whatever happened to avoid an infinite loop.
    parse_consume(state);
    return node;
  }
  state.i += 1;
}

function parse_error(state, message, line, column) {
  if (line === undefined)
    line = state.token.line;
  if (column === undefined)
    column = state.token.column;
  state.extra_returns.errors.push(new ErrorMessage(
    message, line, column));
}

const END_NAMED_ARGUMENT_CHAR = '}';
const END_POSITIONAL_ARGUMENT_CHAR = ']';
const ESCAPE_CHAR = '\\';
const ID_SEPARATOR = '-';
const NAMED_ARGUMENT_EQUAL_CHAR = '=';
const START_NAMED_ARGUMENT_CHAR = '{';
const START_POSITIONAL_ARGUMENT_CHAR = '[';
const ESCAPABLE_CHARS = new Set([
  ESCAPE_CHAR,
  START_POSITIONAL_ARGUMENT_CHAR,
  END_POSITIONAL_ARGUMENT_CHAR,
  START_NAMED_ARGUMENT_CHAR,
  END_NAMED_ARGUMENT_CHAR,
]);
const AstType = make_enum([
  'ERROR',
  'MACRO',
  'PLAINTEXT',
  'PARAGRAPH',
]);
const XStyle = make_enum([
  'full',
  'short',
]);
const TokenType = make_enum([
  'PLAINTEXT',
  'MACRO_NAME',
  'PARAGRAPH',
  'POSITIONAL_ARGUMENT_START',
  'POSITIONAL_ARGUMENT_END',
  'NAMED_ARGUMENT_START',
  'NAMED_ARGUMENT_END',
  'NAMED_ARGUMENT_NAME',
]);
const DEFAULT_MACRO_LIST = [
  new Macro(
    'a',
    [
      new MacroArgument({
        name: 'href',
      }),
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let content_arg;
      if (ast.arg_given('content')) {
        content_arg = ast.args.content;
      } else {
        content_arg = ast.args.href;
      }
      let attrs = html_convert_attrs_id(ast, context, ['href']);
      let content = convert_arg(content_arg, context);
      return `<a${attrs}>${content}</a>`;
    },
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'C',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let content = convert_arg(ast.args.content, context);
      return `<pre${attrs}><code>${content}</code></pre>\n`;
    },
  ),
  new Macro(
    'c',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('code', {newline_after_close: false}),
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'Comment',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      return '';
    }
  ),
  new Macro(
    'comment',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      return '';
    },
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    Macro.HEADER_MACRO_NAME,
    [
      new MacroArgument({
        name: 'level',
      }),
      new MacroArgument({
        name: Macro.TITLE_ARGUMENT_NAME,
      }),
    ],
    function(ast, context) {
      let custom_args;
      let level_arg = ast.args.level;
      let level = convert_arg_noescape(level_arg, context);
      let level_int = parseInt(level);
      if (!Number.isInteger(level_int) || !(level_int > 0)) {
        let message = `level must be a positive non-zero integer: "${level}"`;
        this.error(context, message, level_arg[0].line, level_arg[0].column);
        return error_message_in_output(message);
      }
      if (level_int > 6) {
        custom_args = {'data-level': [new AstNode(AstType.PLAINTEXT,
          context.macros, 'plaintext', level, ast.line, ast.column)]};
        level = '6';
      } else {
        custom_args = {};
      }
      let attrs = html_convert_attrs_id(ast, context, [], custom_args);
      return `<h${level}${attrs}><a${this.self_link(ast)}>${this.x_text(ast, context, {show_caption_prefix: false})}</a></h${level}>\n`;
    },
    {
      caption_prefix: 'Section',
      id_prefix: '',
      x_style: XStyle.short,
    }
  ),
  new Macro(
    'l',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('li'),
    {
      auto_parent: 'ul',
      auto_parent_skip: new Set(['ol'])
    }
  ),
  new Macro(
    'M',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let ret = ``;
      ret += `<div class="math-containter"${attrs}>`;
      if (ast.id !== undefined) {
        ret += `<div class="math-caption">${this.x_text(ast, context)}</div>\n`;
      }
      ret += `<div>${this.katex_convert(ast, context)}</div>\n`;
      ret += `</div>\n`;
      return ret;
    },
    {
      caption_prefix: 'Equation',
      id_prefix: 'equation',
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
      ],
    }
  ),
  new Macro(
    'm',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      // KaTeX already adds a <span> for us.
      return this.katex_convert(ast, context);
    },
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'Image',
    [
      new MacroArgument({
        name: 'src',
      }),
    ],
    function(ast, context) {
      let img_attrs = html_convert_attrs(ast,context, ['src', 'alt']);
      let figure_attrs = html_convert_attrs_id(ast, context);
      let ret = `<figure${figure_attrs}>\n`
      if (ast.id !== undefined) {
        ret += `<a${this.self_link(ast)}>`
      }
      ret += `<img${img_attrs}>`;
      if (ast.id !== undefined) {
        ret += `</a>`;
      }
      ret += `\n`;
      if (ast.id !== undefined) {
        ret += `<figcaption>${this.x_text(ast, context)}</figcaption>\n`;
      }
      ret += '</figure>\n';
      return ret;
    },
    {
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
        new MacroArgument({
          name: 'description',
        }),
        new MacroArgument({
          name: 'source',
        }),
      ],
    }
  ),
  new Macro(
    'image',
    [
      new MacroArgument({
        name: 'src',
      }),
      new MacroArgument({
        name: 'alt',
      }),
    ],
    function(ast, context) {
      let img_attrs = html_convert_attrs_id(ast, context, ['src', 'alt']);
      return `<img${img_attrs}>`;
    },
    {
      phrasing: true,
    }
  ),
  new Macro(
    'ol',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('ol', {newline_after_open: true}),
  ),
  new Macro(
    'p',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('p'),
  ),
  new Macro(
    'plaintext',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      return html_escape_context(context, ast.args);
    },
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'table',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let content = convert_arg(ast.args.content, context);
      let ret = ``;
      ret += `<div class="table-container"${attrs}>\n`;
      if (ast.id !== undefined) {
        // TODO not using caption because I don't know how to allow the caption to be wider than the table.
        // I don't want the caption to wrap to a small table size.
        //
        // If we ever solve that, re-add the following style:
        //
        // caption {
        //   color: black;
        //   text-align: left;
        // }
        //
        //Caption on top as per: https://tex.stackexchange.com/questions/3243/why-should-a-table-caption-be-placed-above-the-table */
        ret += `<div class="table-caption">${this.x_text(ast, context)}</div>\n`;
      }
      ret += `<table>\n${content}</table>\n`;
      ret += `</div>\n`;
      return ret;
    },
    {
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
      ],
    }
  ),
  new Macro(
    'td',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('td'),
  ),
  new Macro(
    'toc',
    [],
    function(ast, context) {
      let ret = `<div class="toc-container">\n`;
      let todo_visit = [];
      let last_level = 0;
      for (let i = context.header_graph.children.length - 1; i >= 0; i--) {
        todo_visit.push([context.header_graph.children[i], 1]);
      }
      while (todo_visit.length > 0) {
        const [tree_node, level] = todo_visit.pop();
        if (level > last_level) {
          ret += `<ul>\n`;
        } else if (level < last_level) {
          ret += `</li>\n</ul>\n`.repeat(last_level - level);
        } else {
          ret += `</li>\n`;
        }
        let target_ast = tree_node.value;
        let attrs = html_convert_attrs_id(ast, context);
        let content = this.x_text(target_ast, context, {show_caption_prefix: false});
        let href = html_attr('href', '#' + html_escape_attr(target_ast.id));
        ret += `<li><a${href}${attrs}>${content}</a>`;
        if (tree_node.children.length > 0) {
          for (let i = tree_node.children.length - 1; i >= 0; i--) {
            todo_visit.push([tree_node.children[i], level + 1]);
          }
          ret += `\n`;
        }
        last_level = level;
      }
      ret += `</li>\n</ul>\n`.repeat(last_level);
      ret += `</div>\n`
      return ret;
    },
  ),
  new Macro(
    'toplevel',
    [
      new MacroArgument({
        name: 'content',
      }),
      new MacroArgument({
        name: Macro.TITLE_ARGUMENT_NAME,
      }),
    ],
    function(ast, context) {
      let title;
      if (ast.arg_given(Macro.TITLE_ARGUMENT_NAME)) {
        title = ast.args.title;
      } else {
        let text_title;
        if (Macro.TITLE_ARGUMENT_NAME in context.options) {
          text_title = context.options[Macro.TITLE_ARGUMENT_NAME];
        } else {
          text_title = 'dummy title because title is mandatory in HTML';
        }
        title = [new AstNode(AstType.PLAINTEXT, context.macros,
          'plaintext', text_title, ast.line, ast.column)];
      }
      let ret = '';
      if (!context.options.body_only) {
        ret += `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>${convert_arg(title, context)}</title>
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/katex@0.11.1/dist/katex.min.css"
  crossorigin="anonymous"
>
<link href="https://netdna.bootstrapcdn.com/bootstrap/3.3.1/css/bootstrap.min.css" rel="stylesheet"/>
<style>
.katex { font-size: 1.5em; }
body {
  padding-left: 15px;
  padding-right: 15px;
}
/* Headers are links to self, but we want them always black. */
h1 a:link, h2 a:link, h3 a:link, h4 a:link, h5 a:link, h6 a:link,
h1 a:visited, h2 a:visited, h3 a:visited, h4 a:visited, h5 a:visited, h6 a:visited {
  color: black;
  font-size: 24px;
}
h1, h2, h3, h4, h5, h6 {
  margin-top: 20px;
}
/* Tables */
/* Add borders! */
table {
  border-collapse: collapse;
}
table, th, td {
  border: 1px solid black;
}
th, td {
  padding-left: 2px;
  padding-right: 2px;
}
/* Table of contents. */
.toc-container ul {
  list-style-type: none;
}
</style>
<body>
`
      }
      ret += convert_arg(ast.args.content, context);
      if (!context.options.body_only) {
        ret += `</body>
</html>
`
      }
      return ret;
    }
  ),
  new Macro(
    'th',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('th'),
  ),
  new Macro(
    'tr',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('tr', {newline_after_open: true}),
    {
      auto_parent: 'table',
    }
  ),
  new Macro(
    'ul',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem('ul', {newline_after_open: true}),
  ),
  new Macro(
    'x',
    [
      new MacroArgument({
        name: 'href',
      }),
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let content_arg;
      let target_id = convert_arg_noescape(ast.args.href, context);
      if (target_id in context.ids) {
        target_id_ast = context.ids[target_id];
        let content;
        if (ast.arg_given('content')) {
          content = convert_arg(ast.args.content, context);
        } else {
          let x_text_options = {
            style: target_id_ast.macro.options.x_style,
            quote: true,
          };
          if (ast.arg_given('style')) {
            let style_string = convert_arg_noescape(ast.args.style, context);
            if (!(style_string in XStyle)) {
              let message = `unkown x style: "${style_string}"`;
              this.error(context, message, ast.args.style[0].line, ast.args.style[0].column);
              return error_message_in_output(message);
            }
            x_text_options.style = XStyle[style_string];
          }
          content = this.x_text(target_id_ast, context, x_text_options);
          if (content === ``) {
            let message = `empty cross reference body: "${target_id}"`;
            this.error(context, message, ast.line, ast.column);
            return error_message_in_output(message);
          }
        }
        let attrs = html_convert_attrs_id(ast, context);
        let href = html_attr('href', '#' + html_escape_attr(target_id));
        return `<a${href}${attrs}>${content}</a>`;
      } else {
        let message = `cross reference to unknown id: "${target_id}"`;
        this.error(context, message, ast.args.href[0].line, ast.args.href[0].column);
        return error_message_in_output(message);
      }
    },
    {
      named_args: [
        new MacroArgument({
          // TODO restrict to valid choices.
          name: 'style',
        }),
      ],
      properties: {
        phrasing: true,
      }
    }
  ),
];
