#!/usr/bin/env node
'use strict';
// Runs a Tauri command as QA Tool Lite: `node scripts/run-minimal.js dev|build [tauri args]`.
// QA_TOOL_MINIMAL picks the Angular `minimal` configuration (scripts/ng-wrapper.js) and
// TAURI_CONFIG gives the app its Lite name and identifier (scripts/minimal-config.js).
const {spawnSync} = require('child_process');
const {minimalConfig} = require('./minimal-config');

const env = {...process.env, QA_TOOL_MINIMAL: '1', TAURI_CONFIG: JSON.stringify(minimalConfig())};
const [command, ...args] = process.argv.slice(2);
if (command === 'build') spawnSync('node', ['scripts/build-info.js'], {stdio: 'inherit'});
const r = spawnSync('npx', ['tauri', command, ...args], {stdio: 'inherit', env});
process.exit(r.status ?? 1);
