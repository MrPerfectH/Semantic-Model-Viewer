'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {validate}=require('../Models/tools/viewer/js/explanation-view.js');
const {prepare}=require('../Models/tools/viewer/scripts/cli/explain.cjs');
const {serve,request,exportSession,presentation}=require('../Models/tools/viewer/scripts/cli/session.cjs');
const model=path.resolve(__dirname,'../Models/demo/Contoso Retail.SemanticModel');
const tables=require('../examples/explanations/interactive-tables.json'),measure=require('../examples/explanations/interactive-measure.json');
test('interactive view validates bounded context and explored state',()=>{
  const p=prepare(model,measure);assert.equal(p.view.version,2);assert.equal(p.view.context.depth,1);
  for(const context of [{depth:-1,direction:'up',limit:10},{depth:1,direction:'sideways',limit:10},{depth:1,direction:'up',limit:501}])assert.throws(()=>validate(p.model,{...measure,context}),/context/);
  assert.throws(()=>validate(p.model,{...tables,state:{tableView:{pos:{},view:{x:0,y:0,k:Infinity}}}}),/viewport/);
  assert.throws(()=>validate(p.model,{...measure,state:{measures:{selectedMeasure:'Unknown'}}}),/unknown/);
});
test('session updates are revisioned and atomic; exports preserve declared basis',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-interactive-unit-')),file=path.join(root,'session.json');
  const server=await serve(model,{session:file});t.after(()=>{server.close();fs.rmSync(root,{recursive:true,force:true});});
  await assert.rejects(request(file,'selection',{}),e=>e.code==='CLIENT_UNAVAILABLE');
  await assert.rejects(request(file,'update',{expectedRevision:1,view:{version:2,focus:{kind:'table',name:'Unknown'}}}),/unknown/);
  assert.equal((await request(file,'status')).revision,1);
  const updated=await request(file,'update',{expectedRevision:1,view:tables});assert.equal(updated.state,'awaiting-viewer');assert.equal(updated.revision,2);
  await assert.rejects(request(file,'update',{expectedRevision:1,view:measure}),e=>e.code==='REVISION_CONFLICT');
  const current={...tables,focus:{kind:'column',table:'Sales',name:'Ship Date'}};
  await request(file,'client',{clientId:'one',revision:2,sourceRevision:server.sourceRevision,currentView:current,selection:current.focus,workspace:'graph',explored:true,selectedAt:'2026-01-01T00:00:00Z'});
  assert.equal((await request(file,'selection',{})).selection.name,'Ship Date');
  const exported=await exportSession(file,{basis:'current',revision:2,out:path.join(root,'explored.html')});assert.equal(exported.view.focus.name,'Ship Date');assert.ok(fs.readFileSync(exported.path,'utf8').includes('SMVInteractive'));
  const authored=await request(file,'snapshot',{basis:'authored',expectedRevision:2});assert.equal(authored.view.focus.kind,'relationship');
  await request(file,'client',{clientId:'two',revision:2,sourceRevision:server.sourceRevision,currentView:current,selection:null});
  await assert.rejects(request(file,'selection',{}),e=>e.code==='CLIENT_AMBIGUOUS');
  assert.equal((await request(file,'selection',{clientId:'one'})).selection.name,'Ship Date');
  await request(file,'update',{expectedRevision:2,view:measure});
  await assert.rejects(request(file,'selection',{clientId:'one'}),e=>e.code==='VIEW_NOT_APPLIED');
});
test('presentation does not infer remote reachability or inline support',()=>{
  assert.equal(presentation({url:'http://127.0.0.1:1',revision:1}).preferred,'artifact');
  assert.equal(presentation({url:'http://127.0.0.1:1',revision:1},{localBrowser:true}).preferred,'browser');
  assert.equal(presentation({}).inline.available,false);
});

test('source mutation during capture rejects the export and preserves the previous file',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-export-race-')),modelFile=path.join(root,'model.bim'),session=path.join(root,'session.json'),out=path.join(root,'capture.png');
  const data={name:'Race',model:{tables:[{name:'A',columns:[],measures:[{name:'Amount',expression:'1'}]}],relationships:[]}};fs.writeFileSync(modelFile,JSON.stringify(data));fs.writeFileSync(out,'previous artifact');
  const server=await serve(modelFile,{session});t.after(()=>{server.close();fs.rmSync(root,{recursive:true,force:true});});
  t.mock.method(require('../Models/tools/viewer/scripts/cli/capture.cjs'),'capture',async(html,output)=>{data.model.tables[0].measures[0].expression='2';fs.writeFileSync(modelFile,JSON.stringify(data));fs.writeFileSync(output,'new capture');});
  await assert.rejects(exportSession(session,{basis:'authored',revision:1,out,force:true}),e=>e.code==='SOURCE_CHANGED');
  assert.equal(fs.readFileSync(out,'utf8'),'previous artifact');assert.ok(!fs.readdirSync(root).some(n=>n.startsWith('.smv-export-')));
});

