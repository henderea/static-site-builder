import path from 'path';
import fs from 'fs';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CaseSensitivePathsPlugin from 'case-sensitive-paths-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import { GenerateSW } from 'workbox-webpack-plugin';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import MomentLocalesPlugin from 'moment-locales-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import getClientEnvironment from './env.js';
import * as paths from './paths.js';
import _ from 'lodash';
import crypto from 'crypto';
import { globbySync } from 'globby';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Webpack uses `publicPath` to determine where the app is being served from.
// It requires a trailing slash, or the file assets will get an incorrect path.
let publicPath = paths.servedPath;
// Some apps do not use client-side routing with pushState.
// For these, "homepage" can be set to "." to enable relative asset paths.
// const shouldUseRelativeAssetPaths = publicPath === './';
// `publicUrl` is just like `publicPath`, but we will provide it to our app
// as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
// Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
let publicUrl = publicPath.slice(0, -1);

let env = getClientEnvironment(publicUrl);

const cssFilename = '[name].css';

const getRevision = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

let additionalManifestEntries = undefined;

if(fs.existsSync(paths.publicDir)) {
  additionalManifestEntries = globbySync(['**/*', '!asset-manifest.json', '!service-worker.js'], { cwd: paths.publicDir }).map((f) => ({ url: `${publicUrl}/${f}`, revision: getRevision(path.join(paths.publicDir, f)) }));
}

let ssbConfig = {};

if(fs.existsSync(paths.ssbConfig)) {
  let ssbConfigObj = require(paths.ssbConfig);
  if(ssbConfigObj) {
    if(_.isFunction(ssbConfigObj)) {
      ssbConfig = ssbConfigObj(env.raw, 'production', { publicUrl, ...paths });
    } else if(_.isPlainObject(ssbConfigObj)) {
      if(_.has(ssbConfigObj, 'prod')) {
        ssbConfig = _.get(ssbConfigObj, 'prod');
      } else if(_.has(ssbConfigObj, 'production')) {
        ssbConfig = _.get(ssbConfigObj, 'production');
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

if(ssbConfig.additionalManifestEntries && _.isArray(ssbConfig.additionalManifestEntries)) {
  additionalManifestEntries.push(...ssbConfig.additionalManifestEntries);
}

import runtimeCachingTmp from './cache-config.js';
let runtimeCaching = runtimeCachingTmp;

if(ssbConfig.runtimeCaching && _.isArray(ssbConfig.runtimeCaching)) {
  runtimeCaching = ssbConfig.runtimeCaching;
}

runtimeCaching.unshift({
  urlPattern: publicPath,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'start-url',
    expiration: {
      maxEntries: 1,
      maxAgeSeconds: 24 * 60 * 60 // 24 hours
    }
  }
});

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
  new MiniCssExtractPlugin({
    filename: cssFilename
  }),
];

if(ssbConfig.disableSW !== true) {
  plugins.push(
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath,
      filter(file) {
        if(/^[/]?[.]{2}[/]?/.test(file.path)) { return false; }
        if(/\.ts$/.test(file.path)) { return false; }
        if(/(^|[/])\./.test(file.name)) { return false; }
        return true;
      }
    }),
    new GenerateSW({
      // Don't precache sourcemaps (they're large) and build asset manifest:
      exclude: [/\.map$/, /asset-manifest\.json$/, /^[/]?[.]{2}/, /.ts$/],
      // `navigateFallback` and `navigateFallbackWhitelist` are disabled by default; see
      // https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#service-worker-considerations
      navigateFallback: publicUrl + '/index.html',
      navigateFallbackDenylist: [/^\/_/],
      additionalManifestEntries,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      runtimeCaching,
    })
  );
}

if(ssbConfig.plugins && _.isArray(ssbConfig.plugins)) {
  plugins.push(...ssbConfig.plugins);
}

const copyPatterns = [];

