"use strict";

const katex = require('katex');

// consts used by classes.
const UNICODE_LINK = String.fromCodePoint(0x1F517);

class AstNode {
  /**
   * @param {AstType} node_type -
   * @param {String} macro_name - - if node_type === AstType.PLAINTEXT or AstType.ERROR: fixed to
   *                                AstType.PLAINTEXT_MACRO_NAME
   *                              - elif node_type === AstType.PARAGRAPH: fixed to undefined
   *                              - else: arbitrary regular macro
   * @param {Object[String, Array[AstNode]]} args - dict of arg names to arguments.
   *        where arguments are arrays of AstNode
   * @param {Number} line - the best representation of where the macro is starts in the document
   *                        used primarily to present useful debug messages
   * @param {Number} column
   * @param {Object} options
   *                 {String} text - the text content of an AstType.PLAINTEXT, undefined for other types
   */
  constructor(node_type, macro_name, args, line, column, options={}) {
    if (!('from_include' in options)) {
      options.from_include = false;
    }
    if (!('force_no_index' in options)) {
      options.force_no_index = false;
    }
    if (!('id' in options)) {
      options.id = undefined;
    }
    if (!('input_path' in options)) {
      options.input_path = undefined;
    }
    if (!('parent_node' in options)) {
      options.parent_node = undefined;
    }
    if (!('text' in options)) {
      options.text = undefined;
    }

    // Generic fields.
    this.node_type = node_type;
    this.macro_name = macro_name;
    this.args = args;
    this.line = line;
    this.input_path = options.input_path;
    this.column = column;
    // This is the Nth macro of this type that appears in the document.
    this.macro_count = undefined;
    // This is the Nth indexed macro (one that can be linked to)
    // of this type that appears in the document.
    this.macro_count_indexed = undefined;
    this.parent_node = options.parent_node;

    // For elements that are of AstType.PLAINTEXT.
    this.text = options.text

    // For elements that have an id.
    // {String} or undefined.
    this.id = options.id;
    // The ID of this element has been indexed.
    this.index_id = undefined
    this.force_no_index = options.force_no_index;

    // This was added to the tree from an include.
    this.from_include = options.from_include;

    // Header only fields.
    // {Number}
    this.level = undefined;
    // {TreeNode}
    this.header_tree_node = undefined;
    // Includes under this header.
    this.includes = [];

    for (const argname in args) {
      for (const arg of args[argname]) {
        arg.parent_node = this;
      }
    }
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
   *                 - 'prefix': prefix to add if style_full, e.g. `Figure 1`, `Section 2`, etc.
   *                 - {List[AstNode]} 'title': the title of the element linked to
   * @param {Object} context
   */
  convert(context) {
    if (context === undefined) {
      context = {};
    }
    if (!('errors' in context)) {
      context.errors = [];
    }
    if (!('html_escape' in context)) {
      context.html_escape = true;
    }
    if (!('html_is_attr' in context)) {
      context.html_is_attr = false;
    }
    if (!('id_provider' in context)) {
      context.id_provider = {};
    }
    if (!('katex_macros' in context)) {
      context.katex_macros = {};
    }
    if (!('macros' in context)) {
      throw new Error('contenxt does not have a mandatory .macros property');
    }
    const macro = context.macros[this.macro_name];
    let out;

    // Do some error checking. If no errors are found, convert normally. Save output on out.
    {
      let error_message = undefined;
      const name_to_arg = macro.name_to_arg;
      for (const argname in name_to_arg) {
        const macro_arg = name_to_arg[argname];
        if (macro_arg.mandatory && !(argname in this.args)) {
          error_message = `missing mandatory argument ${argname} of ${this.macro_name}`;
          break;
        }
        if (macro_arg.boolean && (argname in this.args)) {
          const arg = this.args[argname];
          if (arg.length > 0) {
            error_message = `boolean arguments like "${argname}" of "${this.macro_name}" cannot have values, use just "{${argname}}" instead`;
            break;
          }
        }
      }
      if (error_message === undefined) {
        out = macro.convert(this, context);
      } else {
        macro.error(context, error_message, this.line, this.column);
        out = error_message_in_output(error_message, context);
      }
    }

    // Add a div to all direct children of toplevel to implement
    // the on hover links to self and left margin.
    {
      const parent_node = this.parent_node;
      if (
        parent_node !== undefined &&
        parent_node.macro_name === Macro.TOPLEVEL_MACRO_NAME &&
        this.id !== undefined &&
        macro.toplevel_link
      ) {
        out = `<div>${html_hide_hover_link(this.id)}${out}</div>`;
      }
    }

    return out;
  }

  /** Manual implementation. There must be a better way, but I can't find it... */
  static fromJSON(json_string) {
    let json = JSON.parse(json_string);
    let toplevel_ast = new AstNode(AstType[json.node_type], json.macro_name,
      json.args, json.line, json.column, json.text);
    let nodes = [toplevel_ast];
    while (nodes.length !== 0) {
      let cur_ast = nodes.pop();
      for (let arg_name in cur_ast.args) {
        let arg = cur_ast.args[arg_name];
        let new_arg = [];
        for (let macro of arg) {
          let new_ast = new AstNode(AstType[macro.node_type], macro.macro_name,
            macro.args, macro.line, macro.column, {text: macro.text});
          new_arg.push(new_ast);
          nodes.push(new_ast);
        }
        arg.splice(0, new_arg.length, ...new_arg);
      }
    }
    return toplevel_ast;
  }

  toJSON() {
    return {
      macro_name: this.macro_name,
      node_type:  this.node_type.toString(),
      line:       this.line,
      column:     this.column,
      text:       this.text,
      args:       this.args,
    }
  }
}
exports.AstNode = AstNode;

class ErrorMessage {
  constructor(message, line, column) {
    this.message = message;
    this.line = line;
    this.column = column;
  }

  toString(path) {
    let ret = 'error: ';
    if (path !== undefined) {
      ret += `${path}: `;
    }
    let had_line_or_col = false;
    if (this.line !== undefined) {
      ret += `line ${this.line}`;
      had_line_or_col = true;
    }
    if (this.column !== undefined) {
      if (this.line !== undefined) {
        ret += ` `;
      }
      ret += `column ${this.column}`;
      had_line_or_col = true;
    }
    if (had_line_or_col)
      ret += ': ';
    ret += this.message;
    return ret
  }
}

/** Interface to retrieving the nodes of IDs defined in external files.
 *
 * We need the abstraction because IDs will come from widely different locations
 * between browser and local Node.js operation:
 *
 * - browser: HTTP requests
 * - local: sqlite database
 */
class IdProvider {
  /**
   * @return remove all IDs from this ID provider for the given path.
   *         For example, on a local ID database cache, this would clear
   *         all IDs from the cache.
   */
  clear(input_path_noext_renamed) { throw 'unimplemented'; }

  /**
   * @param {String} id
   * @return {Union[AstNode,undefined]}.
   *         undefined: ID not found
   *         Otherwise, the ast node for the given ID
   */
  get(id) { throw 'unimplemented'; }

