'use strict';

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'development';
process.env.NODE_ENV = 'development';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
    throw err;
});

require('../config/env');

const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');
const webpack = require('webpack');
const config = require('../config/webpack.config.dev');
const paths = require('../config/paths');
const checkRequiredFiles = require('../utils/checkRequiredFiles');
const formatWebpackMessages = require('../utils/formatWebpackMessages');
const FileSizeReporter = require('../utils/FileSizeReporter');
const printBuildError = require('../utils/printBuildError');

const measureFileSizesBeforeBuild =
    FileSizeReporter.measureFileSizesBeforeBuild;
const printFileSizesAfterBuild = FileSizeReporter.printFileSizesAfterBuild;

const WARN_AFTER_BUNDLE_GZIP_SIZE = 512 * 1024;
const WARN_AFTER_CHUNK_GZIP_SIZE = 1024 * 1024;

if(!checkRequiredFiles([paths.appTemplate, paths.appIndex])) {
    process.exit(1);
}

measureFileSizesBeforeBuild(paths.appBuild)
    .then(previousFileSizes => {
        // Remove all content but keep the directory so that
        // if you're in it, you don't end up in Trash
        fs.emptyDirSync(paths.appBuild);
        // Start the webpack build
        return build(previousFileSizes,
            ({ stats, previousFileSizes, warnings }) => {
                if(warnings.length) {
                    console.log(chalk.yellow('Compiled with warnings.\n'));
                    console.log(warnings.join('\n\n'));
                    console.log(
                        '\nSearch for the ' +
                        chalk.underline(chalk.yellow('keywords')) +
                        ' to learn more about each warning.'
                    );
                    console.log(
                        'To ignore, add ' +
                        chalk.cyan('// eslint-disable-next-line') +
                        ' to the line before.\n'
                    );
                } else {
                    console.log(chalk.green('Compiled successfully.\n'));
                }

                console.log('File sizes after gzip:\n');
                printFileSizesAfterBuild(
                    stats,
                    previousFileSizes,
                    paths.appBuild,
                    WARN_AFTER_BUNDLE_GZIP_SIZE,
                    WARN_AFTER_CHUNK_GZIP_SIZE
                );
                console.log();
            },
            err => {
                console.log(chalk.red('Failed to compile.\n'));
                printBuildError(err);
            });
    })
    .catch(err => {
        if(err && err.message) {
            console.log(err.message);
        }
    });

// Create the production build and print the deployment instructions.
function build(previousFileSizes, resolve, reject) {
    let compiler = webpack(config);
    compiler.watch({}, (err, stats) => {
        if(err) {
            return reject(err);
        }
        const messages = formatWebpackMessages(stats.toJson({}, true));
        if(messages.errors.length) {
            // Only keep the first error. Others are often indicative
            // of the same problem, but confuse the reader with noise.
            if(messages.errors.length > 1) {
                messages.errors.length = 1;
            }
            return reject(new Error(messages.errors.join('\n\n')));
        }
        if(
            process.env.CI &&
            (typeof process.env.CI !== 'string' ||
                process.env.CI.toLowerCase() !== 'false') &&
            messages.warnings.length
        ) {
            console.log(
                chalk.yellow(
                    '\nTreating warnings as errors because process.env.CI = true.\n' +
                    'Most CI servers set it automatically.\n'
                )
            );
            return reject(new Error(messages.warnings.join('\n\n')));
        }
        return resolve({
            stats,
            previousFileSizes,
            warnings: messages.warnings,
        });
    });
}