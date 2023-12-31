import path from 'path';
import fs from 'fs';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CaseSensitivePathsPlugin from 'case-sensitive-paths-webpack-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import getClientEnvironment from './env.js';
import * as paths from './paths.js';
import _ from 'lodash';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Webpack uses `publicPath` to determine where the app is being served from.
// It requires a trailing slash, or the file assets will get an incorrect path.
const publicPath = paths.servedPath;
// Some apps do not use client-side routing with pushState.
// For these, "homepage" can be set to "." to enable relative asset paths.
// const shouldUseRelativeAssetPaths = publicPath === './';
// `publicUrl` is just like `publicPath`, but we will provide it to our app
// as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
// Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
const publicUrl = publicPath.slice(0, -1);

let env = getClientEnvironment(publicUrl);

let ssbConfig = {};

if(fs.existsSync(paths.ssbConfig)) {
  let ssbConfigObj = require(paths.ssbConfig);
  if(ssbConfigObj) {
    if(_.isFunction(ssbConfigObj)) {
      ssbConfig = ssbConfigObj(env.raw, 'development', { publicUrl, ...paths });
    } else if(_.isPlainObject(ssbConfigObj)) {
      if(_.has(ssbConfigObj, 'dev')) {
        ssbConfig = _.get(ssbConfigObj, 'dev');
      } else if(_.has(ssbConfigObj, 'development')) {
        ssbConfig = _.get(ssbConfigObj, 'development');
      } else {
        ssbConfig = ssbConfigObj;
      }
    }
  }
}

ssbConfig = ssbConfig || {};

if(ssbConfig.env && _.isPlainObject(ssbConfig.env)) {
  const raw = _.extend({}, env.raw, ssbConfig.env);
  const stringified = {
    'process.env': Object.keys(raw).reduce((env, key) => {
      env[key] = JSON.stringify(raw[key]);
      return env;
    }, {}),
  };
  env = { raw, stringified };
}

let htmlWebpackPluginOptions = {
  filename: 'index.html',
  template: paths.appTemplate,
  inject: 'head',
  minify: { collapseWhitespace: true }
};

if(ssbConfig.htmlWebpackPluginOptions && _.isPlainObject(ssbConfig.htmlWebpackPluginOptions)) {
  htmlWebpackPluginOptions = _.extend({}, htmlWebpackPluginOptions, ssbConfig.htmlWebpackPluginOptions);
}

const plugins = [
  new webpack.DefinePlugin(env.stringified),
  new HtmlWebpackPlugin(htmlWebpackPluginOptions),
  new CaseSensitivePathsPlugin(),
  new WebpackManifestPlugin({
    fileName: 'asset-manifest.json',
    publicPath: publicPath
  }),
];

if(ssbConfig.plugins && _.isArray(ssbConfig.plugins)) {
  plugins.push(...ssbConfig.plugins);
}

const copyPatterns = [];

if(fs.existsSync(paths.publicDir)) {
  copyPatterns.push({
    from: paths.publicDir,
    to: paths.appBuild
  });
}

if(ssbConfig.copyPatterns && _.isArray(ssbConfig.copyPatterns)) {
  copyPatterns.push(...ssbConfig.copyPatterns);
}

if(copyPatterns.length > 0) {
  plugins.push(new CopyPlugin({
    patterns: copyPatterns
  }));
}

let tsConfigPath = paths.tsConfig;

if(ssbConfig.tsConfigPath && fs.existsSync(paths.resolveApp(ssbConfig.tsConfigPath))) {
  tsConfigPath = paths.resolveApp(ssbConfig.tsConfigPath);
}

const resolvePlugins = [];

if(fs.existsSync(tsConfigPath)) {
  resolvePlugins.push(new TsconfigPathsPlugin({ configFile: tsConfigPath }));
}

let appIndex = paths.appIndex;

