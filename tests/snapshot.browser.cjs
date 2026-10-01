/* Acceptance test: use the real download button, stop the server, and open the
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
test('downloaded whole-app snapshot works as a standalone offline file', {skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:120000},async t=>{
  const downloadDir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-snapshot-downloads-'));
  const server=http.createServer((req,res)=>{
    const file=path.join(sourceRoot,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
    try {const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(content);}
    catch {res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await openBrowser();
  t.after(async()=>{await browser.close();if(server.listening)await new Promise(resolve=>server.close(resolve));fs.rmSync(downloadDir,{recursive:true,force:true});});
  await browser.send('Page.enable');
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true});
  const settle=()=>browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const load=async url=>{
    await browser.send('Page.navigate',{url});
    await waitFor(()=>browser.evaluate('document.readyState!=="loading"&&!!window.app&&!!app.state.loaded'),'Viewer did not load');
    await settle();await settle();
  };
  const save=async label=>{
    const before=new Set(browser.downloads.keys());
    // Exercise the production control, including loading state and async asset packaging.
    await browser.evaluate("document.querySelector('button.ex-snapshot-export').click()");
    await waitFor(()=>browser.evaluate('!app.state.snapshotSaving'),'Snapshot export did not finish');
    assert.equal(await browser.evaluate('app.state.snapshotError'),'');
    // Filename existence alone is not proof that Chrome has finished writing.
    // Wait for the browser's completion event and identify this exact download by GUID.
    let download;
    await waitFor(()=>{
      download=[...browser.downloads.values()].find(item=>!before.has(item.guid));
      if(download&&download.state==='canceled')throw new Error('Snapshot download canceled');
      return download&&download.state==='completed';
    },'Snapshot download did not complete');
    assert.ok(download.suggestedFilename.endsWith('.html'),'Snapshot has an HTML filename');
    assert.ok(download.receivedBytes>0,'Completed snapshot is nonempty');
    const target=path.join(downloadDir,label+'.html');
    fs.renameSync(path.join(downloadDir,download.guid),target);return target;
  };
  await load('http://127.0.0.1:'+server.address().port+'/');
  assert.equal(await browser.evaluate('app.model.tables.length'),0,'Fresh profiles start with no selected model');
  await browser.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Contoso Retail')&&button.textContent.includes('built-in')).click()");
  await waitFor(()=>browser.evaluate('app.modelKey==="builtin"&&app.model.tables.length===43'),'Built-in sample did not load');
  await settle();
  await browser.evaluate(`app.explorer.blank();app.explorer.add(['Date','Customer'],{x:160,y:180});app.canvas.selectTable('Date');
    app.canvas.view={x:-210,y:35,k:.9};app.canvas.updateTransform();app.canvas.savePreset('Date briefing');
    app.setViewMode('measures');app.setState({selMeasure:'Sales LY',gPin:'Total Sales'});`);
  await settle();
  await browser.evaluate(`app.measures.setWorkspaceMode('split');app.measures.setSplitLayout('below');app.measures.setGraphOrientation('bt');`);
  await settle();
  await browser.evaluate('app.measures.setGraphZoom(1.2)');await settle();
  await browser.evaluate('app.measures.gScroll.scrollTo({left:70,top:90,behavior:"auto"})');await settle();
  const expectedMeasures=await browser.evaluate('app.measures.captureSnapshot()');
  const files={};const payloads={};
  await t.test('exports each starting view through the Save snapshot button',async()=>{
    for (const mode of ['graph','clusters','measures','matrix']) {
      await browser.evaluate('app.setViewMode('+JSON.stringify(mode)+')');await settle();
      if(mode==='graph')await browser.evaluate('app.canvas.view={x:-210,y:35,k:.9};app.canvas.updateTransform()');
      if(mode==='clusters'){
        await browser.evaluate("(()=>{const cv=app.canvas,key=Object.keys(cv.groups)[0];cv.expandedGroups.add(key);cv.reflowClusters();cv.view={x:-130,y:70,k:.6};cv.updateTransform()})()");await settle();
      }
      if(mode==='measures'){await browser.evaluate('app.measures.setGraphZoom(1.2)');await settle();}
      if(mode==='matrix'){await browser.evaluate('app.matrix.el.scrollTo({left:0,top:60,behavior:"auto"})');await settle();}
      files[mode]=await save('starting-'+mode);payloads[mode]=payloadAt(files[mode]);
      assert.equal(payloads[mode].workspace.viewMode,mode);
      assert.equal(payloads[mode].model.tables.length,43);
      assert.equal(payloads[mode].model.relationships.length,68);
      assert.equal(payloads[mode].model.tables.reduce((n,t)=>n+t.measures.length,0),88);
      assert.deepEqual(payloads[mode].workspace.tableView.tables.sort(),['Customer','Date']);
      assert.equal(payloads[mode].workspace.presets[0].name,'Date briefing');
      assert.equal(payloads[mode].workspace.tableView.focus.selected,'Date','Domains retains table selection');
    }
    assert.deepEqual(payloads.measures.workspace.domains,payloads.clusters.workspace.domains,'Leaving Domains retains its saved state');
  });
  await browser.evaluate("app.setViewMode('graph');app.explorer.blank()");await settle();
  files.blank=await save('blank-canvas');
  // The sender is now completely unavailable; opening a file must not touch any browser persistence either.
  await new Promise(resolve=>server.close(resolve));
  await browser.send('Network.enable');
  await browser.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.snapshotAccess={network:0,storage:0,idb:0,errors:[]};
    window.fetch=()=>{snapshotAccess.network++;throw new Error('No network in recipient test')};
    XMLHttpRequest.prototype.open=function(){snapshotAccess.network++;throw new Error('No network in recipient test')};
    Object.defineProperty(window,'localStorage',{get(){snapshotAccess.storage++;throw new Error('No native storage in recipient test')}});
    IDBFactory.prototype.open=function(){snapshotAccess.idb++;throw new Error('No repository in recipient test')};
    window.addEventListener('error',e=>snapshotAccess.errors.push(e.message));
    window.addEventListener('unhandledrejection',e=>snapshotAccess.errors.push(String(e.reason)));`});
  const assertOffline=async()=>{
    const access=await browser.evaluate('snapshotAccess');
    assert.deepEqual(access,{network:0,storage:0,idb:0,errors:[]});
    assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('script[src],link[href]')].map(el=>el.src||el.href)"),[]);
  };
  await t.test('every downloaded starting view restores in a fresh offline document',async()=>{
    for(const mode of ['graph','clusters','measures','matrix']){
      await load(pathToFileURL(files[mode]).href);
      assert.equal(await browser.evaluate('app.snapshotMode'),true);
      assert.equal(await browser.evaluate('app.state.viewMode'),mode);
      assert.equal(await browser.evaluate('app.model.tables.length'),43);
      assert.deepEqual(await browser.evaluate('Array.from(app.canvas.workspaceNames).sort()'),['Customer','Date']);
      assert.deepEqual(await browser.evaluate('app.model.tables.map(t=>t.role)'),payloads[mode].model.tables.map(t=>t.role));
      if(mode==='graph')assert.deepEqual(await browser.evaluate('app.canvas.view'),payloads[mode].workspace.tableView.view);
      if(mode==='clusters')assert.deepEqual(await browser.evaluate('app.captureDomains()'),payloads[mode].workspace.domains);
      if(mode==='matrix')assert.deepEqual(await browser.evaluate('app.captureMatrix()'),payloads.matrix.workspace.matrix);
      if(mode==='measures'){
        const actual=await browser.evaluate('app.measures.captureSnapshot()');
        assert.equal(actual.selectedMeasure,expectedMeasures.selectedMeasure);
        assert.equal(actual.comparisonMeasure,expectedMeasures.comparisonMeasure);
        assert.deepEqual(actual.preferences,expectedMeasures.preferences);
        assert.equal(actual.graph.zoom,payloads.measures.measures.graph.zoom);
        assert.ok(Math.abs(actual.graph.scrollTop-payloads.measures.measures.graph.scrollTop)<2);
        assert.equal(await browser.evaluate("document.querySelectorAll('.mv-dax-card').length"),2);
      }
      await assertOffline();
    }
  });
  await t.test('a blank starting canvas keeps the entire model available offline',async()=>{
    await load(pathToFileURL(files.blank).href);
    assert.equal(await browser.evaluate('app.canvas.workspaceNames.size'),0);
    assert.equal(await browser.evaluate('app.model.tables.length'),43);
    assert.equal(await browser.evaluate('document.getElementById("canvas-empty").hidden'),false);
    await browser.evaluate("app.explorer.add(['Product'],{x:100,y:100})");await settle();
    assert.ok(await browser.evaluate('app.canvas.workspaceNames.has("Product")'));
    await assertOffline();
  });
  await t.test('recipient can explore tables, DAX, Domains and Matrix without the source',async()=>{
    await load(pathToFileURL(files.measures).href);
    await browser.evaluate("[...document.querySelectorAll('.mv-comparison-card button')].find(b=>b.textContent==='Analyze this measure').click()");await settle();
    assert.equal(await browser.evaluate('app.state.selMeasure'),'Total Sales');
    await browser.evaluate("document.querySelectorAll('.ex-main-nav button')[0].click();app.explorer.add(['Product'],{x:430,y:380});app.canvas.selectTable('Product')");await settle();
    assert.equal(await browser.evaluate('app.state.selected'),'Product');
    assert.ok(await browser.evaluate('app.canvas.workspaceNames.has("Product")'));
    await browser.evaluate("document.querySelectorAll('.ex-main-nav button')[2].click()");await settle();
    assert.ok(await browser.evaluate('Object.keys(app.canvas.groups).length>0'));
    assert.deepEqual(await browser.evaluate('app.canvas.view'),payloads.clusters.workspace.domains.view);
    await browser.evaluate("document.querySelectorAll('.ex-main-nav button')[3].click()");await settle();
    assert.ok(await browser.evaluate('document.querySelectorAll("#matrix tbody tr").length>0'));
    await browser.evaluate('document.querySelector("#matrix tbody th button").click()');await settle();
    assert.equal(await browser.evaluate('app.state.viewMode'),'graph');
    assert.ok(await browser.evaluate('!!app.state.selected'));
    await assertOffline();
  });
  await t.test('offline re-export retains recipient changes and can be opened again',async()=>{
    await browser.evaluate("app.setViewMode('measures');app.setState({selMeasure:'Total Sales',gPin:null})");await settle();
    await browser.evaluate("app.measures.setWorkspaceMode('dax')");await settle();
    const second=await save('recipient-changes');
    await assertOffline();
    await load(pathToFileURL(second).href);
    assert.equal(await browser.evaluate('app.state.viewMode'),'measures');
    assert.equal(await browser.evaluate('app.state.selMeasure'),'Total Sales');
    assert.equal(await browser.evaluate('app.measures.captureSnapshot().preferences.mode'),'dax');
    assert.ok(await browser.evaluate('app.canvas.workspaceNames.has("Product")'));
    assert.equal(await browser.evaluate("app.msrOf('Total Sales').dax"),payloads.measures.model.tables.flatMap(t=>t.measures).find(m=>m.name==='Total Sales').dax);
    await assertOffline();
    if(process.env.SMV_SNAPSHOT_OUTPUT){fs.mkdirSync(process.env.SMV_SNAPSHOT_OUTPUT,{recursive:true});fs.copyFileSync(files.measures,path.join(process.env.SMV_SNAPSHOT_OUTPUT,'Contoso Retail interactive snapshot.html'));}
  });
});