  /**
   * @param {String} id
   * @return {Array[AstNode]}: all header nodes that have the given ID
   *                           as a parent includer.
   */
  get_includes(id) { throw 'unimplemented'; }
}
exports.IdProvider = IdProvider;

/** IdProvider that first tries id_provider_1 and then id_provider_2.
 *
 * The initial use case for this is to transparently use either IDs defined
 * in the current document, or IDs defined externally.
 */
class ChainedIdProvider extends IdProvider {
  constructor(id_provider_1, id_provider_2) {
    super();
    this.id_provider_1 = id_provider_1;
    this.id_provider_2 = id_provider_2;
  }
  get(id) {
    let ret;
    ret = this.id_provider_1.get(id);
    if (ret !== undefined) {
      return ret;
    }
    ret = this.id_provider_2.get(id);
    if (ret !== undefined) {
      return ret;
    }
    return undefined;
  }
  get_includes(id) {
    return this.id_provider_1.get_includes(id).concat(
      this.id_provider_2.get_includes(id));
  }
}

/** ID provider from a dict.
 * The initial use case is to represent locally defined IDs, and inject
 * them into ChainedIdProvider together with externally defined IDs.
 */
class DictIdProvider extends IdProvider {
  constructor(dict) {
    super();
    this.dict = dict;
  }
  get(id) {
    if (id in this.dict) {
      return this.dict[id];
    }
    return undefined;
  }
  get_includes(id) {
    return [];
  }
}

class MacroArgument {
  /**
   * @param {String} name
   */
  constructor(options) {
    if (!('elide_link_only' in options)) {
      // If the only thing contained in this argument is a single
      // Macro.LINK_MACRO_NAME macro, AST post processing instead extracts
      // the href of that macro, and transforms it into a text node with that href.
      //
      // Goal: to allow the use to write both \a[http://example.com] and
      // \p[http://example.com] and get what a sane person expects, see also:
      // https://cirosantilli.com/cirodown#insane-link-parsing-rules
      options.elide_link_only = false;
    }
    if (!('boolean' in options)) {
      // https://cirosantilli.com/cirodown#boolean-named-arguments
      options.boolean = false;
    }
    if (!('mandatory' in options)) {
      // https://cirosantilli.com/cirodown#mandatory-positional-arguments
      options.mandatory = false;
    }
    if (!('remove_whitespace_children' in options)) {
      // https://cirosantilli.com/cirodown#remove_whitespace_children
      options.remove_whitespace_children = false;
    }
    this.boolean = options.boolean;
    this.elide_link_only = options.elide_link_only;
    this.mandatory = options.mandatory;
    this.name = options.name;
    this.remove_whitespace_children = options.remove_whitespace_children;
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
   * @param {Object} options
   *        {boolean} phrasing - is this phrasing content?
   *                  (HTML5 elements that can go in paragraphs). This matters to:
   *                  - determine where `\n\n` paragraphs will split
   *                  - phrasing content does not get IDs
   *        {String} auto_parent - automatically surround consecutive sequences of macros with
   *                 the same parent auto_parent into a node with auto_parent type. E.g.,
   *                 to group list items into ul.
   *        {Set[String]} auto_parent_skip - don't do auto parent generation if the parent is one of these types.
   *        {Function[AstNode, Object] -> String} get_number - return the number that shows on on full references
   *                 as a string, e.g. "123" in "Figure 123." or "1.2.3" in "Section 1.2.3.".
   *                 A return of undefined means that the number is not available, e.g. this is current limitation
   *                 of cross references to other files (could be implemented).
   *        {Function[AstNode, Object] -> Bool} macro_counts_ignore - if true, then an ID should not be automatically given
   *                 to this node. This is usually the case for nodes that are not visible in the final output,
   *                 otherwise that would confuse readers.
   */
  constructor(name, positional_args, convert, options={}) {
    if (!('auto_parent' in options)) {
      // https://cirosantilli.com/cirodown#auto_parent
      options.auto_parent = undefined;
    }
    if (!('auto_parent_skip' in options)) {
      options.auto_parent_skip = new Set([]);
    }
    if (!('caption_prefix' in options)) {
      options.caption_prefix = capitalize_first_letter(name);
    }
    if (!('get_number' in options)) {
      options.get_number = function(ast, context) { return ast.macro_count_indexed; }
    }
    if (!('id_prefix' in options)) {
      options.id_prefix = title_to_id(name);
    }
    if (!('macro_counts_ignore' in options)) {
      options.macro_counts_ignore = function(ast, context) {
        return false;
      }
    }
    if (!('named_args' in options)) {
      options.named_args = [];
    }
    if (!('properties' in options)) {
      options.properties = {};
    }
    if (!('toplevel_link' in options)) {
      options.toplevel_link = true;
    }
    if (!('x_style_full' in options)) {
      options.x_style_full = true;
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
    this.remove_whitespace_children = options.remove_whitespace_children;
    this.convert = convert;
    this.options = options;
    this.id_prefix = options.id_prefix;
    this.properties = options.properties;
    this.toplevel_link = options.toplevel_link;
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
      return error_message_in_output(message, context);
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

  /** Calculate the text of a cross reference, or the text
   * that the caption text that cross references can refer to, e.g.
   * "Table 123. My favorite table". Both are done in a single function
   * so that style_full references will show very siimlar to the caption
   * they refer to.
   *
   * @param {Object} options
   *   @param {Object} href_prefix rendered string containing the href="..."
   *   part of a link to self to be applied e.g. to <>Figure 1<>, of undefined
   *   if this link should not be given.
   */
  static x_text(ast, context, options={}) {
    if (!('caption_prefix_span' in options)) {
      options.caption_prefix_span = true;
    }
    if (!('quote' in options)) {
      options.quote = false;
    }
    if (!('href_prefix' in options)) {
      options.href_prefix = undefined;
    }
    if (!('show_caption_prefix' in options)) {
      options.show_caption_prefix = true;
    }
    if (!('style_full' in options)) {
      options.style_full = true;
    }
    let ret = ``;
    let number;
    if (options.style_full) {
      if (options.href_prefix !== undefined) {
        ret += `<a${options.href_prefix}>`
      }
      if (options.show_caption_prefix) {
        if (options.caption_prefix_span) {
          ret += `<span class="caption-prefix">`;
        }
        ret += `${context.macros[ast.macro_name].options.caption_prefix} `;
      }
      number = context.macros[ast.macro_name].options.get_number(ast, context);
      if (number !== undefined) {
        ret += number;
      }
      if (options.show_caption_prefix && options.caption_prefix_span) {
        ret += `</span>`;
      }
      if (options.href_prefix !== undefined) {
        ret += `</a>`
      }
    }
    if (Macro.TITLE_ARGUMENT_NAME in ast.args) {
      if (options.style_full) {
        if (number !== undefined) {
          ret += html_escape_context(context, `. `);
        }
        if (options.quote)
          ret += html_escape_context(context, `"`);
      }
      ret += convert_arg(ast.args[Macro.TITLE_ARGUMENT_NAME], context);
      if (options.style_full && options.quote) {
        ret += html_escape_context(context, `"`);
      }
    }
    return ret;
  }
}
// Macro names defined here are those that have magic properties, e.g.
// headers are used by the 'toc'.
Macro.CIRODOWN_EXAMPLE_MACRO_NAME = 'cirodown_example';
Macro.CODE_MACRO_NAME = 'c';
Macro.HEADER_MACRO_NAME = 'h';
Macro.ID_ARGUMENT_NAME = 'id';
Macro.INCLUDE_MACRO_NAME = 'include';
Macro.LINK_MACRO_NAME = 'a';
Macro.MATH_MACRO_NAME = 'm';
Macro.PARAGRAPH_MACRO_NAME = 'p';
Macro.PLAINTEXT_MACRO_NAME = 'plaintext';
Macro.TITLE_ARGUMENT_NAME = 'title';
Macro.TOC_MACRO_NAME = 'toc';
Macro.TOC_PREFIX = 'toc-'
Macro.TOPLEVEL_MACRO_NAME = 'toplevel';

/** Helper to create plaintext nodes, since so many of the fields are fixed in that case. */
class PlaintextAstNode extends AstNode {
  constructor(line, column, text) {
    super(AstType.PLAINTEXT, Macro.PLAINTEXT_MACRO_NAME,
      {}, line, column, {text: text});
  }
}

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
  constructor(input_string, extra_returns={}, show_tokenize=false, start_line=1) {
    this.chars = Array.from(input_string);
    this.cur_c = this.chars[0];
    this.column = 1;
    this.extra_returns = extra_returns;
    this.extra_returns.errors = [];
    this.i = 0;
    this.line = start_line;
    this.tokens = [];
    this.show_tokenize = show_tokenize;
    this.log_debug('Tokenizer');
    this.log_debug(`this.chars ${this.chars}`);
    this.log_debug(`this.chars.length ${this.chars.length}`);
    this.log_debug('');
  }

  /** Advance the current character and set cur_c to the next one.
   *
   * Maintain the newline count up to date for debug messages.
   *
   * The current index must only be incremented through this function
   * and never directly.
   *
   * @return {boolean} true iff we are not reading past the end of the input
   */
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
    return this.plaintext_append_or_create(this.cur_c);
  }

  /**
   * @return {boolean} EOF reached?
   */
  consume_optional_newline(literal) {
    if (
      !this.is_end() &&
      this.cur_c === '\n' &&
      (literal || this.peek() !== '\n')
    ) {
      return this.consume();
    }
    return true;
  }

  consume_optional_newline_after_argument(literal) {
    if (
      !this.is_end() &&
      this.cur_c === '\n'
    ) {
      const peek = this.peek();
      if (
        peek === START_POSITIONAL_ARGUMENT_CHAR ||
        peek === START_NAMED_ARGUMENT_CHAR
      ) {
        this.consume();
      }
    }
  }

  error(message, line, column) {
    if (line === undefined)
      line = this.line
    if (column === undefined)
      column = this.column
    this.extra_returns.errors.push(
      new ErrorMessage(message, line, column));
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
    return this.consume();
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
    this.push_token(TokenType.MACRO_NAME, Macro.TOPLEVEL_MACRO_NAME);
    this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
    this.push_token(TokenType.PARAGRAPH);
    let unterminated_literal = false;
    let start_line;
    let start_column;
    while (!this.is_end()) {
      this.log_debug('tokenize loop');
      this.log_debug('this.i: ' + this.i);
      this.log_debug('this.cur_c: ' + this.cur_c);
      this.log_debug();
      start_line = this.line;
      start_column = this.column;
      if (this.cur_c === ESCAPE_CHAR) {
        this.consume();
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
        if (this.cur_c === NAMED_ARGUMENT_EQUAL_CHAR) {
          // Consume the = sign.
          this.consume();
        } else if (this.cur_c === END_NAMED_ARGUMENT_CHAR) {
          // Boolean argument.
        } else {
          this.error(`expected character: '${NAMED_ARGUMENT_EQUAL_CHAR}' or '${END_NAMED_ARGUMENT_CHAR}' (for a boolean argument), got '${this.cur_c}'`);
        }
        if (open_length === 1) {
          this.consume_optional_newline(true);
        } else {
          // Literal argument.
          let close_string = closing_char(
            START_NAMED_ARGUMENT_CHAR).repeat(open_length);
          if (!this.tokenize_literal(START_NAMED_ARGUMENT_CHAR, close_string)) {
            unterminated_literal = true;
          }
          this.push_token(TokenType.NAMED_ARGUMENT_END);
          this.consume_optional_newline_after_argument()
        }
      } else if (this.cur_c === END_NAMED_ARGUMENT_CHAR) {
        this.push_token(TokenType.NAMED_ARGUMENT_END);
        this.consume();
        this.consume_optional_newline_after_argument()
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
          if (!this.tokenize_literal(START_POSITIONAL_ARGUMENT_CHAR, close_string)) {
            unterminated_literal = true;
          }
          this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
          this.consume_optional_newline_after_argument()
        }
      } else if (this.cur_c === END_POSITIONAL_ARGUMENT_CHAR) {
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        this.consume();
        this.consume_optional_newline_after_argument()
      } else if (this.cur_c in MAGIC_CHAR_ARGS) {
        // Insane shortcuts e.g. $$ math and `` code.
        let line = this.line;
        let column = this.column;
        let open_char = this.cur_c;
        let open_length = this.tokenize_func(
          (c)=>{return c === open_char}
        ).length;
        let close_string = open_char.repeat(open_length);
        let macro_name = MAGIC_CHAR_ARGS[open_char];
        if (open_length > 1) {
          macro_name = macro_name.toUpperCase();
        }
        this.push_token(TokenType.MACRO_NAME, macro_name, this.line, this.column);
        this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
        if (!this.tokenize_literal(open_char, close_string)) {
          unterminated_literal = true;
        }
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        this.consume_optional_newline_after_argument()
      } else if (this.cur_c === '\n') {
        if (this.peek() === '\n') {
          this.push_token(TokenType.PARAGRAPH);
          this.consume();
          this.consume();
          if (this.cur_c === '\n') {
            this.error('paragraph with more than two newlines, use just two');
          }
        } else {
          this.consume_plaintext_char();
        }
      } else {
        let done = false;
        if (
          this.i === 0 ||
          this.chars[this.i - 1] === ' ' ||
          this.chars[this.i - 1] === '\n' ||
          this.tokens[this.tokens.length - 1].type === TokenType.POSITIONAL_ARGUMENT_START ||
          this.tokens[this.tokens.length - 1].type === TokenType.NAMED_ARGUMENT_NAME
        ) {
          if (
            array_contains_array_at(this.chars, this.i, 'http://') ||
            array_contains_array_at(this.chars, this.i, 'https://')
          ) {
            // Insane autolink.
            this.push_token(TokenType.MACRO_NAME, Macro.LINK_MACRO_NAME, this.line, this.column);
            this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
            let link_text = '';
            while (this.consume_plaintext_char()) {
              if (
                this.cur_c == ' ' ||
                this.cur_c == '\n' ||
                this.cur_c == END_POSITIONAL_ARGUMENT_CHAR ||
                this.cur_c == END_NAMED_ARGUMENT_CHAR
              ) {
                break;
              }
              if (this.cur_c === ESCAPE_CHAR) {
                this.consume();
              }
            }
            this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
            done = true;
          }
        }
        if (!done) {
          // Character is nothing else, so finally it is a regular plaintext character.
          this.consume_plaintext_char();
        }
      }
    }
    if (unterminated_literal) {
      this.error(`unterminated literal argument`, start_line, start_column);
    }
    // Close the opening of toplevel.
    this.push_token(TokenType.PARAGRAPH);
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
   * @return {boolean} - true if OK, false if unexpected EOF
   */
  tokenize_literal(open_char, close_string) {
    this.log_debug('tokenize_literal');
    this.log_debug(`this.i: ${this.i}`);
    this.log_debug(`open_char: ${open_char}`);
    this.log_debug(`close_string ${close_string}`);
    this.log_debug('');

    if (this.is_end())
      return false;

    // Remove leading escapes.
    let i = this.i;
    while (this.chars[i] === ESCAPE_CHAR) {
      i++;
      if (this.is_end())
        return false;
    }
    if (this.chars[i] === open_char) {
      // Skip one of the escape chars if they are followed by an open.
      if (!this.consume())
        return false;
    } else {
      if (!this.consume_optional_newline(true))
        return false;
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
      if (!this.consume())
        return false;
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
    this.index = undefined;
  }

  add_child(child) {
    child.index = this.children.length;
    this.children.push(child);
  }

  /**
   * E.g. get number 1.4.2.5 of a Section.
   *
   * @return {String}
   */
  get_nested_number(header_graph_top_level) {
    let indexes = [];
    let cur_node = this;
    while (cur_node !== undefined) {
      indexes.push(cur_node.index + 1);
      cur_node = cur_node.parent_node;
    }
    let offset;
    if (header_graph_top_level === 0) {
      offset = 0;
    } else {
      offset = 1;
    }
    return indexes.reverse().slice(1 + offset).join('.');
  }
}

/**
 * Determine if big_array contains small_array starting at index position
 * inside the big array.
 *
 * @return {boolean} true iff if the big array contains the small one
 */
function array_contains_array_at(big_array, position, small_array) {
  for (let i = 0; i < small_array.length; i++) {
    if (big_array[position + i] !== small_array[i]) {
      return false;
    }
  }
  return true;
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

/** Shallow clone an object, and set a given value on the cloned one. */
function clone_and_set(obj, key, value) {
  let new_obj = {...obj};
  new_obj[key] = value;
  return new_obj;
}
exports.clone_and_set = clone_and_set;

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
 * @options {Object}
 *          {IdProvider} external_ids
 *          {Function[String] -> string} read_include(input_path) -> content
 *          {Number} h_level_offset - add this offset to the levels of every header
 *          {boolean} render - if false, parse the input, but don't render it,
 *              and return undefined.
 *              The initial use case for this is to allow a faster and error-less
 *              first pass when building an entire directory with internal cross file
 *              references to extract IDs of each file.
 * @return {String}
 */
function convert(
  input_string,
  options,
  extra_returns={},
) {
  if (options === undefined) {
    options = {};
  }
  if (!('body_only' in options)) { options.body_only = false; }
  if (!('template_vars' in options)) { options.template_vars = {}; }
  if (!('style' in options.template_vars)) { options.template_vars.style = ''; }
  if (!('from_include' in options)) { options.from_include = false; }
  if (!('include_path_set' in options)) { options.include_path_set = new Set(); }
  if (!('id_provider' in options)) {
    options.id_provider = undefined;
  }
  if (!('html_embed' in options)) { options.html_embed = false; }
  if (!('html_single_page' in options)) { options.html_single_page = false; }
  if (!('html_x_extension' in options)) { options.html_x_extension = true; }
  if (!('h_level_offset' in options)) { options.h_level_offset = 0; }
  if (!('input_path' in options)) { options.input_path = undefined; }
  if (!('render' in options)) { options.render = true; }
  if (!('start_line' in options)) { options.start_line = 1; }
  if (!('show_ast' in options)) { options.show_ast = false; }
  if (!('show_parse' in options)) { options.show_parse = false; }
  if (!('show_tokenize' in options)) { options.show_tokenize = false; }
  if (!('show_tokens' in options)) { options.show_tokens = false; }
  if (!('template' in options)) { options.template = undefined; }
  // https://cirosantilli.com/cirodown#the-id-of-the-first-header-is-derived-from-the-filename
  if (!('toplevel_id' in options)) { options.toplevel_id = undefined; }
  const macros = macro_list_to_macros();
  extra_returns.errors = [];
  let sub_extra_returns;
  sub_extra_returns = {};
  let tokens = (new Tokenizer(input_string, sub_extra_returns,
    options.show_tokenize, options.start_line)).tokenize();
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
  extra_returns.context = sub_extra_returns.context;
  extra_returns.ids = sub_extra_returns.ids;
  extra_returns.errors.push(...sub_extra_returns.errors);
  let output;
  if (options.render) {
    let errors = [];
    let context = Object.assign(
      sub_extra_returns.context,
      {
        errors: errors,
        extra_returns: extra_returns,
        macros: macros,
        options: options,
      }
    );
    output = ast.convert(context);
    extra_returns.errors.push(...errors);
  }
  extra_returns.errors = extra_returns.errors.sort((a, b)=>{
    if (a.line < b.line)
      return -1;
    if (a.line > b.line)
      return 1;
    if (a.column < b.column)
      return -1;
    if (a.column > b.column)
      return 1;
    return 0;
  });
  if (output !== undefined) {
    if (output[output.length - 1] !== '\n') {
      output += '\n';
    }
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
  if (arg !== undefined) {
    for (const ast of arg) {
      converted_arg += ast.convert(context);
    }
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

/** @return {Array[AstNode]} */
function convert_include(input_string, options, cur_header_level, href, start_line) {
  const include_options = Object.assign({}, options);
  include_options.from_include = true;
  include_options.h_level_offset = cur_header_level;
  include_options.input_path = href;
  include_options.render = false;
  include_options.toplevel_id = href;
  if (start_line !== undefined) {
    include_options.start_line = start_line;
  }
  const include_extra_returns = {};
  convert(
    input_string,
    include_options,
    include_extra_returns,
  );
  return include_extra_returns.ast.args.content;
}

/** Error message to be rendered inside the generated output itself.
 *
 * If context is given, escape the message correctly for this context.
 *
 * @return {String}
 */
function error_message_in_output(msg, context) {
  let escaped_msg;
  if (context === undefined) {
    escaped_msg = msg;
  } else {
    escaped_msg = html_escape_context(context, msg);
  }
  return `[CIRODOWN_ERROR: ${escaped_msg}]`
}

/** Convert a key value already fully HTML escaped strings
 * to an HTML attribute. The callers MUST escape any untrested chars.
  e.g. with html_attr_value.
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
    if (arg_name in ast.args) {
      args.push([arg_name, ast.args[arg_name]]);
    }
  }

  // Build the output string.
  let ret = '';
  for (const name_arg_pair of args) {
    const [arg_name, arg] = name_arg_pair;
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
    custom_args[Macro.ID_ARGUMENT_NAME] = [
        new PlaintextAstNode(ast.line, ast.column, ast.id)];
  }
  return html_convert_attrs(ast, context, arg_names, custom_args);
}

/** Helper for the most common HTML function type that does "nothing magic":
 * only has "id" as a possible attribute, and uses ast.args.content as the
 * main element child.
 */
function html_convert_simple_elem(elem_name, options={}) {
  if (!('attrs' in options)) {
    options.attrs = {};
  }
  if (!('link_to_self' in options)) {
    options.link_to_self = false;
  }
  if (!('newline_after_open' in options)) {
    options.newline_after_open = false;
  }
  if (!('newline_after_close' in options)) {
    options.newline_after_close = false;
  }
  if (!('wrap' in options)) {
    options.wrap = false;
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
    let link_to_self = '';
    let attrs = html_convert_attrs_id(ast, context);
    let extra_attrs_string = '';
    for (const key in options.attrs) {
      extra_attrs_string += html_attr(key, options.attrs[key]);
    }
    let content_ast = ast.args.content;
    let content = convert_arg(content_ast, context);
    let res = `<${elem_name}${extra_attrs_string}${attrs}>${newline_after_open_str}${content}</${elem_name}>${newline_after_close_str}`;
    if (options.wrap) {
      res = html_elem('div', res);
    }
    return res;
  };
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

/** Escape string depending on the current context. */
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

function html_hide_hover_link(id) {
  if (id === undefined) {
    return '';
  } else {
    let href = html_attr('href', '#' + html_escape_attr(id));
    return `<span class="hide-hover"><a${href}>${UNICODE_LINK}</a></span>`;
  }
}

function html_is_whitespace_text_node(ast) {
  return ast.node_type === AstType.PLAINTEXT && html_is_whitespace(ast.text);
}

// https://stackoverflow.com/questions/2161337/can-we-use-any-other-tag-inside-ul-along-with-li/60885802#60885802
function html_is_whitespace(string) {
  for (const c of string) {
    if (!HTML_ASCII_WHITESPACE.has(c))
      return false;
  }
  return true;
}

function html_elem(tag, content) {
  return `<${tag}>${content}</${tag}>`;
}

function macro_list_to_macros() {
  const macros = {};
  for (const macro of DEFAULT_MACRO_LIST) {
    macros[macro.name] = macro;
  }
  return macros;
}
exports.macro_list_to_macros = macro_list_to_macros;

function macro_image_video_convert_function(content_func, source_func) {
  if (source_func === undefined) {
    source_func = function(ast, context, src) {
      return convert_arg(ast.args.source, context);
    }
  }
  return function(ast, context) {
    let rendered_attrs = html_convert_attrs(ast, context, ['src']);
    let figure_attrs = html_convert_attrs_id(ast, context);
    let ret = `<figure${figure_attrs}>\n`
    let href_prefix;
    if (ast.id !== undefined) {
      href_prefix = this.self_link(ast);
    } else {
      href_prefix = undefined;
    }
    let description = convert_arg(ast.args.description, context);
    if (description !== '') {
      description = '. ' + description;
    }
    let src = convert_arg(ast.args.src, context);
    let source = source_func(ast, context, src);
    if (ast.args.source !== '') {
      source = `<a ${html_attr('href', source)}>Source</a>.`;
      if (description === '') {
        source = '. ' + source;
      } else {
        source = ' ' + source;
      }
    }
    let alt_arg;
    const has_caption = ast.id !== undefined && ast.index_id;
    if (ast.args.alt === undefined) {
      if (has_caption) {
        alt_arg = undefined;
      } else {
        alt_arg = ast.args.src;
      }
    } else {
      alt_arg = ast.args.alt;
    }
    let alt;
    if (alt_arg === undefined) {
      alt = '';
    } else {
      alt = html_attr('alt', html_escape_attr(convert_arg(alt_arg, context)));;
    }
    ret += content_func(ast, context, src, rendered_attrs, alt);
    if (has_caption) {
      ret += `<figcaption>${Macro.x_text(ast, context, {href_prefix: href_prefix})}${description}${source}</figcaption>\n`;
    }
    ret += '</figure>\n';
    return ret;
  };
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
  extra_returns.context = {};
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

  // Post process the AST breadth first minimally to support includes.
  //
  // This could in theory be done in a single pass with the next one,
  // but that is much more hard to implement and maintain, because we
  // have to stich togetegher internal structors to maintain the header
  // tree across the includer and included documents.
  //
  // Another possibility would be to do it in the middle of the initial parse,
  // but let's not complicate that further either, shall we?
  let cur_header;
  let cur_header_level;
  let toplevel_parent_arg = []
  let todo_visit = [[toplevel_parent_arg, ast_toplevel]];
  const id_context = {'macros': macros};
  // IDs that are indexed: you can link to those.
  let indexed_ids = {};
  // Non-indexed-ids: auto-generated numeric ID's like p-1, p-2, etc.
  // It is not possible to link to them from inside the document, since links
  // break across versions.
  let non_indexed_ids = {};
  let id_provider;
  let local_id_provider = new DictIdProvider(indexed_ids);
  let cur_header_tree_node;
  let is_first_header = true;
  if (options.id_provider !== undefined) {
    // Remove all remote IDs from the current file, to prevent false duplicates
    // when we start setting those IDs again.
    options.id_provider.clear(options.input_path);
    id_provider = new ChainedIdProvider(
      local_id_provider,
      options.id_provider
    );
  } else {
    id_provider = local_id_provider;
  }
  options.include_path_set.add(options.input_path);
  while (todo_visit.length > 0) {
    const [parent_arg, ast] = todo_visit.shift();
    const macro_name = ast.macro_name;
    ast.from_include = options.from_include;
    ast.input_path = options.input_path;
    if (macro_name === Macro.INCLUDE_MACRO_NAME) {
      const href = convert_arg_noescape(ast.args.href, id_context);
      cur_header.includes.push(href);
      if (options.include_path_set.has(href)) {
        let message = `circular include detected to: "${href}"`;
        parse_error(
          state,
          message,
          ast.line,
          ast.column
        );
        parent_arg.push(new PlaintextAstNode(ast.line, ast.column, message));
      } else {
        let new_child_nodes;
        if (options.html_single_page) {
          new_child_nodes = convert_include(
            options.read_include(href),
            options,
            cur_header_level,
            href
          );
        } else {
          const target_id_ast = id_provider.get(href);
          let header_node_title;
          if (target_id_ast === undefined) {
            let message = `ID in include not found on database: "${href}", needed to calculate the cross reference title. Did you forget to convert all files beforehand?`;
            header_node_title = error_message_in_output(message);
            // Don't do an error if we are not going to render, because this is how
            // we extract IDs on the first pass of ./cirodown .
            if (options.render) {
              parse_error(
                state,
                message,
                ast.line,
                ast.column
              );
            }
          } else {
            const x_text_options = {
              show_caption_prefix: false,
              style_full: false,
            };
            header_node_title = Macro.x_text(target_id_ast, id_context, x_text_options);
          }
          // Don't merge into a single file, render as a dummy header and an xref link instead.
          new_child_nodes = [
            new AstNode(
              AstType.MACRO,
              Macro.HEADER_MACRO_NAME,
              {
                'level': [
                  new PlaintextAstNode(
                    ast.line,
                    ast.column,
                    (cur_header_level + 1).toString(),
                  )
                ],
                [Macro.TITLE_ARGUMENT_NAME]: [
                  new PlaintextAstNode(
                    ast.line,
                    ast.column,
                    header_node_title
                  )
                ]
              },
              ast.line,
              ast.column,
              {
                force_no_index: true,
                from_include: true,
                id: href,
              },
            ),
            new AstNode(
              AstType.PARAGRAPH,
              undefined,
              undefined,
              ast.line,
              ast.column
            ),
            new AstNode(
              AstType.MACRO,
              Macro.PARAGRAPH_MACRO_NAME,
              {
                'content': [
                  new AstNode(
                    AstType.MACRO,
                    'x',
                    {
                      'href': [
                        new PlaintextAstNode(
                          ast.line,
                          ast.column,
                          href
                        )
                      ],
                      'content': [
                        new PlaintextAstNode(
                          ast.line,
                          ast.column,
                          'This section is present in another page, follow this link to view it.'
                        )
                      ],
                    },
                    ast.line,
                    ast.column,
                    {from_include: true},
                  ),
                ],
              },
              ast.line,
              ast.column,
              {from_include: true},
            ),
          ];
        }
        // Push all included nodes, but don't recurse because:
        // - all child includes will be resolved on the sub-render call
        // - the current header level must not move, so that consecutive \include
        //   calls won't nest into one another
        parent_arg.push(...new_child_nodes);
      }
    } else if (macro_name === Macro.CIRODOWN_EXAMPLE_MACRO_NAME) {
      parent_arg.push(...[
        new AstNode(
          AstType.MACRO,
          Macro.CODE_MACRO_NAME.toUpperCase(),
          {'content': ast.args.content},
          ast.line,
          ast.column,
        ),
        new AstNode(
          AstType.MACRO,
          Macro.PARAGRAPH_MACRO_NAME,
          {
            'content': [
              new PlaintextAstNode(
                ast.line,
                ast.column,
                'which renders as:',
              )
            ],
          },
          ast.line,
          ast.column,
        ),
        new AstNode(
          AstType.MACRO,
          'q',
          {'content': convert_include(
              convert_arg_noescape(ast.args.content, id_context),
              options,
              0,
              options.input_path,
              ast.line + 1
            )
          },
          ast.line,
          ast.column,
        ),
      ]);
    } else {
      if (macro_name === Macro.HEADER_MACRO_NAME) {
        if (is_first_header) {
          ast.id = options.toplevel_id;
          is_first_header = false;
        }
        cur_header = ast;
        cur_header_level = parseInt(
          convert_arg_noescape(ast.args.level, id_context)
        ) + options.h_level_offset;
        ast.level = cur_header_level;
      }
      // Push this node into the parent argument list.
      // This allows us to skip nodes, or push multiple nodes if needed.
      parent_arg.push(ast);

      // Recurse.
      for (const arg_name in ast.args) {
        let arg = ast.args[arg_name];
        // We make the new argument be empty so that children can
        // decide if they want to push themselves or not.
        const new_arg = [];
        for (const child_node of arg) {
          todo_visit.push([new_arg, child_node]);
        }
        // Update the argument.
        ast.args[arg_name] = new_arg;
      }
    }
  }

  // Post process the AST breadth first after inclusions are resolved to support things like:
  //
  // - the insane but necessary paragraphs double newline syntax
  // - automatic ul parent to li and table to tr
  // - remove whitespace only text children from ul
  // - extract all IDs into an ID index
  //
  // Normally only the toplevel includer will enter this code section.
  if (!options.from_include) {
    const macro_counts = {};
    const macro_counts_indexed = {};
    let header_graph_last_level;
    const header_graph_stack = new Map();
    let is_first_header = true;
    let first_header_level;
    let first_header;
    extra_returns.context.headers_with_include = [];
    extra_returns.context.id_provider = id_provider;
    extra_returns.context.header_graph = new TreeNode();
    extra_returns.context.has_toc = false;
    let toplevel_parent_arg = []
    const todo_visit = [[toplevel_parent_arg, ast_toplevel]];
    while (todo_visit.length > 0) {
      const [parent_arg, ast] = todo_visit.shift();
      const macro_name = ast.macro_name;
      const macro = macros[macro_name];

      if (macro_name === Macro.HEADER_MACRO_NAME) {
        // Create the header tree.
        if (ast.level === undefined) {
          cur_header_level = parseInt(convert_arg_noescape(ast.args.level, id_context)) + options.h_level_offset;
          ast.level = cur_header_level;
        } else {
          // Possible for included headers.
          cur_header_level = ast.level;
        }
        if (is_first_header) {
          first_header = ast;
          is_first_header = false;
          first_header_level = cur_header_level;
          header_graph_last_level = cur_header_level - 1;
          header_graph_stack[header_graph_last_level] = extra_returns.context.header_graph;
        }
        cur_header_tree_node = new TreeNode(ast, header_graph_stack[cur_header_level - 1]);
        ast.header_tree_node = cur_header_tree_node;
        if (cur_header_level - header_graph_last_level > 1) {
          const message = `skipped a header level from ${header_graph_last_level} to ${ast.level}`;
          ast.args[Macro.TITLE_ARGUMENT_NAME].push(
            new PlaintextAstNode(ast.line, ast.column, ' ' + error_message_in_output(message)));
          parse_error(state, message, ast.args.level[0].line, ast.args.level[0].column);
        }
        if (cur_header_level < first_header_level) {
          parse_error(
            state,
            `header level ${cur_header_level} is smaller than the level of the first header of the document ${first_header_level}`,
            ast.args.level[0].line,
            ast.args.level[0].column
          );
        }
        let parent_tree_node = header_graph_stack[cur_header_level - 1];
        if (parent_tree_node !== undefined) {
          parent_tree_node.add_child(cur_header_tree_node);
        }
        header_graph_stack[cur_header_level] = cur_header_tree_node;
        header_graph_last_level = cur_header_level;
        if (ast.includes.length > 0) {
          extra_returns.context.headers_with_include.push(ast);
        }
      } else if (macro_name === Macro.TOC_MACRO_NAME) {
        if (ast.from_include) {
          // Skip.
          continue;
        }
        extra_returns.context.has_toc = true;
      }

      // Push this node into the parent argument list.
      // This allows us to skip nodes, or push multiple nodes if needed.
      parent_arg.push(ast);

      // Linear count of each macro type for macros that have IDs.
      if (!macro.options.macro_counts_ignore(ast, id_context)) {
        if (!(macro_name in macro_counts)) {
          macro_counts[macro_name] = 0;
        }
        const macro_count = macro_counts[macro_name] + 1;
        macro_counts[macro_name] = macro_count;
        ast.macro_count = macro_count;
      }

      // Calculate node ID and add it to the ID index.
      let index_id = true;
      // This condition can be false for included headers, and this is notably important
      // for the toplevel header which gets its ID from the filename.
      let id_text = undefined;
      let macro_id_arg = ast.args[Macro.ID_ARGUMENT_NAME];
      // ast.id is not undefined for the toplevel header of includes.
      if (ast.id === undefined) {
        if (macro_id_arg === undefined) {
          let id_text = '';
          let id_prefix = macros[ast.macro_name].id_prefix;
          if (id_prefix !== '') {
            id_text += id_prefix + ID_SEPARATOR
          }
          let title_arg = ast.args[Macro.TITLE_ARGUMENT_NAME];
          if (title_arg !== undefined) {
            // ID from title.
            // TODO correct unicode aware algorithm.
            id_text += title_to_id(convert_arg_noescape(title_arg, id_context));
            ast.id = id_text;
          } else if (!macro.properties.phrasing) {
            // ID from element count.
            if (ast.macro_count !== undefined) {
              id_text += ast.macro_count;
              index_id = false;
              ast.id = id_text;
            }
          }
        } else {
          ast.id = convert_arg_noescape(macro_id_arg, id_context);
        }
      }
      ast.index_id = index_id;
      if (ast.id !== undefined && !ast.force_no_index) {
        const previous_ast = id_provider.get(ast.id);
        let input_path;
        if (previous_ast === undefined) {
          let non_indexed_id = non_indexed_ids[ast.id];
          if (non_indexed_id !== undefined) {
            input_path = options.input_path;
            previous_ast = non_indexed_id;
          }
        } else {
          input_path = previous_ast.input_path;
        }
        if (previous_ast === undefined) {
          non_indexed_ids[ast.id] = ast;
          if (index_id) {
            indexed_ids[ast.id] = ast;
          }
        } else {
          let message = `duplicate ID "${ast.id}", previous one defined at `;
          if (input_path !== undefined) {
            message += `file ${input_path} `;
          }
          message += `line ${previous_ast.line} colum ${previous_ast.column}`;
          parse_error(state, message, ast.line, ast.column);
        }

        if (index_id) {
          if (!(macro_name in macro_counts_indexed)) {
            macro_counts_indexed[macro_name] = 0;
          }
          const macro_count = macro_counts_indexed[macro_name] + 1;
          macro_counts_indexed[macro_name] = macro_count;
          ast.macro_count_indexed = macro_count;
        }
      }

      // Loop over the child arguments. We do this rather than recurse into them
      // to be able to easily remove or add nodes to the tree during this AST
      // post-processing.
      //
      // Here we do sibling-type transformations that need to loop over multiple
      // direct children in one go, such as:
      //
      // - auto add ul to li
      // - remove whitespace only text children from ul
      for (const arg_name in ast.args) {
        // The following passes consecutively update arg.
        let arg = ast.args[arg_name];
        let macro_arg = macro.name_to_arg[arg_name];

        // Handle elide_link_only.
        if (
          // Possible for error nodes.
          macro_arg !== undefined &&
          macro_arg.elide_link_only &&
          arg.length === 1 &&
          arg[0].macro_name === Macro.LINK_MACRO_NAME
        ) {
          const href_arg = arg[0].args.href;
          href_arg.parent_node = ast;
          arg = href_arg;
        }

        // Child loop that
        // Adds ul and table implicit parents.
        {
          const new_arg = [];
          for (let i = 0; i < arg.length; i++) {
            let child_node = arg[i];
            let new_child_nodes = [];
            let new_child_nodes_set = false;
            if (
              (arg_name in macro.name_to_arg) &&
              macro.name_to_arg[arg_name].remove_whitespace_children &&
              html_is_whitespace_text_node(child_node)
            ) {
              new_child_nodes_set = true;
            } else if (child_node.node_type === AstType.MACRO) {
              let child_macro_name = child_node.macro_name;
              let child_macro = state.macros[child_macro_name];
              if (child_macro.auto_parent !== undefined) {
                // Add ul and table implicit parents.
                const auto_parent_name = child_macro.auto_parent;
                const auto_parent_name_macro = state.macros[auto_parent_name];
                if (
                  ast.macro_name !== auto_parent_name &&
                  !child_macro.auto_parent_skip.has(ast.macro_name)
                ) {
                  let start_auto_child_node = child_node;
                  const new_arg_auto_parent = [];
                  while (i < arg.length) {
                    const arg_i = arg[i];
                    if (arg_i.node_type === AstType.MACRO) {
                      if (state.macros[arg_i.macro_name].auto_parent === auto_parent_name) {
                        new_arg_auto_parent.push(arg_i);
                      } else {
                        break;
                      }
                    } else if (
                      auto_parent_name_macro.name_to_arg['content'].remove_whitespace_children &&
                      html_is_whitespace_text_node(arg_i)
                    ) {
                      // Ignore the whitespace node.
                    } else {
                      break;
                    }
                    i++;
                  }
                  new_child_nodes_set = true;
                  new_child_nodes = [new AstNode(
                    AstType.MACRO,
                    auto_parent_name,
                    {
                      'content': new_arg_auto_parent,
                    },
                    start_auto_child_node.line,
                    start_auto_child_node.column,
                  )];
                  // Because the for loop will advance past it.
                  i--;
                }
              }
            }
            if (!new_child_nodes_set) {
              new_child_nodes = [child_node];
            }
            new_arg.push(...new_child_nodes);
          }
          arg = new_arg;
        }

        // Child loop that adds paragraphs.
        {
          let paragraph_indexes = [];
          for (let i = 0; i < arg.length; i++) {
            const child_node = arg[i];
            if (child_node.node_type === AstType.PARAGRAPH) {
              paragraph_indexes.push(i);
            }
          }
          if (paragraph_indexes.length > 0) {
            const new_arg = [];
            if (paragraph_indexes[0] > 0) {
              parse_add_paragraph(state, ast, new_arg, arg, 0, paragraph_indexes[0]);
            }
            let paragraph_start = paragraph_indexes[0] + 1;
            for (let i = 1; i < paragraph_indexes.length; i++) {
              const paragraph_index = paragraph_indexes[i];
              parse_add_paragraph(state, ast, new_arg, arg, paragraph_start, paragraph_index);
              paragraph_start = paragraph_index + 1;
            }
            if (paragraph_start < arg.length) {
              parse_add_paragraph(state, ast, new_arg, arg, paragraph_start, arg.length);
            }
            arg = new_arg;
          }
        }

        // Push children to continue the search. We make the new argument be empty
        // so that children can decide if they want to push themselves or not.
        {
          const new_arg = [];
          for (const child_node of arg) {
            todo_visit.push([new_arg, child_node]);
          }
          // Update the argument.
          ast.args[arg_name] = new_arg;
        }
      }
    }
    extra_returns.ids = indexed_ids;

    // Calculate header_graph_top_level.
    let level0_header = extra_returns.context.header_graph;
    if (level0_header.children.length === 1) {
      extra_returns.context.header_graph_top_level = first_header_level;
    } else {
      extra_returns.context.header_graph_top_level = first_header_level - 1;
    }
  }

  return ast_toplevel;
}

// Maybe add a paragraph after a \n\n.
function parse_add_paragraph(
  state, ast, new_arg, arg, paragraph_start, paragraph_end
) {
  parse_log_debug(state, 'function: parse_add_paragraph');
  parse_log_debug(state, 'paragraph_start: ' + paragraph_start);
  parse_log_debug(state, 'paragraph_end: ' + paragraph_end);
  parse_log_debug(state);
  if (paragraph_start < paragraph_end) {
    const macro = state.macros[arg[paragraph_start].macro_name];
    const slice = arg.slice(paragraph_start, paragraph_end);
    if (macro.properties.phrasing || slice.length > 1) {
      // If the first element after the double newline is phrasing content,
      // create a paragraph and put all elements until the next paragraph inside
      // that paragraph.
      new_arg.push(
        new AstNode(
          AstType.MACRO,
          Macro.PARAGRAPH_MACRO_NAME,
          {
            'content': slice
          },
          arg[paragraph_start].line,
          arg[paragraph_start].column,
          {
            parent_node: ast,
          }
        )
      );
    } else {
      // Otherwise, don't create the paragraph, and keep all elements as they were.
      new_arg.push(...slice);
    }
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
        // The recursive case: the arguments are lists of macros, go into them.
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
        Macro.PLAINTEXT_MACRO_NAME,
        {},
        state.token.line,
        state.token.column,
        {text: error_message_in_output(unknown_macro_message)},
      );
    } else {
      return new AstNode(macro_type, macro_name, args, macro_line, macro_column);
    }
  } else if (state.token.type === TokenType.PLAINTEXT) {
    // Non-recursive case.
    let node = new PlaintextAstNode(
      state.token.line,
      state.token.column,
      state.token.value,
    );
    // Consume the PLAINTEXT node out.
    parse_consume(state);
    return node;
  } else if (state.token.type === TokenType.PARAGRAPH) {
    let node = new AstNode(
      AstType.PARAGRAPH,
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
    let node = new PlaintextAstNode(
      state.token.line,
      state.token.column,
      error_message_in_output('unexpected token'),
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

/**
  * @param {AstNode} target_id_ast
  * @return {String} the href="..." that an \x cross reference to the given target_id_ast
  */
function x_href(target_id_ast, context) {
  let href_path;
  const target_input_path = target_id_ast.input_path;
  if (
    context.options.include_path_set.has(target_input_path) ||
    (target_input_path == context.options.input_path)
  ) {
    href_path = '';
  } else {
    href_path = target_input_path;
    if (context.options.html_x_extension) {
      href_path += '.html';
    }
  }
  return html_attr('href', href_path + '#' + html_escape_attr(target_id_ast.id));
}

const END_NAMED_ARGUMENT_CHAR = '}';
const END_POSITIONAL_ARGUMENT_CHAR = ']';
const ESCAPE_CHAR = '\\';
const HTML_ASCII_WHITESPACE = new Set([' ', '\r', '\n', '\f', '\t']);
const ID_SEPARATOR = '-';
const MAGIC_CHAR_ARGS = {
  '$': Macro.MATH_MACRO_NAME,
  '`': Macro.CODE_MACRO_NAME,
}
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
for (const c in MAGIC_CHAR_ARGS) {
  ESCAPABLE_CHARS.add(c);
}
const AstType = make_enum([
  // An in-output error message.
  'ERROR',
  // The most regular and non-magic nodes.
  // Most nodes are of this type.
  'MACRO',
  // A node that contains only text, and no subnodes.
  'PLAINTEXT',
  // Paragraphs are basically MACRO, but with some special
  // magic because of the double newline madness treatment.
  'PARAGRAPH',
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
const MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS = [
  new MacroArgument({
    name: Macro.TITLE_ARGUMENT_NAME,
  }),
  new MacroArgument({
    name: 'description',
  }),
  new MacroArgument({
    name: 'source',
    elide_link_only: true,
  }),
];
const MACRO_IMAGE_VIDEO_POSITIONAL_ARGUMENTS = [
  new MacroArgument({
    name: 'src',
    elide_link_only: true,
    mandatory: true,
  }),
  new MacroArgument({
    name: 'alt',
  }),
];
const DEFAULT_MACRO_LIST = [
  new Macro(
    Macro.LINK_MACRO_NAME,
    [
      new MacroArgument({
        name: 'href',
        elide_link_only: true,
        mandatory: true,
      }),
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let content_arg = ast.args.content;
      if (content_arg === undefined) {
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
    // Block code.
    Macro.CODE_MACRO_NAME.toUpperCase(),
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let content = convert_arg(ast.args.content, context);
      return `<pre${attrs}><code>${content}</code></pre>`;
    },
  ),
  new Macro(
    // Inline code.
    Macro.CODE_MACRO_NAME,
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
    Macro.CIRODOWN_EXAMPLE_MACRO_NAME,
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      throw new Error('programmer error, include must never render');
    },
    {
      macro_counts_ignore: function(ast, context) { return true; }
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
    },
    {
      macro_counts_ignore: function(ast, context) { return true; }
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
        mandatory: true,
      }),
      new MacroArgument({
        name: Macro.TITLE_ARGUMENT_NAME,
      }),
    ],
    function(ast, context) {
      let custom_args;
      let level_arg = ast.args.level;
      let level = convert_arg_noescape(level_arg, context);
      let level_int = ast.level;
      if (!Number.isInteger(level_int) || !(level_int > 0)) {
        let message = `level must be a positive non-zero integer: "${level}"`;
        this.error(context, message, level_arg[0].line, level_arg[0].column);
        return error_message_in_output(message, context);
      }
      if (level_int > 6) {
        custom_args = {'data-level': [new PlaintextAstNode(
          ast.line, ast.column, level)]};
        level = '6';
      } else {
        custom_args = {};
      }
      let attrs = html_convert_attrs_id(ast, context, [], custom_args);
      let ret = `<h${level}${attrs}><a${this.self_link(ast)} title="link to this element">`;
      let x_text_options = {
        show_caption_prefix: false,
      };
      if (level_int === context.header_graph_top_level) {
        x_text_options.style_full = false;
      }
      ret += Macro.x_text(ast, context, x_text_options);
      ret += `</a>`;
      ret += `<span> `;
      if (level_int !== context.header_graph_top_level) {
        if (context.has_toc) {
          let toc_href = html_attr('href', '#' + Macro.TOC_PREFIX + ast.id);
          ret += ` | <a${toc_href}>\u21d1 toc</a>`;
        }
      }
      let parent_asts = [];
      let parent_tree_node = ast.header_tree_node.parent_node;
      // Undefined on toplevel.
      if (parent_tree_node !== undefined) {
        // May fail if there was a header skip error previously.
        if (parent_tree_node.value !== undefined) {
          parent_asts.push(parent_tree_node.value);
        }
      }
      parent_asts.push(...context.id_provider.get_includes(ast.id));
      for (const parent_ast of parent_asts) {
        let parent_href = x_href(parent_ast, context);
        let parent_body = convert_arg(parent_ast.args[Macro.TITLE_ARGUMENT_NAME], context);
        ret += ` | <a${parent_href}>\u2191 parent "${parent_body}"</a>`;
      }
      ret += `</span>`;
      ret += `</h${level}>\n`;
      return ret;
    },
    {
      caption_prefix: 'Section',
      id_prefix: '',
      get_number: function(ast, context) {
        let header_tree_node = ast.header_tree_node;
        if (header_tree_node === undefined) {
          return undefined;
        } else {
          return header_tree_node.get_nested_number(context.header_graph_top_level);
        }
      },
      x_style_full: false,
    }
  ),
  new Macro(
    Macro.INCLUDE_MACRO_NAME,
    [
      new MacroArgument({
        name: 'href',
        mandatory: true,
      }),
    ],
    function(ast, context) {
      throw new Error('programmer error, include must never render');
    },
    {
      macro_counts_ignore: function(ast, context) { return true; }
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
      auto_parent_skip: new Set(['ol']),
    }
  ),
  new Macro(
    // Block math.
    Macro.MATH_MACRO_NAME.toUpperCase(),
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let katex_output = this.katex_convert(ast, context);
      let ret = ``;
      let do_show;
      let show_arg = ast.args.show;
      if (show_arg === undefined) {
        do_show = true;
      } else {
        let show = convert_arg_noescape(show_arg, context);
        if (!(show === '0' || show === '1')) {
          let message = `show must be 0 or 1: "${level}"`;
          this.error(context, message, show_arg, show_arg[0].column);
          return error_message_in_output(message, context);
        }
        do_show = (show === '1');
      }
      if (do_show) {
        let href = html_attr('href', '#' + html_escape_attr(ast.id));
        ret += `<div class="math-container"${attrs}>`;
        if (Macro.TITLE_ARGUMENT_NAME in ast.args) {
          ret += `<div class="math-caption-container">\n`;
          ret += `<span class="math-caption">${Macro.x_text(ast, context, {href_prefix: href})}</span>`;
          ret += `</div>\n`;
        }
        ret += `<div class="math-equation">\n`
        ret += `<div>${katex_output}</div>\n`;
        ret += `<div><a${href}>(${context.macros[ast.macro_name].options.get_number(ast, context)})</a></div>`;
        ret += `</div>\n`;
        ret += `</div>\n`;
      }
      return ret;
    },
    {
      caption_prefix: 'Equation',
      id_prefix: 'eq',
      get_number: function(ast, context) {
        // Override because unlike other elements such as images, equations
        // always get numbers even if not indexed.
        return ast.macro_count;
      },
      macro_counts_ignore: function(ast, context) {
        return 'show' in ast.args && convert_arg_noescape(ast.args.show, context) === '0';
      },
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
        new MacroArgument({
          name: 'show',
        }),
      ],
    }
  ),
  new Macro(
    // Inline math.
    Macro.MATH_MACRO_NAME,
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
    MACRO_IMAGE_VIDEO_POSITIONAL_ARGUMENTS,
    macro_image_video_convert_function(function (ast, context, src, rendered_attrs, alt) {
      return `<a${html_attr('href', src)}><img${rendered_attrs}${alt}></a>\n`;
    }),
    Object.assign(
      {
        caption_prefix: 'Figure',
        id_prefix: 'fig',
        named_args: MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS,
      },
    ),
  ),
  new Macro(
    'image',
    [
      new MacroArgument({
        name: 'src',
        elide_link_only: true,
        mandatory: true,
      }),
      new MacroArgument({
        name: 'alt',
      }),
    ],
    function(ast, context) {
      let alt_arg;
      if (ast.args.alt === undefined) {
        alt_arg = ast.args.src;
      } else {
        alt_arg = ast.args.alt;
      }
      let alt = html_attr('alt', html_escape_attr(convert_arg(alt_arg, context)));
      let img_attrs = html_convert_attrs_id(ast, context, ['src']);
      return `<img${img_attrs}${alt}>`;
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
        remove_whitespace_children: true,
      }),
    ],
    html_convert_simple_elem('ol', {newline_after_open: true}),
  ),
  new Macro(
    Macro.PARAGRAPH_MACRO_NAME,
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem(
      'div',
      {
        attrs: {'class': 'p'},
        link_to_self: true,
      }
    ),
  ),
  new Macro(
    Macro.PLAINTEXT_MACRO_NAME,
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      return html_escape_context(context, ast.text);
    },
    {
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'q',
    [
      new MacroArgument({
        name: 'content',
      }),
    ],
    html_convert_simple_elem(
      'blockquote',
      {
        link_to_self: true
      }
    ),
  ),
  new Macro(
    'table',
    [
      new MacroArgument({
        name: 'content',
        remove_whitespace_children: true,
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
        let href = html_attr('href', '#' + html_escape_attr(ast.id));
        if (ast.id !== undefined && ast.index_id) {
          ret += `<div class="table-caption-container">\n`;
          ret += `<span class="table-caption">${Macro.x_text(ast, context, {href_prefix: href})}</span>`;
          ret += `</div>\n`;
        }
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
    Macro.TOC_MACRO_NAME,
    [],
    function(ast, context) {
      let attrs = html_convert_attrs_id(ast, context);
      let ret = `<div class="toc-container"${attrs}>\n`;
      let todo_visit = [];
      let top_level = context.header_graph_top_level - 1;
      let root_node = context.header_graph;
      if (context.header_graph_top_level > 0) {
        root_node = root_node.children[0];
      }
      for (let i = root_node.children.length - 1; i >= 0; i--) {
        todo_visit.push([root_node.children[i], 1]);
      }
      while (todo_visit.length > 0) {
        const [tree_node, level] = todo_visit.pop();
        if (level > top_level) {
          ret += `<ul>\n`;
        } else if (level < top_level) {
          ret += `</li>\n</ul>\n`.repeat(top_level - level);
        } else {
          ret += `</li>\n`;
        }
        let target_ast = tree_node.value;
        let content = Macro.x_text(target_ast, context, {show_caption_prefix: false});
        let target_id = html_escape_attr(target_ast.id);
        let href = html_attr('href', '#' + target_id);
        let id_to_toc = html_attr('id', Macro.TOC_PREFIX + target_id);
        ret += `<li><div${id_to_toc}><a${href}>${content}</a><span>`;

        let toc_href = html_attr('href', '#' + Macro.TOC_PREFIX + target_id);
        ret += ` | <a${toc_href}>${UNICODE_LINK} link</a>`;

        let parent_ast = target_ast.header_tree_node.parent_node.value;
        let parent_href = html_attr('href', '#' + Macro.TOC_PREFIX + parent_ast.id);
        let parent_body = convert_arg(parent_ast.args[Macro.TITLE_ARGUMENT_NAME], context);
        ret += ` | <a${parent_href}>\u2191 parent "${parent_body}"</a>`;

        ret += `</span></div>`;
        if (tree_node.children.length > 0) {
          for (let i = tree_node.children.length - 1; i >= 0; i--) {
            todo_visit.push([tree_node.children[i], level + 1]);
          }
          ret += `\n`;
        }
        top_level = level;
      }
      ret += `</li>\n</ul>\n`.repeat(top_level);
      ret += `</div>\n`
      return ret;
    },
    {
      toplevel_link: false,
    }
  ),
  new Macro(
    Macro.TOPLEVEL_MACRO_NAME,
    [
      new MacroArgument({
        name: 'content',
      }),
      new MacroArgument({
        name: Macro.TITLE_ARGUMENT_NAME,
      }),
    ],
    function(ast, context) {
      let title = ast.args[Macro.TITLE_ARGUMENT_NAME];
      if (title === undefined) {
        let text_title;
        if (Macro.TITLE_ARGUMENT_NAME in context.options) {
          text_title = context.options[Macro.TITLE_ARGUMENT_NAME];
        } else if (context.header_graph.children.length > 0) {
          text_title = convert_arg(context.header_graph.children[0].value.args[Macro.TITLE_ARGUMENT_NAME], context);
        } else {
          text_title = 'dummy title because title is mandatory in HTML';
        }
        title = [new PlaintextAstNode(ast.line, ast.column, text_title)];
      }
      let ret;
      const body = convert_arg(ast.args.content, context);
      if (context.options.body_only) {
        ret = body;
      } else {
        let template;
        if (context.options.template !== undefined) {
          template = context.options.template;
        } else {
          template = `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<title>{{ title }}</title>
<style>{{ style }}</style>
<body class="cirodown">
{{ body }}
</body>
</html>
`;
        }
        const { Liquid } = require('liquidjs');
        const render_env = {
          body: body,
          title: convert_arg(title, context),
        };
        Object.assign(render_env, context.options.template_vars);
        ret = (new Liquid()).parseAndRenderSync(
          template,
          render_env,
          {
            strictFilters: true,
            strictVariables: true,
          }
        );
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
        remove_whitespace_children: true,
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
        remove_whitespace_children: true,
      }),
    ],
    html_convert_simple_elem('ul', {
      newline_after_open: true,
      wrap: true,
    }),
  ),
  new Macro(
    'x',
    [
      new MacroArgument({
        name: 'href',
        mandatory: true,
      }),
      new MacroArgument({
        name: 'content',
      }),
    ],
    function(ast, context) {
      const target_id = convert_arg_noescape(ast.args.href, context);
      const target_id_ast = context.id_provider.get(target_id);
      if (target_id_ast === undefined) {
        let message = `cross reference to unknown id: "${target_id}"`;
        this.error(context, message, ast.args.href[0].line, ast.args.href[0].column);
        return error_message_in_output(message, context);
      }
      const content_arg = ast.args.content;
      let content;
      if (content_arg === undefined) {
        let x_text_options = {
          caption_prefix_span: false,
          style_full: 'full' in ast.args,
          quote: true,
        };
        content = Macro.x_text(target_id_ast, context, x_text_options);
        if (content === ``) {
          let message = `empty cross reference body: "${target_id}"`;
          this.error(context, message, ast.line, ast.column);
          return error_message_in_output(message, context);
        }
      } else {
        content = convert_arg(content_arg, context);
      }
      const attrs = html_convert_attrs_id(ast, context);
      const href = x_href(target_id_ast, context);
      return `<a${href}${attrs}>${content}</a>`;
    },
    {
      named_args: [
        new MacroArgument({
          name: 'full',
          boolean: true,
        }),
      ],
      properties: {
        phrasing: true,
      }
    }
  ),
  new Macro(
    'Video',
    MACRO_IMAGE_VIDEO_POSITIONAL_ARGUMENTS,
    macro_image_video_convert_function(
      function (ast, context, src, rendered_attrs, alt) {
        if ('youtube' in ast.args) {
          return `<iframe width="560" height="315" src="https://www.youtube.com/embed/${src}" ` +
                `frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; ` +
                `picture-in-picture" allowfullscreen></iframe>`;
        } else {
          return `<video${rendered_attrs} controls>${alt}</video>\n`;
        }
      },
      function (ast, context, src) {
        if ('source' in ast.args) {
          return convert_arg(ast.args.source, context);
        } else if ('youtube' in ast.args) {
          return `https://youtube.com/watch?v=${src}`;
        } else {
          return '';
        }
      }
    ),
    Object.assign(
      {
        caption_prefix: 'Video',
        id_prefix: 'video',
        named_args: MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS.concat(
          new MacroArgument({
            name: 'youtube',
            boolean: true,
          }),
        ),
      },
    ),
  ),
];
