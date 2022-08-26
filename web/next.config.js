//const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  eslint: {
    // Next.js 11 enables it by default, which is great. Being naughty until I get
    // the patience to fix i it.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.module.rules.push(
      {
        // To allow embedding the default defines into the Web Editor.
        test: /\.tex$/,
        type: 'asset/source',
      }
    );
    return config
  },
}
