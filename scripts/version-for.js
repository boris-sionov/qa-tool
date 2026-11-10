#!/usr/bin/env node
'use strict';

/**
 * The app version for a build number: `1.BUILD.0`, rolling to `2.0.0` after `1.255.0`, because a
 * Windows installer (MSI) takes `X.Y.Z` only with X and Y ≤ 255. Run this file to self-check.
 */
function versionFor(build) {
  if (!Number.isInteger(build) || build < 0) {
    throw new Error(`build number must be a non-negative integer, got ${build}`);
  }
  return `${1 + Math.floor(build / 256)}.${build % 256}.0`;
}

module.exports = {versionFor};

if (require.main === module) {
  const assert = require('assert');
  assert.strictEqual(versionFor(0), '1.0.0');
  assert.strictEqual(versionFor(36), '1.36.0');
  assert.strictEqual(versionFor(255), '1.255.0');
  assert.strictEqual(versionFor(256), '2.0.0');
  assert.strictEqual(versionFor(300), '2.44.0');
  assert.throws(() => versionFor(-1));
  assert.throws(() => versionFor(1.5));
  console.log('version-for: ok');
}
