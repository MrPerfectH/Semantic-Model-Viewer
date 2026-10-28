'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(process.argv[2]), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'SMV extension CLI α '));
try {
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  const { command } = require('../vscode-extension/src/cli').installExternal(root, path.join(temp, 'storage'), { binDir: path.join(temp, 'bin') });
  const env = { ...process.env, PATH: '', SMV_OPENER: 'none', SMV_PACKAGE_CACHE: path.join(temp, 'cache') }; delete env.SMV_NODE;
  const run = args => {
    const result = process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', '"' + [command, ...args].map(a => '"' + a + '"').join(' ') + '"'], { env, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 45000 })
      : spawnSync(command, args, { env, encoding: 'utf8', timeout: 45000 });
    assert.equal(result.status, 0, result.stderr || String(result.error)); return result.stdout;
  };
  assert.equal(run(['--version']).trim(), info.engineVersion);
  const model = path.join(root, 'Models/demo/Contoso Retail.SemanticModel'), out = path.join(temp, 'comparison.html');
  run(['compare', model, '--measure', 'Total Sales', '--with', 'Sales LY', '--out', out]);
  assert.ok(fs.statSync(out).size > 100000);
  console.log(JSON.stringify({ passed: true, externalCommand: true, noNodeOnPath: true, platform: process.platform, comparisonBytes: fs.statSync(out).size }));
} finally { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
