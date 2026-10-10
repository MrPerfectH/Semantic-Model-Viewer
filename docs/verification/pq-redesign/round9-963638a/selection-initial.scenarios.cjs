(async function(tools,cfg){
const {tabId,out}=cfg,R={candidate:'963638aeb2d124460709374004ddcf0799268ada',boundary:'T3 registered UI; viewport preparation API explicitly marked; trusted clicks captured at pointerdown',checks:[],failures:[]};
const u=r=>{if(r.isError)throw Error(JSON.stringify(r));return r.structuredContent||JSON.parse(r.content.find(x=>x.type==='text').text)},run=async expression=>u(await tools.mcp__t3_code__preview_evaluate({tabId,expression,awaitPromise:true})).value,settle=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const save=async(n,v)=>{const s=JSON.stringify(v,null,2);await tools.apply_patch('*** Begin Patch\n*** Add File: '+out+'/'+n+'.json\n'+s.split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch')},eq=(a,b,m='equal')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+' '+JSON.stringify({a,b}))},ok=(v,m)=>{if(!v)throw Error(m)},click=async selector=>{u(await tools.mcp__t3_code__preview_click({tabId,selector,timeoutMs:5000}));await settle()},key=async key=>{u(await tools.mcp__t3_code__preview_press({tabId,key}));await settle()},btn=t=>click('.pqw button:visible:text-is('+JSON.stringify(t)+')'),row=n=>click('.pqw-library-row:has(strong:text-is('+JSON.stringify(n)+'))'),id=n=>JSON.stringify(['expression','',n]),native=async(s,v)=>{u(await tools.mcp__t3_code__preview_select({tabId,selector:s,values:[v]}));await settle()};
const state=()=>run(`(()=>{const w=app.powerQueryWorkspace;return {viewport:w.canvas.getViewport(),layout:[...w.canvas.captureLayout()],body:{x:w.body.scrollLeft,y:w.body.scrollTop},selected:w.selectedId,root:w.flowRootId,open:w.inspectorOpen,dock:w.dockPreference,below:w.below,width:w.width,height:w.height,prefs:JSON.parse(localStorage.getItem('smv.pq.inspector.v1')),nav:w.captureNavigation(),visible:[...w.visible]}})()`);
async function check(n,f){try{await f();R.checks.push(n)}catch(e){R.failures.push({name:n,error:String(e.stack||e)});await save('failure-'+R.failures.length,await state());}await save('receipt',R)}
await run(`window.__r9State=()=>{const w=app.powerQueryWorkspace;return {viewport:w.canvas.getViewport(),layout:[...w.canvas.captureLayout()],body:{x:w.body.scrollLeft,y:w.body.scrollTop}}};window.__r9Events=[];document.addEventListener('pointerdown',e=>__r9Events.push({trusted:e.isTrusted,target:e.target.className,text:e.target.textContent.slice(0,80),x:e.clientX,y:e.clientY,state:__r9State()}),true);true`);
await check('ordinary library selections preserve numeric viewport layout body at 46 percent right bottom closed resized',async()=>{
const rows=[];
for(const dock of ['right','bottom']){
 await btn('Display');await native('select[aria-label="M query panel position"]',dock);await btn('Close display settings');
 for(const [i,name] of ['FinalOutput','Raw West','Raw East','Standalone'].entries()){
  if(i===0&&await run('app.powerQueryWorkspace.inspectorOpen')){await run('app.powerQueryWorkspace.canvasHost.focus({preventScroll:true})');await key('Escape')}
  if(i===2){await run('app.powerQueryWorkspace.resizer.focus({preventScroll:true})');await key(dock==='bottom'?'ArrowUp':'ArrowLeft')}
  await run('app.powerQueryWorkspace.restoreViewport({x:137,y:93,k:.46});app.powerQueryWorkspace.body.scrollTop=0');await settle();const before=await state();await row(name);const after=await state(),event=await run('__r9Events.at(-1)');ok(event.trusted,'trusted library click');eq(after.selected,id(name));eq(after.viewport,before.viewport,'ordinary selection viewport');eq(after.layout,before.layout,'positions');eq(after.body,event.state.body,'body at actual activation');rows.push({dock,name,before,activation:event,after});
 }
}await save('selection-library',rows);
});
await check('card selections at panned 46 percent preserve viewport and layout',async()=>{
 await btn('Display');await native('select[aria-label="M query panel position"]','right');await btn('Close display settings');await btn('Reset filters');
 const rows=[];for(const name of ['Raw West','Raw East','Server']){
  // Set a view where the selected card is visible; do not move any model position.
  await run(`(()=>{const w=app.powerQueryWorkspace,p=w.canvas.captureLayout().get(${JSON.stringify(id(name))});w.restoreViewport({x:70-p.x*.46,y:80-p.y*.46,k:.46});w.body.scrollTop=0})()`);await settle();const before=await state();
  await click('.pqc-node:has(.pqc-node-title:text-is('+JSON.stringify(name)+'))');const after=await state(),event=await run('__r9Events.at(-1)');ok(event.trusted,'trusted card click');eq(after.selected,id(name));eq(after.viewport,before.viewport);eq(after.layout,before.layout);eq(after.body,event.state.body);rows.push({name,before,event,after});
 }await save('selection-cards',rows);
});
await check('explicit Center deterministic visible own title hit and hidden disabled',async()=>{
 const rows=[];for(const dock of ['right','bottom']){
 await btn('Display');await native('select[aria-label="M query panel position"]',dock);await btn('Close display settings');await row('FinalOutput');
 const before=await state();for(const view of [{x:-8000,y:-5000,k:.46},{x:9000,y:7000,k:1.3}]){
 await run('app.powerQueryWorkspace.restoreViewport('+JSON.stringify(view)+')');await btn('Center selected');const a=await state();await btn('Center selected');const b=await state();eq(a.viewport,b.viewport,'repeated center exact');eq(a.layout,before.layout);eq(a.root,before.root);
 const hit=await run(`(()=>{const w=app.powerQueryWorkspace,n=[...document.querySelectorAll('.pqc-node')].find(n=>n.dataset.nodeId===w.selectedId),r=n.querySelector('.pqc-node-title').getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),hit:h?.closest('.pqc-node')?.dataset.nodeId,viewport:{w:innerWidth,h:innerHeight}}})()`);eq(hit.hit,id('FinalOutput'),'own hit title');ok(hit.rect.top>=0&&hit.rect.bottom<=hit.viewport.h,'visible title');rows.push({dock,view,a,b,hit})}
 }await native('select[aria-label="Power Query connectivity filter"]','disconnected');const hidden=await run('({disabled:app.powerQueryWorkspace.centerButton.disabled,title:app.powerQueryWorkspace.centerButton.title,banner:app.powerQueryWorkspace.banner.textContent,selected:app.powerQueryWorkspace.selectedId})');ok(hidden.disabled,'hidden Center disabled');ok(hidden.title.length>0&&hidden.banner.includes('Hidden'),'hidden explained');await save('center',{rows,hidden});await btn('Reset filters');
});
await check('Frame related flow preserves inspection and exact Back state',async()=>{
 await btn('Clear flow');await row('FinalOutput');await row('Raw West');await run('app.powerQueryWorkspace.restoreViewport({x:137,y:93,k:.46})');await settle();const before=await state();eq(before.root,id('FinalOutput'));eq(before.selected,id('Raw West'));await btn('Frame related flow');const framed=await state();eq(framed.root,before.root);eq(framed.selected,before.selected);eq(framed.layout,before.layout);ok(framed.visible.includes(id('FinalOutput'))&&framed.visible.includes(id('Raw East')),'all upstream branches');ok(!framed.visible.includes(id('CoConsumer')),'co consumer not input branch');await btn('Back');const after=await state();eq(after.nav,before.nav,'Frame Back full state');await save('frame-flow',{before,framed,after});
});
await check('standard names informational while unknown and dynamic uncertainty remain visible',async()=>{
 await row('LanguageProbe');const s=await run(`(()=>{const w=app.powerQueryWorkspace,e=w.context.byNodeId.get(w.selectedId);return {entry:e,inspector:document.querySelector('.pqi').textContent,edges:w.context.graph.edges.filter(e=>e.consumerId===w.selectedId)}})()`);eq(s.edges.length,1);eq(s.edges[0].inputId,id('Raw West'));ok(s.inspector.includes('Standard M functions/types'),'standard classification shown');ok(s.inspector.includes('Unknown.Library')&&s.inspector.includes('MissingQuery'),'unknown names remain');await save('language-classification',s);
});
await save('receipt',R);return R;
})
