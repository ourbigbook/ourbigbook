# OurBigBook VS Code Extension

This extension adds support for local [OurBigBook Markup](https://docs.ourbigbook.com/ourbigbook-markup) and [OurBigBook Web](https://docs.ourbigbook.com/ourbigbook-web) and [OurBigBook CLI](https://docs.ourbigbook.com/ourbigbook-cli) deployment to Visual Studio Code.

This extension's documentation can be found at: <https://docs.ourbigbook.com/visual-studio-code>

Generated `_out` directories are excluded from file discovery by default so their Markdown headers do not clutter workspace symbol search (`Ctrl+T`, or `#` in Quick Open). This also hides these directories in Explorer. To opt out, set `"files.exclude": { "**/_out": false }` in your user or workspace settings. After changing this setting, run **Developer: Reload Window** to clear previously indexed symbols.

A demo video can be found at: https://www.youtube.com/watch?v=0W8U2YtQ8fg

https://raw.githubusercontent.com/ourbigbook/ourbigbook-media/master/feature/x/hilbert-space-arrow.png

[Internal cross file references](https://docs.ourbigbook.com/#cross-file-reference) done right:

![](https://raw.githubusercontent.com/ourbigbook/ourbigbook-media/master/feature/x/hilbert-space-arrow.png)

The [Visual Studio Code extension](https://docs.ourbigbook.com/#visual-studio-code) implements features such as header trees:

![](https://raw.githubusercontent.com/ourbigbook/ourbigbook-media/master/feature/vscode/tree.png)

You can [publish your local lightweight markup files either to OurBigBook.com or as a static website on your own domain of choice](https://docs.ourbigbook.com/#publish-your-content):

![](https://raw.githubusercontent.com/ourbigbook/ourbigbook-media/master/feature/local-editing/bigb-publish-to-web-or-static-editor-logos.png)
