'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {harness,plain}=require('./power-query-ui-harness.cjs');
// Synthetic model; real projection, navigation and canvas. Browser geometry is a separate acceptance gate.
function setup(parameter=false){
 const h=harness('power-query-canvas.js'),g=h.win,timers=new Map();let timerId=0;g.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};g.clearTimeout=id=>timers.delete(id);
 g.U.el=(tag,attrs={},children=[])=>{const e=h.doc.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key==='text')e.textContent=value;else if(key==='cls')e.className=value;else if(key.startsWith('on'))e.addEventListener(key.slice(2).toLowerCase(),value);else e.setAttribute(key,value);}children.forEach(c=>e.appendChild(c));return e;};
 for(const name of ['power-query-dependencies.js','power-query-graph-model.js','power-query-workspace.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js',name),'utf8'),g);
 const rows=[['A','1'],['B','A'],['C','B'],['Sibling','B'],['Other','2'],['Merge','C & Other'],['After','Merge'],['Cycle1','Cycle2'],['Cycle2','Cycle1'],['Partial','Expression.Evaluate("A", #shared)']].map(([name,code])=>({id:name,name,code,kind:'expression',type:'m',state:'available',classification:'query',groupPath:name==='A'?'Source':'Output'}));
 if(parameter){rows.push({id:'P',name:'P',code:'"host"',kind:'expression',type:'m',state:'available',classification:'parameter'});rows.find(r=>r.id==='A').code='P';}
 const model={tables:[],byName:{},powerQuery:{nodes:rows,warnings:[]}},i=g.PowerQueryWorkspaceInternals,context=i.contextFor(g.PowerQueryGraphModel.build(model,{generation:1}),rows,1),w=Object.create(g.PowerQueryWorkspace.prototype);
 let inspectorView={codeX:19,codeY:47,inspectorX:0,inspectorY:81,focus:null,wrap:false,expanded:false};
 Object.assign(w,{app:{model},alive:true,generation:1,navigationEpoch:0,capture:i.capture(model),context,sets:i.categories(context),category:'all',query:'',history:[],layoutHistory:[],selectedId:null,analyzedId:null,flowRootId:null,inspectorOpen:false,phase:'ready',dock(){},exposeTitle(){},inspector:{select(){},captureViewState(){return {...inspectorView};},async restoreViewState(state,claim){if(!claim||claim())inspectorView={...state};},setFocusControls(state){this.controls=state;}}});
 for(const name of ['body','banner','filter','search','list','count','inventory','memberCount','segments','note','backButton','undoButton','centerButton','openTableButton','popover','message','blankButton','showAllButton','modeControl'])w[name]=h.doc.createElement('div');
 for(const mode of ['flow','canvas']){const b=h.doc.createElement('button');b.dataset.mode=mode;w.modeControl.appendChild(b);}
 w.filter.options=['all','connected','disconnected'].map(value=>({value}));w.canvasHost=h.host;
 w.canvas=g.PowerQueryCanvas.mount(h.host,{context,onSelect:p=>w.inspectCard(p),onAnalyze:p=>{if(w.valid(p.generation))w.analyzeQuery(p.nodeId);},onLayoutStart:p=>{if(w.valid(p.generation)&&w.viewMode==='canvas')w.saveLayout();}});
 w.applyFilters();h.flush();return {w,h,g,timers,flushInspection(){const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());},node:id=>h.host.querySelectorAll('.pqc-node').find(n=>n.dataset.nodeId===id),row:id=>w.list.querySelectorAll('.pqw-library-row').find(n=>n.title===id||n.getAttribute('title').startsWith(id+' · '))};
}
const state=w=>({mode:w.viewMode,root:w.analyzedId,selected:w.selectedId,membership:[...w.membership],layout:plain([...w.canvas.captureLayout()].sort(([a],[b])=>a.localeCompare(b))),view:plain(w.canvas.getViewport()),body:[w.body.scrollLeft,w.body.scrollTop],category:w.category,query:w.query,group:w.groupFilter,facet:w.listFacet,focusMode:w.focusMode,direction:w.direction,depth:w.depth,open:w.inspectorOpen,reader:plain(w.inspector.captureViewState())});
test('Flow defaults to a root prompt; full input ancestry excludes downstream and sibling consumers',()=>{
 const {w,h}=setup();assert.equal(w.viewMode,'flow');assert.equal(w.analyzedId,null);assert.equal(w.visible.size,0);
 w.chooseQuery('C');assert.deepEqual([...w.visible].sort(),['A','B','C']);assert.equal(w.inspectorOpen,false);assert.equal(w.direction,'inputs');assert.equal(w.depth,Infinity);
 w.chooseQuery('Merge');assert.deepEqual([...w.visible].sort(),['A','B','C','Merge','Other']);assert.equal(w.context.byNodeId.size,10);assert.equal(h.host.querySelectorAll('.pqc-node').length,10);
 w.chooseQuery('Cycle1');assert.deepEqual([...w.visible].sort(),['Cycle1','Cycle2']);w.chooseQuery('Partial');assert.deepEqual([...w.visible],['Partial']);assert.ok(w.context.byNodeId.get('Partial').issues.length,'unresolved static evidence remains available');
});
test('Flow filters affect library only; inspecting an ancestor retains all merge inputs at full contrast',()=>{
 const {w,h,row}=setup();w.chooseQuery('Merge');const before=state(w);w.category='disconnected';w.groupFilter='group:Source';w.query='nothing';w.applyFilters();
 assert.deepEqual([...w.visible].sort(),['A','B','C','Merge','Other']);assert.equal(w.list.querySelectorAll('.pqw-library-row').length,0);
 w.navigate('A',true,{preserveView:true});assert.equal(w.analyzedId,'Merge');assert.deepEqual(state(w).view,before.view);assert.deepEqual(state(w).layout,before.layout);
 assert.equal(h.host.querySelectorAll('.pqc-node').filter(n=>!n.hidden&&n.classList.contains('pqc-dim')).length,0);
 w.resetFilters();assert.equal(row('Merge').getAttribute('aria-current'),'true');assert.equal(row('A').getAttribute('aria-current'),'null');assert.equal(w.inspector.controls.viewMode,'flow');
});
test('mode roundtrip restores exact Canvas and Flow snapshots including filters, reader, layout and scroll',async()=>{
 const {w}=setup();await w.setMode('canvas');w.blank();w.add('A',{x:1751,y:822});w.add('C',{x:2240,y:-700});w.category='connected';w.query='C';w.groupFilter='group:Output';w.listFacet='canvas';w.focusMode='hide';w.direction='inputs';w.depth=0;w.applyFilters();w.canvas.setViewport({x:105.25,y:-223.5,k:.73});w.body.scrollLeft=5;w.body.scrollTop=77.5;
 const canvas=state(w),undos=w.layoutHistory.length;w.analyzeQuery('Merge');w.query='Merge';w.applyFilters();w.canvas.setViewport({x:11,y:14,k:.84});w.body.scrollTop=31;const flow=state(w);
 assert.equal(w.layoutHistory.length,undos,'mode/root choices do not consume Canvas Undo');assert.equal(w.modeStates.canvas.modeStates,undefined,'mode snapshots are nonrecursive leaves');await w.setMode('canvas');assert.deepEqual(state(w),canvas);
 await w.setMode('flow');assert.deepEqual(state(w),flow);await w.setMode('canvas');await w.undo();assert.equal(w.viewMode,'canvas');assert.equal(w.membership.has('C'),false);await w.setMode('flow');assert.deepEqual(state(w),flow,'Canvas Undo preserves saved Flow');
});
test('Canvas library inspection keeps membership and viewport; explicit Analyze returns via Back',async()=>{
 const {w,row}=setup();await w.setMode('canvas');w.blank();w.add('A',{x:21,y:37});const before=state(w);row('Merge').fire('click');assert.deepEqual([...w.membership],['A']);assert.equal(w.selectedId,'Merge');assert.equal(w.inspectorOpen,true);assert.deepEqual(state(w).layout,before.layout);assert.deepEqual(state(w).view,before.view);
 w.analyzeQuery('Merge');assert.equal(w.viewMode,'flow');await w.back();assert.equal(w.viewMode,'canvas');assert.deepEqual([...w.membership],['A']);assert.equal(w.selectedId,'Merge');assert.deepEqual(state(w).view,before.view);
});
test('card click and Space inspect; double-click and Enter reroot; library Space inspects and Enter chooses root',()=>{
 const {w,node,row}=setup();w.chooseQuery('Merge');const view=plain(w.canvas.getViewport());node('B').fire('pointerdown');node('B').fire('pointerup');assert.equal(w.selectedId,'B');assert.equal(w.analyzedId,'Merge');assert.deepEqual(plain(w.canvas.getViewport()),view);
 node('A').fire('keydown',{key:' '});assert.equal(w.selectedId,'A');assert.equal(w.analyzedId,'Merge');node('C').fire('dblclick');assert.equal(w.analyzedId,'C');assert.deepEqual([...w.visible].sort(),['A','B','C']);node('B').fire('keydown',{key:'Enter'});assert.equal(w.analyzedId,'B');
 row('Merge').fire('keydown',{key:' '});assert.equal(w.selectedId,'Merge');assert.equal(w.analyzedId,'B');row('Merge').fire('keydown',{key:'Enter'});assert.equal(w.analyzedId,'Merge');
});
test('Back restores mode/root and late mode restore yields to a newer root; old library actions are rejected',async()=>{
 const {w,row}=setup();w.chooseQuery('Merge');const stale=row('A');w.chooseQuery('C');stale.fire('click');assert.equal(w.analyzedId,'C');await w.back();assert.equal(w.analyzedId,'Merge');await w.setMode('canvas');await w.back();assert.equal(w.viewMode,'flow');assert.equal(w.analyzedId,'Merge');
 await w.setMode('canvas');let finish;w.inspector.restoreViewState=()=>new Promise(resolve=>{finish=resolve;});const pending=w.setMode('flow');w.analyzeQuery('C');const current=state(w);finish();await pending;assert.deepEqual(state(w),current);
});
test('dragging a Canvas card records one pre-drag Undo and restores exact layout',async()=>{
 const {w,h,node}=setup();await w.setMode('canvas');w.canvas.setViewport({x:0,y:0,k:1});const before=plain([...w.canvas.captureLayout()]);node('B').fire('pointerdown',{clientX:10,clientY:10});node('B').fire('pointermove',{clientX:50,clientY:20});node('B').fire('pointermove',{clientX:80,clientY:60});node('B').fire('pointerup');h.flush();assert.equal(w.layoutHistory.length,1);assert.notDeepEqual(plain([...w.canvas.captureLayout()]),before);await w.undo();assert.deepEqual(plain([...w.canvas.captureLayout()]),before);
});


