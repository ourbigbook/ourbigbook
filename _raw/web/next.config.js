//const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

module.exports = phase => ({
  // Builds clean their output directory. Keep them away from the running dev
  // server's chunks and caches, including when NODE_ENV is set by our wrappers.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
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
})
