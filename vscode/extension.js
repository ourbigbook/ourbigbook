const path = require('path')

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const channel = vscode.window.createOutputChannel('OurBigBook', 'ourbigbook')
	channel.appendLine('ourbigbook.activate OutputChannel')
	console.log('ourbigbook.activate log')
	let disposable = vscode.commands.registerCommand('ourbigbook.helloWorld', function () {
		console.log('ourbigbook.helloWorld console.log')
		channel.appendLine('ourbigbook.helloWorld OutputChannel.appendLine')
		vscode.window.showInformationMessage('Hello World from OurBigBook!')
		const workspaceFolders = vscode.workspace.workspaceFolders
		let curdir
		if (workspaceFolders) {
			curdir = workspaceFolders[0]
		} else {
			curdir = path.dirname(vscode.window.activeTextEditor.document.fileName)
		}
		const ourbigbookJsonDir = ourbigbook_nodejs_webpack_safe.findOurbigbookJsonDir(curdir)
		vscode.window.showInformationMessage(ourbigbookJsonDir)
	})
	context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
