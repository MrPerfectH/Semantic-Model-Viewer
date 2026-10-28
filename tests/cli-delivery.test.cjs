'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { installExternal } = require('../vscode-extension/src/cli');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(root, version) {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  const text = '#!/bin/sh\nprintf "%s\\n" ' + version + ' "$@"\n';
  fs.writeFileSync(path.join(root, 'bin/smv'), text);
  const files = { 'bin/smv': hash(text) };
  const info = { sha256: hash(JSON.stringify(files)), files, host: 'codex', targets: ['linux-x64'] };
  fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info));
  return info;
}
test('external launcher survives extension replacement, updates and needs no Node on PATH', { skip: process.platform === 'win32' }, t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smv cli user's spaces "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'extension'), storage = path.join(dir, 'storage'), binDir = path.join(dir, 'bin');
  fixture(root, 'old');
  const old = installExternal(root, storage, { binDir });
  fs.rmSync(root, { recursive: true });
  const run = () => spawnSync(old.command, ['--table', 'Sales with spaces'], { env: { PATH: '' }, encoding: 'utf8' });
  assert.equal(run().stdout, 'old\n--table\nSales with spaces\n');
  fixture(root, 'new'); installExternal(root, storage, { binDir });
  assert.equal(run().stdout, 'new\n--table\nSales with spaces\n');
  assert.ok(fs.existsSync(path.join(storage, 'cli', old.identity)), 'Old generations are retained for live sessions');
});
test('external installation preserves unrelated commands and rejects a corrupt payload', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv cli refusal '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'extension'), storage = path.join(dir, 'storage'), binDir = path.join(dir, 'bin');
  fixture(root, 'test'); fs.mkdirSync(binDir);
  const command = path.join(binDir, process.platform === 'win32' ? 'smv.cmd' : 'smv');
  fs.writeFileSync(command, 'user owned');
  assert.throws(() => installExternal(root, storage, { binDir }), /unrelated/);
  assert.equal(fs.readFileSync(command, 'utf8'), 'user owned'); fs.unlinkSync(command);
  fs.appendFileSync(path.join(root, 'bin/smv'), 'modified');
  assert.throws(() => installExternal(root, storage, { binDir }), /checksum mismatch/);
  assert.ok(!fs.existsSync(command));
});
test('Codex marketplace package uses the complete bundled payload and rejects source-only packages', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv release catalog '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'plugin'), out = path.join(dir, 'catalog'); fixture(root, 'version');
  const { build } = require('../scripts/build-codex-marketplace.cjs'); build(root, out);
  const entry = JSON.parse(fs.readFileSync(path.join(out, '.agents/plugins/marketplace.json'), 'utf8')).plugins[0];
  assert.ok(fs.existsSync(path.join(out, entry.source.path, 'build-info.json')));
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8')); info.targets = [];
  fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info));
  assert.throws(() => build(root, out + '-bad'), /complete Codex/);
});
test('release catalogs pin actual checksums and preserve other plugins', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv release receipts '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = ['smv-claude-portable.zip', 'smv-codex-portable.zip', 'smv-codex-marketplace.zip'];
  for (const name of files) { fs.writeFileSync(path.join(dir, name), name); fs.writeFileSync(path.join(dir, name + '.sha256'), hash(name) + '  ' + name + '\n'); }
  const { prepare } = require('../scripts/prepare-agent-release.cjs');
  const out = path.join(dir, 'release'); prepare({ assets: dir, out, tag: 'v0.5.0', repository: 'MrPerfectH/Semantic-Model-Viewer' });
  const release = path.join(out, 'claude-marketplace.json');
  const incoming = JSON.parse(fs.readFileSync(release, 'utf8')).plugins[0];
  assert.equal(incoming.source.sha256, hash(files[0])); assert.match(incoming.source.url, /v0\.5\.0\/smv-claude-portable.zip$/);
  const catalog = path.join(dir, 'existing.json'), cleaner = { name: 'semantic-model-cleaner', source: './cleaner' };
  fs.writeFileSync(catalog, JSON.stringify({ name: 'semantic-model-tools', plugins: [{ name: 'semantic-model-viewer', source: './old' }, cleaner] }));
  require('../scripts/update-agent-catalog.cjs').update(catalog, release);
  assert.deepEqual(JSON.parse(fs.readFileSync(catalog, 'utf8')).plugins[1], cleaner);
  fs.appendFileSync(path.join(dir, files[0]), 'corruption');
  assert.throws(() => prepare({ assets: dir, out, tag: 'v0.5.0', repository: 'MrPerfectH/Semantic-Model-Viewer' }), /checksum mismatch/);
});
