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
    cirodown_runtime: ['./cirodown.runtime.js'],
    // Couldn't get the Katex working this way.
    // https://github.com/KaTeX/KaTeX/discussions/3115
    // cirodown: ['./cirodown.scss'],
  },
  mode: 'production',
  module: {
    rules: [
      // Separate .css attempt.
      //{
      //  test: /\.(scss|css)$/,
      //  use: [
      //    MiniCssExtractPlugin.loader,
      //    'style-loader',
      //    'css-loader',
      //    {
      //      loader: "sass-loader",
      //      options: {
      //        sassOptions: {
      //          includePaths: [nodeModulesPath],
      //        },
      //      },
      //    },
      //  ],
      //},
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
      new TerserPlugin(),
    ],
    minimize: true,
  },
  output: {
    clean: false,
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'umd',
    path: distDir,
  },
};