if(ssbConfig.appIndex && fs.existsSync(paths.resolveApp(appIndex))) {
  appIndex = paths.resolveApp(appIndex);
}

const extraLoaders = [];

if(ssbConfig.extraLoaders && _.isArray(ssbConfig.extraLoaders)) {
  extraLoaders.push(...ssbConfig.extraLoaders);
}

let postcssOptions = {
  plugins: ['postcss-preset-env']
};

if(ssbConfig.postcssOptions && _.isPlainObject(ssbConfig.postcssOptions)) {
  postcssOptions = _.defaultsDeep({}, postcssOptions, ssbConfig.postcssOptions);
}

export default _.defaultsDeep({}, ssbConfig.webpack || {}, {
  mode: 'development',
  entry: {
    index: appIndex
  },
  devtool: 'source-map',
  output: {
    pathinfo: true,
    path: paths.appBuild,
    publicPath: publicPath
  },
  resolve: {
    modules: ['node_modules'].concat(
      // It is guaranteed to exist because we tweak it in `env.js`
      process.env.NODE_PATH.split(path.delimiter).filter(Boolean)
    ),
    extensions: ['.js', '.ts', '.json', '.jsx', '.tsx'],
    plugins: resolvePlugins,
    roots: [paths.appPath, paths.publicDir],
  },
  module: {
    strictExportPresence: true,
    rules: [
      {
        test: /\.[tj]s$/,
        parser: { requireEnsure: false }
      },
      {
        oneOf: [
          ...extraLoaders,
          {
            test: /\.ts$/,
            exclude: [/[/\\\\]node_modules[/\\\\]/, /[/\\\\]public[/]]]]/],
            use: [
              {
                loader: require.resolve('ts-loader'),
                options: {
                  configFile: tsConfigPath
                },
              },
            ]
          },
          {
            test: /\.js$/,
            exclude: [/[/\\\\]node_modules[/\\\\]/, /[/\\\\]public[/]]]]/],
            use: [
              require.resolve('thread-loader'),
              {
                loader: require.resolve('babel-loader'),
                options: {
                  babelrc: false,
                  // This is a feature of `babel-loader` for webpack (not Babel itself).
                  // It enables caching results in ./node_modules/.cache/babel-loader/
                  // directory for faster rebuilds.
                  cacheDirectory: true,
                  highlightCode: true,
                },
              },
            ]
          },
          {
            test: /\.js$/,
            exclude: [/[/\\\\]public[/]]]]/],
            use: [
              require.resolve('thread-loader'),
              {
                loader: require.resolve('babel-loader'),
                options: {
                  babelrc: false,
                  compact: false,
                  // This is a feature of `babel-loader` for webpack (not Babel itself).
                  // It enables caching results in ./node_modules/.cache/babel-loader/
                  // directory for faster rebuilds.
                  cacheDirectory: true,
                  highlightCode: true,
                },
              },
            ]
          },
          {
            test: /\.css$/,
            exclude: [/[/\\\\]public[/]]]]/],
            use: [
              'style-loader',
              'css-loader',
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions
                }
              }
            ]
          },
          {
            test: /\.scss$/,
            exclude: [/[/\\\\]public[/]]]]/],
            use: [
              'style-loader',
              'css-loader',
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions
                }
              },
              'sass-loader'
            ]
          },
          {
            loader: require.resolve('file-loader'),
            // Exclude `js` files to keep "css" loader working as it injects
            // its runtime that would otherwise processed through "file" loader.
            // Also exclude `html` and `json` extensions so they get processed
            // by webpack's internal loaders.
            exclude: [/\.jsx?$/, /\.tsx?$/, /\.svg$/, /\.html$/, /\.ejs$/, /\.hbs$/, /\.json$/, /[/\\\\]public[/]]]]/],
            options: {
              name: '[name].[ext]'
            }
          }
        ]
      }
    ]
  },
  plugins,
  performance: {
    hints: false,
  },
});
