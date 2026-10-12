'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function(h){const {b,run,save,shot,inspect,button,importCase,filter,search,select,result,out,base,original,F,e}=h;const check=(name,fn)=>!process.env.PQ_SCENARIOS||process.env.PQ_SCENARIOS.split(',').some(x=>name.startsWith(x))?h.check(name,fn):Promise.resolve();
const nav=label=>`[...document.querySelectorAll('nav button')].find(n=>n.textContent===${JSON.stringify(label)})`;
const layout=()=>run('[...app.powerQueryWorkspace.canvas.captureLayout()]');
const box=()=>run(`document.querySelector('.pqc-surface').getBoundingClientRect().toJSON()`);
await check('Frozen filter combined/disconnected/fanout sequences with retained analysis and layout',async()=>{
 const records={};
 for(const [name,flow] of Object.entries(F.spec.workflows)){
  await importCase(flow.fixture);await run(`window.__baseContext=app.powerQueryWorkspace.context;window.__fitCalls=0;(()=>{const fit=app.powerQueryWorkspace.canvas.fit;app.powerQueryWorkspace.canvas.fit=(...a)=>{__fitCalls++;return fit(...a)}})();window.__savedQ1=[...app.powerQueryWorkspace.list.querySelectorAll('button')].find(n=>n.textContent.startsWith('Q1 ·'))`);
  const baseLayout=await layout(),baseGeneration=await run('app.powerQueryWorkspace.generation'),baseBuilds=await run('__workers.length'),rows=[];
  for(const step of flow.steps){
   const previous=rows.at(-1);
   if(step.id.includes('show-all'))await b.click(button('Show all'));
   else if(step.id.startsWith('reset-')||step.id==='fanout-reset')await b.click(button('Reset filters'));
   else if(step.id.startsWith('back-'))await b.click(button('Back'));
   else if(step.id.startsWith('reference-excluded'))await b.click('document.querySelector(".pqi-reference")');
   else if(step.id==='library-excluded-by-search')await run('__savedQ1.click()'); // captured real row event, queued before category/search excluded it
   else{
    if(step.category!==(await inspect()).category)await filter(step.category);
    if(step.search!==(await inspect()).query)await search(step.search);
    if(step.selectedId!==(await inspect()).selectedId&&step.selectedId)await select(F.spec.cases[flow.fixture].labels[step.selectedId]);
   }
   if(['connected-before-reference','hide-selected-for-reference'].includes(step.id))await run('document.querySelector(".pqi-reference").focus()');
   await b.settle();await b.settle();const state=await inspect(),projection=F.projection(flow.fixture,step.category,step.search),raw=await run(`(()=>{const w=app.powerQueryWorkspace,rects=[...document.querySelectorAll('.pqc-map-node')],nodes=w.context.graph.nodes;return {layout:[...w.canvas.captureLayout()],generation:w.generation,builds:__workers.length,sameContext:w.context===__baseContext,fitCalls:__fitCalls,dimmed:[...document.querySelectorAll('.pqc-node.pqc-dim')].filter(n=>!n.hidden).map(n=>n.dataset.nodeId),libraryIds:[...w.list.querySelectorAll('button')].map(n=>nodes.find(x=>n.textContent===x.label+' · '+x.subtitle)?.id),mutedIds:rects.flatMap((r,i)=>r.classList.contains('pqc-map-hidden')?[nodes[i].id]:[]),focus:document.activeElement.dataset.nodeId||null,options:[...w.filter.options].map(o=>o.textContent)}})()`);
   const row={id:step.id,state,raw};rows.push(row);save('frozen-'+name+'.json',rows);
   assert.equal(state.category,step.category);assert.equal(state.query,step.search);assert.equal(state.selectedId,step.selectedId);assert.equal(state.inspectorOpen,!!step.inspectorId);
   assert.deepEqual(state.visible.slice().sort(),projection.visible.slice().sort());assert.deepEqual(raw.libraryIds.slice().sort(),projection.matches.slice().sort());assert.deepEqual(raw.dimmed.slice().sort(),projection.dimmed.slice().sort());assert.deepEqual(raw.mutedIds.slice().sort(),projection.hidden.slice().sort());
   assert.deepEqual(raw.layout,baseLayout);assert.equal(raw.generation,baseGeneration);assert.equal(raw.builds,baseBuilds);assert.equal(raw.sameContext,true);assert.equal(raw.fitCalls,0);
   if(step.hiddenByFilter)assert.ok(state.banner.includes('hidden by filter'));
   if(step.announcement)assert.ok(state.message.includes(step.announcement));
   if(step.focusedId)assert.equal(raw.focus,step.focusedId);
   if(step.historyDelta)assert.equal(state.history.length-previous.state.history.length,step.historyDelta);
   if(step.restoreFrom){const prior=rows.find(r=>r.id===step.restoreFrom).state;for(const k of ['category','query','selectedId','code','viewport','inspectorView'])assert.deepEqual(state[k],prior[k],'Back restores '+k);}
   if(step.preserveFrom){const prior=rows.find(r=>r.id===step.preserveFrom).state;for(const k of ['selectedId','code','viewport'])assert.deepEqual(state[k],prior[k],'Reset retains '+k);assert.equal(state.history.length,prior.history.length);}
  }
  records[name]=rows;
 }
 save('frozen-workflows.json',records);
});
await check('A2 parameter five consumer highlighting and input-to-result geometry',async()=>{
 await importCase('a2-parameter');const before=await inspect();await select('Server');const after=await inspect();
 const visual=await run(`({related:document.querySelectorAll('.pqc-related').length,dashed:document.querySelectorAll('.pqc-parameter-edge').length,nodes:[...document.querySelectorAll('.pqc-node')].map(n=>({id:n.dataset.nodeId,rect:n.getBoundingClientRect().toJSON(),text:n.textContent})),arrows:[...document.querySelectorAll('.pqc-edge-line')].map(n=>n.getAttribute('marker-end'))})`);
 assert.equal(visual.related,5);assert.equal(visual.dashed,5);assert.equal(after.domNodes,before.domNodes);assert.ok(visual.arrows.every(x=>x.startsWith('url(')));
 for(const edge of after.graph.edges)assert.ok(visual.nodes.find(n=>n.id===edge.inputId).rect.x < visual.nodes.find(n=>n.id===edge.consumerId).rect.x);
 save('parameter-highlight.json',{before,after,visual});await shot('parameter-highlight');
});
await check('Reset filters narrow viewport/layout regression diagnosis',async()=>{
 await importCase('a3-results');await select('MergeResult');await filter('disconnected');await search('x');await run('app.powerQueryWorkspace.canvas.setViewport({x:123,y:87,k:1.3})');await b.settle();
 const before=await inspect(),beforeBox=await box(),beforeLayout=await layout();await b.click(button('Reset filters'));await b.settle();const after=await inspect(),afterBox=await box(),afterLayout=await layout();
 save('reset-filter-diagnosis.json',{before,after,beforeBox,afterBox,beforeLayout,afterLayout});await shot('reset-filter-diagnosis');
 assert.deepEqual(afterLayout,beforeLayout);assert.equal(after.selectedId,before.selectedId);assert.equal(after.code,before.code);assert.deepEqual(after.inspectorView,before.inspectorView);assert.equal(after.history.length,before.history.length);assert.equal(after.category,'all');assert.equal(after.query,'');assert.deepEqual(after.viewport,before.viewport,'Frozen reset oracle preserves viewport');
});
await check('A5 keyboard pan zoom fit search keys Escape focus Tab exit and inspector resize',async()=>{
 await importCase('a3-results');await run("document.querySelector('.pqc-surface').focus()");let before=await inspect();await b.key('ArrowRight');let after=await inspect();assert.equal(after.viewport.x,before.viewport.x-40);
 await b.key('+','Equal');let zoom=await inspect();assert.ok(zoom.viewport.k>after.viewport.k);await b.key('f','KeyF');await b.settle();let fit=await inspect();assert.notDeepEqual(fit.viewport,zoom.viewport);
 await run('app.powerQueryWorkspace.search.focus()');const inputView=(await inspect()).viewport;await b.key('ArrowLeft');await b.key('f','KeyF');assert.deepEqual((await inspect()).viewport,inputView);
 await search('Disconnected');assert.equal((await inspect()).library.length,1);await select('Disconnected');let selected=await inspect();assert.equal(selected.selectedId,e('Disconnected'));assert.equal(selected.visible.length,6);
 await run("document.querySelector('.pqi-code-scroll').focus()");await b.key('Escape');await b.settle();assert.equal((await inspect()).inspectorOpen,false);assert.equal(await run('document.activeElement.dataset.nodeId'),e('Disconnected'));
 const focused=await run(`({outline:getComputedStyle(document.activeElement).outline,focusVisible:document.activeElement.matches(':focus-visible')})`);assert.ok(focused.focusVisible);
 await b.key('Tab');const tab=await run(`({tag:document.activeElement.tagName,cls:document.activeElement.className,id:document.activeElement.dataset.nodeId})`);assert.notEqual(tab.id,e('Disconnected'));
 await search('');await select('MergeResult');const oldWidth=await run('app.powerQueryWorkspace.width');await run('app.powerQueryWorkspace.resizer.focus()');await b.key('ArrowLeft');assert.equal(await run('app.powerQueryWorkspace.width'),oldWidth+20);
 save('keyboard.json',{before,pan:after,zoom,fit,focused,tab,inspectorWidth:await run('app.powerQueryWorkspace.width')});await shot('keyboard');
});
await check('A7 exact multipartition duplicate and uncertainty inspectors',async()=>{
 await importCase('a7-uncertainty');const states=[];const ids=(await inspect()).graph.nodes.map(n=>n.id);
 for(let i=0;i<ids.length;i++){
  await b.click(`app.powerQueryWorkspace.list.querySelectorAll('button')[${i}]`);await b.settle();
  const state=await inspect();const presentation=await run(`(()=>{const w=app.powerQueryWorkspace,c=w.context.byNodeId.get(w.selectedId);return {title:document.querySelector('.pqi-title')?.textContent,body:w.inspectorHost.textContent,expectedCode:c.code,issues:c.issues,refs:[...document.querySelectorAll('.pqi-reference')].map(n=>n.textContent)};})()`);
  assert.equal(state.selectedId,ids[i]);assert.equal(state.code,presentation.expectedCode||'');states.push({id:ids[i],presentation,code:state.code});
 }
 const duplicates=states.filter(s=>JSON.parse(s.id)[0]==='metadata-occurrence');assert.equal(duplicates.length,2);assert.deepEqual(duplicates.map(s=>s.code).sort(),['1','2']);
 const parts=states.filter(s=>['Current','History'].some(x=>s.id===JSON.stringify(['partition','Sales',x])));assert.equal(parts.length,2);for(const p of parts)assert.ok(p.presentation.body.includes(JSON.parse(p.id)[2]));
 save('uncertainty-inspectors.json',states);for(const s of states)for(const issue of s.presentation.issues.filter(i=>i.kind!=='analysis-notice'))assert.ok(s.presentation.body.includes(issue.message),'Inspectable '+issue.kind+' on '+s.id);
 save('uncertainty-inspectors.json',states);await select('CycleA');await shot('uncertainty-cycle');await select('MissingRef');await b.click("document.querySelector('.pqi-analysis-details summary')");await shot('uncertainty-missing');
});
await check('A6 atomic worker publication scale last target readable and cancellable UI',async()=>{
 await importCase('a6-disconnected-1000');const state=await inspect();const progress=await run('__workers.at(-1)');const graph=state.graph;
 assert.equal(graph.nodes.length,1000);assert.equal(graph.edges.length,0);assert.equal(progress.terminated,true);
 const messages=progress.messages.map(m=>m.data);assert.ok(messages.some(m=>m.type==='ready'));let prior=0;for(const m of messages.filter(m=>m.type==='progress')){assert.equal(m.progress.total,1000);assert.ok(m.progress.analyzed>=prior);prior=m.progress.analyzed;}
 const start=performance.now();await b.click(button('Fit'));await b.settle();const fitMs=performance.now()-start;
 const overview=await run(`(()=>{const c=document.querySelector('.pqc-surface').getBoundingClientRect();return {canvas:c.toJSON(),nodes:[...document.querySelectorAll('.pqc-node')].map(n=>({id:n.dataset.nodeId,rect:n.getBoundingClientRect().toJSON()}))}})()`);
 for(const n of overview.nodes){assert.ok(n.rect.left>=overview.canvas.left-1&&n.rect.right<=overview.canvas.right+1);assert.ok(n.rect.top>=overview.canvas.top-1&&n.rect.bottom<=overview.canvas.bottom+1);}
 await shot('scale-1000-overview');const last=F.spec.cases['a6-disconnected-1000'].all.at(-1),label=F.spec.cases['a6-disconnected-1000'].labels[last];await search(label);await select(label);
 const lastTarget=await run(`(()=>{const n=document.querySelector('.pqc-selected'),c=document.querySelector('.pqc-surface');return {id:n.dataset.nodeId,node:n.getBoundingClientRect().toJSON(),canvas:c.getBoundingClientRect().toJSON(),font:getComputedStyle(n.querySelector('.pqc-node-title')).fontSize,view:app.powerQueryWorkspace.canvas.getViewport()}})()`);
 assert.equal(lastTarget.id,last);assert.ok(lastTarget.view.k>=.85);assert.ok(lastTarget.node.left>=lastTarget.canvas.left&&lastTarget.node.right<=lastTarget.canvas.right);await shot('scale-1000-last');
 save('scale-atomic.json',{progress,fitMs,overview,lastTarget,longTasks:await run('__long')});
 // Hold the real asset load, cancel via the rendered UI, then release the stale load.
 await run(`window.__originalAssets=Snapshots.loadAssets;Snapshots.loadAssets=(...a)=>new Promise(resolve=>{window.__releaseAssets=()=>__originalAssets(...a).then(resolve)});app.powerQueryWorkspace.start()`);
 await b.until('!!window.__releaseAssets','held asset load');let pending=await inspect();assert.equal(pending.graph,undefined);assert.equal(pending.domNodes,0);assert.equal(await run('app.powerQueryWorkspace.filter.disabled'),true);assert.ok(pending.message.includes('links pending'));
 await b.click(button('Cancel inspection'));const cancelled=await inspect();assert.equal(cancelled.phase,'cancelled');assert.equal(cancelled.domNodes,0);await run('__releaseAssets();Snapshots.loadAssets=__originalAssets');await b.settle();await b.settle();assert.equal((await inspect()).phase,'cancelled');
 save('cancelled-atomic.json',{pending,cancelled,afterRelease:await inspect()});await shot('cancelled-atomic');
});
await check('A8 model metadata generation reset suspended state and stale callback rejection',async()=>{
 await importCase('a8-reset-a');await select('SameTable');await filter('disconnected');await search('Same');const before=await inspect();await run('window.__oldMetadata=app.model.powerQuery;window.__oldGraph=app.powerQueryWorkspace.context.graph');
 await importCase('a8-reset-b');const after=await inspect();assert.equal(after.selectedId,null);assert.equal(after.history.length,0);assert.equal(after.code,'');assert.equal(after.category,'all');assert.equal(after.query,'');assert.ok(!JSON.stringify(after).includes('PQ_REDESIGN_OLD'));
 await select('SameIdentity');assert.ok((await inspect()).code.includes('PQ_REDESIGN_RESET_B_ONLY'));
 // Actual metadata identity replacement, same IDs; call real coordinator update while suspended.
 await b.click(nav('Tables'));await run('app.canvas.view={x:137,y:93,k:.9};app.canvas.updateTransform();window.__tableBefore=JSON.parse(JSON.stringify(app.canvas.view));app.model.powerQuery=JSON.parse(JSON.stringify(__oldMetadata));app.render()');
 const suspended=await inspect();assert.equal(suspended.code,'');assert.equal(suspended.selectedId,null);assert.equal(suspended.history.length,0);
 await b.click(nav('Power Query'));await b.until("app.powerQueryWorkspace.phase==='ready'",'metadata rebuild');await select('SameIdentity');assert.ok((await inspect()).code.includes('PQ_REDESIGN_RESET_A_ONLY'));
 await b.click(nav('Tables'));const tableAfter=await run('app.canvas.view'),tableBefore=await run('__tableBefore');save('tables-viewport.json',{tableBefore,tableAfter});await h.check('A8 Tables viewport preservation',async()=>assert.deepEqual(tableAfter,tableBefore));await b.click(nav('Power Query'));
 // Model identity changes even when the metadata object is reused.
 await run('app.model=Object.assign({},app.model);app.render()');await b.until("app.powerQueryWorkspace.phase==='ready'",'model identity rebuild');const identity=await inspect();assert.equal(identity.selectedId,null);assert.equal(identity.history.length,0);assert.equal(identity.code,'');
 save('reset-lifecycle.json',{before,after,suspended,identity});
});
await check('A8 stale actual worker completion after model reset',async()=>{
 await importCase('a8-reset-a');
 await run(`(()=>{const descriptor=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Worker.prototype),'onmessage');window.__held=null;window.__holdOne=true;Object.defineProperty(Worker.prototype,'onmessage',{configurable:true,get(){return descriptor.get.call(this)},set(fn){const worker=this;if(window.__holdOne&&typeof fn==='function'){window.__holdOne=false;descriptor.set.call(this,event=>{if(event.data.type==='ready')window.__held={fn,event,worker};else fn(event)});}else descriptor.set.call(this,fn);}});app.powerQueryWorkspace.start()})()`);
 await b.until('!!window.__held','held actual worker completion');const pending=await inspect();assert.equal(pending.phase,'building');assert.equal(pending.domNodes,0);assert.equal(await run('app.powerQueryWorkspace.filter.disabled'),true);
 await run(`app.model=Object.assign({},app.model,{powerQuery:null});app.render();__held.fn(__held.event)`);await b.settle();const stale=await inspect();assert.equal(stale.domNodes,0);assert.equal(stale.code,'');assert.equal(stale.history.length,0);assert.ok(stale.message.includes('unavailable'));assert.equal(await run('__held.worker.__receipt.terminated'),true);
 save('stale-worker.json',{pending,stale,actualHeldMessage:await run('__held.event.data'),worker:await run('__held.worker.__receipt')});await shot('reset-unavailable');
});
await check('A9 actual default snapshot excludes raw M and opens offline unavailable',async()=>{
 await importCase('a9-privacy');const state=await inspect();await b.click('app.powerQueryWorkspace.list.querySelectorAll("button")[0]');await b.settle();
 const xss=await run(`({global:window.PQ_XSS_EXECUTED,unexpected:app.powerQueryWorkspace.inspectorHost.querySelectorAll('img,svg,script').length,code:[...document.querySelectorAll('.pqi-source-line')].map(n=>n.textContent).join('')})`);assert.equal(xss.global,undefined);assert.equal(xss.unexpected,0);
 const download=path.join(out,'download');fs.mkdirSync(download,{recursive:true});await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:download,eventsEnabled:true});await b.click(button('Save snapshot'));await b.until('!app.state.snapshotSaving','snapshot export');assert.equal(await run('app.state.snapshotError'),'');
 const start=Date.now();let files;do{files=fs.readdirSync(download).filter(x=>x.endsWith('.html'));if(files.length)break;await new Promise(r=>setTimeout(r,50));}while(Date.now()-start<15000);assert.equal(files.length,1);
 const file=path.join(download,files[0]),html=fs.readFileSync(file,'utf8'),match=html.match(/<script[^>]*id="smv-snapshot-data"[^>]*>([\s\S]*?)<\/script>/);assert.ok(match);const payload=JSON.parse(match[1]);
 for(const token of ['powerQuery','PQ_REDESIGN_','pq-redesign.invalid','PQ_XSS_EXECUTED'])assert.ok(!JSON.stringify(payload).includes(token),'Payload leaked '+token);
 assert.ok(!html.includes('PQ_REDESIGN_')&&!html.includes('pq-redesign.invalid'));
 const requests=b.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);assert.equal(requests.filter(u=>u.includes('.invalid')||u.includes('model-data.json')).length,0);
 save('privacy-export.json',{xss,payload,bytes:Buffer.byteLength(html),requests,sourceRequestCount:0});
 await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await b.send('Page.navigate',{url:'file://'+file});await b.until('!!window.app && app.snapshotMode','offline snapshot boot');await b.click(nav('Power Query'));await b.settle();const offline=await inspect();assert.equal(offline.domNodes,0);assert.equal(offline.code,'');assert.ok(offline.message.includes('unavailable'));save('offline-snapshot.json',offline);await shot('offline-snapshot');
 });
};
