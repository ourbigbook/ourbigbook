const path = require('path');

const ourbigbook_nodejs = require('./nodejs');

const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const TerserPlugin = require("terser-webpack-plugin");

const nodeModulesPath = path.resolve(__dirname, 'node_modules');

module.exports = {
  entry: {
    ourbigbook: ['./index.js'],
    ourbigbook_runtime: ['./ourbigbook_runtime.js'],
    ourbigbook_css: ['./ourbigbook.scss'],
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
        test: /\.(woff|eot|ttf|otf|woff2)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: (pathData) => {
        // https://stackoverflow.com/questions/70698775/how-to-make-webpack-generate-separate-css-and-js-with-the-same-name-index-e-g/70698776#70698776
        if (pathData.chunk.name === 'ourbigbook_css') {
          return 'ourbigbook.css'
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
    path: ourbigbook_nodejs.DIST_PATH,
  },
};
