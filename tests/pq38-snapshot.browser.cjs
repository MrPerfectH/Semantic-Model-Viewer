/* Helper adapted from existing snapshot browser test; exact exported-file acceptance: use the real download button, stop the server, and open the
   actual HTML file in Chrome with networking and browser storage unavailable.
   Run: node --test tests/snapshot.browser.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
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
  return { send, evaluate, downloads, async close() { socket.close(); child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); fs.rmSync(profile, {recursive:true,force:true}); } };
}


async function waitFor(check, message) {
  for (let n=0;n<200;n++) { if(await check())return; await new Promise(resolve=>setTimeout(resolve,25)); }
  throw new Error(message);
}
function payloadAt(file) {
  return JSON.parse(fs.readFileSync(file,'utf8').match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
test('actual PQ38 exports open and re-export offline without raw M or source access', {skip:!chrome&&'Chrome unavailable',timeout:60000},async t=>{
  const inputs=[process.env.PQ38_SNAPSHOT_PATH,process.env.PQ38_NATIVE_SNAPSHOT_PATH].filter(Boolean);
  assert.ok(inputs.length,'Supply actual exported HTML paths; never generate a substitute snapshot here');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pq38-offline-'));
  const b=await openBrowser();t.after(async()=>{await b.close();fs.rmSync(dir,{recursive:true,force:true});});
  await b.send('Page.enable');await b.send('Network.enable');
  await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await b.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:dir,eventsEnabled:true});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.pq38Access={network:0,storage:0,errors:[]};window.fetch=()=>{pq38Access.network++;throw Error('offline')};XMLHttpRequest.prototype.open=function(){pq38Access.network++;throw Error('offline')};Object.defineProperty(window,'localStorage',{get(){pq38Access.storage++;throw Error('storage disabled')}});window.addEventListener('error',e=>pq38Access.errors.push(e.message));window.addEventListener('unhandledrejection',e=>pq38Access.errors.push(String(e.reason)));`});
  for(let i=0;i<inputs.length;i++){
    const file=path.join(dir,'input-'+i+'.html');fs.copyFileSync(inputs[i],file);
    const assertPrivacy=text=>{for(const marker of ['PQ_RAW_ONLY_38','PQ_SHARED_ONLY_38','PQ_CREDENTIAL_ONLY_38','pq-private-38.invalid'])assert.equal(text.includes(marker),false,marker);};
    assertPrivacy(fs.readFileSync(file,'utf8'));
    await b.send('Page.navigate',{url:pathToFileURL(file).href});
    await waitFor(()=>b.evaluate('!!window.app&&app.state.loaded'),'Snapshot failed to load');
    assert.equal(await b.evaluate('app.snapshotMode'),true);
    assert.equal(await b.evaluate('!!app.model.powerQuery'),false);
    await b.evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent==='Power Query').click()`);
    assert.match(await b.evaluate(`document.querySelector('.pq-main').textContent`),/excluded from shared snapshots/);
    await b.evaluate(`document.querySelector('.pq-dialog header button').click()`);
    for(const label of ['Measures','Domains','Matrix','Tables'])await b.evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const before=new Set(b.downloads.keys());await b.evaluate(`document.querySelector('button.ex-snapshot-export').click()`);
    let download;await waitFor(()=>{download=[...b.downloads.values()].find(d=>!before.has(d.guid)&&d.state==='completed');return !!download;},'Re-export failed');
    const bytes=fs.readFileSync(path.join(dir,download.guid),'utf8');assertPrivacy(bytes);
    assert.equal(!!payloadAt(path.join(dir,download.guid)).model.powerQuery,false);
    assert.deepEqual(await b.evaluate('pq38Access'),{network:0,storage:0,errors:[]});
    t.diagnostic(JSON.stringify({input:inputs[i],reexportBytes:Buffer.byteLength(bytes),access:await b.evaluate('pq38Access')}));
  }
});
