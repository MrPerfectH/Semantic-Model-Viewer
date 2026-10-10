'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {open}=require('./pq-redesign-independent-runtime-transport.cjs');
const repo=path.resolve(__dirname,'..'),base=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const candidate=execFileSync('git',['rev-parse','HEAD'],{cwd:repo}).toString().trim();
const mapped=path.join(repo,'docs/verification/pq-round8');
const out=path.join(mapped,process.env.PQ_RUN||'zoom200-strict');fs.mkdirSync(out);
const crypto=require('node:crypto');
const assets=['index.html','js/power-query-workspace.js','js/power-query-inspector.js'];
const source=Object.fromEntries(assets.map(a=>[a,crypto.createHash('sha256').update(fs.readFileSync(path.join(process.env.PQ_SOURCE||repo,'Models/tools/viewer',a))).digest('hex')]));
const result={candidate,source,node:process.version,startedAt:new Date().toISOString(),boundary:'explicitly authorized narrow capability fallback while T3 available; fresh isolated Chrome; not native VS Code',cases:[],checks:[],failures:[]};
const url=process.env.PQ_URL||'http://127.0.0.1:8947/Models/tools/viewer/';
(async()=>{const b=await open();const run=b.evaluate;const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
 async function shot(name){fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));}
 async function check(name,fn){try{await fn();result.checks.push({name,status:'pass'});}catch(error){result.failures.push({name,error:error.stack});await shot('failure-'+result.failures.length);save('failure-'+result.failures.length+'.json',{state:await inspect(),pointer:await run('window.__pointer||[]')});}save('receipt.json',result);}
 const inspect=()=>run(`(()=>{let w=app.powerQueryWorkspace;return {phase:w.phase,message:w.message.textContent,category:w.category,query:w.query,selectedId:w.selectedId,inspectorOpen:w.inspectorOpen,count:w.count.textContent,banner:w.banner.textContent,code:[...document.querySelectorAll('.pqi-source-line')].map(e=>e.textContent).join(''),viewport:w.canvas.getViewport(),inspectorView:w.inspector.captureViewState(),history:w.history,domNodes:document.querySelectorAll('.pqc-node').length,visible:[...document.querySelectorAll('.pqc-node')].filter(n=>!n.hidden).map(n=>n.dataset.nodeId),library:[...w.list.querySelectorAll('button')].map(n=>n.textContent),map:document.querySelector('.pqc-map-label')?.textContent,graph:w.context?.graph,sets:w.sets?Object.fromEntries(Object.entries(w.sets).map(([k,v])=>[k,[...v]])):null}})()`);
 const button=text=>`[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(text)} && n.getBoundingClientRect().width>0)`;
 async function visibleClick(expression){
   await run(`(${expression}).scrollIntoView({block:'center',inline:'nearest'})`);await b.settle();
   const p=await run(`(()=>{const e=(${expression}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,own:e.contains(document.elementFromPoint(x,y)),text:e.textContent}})()`);
   assert(p.own,'Trusted action target must hit itself: '+p.text);
   for(const type of ['mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
 }
 async function importCase(name){
  const file=path.join(__dirname,'acceptance-fixtures/pq-round7/chain52.bim');
  if(!await run('app.state.showImport'))await b.click(button(await run('app.state.showModelMenu')?'Import model (TMDL / BIM)':'Open model'));await b.until('!!document.querySelector("input[type=file]")','import input');
  const doc=await b.send('DOM.getDocument'),input=await b.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});
  await b.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});await b.until('app.state.importReady','parsed synthetic import');
  await b.click("[...document.querySelectorAll('button')].find(n=>/^(Add|Update) model/.test(n.textContent))");
  await b.until('!app.state.showImport','import committed');await b.click("[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Power Query')");
  const start=performance.now();await b.until("['ready','error'].includes(app.powerQueryWorkspace.phase)",'worker result');await b.settle();
  assert.equal(await run('app.powerQueryWorkspace.phase'),'ready');return performance.now()-start;
 }
 async function filter(category){await run(`(()=>{let s=app.powerQueryWorkspace.filter;s.value=${JSON.stringify(category)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await b.settle();}
 async function search(text){await run(`(()=>{let s=app.powerQueryWorkspace.search;s.value=${JSON.stringify(text)};s.dispatchEvent(new Event('input',{bubbles:true}));})()`);await b.settle();}
 async function select(label){await b.click(`[...document.querySelectorAll('.pqw-library-row')].find(n=>n.querySelector('strong').textContent===${JSON.stringify(label)})`);await b.settle();}
 try{
  for(const a of assets){const bytes=Buffer.from(await (await fetch(url+a)).arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source[a],'served source '+a);}
  await b.send('Page.enable');await b.send('Network.enable');await b.send('Runtime.enable');

  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});`});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__workers=[];const W=window.Worker;window.Worker=class extends W{constructor(...a){super(...a);const row={created:performance.now(),messages:[],terminated:false};__workers.push(row);this.addEventListener('message',e=>row.messages.push({time:performance.now(),data:e.data}));this.__receipt=row;}terminate(){this.__receipt.terminated=true;super.terminate();}};`});
  await b.send('Page.navigate',{url});await b.until("!!window.app && app.state.modelName==='Choose a model' && app.state.showModelMenu",'registered empty boot and initial picker');await run('document.fonts.ready');await b.settle();result.browser=await b.send('Browser.getVersion');
  const nativeWindow=await b.send('Browser.getWindowForTarget');
  let settingIndex=0;async function settingsZoom(value){
    await b.send('Page.navigate',{url:'chrome://settings/appearance'});await b.until(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return true;if(n.shadowRoot&&find(n.shadowRoot))return true}}return !!find(document)})()`,'actual zoom setting');
    await run(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return n;if(n.shadowRoot){const x=find(n.shadowRoot);if(x)return x}}}const z=find(document);z.value=${JSON.stringify(String(value))};z.dispatchEvent(new Event('change',{bubbles:true}));return z.value})()`);
    const persisted=await run(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return n;if(n.shadowRoot){const x=find(n.shadowRoot);if(x)return x}}}const z=find(document);return {value:z.value,selected:z.options[z.selectedIndex].textContent}})()`);assert.equal(persisted.value,String(value));save('actual-browser-setting-'+(++settingIndex)+'.json',persisted);
    await b.send('Page.navigate',{url});await b.until(`location.origin===${JSON.stringify(new URL(url).origin)} && !!window.app && !!app.state.modelName`,'app after settings');await run('document.fonts.ready');await b.settle();
    await run(`window.__pointer=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>__pointer.push({type,target:{tag:e.target.tagName,cls:e.target.className,id:e.target.id,aria:e.target.getAttribute('aria-label'),text:e.target.textContent.slice(0,120)},clientX:e.clientX,clientY:e.clientY,pageX:e.pageX,pageY:e.pageY,screenX:e.screenX,screenY:e.screenY,isTrusted:e.isTrusted,buttons:e.buttons,pointerId:e.pointerId,time:performance.now()}),true)`);
  }
  const measure=()=>run(`(()=>{const w=app.powerQueryWorkspace,rect=n=>n.getBoundingClientRect().toJSON(),r=rect(w.resizer),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),vv=visualViewport;return {innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,below:w.below,width:w.width,height:w.height,inspectorOpen:w.inspectorOpen,selectedId:w.selectedId,inspector:rect(w.inspectorHost),separator:r,surface:rect(document.querySelector('.pqc-surface')),aria:{orientation:w.resizer.getAttribute('aria-orientation'),value:w.resizer.getAttribute('aria-valuenow')},hit:{tag:hit?.tagName,cls:hit?.className,html:hit?.outerHTML.slice(0,400)},visualViewport:{offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,pageLeft:vv.pageLeft,pageTop:vv.pageTop,width:vv.width,height:vv.height,scale:vv.scale},scroll:{windowX:scrollX,windowY:scrollY,documentX:document.documentElement.scrollLeft,documentY:document.documentElement.scrollTop,bodyX:document.body.scrollLeft,bodyY:document.body.scrollTop,pqBodyX:w.body.scrollLeft,pqBodyY:w.body.scrollTop,inspectorHostY:w.inspectorHost.scrollTop,inspectorRootY:document.querySelector('.pqi')?.scrollTop},active:{tag:document.activeElement.tagName,cls:document.activeElement.className},pointer:__pointer.slice()}})()`);
  for(const width of (process.env.PQ_ZOOM_WIDTH?[Number(process.env.PQ_ZOOM_WIDTH)]:[1280,1440])){
    await settingsZoom(1);await b.send('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{width,height:1087}});await b.settle();
    for(const [i,zoom] of [2].entries())await check('Actual resize transition '+width+' step'+i+' zoom'+zoom,async()=>{
      await settingsZoom(zoom);
      if(zoom===1){
        await b.until('app.state.loaded','cached model loaded');
        const cache=await run('({menu:app.state.showModelMenu,tables:app.model.tables.length})');assert.ok(cache.tables>0,'current long-M fixture contains a table');assert.equal(cache.menu,false,'table-bearing cache does not open empty-model picker');
        await b.click("[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Power Query')");await b.until("app.powerQueryWorkspace.phase==='ready'",'cached PQ');save('cached-model-'+width+'.json',cache);
      }else await importCase('flow-0d964fc');
      const title=()=>run(`(()=>{const w=app.powerQueryWorkspace,n=[...document.querySelectorAll('.pqc-node')].find(n=>n.dataset.nodeId===w.selectedId),t=n.querySelector('.pqc-node-title'),r=t.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {view:w.canvas.getViewport(),label:w.zoom.textContent,root:w.flowRootId,selected:w.selectedId,registry:w.context.graph.nodes.length,edges:w.context.graph.edges.length,visible:w.visible.size,title:r.toJSON(),hit:h?.outerHTML,own:h?.closest('[data-node-id]')===n,map:document.querySelector('.pqc-minimap').getBoundingClientRect().toJSON(),nav:w.nav.getBoundingClientRect().toJSON(),canvas:w.canvasHost.getBoundingClientRect().toJSON(),bodyY:w.body.scrollTop,flowButtons:[...w.flowBar.querySelectorAll('button')].map(n=>({text:n.textContent,r:n.getBoundingClientRect().toJSON()}))}})()`);
      await select('FinalChain');const positions=await run('[...app.powerQueryWorkspace.canvas.captureLayout()]');save('before-hide-'+width+'.json',await measure());await b.click(button('Hide unrelated'));await b.settle();const hidden=await title();save('after-hide-'+width+'.json',{title:hidden,actual:await measure()});assert.equal(hidden.own,true,'Hide must automatically expose its selected title');await b.click(button('Arrange'));await b.settle();

      assert.deepEqual(await run('[...app.powerQueryWorkspace.canvas.captureLayout()]'),positions);
      const initialTitle=await title();save('automatic-framing-'+width+'.json',{initialTitle,actual:await measure()});await shot('automatic-framing-'+width);assert.equal(initialTitle.registry,52);assert.equal(initialTitle.edges,51);assert.equal(initialTitle.visible,52);assert.ok(initialTitle.view.k>=.85);assert.equal(initialTitle.own,true,'Automatic Hide/Arrange framing must leave the selected readable title visible and hit-testable, without a second manual scroll');
      // Navigation, Trace and Show all retain every object/position. No scroll
      // correction is performed by this harness after any action.
      await visibleClick(button('Follow input Step49').replace("n.textContent===", "n.getAttribute('aria-label')==="));await b.settle();
      for(const action of ['Trace this query','Show all']){
        const before=await measure();await visibleClick(button(action));await b.settle();const after=await title();
        save(action.replaceAll(' ','-')+'-'+width+'.json',{before,after,actual:await measure()});await shot(action.replaceAll(' ','-')+'-'+width);
        assert.equal(after.own,true,action+' must automatically expose its selected title');assert(after.view.k>=.85);assert.equal(after.registry,52);assert.equal(after.edges,51);
        assert.deepEqual(await run('[...app.powerQueryWorkspace.canvas.captureLayout()]'),positions);
      }
      // A subsequent trusted wheel owns the scroll; no delayed frame may undo it.
      const wheelPoint=await run('(()=>{const r=app.powerQueryWorkspace.body.getBoundingClientRect();return {x:r.right-20,y:r.bottom-20}})()');
      await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheelPoint,deltaX:0,deltaY:160});await b.settle();
      const scrolled=await measure();await new Promise(r=>setTimeout(r,80));const later=await measure();
      save('later-input-'+width+'.json',{scrolled,later});assert.equal(later.scroll.pqBodyY,scrolled.scroll.pqBodyY);
    });
  }
  await check('Trusted rapid Back to separator owns focus; settled Back retains exact view',async()=>{
    await settingsZoom(1);await b.send('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{width:1440,height:1087}});await importCase('chain');
    await select('FinalChain');await b.click(button('Hide unrelated'));await b.settle();
    const state=()=>run(`(()=>{const w=app.powerQueryWorkspace;return {selected:w.selectedId,root:w.flowRootId,view:w.canvas.getViewport(),label:w.zoom.textContent,layout:[...w.canvas.captureLayout()],inspector:w.inspector.captureViewState(),body:w.body.scrollTop,active:document.activeElement.className}})()`);
    const before=await state();await visibleClick(button('Follow input Step49').replace("n.textContent===", "n.getAttribute('aria-label')==="));await b.settle();
    await b.click(button('Back'));await b.settle();const back=await state();
    assert.deepEqual(back.view,before.view);assert.equal(back.label,before.label);assert.deepEqual(back.layout,before.layout);assert.equal(back.body,before.body);
    const focusRuns=[];
    for(let n=0;n<6;n++){
      await visibleClick(button('Follow input Step49').replace("n.textContent===", "n.getAttribute('aria-label')==="));await b.settle();
      const points=await run(`(()=>{const w=app.powerQueryWorkspace,p=e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}};return {back:p(w.backButton),separator:p(w.resizer)}})()`);
      const start=await run('performance.now()');
      for(const point of [points.back,points.separator])for(const type of ['mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
      const immediate=await state();await b.settle();await new Promise(r=>setTimeout(r,40));const settled=await state();
      focusRuns.push({start,points,immediate,settled,actual:await measure()});save('trusted-focus.json',{before,back,focusRuns});
      assert.equal(immediate.active,'pqw-resizer');assert.equal(settled.active,'pqw-resizer','Pending Back must not steal later trusted separator focus');
      const size=await run('app.powerQueryWorkspace.width');await b.key('ArrowLeft');await b.settle();assert.equal(await run('app.powerQueryWorkspace.width'),Math.min(650,size+20));
    }
    await shot('trusted-focus');
  });
  save('before-additional.json',await inspect());
 }finally{
  result.endedAt=new Date().toISOString();save('receipt.json',result);save('network.json',b.events.filter(e=>/Network.requestWillBeSent|Network.loadingFailed|Runtime.exceptionThrown/.test(e.method)));
  await b.close();console.log(JSON.stringify({out,passed:result.checks.length,failures:result.failures},null,2));if(result.failures.length)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
