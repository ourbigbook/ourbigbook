// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('ourbigbook.activate');
	let disposable = vscode.commands.registerCommand('ourbigbook.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from OurBigBook!');
		console.log('hello world command');
	});
	context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
