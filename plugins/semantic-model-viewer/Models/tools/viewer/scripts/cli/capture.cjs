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
// Chrome may publish its endpoint file without emitting the stderr banner.
function waitForEndpoint(child, profile, timeoutMs=30000) {
  return new Promise((resolve,reject)=>{
    let log='', finished=false, portError='';
    const finish=(error,endpoint)=>{
      if(finished)return;finished=true;clearTimeout(timer);clearInterval(poll);
      child.stderr.removeListener('data',onData);child.removeListener('error',onError);child.removeListener('exit',onExit);
      // Continue draining stderr while the browser is running.
      child.stderr.resume();error?reject(error):resolve(endpoint);
    };
    const onData=chunk=>{log=(log+chunk).slice(-16000);const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m)finish(null,m[1]);};
    const onError=error=>finish(error);
    const onExit=(code,signal)=>finish(new Error('Browser exited '+(signal||code)+': '+log));
    const readPort=()=>{
      try {
        const [port,endpoint]=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);
        if(/^\d+$/.test(port)&&Number(port)>0&&Number(port)<=65535&&/^\/devtools\/browser\/[^\s]+$/.test(endpoint))finish(null,'ws://127.0.0.1:'+port+endpoint);
      } catch(error) {
        if(['ENOENT','EBUSY','EACCES','EPERM'].includes(error.code))portError=error.code+': '+error.message;
        else finish(error);
      }
    };
    const timer=setTimeout(()=>finish(new Error('Browser startup timed out after '+timeoutMs+'ms. Diagnostics: '+(log||'(no stderr output)')+(portError?' Endpoint file: '+portError:''))),timeoutMs);
    const poll=setInterval(readPort,50);
    child.stderr.on('data',onData);child.once('error',onError);child.once('exit',onExit);
    readPort();
  });
}
async function stopBrowser(child) {
  if(!child || !child.pid)return;
  const running=()=>child.exitCode===null && child.signalCode===null;
  const wait=ms=>new Promise(resolve=>{
    if(!running())return resolve();
    const done=()=>{clearTimeout(timer);child.removeListener('exit',done);resolve();};
    const timer=setTimeout(done,ms);child.once('exit',done);
  });
  const signal=kind=>{
    try {
      // Each POSIX capture owns a process group, including launcher descendants.
      if(process.platform!=='win32')process.kill(-child.pid,kind);
      else if(running())child.kill(kind);
    } catch(error) {
      if(error.code==='ESRCH')return;
      // macOS may deny the group signal even while its owned launcher is live.
      // Fall back to that launcher; never broaden the target or suppress a
      // denied direct signal. An already-exited launcher needs no fallback.
      if(error.code==='EPERM'){
        if(running())try {process.kill(child.pid,kind);}catch(direct){if(direct.code!=='ESRCH')throw direct;}
        return;
      }
      throw error;
    }
  };
  await wait(2000); // Browser.close normally shuts down cleanly.
  signal('SIGTERM');
  await wait(1000);
  // A launcher can exit before its browser descendants; signal the group as well.
  signal('SIGKILL');
  await wait(1000);
}
async function capture(html, output, view, options={}) {
  const executable=browserPath(options.browser);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv-capture-'));
  const input=path.join(temp,'view.html');fs.writeFileSync(input,html);
  let child, socket; const pending=new Map();let sequence=0;
  try {
    child=spawn(executable,['--headless=new','--disable-gpu','--disable-lcd-text','--force-color-profile=srgb','--run-all-compositor-stages-before-draw','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--hide-scrollbars','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{stdio:['ignore','ignore','pipe'],detached:process.platform!=='win32'});
    const endpoint=await waitForEndpoint(child,path.join(temp,'profile'));
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
    if(socket && socket.readyState===WebSocket.OPEN){
      try {socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));} catch(_) {}
    }
    await stopBrowser(child);
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('Capture closed'));}pending.clear();
    if(socket)socket.close();
    await fs.promises.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
module.exports={capture,browserPath,waitForEndpoint,stopBrowser};
