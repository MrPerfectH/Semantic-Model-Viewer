'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
function compute(extensionPath,request,token){
  return new Promise((resolve,reject)=>{
    if(token&&token.isCancellationRequested)return reject(new Error('Cancelled'));
    const worker=new Worker(path.join(__dirname,'engine-worker.cjs'),{workerData:{extensionPath,request}});
    let settled=false,cancellation;
    const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(cancellation)cancellation.dispose();worker.terminate();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>finish(new Error('Model diagram preparation timed out. Try a smaller focused model.')),60000);
    worker.once('message',result=>finish(result.error?new Error(result.error):null,result));
    worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(new Error('Model worker exited before returning a result ('+code+')'));});
    if(token&&token.onCancellationRequested)cancellation=token.onCancellationRequested(()=>finish(new Error('Cancelled')));
  });
}
module.exports={compute};
