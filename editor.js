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
    this.options = options

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
    root_elem.innerHTML = '';
    root_elem.appendChild(input_elem);
    root_elem.appendChild(output_elem);
    root_elem.appendChild(errors_elem);

    monaco.languages.register({ id: 'ourbigbook' });
    // TODO replace with our own tokenizer output:
    // https://github.com/cirosantilli/ourbigbook/issues/106
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

          [/\$\$\$/, 'literalStart', 'insaneMath3'],
          [/\$\$/, 'literalStart', 'insaneMath2'],
          [/\$/, 'literalStart', 'insaneMath'],

          [/````/, 'literalStart', 'insaneCode4'],
          [/```/, 'literalStart', 'insaneCode3'],
          [/``/, 'literalStart', 'insaneCode2'],
          [/`/, 'literalStart', 'insaneCode'],

          [/^=+ .*/, 'insaneHeader'],

          // Insane list.
          [/^(  )*\*( |$)/, 'argumentDelim'],
          // Insane table.
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
        insaneCode: [
          [/`/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneCode2: [
          [/``/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneCode3: [
          [/```/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneCode4: [
          [/````/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneMath: [
          [/\$/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneMath2: [
          [/\$\$/, 'literalStart', '@pop'],
          [/./, 'literalInside'],
        ],
        insaneMath3: [
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
        { token: 'insaneHeader', foreground: 'FFFF00', fontStyle: 'bold' },
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
      options.handleSubmit();
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

    this.beforeunload = (e) => {
      if (this.modified) {
        e.preventDefault()
        return e.returnValue = this.modified;
      }
    }
    window.addEventListener('beforeunload', this.beforeunload)
  }

  // https://stackoverflow.com/questions/7317273/warn-user-before-leaving-web-page-with-unsaved-changes

  async convertInput() {
    let extra_returns = {};
    let ok = true
    try {
      this.modifyEditorInputRet = this.modifyEditorInput(this.getValue())
      this.output_elem.innerHTML = await this.ourbigbook.convert(
        this.modifyEditorInputRet.new,
        this.options.convertOptions,
        extra_returns
      );
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

      this.options.postBuildCallback(extra_returns)
    }
  }

  dispose() {
    window.removeEventListener('beforeunload', this.beforeunload);
    this.editor.dispose()
  }

  getValue() {
    // TODO I don't know how to do this more nicely and reliably e.g. with setEOL:
    // https://github.com/microsoft/monaco-editor/issues/3440
    // https://stackoverflow.com/questions/56525822/how-to-set-eol-to-lf-for-windows-so-that-api-gets-value-with-n-not-r-n/74624712#74624712
    return this.editor.getValue().replaceAll('\r\n', '\n')
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

  async setModifyEditorInput(modifyEditorInput) {
    this.modifyEditorInput = modifyEditorInput
    await this.convertInput()
  }
}


if (typeof exports !== 'undefined') {
  exports.OurbigbookEditor = OurbigbookEditor;
}
