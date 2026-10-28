'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const path=require('node:path');
try{
  const {extensionPath,request}=workerData;
  const engine=require(path.join(extensionPath,'engine/packages/engine/index.cjs'));
  const loaded=engine.loadRecords(request.records,{name:request.name,identity:request.identity});
  const {kind,input}=request;
  if(['inspect','relations','dependents'].includes(kind))parentPort.postMessage({value:engine[kind](loaded,input.table,input)});
  else{
    const plan=kind==='compare'?engine.compare(loaded,input):engine.plan(loaded,input);
    const prepared=plan.views.map(item=>{const rendered=engine.render(loaded,item.view);return {...item,prepared:{html:rendered.html,summary:rendered.summary,renderer:rendered.renderer}};});
    parentPort.postMessage({plan,prepared,sourceIdentity:loaded.sourceIdentity,sourceContentHash:loaded.sourceContentHash});
  }
}catch(error){parentPort.postMessage({error:error.message});}
