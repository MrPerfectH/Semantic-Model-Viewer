'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {open}=require('./pq-redesign-independent-runtime-transport.cjs');
const O=require('./pq-redesign-independent-oracles.cjs'),F=require('./pq-redesign-independent-filters-v2.oracle.cjs');
const repo=path.resolve(__dirname,'..'),base=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const candidate='0d964fc97273cca8626e3cc4e9b39f73620b7e24';
const mapped=path.join(repo,'docs/verification/pq-redesign/flow-0d964fc'),mapping=JSON.parse(fs.readFileSync(path.join(mapped,'runtime-mapping.json')));for(const a of mapping.assets)assert.deepEqual(fs.readFileSync(path.join(mapped,'served',a.runtimePath)),execFileSync('git',['show',candidate+':Models/tools/viewer/'+a.runtimePath]));
const out=path.join(mapped,process.env.PQ_RUN||'zoom-cache-replay');fs.mkdirSync(out,{recursive:true});
const original=JSON.parse(fs.readFileSync(path.join(base,'oracle.json'))).cases;
const result={candidate,startedAt:new Date().toISOString(),boundary:'explicitly authorized narrow capability fallback while T3 available; fresh isolated Chrome; not native VS Code',cases:[],checks:[],failures:[]};
const e=n=>JSON.stringify(['expression','',n]);
(async()=>{const b=await open();const run=b.evaluate;const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
 async function shot(name){fs.writeFileSync(path.join(out,name+'.png'),Buffer.from((await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));}
 async function check(name,fn){try{await fn();result.checks.push({name,status:'pass'});}catch(error){result.failures.push({name,error:error.stack});await shot('failure-'+result.failures.length);save('failure-'+result.failures.length+'.json',await inspect());}save('receipt.json',result);}
 const inspect=()=>run(`(()=>{let w=app.powerQueryWorkspace;return {phase:w.phase,message:w.message.textContent,category:w.category,query:w.query,selectedId:w.selectedId,inspectorOpen:w.inspectorOpen,count:w.count.textContent,banner:w.banner.textContent,code:[...document.querySelectorAll('.pqi-source-line')].map(e=>e.textContent).join(''),viewport:w.canvas.getViewport(),inspectorView:w.inspector.captureViewState(),history:w.history,domNodes:document.querySelectorAll('.pqc-node').length,visible:[...document.querySelectorAll('.pqc-node')].filter(n=>!n.hidden).map(n=>n.dataset.nodeId),library:[...w.list.querySelectorAll('button')].map(n=>n.textContent),map:document.querySelector('.pqc-map-label')?.textContent,graph:w.context?.graph,sets:w.sets?Object.fromEntries(Object.entries(w.sets).map(([k,v])=>[k,[...v]])):null}})()`);
 const button=text=>`[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(text)} && n.getBoundingClientRect().width>0)`;
 async function importCase(name){
  const file=path.join(base,F.spec.cases[name]?.fixture||name,'model.bim');
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
  await b.send('Page.enable');await b.send('Network.enable');await b.send('Runtime.enable');

  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});`});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__workers=[];const W=window.Worker;window.Worker=class extends W{constructor(...a){super(...a);const row={created:performance.now(),messages:[],terminated:false};__workers.push(row);this.addEventListener('message',e=>row.messages.push({time:performance.now(),data:e.data}));this.__receipt=row;}terminate(){this.__receipt.terminated=true;super.terminate();}};`});
  await b.send('Page.navigate',{url:'http://127.0.0.1:54093/'});await b.until("!!window.app && app.state.modelName==='Choose a model' && app.state.showModelMenu",'registered empty boot and initial picker');await run('document.fonts.ready');await b.settle();result.browser=await b.send('Browser.getVersion');
  const nativeWindow=await b.send('Browser.getWindowForTarget');
  let settingIndex=0;async function settingsZoom(value){
    await b.send('Page.navigate',{url:'chrome://settings/appearance'});await b.until(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return true;if(n.shadowRoot&&find(n.shadowRoot))return true}}return !!find(document)})()`,'actual zoom setting');
    await run(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return n;if(n.shadowRoot){const x=find(n.shadowRoot);if(x)return x}}}const z=find(document);z.value=${JSON.stringify(String(value))};z.dispatchEvent(new Event('change',{bubbles:true}));return z.value})()`);
    const persisted=await run(`(()=>{function find(r){for(const n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return n;if(n.shadowRoot){const x=find(n.shadowRoot);if(x)return x}}}const z=find(document);return {value:z.value,selected:z.options[z.selectedIndex].textContent}})()`);assert.equal(persisted.value,String(value));save('actual-browser-setting-'+(++settingIndex)+'.json',persisted);
    await b.send('Page.navigate',{url:'http://127.0.0.1:54093/'});await b.until(`location.origin==='http://127.0.0.1:54093' && !!window.app && !!app.state.modelName`,'app after settings');await run('document.fonts.ready');await b.settle();
    await run(`window.__pointer=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>__pointer.push({type,target:{tag:e.target.tagName,cls:e.target.className,id:e.target.id},clientX:e.clientX,clientY:e.clientY,pageX:e.pageX,pageY:e.pageY,screenX:e.screenX,screenY:e.screenY,isTrusted:e.isTrusted,buttons:e.buttons,pointerId:e.pointerId,time:performance.now()}),true)`);
  }
  const measure=()=>run(`(()=>{const w=app.powerQueryWorkspace,rect=n=>n.getBoundingClientRect().toJSON(),r=rect(w.resizer),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),vv=visualViewport;return {innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,below:w.below,width:w.width,height:w.height,inspectorOpen:w.inspectorOpen,selectedId:w.selectedId,inspector:rect(w.inspectorHost),separator:r,surface:rect(document.querySelector('.pqc-surface')),aria:{orientation:w.resizer.getAttribute('aria-orientation'),value:w.resizer.getAttribute('aria-valuenow')},hit:{tag:hit?.tagName,cls:hit?.className,html:hit?.outerHTML.slice(0,400)},visualViewport:{offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop,pageLeft:vv.pageLeft,pageTop:vv.pageTop,width:vv.width,height:vv.height,scale:vv.scale},scroll:{windowX:scrollX,windowY:scrollY,documentX:document.documentElement.scrollLeft,documentY:document.documentElement.scrollTop,bodyX:document.body.scrollLeft,bodyY:document.body.scrollTop,pqBodyX:w.body.scrollLeft,pqBodyY:w.body.scrollTop,inspectorHostY:w.inspectorHost.scrollTop,inspectorRootY:document.querySelector('.pqi')?.scrollTop},active:{tag:document.activeElement.tagName,cls:document.activeElement.className},pointer:__pointer.slice()}})()`);
  for(const width of (process.env.PQ_ZOOM_WIDTH?[Number(process.env.PQ_ZOOM_WIDTH)]:[1280,1440])){
    await settingsZoom(1);await b.send('Browser.setWindowBounds',{windowId:nativeWindow.windowId,bounds:{width,height:1087}});await b.settle();
    for(const [i,zoom] of [2,1,2].entries())await check('Actual resize transition '+width+' step'+i+' zoom'+zoom,async()=>{
      await settingsZoom(zoom);
      if(zoom===1){
        await b.until('app.state.loaded','cached model loaded');
        const cache=await run('({menu:app.state.showModelMenu,tables:app.model.tables.length})');assert.ok(cache.tables>0,'current long-M fixture contains a table');assert.equal(cache.menu,false,'table-bearing cache does not open empty-model picker');
        await b.click("[...document.querySelectorAll('nav button')].find(n=>n.textContent==='Power Query')");await b.until("app.powerQueryWorkspace.phase==='ready'",'cached PQ');save('cached-model-'+width+'.json',cache);
      }else await importCase('flow-0d964fc');
      await select('FinalOutput');await b.settle();
      await b.click(button('Hide unrelated'));await b.click("document.querySelector('button[aria-label=\"Inspect input Merged Query\"]')");await b.settle();
      let flow=await run('({root:app.powerQueryWorkspace.flowRootId,selected:app.powerQueryWorkspace.selectedId,status:app.powerQueryWorkspace.flowStatus.textContent,buttons:[...document.querySelectorAll(\".pqw-flow button\")].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()}))})');assert.equal(flow.root,e('FinalOutput'));assert.equal(flow.selected,e('Merged Query'));for(const c of flow.buttons)assert.ok(c.rect.width>0&&c.rect.height>0&&c.rect.x>=0&&c.rect.right<=width/zoom+1,'flow control reachable width');
      await b.click(button('Trace this query'));assert.equal(await run('app.powerQueryWorkspace.flowRootId'),e('Merged Query'));await b.click(button('Back'));assert.equal(await run('app.powerQueryWorkspace.flowRootId'),e('FinalOutput'));await b.click(button('Inspect target'));assert.equal(await run('app.powerQueryWorkspace.selectedId'),e('FinalOutput'));save('flow-'+width+'-'+i+'-'+zoom+'.json',flow);
      const initial=await measure();assert.equal(initial.innerWidth,width/zoom);assert.equal(initial.dpr,zoom);assert.equal(initial.visualViewport.scale,1);
      await run('app.powerQueryWorkspace.resizer.scrollIntoView({block:"center"});app.powerQueryWorkspace.resizer.focus()');await b.settle();
      const before=await measure(),key=before.below?'ArrowUp':'ArrowLeft',steps=before.below?2:1;for(let n=0;n<steps;n++)await b.key(key);await b.settle();
      const keyboard=await measure(),dimension=before.below?'height':'width';assert.equal(keyboard.inspector[dimension],before.inspector[dimension]+20*steps);assert.equal(Number(keyboard.aria.value),keyboard.inspector[dimension]);
      await run('app.powerQueryWorkspace.resizer.scrollIntoView({block:"center"})');await b.settle();const prePointer=await measure();
      const x=prePointer.separator.x+prePointer.separator.width/2,y=prePointer.separator.y+prePointer.separator.height/2,dx=prePointer.below?0:-40,dy=prePointer.below?-40:0;
      await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y:y+dy,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',clickCount:1});await b.settle();
      const pointer=await measure();save('transition-'+width+'-'+i+'-'+zoom+'.json',{initial,before,keyboard,prePointer,sent:{x,y,dx,dy},pointer});await shot('transition-'+width+'-'+i+'-'+zoom);
      const down=pointer.pointer.filter(x=>x.type==='pointerdown').at(-1);assert.equal(down.target.cls,'pqw-resizer','Actual trusted pointerdown must hit separator');assert.equal(down.isTrusted,true);assert.equal(down.clientX,x);assert.equal(down.clientY,y);
      assert.equal(pointer.inspectorOpen,true);assert.equal(pointer.selectedId,e('FinalOutput'));assert.equal(pointer.inspector[dimension],prePointer.inspector[dimension]+40);assert.equal(Number(pointer.aria.value),pointer.inspector[dimension]);
      // Narrow fresh expanded-reader reachability at actual browser zoom.
      await run('window.__sameCode=document.querySelector(".pqi-code-scroll");window.__expected=app.powerQueryWorkspace.context.byNodeId.get(app.powerQueryWorkspace.selectedId).code');
      await b.click(button('Open full query'));await b.settle();
      const reader=await run(`(()=>{const d=document.querySelector('.pqi-reader[open]'),r=d.getBoundingClientRect();return {same:document.querySelector('.pqi-reader .pqi-code-scroll')===__sameCode,code:[...d.querySelectorAll('.pqi-source-line')].map(n=>n.textContent).join(''),expected:__expected,rect:r.toJSON(),innerWidth,innerHeight,wrap:app.powerQueryWorkspace.inspector.captureViewState().wrap,focus:app.powerQueryWorkspace.inspector.captureViewState().focus}})()`);
      assert.equal(reader.same,true);assert.equal(reader.code,reader.expected);assert.equal(reader.code,fs.readFileSync(path.join(base,'flow-0d964fc/exact-source.m'),'utf8'));assert.equal(reader.rect.width,reader.innerWidth-32);assert.equal(reader.wrap,true);assert.ok(reader.rect.x>=0&&reader.rect.y>=0&&reader.rect.right<=reader.innerWidth+1&&reader.rect.bottom<=reader.innerHeight+1);assert.equal(reader.focus.kind,'reader-close');assert.equal(await run('getComputedStyle(document.querySelector(".pqi-reader .pqi-code-scroll")).fontSize'),'14px');await shot('expanded-reader-'+width+'-'+i+'-'+zoom);
      await b.key('Escape');await b.settle();const closed=await run('({expanded:app.powerQueryWorkspace.inspector.captureViewState().expanded,focus:app.powerQueryWorkspace.inspector.captureViewState().focus,open:app.powerQueryWorkspace.inspectorOpen})');assert.equal(closed.expanded,false);assert.equal(closed.open,true);assert.equal(closed.focus.kind,'expand');
      save('reader-'+width+'-'+i+'-'+zoom+'.json',{reader,closed});await shot('reader-closed-'+width+'-'+i+'-'+zoom);
    });
  }
  save('before-additional.json',await inspect());
 }finally{
  result.endedAt=new Date().toISOString();save('receipt.json',result);save('network.json',b.events.filter(e=>/Network.requestWillBeSent|Network.loadingFailed|Runtime.exceptionThrown/.test(e.method)));
  await b.close();console.log(JSON.stringify({out,passed:result.checks.length,failures:result.failures},null,2));if(result.failures.length)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
