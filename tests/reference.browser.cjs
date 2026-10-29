/* Acceptance test: reference navigation, metadata, and offline export in the
   actual HTML file in Chrome with networking and browser storage unavailable.
   Run: node --test tests/snapshot.browser.cjs */
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-snapshot-'));
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
function payloadAt(file) {
  return JSON.parse(fs.readFileSync(file,'utf8').match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
test('reference library navigates real objects, tabs and visual views, then re-exports offline', {skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:90000}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-reference-'));
 const modelTools=require('../Models/tools/viewer/scripts/cli/model.cjs');
 const c=modelTools.runtime();const {model,app}=modelTools.readModel(c,path.join(__dirname,'../Models/demo/Contoso Retail.SemanticModel'));
 const sales=model.tables.find(x=>x.name==='Sales');sales.description='Sales transactions at order-line level.';
 const file=path.join(dir,'reference.html');fs.writeFileSync(file,modelTools.snapshot(c,app,{tables:['Sales'],measure:null}));
 const b=await openBrowser();t.after(async()=>{await b.close();fs.rmSync(dir,{recursive:true,force:true});});
 await b.send('Page.enable');await b.send('Runtime.enable');await b.send('Network.enable');await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
 await b.send('Page.navigate',{url:pathToFileURL(file).href});
 await waitFor(()=>b.evaluate('!!window.app&&app.state.loaded'),'Offline model did not load');
 const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await b.evaluate("Array.from(document.querySelectorAll('.ex-main-nav button')).find(b=>b.textContent==='Reference').click()");await settle();
 assert.equal(await b.evaluate('document.querySelector("#reference").hidden'),false);
 await b.evaluate(`const input=document.querySelector('.ref-library input[type=search]');input.value='Sales';input.dispatchEvent(new Event('input'));Array.from(document.querySelectorAll('.ref-result')).find(b=>b.querySelector('strong').textContent==='Sales').click()`);
 assert.equal(await b.evaluate('document.querySelector(".ref-page h1").textContent'),'Sales');
 assert.match(await b.evaluate('document.querySelector(".ref-page").textContent'),/Sales transactions at order-line level/);
 // Real object navigation, not visual-only tabs.
 await b.evaluate("document.querySelector('#ref-tab-columns').click()");
 const column=await b.evaluate("document.querySelector('#ref-content .ref-link').textContent");
 await b.evaluate("document.querySelector('#ref-content .ref-link').click()");
 assert.equal(await b.evaluate('document.querySelector(".ref-page h1").textContent'),column);
 await b.evaluate("document.querySelector('.ref-breadcrumb button').click()");assert.equal(await b.evaluate('app.reference.state.tab'),'columns');
 await b.evaluate("document.querySelector('#ref-tab-queries').click();document.querySelector('#ref-content .ref-link').click()");
 assert.ok((await b.evaluate("document.querySelector('#ref-content pre').textContent")).length>0);
 await b.evaluate("document.querySelector('.ref-breadcrumb button').click();document.querySelector('#ref-tab-measures').click();document.querySelector('#ref-content .ref-link').click()");
 assert.equal(await b.evaluate('app.reference.data.byId.get(app.reference.state.selected).kind'),'measure');
 await b.evaluate("document.querySelector('.ref-actions .ex-primary').click()");await settle();assert.equal(await b.evaluate('app.state.viewMode'),'measures');
 assert.ok(await b.evaluate('!!app.state.selMeasure'));
 await b.evaluate("app.setViewMode('reference');app.reference.open(app.reference.tableKey('Sales'))");await settle();
 assert.equal(await b.evaluate("document.querySelector('#reference').scrollWidth>document.querySelector('#reference').clientWidth"),false);
 if(process.env.SMV_REFERENCE_SCREENSHOT){const shot=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.SMV_REFERENCE_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 // Export using the actual runtime packaging; no web server or external assets.
 const html=await b.evaluate(`(async()=>{const assets=await Snapshots.loadAssets(document);return Snapshots.buildHTML(assets.template,assets.sources,Snapshots.capture(app));})()`);
 const reexport=path.join(dir,'reexport.html');fs.writeFileSync(reexport,html);if(process.env.SMV_REFERENCE_HTML)fs.writeFileSync(process.env.SMV_REFERENCE_HTML,html);
 const payload=payloadAt(reexport);assert.equal(payload.workspace.viewMode,'reference');assert.equal(payload.workspace.reference.selected,JSON.stringify(['table','','Sales']));
 await b.send('Page.navigate',{url:pathToFileURL(reexport).href});await waitFor(()=>b.evaluate('!!window.app&&app.state.loaded&&app.state.viewMode==="reference"'),'Reference did not restore');await settle();
 assert.equal(await b.evaluate('document.querySelector(".ref-page h1").textContent'),'Sales');
 await b.send('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false});await settle();
 assert.equal(await b.evaluate("document.querySelector('#reference').scrollWidth>document.querySelector('#reference').clientWidth"),false);
 // Calculation groups retain their own reference page and item expressions.
 await b.evaluate(`const group=app.reference.data.objects.find(o=>o.kind==='calculationGroup');if(group)app.reference.open(group.id)`);
 assert.equal(await b.evaluate('app.reference.data.byId.get(app.reference.state.selected).kind'),'calculationGroup');
 await b.evaluate(`document.querySelector('#ref-tab-items').click();document.querySelector('#ref-content .ref-link').click()`);
 assert.equal(await b.evaluate('app.reference.data.byId.get(app.reference.state.selected).kind'),'calculationItem');
 assert.match(await b.evaluate('document.querySelector(".ref-page").textContent'),/SELECTEDMEASURE/);
 // The same runtime must load another model without leaking navigation state.
 await b.evaluate(`app._applyModel(Snapshots.modelData(app.model),'Reloaded','reference-test',{persist:false})`);await settle();
 assert.equal(await b.evaluate('app.reference.state.selected'),null);
 await b.evaluate(`app.setViewMode('reference');app.reference.open(app.reference.tableKey('Sales'))`);await settle();
 // Hostile metadata must remain text, never HTML.
 await b.evaluate(`app.model.tables[0].description='<img src=x onerror="window.refInjection=true">';app.reference.open(app.reference.tableKey(app.model.tables[0].name))`);
 assert.equal(await b.evaluate('!!window.refInjection||!!document.querySelector(".ref-description img")'),false);
});
