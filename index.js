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
   * @param {Object[String, AstArgument]} args - dict of arg names to arguments.
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
    if (!(Macro.ID_ARGUMENT_NAME in options)) {
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
    // This is the Nth macro of this type that is visible,
    // and therefore increments counts such as Figure 1), Figure 2), etc.
    // All indexed IDs (those that can be linked to) are also visible, but
    // it is possible to force non-indexed IDs to count as well with
    // caption_number_visible.
    this.macro_count_visible = undefined;
    this.parent_node = options.parent_node;
    // {TreeNode} that points to the element.
    // This is used for both headers and non headers:
    // the only difference is that non-headers are not connected as
    // children of their parent. But they still know who the parent is.
    // This was originally required for header scope resolution.
    this.header_tree_node = undefined;
    this.validation_error = undefined;
    this.validation_output = {};

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
   *                 - 'prefix': prefix to add for a  full reference, e.g. `Figure 1`, `Section 2`, etc.
   *                 - {AstArgument} 'title': the title of the element linked to
   *        - {bool} in_caption_number_visible
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
    if (!('in_title_no_id' in context)) {
      context.in_title = false;
    }
    if (!('katex_macros' in context)) {
      context.katex_macros = {};
    }
    if (!('macros' in context)) {
      throw new Error('context does not have a mandatory .macros property');
    }
    const macro = context.macros[this.macro_name];
    let out;
    if (this.validation_error === undefined) {
      out = macro.convert(this, context);
    } else {
      render_error(context, this.validation_error[0], this.validation_error[1], this.validation_error[2]);
      out = error_message_in_output(this.validation_error[0], context);
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
        for (let ast of arg) {
          let new_ast = new AstNode(AstType[ast.node_type], ast.macro_name,
            ast.args, ast.line, ast.column, {text: ast.text});
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
      node_type:  symbol_to_string(this.node_type),
      line:       this.line,
      column:     this.column,
      text:       this.text,
      args:       this.args,
    }
  }
}
exports.AstNode = AstNode;

class AstArgument extends Array {
  constructor(nodes, line, column) {
    super(...nodes)
    this.line = line;
    this.column = column;
  }

  // https://stackoverflow.com/questions/3261587/subclassing-javascript-arrays-typeerror-array-prototype-tostring-is-not-generi/61269027#61269027
  static get [Symbol.species]() {
    return Object.assign(function (...items) {
      return new AstArgument(new Array(...items))
    }, AstArgument);
  }
}

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

