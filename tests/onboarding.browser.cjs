/* Acceptance test: first-use guidance in the shipped viewer and VS Code adapter.
   Run: node --test tests/onboarding.browser.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { spawn, execFileSync } = require('node:child_process');
const sourceRoot = path.join(__dirname, '../Models/tools/viewer');
const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = candidates.find(file => fs.existsSync(file));
async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-onboarding-'));
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + output)), 15000);
    child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome exited during startup: ' + code + ' ' + output)); });
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  let id = 0; const waiting = new Map(); const downloads = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!data.id) {
    if (data.method === 'Browser.downloadWillBegin') downloads.set(data.params.guid, {...data.params,state:'inProgress'});
    if (data.method === 'Browser.downloadProgress') downloads.set(data.params.guid, {...downloads.get(data.params.guid),...data.params});
    return;
  } const promise = waiting.get(data.id); if (!promise) return; waiting.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; waiting.set(seq, {resolve,reject}); socket.send(JSON.stringify({id:seq,method,params})); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception)); return result.result.value; };
  return { send, evaluate, downloads, async close() {
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({id:++id,method:'Browser.close'}));
      else child.kill('SIGTERM');
    });
    socket.close();
    await fs.promises.rm(profile, {recursive:true,force:true,maxRetries:10,retryDelay:100});
  } };
}


async function waitFor(check, message) {
  for (let n=0;n<200;n++) { if(await check())return; await new Promise(resolve=>setTimeout(resolve,25)); }
  throw new Error(message);
}
test('onboarding journeys in a browser and the real VS Code adapter', {skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:120000}, async t => {
  const model = JSON.parse(fs.readFileSync(path.join(sourceRoot,'model-data.json'),'utf8'));
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    let name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    let body;
    if(name==='webview.html'||name==='empty-webview.html') {
      body=fs.readFileSync(path.join(sourceRoot,'index.html'),'utf8');
      // Real adapter and app; only the VS Code API transport is simulated.
      const bootstrap=`window.hostStorage=JSON.parse(sessionStorage.getItem('hostStorage')||'{}');
        window.acquireVsCodeApi=()=>({postMessage(m){
          if(m.type==='ready')setTimeout(()=>window.postMessage({type:'init',storage:hostStorage,models:[],open:${JSON.stringify(name==='empty-webview.html'?null:{modelId:'fixture',name:'Fixture',files:[{name:'model.json',text:JSON.stringify(model)}]})}},'*'),0);
          if(m.type==='storage'){hostStorage[m.key]=m.value;sessionStorage.setItem('hostStorage',JSON.stringify(hostStorage));}
        }});`;
      body=body.replace('<script src="./js/util.js', `<script>${bootstrap}</script><script src="./js/host-vscode.js"></script><script src="./js/util.js`);
    } else {try{body=fs.readFileSync(path.join(sourceRoot,name));}catch{res.writeHead(404);res.end();return;}}
    res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html'});res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await openBrowser();
  t.after(async()=>{try { await browser.close(); } finally { await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}); }});
  const base='http://127.0.0.1:'+server.address().port;
  const evaluate=browser.evaluate;
  const click=label=>evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  const guide=()=>evaluate("document.querySelector('.smv-guide h2')?.textContent||null");
  const load=async route=>{await browser.send('Page.navigate',{url:base+route});await waitFor(()=>evaluate('!!window.app?.onboarding'),'Onboarding did not initialize');};
  await browser.send('Page.enable');
  await load('/');
  assert.match(await evaluate("document.querySelector('#canvas-empty').innerText"),/Open your first model/);
  assert.equal(await guide(),null);
  await click('Try the demo');
  await waitFor(()=>evaluate("app.modelKey==='builtin'"),'Demo did not open');
  await waitFor(async()=>await guide()==='Welcome to Semantic Model Viewer','Missing welcome');
  assert.equal(await evaluate("document.querySelector('.smv-guide').contains(document.activeElement)"),false,'No automatic focus stealing');
  await click('Skip tour');
  await load('/'); assert.equal(await guide(),null,'Dismissal survives reload');
  await click('Help'); assert.equal(await guide(),'Welcome to Semantic Model Viewer');
  assert.equal(await evaluate('document.activeElement.id'),'smv-guide-title');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  assert.equal(await evaluate('document.activeElement.textContent'),'Show tips');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  assert.equal(await evaluate('document.activeElement.textContent'),'Skip tour');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  assert.equal(await guide(),null);assert.equal(await evaluate('document.activeElement.textContent'),'Help');
  await click('Help');await click('Show tips');assert.equal(await guide(),'Add a table');
  await click('Close');
  await evaluate("app.explorer.add(['Sales','Date']);app.focusTable('Sales')");
  await waitFor(async()=>await guide()==='Explore a relationship','Missing relationship tip');
  const before=await evaluate('JSON.stringify(app.captureTableView())');
  await click('Skip remaining tips');await click('Help');await click('Skip tour');
  assert.equal(await evaluate('JSON.stringify(app.captureTableView())'),before,'Help preserves membership, positions, focus, viewport');
  await click('Help');await click('Show tips');await click('Close');
  await evaluate("app.setViewMode('measures')");
  await waitFor(async()=>await guide()==='Follow a measure','Missing measure tip');
  await click('Close');
  await evaluate("document.querySelector('.ex-snapshot-export').focus()");assert.equal(await guide(),'Share an offline snapshot');
  await click('Close');
  // Missing/hidden targets, small viewport, and denied storage cannot trap the user.
  await browser.send('Emulation.setDeviceMetricsOverride',{width:360,height:480,deviceScaleFactor:1,mobile:false});
  await evaluate("Storage.prototype.setItem=function(){throw Error('denied')};app.onboarding.restart()");
  let rect=await evaluate("(()=>{let r=document.querySelector('.smv-guide').getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}})()");
  assert.ok(rect.left>=0&&rect.top>=0&&rect.right<=360&&rect.bottom<=480);
  await click('Skip tour');await evaluate('app.render(true)');assert.equal(await guide(),null);
  await evaluate("document.querySelector('.mv-search')?.remove();app.onboarding.restart()");await click('Show tips');
  assert.equal(await guide(),'Follow a measure');await click('Close');
  // Profile isolation and persistence through the shipped host-vscode adapter.
  await load('/empty-webview.html');
  assert.match(await evaluate("document.querySelector('#canvas-empty').innerText"),/Open a folder in VS Code/);
  assert.equal(await guide(),null);
  assert.equal(await evaluate("document.querySelector('#canvas-empty a').textContent"),'Try the demo in your browser');
  await load('/webview.html');
  assert.equal(await evaluate('app.host.kind'),'vscode');
  assert.equal(await guide(),'Welcome to Semantic Model Viewer','Browser dismissal must not suppress VS Code welcome');
  await click('Skip tour');await load('/webview.html');assert.equal(await guide(),null);
  assert.equal(await evaluate("JSON.parse(hostStorage.smv_onboarding_v1).enabled"),false);
  await click('Help');await click('Show tips');assert.equal(await guide(),'Add a table');
  await evaluate("app.snapshotMode=true;app.onboarding.update()");assert.equal(await guide(),null);await evaluate('app.onboarding.restart()');assert.equal(await guide(),null);
});