if(fs.existsSync(paths.publicDir)) {
  copyPatterns.push({
    from: paths.publicDir,
    to: paths.appDist,
    info: { minimized: true }
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

const packageJson = require(paths.appPackageJson);
const config = _.extend({}, packageJson.staticSiteBuilderConfig || {}, ssbConfig);
const rawMomentLocales = config && config.momentLocales;
if(rawMomentLocales === '') {
  plugins.push(new MomentLocalesPlugin());
} else if(rawMomentLocales) {
  plugins.push(new MomentLocalesPlugin({ localesToKeep: rawMomentLocales.split(/\s*,\s*/g) }));
}

const performance = {};

if(config && (config.sizeHints === false || config.sizeHints == 'warning' || config.sizeHints == 'error')) {
  performance.hints = config.sizeHints;
}

const getSizeValue = (val) => {
  if(_.isNil(val) || val === false) { return null; }
  if(_.isNumber(val) && !_.isNaN(val)) { return Math.round(val); }
  if(_.isString(val)) {
    let m = val.match(/^(\d+(?:\.\d+)?|\.\d+)([bkmg])?$/i);
    if(m) {
      let num = parseFloat(m[1]);
      if(!_.isNaN(num)) {
        let unit = m[2];
        if(!unit || unit === '') { unit = 'b'; }
        unit = unit.toLowerCase();
        let unitIndex = 'bkmg'.indexOf(unit);
        if(unitIndex >= 0 || unitIndex <= 3) {
          return Math.round(num * Math.pow(1024, unitIndex));
        }
      }
    }
  }
  return null;
};

let maxEntrypointSize = getSizeValue(config && config.maxEntrypointSize);

if(config && maxEntrypointSize) {
  performance.maxEntrypointSize = maxEntrypointSize;
}

let maxAssetSize = getSizeValue(config && config.maxAssetSize);

if(config && maxAssetSize) {
  performance.maxAssetSize = maxAssetSize;
}

const extraLoaders = [];

if(ssbConfig.extraLoaders && _.isArray(ssbConfig.extraLoaders)) {
  extraLoaders.push(...ssbConfig.extraLoaders);
}

let postcssOptions = {
  plugins: [require.resolve('postcss-preset-env'), require.resolve('cssnano')]
};

if(ssbConfig.postcssOptions && _.isPlainObject(ssbConfig.postcssOptions)) {
  postcssOptions = _.defaultsDeep({}, postcssOptions, ssbConfig.postcssOptions);
}

export default _.defaultsDeep({}, ssbConfig.webpack || {}, {
  mode: 'production',
  entry: {
    index: appIndex
  },
  devtool: 'source-map',
  output: {
    pathinfo: true,
    path: paths.appDist,
    publicPath: publicPath
  },
  resolve: {
    modules: ['node_modules'].concat(
      // It is guaranteed to exist because we tweak it in `env.js`
      process.env.NODE_PATH.split(path.delimiter).filter(Boolean)
    ),
    extensions: ['.js', '.cjs', '.mjs', '.ts', '.json', '.jsx', '.tsx'],
    plugins: resolvePlugins,
    roots: [paths.appPath, paths.publicDir],
  },
  module: {
    strictExportPresence: true,
    rules: [
      {
        test: /\.(t|[cm]?j)s$/,
        parser: { requireEnsure: false }
      },
      {
        oneOf: [
          ...extraLoaders,
          {
            test: /\.ts$/,
            exclude: [/[/\\\\]node_modules[/\\\\]/],
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
            test: /\.[cm]?js$/,
            exclude: [/[/\\\\]node_modules[/\\\\]/],
            use: [
              require.resolve('thread-loader'),
              {
                loader: require.resolve('babel-loader'),
                options: {
                  babelrc: false,
                  compact: true,
                  highlightCode: true,
                  presets: [require.resolve('@babel/preset-env')],
                  plugins: [[require.resolve('@babel/plugin-transform-runtime'), { regenerator: true }]]
                },
              },
            ]
          },
          {
            test: /\.[cm]?js$/,
            use: [
              require.resolve('thread-loader'),
              {
                loader: require.resolve('babel-loader'),
                options: {
                  babelrc: false,
                  compact: true,
                  // This is a feature of `babel-loader` for webpack (not Babel itself).
                  // It enables caching results in ./node_modules/.cache/babel-loader/
                  // directory for faster rebuilds.
                  cacheDirectory: true,
                  highlightCode: true,
                  presets: [require.resolve('@babel/preset-env')],
                  plugins: [[require.resolve('@babel/plugin-transform-runtime'), { regenerator: true }]]
                },
              },
            ]
          },
          {
            test: /\.css$/,
            use: [
              MiniCssExtractPlugin.loader,
              {
                loader: require.resolve('css-loader'),
                options: {
                  sourceMap: true,
                }
              },
              {
                loader: require.resolve('postcss-loader'),
                options: {
                  postcssOptions,
                  sourceMap: true
                }
              }
            ]
          },
          {
            test: /\.scss$/,
            use: [
              MiniCssExtractPlugin.loader,
              {
                loader: require.resolve('css-loader'),
                options: {
                  importLoaders: 1,
                  sourceMap: true
                }
              },
              {
                loader: require.resolve('postcss-loader'),
                options: {
                  postcssOptions,
                  sourceMap: true
                }
              },
              {
                loader: require.resolve('sass-loader'),
                options: {
                  sassOptions: {
                    outputStyle: 'compressed'
                  },
                  implementation: require.resolve('sass'),
                  sourceMap: true
                }
              }
            ]
          },
          {
            loader: require.resolve('file-loader'),
            // Exclude `js` files to keep "css" loader working as it injects
            // its runtime that would otherwise processed through "file" loader.
            // Also exclude `html` and `json` extensions so they get processed
            // by webpack's internal loaders.
            exclude: [/\.[cm]?jsx?$/, /\.tsx?$/, /\.svg$/, /\.html$/, /\.ejs$/, /\.hbs$/, /\.json$/, /^$/],
            options: {
              name: '[name].[ext]'
            }
          }
        ]
      }
    ]
  },
  optimization: {
    minimizer: [new TerserPlugin({
      extractComments: false
    })]
  },
  plugins,
  performance
});
