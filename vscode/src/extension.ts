import path from 'path'
import child_process from 'child_process'
import { Readable } from 'stream'

import * as vscode from 'vscode'

const open = require('open')

const ourbigbook = require('ourbigbook')

const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

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

  // Sanity checks.
  channel.appendLine('ourbigbook.activate OutputChannel.appendLine')
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

  async function buildAll(): Promise<number|undefined> {
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
      value: 'npx',
      quoting: quotingStyle,
    }
    const args = ['ourbigbook', '.']
    let myTaskArgs: vscode.ShellQuotedString[] = args.map((arg) => {
      return { value: arg, quoting: quotingStyle }
    })
    let myTaskOptions: vscode.ShellExecutionOptions = {
      cwd: getOurbigbookJsonDir(),
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
      "makefile",
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
          resolve(e.exitCode)
        }
      })
    })
  }

  function openOutput() {
    const editor = vscode.window.activeTextEditor
    if (editor) {
      const curFilepath = editor.document.fileName
      const parse = path.parse(curFilepath)
      channel.appendLine(`ourbigbook.buildAndView: curFilepath=${curFilepath}`)
      const ourbigbookJsonDir = getOurbigbookJsonDir() as string
      if (parse.ext === `.${ourbigbook.OURBIGBOOK_EXT}`) {
        const outpath = path.join(
          ourbigbookJsonDir,
          ourbigbook_nodejs_webpack_safe.TMP_DIRNAME,
          ourbigbook.OUTPUT_FORMAT_HTML,
          path.relative(parse.dir, ourbigbookJsonDir),
          parse.name + '.' + ourbigbook.HTML_EXT
        )
        channel.appendLine(`ourbigbook.openOutput: outpath=${outpath}`)
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
    })
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
      channel.appendLine('ourbigbook.helloWorld OutputChannel.appendLine')
      vscode.window.showInformationMessage(`Hello World from OurBigBook ts!`)
    })
  )
  vscode.workspace.onDidSaveTextDocument((e) => {
    if (e.languageId === OURBIGBOOK_LANGUAGE_ID) {
      channel.appendLine(`ourbigbook.onDidSaveTextDocument fileName=${e.fileName}`)
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
      buildHandleStdout(p.stdout)
      buildHandleStdout(p.stderr)
    }
  })

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
      if (typeof(ourbigbookJsonDir) === "string") {
        channel.appendLine(`provideWorkspaceSymbols ourbigbookJsonDir=${ourbigbookJsonDir}`)
        if (ourbigbookJsonDir !== oldOurbigbookJsonDir) {
          sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize({
            logging: (s: string) => channel.appendLine(`provideWorkspaceSymbols sql=${s}`),
            storage: path.join(ourbigbookJsonDir, ourbigbook_nodejs_webpack_safe.TMP_DIRNAME, ourbigbook_nodejs_front.SQLITE_DB_BASENAME),
          })
        }
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

  class OurbigbookCompletionItemProvider implements vscode.CompletionItemProvider {
    /** The query only contains the string before the first space typed into
     * the Ctrl+T bar... Related500:
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
          if (typeof(ourbigbookJsonDir) === "string") {
            if (ourbigbookJsonDir !== oldOurbigbookJsonDir) {
              sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize({
                logging: (s: string) => channel.appendLine(`provideCompletionItems sql=${s}`),
                storage: path.join(ourbigbookJsonDir, ourbigbook_nodejs_webpack_safe.TMP_DIRNAME, ourbigbook_nodejs_front.SQLITE_DB_BASENAME),
              })
            }
            const renderContext = ourbigbook.convertInitContext({
              db_provider: new ourbigbook_nodejs_webpack_safe.SqlDbProvider(sequelize),
              output_format: ourbigbook.OUTPUT_FORMAT_ID
            })
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
}

export function deactivate() { }
