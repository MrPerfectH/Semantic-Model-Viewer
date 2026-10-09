// FROZEN independent registered-browser repro. Do not run before exact-candidate release.
// Call with {root,out,tabId,candidate}; caller serves/verifies exact33 runtime map first.
// New candidate must satisfy both semantic edge identities through actual trusted clicks.
(async function(tools,cfg){
const {root,out,tabId}=cfg,candidate=cfg.candidate||'9c3b836ecfcbf36a6888b576b5b8eba9f16886cd';
const unwrap=r=>{if(r.isError)throw Error(JSON.stringify(r));return r.structuredContent||JSON.parse(r.content.find(x=>x.type==='text').text)};
const run=async expression=>unwrap(await tools.mcp__t3_code__preview_evaluate({tabId,expression,awaitPromise:true})).value;
const settle=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const click=async selector=>{unwrap(await tools.mcp__t3_code__preview_click({tabId,selector,timeoutMs:5000}));await settle()};
const save=async(n,x)=>{const s=JSON.stringify(x,null,2);await tools.apply_patch('*** Begin Patch\n*** Add File: '+out+'/'+n+'.json\n'+s.split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch')};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b))};
const receipt={candidate,gate:'Both opposing cycle edges retain independently clickable semantic identity after horizontal-separation drag',checks:[],failures:[]};
try{
 unwrap(await tools.mcp__t3_code__preview_resize({tabId,mode:'freeform',width:1440,height:900}));
 await click('button:visible:text-is("Open model")');await click('button:visible:text-is("Choose files")');unwrap(await tools.mcp__t3_code__preview_upload({tabId,paths:[root+'/tests/acceptance-fixtures/pq-redesign/reader-connectors-9c3b836/model.bim']}));await click('button:visible:text-matches("^(Add|Update) model")');await click('nav button:text-is("Power Query")');
 for(let i=0;i<100;i++){if(await run("app.powerQueryWorkspace.phase==='ready'"))break;await settle()}eq(await run('app.powerQueryWorkspace.phase'),'ready','ready');
 await click('.pqw-toolbar button:text-is("Blank layout")');for(const n of ['CycleA','CycleB','SelfLoop'])await click('button[aria-label='+JSON.stringify('Add '+n+' to canvas')+']');
 const before=await run(`(()=>{const w=app.powerQueryWorkspace,id=n=>JSON.stringify(['expression','',n]),p=w.canvas.captureLayout();p.set(id('CycleA'),{x:0,y:0});p.set(id('CycleB'),{x:0,y:300});p.set(id('SelfLoop'),{x:450,y:150});w.canvas.restoreLayout(p);w.select(id('CycleA'),false);w.applyFilters();w.canvas.fit();window.__cyclePointers=[];document.addEventListener('pointerdown',e=>__cyclePointers.push({trusted:e.isTrusted,x:e.clientX,y:e.clientY,target:e.target.className}),true);return {graph:JSON.stringify(w.context.graph),layout:[...w.canvas.captureLayout()],viewport:w.canvas.getViewport()}})()`);await settle();
 await click('button[aria-label="Remove SelfLoop from layout"]');
 unwrap(await tools.mcp__t3_code__preview_drag({tabId,source:'.pqc-node[data-node-id=\'["expression","","CycleB"]\'] .pqc-node-title',target:'.pqc-map-label',timeoutMs:5000}));await settle();
 const observed=await run(`(()=>{const w=app.powerQueryWorkspace;return {graph:JSON.stringify(w.context.graph),layout:[...w.canvas.captureLayout()],viewport:w.canvas.getViewport(),pointers:__cyclePointers,edges:[...document.querySelectorAll('.pqc-edge-hit')].filter(h=>h.parentElement.style.display!=='none').map(h=>{const e=w.context.graph.edges.find(e=>e.id===h.dataset.edgeId);return {id:e.id,input:e.inputId,consumer:e.consumerId,inputLabel:w.context.byNodeId.get(e.inputId).node.label,consumerLabel:w.context.byNodeId.get(e.consumerId).node.label,d:h.getAttribute('d'),line:h.previousElementSibling.getAttribute('d'),width:getComputedStyle(h).strokeWidth,samples:Array.from({length:199},(_,i)=>{const p=h.getPointAtLength(h.getTotalLength()*(i+1)/200).matrixTransform(h.getScreenCTM());return {x:p.x,y:p.y,hit:document.elementFromPoint(p.x,p.y)?.dataset.edgeId}})}})}})()`);
 await save('observed',{before,observed});eq(observed.graph,before.graph,'graph immutable');eq(observed.edges.length,2,'two visible opposite edges');const layout=Object.fromEntries(observed.layout),a=layout[JSON.stringify(['expression','','CycleA'])],b=layout[JSON.stringify(['expression','','CycleB'])];eq(a,{x:0,y:0},'anchor unchanged');if(!(b.x>=a.x+252+32))throw Error('REPRO SETUP: actual drag did not reach horizontal route branch');
 const ownHits=observed.edges.map(e=>({id:e.id,count:e.samples.filter(p=>p.hit===e.id).length}));await save('identity-oracle',{ownHits,expected:'Each semantic edge has at least one reachable own interior hit, then actual click opens its own consumer/source detail'});
 if(ownHits.some(e=>e.count===0))throw Error('BLOCKER: an opposing cycle edge has no independently reachable interior hit region');
 const clicks=[];for(const e of observed.edges){const p=e.samples.find(p=>p.hit===e.id);unwrap(await tools.mcp__t3_code__preview_click({tabId,x:p.x,y:p.y}));await settle();const heading=await run('app.powerQueryWorkspace.popover.querySelector("h3").textContent');eq(heading,e.inputLabel+' is referenced by '+e.consumerLabel,'trusted click semantic identity');clicks.push({edgeId:e.id,point:p,heading});await click('.pqw button:visible:text-is("Close reference details")')}
 await save('semantic-clicks',clicks);receipt.checks.push('Both opposite edges independently hit-tested and clicked with correct semantic details');
}catch(error){receipt.failures.push(String(error.stack||error))}
await save('receipt',receipt);return receipt;
})
