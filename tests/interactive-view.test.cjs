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
