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
    assert.equal(index.headers.get('cache-control'), 'no-cache', 'page files are re-checked so an updated viewer shows up without a hard reload');
    assert.equal((await fetch(s.url + '/api/ping')).headers.get('cache-control'), 'no-store');

    assert.equal((await get(s.url + '/api/nope')).status, 404);
    const missing = await get(s.url + '/api/browse?path=' + encodeURIComponent(path.join(root, 'missing')));
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /Not a folder/);
  } finally { s.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('serve.py refuses requests from other websites and unauthenticated writes', { skip: !python && 'python3 not installed' }, async () => {
  const { root } = fixture();
  const s = await start();
  try {
    assert.equal((await get(s.url + '/api/ping', { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await get(s.url + '/api/ping', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await get(s.url + '/api/ping', { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
    const post = await fetch(s.url + '/api/model?path=' + encodeURIComponent(root), { method: 'POST', body: 'x' });
    assert.equal(post.status, 403, 'writes require the viewer capability');
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

const { create: createEditor } = require('../Models/tools/viewer/js/browser-edit');
require('../Models/tools/viewer/js/roles');
require('../Models/tools/viewer/js/tmdl-parser');
async function localEditor(s, model) {
  const ping = (await get(s.url + '/api/ping')).body;
  const editApi = async (action, data, key=ping.editKey) => {
    const r = await fetch(s.url + '/api/edit-' + action, {method:'POST',headers:{'Content-Type':'application/json','X-SMV-Edit-Key':key},body:JSON.stringify(data)});
    const body = await r.json(); if(!r.ok) throw Error(body.error); return body;
  };
  const rm = {path:'Demo.SemanticModel',name:'Demo',dir:model};
  const app = {server:ping,repoPath:path.dirname(model),_repoLive:true,state:{loaded:true},repoModels:[rm],modelKey:'repo:'+rm.path,_modelLoadRequest:1,editApi,
    readModelDir:async()=> (await get(s.url+'/api/model?path='+encodeURIComponent(model))).body.files,
    parseSourceFiles:files=>globalThis.TMDLParser.parseAny(files),getStore:()=>[],setStore:r=>{app.records=r;return true;}};
  return {app,adapter:createEditor(app),editApi};
}
test('standard app adapter saves real DAX/metadata and creates/updates relationships without browser handles',async()=>{
 const {root,model}=fixture(),s=await start();
 const file=path.join(model,'definition/tables/Sales.tmdl');
 fs.writeFileSync(file,'\uFEFFtable Sales\r\n\tmeasure M = 1\r\n\tcolumn Id\r\n');
 fs.writeFileSync(path.join(model,'definition/tables/Customer.tmdl'),'table Customer\n\tcolumn Id\n');
 try {
   const f=await localEditor(s,model);assert.equal(f.adapter.available(),true);
   const original=fs.readFileSync(file);let review=await f.adapter.prepareMeasureEdit({modelId:f.app.modelKey,table:'Sales',measure:'M',dax:'2'});
   assert.deepEqual(fs.readFileSync(file),original);await f.adapter.saveMeasureEdit(review.token);
   assert.match(fs.readFileSync(file,'utf8'),/^\uFEFFtable Sales\r\n/);assert.equal(f.app.records[0].model.tables.find(t=>t.name==='Sales').measures[0].dax.trim(),'2');
   review=await f.adapter.prepareMeasureEdit({modelId:f.app.modelKey,table:'Sales',measure:'M',metadata:{description:'Preview',displayFolder:'Totals',formatString:'0.00'}});
   await f.adapter.saveMeasureEdit(review.token);const m=f.app.records[0].model.tables.find(t=>t.name==='Sales').measures[0];assert.equal(m.description,'Preview');assert.equal(m.folder,'Totals');
   const request={modelId:f.app.modelKey,relationshipId:null,fromTable:'Sales',fromColumn:'Id',toTable:'Customer',toColumn:'Id',fromCardinality:'many',toCardinality:'one',crossFilteringBehavior:'oneDirection',isActive:true};
   review=await f.adapter.prepareRelationshipEdit(request);const id=review.relationshipId;
   assert.equal(fs.existsSync(path.join(model,'definition/relationships.tmdl')),false);await f.adapter.saveRelationshipEdit(review.token);
   review=await f.adapter.prepareRelationshipEdit({...request,relationshipId:id,isActive:false});await f.adapter.saveRelationshipEdit(review.token);
   assert.equal(f.app.records[0].model.relationships[0].name,id);assert.equal(f.app.records[0].model.relationships[0].inactive,true);
 } finally{s.stop();fs.rmSync(root,{recursive:true,force:true});}
});
test('local reviewed saves reject source/schema/inventory/symlink conflicts, cancel, replay and foreign origin',async()=>{
 const {root,model}=fixture(),s=await start(),file=path.join(model,'definition/tables/Sales.tmdl');
 const text='table Sales\n\tmeasure M = 1\n';fs.writeFileSync(file,text);
 try {
 const f=await localEditor(s,model),request={modelId:f.app.modelKey,table:'Sales',measure:'M',dax:'3'};
 for(const mode of ['source','schema','inventory','symlink','cancel']) {
   fs.writeFileSync(file,text);const review=await f.adapter.prepareMeasureEdit(request);
   let extra;
   if(mode==='source')fs.appendFileSync(file,'// external\n');
   if(mode==='schema'||mode==='inventory'){extra=path.join(model,'definition','schema.json');fs.writeFileSync(extra,'{}');}
   if(mode==='symlink'){extra=path.join(root,'target.tmdl');fs.writeFileSync(extra,text);fs.unlinkSync(file);fs.symlinkSync(extra,file);}
   if(mode==='cancel')f.adapter.cancelEdit();
   await assert.rejects(f.adapter.saveMeasureEdit(review.token),mode==='cancel'?/stale/:/changed|Linked/);
   if(mode==='symlink'){assert.equal(fs.lstatSync(file).isSymbolicLink(),true);assert.equal(fs.readFileSync(extra,'utf8'),text);fs.unlinkSync(file);}
   if(extra)fs.unlinkSync(extra);
 }
 const review=await f.adapter.prepareMeasureEdit(request);await f.adapter.saveMeasureEdit(review.token);await assert.rejects(f.adapter.saveMeasureEdit(review.token),/stale/);
 const response=await fetch(s.url+'/api/edit-read',{method:'POST',headers:{'Content-Type':'application/json','X-SMV-Edit-Key':f.app.server.editKey,Origin:'https://evil.example'},body:JSON.stringify({dir:model})});assert.equal(response.status,403);
 await assert.rejects(f.editApi('read',{dir:model},'wrong'),/Only the local viewer/);
 } finally{s.stop();fs.rmSync(root,{recursive:true,force:true});}
});
test('standard app linked import resolves its model folder and preserves import identity on save',async()=>{
 const {root,model}=fixture(),s=await start();fs.writeFileSync(path.join(model,'definition/tables/Sales.tmdl'),'table Sales\n\tmeasure M = 1\n');
 try {
 const f=await localEditor(s,model),source={dir:path.join(root,'Repo'),name:'Demo',modelId:'import:123',imported:true};
 f.app._repoLive=false;f.app.repoPath=null;f.app.repoModels=[];f.app.modelKey=source.modelId;
 f.app.localEditSource=()=>source;f.app._findModelDir=async()=>({dir:model});
 const review=await f.adapter.prepareMeasureEdit({modelId:source.modelId,table:'Sales',measure:'M',dax:'4'});await f.adapter.saveMeasureEdit(review.token);
 assert.equal(f.app.records[0].id,source.modelId);assert.equal(f.app.records[0].repo,false);assert.equal(f.app.records[0].model.tables[0].measures[0].dax.trim(),'4');
 f.app.snapshotMode=true;assert.equal(f.adapter.available(),false);
 }finally{s.stop();fs.rmSync(root,{recursive:true,force:true});}
});
test('local review refuses traversal, invalid UTF-8 and existing first-file targets',async()=>{
 const {root,model}=fixture(),s=await start();
 try{
 const f=await localEditor(s,model),files=(await f.editApi('read',{dir:model})).files;
 await assert.rejects(f.editApi('prepare',{dir:model,files,path:'../escape.tmdl',text:'table T'}),/Invalid/);
 await assert.rejects(f.editApi('prepare',{dir:model,files,path:'notes.txt',text:'x'}),/Invalid/);
 const review=await f.editApi('prepare',{dir:model,files,path:'definition/relationships.tmdl',text:'relationship id\n'});
 const target=path.join(model,'definition/relationships.tmdl');fs.writeFileSync(target,'external');
 await assert.rejects(f.editApi('save',review),/changed/);assert.equal(fs.readFileSync(target,'utf8'),'external');
 fs.writeFileSync(path.join(model,'definition/tables/Sales.tmdl'),Buffer.from([255]));await assert.rejects(f.editApi('read',{dir:model}),/decode/);
 }finally{s.stop();fs.rmSync(root,{recursive:true,force:true});}
});
