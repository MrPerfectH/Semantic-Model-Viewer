'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('capabilities stay aligned with the command help catalog and declared contracts', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'bin/smv.cjs'), 'capabilities'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const capabilities = JSON.parse(run.stdout);
  const help = require('../Models/tools/viewer/scripts/cli/help.cjs');
  assert.deepEqual(Object.keys(capabilities.commands), Object.keys(help.commands));
  assert.equal(capabilities.entryPoint, 'smv');
  assert.equal(capabilities.viewSchemaVersion, 2);
  assert.deepEqual(capabilities.inputFormats, ['TMDL model folder', 'TMDL definition folder', 'BIM file']);
  assert.equal(capabilities.metadataOnly, true);
  assert.deepEqual(capabilities.execution, { dax: false, m: false, sql: false, modelFileWrites: false });
  assert.deepEqual(capabilities.sessions, { managed: true, compatibleSessionReuse: true, revisionChecks: true, applyRequiresExplicitFlag: true });
  assert.equal(capabilities.version, require('../.claude-plugin/plugin.json').version);
});
