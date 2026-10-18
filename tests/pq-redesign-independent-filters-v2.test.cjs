'use strict';
// Authoring/oracle self-checks only. Synthetic observations below are deliberately NOT receipts.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('./pq-redesign-independent-filters-v2.oracle.cjs');
const {artifacts}=require('./acceptance-fixtures/pq-redesign/filters-v2/build.cjs');
const root=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const e=n=>JSON.stringify(['expression','',n]);
const p=n=>JSON.stringify(['partition',n,'Main']);
const clone=o=>JSON.parse(JSON.stringify(o));
test('filter addendum artifacts are reproducible and preserve explicit expected incidence sets',()=>{
  for(const [name,text] of Object.entries(artifacts())) assert.equal(fs.readFileSync(path.join(root,'filters-v2',name),'utf8'),text);
  for(const [name,c] of Object.entries(F.spec.cases)){
    assert.equal(new Set(c.all).size,c.all.length,name);
    assert.deepEqual([...c.connected,...c.disconnected].sort(),c.all.slice().sort());
    assert.deepEqual([...new Set(F.edgesFor(name).flat())].sort(),c.connected.slice().sort(),name+' exact incident endpoints');
    assert.equal(c.counts.all,c.counts.connected+c.counts.disconnected);
  }
});
test('all-disconnected same SQL and semantic relationship is All6 Connected0 Disconnected6',()=>{
  assert.deepEqual(F.spec.cases['a1-disconnected'].counts,{all:6,connected:0,disconnected:6});
  const input=JSON.parse(fs.readFileSync(path.join(root,'a1-disconnected/model.bim')));
  assert.equal(input.model.relationships.length,1);assert.equal(input.model.tables.length,6);
  assert.deepEqual(F.projection('a1-disconnected','connected','').visible,[]);
  assert.deepEqual(F.projection('a1-disconnected','disconnected','Sales').matches,[p('Sales')]);
  assert.equal(F.projection('a1-disconnected','disconnected','Sales').visible.length,6);
});
test('parameter fanout counts unique incident objects, not arrow count or inbound-only dependencies',()=>{
  assert.deepEqual(F.spec.cases['a2-parameter'].counts,{all:9,connected:6,disconnected:3});
  assert.deepEqual(F.spec.cases['a6-fanout-250'].counts,{all:251,connected:251,disconnected:0});
  const last=F.projection('a6-fanout-250','connected','Fan249');
  assert.deepEqual(last.matches,[e('Fan249')]);assert.equal(last.visible.length,251);assert.equal(last.edges.length,250);
  assert.ok(last.visible.includes(e('Server'))); // Still connected even when no consumers match Server search.
  assert.deepEqual(F.projection('a6-fanout-250','connected','Server').matches,[e('Server')]);
});
test('cycles, duplicate rows, unavailable inputs, status objects and unused parameter have deliberate categories',()=>{
  assert.deepEqual(F.spec.cases['a7-uncertainty'].counts,{all:20,connected:6,disconnected:14});
  assert.ok(F.spec.cases['a7-uncertainty'].connected.includes(e('SelfCycle')));
  const c=F.spec.cases['v2-unavailable-incidence'];assert.deepEqual(c.counts,{all:8,connected:4,disconnected:4});
  assert.ok(c.connected.includes(p('NonMInput')));assert.ok(c.connected.includes(p('MissingInput')));
  assert.ok(c.disconnected.includes(e('UnusedParameter')));assert.ok(c.disconnected.includes(e('DynamicOnly')));
});
test('300/301/350/1000 category totals do not truncate; same-ID replacement changes category membership',()=>{
  for(const n of [300,301,350,1000]) assert.deepEqual(F.spec.cases['a6-disconnected-'+n].counts,{all:n,connected:0,disconnected:n});
  const before=F.spec.cases['a8-reset-a'],after=F.spec.cases['v2-same-ids-no-edge'];
  assert.deepEqual(before.all.slice().sort(),after.all.slice().sort());
  assert.deepEqual(before.counts,{all:2,connected:2,disconnected:0});assert.deepEqual(after.counts,{all:2,connected:0,disconnected:2});
});
// A small hand-written ready observation demonstrates what the validator consumes.
function sample(){
  const all=['Q1','Q2','Q3','MergeResult','AppendResult','Disconnected'].map(e),connected=all.slice(0,5);
  return {phase:'ready',category:'connected',search:'Q1',counts:{all:6,connected:5,disconnected:1},categories:{all,connected,disconnected:[e('Disconnected')]},registryIds:all,
    canvasIds:connected,libraryIds:[e('Q1')],dimmedIds:connected.slice(1),canvasEdges:[[e('Q1'),e('MergeResult')],[e('Q2'),e('MergeResult')],[e('MergeResult'),e('AppendResult')],[e('Q3'),e('AppendResult')]],
    minimap:{ids:all,mutedIds:[e('Disconnected')],selectableIds:connected,visibleCount:5,totalCount:6},visibleCount:5,resultCount:1,zeroResults:false,modelEmpty:false,
    selectedId:e('MergeResult'),inspectorId:e('MergeResult'),hiddenByFilter:false,hiddenBanner:null,showAllAvailable:false,noEdgeCaveatVisible:true,provenIndependenceClaim:false};
}
const wanted={category:'connected',search:'Q1',selectedId:e('MergeResult'),inspectorId:e('MergeResult')};
test('state oracle rejects search-derived graph, category counts after search, stale filter/search and invented independence',()=>{
  F.filterState(sample(),'a3-results',wanted);
  const mutations=[s=>s.counts.connected=1,s=>s.canvasIds=[e('Q1')],s=>s.canvasEdges=[],s=>s.categories.disconnected.push(e('Q1')),
    s=>s.libraryIds.push(e('Disconnected')),s=>s.minimap.ids=s.canvasIds,s=>s.minimap.selectableIds.push(e('Disconnected')),
    s=>s.search='',s=>s.category='all',s=>s.provenIndependenceClaim=true,s=>s.noEdgeCaveatVisible=false];
  for(const mutate of mutations){const s=sample();mutate(s);assert.throws(()=>F.filterState(s,'a3-results',wanted));}
});
test('hidden methods and explicit empty category are separate from empty model',()=>{
  const api={callbackCount:0,afterNullIds:F.spec.cases['a3-results'].all,layoutBefore:{Q1:{x:1,y:2}},layoutAfter:{Q1:{x:1,y:2}},registryAfter:F.spec.cases['a3-results'].all,analysisBuildsBefore:1,analysisBuildsAfter:1};
  F.visibilityApi(api,'a3-results');
  assert.throws(()=>F.visibilityApi({...api,callbackCount:1},'a3-results'));
  assert.throws(()=>F.visibilityApi({...api,afterNullIds:[e('Q1')]},'a3-results'));
  assert.throws(()=>F.visibilityApi({...api,analysisBuildsAfter:2},'a3-results'));
  F.hiddenCanvasMethods([{nodeId:e('Disconnected'),revealResult:false,focusNodeResult:false,selectionCallbackCount:0}],'a3-results','connected');
  assert.throws(()=>F.hiddenCanvasMethods([{nodeId:e('Disconnected'),revealResult:true,focusNodeResult:false,selectionCallbackCount:0}],'a3-results','connected'));
  assert.throws(()=>F.hiddenCanvasMethods([{nodeId:e('Disconnected'),revealResult:false,focusNodeResult:false,selectionCallbackCount:1}],'a3-results','connected'));
});
// This local constructor feeds mutation tests of workflow validation; not production observations.
function syntheticFlow(name){
  const flow=F.spec.workflows[name],c=F.spec.cases[flow.fixture],seen=new Map();
  const input=JSON.parse(fs.readFileSync(path.join(root,c.fixture,'model.bim'))).model;
  return flow.steps.map((step,i)=>{
    const projection=F.projection(flow.fixture,step.category,step.search),hidden=!!step.selectedId&&!projection.visible.includes(step.selectedId);
    const code=input.expressions.find(n=>e(n.name)===step.selectedId)?.expression??input.tables.find(n=>p(n.name)===step.selectedId)?.partitions[0].source?.expression??null;
    const row={...step,phase:'ready',categories:{all:c.all,connected:c.connected,disconnected:c.disconnected},counts:c.counts,registryIds:c.all,canvasIds:projection.visible,
      libraryIds:projection.matches,dimmedIds:projection.dimmed,canvasEdges:projection.edges,minimap:{ids:c.all,mutedIds:projection.hidden,selectableIds:projection.visible,visibleCount:projection.visible.length,totalCount:c.all.length},
      visibleCount:projection.visible.length,resultCount:projection.matches.length,zeroResults:projection.matches.length===0,modelEmpty:false,hiddenByFilter:hidden,hiddenBanner:hidden?'Hidden by filter':null,showAllAvailable:hidden,
      noEdgeCaveatVisible:true,provenIndependenceClaim:false,forcedRevealCalls:0,forcedHiddenFocusCalls:0,autoFitCalls:0,generation:7,analysisBuildCount:1,layout:{fixture:'unchanged'},
      inspectorCode:code,viewport:{x:i,y:i+1,k:1.25},inspectorView:{codeX:3,codeY:40,inspectorX:0,inspectorY:5,wrap:false},focus:{kind:'code',nodeId:step.selectedId},historyLength:0};
    if(step.restoreFrom||step.preserveFrom){const prior=seen.get(step.restoreFrom||step.preserveFrom);for(const k of ['viewport','inspectorView','focus','historyLength'])row[k]=clone(prior[k]);}
    seen.set(step.id,row);return row;
  });
}
test('combined hidden-selection, Show all, reference/library navigation, Back and Reset workflows reject violations',()=>{
  for(const name of Object.keys(F.spec.workflows))F.workflow(syntheticFlow(name),name);
  const publishedCopy=syntheticFlow('combined');for(const row of publishedCopy){if(row.hiddenByFilter)row.hiddenBanner='Selected object hidden by filter';if(row.announcement)row.announcement+='.';}F.workflow(publishedCopy,'combined');
  const bad=(step,mutate)=>{const rows=syntheticFlow('combined');mutate(rows.find(r=>r.id===step));assert.throws(()=>F.workflow(rows,'combined'));};
  bad('disconnected-empty-search',r=>r.hiddenBanner=null);bad('disconnected-empty-search',r=>r.selectedId=null);
  bad('disconnected-empty-search',r=>r.inspectorCode='');bad('disconnected-empty-search',r=>r.forcedRevealCalls=1);
  bad('reference-excluded-by-category',r=>r.category='disconnected');bad('reference-excluded-by-search',r=>r.announcement=null);
  bad('back-hidden-reference',r=>r.viewport={x:0,y:0,k:1});bad('back-reference',r=>r.inspectorView.codeY=0);
  bad('back-hidden-library',r=>r.search='');bad('reset-hidden-filters',r=>r.historyLength=10);
  bad('show-all-selected',r=>r.autoFitCalls=1);bad('connected-search-q1',r=>r.analysisBuildCount=2);
});
test('atomic ready oracle accepts pending links without progressive edges, rejects early category finalization',()=>{
  const pending={phase:'building',graphPublished:false,finalCategoryCountsPublished:false,linksPending:true};
  const ready={phase:'ready',analyzed:19,total:19,complete:true,registryCount:20,overviewAllComponents:true};
  F.atomicReady({samples:[pending,ready]},19,20);
  assert.throws(()=>F.atomicReady({samples:[{...pending,finalCategoryCountsPublished:true},ready]},19,20));
  assert.throws(()=>F.atomicReady({samples:[pending,{...ready,total:20}]},19,20));
  assert.throws(()=>F.atomicReady({samples:[pending]},19,20));
});
function readyState(name,selectedId=null,category='all',search=''){
  const c=F.spec.cases[name],v=F.projection(name,category,search),hidden=!!selectedId&&!v.visible.includes(selectedId);
  return clone({phase:'ready',category,search,counts:c.counts,categories:{all:c.all,connected:c.connected,disconnected:c.disconnected},registryIds:c.all,
    canvasIds:v.visible,libraryIds:v.matches,dimmedIds:v.dimmed,canvasEdges:v.edges,minimap:{ids:c.all,mutedIds:v.hidden,selectableIds:v.visible,visibleCount:v.visible.length,totalCount:c.all.length},
    visibleCount:v.visible.length,resultCount:v.matches.length,zeroResults:v.matches.length===0,modelEmpty:false,selectedId,inspectorId:selectedId,
    hiddenByFilter:hidden,hiddenBanner:hidden?'Hidden by filter':null,showAllAvailable:hidden,noEdgeCaveatVisible:true,provenIndependenceClaim:false,forcedRevealCalls:0,forcedHiddenFocusCalls:0});
}
function resetExample(){
  const before={...readyState('a8-reset-a',p('SameTable'),'disconnected','Same'),generation:7};
  const scheduled={generation:8,phase:'scheduled',category:'all',search:'',selectedId:null,inspectorId:null,inspectorCode:null,historyLength:0,oldCodeDomCount:0,oldCountsPublished:false,pendingWorkCancelled:true,registryIds:[]};
  const ready={...readyState('v2-same-ids-no-edge'),generation:8,inspectorCode:null,historyLength:0};
  return {before,scheduled,ready,afterLateMessages:clone(ready),oldMSentinelInDom:false,oldRestorePromiseApplied:false,tablesStatePreserved:true};
}
test('generation reset invalidates same-ID membership, filter/search/selection/code/history and late messages',()=>{
  F.lifecycle(resetExample());
  for(const mutate of [r=>r.scheduled.generation=7,r=>r.scheduled.search='Same',r=>r.scheduled.oldCountsPublished=true,
    r=>r.scheduled.inspectorCode='stale M',r=>r.scheduled.pendingWorkCancelled=false,r=>r.ready.counts.connected=2,
    r=>r.afterLateMessages.category='disconnected',r=>r.oldRestorePromiseApplied=true,r=>r.tablesStatePreserved=false]){
    const r=resetExample();mutate(r);assert.throws(()=>F.lifecycle(r));
  }
});
test('new filter browser validator requires supplied exact candidate and rejects synthetic evidence before execution',()=>{
  const {verify}=require('./pq-redesign-independent-filters-v2.browser.oracle.cjs');
  assert.throws(()=>verify({},undefined,root));
  assert.throws(()=>verify({candidateSha:'a'.repeat(40)},'b'.repeat(40),root));
  assert.throws(()=>verify({candidateSha:'a'.repeat(40),servedAssetSha:'a'.repeat(40),evidenceKind:'synthetic'},'a'.repeat(40),root));
});
