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
      options.modifyEditorInput = (titleSource, bodySource) => ({ offset: 0, new: bodySource })
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
    const panes = document.createElement('div')
    panes.className = 'editor-panes'
    panes.appendChild(input_elem);
    panes.appendChild(output_elem);
    panes.appendChild(errors_elem);
    root_elem.appendChild(panes)

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
        wordBasedSuggestions: false,
        wordWrap: 'on',
        value: initial_content,
      }
    );
    this.editor = editor
    // Monaco has no public suggestion-width option. Change its default through the
    // widget's layout info so viewport clamping and manual resizing still work.
    const suggestWidget = editor.getContribution?.('editor.contrib.suggestController')?.widget?.value
    if (suggestWidget?.getLayoutInfo) {
      const getLayoutInfo = suggestWidget.getLayoutInfo.bind(suggestWidget)
      suggestWidget.getLayoutInfo = () => {
        const info = getLayoutInfo()
        return { ...info, defaultSize: info.defaultSize.with(640) }
      }
    }
    this.completionProvider = monaco.languages.registerCompletionItemProvider('ourbigbook', {
      triggerCharacters: ['<', '=', '[', '@', '/'],
      provideCompletionItems: async (model, position, context, token) => {
        if (model !== editor.getModel()) return
        const line = model.getLineContent(position.lineNumber)
        const completion = ourbigbook.getIdCompletionContext(line.slice(0, position.column - 1))
        if (!completion) return
        // Monaco can keep this request alive while the user types, then request
        // updated incomplete results. Dropping it on a version change loses that
        // completion session, especially when typing during the debounce below.
        const stale = () => this.disposed || token.isCancellationRequested || model.isDisposed()
        const items = await this.getIdSuggestions(completion, position, stale)
        if (!items) return
        const closeIndex = line.indexOf(completion.close, position.column - 1)
        const range = new monaco.Range(position.lineNumber, completion.start + 1,
          position.lineNumber, closeIndex < 0 ? position.column : closeIndex + 2)
        return {
          incomplete: true,
          suggestions: items.map((item, i) => ({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: item.reference + completion.close,
            filterText: completion.raw + ' ' + item.id,
            sortText: String(i).padStart(3, '0'),
            range,
          })),
        }
      },
    })
    this.toolbar_elem = createEditorToolbar(this, root_elem.ownerDocument)
    root_elem.insertBefore(this.toolbar_elem, panes)
    if (options.initialLine) {
      // https://stackoverflow.com/questions/45123386/scroll-to-line-in-monaco-editor
      editor.revealLineInCenter(options.initialLine)
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (this.handleSubmit) this.handleSubmit()
    })
    editor.onDidChangeModelContent(async (e) => {
      if (this.disposed) return
      options.onDidChangeModelContentCallback(editor, e)
      this.modified = true
      await this.convertInput()
    });
    editor.onDidScrollChange(e => {
      if (this.disposed) return
      const range = editor.getVisibleRanges()[0];
      if (!range) return
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

    // https://github.com/cirosantilli/cirosantilli.github.io/issues/200
    // https://stackoverflow.com/questions/7317273/warn-user-before-leaving-web-page-with-unsaved-changes
    this.beforeunload = (e) => {
      if (this.modified) {
        e.preventDefault()
        return e.returnValue = this.modified;
      }
    }
    window.addEventListener('beforeunload', this.beforeunload)
  }

  // Shared by inline completion and the cross-reference search dialog.
  async getIdSuggestions(completion, position, stale = () => this.disposed) {
    const options = this.options
    const prefix = options.idCompletionPrefix || options.convertOptions.ref_prefix
    const localId = id => id === prefix ? '/' : prefix && id.startsWith(`${prefix}/`) ? id.slice(prefix.length + 1) : id
    const query = completion.query.replace(/^\//, '')
    const explicitUser = query.startsWith('@')
    const matches = id => (explicitUser || !prefix || id === prefix || id.startsWith(`${prefix}/`)) &&
      (explicitUser ? id : localId(id)).includes(query)
    let ids = Object.keys(this.completionIds || {}).filter(matches)
    const titles = { ...this.completionTitles }
    if (options.getIdCompletions) {
      // Incomplete suggestions are requested again as the user types. Avoid a request per keystroke.
      await new Promise(resolve => setTimeout(resolve, 150))
      if (stale()) return
      try {
        for (const { id, title } of await options.getIdCompletions(query)) {
          ids.push(id)
          // Prefer the title from the current draft over a saved version.
          if (!(id in titles)) titles[id] = title
        }
      } catch (error) {
        // Keep local suggestions usable when the server is unavailable.
      }
    }
    if (stale()) return
    ids = [...new Set(ids)].filter(matches)
    const rank = id => (explicitUser ? id : localId(id)).startsWith(query) ? 0 : 1
    ids.sort((a, b) => rank(a) - rank(b) || a.length - b.length || a.localeCompare(b))
    const referencePrefix = options.convertOptions.ref_prefix
    const sourceLine = position.lineNumber + (this.modifyEditorInputRet?.offset || 0)
    let header
    const findHeader = node => {
      for (const child of node?.children || []) {
        if (child.ast.source_location.line <= sourceLine) {
          if (!header || child.ast.source_location.line >= header.source_location.line) header = child.ast
          findHeader(child)
        }
      }
    }
    findHeader(this.lastHeaderTree)
    const scope = header?.calculate_scope()
    const absolute = completion.raw.startsWith('/') || (scope && scope !== referencePrefix)
    const referenceId = id => {
      if (referencePrefix && id.startsWith(`${referencePrefix}/`)) id = id.slice(referencePrefix.length + 1)
      return (absolute && !id.startsWith('@') ? '/' : '') + id
    }
    return ids.slice(0, 100).map(id => ({
      id,
      label: (explicitUser ? id : localId(id)) + (titles[id] ? ` | ${titles[id]}` : ''),
      reference: referenceId(id),
    }))
  }

  async convertInput() {
    if (this.disposed) return
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
          if (this.disposed) return
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
      // Keep the exact input and calculated path used by the latest successful
      // preview conversion. The web article creator uses these to run the same
      // split_headers conversion as the CLI uploader when it is submitted.
      this.lastInput = input
      this.lastInputPath = input_path
      const output = await this.ourbigbook.convert(
        input,
        convertOptionsCopy,
        extra_returns
      )
      if (this.disposed) return
      this.output_elem.innerHTML = output
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
      this.completionIds = extra_returns.ids
      const completionContext = this.ourbigbook.convertInitContext({ output_format: this.ourbigbook.OUTPUT_FORMAT_ID })
      this.completionTitles = Object.fromEntries(Object.entries(this.completionIds).map(([id, ast]) =>
        [id, this.ourbigbook.getIdCompletionTitle(ast, completionContext)]))
      this.lastHeaderTree = extra_returns.context.header_tree
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
    if (this.disposed) return
    this.disposed = true
    this.closeXrefDialog?.()
    this.completionProvider.dispose()
    this.setToolbarDisabled(true)
    window.removeEventListener('beforeunload', this.beforeunload);
    this.editor.dispose()
  }

  setToolbarDisabled(disabled) {
    for (const control of this.toolbar_elem.querySelectorAll('button, select')) {
      control.disabled = disabled
    }
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
    if (this.disposed || !this.modifyEditorInputRet) return
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
        }
        // A cursor event can arrive after the source changed but before its
        // asynchronous preview conversion completed. In that normal case the
        // new ID is not in the old preview DOM yet, so there is nothing to do.
      };
    }
    this.options.scrollPreviewToSourceLineCallback({ ourbigbook_editor: this, line_number, line_number_orig })
  }

  async setTitleSource(titleSource) {
    this.titleSource = titleSource
    await this.convertInput()
  }

  openXrefDialog() {
    if (this.disposed || this.closeXrefDialog) return
    const { editor } = this
    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection) return
    const version = model.getVersionId()
    const doc = this.toolbar_elem.ownerDocument
    const dialog = doc.createElement('dialog')
    dialog.className = 'editor-xref-dialog'
    dialog.setAttribute('aria-label', 'Insert cross-reference')
    const form = doc.createElement('form')
    const title = doc.createElement('h2')
    title.textContent = 'Insert cross-reference'
    const label = doc.createElement('label')
    label.textContent = 'Search IDs'
    const input = doc.createElement('input')
    input.type = 'text'
    input.autocomplete = 'off'
    input.placeholder = 'Search by ID, or @username/id'
    input.value = model.getValueInRange(selection).trim().replace(/^<([^<>]+)>$/, '$1').replace(/\s+/g, ' ')
    label.appendChild(input)
    const status = doc.createElement('p')
    status.setAttribute('role', 'status')
    const results = doc.createElement('select')
    results.size = 8
    results.setAttribute('aria-label', 'Matching cross-references')
    const actions = doc.createElement('div')
    actions.className = 'editor-xref-actions'
    const cancel = doc.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    const insert = doc.createElement('button')
    insert.type = 'submit'
    insert.textContent = 'Insert'
    insert.disabled = true
    actions.append(cancel, insert)
    form.append(title, label, status, results, actions)
    dialog.appendChild(form)
    this.toolbar_elem.parentNode.appendChild(dialog)
    let closed = false
    let request = 0
    let items = []
    const close = () => {
      if (closed) return
      closed = true
      if (dialog.open) dialog.close()
      dialog.remove()
      this.closeXrefDialog = undefined
      if (!this.disposed) editor.focus()
    }
    this.closeXrefDialog = close
    dialog.addEventListener('cancel', event => { event.preventDefault(); close() })
    dialog.addEventListener('close', close)
    cancel.addEventListener('click', close)
    const search = async () => {
      const currentRequest = ++request
      const stale = () => closed || this.disposed || currentRequest !== request
      items = []
      results.innerHTML = ''
      results.disabled = true
      insert.disabled = true
      status.textContent = 'Searching…'
      const completion = this.ourbigbook.getIdCompletionContext('<' + input.value)
      const matches = completion ? await this.getIdSuggestions(completion, selection.getStartPosition(), stale) : []
      if (stale()) return
      items = matches || []
      for (const [i, item] of items.entries()) {
        const option = doc.createElement('option')
        option.value = String(i)
        option.textContent = item.label
        results.appendChild(option)
      }
      results.selectedIndex = items.length ? 0 : -1
      results.disabled = insert.disabled = items.length === 0
      status.textContent = items.length ? `${items.length} results` : 'No matching IDs.'
    }
    input.addEventListener('input', search)
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && items.length) {
        event.preventDefault()
        results.focus()
      }
    })
    results.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); form.requestSubmit() }
    })
    results.addEventListener('dblclick', () => form.requestSubmit())
    form.addEventListener('submit', event => {
      event.preventDefault()
      const item = items[results.selectedIndex]
      if (closed || this.disposed || insert.disabled || !item) return
      if (model !== editor.getModel() || model.getVersionId() !== version) {
        status.textContent = 'The document changed. Close this dialog and try again.'
        insert.disabled = true
        return
      }
      close()
      editor.setSelection(selection)
      applyEditorMarkup(this, 'xref', { xrefTarget: item.reference })
    })
    dialog.showModal()
    input.focus()
    search()
  }
}


