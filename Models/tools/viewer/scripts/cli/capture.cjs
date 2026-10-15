'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function browserPath(explicit) {
  const configured=explicit||process.env.SMV_BROWSER||process.env.CHROME_PATH;
  if(configured&&!fs.existsSync(configured))throw new Error('Configured browser does not exist: '+configured);
  const names = [explicit, process.env.SMV_BROWSER, process.env.CHROME_PATH,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe')];
  const result=names.find(p=>p && fs.existsSync(p));
  if (!result) throw new Error('Image capture needs Chrome or Chromium. Install a browser and set SMV_BROWSER to its executable path. Snapshot export needs no browser.');
  return result;
}
async function capture(html, output, view, options={}) {
  const executable=browserPath(options.browser);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv-capture-'));
  const input=path.join(temp,'view.html');fs.writeFileSync(input,html);
  let child, socket; const pending=new Map();let sequence=0;
  try {
    child=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--hide-scrollbars','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{stdio:['ignore','ignore','pipe']});
    const endpoint=await new Promise((resolve,reject)=>{
      let log='';const timer=setTimeout(()=>reject(new Error('Browser startup timed out')),15000);
      child.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('Browser exited '+code+': '+log.slice(-2000)));});
    });
    const targets=await (await fetch('http://127.0.0.1:'+new URL(endpoint).port+'/json/list',{signal:AbortSignal.timeout(10000)})).json();
    const target=targets.find(t=>t.type==='page');if(!target)throw new Error('Browser has no page target');
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser connection timed out')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Browser connection failed'));},{once:true});});
    socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);});
    socket.addEventListener('close',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('Browser disconnected'));}pending.clear();});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Browser command timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;};
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:view.width,height:view.height,deviceScaleFactor:view.scale,mobile:false});
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'light'}]});
    await send('Page.navigate',{url:pathToFileURL(input).href});
    const deadline=Date.now()+20000;
    while(!await evaluate('!!window.smv')){if(Date.now()>deadline)throw new Error('Explanation initialization timed out');await new Promise(r=>setTimeout(r,25));}
    const ready=await evaluate('window.smv.ready()');
    const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{...ready.clip,scale:1}});
    fs.writeFileSync(output,Buffer.from(image.data,'base64'),{flag:options.force?'w':'wx'});
    const version=await send('Browser.getVersion');
    return {path:path.resolve(output),browser:version.product,viewport:{width:view.width,height:view.height,scale:view.scale},objects:ready.objects};
  } catch(error) {error.code=error.code||'CAPTURE_FAILED';throw error;} finally {
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('Capture closed'));}pending.clear();
    if(socket)socket.close();
    if(child && child.pid && child.exitCode===null && child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timer);}
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
module.exports={capture,browserPath};
