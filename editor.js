class OurbigbookEditor {
  constructor(root_elem, initial_content, monaco, ourbigbook, ourbigbook_runtime, options) {
    this.ourbigbook = ourbigbook
    this.ourbigbook_runtime = ourbigbook_runtime
    let modified = false
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
      options.onDidChangeModelContentCallback = (editor) => {}
    }
    this.options = options

    // Create input and output elems.
    const input_elem = document.createElement('div');
    input_elem.classList.add('input');
    const output_elem = document.createElement('div');
    this.output_elem = output_elem
    output_elem.classList.add('output');
    output_elem.classList.add('ourbigbook');
    root_elem.innerHTML = '';
    root_elem.appendChild(input_elem);
    root_elem.appendChild(output_elem);

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
      options.onDidChangeModelContentCallback(editor)
      modified = true
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
    this.beforeunload = function (e) {
      if (modified) {
        e.preventDefault()
        return e.returnValue = modified;
      }
    }
    window.addEventListener('beforeunload', this.beforeunload)
  }

  async convertInput() {
    let extra_returns = {};
    let ok = true
    try {
      this.modifyEditorInputRet = this.modifyEditorInput(this.editor.getValue())
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
    }
  }

  dispose() {
    window.removeEventListener('beforeunload', this.beforeunload);
    this.editor.dispose()
  }

  getValue() { return this.editor.getValue() }

  scrollPreviewToSourceLine(line_number, block) {
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
          elem.scrollIntoView({
            behavior: 'smooth',
            block: block,
          });
        } else {
          console.error(`could not find ID for line ${line_number}: ${id}`);
        }
      };
    }
  }

  async setModifyEditorInput(modifyEditorInput) {
    this.modifyEditorInput = modifyEditorInput
    await this.convertInput()
  }
}


if (typeof exports !== 'undefined') {
  exports.OurbigbookEditor = OurbigbookEditor;
}
