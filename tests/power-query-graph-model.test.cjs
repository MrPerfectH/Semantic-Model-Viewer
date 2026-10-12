const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const plain=x=>JSON.parse(JSON.stringify(x));
function harness(){const g={};g.window=g;vm.createContext(g);for(const file of ['power-query-dependencies.js','power-query-graph-model.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js',file),'utf8'),g);return g;}
const node=(name,code='1',extra={})=>({id:JSON.stringify(['expression','',name]),name,code,kind:'expression',state:'available',type:'m',classification:'query',...extra});
const partition=(table,name,code='1',extra={})=>node(name,code,{id:JSON.stringify(['partition',table,name]),kind:'partition',table,...extra});
const model=(nodes,tables=[],extra={})=>({tables:tables.map(name=>({name})),powerQuery:{nodes,warnings:[]},...extra});
const build=(m,options)=>plain(harness().PowerQueryGraphModel.build(m,options));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('complete inventory includes disconnected objects, explicit partitions and status-only tables',()=>{
  const metadata=[node('Param','1',{classification:'parameter'}),node('Fn','(x) => x',{classification:'function'}),node('Disconnected'),partition('Sales','Main','Param'),partition('History','Current'),partition('History','Old'),partition('Native','SQL',null,{state:'non-m',type:'query'}),partition('Missing','P',null,{state:'missing',type:'unknown'})];
  const m=freeze(model(metadata,['Sales','History','Native','Missing','Empty'])),before=JSON.stringify(m),g=build(m);
  assert.equal(g.nodes.length,9);assert.equal(g.edges.length,1);assert.equal(JSON.stringify(m),before);
  assert.deepEqual(g.nodes.slice(0,3).map(n=>n.kind),['parameter','function','query']);
  assert.equal(g.nodes[3].id,metadata[3].id);assert.equal(g.nodes[3].label,'Sales');assert.equal(g.nodes[3].partition,'Main');
  assert.equal(g.nodes[4].label,'History / Current');assert.equal(g.nodes[5].label,'History / Old');
  assert.equal(g.nodes[6].state,'non-m');assert.equal(g.nodes[7].state,'missing');
  assert.deepEqual(g.nodes[8],{id:'["table-status","Empty"]',metadataId:null,label:'Empty',subtitle:'No partition metadata',kind:'table-status',table:'Empty',partition:null,state:'no-partitions'});
  assert.deepEqual(g.analysisProgress,{analyzed:8,total:8,complete:true,generation:null});
  assert.equal(JSON.stringify(g).includes('"code"'),false);
});
test('merge/append static inputs reverse legacy direction exactly once with all occurrences',()=>{
  const a=node('Q1'),b=node('Q2'),c=node('Q3'),merge=partition('MergeResult','P','Table.NestedJoin(Q1, {}, Q2, {}, "Q1")'),append=partition('AppendResult','P','Table.Combine({MergeResult, Q3, Q3})');
  const m=model([a,b,c,merge,append,node('Disconnected')]);const h=harness(),g=plain(h.PowerQueryGraphModel.build(m));
  assert.deepEqual(g.edges.map(e=>[e.inputId,e.consumerId]),[[a.id,merge.id],[b.id,merge.id],[merge.id,append.id],[c.id,append.id]]);
  assert.equal(g.edges[3].referenceOccurrences.length,2);assert.equal(g.nodes.length,6);
  assert.deepEqual(plain(h.PowerQueryDependencies.graph(m.powerQuery)).edges.map(e=>[e.to,e.from]),g.edges.map(e=>[e.inputId,e.consumerId]));
  assert.deepEqual(g.edges.map(e=>e.id),g.edges.map(e=>JSON.stringify(['reference',e.inputId,e.consumerId])));
});
test('SQL source literals, semantic relationships and partition ownership never create edges',()=>{
  const nodes=Array.from({length:6},(_,i)=>partition('T'+i,'P','Sql.Database("same-server", "same-db"){[Schema="dbo",Item="T0"]}[Data]'));
  const g=build(model(nodes,nodes.map(n=>n.table),{relationships:[{fromTable:'T0',toTable:'T1'}]}));
  assert.equal(g.nodes.length,6);assert.deepEqual(g.edges,[]);
});
test('complete parameter fanout and final disconnected object survive all requested thresholds',()=>{
  for(const count of [300,301,350,1000]){
    const disconnected=build(model(Array.from({length:count},(_,i)=>node('Disconnected'+i))));
    assert.equal(disconnected.nodes.length,count);assert.deepEqual(disconnected.edges,[]);assert.equal(disconnected.nodes.at(-1).label,'Disconnected'+(count-1));
    const param=node('Server','"synthetic"',{classification:'parameter'}),consumers=Array.from({length:count},(_,i)=>partition('Q'+i,'P','Sql.Database(Server, "db")'));
    const g=build(model([param,...consumers,node('LastDisconnected')]));
    assert.equal(g.nodes.length,count+2);assert.equal(g.edges.length,count);assert.equal(g.edges[count-1].consumerId,consumers[count-1].id);
    assert.equal(g.edges.every(e=>e.inputId===param.id),true);assert.equal(g.nodes.at(-1).label,'LastDisconnected');
    assert.equal(g.analysisProgress.analyzed,count+2);
  }
});
test('duplicate IDs retain every row with stable collision-safe UI identity and no guessed edges',()=>{
  const a=node('A','B'),b=node('B','A'),collision=node('Other','1',{id:JSON.stringify(['metadata-occurrence',a.id,0])});
  const m=model([a,{...a},b,collision]),first=build(m),second=build(m);
  assert.deepEqual(first,second);assert.equal(first.nodes.length,4);assert.equal(new Set(first.nodes.map(n=>n.id)).size,4);
  assert.deepEqual(first.nodes.slice(0,2).map(n=>n.metadataId),[a.id,a.id]);assert.deepEqual(first.edges,[]);
  assert.equal(first.issues.filter(i=>i.kind==='duplicate-identity').length,2);
  const inserted=build(model([node('Unrelated'),...m.powerQuery.nodes]));assert.deepEqual(inserted.nodes.slice(1).map(n=>n.id),first.nodes.map(n=>n.id));
});
test('duplicate names, multipartition names and same-named expression/table remain ambiguous',()=>{
  for(const targets of [[node('Sales'),node('Sales','2',{id:'distinct'})],[partition('Sales','Current'),partition('Sales','Old')],[partition('Sales','P'),node('Sales')]]){
    const g=build(model([node('Consumer','Sales'),...targets]));assert.equal(g.nodes.length,3);assert.deepEqual(g.edges,[]);assert.ok(g.issues.some(i=>i.consumerId&&/Ambiguous/.test(i.message)));
  }
});
test('local shadowing, malformed code and placeholders never invent edges; legacy synthetic _ is reported',()=>{
  const g=build(model([node('A'),node('Shadow','let A = 1 in A & "A" /* A */'),node('Broken','A &'),node('_'),node('Field','[A]'),node('PlaceholderRef','Empty')],['Empty']));
  assert.deepEqual(g.edges,[]);assert.ok(g.issues.some(i=>i.kind==='no-reference-range'));assert.ok(g.issues.some(i=>/incomplete/.test(i.message)));
  assert.equal(g.issues.filter(i=>i.kind==='analysis-notice').length,1);
});
test('missing/non-M referenced metadata keeps valid static name edges, but contributes no outgoing analysis',()=>{
  const missing=node('Missing',null,{state:'missing'}),native=node('Native',null,{state:'non-m',type:'sql'}),root=node('Root','Missing & Native');
  const g=build(model([root,missing,native]));assert.deepEqual(g.edges.map(e=>[e.inputId,e.consumerId]),[[missing.id,root.id],[native.id,root.id]]);
});
test('stable cycles use only emitted edges and handle long whole-model paths without legacy cycle cap',()=>{
  const h=harness(),nodes=[node('A','B'),node('B','A'),node('Self','Self'),node('_','Field'),node('Field','[Ignored]')];
  const g=plain(h.PowerQueryGraphModel.build(model(nodes)));
  assert.equal(g.issues.filter(i=>i.kind==='cycle').length,3);assert.equal(g.issues.some(i=>i.kind==='cycle'&&i.consumerId===nodes[3].id),false);
  const chain=Array.from({length:1000},(_,i)=>node('Q'+i,i===999?'Q0':'Q'+(i+1)));
  const cycle=plain(h.PowerQueryGraphModel.build(model(chain)));assert.equal(cycle.edges.length,1000);assert.equal(cycle.issues.filter(i=>i.kind==='cycle').length,1000);
  assert.deepEqual(cycle.issues.find(i=>i.kind==='cycle').componentIds,chain.map(n=>n.id).sort());
});
test('unavailable model metadata produces status inventory without retaining earlier model state',()=>{
  const h=harness();h.PowerQueryGraphModel.build(model([node('Private','"private-marker"')]));
  const g=plain(h.PowerQueryGraphModel.build({tables:[{name:'New'},{name:'New'}]}));
  assert.equal(g.nodes.length,1);assert.deepEqual(g.edges,[]);assert.ok(g.issues.some(i=>i.kind==='metadata-unavailable'));assert.equal(JSON.stringify(g).includes('private-marker'),false);
  assert.deepEqual(g.analysisProgress,{analyzed:0,total:0,complete:true,generation:null});
});
test('cancellation and model-switch/destroy generation gate suppress progress and result publication',()=>{
  const h=harness(),m=model([node('A'),node('B')]);const controller=new AbortController();controller.abort();let calls=0;
  assert.throws(()=>h.PowerQueryGraphModel.build(m,{signal:controller.signal,onProgress(){calls++;}}),{name:'AbortError'});assert.equal(calls,0);
  for(const reason of ['abort','model-switch','destroy']){
    const active=new AbortController(),updates=[];let generation=7,currentModel=m,destroyed=false;
    assert.throws(()=>h.PowerQueryGraphModel.build(m,{signal:active.signal,generation:7,isCurrent:(id,model)=>id===generation&&model===currentModel&&!destroyed,onProgress(p){updates.push({...p});if(p.analyzed===1){if(reason==='abort')active.abort();else if(reason==='model-switch'){generation++;currentModel=model([]);}else destroyed=true;}}}),{name:'AbortError'});
    assert.deepEqual(updates.map(p=>p.analyzed),[0,1]);assert.equal(updates.some(p=>p.complete),false);
  }
  const updates=[],g=plain(h.PowerQueryGraphModel.build(m,{generation:8,isCurrent:(id,current)=>id===8&&current===m,onProgress:p=>updates.push({...p})}));
  assert.equal(g.generation,8);assert.equal(g.analysisProgress.generation,8);assert.deepEqual(updates.map(p=>[p.analyzed,p.complete]),[[0,false],[1,false],[2,false],[2,true]]);
  let activeGeneration=9;assert.equal(g.generation===activeGeneration,false,'late delivery after model switch must not publish');
  assert.throws(()=>h.PowerQueryGraphModel.build(m,{generation:8,isCurrent:id=>id===activeGeneration}),{name:'AbortError'});
});
test('cancellation from final progress callback still prevents completed graph return',()=>{
  const controller=new AbortController();assert.throws(()=>build(model([node('A')]),{signal:controller.signal,onProgress(p){if(p.complete)controller.abort();}}),{name:'AbortError'});
});
test('same-model metadata replacement during progress cancels the old graph',()=>{
  const m=model([node('Old'),node('Other')]),updates=[];
  assert.throws(()=>build(m,{generation:3,isCurrent:(generation,current,metadata)=>generation===3&&current===m&&metadata===m.powerQuery,onProgress(p){updates.push(p.analyzed);if(p.analyzed===1)m.powerQuery={nodes:[node('New')]};}}),{name:'AbortError'});
  assert.deepEqual(updates,[0,1]);const g=build(m,{generation:4});assert.equal(g.nodes.length,1);assert.equal(g.nodes[0].label,'New');
});
