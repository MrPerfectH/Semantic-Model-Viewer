/* Synthetic UI audit acceptance against the complete viewer and host CSS.
   Uses an isolated temporary Chrome profile; no Fabric network requests.
   Run: node --test tests/ui-audit.browser.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const sourceRoot = path.join(__dirname, '../Models/tools/viewer');
const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = candidates.find(file => fs.existsSync(file));
async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-ui-audit-'));
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Chrome did not start: ' + output)); }, 30000);
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

test('UI audit: refresh context, host contrast, matrix and short-height scrolling', {skip:!chrome,timeout:90000},async t=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(sourceRoot,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');
  try{const content=fs.readFileSync(file);res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});res.end(content);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 t.after(async()=>{try{if(browser)await browser.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
 browser=await openBrowser();await browser.send('Page.enable');
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 await waitFor(()=>browser.evaluate('!!window.app'),'app');
 await browser.evaluate("app.loadModel('builtin')");
 await waitFor(()=>browser.evaluate('app.model.tables.length===43'),'demo');
 await browser.evaluate("document.querySelector('.smv-guide')?.remove();app.setViewMode('power-query')");
 await waitFor(()=>browser.evaluate('app.powerQueryWorkspace?.phase==="ready"&&!!app.powerQueryWorkspace.context'),'Power Query ready');
 await t.test('real metadata rebuild restores selected/analyzed flow and viewport',async()=>{
  const before=await browser.evaluate(`(()=>{const w=app.powerQueryWorkspace;const id=[...w.context.byNodeId].find(([id,n])=>n.metadataRow.name==='StageSales')[0];w.chooseQuery(id);w.canvas.setViewport({x:34,y:51,k:.91});window.refreshRecord={id:app.modelKey,name:app.state.modelName,model:JSON.parse(JSON.stringify(app.model))};return {id,view:w.canvas.getViewport()};})()`);
  await browser.evaluate('app.hostOpenModel(JSON.parse(JSON.stringify(refreshRecord)))');
  await waitFor(()=>browser.evaluate('app.powerQueryWorkspace.phase==="ready"&&!app.powerQueryWorkspace.pendingSnapshot&&!!app.powerQueryWorkspace.selectedId'),'refresh restore');
  const after=await browser.evaluate('({selected:app.powerQueryWorkspace.selectedId,analyzed:app.powerQueryWorkspace.analyzedId,view:app.powerQueryWorkspace.canvas.getViewport()})');
  assert.equal(after.selected,before.id);assert.equal(after.analyzed,before.id);assert.deepEqual(after.view,before.view);
  await browser.evaluate("app.setViewMode('measures');app.hostOpenModel(JSON.parse(JSON.stringify(refreshRecord)));app.setViewMode('power-query')");
  await waitFor(()=>browser.evaluate('app.powerQueryWorkspace.phase==="ready"&&!app.powerQueryWorkspace.pendingSnapshot&&!!app.powerQueryWorkspace.selectedId'),'inactive refresh restore');
  assert.equal(await browser.evaluate('app.powerQueryWorkspace.selectedId'),before.id);
 });
 await t.test('colours, legend, map and saved view survive navigation and model reopen',async()=>{
  const before=await browser.evaluate(`(()=>{app.setViewMode('graph');app.canvas.selectTable('Sales');app.canvas.setColorMode('domain');app.editGroupColours();const dialog=document.querySelector('.smv-colour-dialog'),picker=dialog.querySelector('input[type=color]');picker.value='#ffff99';picker.dispatchEvent(new Event('input',{bubbles:true}));[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Apply colours').click();
   document.querySelector('input[aria-label="Legend"]').click();document.querySelector('input[aria-label="Overview map"]').click();
   app.canvas.savePreset('Audit selection');return {colours:app.captureGroupColours(),selected:app.state.selected};})()`);
  await browser.evaluate(`app.explorer.blank();app.canvas.applyPreset(app.canvas.getPresets().find(p=>p.name==='Audit selection'));app.setViewMode('matrix');app.setViewMode('graph');app.hostOpenModel(JSON.parse(JSON.stringify(refreshRecord)));`);
  const after=await browser.evaluate(`({colours:app.captureGroupColours(),selected:app.state.selected,legend:app.explorer.legendOpen,map:app.explorer.mapHidden,saved:app.canvas.getPresets().some(p=>p.name==='Audit selection')})`);
  assert.deepEqual(after.colours,before.colours);assert.equal(after.selected,before.selected);assert.equal(after.legend,false);assert.equal(after.map,true);assert.equal(after.saved,true);
  await browser.evaluate(`document.querySelector('input[aria-label="Legend"]').click();document.querySelector('input[aria-label="Overview map"]').click();`);
 });
 const hostCSS=fs.readFileSync(path.join(sourceRoot,'vscode-theme.css'),'utf8');
 await browser.evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(hostCSS)};document.head.appendChild(style);app.setViewMode('graph');app.canvas.selectTable('Sales');})()`);
 const themes=[['light','#ffffff','#333333','#f3f3f3'],['dark','#1a1b26','#a9b1d6','#24283b'],['high-contrast','#000000','#ffffff','#000000'],['high-contrast-light','#ffffff','#000000','#ffffff']];
 const luminance=rgb=>{const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 for(const [theme,bg,fg,surface] of themes)await t.test('inspector text contrast in '+theme,async()=>{
  const pairs=await browser.evaluate(`(()=>{document.documentElement.dataset.host='vscode';document.body.className='vscode-${theme}';for(const [key,value] of Object.entries({'editor-background':'${bg}','editor-foreground':'${fg}','editorWidget-background':'${surface}'}))document.body.style.setProperty('--vscode-'+key,value);return [...document.querySelectorAll('.ex-inspector-stat,.ex-inspector-source')].flatMap(tile=>[...tile.querySelectorAll('*')].filter(n=>n.textContent.trim()&&!n.children.length).map(n=>({text:n.textContent,fg:getComputedStyle(n).color,bg:getComputedStyle(tile).backgroundColor})));})()`);
  assert.ok(pairs.length>=8,JSON.stringify(pairs));
  for(const p of pairs){const a=luminance(p.fg),b=luminance(p.bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(contrast>=4.5,theme+' '+JSON.stringify(p)+' '+contrast);}
 });
 await t.test('matrix expands across wide view and retains usable columns on narrow view',async()=>{
  await browser.evaluate("app.setViewMode('matrix')");
  for(const width of [1440,700]){
   await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   const r=await browser.evaluate(`(()=>{const table=document.querySelector('#matrix table'),section=table.closest('section'),label=table.querySelector('thead button span');return {width:table.getBoundingClientRect().width,available:section.clientWidth,label:parseFloat(getComputedStyle(label).fontSize),scroll:section.scrollWidth};})()`);
   assert.ok(r.width>=r.available-50,JSON.stringify(r));assert.ok(r.label>=13);if(width===700)assert.ok(r.scroll>r.available);
  }
 });
 await t.test('335px height retains a scrollable canvas instead of collapsing it',async()=>{
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1200,height:335,deviceScaleFactor:1,mobile:false});
  await browser.evaluate("app.setViewMode('graph')");
  const r=await browser.evaluate(`(()=>{const root=document.getElementById('root'),main=document.getElementById('main');return {height:main.clientHeight,scroll:root.scrollHeight,client:root.clientHeight,overflow:getComputedStyle(root).overflowY};})()`);
  assert.ok(r.height>=360,JSON.stringify(r));assert.ok(r.scroll>r.client);assert.equal(r.overflow,'auto');
 });
});
