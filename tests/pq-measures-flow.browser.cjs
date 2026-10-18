'use strict';
// Actual registered browser journey. Generic regressions run separately on Linux.
// Source is read from a user-authorized local model; receipts deliberately exclude M.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.PQ_CHECKOUT||path.resolve(__dirname,'..');
const {open}=require(path.join(root,'tests/pq-redesign-independent-runtime-transport.cjs'));
const out=process.env.PQ_OUT||'/tmp/pq-measures-flow-browser',origin=process.env.PQ_ORIGIN||'http://localhost:8945',modelPath=process.env.PQ_MODEL_PATH;
if(!modelPath)throw Error('PQ_MODEL_PATH must identify the authorized local TMDL model');
fs.mkdirSync(out,{recursive:true});
const receipt={boundary:'Actual Chrome registered-app fallback after two T3 snapshot timeouts and explicit no-host. Local actual model; no source text in evidence.',checks:[],events:[]};
(async()=>{const b=await open(),run=b.evaluate;
const save=(n,v)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(v,null,2)+'\n');
const shot=async n=>fs.writeFileSync(path.join(out,n+'.png'),Buffer.from((await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
const button=t=>`[...document.querySelectorAll('.pqw button')].find(e=>e.textContent===${JSON.stringify(t)}&&e.getBoundingClientRect().width)`;
const library=t=>`[...document.querySelectorAll('.pqw-library-row')].find(e=>e.querySelector('strong').textContent===${JSON.stringify(t)})`;
const card=t=>`[...document.querySelectorAll('.pqc-node')].find(e=>app.powerQueryWorkspace.context.byNodeId.get(e.dataset.nodeId).node.label===${JSON.stringify(t)})`;
async function click(expression){await b.settle();const point=await run(`(()=>{const e=(${expression});if(!e)throw Error('Missing target');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);if(!h||!e.contains(h))throw Error('Target occluded: '+e.textContent.slice(0,50)+' by '+h?.className);return{x,y,label:e.getAttribute('aria-label')||e.textContent.slice(0,70)};})()`);await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y});receipt.events.push(point);await b.settle();}
const state=()=>run(`(()=>{const w=app.powerQueryWorkspace,label=id=>id?w.context.byNodeId.get(id).node.label:null;return{root:label(w.analyzedId),lock:label(w.flowRootId),selected:label(w.selectedId),members:[...w.membership].map(label).sort(),visible:[...w.visible].map(label).sort(),view:w.canvas.getViewport(),layout:[...w.canvas.captureLayout()].sort((a,b)=>a[0].localeCompare(b[0])),body:{x:w.body.scrollLeft,y:w.body.scrollTop},renderedEdges:[...document.querySelectorAll('.pqc-edge-hit')].filter(e=>e.getAttribute('d')&&getComputedStyle(e).display!=='none').length,edges:w.context.graph.edges.length,notice:w.viewNotice.textContent,codeExact:!!w.selectedId&&[...document.querySelectorAll('.pqi-source-line')].map(e=>e.textContent).join('')===w.context.byNodeId.get(w.selectedId).code};})()`);
async function check(name,fn){try{await fn();receipt.checks.push({name,pass:true});}catch(e){receipt.checks.push({name,pass:false,error:e.stack});save('failure',await state());await shot('failure');throw e;}finally{save('receipt',receipt);}}
try{
 await b.send('Page.enable');await b.send('Runtime.enable');const win=await b.send('Browser.getWindowForTarget');await b.send('Browser.setWindowBounds',{windowId:win.windowId,bounds:{width:1440,height:987}});await b.send('Page.navigate',{url:origin});await b.until('!!window.app','boot');
 await run(`(async()=>{const d=await(await fetch('/api/model?path='+encodeURIComponent(${JSON.stringify(modelPath)}))).json();if(d.error)throw Error(d.error);app.setState({showImport:true,showModelMenu:false});await app.handleFiles(d.files.map(f=>({name:f.name,p:f.path,text:f.text})));})()`);
 await b.until('app.state.importReady','parsed');await click(`[...document.querySelectorAll('button')].find(e=>/^(Add|Update) model/.test(e.textContent))`);
 await click(`[...document.querySelectorAll('nav button')].find(e=>e.textContent==='Power Query')`);await b.until("app.powerQueryWorkspace.phase==='ready'",'worker');await b.settle();
 const baseline=await state();save('baseline',{objects:baseline.members.length,edges:baseline.edges});
 await check('Actual two-object flow is compact, readable and complete',async()=>{
  await click(library('12_Months'));const s=await state();assert.equal(s.root,'12_Months');assert.deepEqual(s.visible,['12_Months','MdCalendar']);assert.ok(s.view.k>=.85);assert.ok(s.codeExact);const rects=await run(`[...document.querySelectorAll('.pqc-node')].filter(e=>!e.hidden&&e.style.display!=='none').map(e=>e.getBoundingClientRect().toJSON())`);assert.equal(rects.length,2);assert.ok(rects.every(r=>r.width>=210&&r.left>=268&&r.right<=1440));assert.ok(Math.abs(rects[0].top-rects[1].top)<1);save('pair',{...s,rects});await shot('pair');
 });
 await check('Card inspection keeps analyzed root, positions and viewport; explicit Analyze and Back restore them',async()=>{
  const before=await state();await click(card('MdCalendar'));let s=await state();assert.equal(s.root,'12_Months');assert.equal(s.selected,'MdCalendar');assert.deepEqual(s.view,before.view);assert.deepEqual(s.layout,before.layout);assert.ok(s.codeExact);
  const inspected=await state();await click(`document.querySelector('.pqw [aria-label="Analyze this query"]')`);assert.equal((await state()).root,'MdCalendar');await click(button('Back'));s=await state();assert.equal(s.root,'12_Months');assert.equal(s.selected,'MdCalendar');assert.deepEqual(s.layout,inspected.layout);assert.deepEqual(s.view,inspected.view);assert.ok(s.codeExact);await shot('inspecting');
 });
 await check('Tables add/remove/Undo retain existing positions and flow',async()=>{
  const before=await state();await click(`document.querySelector('.pqw [aria-label="Add ServerName to canvas"]')`);let s=await state();assert.equal(s.root,'12_Months');assert.ok(s.members.includes('ServerName'));for(const [id,p]of before.layout){if(!id.includes('ServerName'))assert.deepEqual(new Map(s.layout).get(id),p);}
  await click(`document.querySelector('.pqw [aria-label="Remove ServerName from layout"]')`);assert.ok(!(await state()).members.includes('ServerName'));await click(button('Undo'));s=await state();assert.ok(s.members.includes('ServerName'));assert.equal(s.root,'12_Months');
 });
 await check('Actual SchemaName flow contains its consumer, not sibling parameters; Hide compacts direct flow; Undo restores',async()=>{
  await click(library('SchemaName'));let s=await state();assert.equal(s.root,'SchemaName');assert.ok(s.visible.includes('VerticaPath'));assert.ok(!s.visible.includes('ServerName'));assert.ok(!s.visible.includes('DBName'));save('parameter-flow',s);
  await run(`(()=>{let e=document.querySelector('.pqw [aria-label="Query reference distance"]');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await b.settle();const before=await state();await click(button('Hide unrelated'));s=await state();assert.deepEqual(s.visible,['SchemaName','VerticaPath']);assert.ok(s.view.k>=.85);await shot('parameter-direct');await click(button('Undo'));s=await state();assert.deepEqual(s.visible,before.visible);assert.deepEqual(s.layout,before.layout);assert.deepEqual(s.view,before.view);
 });
 await check('Explicit lock preserves analyzed flow across library selection; Back restores inspection',async()=>{
  await click(`document.querySelector('.pqi-lock')`);const before=await state();await click(library('12_Months'));let s=await state();assert.equal(s.lock,'SchemaName');assert.equal(s.root,'SchemaName');assert.equal(s.selected,'12_Months');assert.deepEqual(s.view,before.view);await click(button('Back'));s=await state();assert.equal(s.selected,'SchemaName');assert.equal(s.root,'SchemaName');assert.deepEqual(s.view,before.view);
 });
 await check('Show all restores registry; Blank plus manual additions remains Tables-style; wide exact M reader',async()=>{
  await click(button('Show all'));let s=await state();assert.equal(s.root,null);assert.equal(s.lock,null);assert.equal(s.visible.length,baseline.members.length);assert.equal(s.edges,baseline.edges);save('all',s);
  await click(button('Blank layout'));assert.equal((await state()).visible.length,0);await click(`document.querySelector('.pqw [aria-label="Add 12_Months to canvas"]')`);await click(`document.querySelector('.pqw [aria-label="Add MdCalendar to canvas"]')`);await click(button('Arrange'));s=await state();assert.deepEqual(s.visible,['12_Months','MdCalendar']);assert.equal(s.root,null);assert.ok(s.view.k>=.85);await click(button('Open full query'));await b.settle();assert.ok((await state()).codeExact);await shot('reader');await b.key('Escape');await b.settle();assert.ok((await state()).codeExact);
 });
 receipt.runtimeExceptions=b.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(receipt.runtimeExceptions.length,0);save('receipt',receipt);console.log(JSON.stringify({checks:receipt.checks,out}));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
