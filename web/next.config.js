//const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    //config.plugins.push(new MonacoWebpackPlugin({
    //  languages: ['javascript', 'typescript'],
    //}))
    return config
  },
}
