/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const url = require('url');
const findMonorepo = require('../utils/workspaceUtils').findMonorepo;

// Make sure any symlinks in the project folder are resolved:
// https://github.com/facebookincubator/create-react-app/issues/637
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);

const resolveAppFirst = (...paths) => {
    return resolveApp(paths.find((e) => fs.existsSync(resolveApp(e))) || paths[0]);
}

const envPublicUrl = process.env.PUBLIC_URL;

function ensureSlash(path, needsSlash) {
    const hasSlash = path.endsWith('/');
    if(hasSlash && !needsSlash) {
        return path.substr(path, path.length - 1);
    } else if(!hasSlash && needsSlash) {
        return `${path}/`;
    } else {
        return path;
    }
}

const getPublicUrl = appPackageJson =>
    envPublicUrl || require(appPackageJson).homepage;

// We use `PUBLIC_URL` environment variable or "homepage" field to infer
// "public path" at which the app is served.
// Webpack needs to know it to put the right <script> hrefs into HTML even in
// single-page apps that may serve index.html for nested URLs like /todos/42.
// We can't use a relative path in HTML because we don't want to load something
// like /todos/42/static/js/bundle.7289d.js. We have to know the root.
function getServedPath(appPackageJson) {
    const publicUrl = getPublicUrl(appPackageJson);
    const servedUrl =
        envPublicUrl || (publicUrl ? url.parse(publicUrl).pathname : '/');
    return ensureSlash(servedUrl, true);
}

const resolveOwn = relativePath => path.resolve(__dirname, '..', relativePath);

module.exports = {
    dotenv: resolveApp('.env'),
    ssbConfig: resolveApp('static-site-builder.config.js'),
    publicDir: resolveApp('public'),
    tsConfig: resolveApp('tsconfig.json'),
    appPath: resolveApp('.'),
    appBuild: resolveApp('build'),
    appDist: resolveApp('dist'),
    appTemplate: resolveAppFirst('src/index.html', 'src/index.ejs', 'src/index.hbs'),
    appIndex: resolveAppFirst('src/index.js', 'src/index.ts'),
    appPackageJson: resolveApp('package.json'),
    appSrc: resolveApp('src'),
    testsSetup: resolveApp('src/setupTests.js'),
    appNodeModules: resolveApp('node_modules'),
    publicUrl: getPublicUrl(resolveApp('package.json')),
    servedPath: getServedPath(resolveApp('package.json')),
    ownPath: resolveOwn('.'),
    ownNodeModules: resolveOwn('node_modules'),
    resolveApp,
    resolveAppFirst,
    resolveOwn,
    ensureSlash
};


module.exports.srcPaths = [module.exports.appSrc];

module.exports.useYarn = fs.existsSync(
  path.join(module.exports.appPath, 'yarn.lock')
);

let checkForMonorepo = true;

if (checkForMonorepo) {
  // if app is in a monorepo (lerna or yarn workspace), treat other packages in
  // the monorepo as if they are app source
  const mono = findMonorepo(appDirectory);
  if (mono.isAppIncluded) {
    Array.prototype.push.apply(module.exports.srcPaths, mono.pkgs);
  }
  module.exports.useYarn = module.exports.useYarn || mono.isYarnWs;
}