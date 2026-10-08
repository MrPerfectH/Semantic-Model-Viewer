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
 const f=fixture(),r=await f.adapter.prepareMeasureEdit(f.request);f.app.parseSourceFiles=()=>{throw Error('parse failed');};await assert.rejects(f.adapter.saveMeasureEdit(r.token),/Source saved, but refresh failed/);assert.equal(f.writes,1);assert.equal(f.adapter.available(),false);await assert.rejects(f.adapter.prepareMeasureEdit(f.request),/Connect/);f.app._modelLoadRequest++;assert.equal(f.adapter.available(),true);
});
require('../Models/tools/viewer/js/roles');
require('../Models/tools/viewer/js/tmdl-parser');
test('browser metadata forwards fifth argument and reviews source block; refresh parses saved metadata',async()=>{
 const f=fixture();delete f.request.dax;f.request.metadata={description:'Line one\nLine two',displayFolder:'Totals',formatString:'0.00'};f.app.parseSourceFiles=files=>globalThis.TMDLParser.parseAny(files);
 const r=await f.adapter.prepareMeasureEdit(f.request);assert.match(r.before,/measure M = 1/);assert.match(r.after,/\/\/\/ Line one/);assert.match(r.after,/displayFolder: "Totals"/);assert.equal(f.writes,0);
 await f.adapter.saveMeasureEdit(r.token);const m=f.app.records[0].model.tables[0].measures[0];assert.equal(m.description,'Line one\nLine two');assert.equal(m.folder,'Totals');assert.equal(m.fmt,'0.00');assert.equal(m.dax.trim(),'1');assert.match(f.text,/\tmeasure M = 1\r\n/);assert.ok(f.text.startsWith('\uFEFFtable T\r\n'));
});
function relationshipFixture(include=true) {
 const f=fixture(),texts=new Map([['definition/tables/A.tmdl','table A\n\tcolumn Id\n'],['definition/tables/B.tmdl','table B\n\tcolumn Id\n']]);if(include)texts.set('definition/relationships.tmdl','\uFEFF');
 let writes=0,created=0;const handles=new Map();for(const path of texts.keys())handles.set(path,{getFile:async()=>({arrayBuffer:async()=>new TextEncoder().encode(texts.get(path)).buffer}),createWritable:async()=>{let staged;return{write:async bytes=>{staged=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);},close:async()=>{texts.set(path,staged);writes++;},abort:async()=>{}};}});
 f.app.readModelDir=async()=>[...texts].map(([path,text])=>({path,text,handle:handles.get(path)}));f.app.parseSourceFiles=files=>globalThis.TMDLParser.parseAny(files);
 const request={modelId:f.app.modelKey,relationshipId:null,fromTable:'A',fromColumn:'Id',toTable:'B',toColumn:'Id',fromCardinality:'many',toCardinality:'one',crossFilteringBehavior:'oneDirection',isActive:true};
 return{...f,adapter:create(f.app),request,texts,handles,get writes(){return writes;},get created(){return created;},deny:()=>{f.permission='denied';}};
}
test('browser relationship creates within existing source then updates stable identity and reparses source',async()=>{
 const f=relationshipFixture(),r=await f.adapter.prepareRelationshipEdit(f.request);assert.match(r.relationshipId,/^[a-f0-9-]{36}$/);assert.equal(f.writes,0);await f.adapter.saveRelationshipEdit(r.token);assert.equal(f.writes,1);
 const parsed=f.app.records[0].model.relationships[0];assert.equal(parsed.name,r.relationshipId);assert.equal(parsed.from,'A');assert.equal(parsed.to,'B');
 const update=await f.adapter.prepareRelationshipEdit({...f.request,relationshipId:r.relationshipId,isActive:false});assert.match(update.before,new RegExp(r.relationshipId));await f.adapter.saveRelationshipEdit(update.token);assert.equal(f.app.records[0].model.relationships[0].inactive,true);assert.ok(f.texts.get('definition/relationships.tmdl').startsWith('\uFEFF'));
});
test('browser missing canonical relationship source review and cancel never create files',async()=>{
 const f=relationshipFixture(false),before=[...f.texts];await assert.rejects(f.adapter.prepareRelationshipEdit(f.request),/existing definition\/relationships.tmdl.*exclusive file creation/);f.adapter.cancelEdit();assert.deepEqual([...f.texts],before);assert.equal(f.writes,0);assert.equal(f.created,0);await assert.rejects(f.adapter.saveRelationshipEdit('1'),/stale/);
});
test('browser relationship denial, cancel, raw source, schema and inventory conflicts never commit',async()=>{
 for(const mode of ['denied','cancel','source','schema','inventory']){const f=relationshipFixture(),r=await f.adapter.prepareRelationshipEdit(f.request);if(mode==='denied')f.deny();if(mode==='cancel')f.adapter.cancelEdit();if(mode==='source')f.texts.set('definition/relationships.tmdl','// external\n');if(mode==='schema')f.texts.set('definition/tables/B.tmdl','table B\n\tcolumn Gone\n');if(mode==='inventory')f.texts.delete('definition/tables/B.tmdl');const before=[...f.texts];await assert.rejects(f.adapter.saveRelationshipEdit(r.token),/permission|stale|externally/);assert.deepEqual([...f.texts],before);assert.equal(f.writes,0);}
});
test('browser parser fallback works and cache failure blocks edits until reopen',async()=>{
 const f=relationshipFixture();delete f.app.parseSourceFiles;const r=await f.adapter.prepareRelationshipEdit(f.request);f.app.setStore=()=>false;await assert.rejects(f.adapter.saveRelationshipEdit(r.token),/Source saved, but browser cache refresh failed/);assert.equal(f.writes,1);assert.equal(f.adapter.available(),false);await assert.rejects(f.adapter.prepareRelationshipEdit(f.request),/Connect/);f.app._modelLoadRequest++;assert.equal(f.adapter.available(),true);
});
test('schema conflict while writing aborts staged relationship save',async()=>{
 const f=relationshipFixture();let aborted=false;const handle=f.handles.get('definition/relationships.tmdl');handle.createWritable=async()=>({write:async()=>{f.texts.set('definition/tables/B.tmdl','table B\n\tcolumn Changed\n');},abort:async()=>{aborted=true;},close:async()=>{throw Error('must not close');}});const r=await f.adapter.prepareRelationshipEdit(f.request);await assert.rejects(f.adapter.saveRelationshipEdit(r.token),/source changed/);assert.equal(aborted,true);assert.equal(f.texts.get('definition/relationships.tmdl'),'\uFEFF');assert.equal(f.writes,0);
});
