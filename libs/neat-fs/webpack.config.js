/* eslint-disable @typescript-eslint/no-var-requires, no-undef, import/no-extraneous-dependencies */
// https://github.com/hodgef/ts-library-boilerplate-basic/blob/master/webpack.config.js
const path = require('path')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const ESLintPlugin = require('eslint-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const webpack = require('webpack')
const getPackageJson = require('./scripts/getPackageJson')

const {
  version,
  name,
  license,
  repository,
  author,
} = getPackageJson('version', 'name', 'license', 'repository', 'author')

const banner = `
  ${name} v${version}
  ${repository.url}
  Copyright (c) ${author.replace(/ *<[^)]*> */g, ' ')} and project contributors.
  This source code is licensed under the ${license} license found in the
  LICENSE file in the root directory of this source tree.
`

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'feather-ink-neat-fs.js',
    library: 'feather-ink-neat-fs',
    libraryTarget: 'umd',
    globalObject: 'this',
    clean: true,
  },
  externals: {
    '@ink-feather-org/ts-utils': {
      commonjs: '@ink-feather-org/ts-utils',
      commonjs2: '@ink-feather-org/ts-utils',
      amd: '@ink-feather-org/ts-utils',
      root: '@ink-feather-org/ts-utils',
    },
    '@ink-feather-org/ts-mutex': {
      commonjs: '@ink-feather-org/ts-mutex',
      commonjs2: '@ink-feather-org/ts-mutex',
      amd: '@ink-feather-org/ts-mutex',
      root: '@ink-feather-org/ts-mutex',
    },
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({ extractComments: false, }),
    ],
  },
  module: {
    rules: [
      {
        test: /\.(m|j|t)s$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json', ],
  },
  plugins: [new webpack.BannerPlugin(banner), new ForkTsCheckerWebpackPlugin(), new ESLintPlugin(), ],
}