test('first pointer selection keeps closed reader geometry until double click settles; reroot and newer input cancel',()=>{
 const {w,node,timers,flushInspection}=setup();w.chooseQuery('Merge');const before=plain(w.canvas.getViewport());
 node('C').fire('pointerdown');node('C').fire('pointerup');assert.equal(w.selectedId,'C');assert.equal(w.inspectorOpen,false,'first click must not cover the next pointer target');assert.equal(timers.size,1);assert.deepEqual(plain(w.canvas.getViewport()),before);
 node('C').fire('pointerdown');node('C').fire('pointerup');node('C').fire('dblclick');assert.equal(w.analyzedId,'C');assert.equal(w.inspectorOpen,false);assert.equal(timers.size,0);flushInspection();assert.equal(w.inspectorOpen,false);
 node('B').fire('pointerdown');node('B').fire('pointerup');flushInspection();assert.equal(w.inspectorOpen,true);assert.equal(w.analyzedId,'C');
 w.chooseQuery('Merge');node('C').fire('pointerdown');node('C').fire('pointerup');const stale=[...timers.values()][0];w.navigate('Other',false,{preserveView:true});stale();assert.equal(w.selectedId,'Other');assert.equal(w.inspectorOpen,true);
 w.chooseQuery('Merge');node('C').fire('pointerdown');node('C').fire('pointerup');w.cancelPendingInspection();assert.equal(timers.size,0,'new pointer/keyboard input cancels scheduled reader');
});

