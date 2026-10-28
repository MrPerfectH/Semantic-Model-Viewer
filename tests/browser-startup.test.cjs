const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('demo browser startup timeout reaps Chrome and removes its temporary profile', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-browser-startup-'));
  try {
    const chrome = path.join(dir, 'stalled-chrome');
    fs.writeFileSync(chrome, '#!/bin/sh\nexec sleep 60\n', { mode: 0o755 });
    const preload = path.join(dir, 'shorten-startup.cjs');
    // Exercise the real failure path without spending the full cold-start allowance.
    fs.writeFileSync(preload, 'const original = global.setTimeout; global.setTimeout = (fn, ms, ...args) => original(fn, ms === 30000 ? 100 : ms, ...args);\n');
    const env = { ...process.env, CHROME_PATH: chrome, TMPDIR: dir, TMP: dir, TEMP: dir };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--require', preload, '--test', path.join(__dirname, 'demo-initial-viewport.browser.cjs')], {
      env, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Chrome did not start/);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['shorten-startup.cjs', 'stalled-chrome']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
