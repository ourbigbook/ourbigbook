const path = require('path')

const ourbigbook_nodejs_webpack_safe = require('./nodejs_webpack_safe.js')

/* Currently this is used only for copying editor.html into dist/
 * This was the simplest way we could find to get editor.html to just work both locally
 * and on publish, as then we can just use relative paths inside _dist and all works well.
 *
 * We also then minify editor.html just for fun.
 *
 * Ideally however, we would like to pass this through HtmlWebpackPlugin and minify it there.
 *
 * If we ut editor.html as an entry, webpack does pick up everything nicely by input filename,
 * e.g. we can use stuff like:
 *
 *     <link rel="stylesheet" href="ourbigbook.scss">
 *
 * The problem is that this outputs .js rather than .html, and the Internet hasn't figured out yet how:
 *
 * * https://stackoverflow.com/questions/45063362/using-webpack-with-a-html-entry
 * * https://stackoverflow.com/questions/55082181/html-as-webpack-entry-point
 */
const CopyPlugin = require('copy-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const HtmlMinimizerPlugin = require("html-minimizer-webpack-plugin")
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")
const TerserPlugin = require("terser-webpack-plugin")

const nodeModulesPath = path.resolve(__dirname, 'node_modules')

module.exports = {
  entry: {
    ourbigbook: ['./index.js'],
    ourbigbook_runtime: ['./ourbigbook_runtime.js'],
    ourbigbook_css: ['./ourbigbook.scss'],
    editor: ['./editor.js'],
    editor_css: ['./editor.scss'],
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
    new CopyPlugin({
      patterns: [
        { from: 'editor.html' },
        { from: 'logo.svg' },
      ],
    }),
  ],
  optimization: {
    minimizer: [
      new CssMinimizerPlugin(),
      // Minimizes the JavaScript.
      new TerserPlugin(),
      new HtmlMinimizerPlugin(),
    ],
    minimize: true,
  },
  output: {
    clean: false,
    filename: '[name].js',
    globalObject: 'this',
    library: '[name]',
    libraryTarget: 'umd',
    // nodejs.DIST_PATH would be better here, but we are unable to import nodejs.js
    // in this file without a global install with npm run link. Like this is works
    // with just npm install.
    path: path.join(__dirname, ourbigbook_nodejs_webpack_safe.DIST_BASENAME),
  },
};
