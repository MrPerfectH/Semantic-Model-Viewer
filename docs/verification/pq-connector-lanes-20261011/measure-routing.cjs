// Source-free DOM/VM measurements. Not browser long-task or native acceptance.
// Run from the repository root with task-local Node 22; stdout is the receipt.
'use strict';
const path=require('node:path'),assert=require('node:assert/strict');
const {harness,context,plain}=require(path.resolve(__dirname,'../../../tests/power-query-ui-harness.cjs'));
const result={boundary:'Synthetic Node DOM/VM routing; no source model, M evaluation, browser or native acceptance',node:process.version,platform:process.platform,scale:[],fanIn:[]};
function mount(c){const h=harness('power-query-canvas.js'),start=performance.now(),canvas=h.win.PowerQueryCanvas.mount(h.host,{context:c});return {...h,canvas,mountMs:performance.now()-start};}
function summary(h){const status=h.host.querySelector('.pqc-route-status');return {nodes:h.canvas.captureLayout().size,routed:h.host.querySelectorAll('.pqc-edge-line').filter(e=>e.getAttribute('d')).length,unrouted:+status.dataset.unrouted,crowded:+status.dataset.crowded,collisionChecks:+status.dataset.work,maxEdgeCollisionChecks:+status.dataset.maxEdgeWork};}
for(const count of [300,301,350,1000]){
  const c=context(1,count);c.graph.edges=Array.from({length:250},(_,i)=>({id:'fan-'+i,inputId:'id-0',consumerId:'id-'+(i+1)}));
  const graph=JSON.stringify(c.graph),h=mount(c),layout=plain([...h.canvas.captureLayout()]);
  let start=performance.now();h.canvas.fit();const fitMs=performance.now()-start;
  start=performance.now();h.canvas.setMatches(new Set(['id-'+(count-1)]));assert.equal(h.canvas.reveal('id-'+(count-1),{readable:true}),true);assert.equal(h.canvas.focusNode('id-'+(count-1)),true);const searchRevealMs=performance.now()-start;
  assert.deepEqual(plain([...h.canvas.captureLayout()]),layout);assert.equal(JSON.stringify(c.graph),graph);
  const data=summary(h);assert.equal(data.nodes,count);assert.equal(data.routed,250);assert.equal(data.unrouted,0);
  result.scale.push({count,graphEdges:250,mountLayoutMs:h.mountMs,fitMs,searchRevealMs,...data,graphAndPositionsUnchanged:true});h.canvas.destroy();
}
const c=context(1,5),positions=[[0,-230],[0,-80],[0,220],[0,370],[730,70]];
c.graph.edges=[0,1,2,3].map(i=>({id:'edge-'+String(i).padStart(3,'0'),inputId:'id-'+i,consumerId:'id-4'}));const h=mount(c);h.canvas.restoreLayout(new Map(positions.map(([x,y],i)=>['id-'+i,{x,y}])));
for(const k of [.58,.47,.37,.3,.85,1,2]){h.canvas.setViewport({x:0,y:0,k});const data=summary(h);assert.equal(data.routed,4);assert.equal(data.unrouted,0);assert.equal(data.crowded,0);result.fanIn.push({k,...data,paths:h.host.querySelectorAll('.pqc-edge-hit').map(e=>({edgeId:e.dataset.edgeId,d:e.getAttribute('d')}))});}
result.fanInPositions=positions;console.log(JSON.stringify(result,null,2));
