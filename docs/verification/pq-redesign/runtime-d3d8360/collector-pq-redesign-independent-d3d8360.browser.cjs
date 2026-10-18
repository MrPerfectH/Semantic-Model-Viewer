'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {open}=require('./pq-redesign-independent-runtime-transport.cjs');
const O=require('./pq-redesign-independent-oracles.cjs'),F=require('./pq-redesign-independent-filters-v2.oracle.cjs');
const repo=path.resolve(__dirname,'..'),base=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const candidate='d3d8360e4ee6e003d187f34118099e4327dd91cd';
assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim(),execFileSync('git',['rev-parse',candidate+'^{tree}'],{cwd:repo,encoding:'utf8'}).trim());
const out=path.join(repo,'docs/verification/pq-redesign/runtime-d3d8360',process.env.PQ_RUN||'browser-first');fs.mkdirSync(out,{recursive:true});
const original=JSON.parse(fs.readFileSync(path.join(base,'oracle.json'))).cases;
const result={candidate,startedAt:new Date().toISOString(),boundary:'fresh authorized CDP Chrome registered app, not installed/native',cases:[],checks:[],failures:[]};
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
 async function select(label){await b.click(`[...document.querySelectorAll('.pqw-library-row')].find(n=>n.textContent.startsWith(${JSON.stringify(label+' ·')}))`);await b.settle();}
 try{
  await b.send('Page.enable');await b.send('Network.enable');await b.send('Runtime.enable');
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__long=[];new PerformanceObserver(l=>__long.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true});`});
  await b.send('Page.navigate',{url:'http://127.0.0.1:60017/'});await b.until("!!window.app && app.state.modelName==='Choose a model' && app.state.showModelMenu",'registered empty boot and initial picker');await run('document.fonts.ready');await b.settle();result.browser=await b.send('Browser.getVersion');
  for(const name of (process.env.PQ_CASES?process.env.PQ_CASES.split(','):Object.keys(F.spec.cases)).filter(Boolean)) await check('inventory/category '+name,async()=>{
    const entryMs=await importCase(name),c=F.spec.cases[name];let state=await inspect();
    if(original[name])O.graphOracle(state.graph,original[name]);
    assert.deepEqual(state.sets.all.slice().sort(),c.all.slice().sort());assert.equal(state.inspectorOpen,false);assert.equal(state.category,'all');
    const states={};
    for(const category of ['all','connected','disconnected']){await filter(category);state=await inspect();states[category]=state;
      assert.deepEqual(state.sets[category].slice().sort(),c[category].slice().sort());assert.deepEqual(state.visible.slice().sort(),c[category].slice().sort());
      assert.equal(state.domNodes,c.all.length);assert.equal(state.library.length,c[category].length);
      assert.equal(state.map,c[category].length+' visible / '+c.all.length+' objects');
      const map=await run(`({total:document.querySelectorAll('.pqc-map-node').length,muted:document.querySelectorAll('.pqc-map-hidden').length,selectable:document.querySelectorAll('[data-map-id]').length,edges:[...document.querySelectorAll('.pqc-edge')].filter(n=>n.style.display!=='none').length})`);
      assert.equal(map.total,c.all.length);assert.equal(map.muted,c.all.length-c[category].length);assert.equal(map.selectable,c[category].length);assert.equal(map.edges,category==='disconnected'?0:F.edgesFor(name).length);
      if(!c[category].length)assert.ok(state.count.includes('0 library results'));
      if(category==='disconnected')assert.ok(state.banner.includes('does not prove independence'));
    }
    await filter('all');let last=c.all.at(-1),lastLabel=c.labels[last];const start=performance.now();await search(lastLabel);const searchMs=performance.now()-start;
    await b.click(`[...document.querySelectorAll('.pqw-library-row')].find(n=>n.textContent.startsWith(${JSON.stringify(lastLabel+' ·')}))`);await b.settle();
    const target=await run(`(()=>{const n=[...document.querySelectorAll('.pqc-node')].find(n=>n.dataset.nodeId===${JSON.stringify(last)});const r=n?.getBoundingClientRect(),c=document.querySelector('.pqc-surface').getBoundingClientRect();return {id:app.powerQueryWorkspace.selectedId,rect:r?.toJSON(),canvas:c.toJSON(),view:app.powerQueryWorkspace.canvas.getViewport()};})()`);
    // Duplicate labels are deliberately inspected separately under A7, not silently resolved by first match.
    if(name!=='a7-uncertainty')assert.equal(target.id,last);
    save(name+'.json',{entryMs,searchMs,states,target,longTasks:await run('__long')});result.cases.push({name,entryMs,searchMs});
    if(['a1-disconnected','a6-disconnected-1000','a6-fanout-250','a7-uncertainty'].includes(name)){await search('');await b.click(button('Fit'));await b.settle();await shot(name);}
  });
  await check('A3 frozen hidden-selection/reference/Back/reset workflow',async()=>{
    await importCase('a3-results');await select('MergeResult');await search('Q1');await filter('connected');
    assert.equal((await inspect()).visible.length,5);assert.equal((await inspect()).library.length,1);
    await filter('disconnected');const hidden=await inspect();save('hidden-selected.json',hidden);await shot('hidden-selected');
    assert.equal(hidden.selectedId,e('MergeResult'));assert.ok(hidden.inspectorOpen);assert.equal(hidden.library.length,0);assert.ok(hidden.banner.includes('hidden by filter'));
    assert.deepEqual(await run(`(()=>{let w=app.powerQueryWorkspace;return [w.canvas.reveal(w.selectedId,{readable:true}),w.canvas.focusNode(w.selectedId)]})()`),[false,false]);
    // Navigate exact real M button while its consumer is hidden; capture filter + source scroll/focus before click.
    await run(`app.powerQueryWorkspace.canvas.setViewport({x:123,y:87,k:1.3});document.querySelector('.pqi-reference').focus();window.__before=app.powerQueryWorkspace.captureNavigation()`);
    await b.key('Enter');await b.settle();const nav=await inspect();assert.equal(nav.selectedId,e('Q1'));assert.equal(nav.category,'all');assert.equal(nav.query,'');assert.ok(nav.message.includes('Filters cleared'));
    await b.click(button('Back'));await b.settle();await b.settle();const back=await inspect(),prior=await run('__before');save('reference-back.json',{prior,nav,back});
    assert.equal(back.category,prior.category);assert.equal(back.query,prior.query);assert.equal(back.selectedId,prior.selectedId);assert.deepEqual(back.viewport,prior.viewport);assert.deepEqual(back.inspectorView,prior.inspectorView);
    await b.click(button('Show all'));await b.settle();const shown=await inspect();assert.equal(shown.category,'all');assert.equal(shown.query,'');assert.equal(shown.selectedId,prior.selectedId);
    await filter('disconnected');await search('x');const beforeReset=await inspect();await b.click(button('Reset filters'));await b.settle();const reset=await inspect();
    assert.equal(reset.category,'all');assert.equal(reset.query,'');assert.equal(reset.code,beforeReset.code);assert.equal(reset.selectedId,beforeReset.selectedId);assert.deepEqual(reset.viewport,beforeReset.viewport);
    await shot('merge-inspector');
  });
  await check('A4 exact source, all five occurrence links, trusted Enter and Back',async()=>{
    await importCase('a4-occurrences');await select('OccurrenceProbe');const exact=fs.readFileSync(path.join(base,'exact-source.m'),'utf8'),expected=original['a4-occurrences'].occurrences[e('OccurrenceProbe')];
    assert.equal((await inspect()).code,exact);
    assert.deepEqual(await run(`[...document.querySelectorAll('.pqi-reference')].map(n=>n.textContent)`),expected.map(r=>r.text));
    const traversals=[];
    for(let i=0;i<expected.length;i++){
      await run(`(()=>{const s=document.querySelector('.pqi-code-scroll');s.scrollLeft=45;s.scrollTop=60;const ref=document.querySelectorAll('.pqi-reference')[${i}];ref.focus({preventScroll:true});app.powerQueryWorkspace.canvas.setViewport({x:123,y:87,k:1.3});})()`);
      const before=await run('app.powerQueryWorkspace.captureNavigation()');await b.key('Enter');await b.settle();assert.equal((await inspect()).selectedId,expected[i].id);
      await b.click(button('Back'));await b.settle();await b.settle();const after=await run('app.powerQueryWorkspace.captureNavigation()');traversals.push({i,before,after});assert.deepEqual(after,before);
    }
    save('occurrence-traversals.json',traversals);await shot('exact-occurrences');
    await b.send('Browser.grantPermissions',{origin:'http://127.0.0.1:60017',permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    await b.send('Page.bringToFront');await b.click(button('Copy M'));await b.until("document.querySelector('.pqi-copy-status').textContent==='Copied exact M'",'copy');
    const copied=await run('navigator.clipboard.readText()');assert.equal(copied,exact);save('clipboard.json',{exact:true,length:copied.length});
  });
  save('before-additional.json',await inspect());
 }finally{
  result.endedAt=new Date().toISOString();save('receipt.json',result);save('network.json',b.events.filter(e=>/Network.requestWillBeSent|Network.loadingFailed|Runtime.exceptionThrown/.test(e.method)));
  await b.close();console.log(JSON.stringify({out,passed:result.checks.length,failures:result.failures},null,2));if(result.failures.length)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
