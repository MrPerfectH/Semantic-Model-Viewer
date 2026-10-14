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
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'smv-serve-')));
  const model = path.join(root, 'Repo', 'Sub', 'Demo.SemanticModel');
  fs.mkdirSync(path.join(model, 'definition', 'tables'), { recursive: true });
  fs.writeFileSync(path.join(model, 'definition', 'tables', 'Sales.tmdl'), '﻿table Sales\n\tcolumn A\n');
  fs.writeFileSync(path.join(model, 'notes.txt'), 'not a model file');
  fs.mkdirSync(path.join(root, 'Repo', '.git', 'Hidden.SemanticModel'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Repo', 'node_modules', 'Dep.SemanticModel'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Repo', 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Repo', 'analysis', 'unrelated.json'), '{"unrelated":true}');
  fs.writeFileSync(path.join(root, 'Repo', '.git', 'Hidden.SemanticModel', 'model.bim'), '{}');
  fs.writeFileSync(path.join(root, 'Repo', 'node_modules', 'Dep.SemanticModel', 'model.bim'), '{}');
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
    assert.deepEqual(browse.body.dirs.map(d => d.name), ['analysis', 'node_modules', 'Sub'], 'hidden folders are not listed');
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
    const repoRead = await get(s.url + '/api/model?path=' + encodeURIComponent(path.join(root, 'Repo')));
    assert.equal(repoRead.status, 200);
    assert.deepEqual(repoRead.body.files, [{ name: 'Sales.tmdl', path: 'Sub/Demo.SemanticModel/definition/tables/Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }],
      'repo roots read only discovered models, excluding analysis JSON and skipped model directories');
    const perf = path.join(root, 'Repo', 'Perf.SemanticModel');
    fs.mkdirSync(perf);
    fs.writeFileSync(path.join(perf, 'model.bim'), '{"model":{"tables":[]}}');
    const multiRead = await get(s.url + '/api/model?path=' + encodeURIComponent(path.join(root, 'Repo')));
    assert.deepEqual(multiRead.body.files, [
      { name: 'model.bim', path: 'Perf.SemanticModel/model.bim', text: '{"model":{"tables":[]}}' },
      ...repoRead.body.files,
    ], 'multiple discovered models retain their separate relative paths');
    const flat = path.join(root, 'Flat');
    fs.mkdirSync(flat);
    fs.writeFileSync(path.join(flat, 'Sales.tmdl'), 'table Sales\r\n');
    fs.writeFileSync(path.join(flat, 'model.bim'), '{"model":{"tables":[]}}');
    const flatRead = await get(s.url + '/api/model?path=' + encodeURIComponent(flat));
    assert.deepEqual(flatRead.body.files, [
      { name: 'model.bim', path: 'model.bim', text: '{"model":{"tables":[]}}' },
      { name: 'Sales.tmdl', path: 'Sales.tmdl', text: 'table Sales\r\n' },
    ], 'genuine flat model folders retain supported file content and paths');

    const index = await fetch(s.url + '/index.html');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Semantic Model Viewer/);
    assert.equal(index.headers.get('cache-control'), 'no-cache', 'page files are re-checked so an updated viewer shows up without a hard reload');
    assert.equal((await fetch(s.url + '/api/ping')).headers.get('cache-control'), 'no-store');

    assert.equal((await get(s.url + '/api/nope')).status, 404);
    const missing = await get(s.url + '/api/browse?path=' + encodeURIComponent(path.join(root, 'missing')));
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /Not a folder/);
  } finally { s.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('serve.py preserves raw fenced TMDL newlines and whitespace through metadata parsing', { skip: !python && 'python3 not installed' }, async () => {
  const { root, model } = fixture();
  const file = path.join(model, 'definition', 'tables', 'Sales.tmdl');
  // Exact expression oracle from #38's independent raw-fenced transport reproduction.
  const code = 'let\r\n  Source = #"Base Query",\r\n  Text = "PQ_RAW_ONLY_38 ""quoted"" λ"  \r\nin Source\r\n';
  // Store raw fixture bytes as base64 so Git/platform text conversion cannot change the oracle.
  const raw = Buffer.from(fs.readFileSync(path.join(__dirname, 'fixtures/power-query/fenced-crlf.tmdl.base64'), 'utf8').trim(), 'base64').toString('utf8');
  assert.equal(require('node:crypto').createHash('sha256').update(raw, 'utf8').digest('hex'),
    'dd5e5fc71672c14dfab54484d5a195ca48caf7da43a8b7030cd2f794948da21a', '#38 unchanged raw fixture');
  const bytes = Buffer.from('\ufeff' + raw, 'utf8');
  fs.writeFileSync(file, bytes);
  // Existing decoding policy strips a UTF-8 BOM and replaces invalid bytes, without normalizing CR/LF.
  fs.writeFileSync(path.join(model, 'Replacement.json'), Buffer.concat([
    Buffer.from('\ufeffvalue\r\n', 'utf8'), Buffer.from([0xff]), Buffer.from('\rtrailing\n', 'utf8')
  ]));
  const s = await start();
  try {
    const read = await get(s.url + '/api/model?path=' + encodeURIComponent(model));
    assert.equal(read.status, 200);
    const transported = read.body.files.find(f => f.name === 'Sales.tmdl');
    assert.equal(transported.text, raw, 'GET /api/model preserves exact decoded fenced TMDL, including CRLF and trailing whitespace');
    assert.equal(read.body.files.find(f => f.name === 'Replacement.json').text, 'value\r\n\ufffd\rtrailing\n');
    const vm = require('node:vm'), context = {};
    context.window = context;
    vm.createContext(context);
    for (const name of ['roles.js', 'tmdl-parser.js']) {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js', name), 'utf8'), context);
    }
    const metadata = context.TMDLParser.parseTMDL([transported]).powerQuery;
    assert.equal(metadata.nodes[0].code, code, 'transported metadata retains exact M CRLF, quoted content, trailing spaces and blank line');
    assert.equal(Buffer.byteLength(metadata.nodes[0].code, 'utf8'), 86);
    assert.equal(require('node:crypto').createHash('sha256').update(metadata.nodes[0].code, 'utf8').digest('hex'),
      '0ca26d7ff5746665d15af9014936598df9e4374eb7d766dffa2858d9f99fec42', '#38 exact expression byte oracle');
    assert.deepEqual(fs.readFileSync(file), bytes, 'model GET does not modify source bytes');
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
    // DNS rebinding: a foreign host name that resolves to 127.0.0.1 must not reach the server.
    const withHost = (host) => new Promise((resolve, reject) => {
      const u = new URL(s.url + '/api/ping');
      require('node:http').get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { Host: host } },
        res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(await withHost('evil.example:' + new URL(s.url).port), 403);
    assert.equal(await withHost('localhost:' + new URL(s.url).port), 200);
    assert.equal(await withHost('[::1]:' + new URL(s.url).port), 200);
  } finally { s.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('serve.py starts again on the same port right after it stopped', { skip: !python && 'python3 not installed' }, async () => {
  const net = require('node:net');
  const port = await new Promise(resolve => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
  });
  const run = async () => {
    const proc = spawn(python, [SERVE, '--port', String(port), '--idle-exit', '30'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', c => { out += c; });
    proc.stderr.on('data', c => { out += c; });
    for (let i = 0; i < 50; i++) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/api/ping'); if (r.ok) return proc; } catch (e) { /* not up yet */ }
      await new Promise(r => setTimeout(r, 100));
    }
    proc.kill();
    throw new Error('serve.py did not come up on port ' + port + ': ' + out);
  };
  const first = await run();
  await new Promise(resolve => { first.on('exit', resolve); first.kill(); });
  const second = await run(); // macOS refuses to bind while the old connections sit in TIME_WAIT unless SO_REUSEADDR is set
  second.kill();
});

test('reviewed rename endpoint requires local session and refuses unreviewed writes', { skip: !python && 'python3 not installed' }, async () => {
 const s=await start(),root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-rename-server-'));
 try{
  const modelPath=path.join(root,'Demo.SemanticModel');fs.mkdirSync(modelPath);fs.writeFileSync(path.join(modelPath,'Sales.tmdl'),"table Sales\n\tcolumn Amount\n\tmeasure Revenue = SUM(Sales[Amount])\n");
  const ping=await get(s.url+'/api/ping'),session=ping.body.renameSession;
  const post=async(payload,headers={})=>{const r=await fetch(s.url+'/api/rename',{method:'POST',headers:{'Content-Type':'application/json','X-SMV-Rename-Session':session,...headers},body:JSON.stringify(payload)});return{status:r.status,body:await r.json()};};
  assert.equal((await post({action:'objects',root,modelPath},{'X-SMV-Rename-Session':''})).status,403);
  assert.equal((await post({action:'objects',root,modelPath},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({action:'apply',token:'fake'})).status,400);
  const preview=await post({action:'preview',root,modelPath,rename:{kind:'column',table:'Sales',name:'Amount',newName:'Value'}});
  assert.equal(preview.status,200);assert.deepEqual(preview.body.blockers,[]);assert.match(fs.readFileSync(path.join(modelPath,'Sales.tmdl'),'utf8'),/Amount/);
  const applied=await post({action:'apply',token:preview.body.token});assert.equal(applied.status,200);assert.match(fs.readFileSync(path.join(modelPath,'Sales.tmdl'),'utf8'),/column 'Value'/);
  assert.equal((await post({action:'apply',token:preview.body.token})).status,400);
 }finally{s.stop();fs.rmSync(root,{recursive:true,force:true});}
});
