const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const SWPrecacheWebpackPlugin = require('sw-precache-webpack-plugin');
const getClientEnvironment = require('./env');
const paths = require('./paths');

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

const env = getClientEnvironment(publicUrl);

const cssFilename = '[name].css';

module.exports = {
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
                                    minimize: true,
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
                                    minimize: true,
                                    sourceMap: true,
                                }
                            },
                            {
                                loader: 'sass-loader',
                                options: {
                                    outputStyle: 'compressed',
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
    plugins: [
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
        new SWPrecacheWebpackPlugin({
            // By default, a cache-busting query parameter is appended to requests
            // used to populate the caches, to ensure the responses are fresh.
            // If a URL is already hashed by Webpack, then there is no concern
            // about it being stale, and the cache-busting can be skipped.
            dontCacheBustUrlsMatching: /\.\w{8}\./,
            filename: 'service-worker.js',
            logger(message) {
                if(message.indexOf('Total precache size is') === 0) {
                    // This message occurs for every build and is a bit too noisy.
                    return;
                }
                if(message.indexOf('Skipping static resource') === 0) {
                    // This message obscures real errors so we ignore it.
                    // https://github.com/facebook/create-react-app/issues/2612
                    return;
                }
                console.log(message);
            },
            minify: true,
            // Don't precache sourcemaps (they're large) and build asset manifest:
            staticFileGlobsIgnorePatterns: [/\.map$/, /asset-manifest\.json$/],
            // `navigateFallback` and `navigateFallbackWhitelist` are disabled by default; see
            // https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#service-worker-considerations
            navigateFallback: publicUrl + '/index.html',
            // navigateFallbackWhitelist: [/^(?!\/__).*/],
        }),
    ],
};