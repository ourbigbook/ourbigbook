//const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  eslint: {
    // Next.js 11 enables it by defualt, which is great. Being naughty until I get
    // the patience to fix i it.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    //config.plugins.push(new MonacoWebpackPlugin({
    //  languages: ['javascript', 'typescript'],
    //}))
    return config
  },
}
