/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

import path from 'path';
import fs from 'fs';
import url from 'url';
import { findMonorepo } from '../utils/workspaceUtils.js';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Make sure any symlinks in the project folder are resolved:
// https://github.com/facebookincubator/create-react-app/issues/637
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);

const resolveAppFirst = (...paths) => {
  return resolveApp(paths.find((e) => fs.existsSync(resolveApp(e))) || paths[0]);
};

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

const getPublicUrl = (appPackageJson) =>
  envPublicUrl || JSON.parse(fs.readFileSync(appPackageJson)).homepage;

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

const resolveOwn = (relativePath) => path.resolve(dirname, '..', relativePath);

export const dotenv = resolveApp('.env');
export const ssbConfig = resolveApp('static-site-builder.config.js');
export const publicDir = resolveApp('public');
export const tsConfig = resolveApp('tsconfig.json');
export const appPath = resolveApp('.');
export const appBuild = resolveApp('build');
export const appDist = resolveApp('dist');
export const appTemplate = resolveAppFirst('src/index.html', 'src/index.ejs', 'src/index.hbs');
export const appIndex = resolveAppFirst('src/index.js', 'src/index.ts');
export const appPackageJson = resolveApp('package.json');
export const appSrc = resolveApp('src');
export const testsSetup = resolveApp('src/setupTests.js');
export const appNodeModules = resolveApp('node_modules');
export const publicUrl = getPublicUrl(resolveApp('package.json'));
export const servedPath = getServedPath(resolveApp('package.json'));
export const ownPath = resolveOwn('.');
export const ownNodeModules = resolveOwn('node_modules');
const srcPaths = [appSrc];

let useYarn = fs.existsSync(
  path.join(appPath, 'yarn.lock')
);

let checkForMonorepo = true;

if(checkForMonorepo) {
  // if app is in a monorepo (lerna or yarn workspace), treat other packages in
  // the monorepo as if they are app source
  const mono = findMonorepo(appDirectory);
  if(mono.isAppIncluded) {
    Array.prototype.push.apply(srcPaths, mono.pkgs);
  }
  useYarn = useYarn || mono.isYarnWs;
}

export {
  resolveApp,
  resolveAppFirst,
  resolveOwn,
  ensureSlash,
  srcPaths,
  useYarn
};
