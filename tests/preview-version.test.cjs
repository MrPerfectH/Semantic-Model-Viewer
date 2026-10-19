'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

for (const [stable, run, expected] of [
  ['0.3.9', '123', '0.5.123'],
  ['0.4.2', '124', '0.5.124'],
  ['0.6.0', '125', '0.7.125'],
  ['1.0.0', '1', '1.1.1'],
  ['0.3.9', '', null],
  ['0.3.9', '12-beta', null],
  ['0.3.9', '0', null],
]) {
  test(`preview version for ${stable}, run ${JSON.stringify(run)}`, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-preview-version-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, 'scripts'));
    fs.copyFileSync(path.join(__dirname, '../vscode-extension/scripts/preview-version.cjs'),
      path.join(directory, 'scripts/preview-version.cjs'));
    const manifest = { name: 'semantic-model-viewer', version: stable };
    const lock = { version: stable, packages: { '': { version: stable }, dependency: { version: '2.0.0' } } };
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify(lock));
    const invoke = () => spawnSync(process.execPath, [path.join(directory, 'scripts/preview-version.cjs')], {
      env: { ...process.env, GITHUB_RUN_NUMBER: run }, encoding: 'utf8',
    });
    const result = invoke();
    if (!expected) {
      assert.notEqual(result.status, 0);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))), manifest);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'))), lock);
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const readVersion = file => JSON.parse(fs.readFileSync(path.join(directory, file)));
    assert.equal(readVersion('package.json').version, expected);
    assert.equal(readVersion('package-lock.json').version, expected);
    assert.equal(readVersion('package-lock.json').packages[''].version, expected);
    assert.equal(readVersion('package-lock.json').packages.dependency.version, '2.0.0');
  });
}
