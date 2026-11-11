#!/usr/bin/env node
'use strict';
// The Tauri config QA Tool Lite is built with, merged over tauri.conf.json through TAURI_CONFIG:
// its own name and its own `identifier`, so it keeps its own saved devices, logs and app data and
// can be installed next to QA Tool. Linux package and binary names cannot hold spaces.
//   node scripts/minimal-config.js [linux]   prints the JSON (CI writes it into TAURI_CONFIG)
const fs = require('fs');
const path = require('path');

const NAME = 'QA Tool Lite';

function minimalConfig(linux = process.platform === 'linux') {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const windows = base.app.windows.map(w => ({...w, title: NAME}));
  const config = {identifier: `${base.identifier}.lite`, productName: NAME, app: {windows}};
  if (linux) Object.assign(config, {productName: 'qa-tool-lite', mainBinaryName: 'qa-tool-lite'});
  return config;
}

module.exports = {minimalConfig};

if (require.main === module) {
  process.stdout.write(JSON.stringify(minimalConfig(process.argv[2] === 'linux' || undefined)));
}
