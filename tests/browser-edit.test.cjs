'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../Models/tools/viewer/js/browser-edit');
function fixture() {
  let text = '\uFEFFtable T\r\n\tmeasure M = 1\r\n\t\tformatString: #,0\r\n';
  let writes = 0, aborts = 0, permission = 'granted';
  const handle = { getFile: async () => ({ arrayBuffer: async () => new TextEncoder().encode(text).buffer }), createWritable: async () => {
    let next;
    return { write: async b => { next = new TextDecoder('utf-8', {ignoreBOM:true}).decode(b); }, close: async () => { text = next; writes++; }, abort: async () => { aborts++; } };
  }};
  const rm = {path:'T.SemanticModel',name:'T',handle:{}};
  const app = {state:{loaded:true},_repoLive:true,repoHandle:{requestPermission:async()=>permission},repoModels:[rm],modelKey:'repo:'+rm.path,_modelLoadRequest:1,
    readModelDir:async()=>[{path:'definition/tables/T.tmdl',text:text.replace(/^\uFEFF/,''),handle}],parseSourceFiles:files=>({tables:[],source:files[0].text}),getStore:()=>[],setStore:r=>{app.records=r;return true;}};
  return {app,adapter:create(app),request:{modelId:app.modelKey,table:'T',measure:'M',dax:'2'},get text(){return text;},set text(v){text=v;},get writes(){return writes;},set permission(v){permission=v;}};
}
test('browser review does not write; save preserves raw BOM/CRLF and refreshes from source',async()=>{
 const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);assert.equal(f.writes,0);assert.equal(r.before,'1');
 const result=await f.adapter.saveMeasureEdit(r.token);assert.equal(result.saved,true);assert.equal(f.writes,1);
 assert.equal(f.text,'\uFEFFtable T\r\n\tmeasure M =\r\n\t\t\t2\r\n\t\tformatString: #,0\r\n');assert.equal(f.app.records[0].model.source,f.text.replace(/^\uFEFF/,''));
 await assert.rejects(f.adapter.saveMeasureEdit(r.token),/stale/);
});
test('permission refusal and external conflict leave source unchanged',async()=>{
 for(const mode of ['denied','conflict']){const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);if(mode==='denied')f.permission='denied';else f.text+='// external\n';const before=f.text;await assert.rejects(f.adapter.saveMeasureEdit(r.token),mode==='denied'?/permission/:/externally/);assert.equal(f.text,before);assert.equal(f.writes,0);}
});
test('navigation, disconnect, snapshot, import and demo invalidate edit availability/reviews',async()=>{
 for(const change of [a=>a._modelLoadRequest++,a=>a._repoLive=false,a=>a.snapshotMode=true,a=>a.modelKey='import:1',a=>a.modelKey='builtin']){const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);change(f.app);await assert.rejects(f.adapter.saveMeasureEdit(r.token),/stale/);assert.equal(f.writes,0);}
 for(const key of ['builtin','import:1']){const f=fixture();f.app.modelKey=key;assert.equal(f.adapter.available(),false);}
});
test('unsupported source and invalid UTF-8 are rejected before writable stream',async()=>{
 const f=fixture();f.text='table T\n\tmeasure M = ```\n\t\t\t1\n\t\t\t```\n';await assert.rejects(f.adapter.prepareMeasureEdit(f.request),/unsupported/);assert.equal(f.writes,0);
 const b=fixture();b.app.readModelDir=async()=>[{path:'T.tmdl',handle:{getFile:async()=>({arrayBuffer:async()=>new Uint8Array([255]).buffer})}}];await assert.rejects(b.adapter.prepareMeasureEdit(b.request));assert.equal(b.writes,0);
});
test('cancel invalidates reviewed token without writing',async()=>{
 const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);f.adapter.cancelEdit();await assert.rejects(f.adapter.saveMeasureEdit(r.token),/stale/);assert.equal(f.writes,0);
});
test('write failure aborts staged stream and does not report save',async()=>{
 const f=fixture();let aborted=false;const files=await f.app.readModelDir();files[0].handle.createWritable=async()=>({write:async()=>{throw Error('disk full');},abort:async()=>{aborted=true;}});
 const r=await f.adapter.prepareMeasureEdit(f.request);await assert.rejects(f.adapter.saveMeasureEdit(r.token),/disk full/);assert.equal(aborted,true);assert.equal(f.writes,0);
});
test('source save followed by refresh failure reports saved boundary explicitly',async()=>{
 const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);f.app.parseSourceFiles=()=>{throw Error('parse failed');};await assert.rejects(f.adapter.saveMeasureEdit(r.token),/Source saved, but refresh failed/);assert.equal(f.writes,1);
});
