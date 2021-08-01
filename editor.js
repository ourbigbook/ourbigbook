function cirodown_editor(input_elem, output_elem, initial_content, monaco, cirodown) {
  monaco.languages.register({ id: 'cirodown' });
  // TODO replace with our own tokenizer output:
  // https://github.com/cirosantilli/cirodown/issues/106
  monaco.languages.setMonarchTokensProvider('cirodown', {
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
  monaco.editor.defineTheme('vs-dark-cirodown', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'argumentDelim', foreground: 'FFFFFF', fontStyle: 'bold' },
      { token: 'argumentName', foreground: 'FFAAFF', fontStyle: 'bold'},
      { token: 'insaneHeader', foreground: 'FFFF00', fontStyle: 'bold' },
      { token: 'literalStart', foreground: 'FFFF00', fontStyle: 'bold' },
      { token: 'literalInside', foreground: 'FFFF88' },
      { token: 'macro', foreground: 'FF8800', fontStyle: 'bold' },
    ]
  });
  const editor = monaco.editor.create(
    input_elem,
    {
      // https://stackoverflow.com/questions/47017753/monaco-editor-dynamically-resizable
      automaticLayout: true,
      folding: false,
      language: 'cirodown',
      minimap: {enabled: false},
      scrollBeyondLastLine: false,
      theme: 'vs-dark-cirodown',
      wordWrap: 'on',
      value: initial_content,
    }
  );
  editor.onDidChangeModelContent(e => {
    convert_input();
  });
  editor.onDidScrollChange(e => {
    const range = editor.getVisibleRanges()[0];
    scroll_preview_to_source_line(range.startLineNumber, 'start');
  });
  editor.onDidChangeCursorPosition(e => {
    scroll_preview_to_source_line(e.position.lineNumber, 'center');
  });
  let line_to_id;
  function convert_input() {
    let extra_returns = {};
    output_elem.innerHTML = cirodown.convert(
      editor.getValue(),
      {'body_only': true},
      extra_returns
    );
    // Rebind to newly generated elements.
    cirodown_runtime.cirodown_runtime(output_elem);
    line_to_id = extra_returns.context.line_to_id;
  }
  function scroll_preview_to_source_line(line_number, block) {
    if (block === undefined) {
      block = 'center';
    }
    const id = line_to_id(line_number);
    if (
      // Possible on empty document.
      id !== undefined
    ) {
      // TODO this would be awesome to make the element being targeted red,
      // but it loses editor focus  on new paragraphs (e.g. double newline,
      // making it unusable.
      // window.location.hash = id;
      document.getElementById(id).scrollIntoView({
        behavior: 'smooth',
        block: block,
      });
    };
  }
  convert_input();
  cirodown_runtime.cirodown_runtime(output_elem)
}
