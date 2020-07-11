const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { GenerateSW } = require('workbox-webpack-plugin');
const MomentLocalesPlugin = require('moment-locales-webpack-plugin');
const postCssEnv = require('postcss-preset-env');
const getClientEnvironment = require('./env');
const paths = require('./paths');
const _ = require('lodash');
const crypto = require('crypto')

// Webpack uses `publicPath` to determine where the app is being served from.
// It requires a trailing slash, or the file assets will get an incorrect path.
const publicPath = paths.servedPath;
// Some apps do not use client-side routing with pushState.
// For these, "homepage" can be set to "." to enable relative asset paths.
const shouldUseRelativeAssetPaths = publicPath === './';
// `publicUrl` is just like `publicPath`, but we will provide it to our app
// as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
// Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
const publicUrl = publicPath.slice(0, -1);

let env = getClientEnvironment(publicUrl);

const cssFilename = '[name].css';

const getRevision = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

let additionalManifestEntries = undefined;

if(fs.existsSync(paths.publicDir)) {
    additionalManifestEntries = globby.sync(['**/*', '!asset-manifest.json', '!service-worker.js'], { cwd: paths.publicDir }).map(f => ({ url: `${publicUrl}/${f}`, revision: getRevision(path.join(paths.publicDir, f)) }));
}

const plugins = [
    new webpack.DefinePlugin(env.stringified),
    new HtmlWebpackPlugin({
        filename: 'index.html',
        template: paths.appTemplate,
        inject: 'head',
        minify: { collapseWhitespace: true }
    }),
    new CaseSensitivePathsPlugin(),
    new MiniCssExtractPlugin({
        filename: cssFilename
    }),
    new ManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: publicPath
    }),
    new GenerateSW({
        // Don't precache sourcemaps (they're large) and build asset manifest:
        exclude: [/\.map$/, /asset-manifest\.json$/],
        // `navigateFallback` and `navigateFallbackWhitelist` are disabled by default; see
        // https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#service-worker-considerations
        navigateFallback: publicUrl + '/index.html',
        navigateFallbackDenylist: [/^\/_/],
        additionalManifestEntries,
    }),
];

let ssbConfig = {};

if(fs.existsSync(paths.ssbConfig)) {
    let ssbConfigObj = require(paths.ssbConfig);
    if(ssbConfigObj) {
        if(_.isFunction(ssbConfigObj)) {
            ssbConfig = ssbConfigObj(env, 'production', { publicUrl, ...paths });
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

if(ssbConfig.plugins && _.isArray(ssbConfig.plugins)) {
    plugins.push(...ssbConfig.plugins);
}

if(ssbConfig.env && _.isPlainObject(ssbConfig.env)) {
    env = _.extend({}, env, ssbConfig.env)
}

const copyPatterns = [];

if(fs.existsSync(paths.publicDir)) {
    copyPatterns.push({
        from: paths.publicDir,
        to: paths.appDist
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

const getSizeValue = val => {
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
}

let maxEntrypointSize = getSizeValue(config && config.maxEntrypointSize);

if(config && maxEntrypointSize) {
    performance.maxEntrypointSize = maxEntrypointSize;
}

let maxAssetSize = getSizeValue(config && config.maxAssetSize);

if(config && maxAssetSize) {
    performance.maxAssetSize = maxAssetSize;
}

module.exports = _.defaultsDeep({}, ssbConfig.webpack || {}, {
    mode: 'production',
    entry: {
        index: paths.appIndexJs
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
        extensions: ['.js', '.json'],
    },
    module: {
        strictExportPresence: true,
        rules: [
            { parser: { requireEnsure: false } },
            {
                oneOf: [
                    {
                        test: /\.js$/,
                        exclude: [/[/\\\\]node_modules[/\\\\]/],
                        use: [
                            require.resolve('thread-loader'),
                            {
                                loader: require.resolve('babel-loader'),
                                options: {
                                    babelrc: false,
                                    compact: true,
                                    highlightCode: true,
                                },
                            },
                        ]
                    },
                    {
                        test: /\.js$/,
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
                        use: [
                            MiniCssExtractPlugin.loader,
                            {
                                loader: 'css-loader',
                                options: {
                                    sourceMap: true,
                                }
                            }
                        ]
                    },
                    {
                        test: /\.scss$/,
                        use: [
                            MiniCssExtractPlugin.loader,
                            {
                                loader: 'css-loader',
                                options: {
                                    importLoaders: 1,
                                    sourceMap: true,
                                }
                            },
                            {
                                loader: 'postcss-loader',
                                options: {
                                    ident: 'postcss',
                                    plugins: (loader) => [
                                        postCssEnv()
                                    ],
                                    sourceMap: true
                                }
                            },
                            {
                                loader: 'sass-loader',
                                options: {
                                    sassOptions: {
                                        outputStyle: 'compressed'
                                    },
                                    sourceMap: true
                                }
                            }
                        ]
                    },
                    {
                        loader: require.resolve('file-loader'),
                        // Exclude `js` files to keep "css" loader working as it injects
                        // it's runtime that would otherwise processed through "file" loader.
                        // Also exclude `html` and `json` extensions so they get processed
                        // by webpack's internal loaders.
                        exclude: [/\.js$/, /\.html$/, /\.ejs$/, /\.hbs$/, /\.json$/],
                        options: {
                            name: '[name].[ext]'
                        }
                    }
                ]
            }
        ]
    },
    plugins,
    performance
});