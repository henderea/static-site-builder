const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const {GenerateSW} = require('workbox-webpack-plugin');
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

module.exports = {
    mode: 'development',
    entry: {
        index: paths.appIndexJs
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
                            'style-loader',
                            'css-loader'
                        ]
                    },
                    {
                        test: /\.scss$/,
                        use: [
                            'style-loader',
                            'css-loader',
                            'sass-loader'
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
        }),
    ],
    performance: {
        hints: false,
    },
};