class FileProvider {
  get(path) { throw new Error('unimplemented'); }
}
exports.FileProvider = FileProvider;

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
   * @param {TreeNode} header_tree_node
   * @return {Union[AstNode,undefined]}.
   *         undefined: ID not found
   *         Otherwise, the ast node for the given ID
   */
  get(id, context, header_tree_node) {
    if (id[0] === Macro.HEADER_SCOPE_SEPARATOR) {
      return this.get_noscope(id.substr(1), context);
    } else {
      if (header_tree_node !== undefined) {
        let parent_scope_id = get_parent_scope_id(header_tree_node);
        if (parent_scope_id !== undefined) {
          let resolved_scope_id = this.get_noscope(
            parent_scope_id + Macro.HEADER_SCOPE_SEPARATOR + id, context);
          if (resolved_scope_id !== undefined) {
            return resolved_scope_id;
          }
        }
      }
      // Not found with ID resolution, so just try to get the exact ID.
      return this.get_noscope(id, context);
    }
  }

  /** Like get, but do not resolve scope. */
  get_noscope(id, context) { throw new Error('unimplemented'); }

  /**
   * @param {String} id
   * @return {Array[AstNode]}: all header nodes that have the given ID
   *                           as a parent includer.
   */
  get_includes(id, context) { throw new Error('unimplemented'); }
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
  get_noscope(id, context) {
    let ret;
    ret = this.id_provider_1.get_noscope(id, context);
    if (ret !== undefined) {
      return ret;
    }
    ret = this.id_provider_2.get_noscope(id, context);
    if (ret !== undefined) {
      return ret;
    }
    return undefined;
  }
  get_includes(id, context) {
    return this.id_provider_1.get_includes(id, context).concat(
      this.id_provider_2.get_includes(id, context));
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
  get_noscope(id, context) {
    if (id in this.dict) {
      return this.dict[id];
    }
    return undefined;
  }
  get_includes(id, context) {
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
    if (!('default' in options)) {
      // https://cirosantilli.com/cirodown#boolean-named-arguments
      options.default = undefined;
    }
    if (!('mandatory' in options)) {
      // https://cirosantilli.com/cirodown#mandatory-positional-arguments
      options.mandatory = false;
    }
    if (!('positive_nonzero_integer' in options)) {
      options.positive_nonzero_integer = false;
    }
    if (!('remove_whitespace_children' in options)) {
      // https://cirosantilli.com/cirodown#remove_whitespace_children
      options.remove_whitespace_children = false;
    }
    this.boolean = options.boolean;
    this.default = options.default;
    this.elide_link_only = options.elide_link_only;
    this.mandatory = options.mandatory;
    this.name = options.name;
    this.positive_nonzero_integer = options.positive_nonzero_integer;
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
    if (!('caption_number_visible' in options)) {
      options.caption_number_visible = function(ast) { return false; }
    }
    if (!('caption_prefix' in options)) {
      options.caption_prefix = capitalize_first_letter(name);
    }
    if (!('default_x_style_full' in options)) {
      options.default_x_style_full = true;
    }
    if (!('get_number' in options)) {
      options.get_number = function(ast, context) { return ast.macro_count_visible; }
    }
    if (!('get_title_arg' in options)) {
      options.get_title_arg = function(ast, context) {
        return ast.args[Macro.TITLE_ARGUMENT_NAME];
      }
    }
    if (!('id_prefix' in options)) {
      options.id_prefix = title_to_id(name);
    }
    if (!('image_video_content_func' in options)) {
      options.image_video_content_func = function() { throw new Error('unimplemented'); };
    }
    if (!('macro_counts_ignore' in options)) {
      options.macro_counts_ignore = function(ast) {
        return false;
      }
    }
    if (!('named_args' in options)) {
      options.named_args = [];
    }
    if (!('phrasing' in options)) {
      options.phrasing = false;
    }
    if (!('source_func' in options)) {
      options.source_func = function() { throw new Error('unimplemented'); };
    }
    if (!('toplevel_link' in options)) {
      options.toplevel_link = true;
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
    this.id_prefix = options.id_prefix;
    this.options = options;
    this.remove_whitespace_children = options.remove_whitespace_children;
    this.toplevel_link = options.toplevel_link;
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
    delete this.options.named_args;
  }

  check_name(name) {
    if (name === Macro.ID_ARGUMENT_NAME) {
      throw new Error(`name "${Macro.ID_ARGUMENT_NAME}" is reserved and automatically added`);
    }
    if (name in this.name_to_arg) {
      throw new Error('name already taken: ' + name);
    }
  }

  toJSON() {
    const options = this.options;
    const ordered_options = {};
    Object.keys(options).sort().forEach(function(key) {
      ordered_options[key] = options[key];
    });
    return {
      name: this.name,
      options: ordered_options,
      positional_args: this.positional_args,
      named_args: this.named_args,
    }
  }
}
// Macro names defined here are those that have magic properties, e.g.
// headers are used by the 'toc'.
Macro.CIRODOWN_EXAMPLE_MACRO_NAME = 'cirodown_example';
Macro.CODE_MACRO_NAME = 'c';
Macro.HEADER_MACRO_NAME = 'h';
Macro.HEADER_SCOPE_SEPARATOR = '/';
Macro.ID_ARGUMENT_NAME = 'id';
Macro.INCLUDE_MACRO_NAME = 'include';
Macro.LINK_MACRO_NAME = 'a';
Macro.LIST_MACRO_NAME = 'l';
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
    this.in_insane_header = false;
    this.line = start_line;
    this.list_level = 0;
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
   * @param {Number} how many to consume
   * @return {boolean} true iff we are not reading past the end of the input
   */
  consume(n=1) {
    for (let done = 0; done < n; done++) {
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
    }
    return true;
  }

  consume_list_indent() {
    if (this.i > 0 && this.chars[this.i - 1] === '\n') {
      let new_list_level = 0;
      while (
        array_contains_array_at(this.chars, this.i, INSANE_LIST_INDENT) &&
        new_list_level < this.list_level
      ) {
        for (const c in INSANE_LIST_INDENT) {
          this.consume();
        }
        new_list_level += 1;
      }
      for (let i = 0; i < this.list_level - new_list_level; i++) {
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
      }
      this.list_level = new_list_level;
    }
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

  consume_optional_newline_after_argument() {
    if (
      !this.is_end() &&
      this.cur_c === '\n' &&
      !this.in_insane_header
    ) {
      const full_indent = INSANE_LIST_INDENT.repeat(this.list_level);
      if (
        array_contains_array_at(this.chars, this.i + 1, full_indent + START_POSITIONAL_ARGUMENT_CHAR) ||
        array_contains_array_at(this.chars, this.i + 1, full_indent + START_NAMED_ARGUMENT_CHAR)
      ) {
        this.consume(full_indent.length + 1);
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
    let new_plaintext = true;
    if (this.tokens.length > 0) {
      let last_token = this.tokens[this.tokens.length - 1];
      if (last_token.type === TokenType.PLAINTEXT) {
        last_token.value += s;
        new_plaintext = false;
      }
    }
    if (new_plaintext) {
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
    let unterminated_literal = false;
    let start_line;
    let start_column;
    while (!this.is_end()) {
      this.log_debug('tokenize loop');
      this.log_debug('this.i: ' + this.i);
      this.log_debug('this.line: ' + this.line);
      this.log_debug('this.column: ' + this.column);
      this.log_debug('this.cur_c: ' + this.cur_c);
      if (this.in_insane_header && this.cur_c === '\n') {
        this.in_insane_header = false;
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        this.consume_optional_newline_after_argument()
      }
      this.consume_list_indent();
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
        let line = this.line;
        let column = this.column;
        // Tokenize past the last open char.
        let open_length = this.tokenize_func(
          (c)=>{return c === START_NAMED_ARGUMENT_CHAR}
        ).length;
        this.push_token(TokenType.NAMED_ARGUMENT_START,
          START_NAMED_ARGUMENT_CHAR.repeat(open_length), line, column);
        line = this.line;
        column = this.column;
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
          this.push_token(TokenType.NAMED_ARGUMENT_END, close_string);
          this.consume_optional_newline_after_argument()
        }
      } else if (this.cur_c === END_NAMED_ARGUMENT_CHAR) {
        this.push_token(TokenType.NAMED_ARGUMENT_END, END_NAMED_ARGUMENT_CHAR);
        this.consume();
        this.consume_optional_newline_after_argument()
      } else if (this.cur_c === START_POSITIONAL_ARGUMENT_CHAR) {
        let line = this.line;
        let column = this.column;
        // Tokenize past the last open char.
        let open_length = this.tokenize_func(
          (c)=>{return c === START_POSITIONAL_ARGUMENT_CHAR}
        ).length;
        this.push_token(TokenType.POSITIONAL_ARGUMENT_START,
          START_POSITIONAL_ARGUMENT_CHAR.repeat(open_length), line, column);
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
        this.push_token(TokenType.MACRO_NAME, macro_name);
        this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
        if (!this.tokenize_literal(open_char, close_string)) {
          unterminated_literal = true;
        }
        this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
        this.consume_optional_newline_after_argument()
      } else if (this.cur_c === '\n' && this.peek() === '\n') {
        this.consume();
        this.consume();
        // We must close list level changes before the paragraph, e.g. in:
        //
        // ``
        // * aa
        // * bb
        //
        // cc
        // ``
        //
        // the paragraph goes after `ul`, it does not stick to `bb`
        this.consume_list_indent();
        this.push_token(TokenType.PARAGRAPH);
        if (this.cur_c === '\n') {
          this.error('paragraph with more than two newlines, use just two');
        }
      } else {
        let done = false;

        // Insane link.
        if (
          this.i === 0 ||
          this.chars[this.i - 1] === '\n' ||
          this.chars[this.i - 1] === ' ' ||
          this.tokens[this.tokens.length - 1].type === TokenType.POSITIONAL_ARGUMENT_START ||
          this.tokens[this.tokens.length - 1].type === TokenType.NAMED_ARGUMENT_NAME
        ) {
          let protocol_is_known = false;
          for (const known_url_protocol of KNOWN_URL_PROTOCOLS) {
            if (array_contains_array_at(this.chars, this.i, known_url_protocol)) {
              protocol_is_known = true;
              break;
            }
          }
          if (protocol_is_known) {
            this.push_token(TokenType.MACRO_NAME, Macro.LINK_MACRO_NAME);
            this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
            let link_text = '';
            while (this.consume_plaintext_char()) {
              if (
                this.cur_c == ' ' ||
                this.cur_c == '\n' ||
                this.cur_c == START_POSITIONAL_ARGUMENT_CHAR ||
                this.cur_c == START_NAMED_ARGUMENT_CHAR ||
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
            this.consume_optional_newline_after_argument();
            done = true;
          }
        }

        // Insane lists.
        if (!done && (
          this.i === 0 ||
          this.cur_c === '\n' ||
          this.tokens[this.tokens.length - 1].type === TokenType.PARAGRAPH)
        ) {
          let i = this.i;
          if (this.cur_c === '\n') {
            i += 1;
          }
          let new_list_level = 0;
          while (array_contains_array_at(this.chars, i, INSANE_LIST_INDENT)) {
            i += INSANE_LIST_INDENT.length;
            new_list_level += 1;
          }
          if (array_contains_array_at(this.chars, i, INSANE_LIST_START)) {
            if (new_list_level <= this.list_level + 1) {
              if (this.cur_c === '\n') {
                this.consume();
              }
              this.consume_list_indent();
              this.push_token(TokenType.MACRO_NAME, Macro.LIST_MACRO_NAME);
              this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
              this.list_level += 1;
              done = true;
              for (const c in INSANE_LIST_START) {
                this.consume();
              }
            }
          }
        }

        // Insane headers.
        if (!done && (
          this.i === 0 ||
          this.chars[this.i - 1] === '\n'
        )) {
          let i = this.i;
          let new_header_level = 0;
          while (this.chars[i] === INSANE_HEADER_CHAR) {
            i += 1;
            new_header_level += 1;
          }
          if (new_header_level > 0 && this.chars[i] === ' ') {
            this.push_token(TokenType.MACRO_NAME, Macro.HEADER_MACRO_NAME);
            this.push_token(TokenType.POSITIONAL_ARGUMENT_START, INSANE_HEADER_CHAR.repeat(new_header_level));
            this.push_token(TokenType.PLAINTEXT, new_header_level.toString());
            this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
            this.push_token(TokenType.POSITIONAL_ARGUMENT_START);
            for (let i = 0; i <= new_header_level; i++)
              this.consume();
            this.in_insane_header = true;
            done = true;
          }
        }

        // Character is nothing else, so finally it is a regular plaintext character.
        if (!done) {
          this.consume_plaintext_char();
        }
      }
    }
    if (unterminated_literal) {
      this.error(`unterminated literal argument`, start_line, start_column);
    }

    // Close any open headers at the end of the document.
    if (this.in_insane_header) {
      this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
    }

    // Close any open list levels at the end of the document.
    for (let i = 0; i < this.list_level; i++) {
      this.push_token(TokenType.POSITIONAL_ARGUMENT_END);
    }

    this.push_token(TokenType.PARAGRAPH);
    this.push_token(TokenType.INPUT_END);
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

    // Remove insane list indents.
    let plaintext = '';
    {
      let i = start_i;
      while (true) {
        if (this.chars[i - 1] === '\n') {
          if (this.chars[i] === '\n') {
          } else if (array_contains_array_at(this.chars, i, INSANE_LIST_INDENT.repeat(this.list_level))) {
            i += INSANE_LIST_INDENT.length * this.list_level;
          } else {
            this.error(`literal argument with indent smaller than current insane list`, start_line, start_column);
          }
        }
        if (i < end_i) {
          plaintext += this.chars[i];
        } else {
          break;
        }
        i++;
      }
    }

    // Create the token.
    this.push_token(
      TokenType.PLAINTEXT,
      plaintext + append,
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

function basename(str) {
  return str.substr(str.lastIndexOf(URL_SEP) + 1);
}

function capitalize_first_letter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function caption_number_visible(ast, context) {
  return ast.index_id || context.macros[ast.macro_name].options.caption_number_visible(ast, context);
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
  if (!('cirodown_json' in options)) { options.cirodown_json = {}; }
    const cirodown_json = options.cirodown_json;
    {
      if (!('media-providers' in cirodown_json)) { cirodown_json['media-providers'] = {}; }
      {
        const media_providers = cirodown_json['media-providers'];

        for (const media_provider_type of MEDIA_PROVIDER_TYPES) {
          if (!(media_provider_type in media_providers)) {
            media_providers[media_provider_type] = {};
          }
          const media_provider = media_providers[media_provider_type];
          if (!('title-from-src' in media_provider)) {
            media_provider['title-from-src'] = false;
          }
        }
        if (!('path' in media_providers.local)) {
          media_providers.local.path = '';
        }
        if (!('remote' in media_providers.github)) {
          media_providers.github.remote = 'TODO determine from git remote origin if any';
        }
        for (const media_provider_name in media_providers) {
          const media_provider = media_providers[media_provider_name];
          if (!('title-from-src' in media_provider)) {
            media_provider['title-from-src'] = false;
          }
        }
      }
    }
  if (!('file_provider' in options)) { options.file_provider = undefined; }
  if (!('from_include' in options)) { options.from_include = false; }
  if (!('html_embed' in options)) { options.html_embed = false; }
  if (!('html_single_page' in options)) { options.html_single_page = false; }
  if (!('html_x_extension' in options)) { options.html_x_extension = true; }
  if (!('h_level_offset' in options)) { options.h_level_offset = 0; }
  if (!('id_provider' in options)) { options.id_provider = undefined; }
  if (!('include_path_set' in options)) { options.include_path_set = new Set(); }
  if (!('input_path' in options)) { options.input_path = undefined; }
  if (!('render' in options)) { options.render = true; }
  if (!('start_line' in options)) { options.start_line = 1; }
  if (!('show_ast' in options)) { options.show_ast = false; }
  if (!('show_parse' in options)) { options.show_parse = false; }
  if (!('show_tokenize' in options)) { options.show_tokenize = false; }
  if (!('show_tokens' in options)) { options.show_tokens = false; }
  if (!('template' in options)) { options.template = undefined; }
  if (!('template_vars' in options)) { options.template_vars = {}; }
    if (!('style' in options.template_vars)) { options.template_vars.style = ''; }
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
  let context = {
    errors: [],
    extra_returns: extra_returns,
    include_path_set: new Set(options.include_path_set),
    macros: macros,
    options: options,
  };

  // Setup context.media_provider_default based on `default-for`.
  {
    const media_providers = cirodown_json['media-providers'];
    context.media_provider_default = {};
    for (const media_provider_name in media_providers) {
      const media_provider = media_providers[media_provider_name];
      if ('default-for' in media_provider) {
        for (const default_for of media_provider['default-for']) {
          if (default_for[0] == default_for[0].toUpperCase()) {
            context.errors.push(new ErrorMessage(`default-for names must start with a lower case letter`, 1, 1));
          } else {
            if (default_for === 'all') {
              for (const macro_name of MACRO_WITH_MEDIA_PROVIDER) {
                context.media_provider_default[default_for] = media_provider_name;
                context.media_provider_default[capitalize_first_letter(default_for)] = media_provider_name;
              }
            } else {
              if (MACRO_WITH_MEDIA_PROVIDER.has(default_for)) {
                if (context.media_provider_default[default_for] === undefined) {
                  context.media_provider_default[default_for] = media_provider_name;
                  context.media_provider_default[capitalize_first_letter(default_for)] = media_provider_name;
                } else {
                  context.errors.push(new ErrorMessage(`multiple media providers set for macro "${default_for}"`, 1, 1));
                }
              } else {
                context.errors.push(new ErrorMessage(`macro "${default_for}" does not accept media providers`, 1, 1));
              }
            }
          }
        }
      }
    }
    for (const macro_name of MACRO_WITH_MEDIA_PROVIDER) {
      if (context.media_provider_default[macro_name] === undefined) {
        context.media_provider_default[macro_name] = 'local';
        context.media_provider_default[capitalize_first_letter(macro_name)] = 'local';
      }
    }
  }

  let ast = parse(tokens, options, context, sub_extra_returns);
  if (options.show_ast) {
    console.error('ast:');
    console.error(JSON.stringify(ast, null, 2));
    console.error();
  }
  extra_returns.ast = ast;
  extra_returns.context = context;
  extra_returns.ids = sub_extra_returns.ids;
  extra_returns.errors.push(...sub_extra_returns.errors);
  let output;
  if (options.render) {
    context.extra_returns = extra_returns;
    output = ast.convert(context);
    extra_returns.errors.push(...context.errors);
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
 * @param {AstArgument} arg
 * @return {String} empty string if arg is undefined
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
 * @param {AstArgument} arg
 * @return {String}
 */
function convert_arg_noescape(arg, context={}) {
  return convert_arg(arg, clone_and_set(context, 'html_escape', false));
}

/** @return {AstArgument} */
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

/** @return {Union[String,undefined]}
 *          If the node has a parent header with a scope, return the ID of that header.
 *          Otherwise, return undefined.
 */
function get_parent_scope_id(header_tree_node) {
  let cur_header_tree_node = header_tree_node.parent_node;
  while (
    // Possible in case of mal-formed document e.g. with
    // non-integer header level.
    cur_header_tree_node !== undefined &&
    cur_header_tree_node.value !== undefined
  ) {
    if (cur_header_tree_node.value.validation_output.scope.boolean) {
      // The ID of the first scoped parent already contains all further scopes prepended to it.
      return cur_header_tree_node.value.id;
    }
    cur_header_tree_node = cur_header_tree_node.parent_node;
  }
  return undefined;
}

/** Convert a key value already fully HTML escaped strings
 * to an HTML attribute. The callers MUST escape any untrested chars.
  e.g. with html_attr_value.
 *
 * @param {String} key
 * @param {AstArgument} arg
 * @return {String} - of form ' a="b"' (with a leading space)
 */
function html_attr(key, value) {
  return ` ${key}="${value}"`;
}

/** Convert an argument to an HTML attribute value.
 *
 * @param {AstArgument} arg
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

/**
 * Same interface as html_convert_attrs, but automatically add the ID to the list
 * of arguments.
 */
function html_convert_attrs_id(
  ast, context, arg_names=[], custom_args={}
) {
  if (ast.id !== undefined) {
    custom_args[Macro.ID_ARGUMENT_NAME] = [
        new PlaintextAstNode(ast.line, ast.column,
          remove_toplevel_scope(ast, context))];
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

function html_elem(tag, content) {
  return `<${tag}>${content}</${tag}>`;
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

function html_katex_convert(ast, context) {
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
    render_error(context, message, ast.args.content.line, ast.args.content.column);
    return error_message_in_output(message, context);
  }
}

function html_self_link(ast, context) {
  return ` ${x_href_attr(ast, context)}`;
}

/**
 * @return {Object} dict of macro name to macro
 */
function macro_list_to_macros() {
  const macros = {};
  for (const macro of macro_list()) {
    macros[macro.name] = macro;
  }
  return macros;
}

/** At some point we will generalize this to on-the-fly macro definitions. */
function macro_list() {
  return DEFAULT_MACRO_LIST;
}
exports.macro_list = macro_list;

const MEDIA_PROVIDER_TYPES = new Set([
  'github',
  'local',
  'unknown',
  'wikimedia',
  'youtube',
]);
const media_provider_type_wikimedia_re = new RegExp('^https?://upload.wikimedia.org/wikipedia/commons/');
const media_provider_type_youtube_re = new RegExp('^https?://(www\.)?(youtube.com|youtu.be)/');
const macro_image_video_block_convert_function_wikimedia_source_url = 'https://commons.wikimedia.org/wiki/File:';
const macro_image_video_block_convert_function_wikimedia_source_image_re = new RegExp('^\\d+px-');
const macro_image_video_block_convert_function_wikimedia_source_video_re = new RegExp('^([^.]+\.[^.]+).*');

function macro_image_video_block_convert_function(ast, context) {
  let rendered_attrs = html_convert_attrs(ast, context, ['height', 'width']);
  let figure_attrs = html_convert_attrs_id(ast, context);
  let ret = `<figure${figure_attrs}>\n`
  let href_prefix;
  if (ast.id !== undefined) {
    href_prefix = html_self_link(ast, context);
  } else {
    href_prefix = undefined;
  }
  let description = convert_arg(ast.args.description, context);
  let force_separator = false;
  if (description !== '') {
    description = ' ' + description;
    force_separator = true;
  }
  let {error_message, media_provider_type, source, src, is_url}
    = macro_image_video_resolve_params_with_source(ast, context);
  if (error_message !== undefined) {
    return error_message;
  }
  if (source !== '') {
    force_separator = true;
    source = ` <a ${html_attr('href', source)}>Source</a>.`;
  }
  let alt_val;
  const has_caption = (ast.id !== undefined) && caption_number_visible(ast, context);
  if (ast.args.alt === undefined) {
    if (has_caption) {
      alt_val = undefined;
    } else {
      alt_val = src;
    }
  } else {
    alt_val = convert_arg(ast.args.alt, context);
  }
  let alt;
  if (alt_val === undefined) {
    alt = '';
  } else {
    alt = html_attr('alt', html_escape_attr(alt_val));
  }
  ret += context.macros[ast.macro_name].options.image_video_content_func(
    ast, context, src, rendered_attrs, alt, media_provider_type, is_url);
  if (has_caption) {
    ret += `<figcaption>${x_text(ast, context, {href_prefix:
      href_prefix, force_separator: force_separator})}${description}${source}</figcaption>\n`;
  }
  ret += '</figure>\n';
  return ret;
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
function parse(tokens, options, context, extra_returns={}) {
  extra_returns.errors = [];
  let state = {
    extra_returns: extra_returns,
    i: 0,
    macros: context.macros,
    options: options,
    token: tokens[0],
    tokens: tokens,
  };
  // Get toplevel arguments such as {title=}, see https://cirosantilli.com/cirodown#toplevel
  const ast_toplevel_args = parse_argument_list(state, Macro.TOPLEVEL_MACRO_NAME, AstType.MACRO);
  if ('content' in ast_toplevel_args) {
    parse_error(state, `the toplevel arguments cannot contain an explicit content argument`, 1, 1);
  }

  // Inject a maybe paragraph token after those arguments.
  const paragraph_token = new Token(TokenType.PARAGRAPH, undefined, state.token.line, state.token.column);
  tokens.splice(state.i, 0, paragraph_token);
  state.token = paragraph_token;

  // Parse the main part of the document as the content argument toplevel argument.
  const ast_toplevel_content_arg = parse_argument(state, state.token.line, state.token.column);

  // Create the toplevel argument itself.
  const ast_toplevel = new AstNode(
    AstType.MACRO,
    Macro.TOPLEVEL_MACRO_NAME,
    Object.assign(ast_toplevel_args, {'content': ast_toplevel_content_arg}),
    1,
    1,
  );
  if (state.token.type !== TokenType.INPUT_END) {
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
  let toplevel_parent_arg = new AstArgument([], 1, 1);
  let todo_visit = [[toplevel_parent_arg, ast_toplevel]];
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
  const include_options = Object.assign({}, options);
  include_options.include_path_set = context.include_path_set;
  context.include_path_set.add(options.input_path);
  while (todo_visit.length > 0) {
    const [parent_arg, ast] = todo_visit.pop();
    const macro_name = ast.macro_name;
    ast.from_include = options.from_include;
    ast.input_path = options.input_path;
    if (macro_name === Macro.INCLUDE_MACRO_NAME) {
      const href = convert_arg_noescape(ast.args.href, context);
      cur_header.includes.push(href);
      if (context.include_path_set.has(href)) {
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
            include_options,
            cur_header_level,
            href
          );
          context.include_path_set.add(href);
        } else {
          const target_id_ast = id_provider.get(href, context);
          let header_node_title;
          if (target_id_ast === undefined) {
            let message = `ID in include not found on database: "${href}", ` +
              `needed to calculate the cross reference title. Did you forget to convert all files beforehand?`;
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
            header_node_title = x_text(target_id_ast, context, x_text_options);
          }
          // Don't merge into a single file, render as a dummy header and an xref link instead.
          new_child_nodes = [
            new AstNode(
              AstType.MACRO,
              Macro.HEADER_MACRO_NAME,
              {
                'level': new AstArgument([
                  new PlaintextAstNode(
                    ast.line,
                    ast.column,
                    (cur_header_level + 1).toString(),
                  )
                ], ast.line, ast.column),
                [Macro.TITLE_ARGUMENT_NAME]: new AstArgument([
                  new PlaintextAstNode(
                    ast.line,
                    ast.column,
                    header_node_title
                  )
                ], ast.line, ast.column),
              },
              ast.line,
              ast.column,
              {
                force_no_index: true,
                from_include: true,
                id: href,
                input_path: ast.input_path,
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
                'content': new AstArgument([
                  new AstNode(
                    AstType.MACRO,
                    'x',
                    {
                      'href': new AstArgument([
                        new PlaintextAstNode(
                          ast.line,
                          ast.column,
                          href
                        )
                      ], ast.line, ast.column),
                      'content': new AstArgument([
                        new PlaintextAstNode(
                          ast.line,
                          ast.column,
                          'This section is present in another page, follow this link to view it.'
                        )
                      ], ast.line, ast.column),
                    },
                    ast.line,
                    ast.column,
                    {from_include: true},
                  ),
                ], ast.line, ast.column),
              },
              ast.line,
              ast.column,
              {
                from_include: true,
                input_path: ast.input_path,
              },
            ),
          ];
        }
        // Push all included nodes, but don't recurse because:
        // - all child includes will be resolved on the sub-render call
        // - the current header level must not move, so that consecutive \include
        //   calls won't nest into one another
        for (const new_child_node of new_child_nodes) {
          new_child_node.parent_node = ast.parent_node;
        }
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
            'content': new AstArgument([
              new PlaintextAstNode(
                ast.line,
                ast.column,
                'which renders as:',
              )
            ], ast.line, ast.column),
          },
          ast.line,
          ast.column,
        ),
        new AstNode(
          AstType.MACRO,
          'q',
          {
            'content': convert_include(
              convert_arg_noescape(ast.args.content, context),
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
          convert_arg_noescape(ast.args.level, context)
        ) + options.h_level_offset;
        ast.level = cur_header_level;
        if ('level' in ast.args) {
          // Hack the level argument of the final AST to match for consistency.
          ast.args.level = new AstArgument([
            new PlaintextAstNode(ast.args.level.line, ast.args.level.column, ast.level.toString())],
            ast.args.level.line, ast.args.level.column);
        }
      }
      // Push this node into the parent argument list.
      // This allows us to skip nodes, or push multiple nodes if needed.
      parent_arg.push(ast);

      // Recurse.
      for (const arg_name in ast.args) {
        let arg = ast.args[arg_name];
        // We make the new argument be empty so that children can
        // decide if they want to push themselves or not.
        const new_arg = new AstArgument([], arg.line, arg.column);
        for (let i = arg.length - 1; i >= 0; i--) {
          todo_visit.push([new_arg, arg[i]]);
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
    const macro_counts_visible = {};
    let header_graph_last_level;
    const header_graph_stack = new Map();
    let is_first_header = true;
    let first_header_level;
    let first_header;
    context.headers_with_include = [];
    context.id_provider = id_provider;
    context.header_graph = new TreeNode();
    context.has_toc = false;
    let toplevel_parent_arg = new AstArgument([], 1, 1);

    // First do a pass that makes any changes to the tree.
    {
      const todo_visit = [[toplevel_parent_arg, ast_toplevel]];
      while (todo_visit.length > 0) {
        let [parent_arg, ast] = todo_visit.pop();
        const macro_name = ast.macro_name;
        const macro = context.macros[macro_name];

        if (macro_name === Macro.TOC_MACRO_NAME) {
          if (ast.from_include) {
            // Skip.
            continue;
          }
          context.has_toc = true;
        } else if (macro_name === Macro.TOPLEVEL_MACRO_NAME && ast.parent_node !== undefined) {
          // Prevent this from happening. When this was committed originally,
          // it actually worked and output an `html` inside another `html`.
          // Maybe we could do something with iframe, but who cares about that?
          const message = `the "${Macro.TOPLEVEL_MACRO_NAME}" cannot be used explicitly`;
          ast = new PlaintextAstNode(ast.line, ast.column, error_message_in_output(message));
          parse_error(state, message, ast.line, ast.column);
        }

        // Push this node into the parent argument list.
        // This allows us to skip nodes, or push multiple nodes if needed.
        parent_arg.push(ast);

        validate_ast(ast, context);

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
            const new_arg = new AstArgument([], arg.line, arg.column);
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
                    const new_arg_auto_parent = new AstArgument([], child_node.line, child_node.column);
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
                    new_child_nodes = new AstArgument([new AstNode(
                      AstType.MACRO,
                      auto_parent_name,
                      {
                        'content': new_arg_auto_parent,
                      },
                      start_auto_child_node.line,
                      start_auto_child_node.column,
                      {parent_node: child_node.parent_node}
                    )], child_node.line, child_node.column);
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
              const new_arg = new AstArgument([], arg.line, arg.column);
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
            const new_arg = new AstArgument([], arg.line, arg.column);
            for (let i = arg.length - 1; i >= 0; i--) {
              todo_visit.push([new_arg, arg[i]]);
            }
            // Update the argument.
            ast.args[arg_name] = new_arg;
          }
        }
      }
    }

    // Now do a pass that collects information that may be affected by
    // the tree modifications of the previous step, e.g. ID generation.
    {
      const todo_visit = [ast_toplevel];
      while (todo_visit.length > 0) {
        let ast = todo_visit.pop();
        const macro_name = ast.macro_name;
        const macro = context.macros[macro_name];

        if (macro_name === Macro.HEADER_MACRO_NAME) {
          // Create the header tree.
          if (ast.level === undefined) {
            cur_header_level = parseInt(convert_arg_noescape(ast.args.level, context)) + options.h_level_offset;
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
            header_graph_stack[header_graph_last_level] = context.header_graph;
          }
          cur_header_tree_node = new TreeNode(ast, header_graph_stack[cur_header_level - 1]);
          if (cur_header_level - header_graph_last_level > 1) {
            const message = `skipped a header level from ${header_graph_last_level} to ${ast.level}`;
            ast.args[Macro.TITLE_ARGUMENT_NAME].push(
              new PlaintextAstNode(ast.line, ast.column, ' ' + error_message_in_output(message)));
            parse_error(state, message, ast.args.level.line, ast.args.level.column);
          }
          if (cur_header_level < first_header_level) {
            parse_error(
              state,
              `header level ${cur_header_level} is smaller than the level of the first header of the document ${first_header_level}`,
              ast.args.level.line,
              ast.args.level.column
            );
          }
          let parent_tree_node = header_graph_stack[cur_header_level - 1];
          if (parent_tree_node !== undefined) {
            parent_tree_node.add_child(cur_header_tree_node);
          }
          header_graph_stack[cur_header_level] = cur_header_tree_node;
          header_graph_last_level = cur_header_level;
          if (ast.includes.length > 0) {
            context.headers_with_include.push(ast);
          }
          ast.header_tree_node = cur_header_tree_node;
        } else {
          ast.header_tree_node = new TreeNode(ast, cur_header_tree_node);;
        }

        // Linear count of each macro type for macros that have IDs.
        if (!macro.options.macro_counts_ignore(ast)) {
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
            let id_prefix = context.macros[ast.macro_name].id_prefix;
            if (id_prefix !== '') {
              id_text += id_prefix + ID_SEPARATOR
            }
            let title_arg = macro.options.get_title_arg(ast, context);
            if (title_arg !== undefined) {
              // ID from title.
              // TODO correct unicode aware algorithm.
              context.extra_returns.x_no_content_in_title_no_id = false;
              id_text += title_to_id(convert_arg_noescape(title_arg, clone_and_set(context, 'in_title_no_id', true)));
              if (context.extra_returns.x_no_content_in_title_no_id) {
                const message = `x cross reference to id "${context.extra_returns.x_no_content_in_title_no_id_target}" ` +
                                `without content used inside a title without an id, see: https://cirosantilli.com/cirodown#x-within-title-restrictions`;
                title_arg.push(
                  new PlaintextAstNode(
                    context.extra_returns.x_no_content_in_title_no_id_line,
                    context.extra_returns.x_no_content_in_title_no_id_column,
                    ' ' + error_message_in_output(message)
                  )
                );
                parse_error(state, message,
                  context.extra_returns.x_no_content_in_title_no_id_line,
                  context.extra_returns.x_no_content_in_title_no_id_column);
              } else {
                ast.id = id_text;
              }
            }
            if (ast.id === undefined && !macro.options.phrasing) {
              // ID from element count.
              if (ast.macro_count !== undefined) {
                id_text += ast.macro_count;
                index_id = false;
                ast.id = id_text;
              }
            }
          } else {
            ast.id = convert_arg_noescape(macro_id_arg, context);
          }
          if (ast.id !== undefined && ast.header_tree_node) {
            let parent_scope_id = get_parent_scope_id(ast.header_tree_node);
            if (parent_scope_id !== undefined) {
              ast.id = parent_scope_id + Macro.HEADER_SCOPE_SEPARATOR + ast.id
            }
          }
        }
        ast.index_id = index_id;
        if (ast.id !== undefined && !ast.force_no_index) {
          const previous_ast = id_provider.get(ast.id, context, ast.header_tree_node);
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
          if (caption_number_visible(ast, context)) {
            if (!(macro_name in macro_counts_visible)) {
              macro_counts_visible[macro_name] = 0;
            }
            const macro_count = macro_counts_visible[macro_name] + 1;
            macro_counts_visible[macro_name] = macro_count;
            ast.macro_count_visible = macro_count;
          }
        }

        // Push children to continue the search. We make the new argument be empty
        // so that children can decide if they want to push themselves or not.
        for (const arg_name in ast.args) {
          const arg = ast.args[arg_name];
          for (let i = arg.length - 1; i >= 0; i--) {
            todo_visit.push(arg[i]);
          }
        }
      }
    }
    extra_returns.ids = indexed_ids;

    // Calculate header_graph_top_level.
    if (context.header_graph.children.length === 1) {
      context.header_graph_top_level = first_header_level;
      const toplevel_header_ast = context.header_graph.children[0].value;
      context.toplevel_id = toplevel_header_ast.id;
      if (toplevel_header_ast.validation_output.scope.boolean) {
        context.toplevel_scope_cut_length = toplevel_header_ast.id.length + 1;
      } else {
        context.toplevel_scope_cut_length = 0;
      }
    } else {
      context.header_graph_top_level = first_header_level - 1;
      context.toplevel_scope_cut_length = 0;
      context.toplevel_id = undefined;
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
    if (macro.options.phrasing || slice.length > 1) {
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
  if (state.i < state.tokens.length) {
    state.token = state.tokens[state.i];
  } else {
    throw new Error('programmer error');
  }
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

// Input: e.g. in `\Image[img.jpg]{height=123}` this parses the `[img.jpg]{height=123}`.
// Return value: dict with arguments.
function parse_argument_list(state, macro_name, macro_type) {
  parse_log_debug(state, 'function: parse_argument_list');
  parse_log_debug(state, 'state = ' + JSON.stringify(state.token));
  parse_log_debug(state);
  const args = {};
  const macro = state.macros[macro_name];
  let positional_arg_count = 0;
  while (
    // End of stream.
    state.token.type !== TokenType.INPUT_END &&
    (
      state.token.type === TokenType.POSITIONAL_ARGUMENT_START ||
      state.token.type === TokenType.NAMED_ARGUMENT_START
    )
  ) {
    let arg_name;
    let open_token = state.token;
    // Consume the *_ARGUMENT_START token out.
    parse_consume(state);
    if (open_token.type === TokenType.POSITIONAL_ARGUMENT_START) {
      if (macro_type === AstType.ERROR) {
        arg_name = positional_arg_count.toString();
      } else {
        if (positional_arg_count >= macro.positional_args.length) {
          parse_error(state,
            `unknown named macro argument "${arg_name}" of macro "${macro_name}"`,
            open_token.line,
            open_token.column,
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
    const arg_children = parse_argument(state, open_token.line, open_token.column);
    if (state.token.type !== closing_token(open_token.type)) {
      parse_error(state, `unclosed argument "${open_token.value}"`, open_token.line, open_token.column);
    }
    args[arg_name] = arg_children;
    if (state.token.type !== TokenType.INPUT_END) {
      // Consume the *_ARGUMENT_END token out.
      parse_consume(state);
    }
  }
  return args;
}

/**
 * Input: e.g. in `\Image[img.jpg]{height=123}` this parses the `img.jpg` and the `123`.
 * @return AstArgument
 */
function parse_argument(state, open_argument_line, open_argument_column) {
  const arg_children = new AstArgument([], open_argument_line, open_argument_column);
  while (
    state.token.type !== TokenType.INPUT_END &&
    state.token.type !== TokenType.POSITIONAL_ARGUMENT_END &&
    state.token.type !== TokenType.NAMED_ARGUMENT_END
  ) {
    // The recursive case: the argument is a lists of macros, go into all of them.
    arg_children.push(parse_macro(state));
  }
return arg_children;
}

// Parse one macro. This is the centerpiece of the parsing!
// Input: e.g. in `\Image[img.jpg]{height=123}` this parses the entire string.
function parse_macro(state) {
  parse_log_debug(state, 'function: parse_macro');
  parse_log_debug(state, 'state = ' + JSON.stringify(state.token));
  parse_log_debug(state);
  if (state.token.type === TokenType.MACRO_NAME) {
    const macro_name = state.token.value;
    const macro_line = state.token.line;
    const macro_column = state.token.column;
    let macro_type;
    const unknown_macro_message = `unknown macro name: "${macro_name}"`;
    if (macro_name in state.macros) {
      macro_type = AstType.MACRO;
    } else {
      macro_type = AstType.ERROR;
      parse_error(state, unknown_macro_message);
    }
    // Consume the MACRO_NAME token out.
    parse_consume(state);
    const args = parse_argument_list(state, macro_name, macro_type);
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
    let error_message
    if (
      state.token.type === TokenType.POSITIONAL_ARGUMENT_START ||
      state.token.type === TokenType.NAMED_ARGUMENT_START
    ) {
      error_message = `stray open argument character: '${state.token.value}', maybe you want to escape it with '\\'`;
    } else {
      // Generic error message.
      error_message = `unexpected token ${state.token.type.toString()}`;
    }
    parse_error(state, error_message);
    let node = new PlaintextAstNode(
      state.token.line,
      state.token.column,
      error_message_in_output(error_message),
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

function protocol_is_known(src) {
  for (const known_url_protocol of KNOWN_URL_PROTOCOLS) {
    if (src.startsWith(known_url_protocol)) {
      return true;
    }
  }
  return false;
}

// https://cirosantilli.com/cirodown#scope
function remove_toplevel_scope(ast, context) {
  let id = ast.id;
  if (
    // Besdies being a minor optimization, this also prevents the case
    // without any headers from blowing up.
    context.toplevel_scope_cut_length > 0 &&
    // Don't remove if we are the toplevel element, otherwise empty ID.
    context.header_graph.children[0].value !== ast
  ) {
    id = id.substr(context.toplevel_scope_cut_length);
  }
  return id;
}

function render_error(context, message, line, column) {
  context.errors.push(new ErrorMessage(message, line, column));
}

// Fuck JavaScript? Can't find a built-in way to get the symbol string without the "Symbol(" part.
// https://stackoverflow.com/questions/30301728/get-the-description-of-a-es6-symbol
function symbol_to_string(symbol) {
  return symbol.toString().slice(7, -1);
}

function title_to_id(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9-]+/g, ID_SEPARATOR)
    .replace(new RegExp('^' + ID_SEPARATOR + '+'), '')
    .replace(new RegExp(ID_SEPARATOR + '+$'), '')
  ;
}

// Do some error checking. If no errors are found, convert normally. Save output on out.
function validate_ast(ast, context) {
  const macro_name = ast.macro_name;
  const macro = context.macros[macro_name];

  const name_to_arg = macro.name_to_arg;
  // First pass sets defaults on missing arguments.
  for (const argname in name_to_arg) {
    ast.validation_output[argname] = {};
    const macro_arg = name_to_arg[argname];
    if (argname in ast.args) {
      ast.validation_output[argname].given = true;
    } else {
      ast.validation_output[argname].given = false;
      if (macro_arg.mandatory) {
        ast.validation_error = [
          `missing mandatory argument ${argname} of ${ast.macro_name}`,
          ast.line, ast.column
        ];
      }
      if (macro_arg.default !== undefined) {
        ast.args[argname] = new AstArgument([new PlaintextAstNode(ast.line, ast.column, macro_arg.default)]);
      } else if (macro_arg.boolean) {
        ast.args[argname] = new AstArgument([new PlaintextAstNode(ast.line, ast.column, '0')]);
      }
    }
  }
  // Second pass processes the values including defaults.
  for (const argname in name_to_arg) {
    const macro_arg = name_to_arg[argname];
    if (argname in ast.args) {
      const arg = ast.args[argname];
      if (macro_arg.boolean) {
        let arg_string;
        if (arg.length > 0) {
          arg_string = convert_arg_noescape(arg, context);
        } else {
          arg_string = '1';
        }
        if (arg_string === '0') {
          ast.validation_output[argname].boolean = false;
        } else if (arg_string === '1') {
          ast.validation_output[argname].boolean = true;
        } else {
          ast.validation_output[argname].boolean = false;
          ast.validation_error = [
            `boolean argument "${argname}" of "${ast.macro_name}" has invalid value: "${arg_string}", only "0" and "1" are allowed`,
            arg.line, arg.column];
          break;
        }
      }
      if (macro_arg.positive_nonzero_integer) {
        const arg_string = convert_arg_noescape(arg, context);
        const int_value = parseInt(arg_string);
        ast.validation_output[argname]['positive_nonzero_integer'] = int_value;
        if (!Number.isInteger(int_value) || !(int_value > 0)) {
          ast.validation_error = [
            `argument "${argname}" of macro "${ast.macro_name}" must be a positive non-zero integer, got: "${arg_string}"`,
            arg.line, arg.column];
          break;
        }
      }
    }
  }
}
exports.validate_ast = validate_ast;

/**
  * @param {AstNode} target_id_ast
  * @return {String} the href="..." that an \x cross reference to the given target_id_ast
  */
function x_href(target_id_ast, context) {
  let href_path;
  const target_input_path = target_id_ast.input_path;
  let fragment;
  if (
    // The header was included inline into the current file.
    context.include_path_set.has(target_input_path) ||
    // The header is in the current file.
    (target_input_path == context.options.input_path)
  ) {
    href_path = '';
    fragment = remove_toplevel_scope(target_id_ast, context);
  } else {
    href_path = target_input_path;
    if (context.options.html_x_extension) {
      href_path += '.html';
    }
    const file_provider_ret = context.options.file_provider.get(target_input_path);
    if (file_provider_ret === undefined) {
      let message = `file not found on database: "${target_input_path}", needed for topelvel scope removal`;
      render_error(context, message, target_id_ast.line, target_id_ast.column);
      return error_message_in_output(message, context);
    } else {
      if (file_provider_ret.toplevel_id === target_id_ast.id) {
        fragment = target_id_ast.id;
      } else {
        fragment = target_id_ast.id.substr(file_provider_ret.toplevel_scope_cut_length);
      }
    }
  }
  return html_escape_attr(href_path) + '#' + html_escape_attr(fragment);
}
exports.x_href = x_href;

function x_href_attr(target_id_ast, context) {
  return html_attr('href', x_href(target_id_ast, context));
}

/**
 * Calculate the text of a cross reference, or the text
 * that the caption text that cross references can refer to, e.g.
 * "Table 123. My favorite table". Both are done in a single function
 * so that style_full references will show very siimlar to the caption
 * they refer to.
 *
 * @param {Object} options
 * @param {Object} href_prefix rendered string containing the href="..."
 *   part of a link to self to be applied e.g. to <>Figure 1<>, of undefined
 *   if this link should not be given.
 */
function x_text(ast, context, options={}) {
  if (!('caption_prefix_span' in options)) {
    options.caption_prefix_span = true;
  }
  if (!('quote' in options)) {
    options.quote = false;
  }
  if (!('fixed_capitalization' in options)) {
    options.fixed_capitalization = true;
  }
  if (!('href_prefix' in options)) {
    options.href_prefix = undefined;
  }
  if (!('force_separator' in options)) {
    options.force_separator = false;
  }
  if (!('from_x' in options)) {
    options.from_x = false;
  }
  if (!('show_caption_prefix' in options)) {
    options.show_caption_prefix = true;
  }
  const macro = context.macros[ast.macro_name];
  let style_full;
  if ('style_full' in options) {
    style_full = options.style_full;
  } else {
    style_full = macro.options.default_x_style_full;
  }
  let ret = ``;
  let number;
  if (style_full) {
    if (options.href_prefix !== undefined) {
      ret += `<a${options.href_prefix}>`
    }
    if (options.show_caption_prefix) {
      if (options.caption_prefix_span) {
        ret += `<span class="caption-prefix">`;
      }
      ret += `${macro.options.caption_prefix} `;
    }
    number = macro.options.get_number(ast, context);
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
  let title_arg = macro.options.get_title_arg(ast, context);
  if (
    (
      (title_arg !== undefined && style_full) ||
      options.force_separator
    ) &&
    number !== undefined
  ) {
    ret += html_escape_context(context, `. `);
  }
  if (title_arg !== undefined) {
    if (style_full && options.quote) {
      ret += html_escape_context(context, `"`);
    }
    let first_ast = title_arg[0];
    if (
      ast.macro_name === Macro.HEADER_MACRO_NAME &&
      !ast.validation_output.c.boolean &&
      !style_full &&
      options.from_x &&
      first_ast.node_type === AstType.PLAINTEXT
    ) {
      // https://stackoverflow.com/questions/41474986/how-to-clone-a-javascript-es6-class-instance
      title_arg = new AstArgument(title_arg, title_arg.line, title_arg.column);
      title_arg[0] = new PlaintextAstNode(first_ast.line, first_ast.column, first_ast.text);
      let txt = title_arg[0].text;
      let first_c = txt[0];
      if (options.capitalize) {
        first_c = first_c.toUpperCase();
      } else {
        first_c = first_c.toLowerCase();
      }
      title_arg[0].text = first_c + txt.substring(1);
    }
    ret += convert_arg(title_arg, context);
    if (style_full && options.quote) {
      ret += html_escape_context(context, `"`);
    }
  }
  return ret;
}

const END_NAMED_ARGUMENT_CHAR = '}';
const END_POSITIONAL_ARGUMENT_CHAR = ']';
const ESCAPE_CHAR = '\\';
const HTML_ASCII_WHITESPACE = new Set([' ', '\r', '\n', '\f', '\t']);
const ID_SEPARATOR = '-';
const INSANE_LIST_START = '* ';
const INSANE_LIST_INDENT = '  ';
const INSANE_HEADER_CHAR = '=';
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
  INSANE_LIST_START[0],
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
  'INPUT_END',
  'MACRO_NAME',
  'NAMED_ARGUMENT_END',
  'NAMED_ARGUMENT_NAME',
  'NAMED_ARGUMENT_START',
  'PARAGRAPH',
  'PLAINTEXT',
  'POSITIONAL_ARGUMENT_END',
  'POSITIONAL_ARGUMENT_START',
]);
const DEFAULT_MEDIA_HEIGHT = 315;
const MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS = [
  new MacroArgument({
    name: Macro.TITLE_ARGUMENT_NAME,
  }),
  new MacroArgument({
    name: 'description',
  }),
  new MacroArgument({
    name: 'height',
    default: DEFAULT_MEDIA_HEIGHT.toString(),
    positive_nonzero_integer: true,
  }),
  new MacroArgument({
    name: 'provider',
  }),
  new MacroArgument({
    name: 'source',
    elide_link_only: true,
  }),
  new MacroArgument({
    name: 'title_from_src',
    boolean: true,
  }),
  new MacroArgument({
    name: 'width',
    positive_nonzero_integer: true,
  }),
];

/**
 * Calculate a bunch of default parameters of the media from smart defaults if not given explicitly
 *
 * @return {Object}
 *         MediaProviderType {MediaProviderType} , e.g. type, src, source.
 */
function macro_image_video_resolve_params(ast, context) {
  let error_message;
  let media_provider_type;
  let src = convert_arg_noescape(ast.args.src, context);
  let is_url;

  // Provider explicitly given by user on macro.
  if (ast.validation_output.provider.given) {
    const provider_name = convert_arg_noescape(ast.args.provider, context);
    if (MEDIA_PROVIDER_TYPES.has(provider_name)) {
      media_provider_type = provider_name;
    } else {
      error_message = `unknown media provider: "${html_escape_attr(provider_name)}"`;
      render_error(context, error_message, ast.args.provider.line, ast.args.provider.column);
      media_provider_type = 'unknown';
    }
  }

  // Otherwise, detect the media provider.
  let media_provider_type_detected;
  if (src.match(media_provider_type_wikimedia_re)) {
    media_provider_type_detected = 'wikimedia';
  } else if (src.match(media_provider_type_youtube_re)) {
    media_provider_type_detected = 'youtube';
  } else if (protocol_is_known(src)) {
    // Full URL to a website we know nothing about.
    media_provider_type_detected = 'unknown';
  }

  if (media_provider_type_detected === undefined) {
    if (media_provider_type === undefined) {
      // Relative URL, use the default provider if any.
      media_provider_type = context.media_provider_default[ast.macro_name];
    }
    is_url = false;
  } else {
    if (media_provider_type !== undefined && media_provider_type !== media_provider_type_detected) {
      error_message = `detected media provider type "${media_provider_type_detected}", but user also explicitly gave "${media_provider_type}"`;
      render_error(context, error_message, ast.args.provider.line, ast.args.provider.column);
    }
    if (media_provider_type === undefined) {
      media_provider_type = media_provider_type_detected;
    }
    is_url = true;
  }

  // Fixup src depending for certain providers.
  if (media_provider_type === 'local') {
    const path = context.options.cirodown_json['media-providers'].local.path;
    if (path !== '') {
      src = path + URL_SEP + src;
    }
  } else if (media_provider_type === 'github') {
    src = `https://raw.githubusercontent.com/${context.options.cirodown_json['media-providers'].github.remote}/master/${src}`;
  }

  return {
    error_message: error_message,
    media_provider_type: media_provider_type,
    is_url: is_url,
    src: src,
  }
}

function macro_image_video_resolve_params_with_source(ast, context) {
  const ret = macro_image_video_resolve_params(ast, context);
  ret.source = context.macros[ast.macro_name].options.source_func(
    ast, context, ret.src, ret.media_provider_type, ret.is_url);
  return ret;
}

const MACRO_IMAGE_VIDEO_OPTIONS = {
  caption_number_visible: function (ast, context) {
    return 'description' in ast.args ||
      macro_image_video_resolve_params_with_source(ast, context).source !== '';
  },
  get_title_arg: function(ast, context) {
    // Title given explicitly.
    if (ast.validation_output[Macro.TITLE_ARGUMENT_NAME].given) {
      return ast.args[Macro.TITLE_ARGUMENT_NAME];
    }

    // Title from src.
    const media_provider_type = macro_image_video_resolve_params(ast, context).media_provider_type;
    if (
      ast.validation_output.title_from_src.boolean ||
      (
        !ast.validation_output.title_from_src.given &&
        context.options.cirodown_json['media-providers'][media_provider_type]['title-from-src']
      )
    ) {
      let basename_str;
      let src = convert_arg(ast.args.src, context);
      if (media_provider_type === 'local') {
        basename_str = basename(src);
      } else if (media_provider_type === 'wikimedia') {
        basename_str = context.macros[ast.macro_name].options.image_video_basename(src);
      } else {
        basename_str = src;
      }
      let title_str = basename_str.replace(/_/g, ' ').replace(/\.[^.]+$/, '') + '.';
      return new AstArgument([new PlaintextAstNode(
        ast.line, ast.column, title_str)], ast.line, ast.column);
    }

    // We can't automatically generate one at all.
    return undefined;
  }
}
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
// https://cirosantilli.com/cirodown#known-url-protocols
const KNOWN_URL_PROTOCOLS = new Set(['http://', 'https://']);
const URL_SEP = '/';
const MACRO_WITH_MEDIA_PROVIDER = new Set(['image', 'video']);
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
      let href = convert_arg(ast.args.href, context)
      let content = convert_arg(ast.args.content, context);
      if (content === '') {
        content = href;
      }
      let attrs = html_convert_attrs_id(ast, context);
      return `<a${html_attr('href',  href)}${attrs}>${content}</a>`;
    },
    {
      phrasing: true,
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
      let ret = `<div class="code-caption-container"${attrs}>\n`;
      if (ast.validation_output[Macro.TITLE_ARGUMENT_NAME].given) {
        ret += `\n<div class="caption">${x_text(ast, context, {href_prefix: html_self_link(ast, context)})}</div>\n`;
      }
      ret += `<pre><code>${content}</code></pre>`;
      ret += `</div>`;
      return ret;
    },
    {
      caption_prefix: 'Code',
      id_prefix: 'code',
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
      ],
    }
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
      phrasing: true,
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
      macro_counts_ignore: function(ast) { return true; }
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
      macro_counts_ignore: function(ast) { return true; }
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
      phrasing: true,
    }
  ),
  new Macro(
    Macro.HEADER_MACRO_NAME,
    [
      new MacroArgument({
        name: 'level',
        mandatory: true,
        positive_nonzero_integer: true,
      }),
      new MacroArgument({
        name: Macro.TITLE_ARGUMENT_NAME,
      }),
    ],
    function(ast, context) {
      let custom_args;
      let level_int = ast.level;
      let level_int_capped;
      if (level_int > 6) {
        custom_args = {'data-level': new AstArgument([new PlaintextAstNode(
          ast.line, ast.column, level_int.toString())], ast.line, ast.column)};
        level_int_capped = 6;
      } else {
        custom_args = {};
        level_int_capped = level_int;
      }
      let attrs = html_convert_attrs_id(ast, context, [], custom_args);
      let ret = `<h${level_int_capped}${attrs}><a${html_self_link(ast, context)} title="link to this element">`;
      let x_text_options = {
        show_caption_prefix: false,
      };
      x_text_options.style_full = level_int !== context.header_graph_top_level;
      ret += x_text(ast, context, x_text_options);
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
      parent_asts.push(...context.id_provider.get_includes(ast.id, context));
      for (const parent_ast of parent_asts) {
        let parent_href = x_href_attr(parent_ast, context);
        let parent_body = convert_arg(parent_ast.args[Macro.TITLE_ARGUMENT_NAME], context);
        ret += ` | <a${parent_href}>\u2191 parent "${parent_body}"</a>`;
      }
      ret += `</span>`;
      ret += `</h${level_int_capped}>\n`;
      return ret;
    },
    {
      caption_prefix: 'Section',
      id_prefix: '',
      default_x_style_full: false,
      get_number: function(ast, context) {
        let header_tree_node = ast.header_tree_node;
        if (header_tree_node === undefined) {
          return undefined;
        } else {
          return header_tree_node.get_nested_number(context.header_graph_top_level);
        }
      },
      named_args: [
        new MacroArgument({
          name: 'c',
          boolean: true,
        }),
        new MacroArgument({
          name: 'scope',
          boolean: true,
        }),
      ],
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
      macro_counts_ignore: function(ast) { return true; }
    }
  ),
  new Macro(
    Macro.LIST_MACRO_NAME,
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
      let katex_output = html_katex_convert(ast, context);
      let ret = ``;
      if (ast.validation_output.show.boolean) {
        let href = html_attr('href', '#' + html_escape_attr(ast.id));
        ret += `<div class="math-container"${attrs}>`;
        if (Macro.TITLE_ARGUMENT_NAME in ast.args) {
          ret += `<div class="math-caption-container">\n`;
          ret += `<span class="math-caption">${x_text(ast, context, {href_prefix: href})}</span>`;
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
      macro_counts_ignore: function(ast) {
        return !ast.validation_output.show.boolean;
      },
      named_args: [
        new MacroArgument({
          name: Macro.TITLE_ARGUMENT_NAME,
        }),
        new MacroArgument({
          boolean: true,
          default: '1',
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
      return html_katex_convert(ast, context);
    },
    {
      phrasing: true,
    }
  ),
  new Macro(
    'Image',
    MACRO_IMAGE_VIDEO_POSITIONAL_ARGUMENTS,
    macro_image_video_block_convert_function,
    Object.assign(
      {
        caption_prefix: 'Figure',
        image_video_content_func: function (ast, context, src, rendered_attrs, alt, media_provider_type, is_url) {
          return `<a${html_attr('href', src)}><img${html_attr('src',
            html_escape_attr(src))}${html_attr('loading', 'lazy')}${rendered_attrs}${alt}></a>\n`;
        },
        named_args: MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS,
        source_func: function (ast, context, src, media_provider_type, is_url) {
          if ('source' in ast.args) {
            return convert_arg(ast.args.source, context);
          } else if (media_provider_type == 'wikimedia') {
            return macro_image_video_block_convert_function_wikimedia_source_url +
              context.macros[ast.macro_name].options.image_video_basename(src);
          } else {
            return '';
          }
        }
      },
      Object.assign(
        {
          image_video_basename: function(src) {
            return basename(html_escape_attr(src)).replace(
              macro_image_video_block_convert_function_wikimedia_source_image_re, '');
          },
        },
        MACRO_IMAGE_VIDEO_OPTIONS,
      ),
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
      let img_attrs = html_convert_attrs_id(ast, context, ['height', 'width']);
      let {error_message, src} = macro_image_video_resolve_params(ast, context);
      src = html_attr('src', html_escape_attr(src));
      return `<img${src}${img_attrs}${alt}>`;
    },
    {
      named_args: [
        new MacroArgument({
          name: 'height',
          default: DEFAULT_MEDIA_HEIGHT.toString(),
          positive_nonzero_integer: true,
        }),
        new MacroArgument({
          name: 'provider',
        }),
        new MacroArgument({
          name: 'width',
          positive_nonzero_integer: true,
        }),
      ],
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
      phrasing: true,
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
          ret += `<span class="table-caption">${x_text(ast, context, {href_prefix: href})}</span>`;
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
        let content = x_text(target_ast, context, {style_full: true, show_caption_prefix: false});
        let target_id = html_escape_attr(target_ast.id);
        let href = html_attr('href', '#' + target_id);
        let id_to_toc = html_attr(Macro.ID_ARGUMENT_NAME, Macro.TOC_PREFIX + target_id);
        ret += `<li><div${id_to_toc}><a${href}>${content}</a><span>`;

        let toc_href = html_attr('href', '#' + Macro.TOC_PREFIX + target_id);
        ret += ` | <a${toc_href}>${UNICODE_LINK} link</a>`;

        let parent_ast = target_ast.header_tree_node.parent_node.value;
        // Possible on broken h1 level.
        if (parent_ast !== undefined) {
          let parent_href = html_attr('href', '#' + Macro.TOC_PREFIX + parent_ast.id);
          let parent_body = convert_arg(parent_ast.args[Macro.TITLE_ARGUMENT_NAME], context);
          ret += ` | <a${parent_href}>\u2191 parent "${parent_body}"</a>`;
        }

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
        title = new AstArgument([new PlaintextAstNode(ast.line, ast.column, text_title)], ast.column, text_title);
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
      const target_id_ast = context.id_provider.get(target_id, context, ast.header_tree_node);
      let href;
      if (target_id_ast === undefined) {
        if (context.in_title_no_id) {
          href = '';
        } else {
          let message = `cross reference to unknown id: "${target_id}"`;
          render_error(context, message, ast.args.href.line, ast.args.href.column);
          return error_message_in_output(message, context);
        }
      } else {
        href = x_href_attr(target_id_ast, context);
      }
      const content_arg = ast.args.content;
      let content;
      if (content_arg === undefined) {
        // No explicit content given, deduce content from target ID title.
        if (context.in_title_no_id) {
          // Inside a title that does not have an ID: not allowed.
          context.extra_returns.x_no_content_in_title_no_id = true;
          context.extra_returns.x_no_content_in_title_no_id_line = ast.line;
          context.extra_returns.x_no_content_in_title_no_id_column = ast.column;
          context.extra_returns.x_no_content_in_title_no_id_target = target_id;
          return '';
        }
        let x_text_options = {
          caption_prefix_span: false,
          capitalize: ast.validation_output.c.boolean,
          from_x: true,
          quote: true,
        };
        if (ast.validation_output.full.given) {
          x_text_options.style_full = ast.validation_output.full.boolean;
        }
        content = x_text(target_id_ast, context, x_text_options);
        if (content === ``) {
          let message = `empty cross reference body: "${target_id}"`;
          render_error(context, message, ast.line, ast.column);
          return error_message_in_output(message, context);
        }
      } else {
        // Explicit content given, just use it then.
        content = convert_arg(content_arg, context);
      }
      const attrs = html_convert_attrs_id(ast, context);
      return `<a${href}${attrs}>${content}</a>`;
    },
    {
      named_args: [
        new MacroArgument({
          name: 'c',
          boolean: true,
        }),
        new MacroArgument({
          name: 'full',
          boolean: true,
        }),
      ],
      phrasing: true,
    }
  ),
  new Macro(
    'Video',
    MACRO_IMAGE_VIDEO_POSITIONAL_ARGUMENTS,
    macro_image_video_block_convert_function,
    Object.assign(
      {
        caption_prefix: 'Video',
        image_video_basename: function(src) {
          return basename(html_escape_attr(src)).replace(
            macro_image_video_block_convert_function_wikimedia_source_video_re, '$1');
        },
        image_video_content_func: function (ast, context, src, rendered_attrs, alt, media_provider_type, is_url) {
          if (media_provider_type === 'youtube') {
            let url_start_time;
            let video_id;
            if (is_url) {
              const url = new URL(src);
              const url_params = url.searchParams;
              if (url_params.has('t')) {
                url_start_time = url_params.get('t');
              }
              if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') {
                if (url_params.has('v')) {
                  video_id = url_params.get('v')
                } else {
                  let message = `youtube URL without video ID "${src}"`;
                  render_error(context, message, ast.line, ast.column);
                  return error_message_in_output(message, context);
                }
              } else {
                // youtu.be/<ID> and path is "/<ID>" so get rid of "/".
                video_id = url.pathname.substr(1);
              }
            } else {
              video_id = src;
            }
            let start_time;
            if ('start' in ast.args) {
              start_time = ast.validation_output.start.positive_nonzero_integer;
            } else if (url_start_time !== undefined) {
              start_time = html_escape_attr(url_start_time);
            }
            let start;
            if (start_time !== undefined) {
              start = `?start=${start_time}`;
            } else {
              start = '';
            }
            return `<iframe width="560" height="${DEFAULT_MEDIA_HEIGHT}" src="https://www.youtube.com/embed/${html_escape_attr(video_id)}${start}" ` +
                  `allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
          } else {
            let start;
            if ('start' in ast.args) {
              // https://stackoverflow.com/questions/5981427/start-html5-video-at-a-particular-position-when-loading
              start = `#t=${ast.validation_output.start.positive_nonzero_integer}`;
            } else {
              start = '';
            }
            return `<video${html_attr('src', src + start)}${rendered_attrs} controls>${alt}</video>\n`;
          }
        },
        named_args: MACRO_IMAGE_VIDEO_NAMED_ARGUMENTS.concat(
          new MacroArgument({
            name: 'start',
            positive_nonzero_integer: true,
          }),
        ),
        source_func: function (ast, context, src, media_provider_type, is_url) {
          if ('source' in ast.args) {
            return convert_arg(ast.args.source, context);
          } else if (media_provider_type === 'youtube') {
            if (is_url) {
              return html_escape_attr(src);
            } else {
              return `https://youtube.com/watch?v=${html_escape_attr(src)}`;
            }
          } else if (media_provider_type === 'wikimedia') {
            return macro_image_video_block_convert_function_wikimedia_source_url +
              context.macros[ast.macro_name].options.image_video_basename(src);
          } else {
            return '';
          }
        }
      },
      MACRO_IMAGE_VIDEO_OPTIONS,
    ),
  ),
];