test('parameter defaults to complete Used by without merge co-inputs; Inputs stays an honest singleton',async()=>{
 const {w,g,node}=setup(true);w.chooseQuery('P');
 assert.equal(w.direction,'consumers');assert.deepEqual([...w.visible].sort(),['A','After','B','C','Merge','P','Sibling']);
 assert.equal(w.visible.has('Other'),false,'do not switch direction at a merge');
 const used=state(w);w.navigate('B',true,{preserveView:true});assert.equal(w.analyzedId,'P');assert.equal(w.direction,'consumers');assert.deepEqual(state(w).view,used.view);
 w.setFlowDirection('inputs');assert.deepEqual([...w.visible],['P']);assert.equal(w.analyzedId,'P');assert.equal(w.context.byNodeId.get('P').consumerIds.length,1,'input singleton does not mean unused');
 await w.back();assert.equal(w.direction,'consumers');assert.equal(w.selectedId,'B');assert.deepEqual([...w.visible].sort(),['A','After','B','C','Merge','P','Sibling']);
 const entry=w.context.byNodeId.get('P');assert.equal(entry.chrome.color,'#79519f');assert.equal(entry.chrome.badge,'P');assert.equal(entry.presentation.status,'Parameter');assert.equal(entry.presentation.provider,null);
 assert.equal(node('P').querySelector('.pqc-source'),null);assert.doesNotMatch(node('P').getAttribute('aria-label'),/Unknown|kind unknown/);
 w.chooseQuery('Merge');assert.equal(w.direction,'inputs');assert.deepEqual([...w.visible].sort(),['A','B','C','Merge','Other','P']);
 w.setFlowDirection('consumers');assert.deepEqual([...w.visible].sort(),['After','Merge']);
 await w.setMode('canvas');await w.setMode('flow');assert.equal(w.direction,'consumers');assert.deepEqual([...w.visible].sort(),['After','Merge']);
});
test('Canvas library double-click and Enter analyze every ancestor and Back restores manual positions',async()=>{
 const {w,row}=setup(true);await w.setMode('canvas');w.blank();w.add('Merge',{x:1919,y:-123});const before=state(w);
 row('Merge').fire('dblclick');assert.equal(w.viewMode,'flow');assert.deepEqual([...w.visible].sort(),['A','B','C','Merge','Other','P']);await w.back();assert.deepEqual(state(w),before);
 row('Merge').fire('keydown',{key:'Enter'});assert.equal(w.viewMode,'flow');await w.back();assert.deepEqual(state(w),before);
});
test('explicit compact arrange centers the merge and places short co-input next to its consumer without moving hidden cards',()=>{
 const {w}=setup(true);const hidden=w.canvas.captureLayout().get('Cycle1');w.chooseQuery('Merge');const positions=w.canvas.captureLayout();
 assert.deepEqual(positions.get('Cycle1'),hidden);assert.equal(positions.get('Other').x,positions.get('C').x);
 assert.ok(positions.get('Merge').y>Math.min(positions.get('C').y,positions.get('Other').y));assert.ok(positions.get('Merge').y<Math.max(positions.get('C').y,positions.get('Other').y));
 for(const edge of w.context.graph.edges)if(w.visible.has(edge.inputId)&&w.visible.has(edge.consumerId))assert.ok(positions.get(edge.inputId).x<positions.get(edge.consumerId).x);
});
