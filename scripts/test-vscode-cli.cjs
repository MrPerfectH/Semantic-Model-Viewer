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
  let legacyCodePage = false;
  if (process.platform === 'win32') {
    const chcp = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'chcp.com');
    const originalPage = spawnSync(chcp, [], { env, encoding: 'utf8' }).stdout.match(/\d+/)?.[0];
    assert.ok(originalPage, 'Native Windows acceptance requires a console code page');
    const probe = path.join(temp, 'legacy-codepage.cmd');
    // Keep this probe ASCII: the installed launcher contains the Unicode path.
    fs.writeFileSync(probe, [
      '@echo off',
      '@"%SystemRoot%\\System32\\chcp.com" 437 >nul',
      '@call "%~dp0bin\\smv.cmd" --version',
      '@set "SMV_PROBE_EXIT=%errorlevel%"',
      '@"%SystemRoot%\\System32\\chcp.com"',
      '@"%SystemRoot%\\System32\\chcp.com" ' + originalPage + ' >nul',
      '@exit /b %SMV_PROBE_EXIT%', '',
    ].join('\r\n'));
    const result = spawnSync(process.env.ComSpec, ['/d', '/s', '/c', '""' + probe + '""'], { env, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 45000 });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.equal(result.stdout.trim().split(/\r?\n/)[0], info.engineVersion);
    assert.match(result.stdout, /437/, 'Launcher must restore the caller code page');
    const failure = spawnSync(process.env.ComSpec, ['/d', '/s', '/c', '""' + command + '" "not-a-command""'], { env, encoding: 'utf8', windowsVerbatimArguments: true, timeout: 45000 });
    assert.equal(failure.error, undefined);
    assert.ok(Number.isInteger(failure.status) && failure.status !== 0, 'Restoring the code page must preserve CLI failures');
    legacyCodePage = true;
  }
  assert.equal(run(['--version']).trim(), info.engineVersion);
  const model = path.join(root, 'Models/demo/Contoso Retail.SemanticModel'), out = path.join(temp, 'comparison.html');
  run(['compare', model, '--measure', 'Total Sales', '--with', 'Sales LY', '--out', out]);
  assert.ok(fs.statSync(out).size > 100000);
  console.log(JSON.stringify({ passed: true, externalCommand: true, noNodeOnPath: true, platform: process.platform, legacyCodePage, comparisonBytes: fs.statSync(out).size }));
} finally { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
