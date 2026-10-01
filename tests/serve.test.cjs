/* Run: node --test tests/serve.test.cjs
   Starts the local app server (Models/tools/viewer/scripts/serve.py) on a free port and
   checks what the page relies on: ping, folder browsing, model discovery, model reading,
   static files, and that pages from other sites are refused. Skipped when python3 is absent. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVE = path.join(__dirname, '../Models/tools/viewer/scripts/serve.py');
const python = ['python3', 'python'].find(p => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0);

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'smv-serve-')));
  const model = path.join(root, 'Repo', 'Sub', 'Demo.SemanticModel');
  fs.mkdirSync(path.join(model, 'definition', 'tables'), { recursive: true });
  fs.writeFileSync(path.join(model, 'definition', 'tables', 'Sales.tmdl'), '﻿table Sales\n\tcolumn A\n');
  fs.writeFileSync(path.join(model, 'notes.txt'), 'not a model file');
  fs.mkdirSync(path.join(root, 'Repo', '.git', 'Hidden.SemanticModel'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Repo', 'node_modules', 'Dep.SemanticModel'), { recursive: true });
  return { root, model };
}

async function start() {
  const proc = spawn(python, [SERVE, '--port', '0', '--idle-exit', '30'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const url = await new Promise((resolve, reject) => {
    proc.stdout.on('data', chunk => {
      out += chunk;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) resolve('http://127.0.0.1:' + m[1]);
    });
    proc.stderr.on('data', chunk => { out += chunk; });
    proc.on('exit', code => reject(new Error('serve.py exited with ' + code + ': ' + out)));
    setTimeout(() => reject(new Error('serve.py did not start: ' + out)), 10000);
  });
  return { proc, url, stop: () => proc.kill() };
}

const get = async (url, headers) => {
  const r = await fetch(url, { headers: headers || {} });
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  return { status: r.status, body };
};

test('serve.py answers the page: ping, browse, find, model, static files', { skip: !python && 'python3 not installed' }, async () => {
  const { root, model } = fixture();
  const s = await start();
  try {
    const ping = await get(s.url + '/api/ping');
    assert.equal(ping.status, 200);
    assert.equal(ping.body.ok, true);
    assert.ok(ping.body.home);

    const browse = await get(s.url + '/api/browse?path=' + encodeURIComponent(path.join(root, 'Repo')));
    assert.equal(browse.status, 200);
    assert.deepEqual(browse.body.dirs.map(d => d.name), ['node_modules', 'Sub'], 'hidden folders are not listed');
    assert.equal(browse.body.parent, root);
    assert.ok(browse.body.roots.length >= 1);
    const sub = await get(s.url + '/api/browse?path=' + encodeURIComponent(path.join(root, 'Repo', 'Sub')));
    assert.deepEqual(sub.body.dirs, [{ name: 'Demo.SemanticModel', path: model, model: true }]);

    const find = await get(s.url + '/api/find?path=' + encodeURIComponent(path.join(root, 'Repo')));
    assert.deepEqual(find.body.models, [{ name: 'Demo', path: 'Sub/Demo.SemanticModel', dir: model }],
      'ids match the browser-side scan; .git and node_modules are skipped');
    const self = await get(s.url + '/api/find?path=' + encodeURIComponent(model));
    assert.deepEqual(self.body.models, [{ name: 'Demo', path: 'Demo.SemanticModel', dir: model }]);

    const read = await get(s.url + '/api/model?path=' + encodeURIComponent(model));
    assert.deepEqual(read.body.files, [{ name: 'Sales.tmdl', path: 'definition/tables/Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }],
      'only model files, BOM stripped, paths with forward slashes');

    const index = await fetch(s.url + '/index.html');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Semantic Model Viewer/);

    assert.equal((await get(s.url + '/api/nope')).status, 404);
    const missing = await get(s.url + '/api/browse?path=' + encodeURIComponent(path.join(root, 'missing')));
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /Not a folder/);
  } finally { s.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('serve.py refuses requests from other websites and never writes', { skip: !python && 'python3 not installed' }, async () => {
  const { root } = fixture();
  const s = await start();
  try {
    assert.equal((await get(s.url + '/api/ping', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await get(s.url + '/api/ping', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await get(s.url + '/api/ping', { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
    const post = await fetch(s.url + '/api/model?path=' + encodeURIComponent(root), { method: 'POST', body: 'x' });
    assert.equal(post.status, 501, 'only GET is implemented');
  } finally { s.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});
