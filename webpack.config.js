const path = require('path');

const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const TerserPlugin = require("terser-webpack-plugin");

const distDir = path.resolve(__dirname, 'dist');
const nodeModulesPath = path.resolve(__dirname, 'node_modules');

module.exports = {
  entry: {
    cirodown: ['./index.js'],
    cirodown_runtime: ['./cirodown_runtime.js'],
    cirodown_css: ['./cirodown.scss'],
    editor: ['./editor.scss'],
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(scss|css)$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          // This finds and pulls Katex fonts for us.
          'resolve-url-loader',
          {
            loader: "sass-loader",
            options: {
              // This is needed for resolve-url-loader to work:
              // https://github.com/bholloway/resolve-url-loader/issues/212#issuecomment-1011630220
              sourceMap: true,
              sassOptions: {
                includePaths: [nodeModulesPath],
              },
            },
          },
        ],
      },
      // Working CSS in Js version.
      //{
      //  test: /\.(scss|css)$/,
      //  use: ['style-loader', 'css-loader', 'sass-loader'],
      //},
      // Fonts.
      {
        test: /\.(woff2)$/i,
        type: 'asset/resource',
      },
      {
        // All the font formats that we don't want must come here, if they don't blowups.
        // https://stackoverflow.com/questions/37667444/is-there-a-way-to-ignore-a-file-type-with-webpack/39886771#39886771
        // KaTeX ships all formats in existence. We are not ultra backwards compatible, so we ship just woff2 for now.
        // This reduced the size of assets from abou 2MB to about 1MB.
        test: /\.(woff|eot|ttf|otf)$/i,
        loader: 'ignore-loader'
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: (pathData) => {
        // https://stackoverflow.com/questions/70698775/how-to-make-webpack-generate-separate-css-and-js-with-the-same-name-index-e-g/70698776#70698776
        if (pathData.chunk.name === 'cirodown_css') {
          return 'cirodown.css'
        }
        return '[name].css'
      },
    }),
    new NodePolyfillPlugin(),
  ],
  optimization: {
    minimizer: [
      new CssMinimizerPlugin(),
      // Minimizes the JavaScript.
      new TerserPlugin(),
    ],
    minimize: true,
  },
  output: {
    clean: false,
    filename: '[name].js',
    globalObject: 'this',
    library: '[name]',
    libraryTarget: 'umd',
    path: distDir,
  },
};
