import path from 'path'
import child_process from 'child_process'
import { Readable } from 'stream'

import * as vscode from 'vscode'

const open = require('open')

const ourbigbook = require('ourbigbook')
const { OURBIGBOOK_EXT } = ourbigbook

const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

const SHORTHAND_HEADER_START_REGEXP = new RegExp(`^${ourbigbook.SHORTHAND_HEADER_CHAR}+ `)
const MAX_IDS = 100
const OURBIGBOOK_LANGUAGE_ID = 'ourbigbook'

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/** Gets the path to the ourbigbook inside the extension.
 * Returns the correct path, but that executable is not very portable because
 * because of difficulties with native dependencies such as sqlite3.
 * https://github.com/ourbigbook/ourbigbook/issues/318
 */
function getOurbigbookExecPath(): string {
  return path.join(path.dirname(require.resolve('ourbigbook')), 'ourbigbook')
}

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context: vscode.ExtensionContext) {
  // State.
  const channel = vscode.window.createOutputChannel('OurBigBook', 'ourbigbook')
  let ourbigbookJsonDir: string|undefined
  let sequelize: any
  let dbProvider: any
  let renderContext: any

  // Sanity checks.
  channel.appendLine('activate OutputChannel.appendLine')
  channel.appendLine(`process.cwd=${process.cwd()}`)
  channel.appendLine(`require.resolve('ourbigbook')=${require.resolve('ourbigbook')}`)
  console.log('ourbigbook.activate log')

  // Functions

  function getOurbigbookJsonDir(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders
    let curdir
    const editor = vscode.window.activeTextEditor
    if (editor) {
      curdir = path.dirname(editor.document.fileName)
    } else if (workspaceFolders) {
      curdir = workspaceFolders[0].uri.path
    }
    channel.appendLine(`getOurbigbookJsonDir curdir=${curdir}`)
    if (curdir) {
      return ourbigbook_nodejs_webpack_safe.findOurbigbookJsonDir(curdir)
    }
  }

  async function runTask(
    cmd: string,
    args: string[],
    cb?: ((ourbigbookjsonDir: string|undefined) => void)
  ): Promise<number|undefined> {
    // Also worked, but worse user experience.
    // With task:
    // - auto pops up terminal
    // - user can Ctrl+Click to go to error message
    //import child_process from 'child_process'
    //import { Readable } from 'stream'
    //function buildHandleStdout(stdout: Readable) {
    //    stdout.setEncoding('utf8')
    //    stdout.on('data', function(data: string) {
    //      for (const line of data.split('\n')) {
    //        if (line) {
    //          channel.appendLine('build: ' + line.replace(/(\n)$/m, ''))
    //        }
    //      }
    //    })
    //}
    //const p = child_process.spawn(getOurbigbookExecPath(), ['.'], { cwd: getOurbigbookJsonDir() })
    //buildHandleStdout(p.stdout)
    //buildHandleStdout(p.stderr)

    // Save any unsaved changes.
    const editor = vscode.window.activeTextEditor
    if (editor) {
      editor.document.save()
    }

    // build task
    const quotingStyle: vscode.ShellQuoting = vscode.ShellQuoting.Strong
    let myTaskCommand: vscode.ShellQuotedString = {
      value: cmd,
      quoting: quotingStyle,
    }
    let myTaskArgs: vscode.ShellQuotedString[] = args.map((arg) => {
      return { value: arg, quoting: quotingStyle }
    })
    const ourbigbookJsonDir = getOurbigbookJsonDir()
    let myTaskOptions: vscode.ShellExecutionOptions = {
      cwd: ourbigbookJsonDir,
    }
    let shellExec: vscode.ShellExecution = new vscode.ShellExecution(
      myTaskCommand,
      myTaskArgs,
      myTaskOptions
    )
    const taskName = 'build'
    let myTask: vscode.Task = new vscode.Task(
      { type: "shell", group: "build", label: taskName },
      vscode.TaskScope.Workspace,
      taskName,
      'makefile',
      shellExec
    )
    myTask.presentationOptions.clear = true
    myTask.presentationOptions.showReuseMessage = true
    // This allows us to wait for the task to complete.
    // https://stackoverflow.com/questions/61428928/how-to-await-a-build-task-in-a-vs-code-extension/61703141#61703141
    const execution = await vscode.tasks.executeTask(myTask)
    return new Promise(resolve => {
      const disposable = vscode.tasks.onDidEndTaskProcess(e => {
        if (e.execution === execution) {
          disposable.dispose()
          const exitCode = e.exitCode
          if (exitCode === 0) {
            if (cb !== undefined) {
              cb(ourbigbookJsonDir)
            }
          }
          resolve(exitCode)
        }
      })
    })
  }

  async function updateSequelize(oldOurbigbookJsonDir: string|undefined, funcname: string) {
    if (ourbigbookJsonDir !== oldOurbigbookJsonDir) {
      sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize({
        logging: (s: string) => channel.appendLine(`${funcname} sql=${s}`),
        storage: path.join(
          ourbigbookJsonDir as string,
          ourbigbook_nodejs_webpack_safe.TMP_DIRNAME,
          ourbigbook_nodejs_front.SQLITE_DB_BASENAME
        ),
      })
      dbProvider = new ourbigbook_nodejs_webpack_safe.SqlDbProvider(sequelize)
      renderContext = ourbigbook.convertInitContext({
        db_provider: dbProvider,
        output_format: ourbigbook.OUTPUT_FORMAT_ID
      })
    }
  }

  function runCmd(cmd: string, args: string[]) {
    channel.appendLine(`runCmd: ${cmd} ${args.join(' ')}`)
    return child_process.spawnSync(cmd, args)
  }

  async function buildAll(): Promise<number|undefined> {
    return runTask(
      'npx',
      ['ourbigbook', '.'],
      (ourbigbookJsonDir: string|undefined) => {
        if (
          ourbigbookJsonDir !== undefined &&
          vscode.workspace.getConfiguration('ourbigbook').gitAutoCommitAfterBuild
        ) {
          let p
          p = runCmd('git', ['-C', ourbigbookJsonDir, 'add', path.join(ourbigbookJsonDir, `/*.${OURBIGBOOK_EXT}`)])
          if (p.status !== 0) {
            vscode.window.showInformationMessage('git add failed, see extension logs for details')
            channel.appendLine(`git add failed:\nstdout:\n${p.stdout}\nstderr\n${p.stderr}`)
          } else {
            p = runCmd('git', ['-C', ourbigbookJsonDir, 'add', '-u', path.join(ourbigbookJsonDir)])
            if (p.status !== 0) {
              vscode.window.showInformationMessage('git add failed, see extension logs for details')
              channel.appendLine(`git add failed:\nstdout:\n${p.stdout}\nstderr\n${p.stderr}`)
            } else {
              p = runCmd('git', ['-C', ourbigbookJsonDir, 'diff', '--name-only', '--cached'])
              if (p.stdout.toString()) {
                let p = runCmd('git', ['-C', ourbigbookJsonDir, 'commit', '-m', 'OurBigBook Vscode extension auto commit'])
                if (p.status !== 0) {
                  vscode.window.showInformationMessage('git commit failed, see extension logs for details')
                  channel.appendLine(`git commit failed:\nstdout:\n${p.stdout}\nstderr\n${p.stderr}`)
                }
              }
            }
          }
        }
      }
    )
  }

  async function publishStatic(): Promise<number|undefined> {
    return runTask('npx', ['ourbigbook', '--publish'])
  }

  async function publishWeb(): Promise<number|undefined> {
    return runTask('npx', ['ourbigbook', '--web'])
  }

  async function publishWebAndStatic(): Promise<number|undefined> {
    return runTask('npx', ['ourbigbook', '--web'], (ourbigbookJsonDir) => {
      return runTask('npx', ['ourbigbook', '--publish'])
    })
  }

  function openOutput() {
    const editor = vscode.window.activeTextEditor
    if (editor) {
      const curFilepath = editor.document.fileName
      const parse = path.parse(curFilepath)
      channel.appendLine(`buildAndView: curFilepath=${curFilepath}`)
      const ourbigbookJsonDir = getOurbigbookJsonDir() as string
      if (parse.ext === `.${OURBIGBOOK_EXT}`) {
        const outpath = path.join(
          ourbigbookJsonDir,
          ourbigbook_nodejs_webpack_safe.TMP_DIRNAME,
          ourbigbook.OUTPUT_FORMAT_HTML,
          path.relative(parse.dir, ourbigbookJsonDir),
          parse.name + '.' + ourbigbook.HTML_EXT
        )
        channel.appendLine(`openOutput: outpath=${outpath}`)
        open(outpath)
      } else {
        vscode.window.showInformationMessage(`ourbigbook.openOutput: Don't know how to open the output for this file extension: ${curFilepath}`)
      }
    } else {
      vscode.window.showInformationMessage(`ourbigbook.OurBigBook: no file or workspace is open`)
    }
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.build', async function () {
      return buildAll()
    }),
    vscode.commands.registerCommand('ourbigbook.publishStatic', async function () {
      return publishStatic()
    }),
    vscode.commands.registerCommand('ourbigbook.publishWeb', async function () {
      return publishWeb()
    }),
    vscode.commands.registerCommand('ourbigbook.publishWebAndStatic', async function () {
      return publishWebAndStatic()
    }),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.buildAndView', async function () {
      const ourbigbookJsonDirMaybe = getOurbigbookJsonDir()
      if (typeof ourbigbookJsonDirMaybe === 'string') {
        if (await buildAll() === 0 && vscode.window.activeTextEditor) {
          openOutput()
        }
      }
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.viewOutput', async function () {
      openOutput()
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.helloWorld', async function () {
      console.log('ourbigbook.helloWorld console.log')
      channel.appendLine('helloWorld OutputChannel.appendLine')
      vscode.window.showInformationMessage(`Hello World from OurBigBook ts!`)
    })
  )
  vscode.workspace.onDidSaveTextDocument((e) => {
    if (e.languageId === OURBIGBOOK_LANGUAGE_ID) {
      channel.appendLine(`onDidSaveTextDocument fileName=${e.fileName}`)
      function buildHandleStdout(stdout: Readable) {
        stdout.setEncoding('utf8')
        stdout.on('data', function(data: string) {
          for (const line of data.split('\n')) {
            if (line) {
              channel.appendLine(`onDidSaveTextDocument: ${e.fileName}: ` + line.replace(/(\n)$/m, ''))
            }
          }
        })
      }
      const p = child_process.spawn('npx', ['ourbigbook', '--no-render', e.fileName], { cwd: getOurbigbookJsonDir() })
      p.on('close', (code) => {
        // Force outline refresh.
        // https://stackoverflow.com/questions/58940136/vs-code-document-symbol-provider-incremental-refresh/78844031#78844031
        if (code === 0) {
          const editor = vscode.window.activeTextEditor
          if (editor) {
            const line = editor.document.lineAt(0)
            const text = line.text
            if (text.length) {
              editor.edit(editBuilder => {
                const c = line.range.end.character
                editBuilder.delete(new vscode.Range(0, c-1, 0, c))
                editBuilder.insert(new vscode.Position(0, c), text[c-1])
              })
            }
          }
        }
      })
      buildHandleStdout(p.stdout)
      buildHandleStdout(p.stderr)
      //const p = child_process.spawnSync('npx', ['ourbigbook', '--no-render', e.fileName], { cwd: getOurbigbookJsonDir() })
      //console.log('onDidSaveTextDocument stdout:\n' + p.stdout)
      //console.log('onDidSaveTextDocument stderr:\n' + p.stderr)
    }
  })

  /* Ctrl + T */
  class OurbigbookWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
    /** The query only contains the string before the first space typed into
     * the Ctrl+T bar... Related500:
     * https://github.com/microsoft/vscode/issues/93645
     * Anything after the first space is used by vscode as a further
     * filter over something, not exactly symbol names either, so it is quite sad.
     * We would need to implement our own custom search window to overcome this.
     */
    async provideWorkspaceSymbols(query: string, token: vscode.CancellationToken) {
      channel.appendLine(`provideWorkspaceSymbols query=${query}`)
      let oldOurbigbookJsonDir = ourbigbookJsonDir
      ourbigbookJsonDir = getOurbigbookJsonDir()
      if (typeof(ourbigbookJsonDir) === 'string') {
        channel.appendLine(`provideWorkspaceSymbols ourbigbookJsonDir=${ourbigbookJsonDir}`)
        await updateSequelize(oldOurbigbookJsonDir, 'provideWorkspaceSymbols')
        return Promise.all([
          sequelize.models.Id.findAll({
            attributes: { include: [ [sequelize.fn('LENGTH', sequelize.col('idid')), 'idid_length'], ], },
            where: { idid: { [sequelize.Sequelize.Op.startsWith]: query } },
            order: [[sequelize.literal('idid_length'), 'ASC'], ['idid', 'ASC']],
            limit: MAX_IDS,
          }),
          sequelize.models.Id.findAll({
            attributes: { include: [ [sequelize.fn('LENGTH', sequelize.col('idid')), 'idid_length'], ], },
            where: { idid: { [sequelize.Sequelize.Op.like]: `_%${query}%` } },
            order: [[sequelize.literal('idid_length'), 'ASC'], ['idid', 'ASC']],
            limit: MAX_IDS,
          }),
        ]).then(ids => ids.flat().map(id => {
          const json = JSON.parse(id.ast_json)
          const sourceLocation = json.source_location
          return new vscode.SymbolInformation(
            id.idid,
            vscode.SymbolKind.Variable,
            '',
            new vscode.Location(
              vscode.Uri.file(path.join(
                // TODO  why is as string needed here despite the above typeof check??
                ourbigbookJsonDir as string
              , sourceLocation.path)),
              new vscode.Position(sourceLocation.line - 1, sourceLocation.column - 1),
            )
          )
        }))
      }
    }
  }
  context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new OurbigbookWorkspaceSymbolProvider()))

  /* Ctrl + Shift + O and
   * Ctrl + 3: outline: https://stackoverflow.com/questions/55846146/make-vs-code-parse-and-display-the-structure-of-a-new-language-to-the-outline-re
   **/
  class OurbigbooDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    /** The query only contains the string before the first space typed into
     * the Ctrl+T bar... Related500:
     * https://github.com/microsoft/vscode/issues/93645
     * Anything after the first space is used by vscode as a further
     * filter over something, not exactly symbol names either, so it is quite sad.
     * We would need to implement our own custom search window to overcome this.
     */
    async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken) {
      channel.appendLine(`provideDocumentSymbols document.fileName=${document.fileName}`)
      const oldOurbigbookJsonDir = ourbigbookJsonDir
      ourbigbookJsonDir = getOurbigbookJsonDir()
      if (typeof(ourbigbookJsonDir) === 'string') {
        const relpath = path.relative(ourbigbookJsonDir, document.fileName)
        if (ourbigbookJsonDir !== oldOurbigbookJsonDir) {
          await updateSequelize(oldOurbigbookJsonDir, 'provideDocumentSymbols')
        }
        //const ids = await sequelize.models.Id.findAll({
        //  where: { macro_name: ourbigbook.Macro.HEADER_MACRO_NAME },
        //  include: [
        //    {
        //      model: sequelize.models.File,
        //      as: 'idDefinedAt',
        //      where: { path: relpath },
        //    },
        //    //{
        //    //  model: sequelize.models.Ref,
        //    //  as: 'from',
        //    //  where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT] },
        //    //},
        //  ],
        //  // TODO ascending line number, column number here.
        //  //order: [['idid', 'ASC']],
        //})
        //const jsons: any[] = ids.map((id: any) => JSON.parse(id.ast_json)).sort((a: any, b: any) => {
        //  const x = a.source_location.line
        //  const y = b.source_location.line
        //  return ((x < y) ? -1 : ((x > y) ? 1 : 0))
        //})
        //const ret = []
        //for (var i = 0; i < jsons.length; i++) {
        //  const json = jsons[i]
        //  const json2 = jsons[i + 1]
        //  let endLine, endColumn
        //  if (json2) {
        //    endLine = json2.source_location.line - 1
        //    endColumn = json2.source_location.column - 1
        //  } else {
        //    endLine = document.lineCount
        //    endColumn = 0
        //  }
        //  const range = new vscode.Range(
        //    json.source_location.line - 1,
        //    json.source_location.column - 1,
        //    endLine,
        //    endColumn,
        //  )
        //  let line = document.lineAt(json.source_location.line - 1).text
        //  if (line.startsWith(SHORTHAND_HEADER_START)) {
        //    line = line.substring(SHORTHAND_HEADER_START.length)
        //  }
        //  ret.push(new vscode.DocumentSymbol(
        //    line,
        //    '',
        //    vscode.SymbolKind.Function,
        //    range,
        //    range,
        //  ))
        //}
        //return ret

        const file = await sequelize.models.File.findOne({
          where: { path: relpath },
          include: [{
            model: sequelize.models.Id,
            as: 'toplevelId'
          }]
        })
        const fetchHeaderTreeIdsRows = await dbProvider.fetch_header_tree_ids(
          [file.toplevelId.idid], { crossFileBoundaries: false })
        const toplevelIdJson = JSON.parse(file.toplevelId.ast_json)
        const toplevelIdJsonSourceLocation = toplevelIdJson.source_location
        const toplevelHeaderTreeNode = new ourbigbook.HeaderTreeNode()
        dbProvider.build_header_tree(fetchHeaderTreeIdsRows, {
          context: renderContext,
          // Otherwise we can't know h2 indices.
          toplevelHeaderTreeNode,
        })
        function getName(lineNum: number) {
          //channel.appendLine(`provideDocumentSymbols.getName lineNum=${lineNum} document.lineAt(lineNum)=${document.lineAt(lineNum).text}`)
          const text = document.lineAt(lineNum).text
          const ret = text.replace(SHORTHAND_HEADER_START_REGEXP, '')
          if (ret !== text) {
            return ret
          } else {
            return '[TOC OUTDATED, TRY SAVING THE FILE AGAIN WITH CTRL + S]'
          }
        }
        // Toplevel not returned from the tree fetch, so we manually add it here.
        const toplevelDocumentSymbol = new vscode.DocumentSymbol(
          getName(toplevelIdJsonSourceLocation.line - 1),
          '',
          vscode.SymbolKind.Function,
          new vscode.Range(
            toplevelIdJsonSourceLocation.line - 1,
            toplevelIdJsonSourceLocation.column - 1,
            document.lineCount - 1,
            0
          ),
          new vscode.Range(
            toplevelIdJsonSourceLocation.line - 1,
            toplevelIdJsonSourceLocation.column - 1,
            toplevelIdJsonSourceLocation.line - 1,
            document.lineAt(toplevelIdJsonSourceLocation.column - 1).text.length
          ),
        )
        const ret = [toplevelDocumentSymbol]
        toplevelHeaderTreeNode.documentSymbol = toplevelDocumentSymbol
        const todoVisit = []
        for (let i = toplevelHeaderTreeNode.children.length - 1; i >= 0; i--) {
          todoVisit.push(toplevelHeaderTreeNode.children[i])
          toplevelHeaderTreeNode.children[i].nextSibling = toplevelHeaderTreeNode.children[i+1]
        }
        while (todoVisit.length > 0) {
          const treeNode = todoVisit.pop()
          const ast = treeNode.ast
          //channel.appendLine(`provideDocumentSymbols treeNode.ast.id=${treeNode.ast.id}`)
          let endLine, endColumn
          const parentTreeNode = treeNode.parent_ast
          const nextSibling = parentTreeNode.children[treeNode.index + 1]
          if (nextSibling) {
            endLine = nextSibling.ast.source_location.line - 2
            endColumn = nextSibling.ast.source_location.column
          } else {
            const nextSiblingParent = parentTreeNode.nextSibling
            if (nextSiblingParent) {
              endLine = nextSiblingParent.ast.source_location.line - 2
              endColumn = nextSiblingParent.ast.source_location.column
            } else {
              endLine = document.lineCount - 1
              endColumn = 0
            }
          }
          const documentSymbol = new vscode.DocumentSymbol(
            getName(ast.source_location.line - 1),
            '',
            vscode.SymbolKind.Function,
            new vscode.Range(
              ast.source_location.line - 1,
              ast.source_location.column - 1,
              endLine,
              endColumn,
            ),
            new vscode.Range(
              ast.source_location.line - 1,
              ast.source_location.column - 1,
              ast.source_location.line - 1,
              document.lineAt(ast.source_location.line - 1).text.length,
            ),
          )
          parentTreeNode.documentSymbol.children.push(documentSymbol)
          treeNode.documentSymbol = documentSymbol
          for (let i = treeNode.children.length - 1; i >= 0; i--) {
            todoVisit.push(treeNode.children[i])
          }
        }
        return ret
      }
      return []
    }
  }
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(
    { scheme: 'file', language: OURBIGBOOK_LANGUAGE_ID },
    new OurbigbooDocumentSymbolProvider()
  ))

  /* Autocomplete */
  class OurbigbookCompletionItemProvider implements vscode.CompletionItemProvider {
    /** The query only contains the string before the first space typed into
     * the Ctrl+T bar... Related
     * https://github.com/microsoft/vscode/issues/93645
     * Anything after the first space is used by vscode as a further
     * filter over something, not exactly symbol names either, so it is quite sad.
     * We would need to implement our own custom search window to overcome this.
     */
    async provideCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken,
      context: vscode.CompletionContext
    ) {
      const col = position.character
      channel.appendLine(`provideCompletionItems position=${position.line}:${col}`)
      channel.appendLine(`provideCompletionItems context={triggerCharacter=${context.triggerCharacter}, triggerKind=${context.triggerKind}`)
      const lineToCursor = document.lineAt(position.line).text.substring(0, col)
      const matches = [...lineToCursor.matchAll(/(?<=<)[^>]*$|(?<=\{(parent|tag)=)[^}]*$/g)]
      if (matches.length) {
        const lastMatch = matches[matches.length - 1]
        const queryRaw = lineToCursor.substring(lastMatch.index, col)
        const query = ourbigbook.titleToId(queryRaw)
        if (query) {
          const c0 = queryRaw[0]
          const queryIsLower = c0.toLowerCase() === c0
          let oldOurbigbookJsonDir = ourbigbookJsonDir
          ourbigbookJsonDir = getOurbigbookJsonDir()
          if (typeof(ourbigbookJsonDir) === 'string') {
            if (ourbigbookJsonDir !== oldOurbigbookJsonDir) {
              await updateSequelize(oldOurbigbookJsonDir, 'provideCompletionItems')
            }
            async function createCompletionItem(ids: any[], atStart: boolean) {
              const ret = []
              for (const id of ids) {
                // This slightly duplicates <> ourbigbook output type conversion,
                // but it was a bit different and much simpler. Let's see.
                const ast = ourbigbook.AstNode.fromJSON(id.ast_json, renderContext)
                const macro = renderContext.macros[ast.macro_name];
                const titleArg = macro.options.get_title_arg(ast, renderContext);
                let label = ourbigbook.renderArg(titleArg, renderContext)
                const idPrefix = macro.options.id_prefix
                if (idPrefix) {
                  label = `${idPrefix} ${ourbigbook.capitalizeFirstLetter(label)}`
                } else {
                  if (atStart) {
                    if (!(
                      ast.validation_output.c &&
                      ast.validation_output.c.boolean
                    )) {
                      if (queryIsLower) {
                        label = ourbigbook.decapitalizeFirstLetter(label)
                      } else {
                        label = ourbigbook.capitalizeFirstLetter(label)
                      }
                    }
                  }
                }
                ret.push(new vscode.CompletionItem(label))
              }
              return ret
            }
            return new vscode.CompletionList(
              [
                ...(await sequelize.models.Id.findAll({
                  attributes: { include: [ [sequelize.fn('LENGTH', sequelize.col('idid')), 'idid_length'], ], },
                  where: { idid: { [sequelize.Sequelize.Op.startsWith]: query } },
                  // No matter what we set here, vscode then re-sorts it on the UI it is so annoying!
                  // https://github.com/microsoft/monaco-editor/issues/1077
                  order: [[sequelize.literal('idid_length'), 'ASC'], ['idid', 'ASC']],
                  limit: MAX_IDS,
                }).then((ids:any) => createCompletionItem(ids, true))),
                ...await sequelize.models.Id.findAll({
                  attributes: { include: [ [sequelize.fn('LENGTH', sequelize.col('idid')), 'idid_length'], ], },
                  where: { idid: { [sequelize.Sequelize.Op.like]: `_%${query}%` } },
                  order: [[sequelize.literal('idid_length'), 'ASC'], ['idid', 'ASC']],
                  limit: MAX_IDS,
                }).then((ids:any) => createCompletionItem(ids, false)),
              ],
              // This way it keeps triggering we type more characters.
              true,
            )
          }
        }
      }
      return []
    }
  }
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { scheme: 'file', language: OURBIGBOOK_LANGUAGE_ID },
      new OurbigbookCompletionItemProvider(),
      // TODO what does this give us?
      '<',
    )
  )

  /* Ctrl + click to jump to definition */
  class OurbigbookDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken
    ) {
      const col = position.character
      channel.appendLine(`provideDefinition position=${position.line}:${col}`)
      const line = document.lineAt(position.line).text
      let find
      for (const match of line.matchAll(/(<|\{(parent|tag)=)(.*?)(>|})/g)) {
        if (col >= match.index && col <= match.index + match[0].length) {
          find = match[3]
        }
      }
      if (!find) {
        // Search for shorthand #topic links without <>.
        for (const match of line.matchAll(/#[^\[\]{} \n]+/g)) {
          if (col >= match.index && col <= match.index + match[0].length) {
            find = match[0]
          }
        }
      }
      channel.appendLine(`provideDefinition find=${find}`)
      const ret = []
      if (find) {
        const textId = ourbigbook.titleToId(find)
        if (find[0] === ourbigbook.SHORTHAND_TOPIC_CHAR) {
          open(`https://${ourbigbook.OURBIGBOOK_DEFAULT_HOST}${ourbigbook.URL_SEP}${ourbigbook.WEB_TOPIC_PATH}${ourbigbook.URL_SEP}${ourbigbook.pluralizeWrap(textId, 1)}`)
        } else {
          let oldOurbigbookJsonDir = ourbigbookJsonDir
          ourbigbookJsonDir = getOurbigbookJsonDir()
          if (typeof(ourbigbookJsonDir) === 'string') {
            await updateSequelize(oldOurbigbookJsonDir, 'provideWorkspaceSymbols')
            channel.appendLine(`provideWorkspaceSymbols ourbigbookJsonDir=${ourbigbookJsonDir} textId=${textId}`)
            let id = await sequelize.models.Id.findOne({
              where: { idid: textId },
            })
            if (!id) {
              id = await sequelize.models.Id.findOne({
                where: { idid: ourbigbook.pluralizeWrap(textId, 1) },
              })
            }
            if (id) {
              const json = JSON.parse(id.ast_json)
              const sourceLocation = json.source_location
              ret.push(new vscode.Location(
                vscode.Uri.file(path.join(ourbigbookJsonDir, sourceLocation.path)),
                new vscode.Range(sourceLocation.line-1, sourceLocation.column-1, sourceLocation.line-1, sourceLocation.column-1),
              ))
            }
          }
        }
      }
      return ret
    }
  }
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { scheme: 'file', language: OURBIGBOOK_LANGUAGE_ID },
      new OurbigbookDefinitionProvider(),
    )
  )
}

export function deactivate() { }
