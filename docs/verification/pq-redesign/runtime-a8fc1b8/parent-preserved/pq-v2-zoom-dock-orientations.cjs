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

(async()=>{const b=await openBrowser();try{await b.send('Page.enable');const nw=await b.send('Browser.getWindowForTarget');await b.send('Browser.setWindowBounds',{windowId:nw.windowId,bounds:{width:Number(process.env.PQ_ZOOM_WIDTH||1280),height:1087}});await b.send('Page.navigate',{url:'chrome://settings/appearance'});const find="(()=>{function f(r){for(let n of r.querySelectorAll('*')){if(n.id==='zoomLevel')return n;if(n.shadowRoot){let x=f(n.shadowRoot);if(x)return x}}}return f(document)})()";await waitFor(()=>b.evaluate('!!'+find),'Chrome zoom control');await b.evaluate('(()=>{let z='+find+';z.value="2";z.dispatchEvent(new Event("change",{bubbles:true}))})()');await b.send('Page.navigate',{url:'http://localhost:8944/'});await waitFor(()=>b.evaluate('!!window.app'),'boot');await b.evaluate('document.fonts.ready');await b.evaluate("[...document.querySelectorAll('button')].find(x=>x.textContent==='Open model').click()");let root=await b.send('DOM.getDocument');let input=await b.send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type=file]'});await b.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[process.cwd()+'/tests/acceptance-fixtures/pq-redesign/a3-results/model.bim']});await waitFor(()=>b.evaluate('app.state.importReady'),'import');await b.evaluate("[...document.querySelectorAll('button')].find(x=>/^Add model/.test(x.textContent)).click()");await b.evaluate("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='Power Query').click()");await waitFor(()=>b.evaluate("app.powerQueryWorkspace.phase==='ready'"),'worker');await b.evaluate("[...document.querySelectorAll('.pqw-library-row')].find(x=>x.textContent.startsWith('MergeResult')).click()");await new Promise(r=>setTimeout(r,150));
const measure="(()=>{let w=app.powerQueryWorkspace,r=w.resizer.getBoundingClientRect(),s=w.inspectorHost.getBoundingClientRect(),c=document.querySelector('.pqc-surface').getBoundingClientRect();return {innerWidth,innerHeight,dpr:devicePixelRatio,below:w.below,width:w.width,inspector:s.toJSON(),resizer:r.toJSON(),surface:c.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className}})()";await b.evaluate('app.powerQueryWorkspace.resizer.scrollIntoView({block:"center"})');await new Promise(r=>setTimeout(r,100));const before=await b.evaluate(measure);console.log(JSON.stringify({before}));await b.evaluate('app.powerQueryWorkspace.resizer.focus()');for(let i=0;i<2;i++){await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});}await new Promise(r=>setTimeout(r,150));const after=await b.evaluate(measure);console.log(JSON.stringify({after}));assert.equal(before.innerWidth,Number(process.env.PQ_ZOOM_WIDTH||1280)/2);assert.equal(before.dpr,2);assert.ok(after.inspector.height>before.inspector.height,'keyboard resize changes actual height');assert.equal(before.hit,'pqw-resizer','resizer receives hits');await b.evaluate('app.powerQueryWorkspace.resizer.scrollIntoView({block:"center"})');let rect=await b.evaluate('app.powerQueryWorkspace.resizer.getBoundingClientRect().toJSON()');let x=rect.x+rect.width/2,y=rect.y+rect.height/2;await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y-40,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y-40,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,100));const pointer=await b.evaluate(measure);console.log(JSON.stringify({pointer}));assert.ok(pointer.inspector.height>after.inspector.height,'pointer changes real height');assert.equal(await b.evaluate('app.powerQueryWorkspace.inspectorOpen'),true);
assert.equal(await b.evaluate('Number(app.powerQueryWorkspace.resizer.getAttribute("aria-valuenow"))'),pointer.inspector.height);await b.send('Page.navigate',{url:'chrome://settings/appearance'});await waitFor(()=>b.evaluate('!!'+find),'zoom control');await b.evaluate('(()=>{let z='+find+';z.value="1";z.dispatchEvent(new Event("change",{bubbles:true}))})()');await b.send('Page.navigate',{url:'http://localhost:8944/'});await waitFor(()=>b.evaluate('!!window.app&&app.state.loaded'),'restored model');await b.evaluate("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='Power Query').click()");await waitFor(()=>b.evaluate("app.powerQueryWorkspace.phase==='ready'"),'side ready');await b.evaluate("[...document.querySelectorAll('.pqw-library-row')].find(x=>x.textContent.startsWith('MergeResult')).click()");await new Promise(r=>setTimeout(r,100));const sideBefore=await b.evaluate(measure);assert.equal(sideBefore.below,false);await b.evaluate('app.powerQueryWorkspace.resizer.focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});let sideAfter=await b.evaluate(measure);assert.equal(sideAfter.inspector.width,sideBefore.inspector.width+20);await new Promise(r=>setTimeout(r,150));sideAfter=await b.evaluate(measure);console.log(JSON.stringify({sideBefore,sideAfter}));let sr=sideAfter.resizer;await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:sr.x+sr.width/2,y:sr.y+sr.height/2});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x:sr.x+sr.width/2,y:sr.y+sr.height/2,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:sr.x+sr.width/2-40,y:sr.y+sr.height/2,button:'left',buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:sr.x+sr.width/2-40,y:sr.y+sr.height/2,button:'left',clickCount:1});const sidePointer=await b.evaluate(measure);console.log(JSON.stringify({sidePointer}));assert.equal(sidePointer.inspector.width,sideAfter.inspector.width+40);assert.equal(await b.evaluate('Number(app.powerQueryWorkspace.resizer.getAttribute("aria-valuenow"))'),sidePointer.inspector.width);console.log(JSON.stringify({sideBefore,sideAfter,sidePointer}));
await b.send('Page.captureScreenshot').then(x=>fs.writeFileSync('/tmp/pq-v2-zoom-dock.png',Buffer.from(x.data,'base64')));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
