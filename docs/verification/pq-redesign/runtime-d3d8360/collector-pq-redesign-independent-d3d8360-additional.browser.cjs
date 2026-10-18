'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {open}=require('./pq-redesign-independent-runtime-transport.cjs');
const O=require('./pq-redesign-independent-oracles.cjs'),F=require('./pq-redesign-independent-filters-v2.oracle.cjs');
const repo=path.resolve(__dirname,'..'),base=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const candidate='d3d8360e4ee6e003d187f34118099e4327dd91cd';
assert.equal(execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim(),execFileSync('git',['rev-parse',candidate+'^{tree}'],{cwd:repo,encoding:'utf8'}).trim());
const out=path.join(repo,'docs/verification/pq-redesign/runtime-d3d8360',process.env.PQ_RUN||'browser-additional');fs.mkdirSync(out,{recursive:true});
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
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__workers=[];const W=window.Worker;window.Worker=class extends W{constructor(...a){super(...a);const row={created:performance.now(),messages:[],terminated:false};__workers.push(row);this.addEventListener('message',e=>row.messages.push({time:performance.now(),data:e.data}));this.__receipt=row;}terminate(){this.__receipt.terminated=true;super.terminate();}};`});
  await b.send('Page.navigate',{url:'http://127.0.0.1:60017/'});await b.until("!!window.app && app.state.modelName==='Choose a model' && app.state.showModelMenu",'registered empty boot and initial picker');await run('document.fonts.ready');await b.settle();result.browser=await b.send('Browser.getVersion');
  await require('./pq-redesign-independent-runtime-scenarios.cjs')({b,run,save,shot,check,inspect,button,importCase,filter,search,select,result,out,base,original,F,e});
  save('before-additional.json',await inspect());
 }finally{
  result.endedAt=new Date().toISOString();save('receipt.json',result);save('network.json',b.events.filter(e=>/Network.requestWillBeSent|Network.loadingFailed|Runtime.exceptionThrown/.test(e.method)));
  await b.close();console.log(JSON.stringify({out,passed:result.checks.length,failures:result.failures},null,2));if(result.failures.length)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
