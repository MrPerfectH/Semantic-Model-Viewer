'use strict';
// Pure observation validators. No production imports or browser execution.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const spec=JSON.parse(fs.readFileSync(path.join(root,'filters-v2/expected.json')));
const original=JSON.parse(fs.readFileSync(path.join(root,'oracle.json'))).cases;
const sorted=values=>[...values].sort();
const equalIds=(actual,expected,label)=>{
  assert.ok(Array.isArray(actual),label+' observation missing');
  assert.equal(new Set(actual).size,actual.length,label+' contains duplicate display IDs');
  assert.deepEqual(sorted(actual),sorted(expected),label);
};
function edgesFor(name){return spec.cases[name].edges || original[name].edges.map(e=>[e.inputId,e.consumerId]);}
function projection(name,category,search){
  const c=spec.cases[name]; assert.ok(c,'Unknown fixture'); assert.ok(['all','connected','disconnected'].includes(category));
  // Oracle projection of explicit authored sets, never a classifier over production output.
  const visible=c[category],query=search.toLowerCase();
  const matches=visible.filter(id=>c.labels[id].toLowerCase().includes(query));
  return {visible,matches,hidden:c.all.filter(id=>!visible.includes(id)),dimmed:visible.filter(id=>!matches.includes(id)),
    edges:edgesFor(name).filter(([a,b])=>visible.includes(a)&&visible.includes(b))};
}
function filterState(actual,name,expected){
  const c=spec.cases[name],p=projection(name,expected.category,expected.search);
  assert.equal(actual.phase,'ready','No final classifications before atomic ready');
  assert.equal(actual.category,expected.category); assert.equal(actual.search,expected.search);
  assert.deepEqual(actual.counts,c.counts,'Counts are complete model before category/search');
  for(const kind of ['all','connected','disconnected']) equalIds(actual.categories[kind],c[kind],'Global '+kind+' category');
  equalIds(actual.registryIds,c.all,'Complete registry'); equalIds(actual.canvasIds,p.visible,'Canvas category projection');
  equalIds(actual.libraryIds,p.matches,'Library intersects category and search'); equalIds(actual.dimmedIds,p.dimmed,'Search only dims category canvas');
  assert.deepEqual(actual.canvasEdges.map(pair=>JSON.stringify(pair)).sort(),p.edges.map(pair=>JSON.stringify(pair)).sort(),'Induced edges; no search-only graph');
  equalIds(actual.minimap.ids,c.all,'Minimap retains whole model'); equalIds(actual.minimap.mutedIds,p.hidden,'Hidden minimap nodes muted');
  equalIds(actual.minimap.selectableIds,p.visible,'No selectable hidden minimap nodes');
  assert.equal(actual.minimap.visibleCount,p.visible.length); assert.equal(actual.minimap.totalCount,c.all.length);
  assert.equal(actual.visibleCount,p.visible.length); assert.equal(actual.resultCount,p.matches.length);
  assert.equal(actual.zeroResults,p.matches.length===0); assert.equal(actual.modelEmpty,false,'Empty category/search is not empty model');
  assert.equal(actual.selectedId,expected.selectedId); assert.equal(actual.inspectorId,expected.inspectorId);
  const hidden=!!expected.selectedId&&!p.visible.includes(expected.selectedId);
  assert.equal(actual.hiddenByFilter,hidden);
  if(hidden)assert.ok(['Hidden by filter','Selected object hidden by filter'].includes(actual.hiddenBanner),'Explicit hidden-selection banner required');
  else assert.equal(actual.hiddenBanner,null);
  assert.equal(actual.showAllAvailable,hidden);
  assert.equal(actual.noEdgeCaveatVisible,true,'No-edge is not proven independence');
  assert.equal(actual.provenIndependenceClaim,false);
  for(const key of ['revealedId','focusedId','historyDelta','autoFitCalls']) if(key in expected) assert.deepEqual(actual[key],expected[key],key);
  if('announcement' in expected)assert.ok([expected.announcement,expected.announcement+'.'].includes(actual.announcement),'Explicit filter-clearing announcement required');
  if(hidden){assert.equal(actual.forcedRevealCalls,0);assert.equal(actual.forcedHiddenFocusCalls,0);}
  return true;
}
function hiddenCanvasMethods(actual,name,category){
  const hidden=projection(name,category,'').hidden;
  equalIds(actual.map(x=>x.nodeId),hidden,'Hidden method probes');
  for(const row of actual){assert.equal(row.revealResult,false);assert.equal(row.focusNodeResult,false);assert.equal(row.selectionCallbackCount,0);}
}
function visibilityApi(actual,name){
  assert.equal(actual.callbackCount,0,'setVisibleIds is silent');
  equalIds(actual.afterNullIds,spec.cases[name].all,'null restores All');
  assert.deepEqual(actual.layoutAfter,actual.layoutBefore,'Visibility projection retains complete layout');
  equalIds(actual.registryAfter,spec.cases[name].all,'Visibility projection retains registry');
  assert.equal(actual.analysisBuildsAfter,actual.analysisBuildsBefore,'Visibility never recomputes analysis');
}
function workflow(actual,name){
  const flow=spec.workflows[name],seen=new Map();assert.equal(actual.length,flow.steps.length);
  const first=actual[0];
  for(let i=0;i<flow.steps.length;i++){
    const step=flow.steps[i],row=actual[i];assert.equal(row.id,step.id);filterState(row,flow.fixture,step);
    assert.equal(row.generation,first.generation,'Filtering/navigation never changes analysis generation');
    assert.equal(row.analysisBuildCount,first.analysisBuildCount,'No reanalysis on filter/search/navigation');
    assert.deepEqual(row.layout,first.layout,'Projection, Show all, Back and Reset retain layout');
    assert.equal(row.autoFitCalls,0,'No automatic Fit during filter workflow');
    if(step.selectedId){
      const model=JSON.parse(fs.readFileSync(path.join(root,spec.cases[flow.fixture].fixture,'model.bim'))).model;
      const expr=model.expressions.find(e=>JSON.stringify(['expression','',e.name])===step.selectedId);
      const partition=model.tables.flatMap(t=>t.partitions.map(p=>({id:JSON.stringify(['partition',t.name,p.name]),code:p.source?.expression}))).find(p=>p.id===step.selectedId);
      assert.equal(row.inspectorCode,expr?.expression??partition?.code,'Exact selected M remains through hiding/reset');
    }else assert.equal(row.inspectorCode,null);
    if(step.restoreFrom){
      const prior=seen.get(step.restoreFrom);assert.ok(prior);
      for(const k of ['category','search','selectedId','inspectorId','viewport','inspectorView','focus','inspectorCode']) assert.deepEqual(row[k],prior[k],'Back restores '+k);
    }
    if(step.preserveFrom){const prior=seen.get(step.preserveFrom);for(const k of ['selectedId','inspectorId','viewport','inspectorView','inspectorCode','historyLength']) assert.deepEqual(row[k],prior[k],'Reset filters preserves '+k);}
    seen.set(step.id,row);
  }
}
function lifecycle(actual){
  filterState(actual.before,'a8-reset-a',{category:'disconnected',search:'Same',selectedId:JSON.stringify(['partition','SameTable','Main']),inspectorId:JSON.stringify(['partition','SameTable','Main'])});
  const pending=actual.scheduled;
  assert.ok(pending.generation>actual.before.generation);
  for(const [key,value] of Object.entries({phase:'scheduled',category:'all',search:'',selectedId:null,inspectorId:null,inspectorCode:null,historyLength:0,oldCodeDomCount:0,oldCountsPublished:false,pendingWorkCancelled:true})) assert.deepEqual(pending[key],value,key);
  assert.deepEqual(pending.registryIds,[],'Old registry cleared before publishing new generation');
  assert.equal(actual.ready.generation,pending.generation);
  filterState(actual.ready,'v2-same-ids-no-edge',{category:'all',search:'',selectedId:null,inspectorId:null});
  assert.equal(actual.ready.inspectorCode,null);assert.equal(actual.ready.historyLength,0);
  assert.deepEqual(actual.afterLateMessages,actual.ready,'Old queued callbacks cannot alter new counts/filters/code');
  assert.equal(actual.oldMSentinelInDom,false); assert.equal(actual.oldRestorePromiseApplied,false);
  assert.equal(actual.tablesStatePreserved,true);
}
function atomicReady(actual,total,registryCount){
  assert.ok(Array.isArray(actual.samples)&&actual.samples.length>=2);
  let ready=false;
  for(const row of actual.samples){
    if(row.phase==='ready'){ready=true;assert.equal(row.analyzed,total);assert.equal(row.total,total);assert.equal(row.complete,true);assert.equal(row.registryCount,registryCount);assert.equal(row.overviewAllComponents,true);}
    else{assert.equal(ready,false,'Same generation cannot regress after ready');assert.equal(row.graphPublished,false);assert.equal(row.finalCategoryCountsPublished,false);assert.equal(row.linksPending,true);}
  }
  assert.equal(ready,true); // Atomic publication is accepted; progressive edge painting is not required.
}
module.exports={spec,edgesFor,projection,filterState,hiddenCanvasMethods,visibilityApi,workflow,lifecycle,atomicReady};