test('Measures accepts table and column sources; banner is an explicit boolean', () => {
  assert.equal(prepare(model, { version: 2, mode: 'measures' }).view.mode, 'measures');
  for (const focus of [{ kind: 'table', name: 'Sales' }, { kind: 'column', table: 'Sales', name: 'Net Amount' }]) {
    const p = prepare(model, { version: 2, mode: 'measures', focus, banner: false });
    assert.deepEqual(p.view.focus, focus);
    assert.equal(p.view.banner, false);
    assert.match(p.html, /analyzeSource/);
  }
  assert.throws(() => prepare(model, { version: 2, banner: 'false' }), /banner must be boolean/);
});
test('session status distinguishes waiting for Apply from acknowledgement and explicit takeover', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-apply-')), file = path.join(root, 'session.json');
  const server = await serve(model, { session: file }); t.after(() => { server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(server.appliedView.banner, false);
  assert.equal(server.application.state, 'awaiting-viewer');
  await request(file, 'update', { expectedRevision: 1, view: tables });
  await request(file, 'client', { clientId: 'one', revision: 1, sourceRevision: server.sourceRevision, currentView: tables, explored: true, pendingRevision: 2 });
  const waiting = await request(file, 'status'); assert.equal(waiting.application.state, 'waiting-for-apply'); assert.match(waiting.application.message, /Waiting for Apply click/);
  await assert.rejects(request(file, 'update', { expectedRevision: 2, view: tables, apply: 'yes' }), /apply must be boolean/);
  const update = await request(file, 'update', { expectedRevision: 2, view: tables, apply: true });
  assert.equal(update.application.applyRequested, true); assert.equal(update.application.state, 'awaiting-viewer');
  const url = new URL(server.url); url.pathname = '/view'; assert.equal((await (await fetch(url)).json()).apply, true);
  await request(file, 'client', { clientId: 'one', revision: 3, sourceRevision: server.sourceRevision, currentView: tables, explored: false, pendingRevision: null });
  assert.equal((await request(file, 'status')).application.state, 'applied');
  await request(file, 'update', { expectedRevision: 3, view: tables });
  assert.equal((await (await fetch(url)).json()).apply, false);
});

test('waiting confirms browser receipts, not successful HTML fetches, and retains stale evidence',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-wait-')),file=path.join(root,'session.json');
  const server=await serve(model,{session:file});t.after(()=>{server.close();fs.rmSync(root,{recursive:true,force:true});});
  const {waitForApply}=require('../Models/tools/viewer/scripts/cli/session.cjs');
  assert.equal((await fetch(server.url)).status,200);
  const absent=await waitForApply(file,1,{seconds:.02});assert.equal(absent.confirmed,false);assert.equal(absent.timedOut,true);assert.equal(absent.application.browserAcknowledged,false);assert.deepEqual(absent.clients,[]);
  const receipt={clientId:'viewer',revision:1,sourceRevision:server.sourceRevision,currentView:{version:2},explored:false};
  const waiting=waitForApply(file,1,{seconds:2,clientId:'viewer'});
  await request(file,'client',receipt);assert.equal((await waiting).confirmed,true);
  const status=await request(file,'status');assert.equal(status.application.browserAcknowledged,true);assert.equal(status.application.lastAcknowledgedRevision,1);
  const realNow=Date.now;t.mock.method(Date,'now',()=>realNow()+6000);
  const stale=await request(file,'status');assert.equal(stale.application.browserAcknowledged,false);assert.equal(stale.application.state,'unconfirmed');assert.equal(stale.clients[0].fresh,false);assert.equal(stale.clients[0].revision,1);assert.equal(stale.application.lastAcknowledgedRevision,1);
  await request(file,'update',{expectedRevision:1,view:{version:2}});
  await assert.rejects(waitForApply(file,1,{seconds:.02}),e=>e.code==='REVISION_CONFLICT');
});
