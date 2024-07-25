const path = require('path')

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

const MAX_IDS = 10000

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	const channel = vscode.window.createOutputChannel('OurBigBook', 'ourbigbook')
	channel.appendLine('ourbigbook.activate OutputChannel.appendLine')
	console.log('ourbigbook.activate log')
	let helloWorld = vscode.commands.registerCommand('ourbigbook.helloWorld', async function () {
		console.log('ourbigbook.helloWorld console.log')
		channel.appendLine('ourbigbook.helloWorld OutputChannel.appendLine')
		vscode.window.showInformationMessage('Hello World from OurBigBook!')
	})
	context.subscriptions.push(helloWorld)

	class OurbigbookWorkspaceSymbolProvider {
		/** The query only contains the string before the first space typed into
		 * the Ctrl+T bar... Related:
		 * https://github.com/microsoft/vscode/issues/93645
		 * Anything after the first space is used by vscode as a further
		 * filter over something, not exactly symbol names either, so it is quite sad.
		 * We would need to implement our own custom search window to overcome this.
		 */
		async provideWorkspaceSymbols(query, token) {
			channel.appendLine(`provideWorkspaceSymbols query=${query}`)
			const workspaceFolders = vscode.workspace.workspaceFolders
			let curdir
			if (workspaceFolders) {
				curdir = workspaceFolders[0].uri.path
			} else {
				curdir = path.dirname(vscode.window.activeTextEditor.document.fileName)
			}
			channel.appendLine(`provideWorkspaceSymbols curdir=${curdir}`)
			const ourbigbookJsonDir = ourbigbook_nodejs_webpack_safe.findOurbigbookJsonDir(curdir)
			channel.appendLine(`provideWorkspaceSymbols ourbigbookJsonDir=${ourbigbookJsonDir}`)
			if (ourbigbookJsonDir) {
				const sequelize = await ourbigbook_nodejs_webpack_safe.createSequelize({
					logging: (s) => channel.appendLine(`provideWorkspaceSymbols sql=${s}`),
					storage: path.join(ourbigbookJsonDir, ourbigbook_nodejs_webpack_safe.TMP_DIRNAME, ourbigbook_nodejs_front.SQLITE_DB_BASENAME),
				})
				return Promise.all([
					sequelize.models.Id.findAll({
						where: { idid: { [sequelize.Sequelize.Op.startsWith]: query } },
						order: [['idid', 'ASC']],
						limit: MAX_IDS,
					}),
					sequelize.models.Id.findAll({
						where: { idid: { [sequelize.Sequelize.Op.substring]: query } },
						order: [['idid', 'ASC']],
						limit: MAX_IDS,
					}),
				]).then(ids => ids.flat().map(id => {
					const json = JSON.parse(id.ast_json)
					const sourceLocation = json.source_location
					return new vscode.SymbolInformation(
						id.idid,
						vscode.SymbolKind.Variable,
						undefined,
						new vscode.Location(
							vscode.Uri.file(path.join(ourbigbookJsonDir, sourceLocation.path)),
							new vscode.Position(sourceLocation.line - 1, sourceLocation.column - 1),
						)
					)
				}))
			}
		}
	}
	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(new OurbigbookWorkspaceSymbolProvider()))
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
