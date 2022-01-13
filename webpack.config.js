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
    cirodown: ['./cirodown.scss'],
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
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
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
