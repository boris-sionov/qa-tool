#!/usr/bin/env node
'use strict';
// Runs a Tauri command as QA Tool Lite: `node scripts/run-minimal.js dev|build [tauri args]`.
// QA_TOOL_MINIMAL picks the Angular `minimal` configuration (scripts/ng-wrapper.js) and
// TAURI_CONFIG gives the app its Lite name and identifier (scripts/minimal-config.js).
const {spawnSync} = require('child_process');
const {minimalConfig} = require('./minimal-config');

const [command, ...args] = process.argv.slice(2);
const config = minimalConfig();
// Lite serves on its own port, so it can run next to QA Tool (4281) in dev.
// (`build` is only honoured through --config, not through TAURI_CONFIG.)
const extra = [];
if (command === 'dev') {
  extra.push('--config', JSON.stringify({build: {beforeDevCommand: 'npm run ng serve -- --port 4282', devUrl: 'http://localhost:4282'}}));
}
const env = {...process.env, QA_TOOL_MINIMAL: '1', TAURI_CONFIG: JSON.stringify(config)};
if (command === 'build') spawnSync('node', ['scripts/build-info.js'], {stdio: 'inherit'});
const r = spawnSync('npx', ['tauri', command, ...extra, ...args], {stdio: 'inherit', env});
process.exit(r.status ?? 1);
