/* Acceptance test: use the real download button, stop the server, and open the
   actual HTML file in Chrome with networking and browser storage unavailable.
   Run: node --test tests/power-query-snapshot.browser.cjs */
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
  return { send, evaluate, downloads, async close() { socket.close(); child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); fs.rmSync(profile, {recursive:true,force:true,maxRetries:20,retryDelay:100}); } };
}


async function waitFor(check, message) {
  for (let n=0;n<200;n++) { if(await check())return; await new Promise(resolve=>setTimeout(resolve,25)); }
  throw new Error(message);
}
function payloadAt(file) {
  return JSON.parse(fs.readFileSync(file,'utf8').match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}

test('downloaded Power Query snapshots retain exact M and interactive flow entirely offline', {skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:120000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-pq-offline-'));
  const output=process.env.SMV_PQ_SNAPSHOT_OUTPUT;
  if(output)fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const file=path.join(sourceRoot,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
    try{const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(bytes);}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const b=await openBrowser();
  t.after(async()=>{await b.close();if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
  await b.send('Page.enable');await b.send('Network.enable');
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await b.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:dir,eventsEnabled:true});
  const settle=()=>b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  const load=async url=>{await b.send('Page.navigate',{url});await waitFor(()=>b.evaluate('!!window.app&&app.state.loaded'),'Viewer did not load');await settle();};
  const ready=()=>waitFor(()=>b.evaluate('!!app.powerQueryWorkspace.context&&app.powerQueryWorkspace.phase==="ready"&&!app.powerQueryWorkspace.pendingSnapshot'),'PQ worker did not finish');
  const click=label=>b.evaluate('(()=>{const button=[...document.querySelectorAll("button")].find(b=>b.textContent==='+JSON.stringify(label)+'||b.getAttribute("aria-label")==='+JSON.stringify(label)+');if(!button)throw Error("Button missing: "+'+JSON.stringify(label)+');button.click();})()');
  const save=async label=>{
    const before=new Set(b.downloads.keys());await b.evaluate('document.querySelector("button.ex-snapshot-export").click()');
    await waitFor(()=>b.evaluate('!app.state.snapshotSaving'),'Export did not settle');
    assert.equal(await b.evaluate('app.state.snapshotError'),'');
    let download;await waitFor(()=>{download=[...b.downloads.values()].find(d=>!before.has(d.guid)&&d.state==='completed');return !!download;},'Download did not complete');
    const file=path.join(dir,label+'.html');fs.renameSync(path.join(dir,download.guid),file);
    if(output)fs.copyFileSync(file,path.join(output,label+'.html'));
    return file;
  };
  const shot=async name=>{if(output){const result=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));}};
  await load('http://127.0.0.1:'+server.address().port+'/');
  const m='let\r\n  Input = Fn(Stage),\r\n  Marker = "</ScRiPt><script>globalThis.snapshotInjection=true</script> 😀 $&",\r\n  Unknown = #"Missing Query"\r\nin Input  \r\n';
  const files=[
    {name:'Sales.tmdl',text:'table Sales\r\n\tcolumn Value\r\n\t\tdataType: string\r\n\tpartition Import = m\r\n\t\tsource = '+String.fromCharCode(96).repeat(3)+'\r\n'+m.split('\r\n').map(l=>'\t\t\t'+l).join('\r\n')+'\r\n\t\t\t'+String.fromCharCode(96).repeat(3)+'\r\n'},
    {name:'Other.tmdl',text:'table Other\n\tpartition Missing = m\n\tpartition Calculated = calculated\n\t\tsource = 1\n'},
    {name:'expressions.tmdl',text:'expression Param = "https://pq-offline.invalid/data" meta [IsParameterQuery=true]\nexpression Stage = Web.Contents(Param)\nexpression Fn = (x) => x\n'}
  ];
  await b.evaluate('app._applyModel(TMDLParser.parseTMDL('+JSON.stringify(files)+'),"Offline Power Query","pq-offline",{persist:false});app.setViewMode("power-query")');
  await ready();await settle();
  const original=await b.evaluate('app.model.powerQuery');
  assert.equal(original.nodes.find(n=>n.name==='Import').code,m);
  const id=await b.evaluate('app.model.powerQuery.nodes.find(n=>n.name==="Import").id');
  const stage=await b.evaluate('app.model.powerQuery.nodes.find(n=>n.name==="Stage").id');
  await b.evaluate('app.powerQueryWorkspace.chooseQuery('+JSON.stringify(id)+');app.powerQueryWorkspace.navigate('+JSON.stringify(id)+',false);app.powerQueryWorkspace.setDockPreference("bottom");app.powerQueryWorkspace.resizeInspector(30)');
  await settle();await click('Open full query');await settle();
  const before=await b.evaluate('app.powerQueryWorkspace.captureSnapshot()');
  assert.equal(before.navigation.inspectorView.expanded,true);
  const first=await save('power-query-flow');
  assert.deepEqual(payloadAt(first).model.powerQuery,original);
  await click('Close expanded reader');
  await b.evaluate('window.pqSaved=app.model.powerQuery;delete app.model.powerQuery;app.powerQueryWorkspace.reset();app.setViewMode("graph")');
  const legacy=await save('legacy-no-power-query');
  await new Promise(r=>server.close(r));

  await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:
    'window.offlineAccess={network:0,storage:0,errors:[],csp:[]};window.fetch=()=>{offlineAccess.network++;throw Error("offline")};XMLHttpRequest.prototype.open=function(){offlineAccess.network++;throw Error("offline")};Object.defineProperty(window,"localStorage",{get(){offlineAccess.storage++;throw Error("storage disabled")}});window.addEventListener("error",e=>offlineAccess.errors.push(e.message));window.addEventListener("unhandledrejection",e=>offlineAccess.errors.push(String(e.reason)));window.addEventListener("securitypolicyviolation",e=>offlineAccess.csp.push(e.violatedDirective));'});
  await load(pathToFileURL(first).href);await ready();await settle();await settle();
  assert.equal(await b.evaluate('app.state.viewMode'),'power-query');
  assert.deepEqual(await b.evaluate('app.model.powerQuery'),original);
  assert.equal(await b.evaluate('window.snapshotInjection'),undefined);
  assert.equal(await b.evaluate('app.powerQueryWorkspace.selectedId'),id);
  assert.equal(await b.evaluate('app.powerQueryWorkspace.inspector.captureViewState().expanded'),true);
  assert.equal(await b.evaluate('app.powerQueryWorkspace.dockPreference'),'bottom');
  assert.equal(await b.evaluate('app.powerQueryWorkspace.height'),before.presentation.height);
  assert.ok(await b.evaluate('document.querySelectorAll(".pqc-node").length>=4'),'flow nodes rendered');
  assert.ok(await b.evaluate('app.powerQueryWorkspace.context.graph.edges.length>=3'),'resolved dependencies rebuilt');
  assert.ok(await b.evaluate('app.powerQueryWorkspace.context.graph.issues.length>0'),'unresolved metadata retained');
  assert.equal(await b.evaluate('app.powerQueryWorkspace.context.byNodeId.get('+JSON.stringify(id)+').code'),m);
  await shot('offline-full-reader');
  await b.evaluate('document.querySelector(".pqi-reference[aria-label^=\\"Show Stage referenced\\"]").click()');
  await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.selectedId'),stage);
  assert.equal(await b.evaluate('app.powerQueryWorkspace.analyzedId'),id);
  await shot('offline-reference');
  await b.evaluate('app.setViewMode("graph");app.explorer.add(["Sales"],{x:100,y:100});app.canvas.selectTable("Sales")');await settle();
  await click('Open Power Query');await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.selectedId'),id);
  await b.evaluate('app.powerQueryWorkspace.setMode("canvas")');await settle();
  await b.evaluate('app.powerQueryWorkspace.canvas.restoreLayout(new Map([['+JSON.stringify(id)+',{x:75,y:135}],['+JSON.stringify(stage)+',{x:440,y:135}]]));app.powerQueryWorkspace.depth=Infinity;app.powerQueryWorkspace.query="Stage";app.powerQueryWorkspace.applyFilters()');
  await settle();
  const canvasState=await b.evaluate('app.powerQueryWorkspace.captureSnapshot()');
  const second=await save('power-query-reexport');
  assert.deepEqual(payloadAt(second).model.powerQuery,original);
  const assertOffline=async()=>assert.deepEqual(await b.evaluate('offlineAccess'),{network:0,storage:0,errors:[],csp:[]});
  await assertOffline();
  await load(pathToFileURL(second).href);await ready();await settle();await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.viewMode'),'canvas');
  assert.equal(await b.evaluate('app.powerQueryWorkspace.depth===Infinity'),true);
  assert.equal(await b.evaluate('app.powerQueryWorkspace.query'),'Stage');
  assert.deepEqual(await b.evaluate('Object.fromEntries(app.powerQueryWorkspace.canvas.captureLayout())'),Object.fromEntries(canvasState.navigation.layout));
  await b.evaluate('app.powerQueryWorkspace.setMode("flow")');await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.analyzedId'),id);
  await b.evaluate('document.querySelector(".pqc-edge-hit").dispatchEvent(new MouseEvent("click",{bubbles:true}))');await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.popover.hidden'),false);
  assert.match(await b.evaluate('app.powerQueryWorkspace.popover.textContent'),/is referenced by/);
  await click('Close reference details');
  await assertOffline();await shot('offline-reexport-flow');
  await load(pathToFileURL(legacy).href);await click('Power Query');await settle();
  assert.equal(await b.evaluate('app.powerQueryWorkspace.context'),null);
  assert.match(await b.evaluate('app.powerQueryWorkspace.message.textContent'),/unavailable.*older snapshot/);
  const legacyAgain=await save('legacy-reexport');assert.equal(payloadAt(legacyAgain).model.powerQuery,undefined);
  await assertOffline();
  const evidence={platform:process.platform,node:process.version,chrome,files:['power-query-flow.html','power-query-reexport.html','legacy-no-power-query.html','legacy-reexport.html'],exactM:true,offlineAccess:await b.evaluate('offlineAccess'),nodes:original.nodes.length};
  if(output)fs.writeFileSync(path.join(output,'browser-proof.json'),JSON.stringify(evidence,null,2));
  t.diagnostic(JSON.stringify(evidence));
});
