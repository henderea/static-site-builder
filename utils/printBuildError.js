/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

import chalk from 'chalk';

export default function printBuildError(err) {
  const message = err != null && err.message;
  const stack = err != null && err.stack;

  // Add more helpful message for UglifyJs error
  if(
    stack &&
    typeof message === 'string' &&
    message.indexOf('from UglifyJs') !== -1
  ) {
    try {
      const matched = /(.+)\[(.+):(.+),(.+)\]\[.+\]/.exec(stack);
      if(!matched) {
        throw new Error('Using errors for control flow is bad.');
      }
      const problemPath = matched[2];
      const line = matched[3];
      const column = matched[4];
      console.log(
        'Failed to minify the code from this file: \n\n',
        chalk.yellow(
          `\t${problemPath}:${line}${column !== '0' ? ':' + column : ''}`
        ),
        '\n'
      );
    } catch (_ignored) {
      console.log('Failed to minify the bundle.', err);
    }
    console.log('Read more here: http://bit.ly/CRA-build-minify');
  } else {
    console.log((message || err) + '\n');
  }
  console.log();
}
