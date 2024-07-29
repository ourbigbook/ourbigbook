import path from 'path'

import * as vscode from 'vscode'

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

const MAX_IDS = 10000

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

function getOurbigbookExecPath(): string {
  return path.join(path.dirname(require.resolve('ourbigbook')), 'ourbigbook')
}

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context: vscode.ExtensionContext) {
  // State.tasks.
  const channel = vscode.window.createOutputChannel('OurBigBook', 'ourbigbook')
  let ourbigbookJsonDir: string|undefined
  let sequelize: any

  // Sanity checks.
  channel.appendLine('ourbigbook.activate OutputChannel.appendLine')
  channel.appendLine(`process.cwd=${process.cwd()}`)
  channel.appendLine(`require.resolve('ourbigbook')=${require.resolve('ourbigbook')}`)
  console.log('ourbigbook.activate log')

  function getOurbigbookJsonDir(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders
    let curdir
    if (workspaceFolders) {
      curdir = workspaceFolders[0].uri.path
    } else {
      if (vscode.window.activeTextEditor) {
        curdir = path.dirname(vscode.window.activeTextEditor.document.fileName)
      }
    }
    channel.appendLine(`getOurbigbookJsonDir curdir=${curdir}`)
    if (curdir) {
      return ourbigbook_nodejs_webpack_safe.findOurbigbookJsonDir(curdir)
    }
  }

  async function buildAll() {
    // Also worked, but worse user experience.
    // With task:
    // - auto pops up terminal
    // - user can Ctrl+Click to go to error message
    //import child_process from 'child_process'
    //import readline from 'readline'
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

    // build task.
    const quotingStyle: vscode.ShellQuoting = vscode.ShellQuoting.Strong
    let myTaskCommand: vscode.ShellQuotedString = {
      value: getOurbigbookExecPath(),
      quoting: quotingStyle,
    }
    const args = ['.']
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
    await vscode.tasks.executeTask(myTask)
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.build', async function () {
      return buildAll()
    })
  )
  context.subscriptions.push(
    vscode.commands.registerCommand('ourbigbook.helloWorld', async function () {
      console.log('ourbigbook.helloWorld console.log')
      channel.appendLine('ourbigbook.helloWorld OutputChannel.appendLine')
      vscode.window.showInformationMessage(`Hello World from OurBigBook ts!`)
    })
  )

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
            where: { idid: { [sequelize.Sequelize.Op.startsWith]: query } },
            order: [['idid', 'ASC']],
            limit: MAX_IDS,
          }),
          sequelize.models.Id.findAll({
            where: { idid: { [sequelize.Sequelize.Op.like]: `_%${query}%` } },
            order: [['idid', 'ASC']],
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
}

export function deactivate() { }
