#!/usr/bin/env node
'use strict';

/**
 * Regenerates src/build-info.json — the app's version banner (semver + build number).
 * A bump also sets the version in package.json and package-lock.json to `1.BUILD.0` (version-for.js).
 *
 * The build number lives in that file and is committed, so it survives clean checkouts.
 * It is bumped only when invoked with --bump AND the working tree moved since the last
 * bump (different HEAD commit, or a dirty tree), so a repeated `npm run build` on the
 * same commit keeps the same build number instead of inflating it.
 *
 *   node scripts/build-info.js            refresh commit/date only (dev)
 *   node scripts/build-info.js --bump     bump when there is a new update (release build)
 *   node scripts/build-info.js --bump --force   always bump
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const {versionFor} = require('./version-for');

const root = path.resolve(__dirname, '..');
const outFile = path.join(root, 'src', 'build-info.json');

function git(args) {
  try {
    return child_process.execSync(`git ${args}`, {cwd: root, stdio: ['ignore', 'pipe', 'ignore']})
      .toString().trim();
  } catch (e) {
    return '';
  }
}

function readCurrent() {
  try {
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } catch (e) {
    return {};
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}

const pkg = readJson('package.json');
const current = readCurrent();

const commit = git('rev-parse --short HEAD');
// Ignore our own output file, so a second build on the same commit does not re-bump.
const dirty = git('status --porcelain')
  .split('\n')
  .filter((line) => line.trim() && !line.endsWith('src/build-info.json'))
  .length > 0;
const bump = process.argv.includes('--bump');
const force = process.argv.includes('--force');

let build = Number.isFinite(current.build) ? current.build : 0;
const isNewUpdate = !commit || commit !== current.commit || dirty;
if (bump && (force || isNewUpdate || build === 0)) {
  build += 1;
  // The version is the build (1.BUILD.0), so it moves with the counter and only here.
  pkg.version = versionFor(build);
  writeJson('package.json', pkg);
  const lock = readJson('package-lock.json');
  lock.version = pkg.version;
  lock.packages[''].version = pkg.version;
  writeJson('package-lock.json', lock);
}

const info = {
  version: pkg.version,
  build,
  commit,
  branch: git('rev-parse --abbrev-ref HEAD'),
  // Built with uncommitted changes, so the commit above does not fully describe it.
  dirty,
  builtAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
};

fs.writeFileSync(outFile, `${JSON.stringify(info, null, 2)}\n`);
console.log(`build-info: v${info.version} (build ${info.build})${info.commit ? ` · ${info.commit}` : ''}`);