// Source edits for the shared editor toolbar. Offsets refer to the original Monaco model.
// Keep this independent of the DOM so the generated markup can be tested with the converter.
function isWrapped(text, open) {
  if (!text.startsWith(open)) return false
  let depth = 1
  for (let i = open.length; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '[') depth++
    else if (text[i] === ']' && --depth === 0) return i === text.length - 1
  }
  return false
}

function getMarkupEdit(action, value, start, end, options={}) {
  const eol = value.includes('\r\n') ? '\r\n' : '\n'
  const selected = value.slice(start, end)
  const edit = (text, from=0, to=text.length) => ({
    start, end, text, selectionStart: start + from, selectionEnd: start + to,
  })
  const wrap = (before, content, after) => edit(before + content + after, before.length, before.length + content.length)

  if (action === 'bold' || action === 'italic') {
    const open = action === 'bold' ? '\\b[' : '\\i['
    if (start !== end && value.slice(start - open.length, start) === open && value[end] === ']') {
      start -= open.length
      end++
      return edit(selected)
    }
    if (!selected) return wrap(open, action === 'bold' ? 'bold text' : 'italic text', ']')
    // Format each line separately: inline macros cannot contain paragraphs or list items.
    const lines = selected.split(eol).map(line => line.match(/^([ \t]*(?:(?:\*|>|\|\|?|={1,6}) )?)(.*?)([ \t]*)$/))
    const remove = lines.filter(parts => parts[2]).every(parts => isWrapped(parts[2], open))
    const text = lines.map(([, prefix, content, suffix]) => prefix + (content
      ? remove ? content.slice(open.length, -1) : open + content + ']'
      : '') + suffix).join(eol)
    if (lines.length === 1 && !remove && lines[0][2]) {
      const from = lines[0][1].length + open.length
      return edit(text, from, from + lines[0][2].length)
    }
    return edit(text)
  }

  if (action === 'link') {
    if (/^https?:\/\/\S+$/i.test(selected)) {
      const url = selected.replace(/[\\[\]{}]/g, '\\$&')
      return wrap(`${url}[`, 'link text', ']')
    }
    const url = 'http://example.com'
    return edit(`${url}[${selected || 'link text'}]`, 0, url.length)
  }

  if (action === 'xref') {
    const target = options.xrefTarget.replace(/[\\[\]{}<>]/g, '\\$&')
    const text = selected && !/^<[^<>]+>$/.test(selected)
      ? `\\x[${target}][${selected}]` : `<${target}>`
    return edit(text, text.length, text.length)
  }

  if ((action === 'code' || action === 'math') && !selected.includes('\n')) {
    const math = action === 'math'
    const content = selected || (math ? 'x^2' : 'code')
    const delimiter = math ? '$' : '`'
    if (!content.includes(delimiter)) return wrap(delimiter, content, delimiter)
    // Literal arguments preserve embedded delimiters, brackets and backslashes.
    const brackets = Math.max(2, ...Array.from(content.matchAll(/[\[\]]+/g), match => match[0].length + 1))
    return wrap((math ? '\\m' : '\\c') + '['.repeat(brackets) + eol, content, eol + ']'.repeat(brackets))
  }

  // Most block actions affect whole touched lines. A selection ending at column 1
  // belongs to the preceding line, as with Monaco's built-in indentation commands.
  const originalStart = start
  const originalEnd = end
  if (action !== 'image' && (action !== 'table' || start !== end)) {
    start = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1
    if (end > originalStart && value[end - 1] === '\n') end -= eol.length
    const nextLine = value.indexOf('\n', end)
    end = nextLine < 0 ? value.length : nextLine - (value[nextLine - 1] === '\r' ? 1 : 0)
  }
  const content = value.slice(start, end)
  const lines = content.split(eol)
  const block = (text, from=0, to=text.length) => {
    const before = value.slice(0, start)
    const after = value.slice(end)
    const prefix = !before || before.endsWith(eol + eol) ? '' : before.endsWith(eol) ? eol : eol + eol
    const suffix = !after || after.startsWith(eol + eol) ? '' : after.startsWith(eol) ? eol : eol + eol
    return edit(prefix + text + suffix, prefix.length + from, prefix.length + to)
  }

  if (action === 'image') {
    if (options.imageSource !== undefined) {
      const source = options.imageSource.replace(/[\\[\]{}]/g, '\\$&')
      const text = `\\Image[${source}]`
      return block(text, text.length)
    }
    const isUrl = /^https?:\/\/\S+$/i.test(selected)
    const url = isUrl ? selected.replace(/[\\[\]{}]/g, '\\$&') : 'http://example.com/image.jpg'
    const title = isUrl ? 'Image title' : selected || 'Image title'
    const open = '\\Image['
    const before = `${open}${url}]${eol}{title=`
    const from = isUrl ? before.length : open.length
    return block(before + title + '}', from, from + (isUrl ? title.length : url.length))
  }

  if (action === 'indent' || action === 'outdent') {
    const text = lines.map(line => action === 'indent' ? '  ' + line : line.replace(/^(?: {1,2}|\t)/, '')).join(eol)
    if (originalStart === originalEnd) {
      const removed = lines[0].length - text.length
      const cursor = Math.max(0, originalStart - start - removed)
      return edit(text, cursor, cursor)
    }
    return edit(text)
  }

  if (action === 'bullet-list' || action === 'numbered-list') {
    const hasContent = content.trim().length > 0
    const remove = action === 'bullet-list' && hasContent && lines.filter(line => line.trim()).every(line => /^ *\* /.test(line))
    const items = hasContent ? lines.map(line => {
      if (!line.trim()) return line
      if (remove) return line.replace(/^( *)\* /, '$1')
      return /^ *\* /.test(line) ? line : line.replace(/^( *)(.*)$/, '$1* $2')
    }).join(eol) : '* List item'
    if (action === 'numbered-list') {
      const before = '\\Ol[' + eol
      return block(before + items + eol + ']', before.length + (hasContent ? 0 : 2), before.length + items.length)
    }
    return block(items, hasContent ? 0 : 2)
  }

  if (action === 'quote') {
    const body = content || 'Quoted text'
    const text = body.split(eol).map((line, i) => i === 0 ? '> ' + line : line ? '  ' + line : '').join(eol)
    return block(text, 2)
  }

  if (['code', 'code-block', 'math', 'math-block'].includes(action)) {
    const math = action === 'math' || action === 'math-block'
    const body = content || (math ? '\\frac{a}{b}' : 'Code goes here')
    const fence = (math ? '$' : '`').repeat(Math.max(2, ...Array.from(body.matchAll(math ? /\$+/g : /`+/g), match => match[0].length + 1)))
    return block(fence + eol + body + eol + fence, fence.length + eol.length, fence.length + eol.length + body.length)
  }

  if (action === 'table') {
    const rows = content.trim() ? lines.filter(line => line.trim()).map(line => line.split('\t')) : [
      ['Heading 1', 'Heading 2'],
      ['Cell 1', 'Cell 2'],
    ]
    const columns = Math.max(...rows.map(row => row.length))
    const text = rows.map((row, i) => Array.from({ length: columns }, (_, j) =>
      `${i === 0 ? '||' : '|'} ${row[j] || ''}`
    ).join(eol)).join(eol + eol)
    return block(text, 3, 3 + rows[0][0].length)
  }

  if (/^heading-[1-6]$/.test(action)) {
    const prefix = '='.repeat(Number(action.slice(-1))) + ' '
    const text = content.trim() ? lines.filter(line => line.trim()).map(line =>
      prefix + line.trim().replace(/^={1,6} +/, '')
    ).join(eol + eol) : prefix + 'Heading'
    return block(text, prefix.length)
  }

  throw new Error(`Unknown editor markup action: ${action}`)
}

function applyEditorMarkup(ourbigbookEditor, action, options={}) {
  const { editor, monaco } = ourbigbookEditor
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return
  const edit = getMarkupEdit(action, model.getValue(),
    model.getOffsetAt(selection.getStartPosition()), model.getOffsetAt(selection.getEndPosition()), options)
  const start = model.getPositionAt(edit.start)
  const end = model.getPositionAt(edit.end)
  editor.pushUndoStop()
  editor.executeEdits('ourbigbook-toolbar', [{
    range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
    text: edit.text,
  }], () => {
    const from = model.getPositionAt(edit.selectionStart)
    const to = model.getPositionAt(edit.selectionEnd)
    return [new monaco.Selection(from.lineNumber, from.column, to.lineNumber, to.column)]
  })
  editor.pushUndoStop()
  editor.focus()
  editor.revealRangeInCenterIfOutsideViewport(editor.getSelection())
}


function createEditorToolbar(ourbigbookEditor, doc=document) {
  const toolbar = doc.createElement('div')
  toolbar.className = 'editor-toolbar'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', 'Text formatting')
  const groups = [
    [
      ['bold', 'B', 'Bold — format selected text', 'b'],
      ['italic', 'I', 'Italic — format selected text', 'i'],
      ['link', '🔗 Link', 'Link — use selected text or URL'],
      ['xref', '↗ Cross-reference', 'Link to an internal ID'],
      ['code', '</> Inline code', 'Inline code — format selected text'],
      ['code-block', '{ } Code block', 'Code block — format selected lines'],
    ],
    [
      ['math', 'x² Inline math', 'Inline math — format selected LaTeX'],
      ['math-block', '∑ Block math', 'Block math — format selected LaTeX lines'],
    ],
    [
      ['bullet-list', '• List', 'Bullet list — toggle bullets on selected lines'],
      ['numbered-list', '1. List', 'Numbered list — turn selected lines into items'],
      ['quote', 'Quote', 'Quote — quote selected lines'],
      ['table', 'Table', 'Table — turn selected lines into rows and tabs into columns; first row is headings'],
      ['image', '🖼 Image', 'Insert a block image'],
    ],
    [
      ['outdent', '←', 'Decrease indentation by two spaces'],
      ['indent', '→', 'Increase indentation by two spaces'],
    ],
  ]
  const groupElement = () => {
    const group = doc.createElement('div')
    group.className = 'editor-toolbar-group'
    toolbar.appendChild(group)
    return group
  }
  for (const group of groups) {
    const element = groupElement()
    for (const [action, label, title, tag] of group) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.title = title
      button.setAttribute('aria-label', title)
      button.setAttribute('data-action', action)
      const content = tag ? doc.createElement(tag) : button
      content.textContent = label
      if (tag) button.appendChild(content)
      button.addEventListener('mousedown', event => event.preventDefault())
      button.addEventListener('click', () => {
        if (!button.disabled) {
          if (action === 'image' && ourbigbookEditor.options.onImage) ourbigbookEditor.options.onImage(ourbigbookEditor)
          else if (action === 'xref') ourbigbookEditor.openXrefDialog()
          else applyEditorMarkup(ourbigbookEditor, action)
        }
      })
      element.appendChild(button)
    }
  }
  const levels = ourbigbookEditor.options.toolbarHeaderLevels || [1, 2, 3, 4, 5, 6]
  if (levels.length) {
    const select = doc.createElement('select')
    select.setAttribute('aria-label', 'Insert heading')
    select.title = 'Turn the current line or selected lines into headings'
    const placeholder = doc.createElement('option')
    placeholder.textContent = 'Heading'
    placeholder.value = ''
    placeholder.disabled = true
    placeholder.selected = true
    select.appendChild(placeholder)
    for (const level of levels) {
      const option = doc.createElement('option')
      option.value = `heading-${level}`
      option.textContent = `Heading ${level}`
      select.appendChild(option)
    }
    select.addEventListener('change', () => {
      if (!select.disabled && select.value) applyEditorMarkup(ourbigbookEditor, select.value)
      select.value = ''
    })
    groupElement().appendChild(select)
  }
  toolbar.addEventListener('keydown', event => {
    if (event.target.tagName === 'SELECT') return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const controls = Array.from(toolbar.querySelectorAll('button:enabled, select:enabled'))
    const index = controls.indexOf(event.target)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length
    controls[next].focus()
  })
  return toolbar
}

if (typeof exports !== 'undefined') {
  exports.OurbigbookEditor = OurbigbookEditor;
  exports.getMarkupEdit = getMarkupEdit
  exports.applyEditorMarkup = applyEditorMarkup
}
