const { INDEX_BASENAME_NOEXT } = require(".")

class OurbigbookEditor {
  constructor(root_elem, initial_content, monaco, ourbigbook, ourbigbook_runtime, options) {
    this.ourbigbook = ourbigbook
    this.ourbigbook_runtime = ourbigbook_runtime
    this.modified = false
    this.monaco = monaco
    this.decorations = []
    if (options === undefined) {
      options = {}
    }
    if (!('convertOptions' in options)) {
      options.convertOptions = {}
    }
    if (!('body_only' in options)) {
      options.convertOptions.body_only = true
    }
    if (!('production' in options)) {
      options.production = true
    }
    if (!('modifyEditorInput' in options)) {
      options.modifyEditorInput = (old) => { return { offset: 0, new: old } }
    }
    this.modifyEditorInput = options.modifyEditorInput
    if (!('onDidChangeModelContentCallback' in options)) {
      options.onDidChangeModelContentCallback = (editor, event) => {}
    }
    if (!('postBuildCallback' in options)) {
      options.postBuildCallback = (extra_returns) => {}
    }
    if (!('scrollPreviewToSourceLineCallback' in options)) {
      options.scrollPreviewToSourceLineCallback = (opts) => {}
    }
    if (!('titleSource' in options)) {
      options.titleSource = undefined
    }
    this.options = options
    this.handleSubmit = this.options.handleSubmit
    this.titleSource = options.titleSource

    // Create input and output elems.
    const input_elem = document.createElement('div');
    input_elem.classList.add('input');
    const output_elem = document.createElement('div');
    this.output_elem = output_elem
    output_elem.classList.add('output');
    output_elem.classList.add('ourbigbook');
    const errors_elem = document.createElement('div');
    this.errors_elem = errors_elem
    errors_elem.classList.add('errors');
    errors_elem.classList.add('ourbigbook-body');
    root_elem.innerHTML = '';
    root_elem.appendChild(input_elem);
    root_elem.appendChild(output_elem);
    root_elem.appendChild(errors_elem);

    monaco.languages.register({ id: 'ourbigbook' });
    // TODO replace with our own tokenizer output:
    // https://github.com/ourbigbook/ourbigbook/issues/106
    monaco.languages.setMonarchTokensProvider('ourbigbook', {
      macroName: /[a-zA-Z0-9_]+/,
      tokenizer: {
        root: [
          [/\\@macroName/, 'macro'],
          [/\\./, 'escape'],

          // Positional arguments.
          [/\[\[\[/, 'literalStart', 'argumentDelimLiteral2'],
          [/\[\[/, 'literalStart', 'argumentDelimLiteral'],
          [/[[\]}]/, 'argumentDelim'],

          // Named arguments.
          [/{{/, 'argumentDelim', 'argumentNameLiteral'],
          [/{/, 'argumentDelim', 'argumentName'],

          [/\$\$\$/, 'literalStart', 'shorthandMath3'],
          [/\$\$/, 'literalStart', 'shorthandMath2'],
          [/\$/, 'literalStart', 'shorthandMath'],

          [/````/, 'literalStart', 'shorthandCode4'],
          [/```/, 'literalStart', 'shorthandCode3'],
          [/``/, 'literalStart', 'shorthandCode2'],
          [/`/, 'literalStart', 'shorthandCode'],

          [/^=+ .*/, 'shorthandHeader'],

          // Shorthand list.
          [/^(  )*\*( |$)/, 'argumentDelim'],
          // Shorthand table.
          [/^(  )*\|\|( |$)/, 'argumentDelim'],
          [/^(  )*\|( |$)/, 'argumentDelim'],
        ],
        argumentDelimLiteral: [
          [/\]\]/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        argumentDelimLiteral2: [
          [/\]\]\]/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        argumentName: [
          [/@macroName/, 'argumentName'],
          [/=/, 'argumentDelim', '@pop'],
          [/}/, 'argumentDelim', '@pop'],
        ],
        // TODO find a way to make content literalInside.
        argumentNameLiteral: [
          [/@macroName/, 'argumentName'],
          [/=/, 'argumentDelim', '@pop'],
          [/}}/, 'argumentDelim', '@pop'],
        ],
        shorthandCode: [
          [/`/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandCode2: [
          [/``/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandCode3: [
          [/```/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandCode4: [
          [/````/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandMath: [
          [/\$/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandMath2: [
          [/\$\$/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        shorthandMath3: [
          [/\$\$\$/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
      }
    });
    monaco.editor.defineTheme('vs-dark-ourbigbook', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'argumentDelim', foreground: 'FFFFFF', fontStyle: 'bold' },
        { token: 'argumentName', foreground: 'FFAAFF', fontStyle: 'bold'},
        { token: 'shorthandHeader', foreground: 'FFFF00', fontStyle: 'bold' },
        { token: 'literalStart', foreground: 'FFFF00', fontStyle: 'bold' },
        { token: 'literalInside', foreground: 'FFFF88' },
        { token: 'macro', foreground: 'FF8800', fontStyle: 'bold' },
      ],
      // This option became mandatory after some update, even if empty, otherwise:
      // Cannot read properties of undefined (reading 'editor.foreground')
      colors: {},
    });
    const editor = monaco.editor.create(
      input_elem,
      {
        // https://stackoverflow.com/questions/47017753/monaco-editor-dynamically-resizable
        automaticLayout: true,
        folding: false,
        language: 'ourbigbook',
        minimap: {enabled: false},
        scrollBeyondLastLine: false,
        theme: 'vs-dark-ourbigbook',
        wordWrap: 'on',
        value: initial_content,
      }
    );
    this.editor = editor
    if (options.initialLine) {
      // https://stackoverflow.com/questions/45123386/scroll-to-line-in-monaco-editor
      editor.revealLineInCenter(options.initialLine)
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      this.handleSubmit()
    })
    editor.onDidChangeModelContent(async (e) => {
      options.onDidChangeModelContentCallback(editor, e)
      this.modified = true
      await this.convertInput()
    });
    editor.onDidScrollChange(e => {
      const range = editor.getVisibleRanges()[0];
      const lineNumber = range.startLineNumber
      // So that the title bar will show on dynamic website
      // when user scrolls to line 1.
      const block = lineNumber === 1 ? 'center' : 'start'
      this.scrollPreviewToSourceLine(lineNumber, block);
    });
    editor.onDidChangeCursorPosition(e => {
      this.scrollPreviewToSourceLine(e.position.lineNumber, 'center');
    });
    this.convertInput();
    this.ourbigbook_runtime(this.output_elem)

    // https://stackoverflow.com/questions/7317273/warn-user-before-leaving-web-page-with-unsaved-changes
    this.beforeunload = (e) => {
      if (this.modified) {
        e.preventDefault()
        return e.returnValue = this.modified;
      }
    }
    window.addEventListener('beforeunload', this.beforeunload)
  }

  async convertInput() {
    let extra_returns = {};
    let ok = true
    try {
      this.modifyEditorInputRet = this.modifyEditorInput(this.titleSource, this.getValue())
      const input = this.modifyEditorInputRet.new

      // Calculate possibly new input path based on conversion. This considers e.g.
      // disambiguate= and id= \H arguments that may have changed.
      let input_path
      const convertOptions = this.options.convertOptions
      const inputPathOrig = convertOptions.input_path
      if (inputPathOrig) {
        const parts = inputPathOrig.split(this.ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
        if (parts.length === 2 && parts[parts.length - 1] === this.ourbigbook.INDEX_BASENAME) {
          input_path = inputPathOrig
        } else {
          const getInputPathConvertOptions = Object.assign({}, convertOptions, {
            h1Only: true,
            splitHeaders: false,
            render: false,
          })
          // Keep only directory of input_path, ignore the basename.
          // The basename can be modified in the editor, but the directory not yet.
          delete getInputPathConvertOptions.input_path
          await this.ourbigbook.convert(
            input,
            getInputPathConvertOptions,
            extra_returns
          )
          input_path = this.ourbigbook.idToScope(inputPathOrig)
          const newId = extra_returns.context.header_tree.children[0].ast.id
          let newBasename
          if (newId) {
            newBasename = newId
          } else {
            newBasename = this.ourbigbook.INDEX_BASENAME_NOEXT
          }
          input_path += this.ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + newBasename + '.' + this.ourbigbook.OURBIGBOOK_EXT
        }
      }

      const convertOptionsCopy = Object.assign({}, convertOptions)
      convertOptionsCopy.input_path = input_path
      this.output_elem.innerHTML = await this.ourbigbook.convert(
        input,
        convertOptionsCopy,
        extra_returns
      )
    } catch(e) {
      // TODO clearly notify user on UI that they found a Ourbigbook crash bug for the current input.
      console.error(e);
      ok = false
      if (!this.options.production) {
        // This shows proper stack traces in the console unlike what is shown on browser for some reason.
        //throw e
      }
    }
    if (ok) {
      // Rebind to newly generated elements.
      this.ourbigbook_runtime(this.output_elem);
      this.line_to_id = extra_returns.context.line_to_id;

      // Error handling.
      this.errors_elem.innerHTML = ''
      if (extra_returns.errors.length) {
        this.errors_elem.classList.add('has-error')
      } else {
        this.errors_elem.classList.remove('has-error')
      }
      if (extra_returns.errors.length) {
        const title = document.createElement('p');
        title.classList.add('title');
        title.innerHTML = '\u2718 Errors';
        this.errors_elem.appendChild(title)
      }
      for (const e of extra_returns.errors) {
        const error_elem = document.createElement('div');
        error_elem.classList.add('error')
        const a = document.createElement('a');
        a.classList.add('loc')
        const line = e.source_location.line - this.modifyEditorInputRet.offset
        a.innerHTML = `Line ${line}`
        a.addEventListener('click', (e) => { this.editor.revealLineNearTop(line) })
        error_elem.appendChild(a)
        error_elem.appendChild(document.createTextNode(`: ${e.message}`))
        this.errors_elem.appendChild(error_elem)
      }
      this.decorations = this.editor.deltaDecorations(
        this.decorations,
        extra_returns.errors.map(e => {
          const line = e.source_location.line - this.modifyEditorInputRet.offset
          return {
            range: new this.monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              linesDecorationsClassName: 'errorDecoration'
            }
          }
        })
      );

      await this.options.postBuildCallback(extra_returns, this)
    }
  }

  dispose() {
    window.removeEventListener('beforeunload', this.beforeunload);
    this.editor.dispose()
  }

  getValue() {
    // TODO use model.setEOL(monaco.editor.EndOfLineSequence.LF) instead of the \r\n.
    // Haven't done yet because lazy to boot into Windows:
    // https://stackoverflow.com/questions/56525822/how-to-set-eol-to-lf-for-windows-so-that-api-gets-value-with-n-not-r-n/74624712#74624712
    // https://github.com/microsoft/monaco-editor/issues/3440
    let ret = this.editor.getValue().replaceAll('\r\n', '\n').replace(/^(\n+)?$/, '')
    if (ret.length) {
      ret = ret.replace(/(\n+)?$/, '\n')
    }
    return ret
  }

  scrollPreviewToSourceLine(line_number, block) {
    const line_number_orig = line_number
    line_number += this.modifyEditorInputRet.offset
    if (block === undefined) {
      block = 'center';
    }
    if (this.line_to_id) {
      // Can fail in case of conversion errors.
      const id = this.line_to_id(line_number);
      if (
        // Possible on empty document.
        id !== ''
      ) {
        // TODO this would be awesome to make the element being targeted red,
        // but it loses editor focus  on new paragraphs (e.g. double newline,
        // making it unusable.
        // window.location.hash = id;
        const elem = document.getElementById(id)
        if (elem) {
          if (line_number_orig === 1) {
            // To show the h1 toplevel.
            this.output_elem.scrollTop = 0
          } else {
            // https://stackoverflow.com/questions/45408920/plain-javascript-scrollintoview-inside-div
            // https://stackoverflow.com/questions/5389527/how-to-get-offset-relative-to-a-specific-parent
            // https://stackoverflow.com/questions/37137450/scroll-all-nested-scrollbars-to-bring-an-html-element-into-view
            function scrollParentToChild(parent, child) {
              const parentRect = parent.getBoundingClientRect();
              const childRect = child.getBoundingClientRect();
              const scrollTop = childRect.top - parentRect.top;
              parent.scrollTop += scrollTop;
            }
            scrollParentToChild(this.output_elem, elem);
          }
        } else {
          console.error(`could not find ID for line ${line_number}: ${id}`);
        }
      };
    }
    this.options.scrollPreviewToSourceLineCallback({ ourbigbook_editor: this, line_number, line_number_orig })
  }

  async setTitleSource(titleSource) {
    this.titleSource = titleSource
    await this.convertInput()
  }
}


if (typeof exports !== 'undefined') {
  exports.OurbigbookEditor = OurbigbookEditor;
}
