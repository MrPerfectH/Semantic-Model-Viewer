/* Supplementary real-Chrome checks of owned fixture assets, not registered/packaged acceptance.
   Run: node --test tests/power-query-lineage.browser.cjs (Node 22+, Chrome). */
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-pq-lineage-'));
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
  let id = 0; const waiting = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!data.id) return; const promise = waiting.get(data.id); if (!promise) return; waiting.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; waiting.set(seq, {resolve,reject}); socket.send(JSON.stringify({id:seq,method,params})); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true}); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception)); return result.result.value; };
  return { send, evaluate, async close() { socket.close(); child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); fs.rmSync(profile, {recursive:true,force:true}); } };
}

test('lineage inspector preserves root across keyboard code navigation, partition changes and model resets', {skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:60000}, async t=>{
 const assets=new Map();
 for(const name of ['util.js','roles.js','tmdl-parser.js','power-query-dependencies.js','power-query-lineage.js','power-query.js'])assets.set('/Models/tools/viewer/js/'+name,{type:'text/javascript',file:path.join(sourceRoot,'js',name)});
 for(const name of ['power-query.css','power-query-lineage.css'])assets.set('/Models/tools/viewer/'+name,{type:'text/css',file:path.join(sourceRoot,name)});
 assets.set('/tests/power-query-lineage.fixture.html',{type:'text/html',file:path.join(__dirname,'power-query-lineage.fixture.html')});
 const server=http.createServer((req,res)=>{const asset=assets.get(req.url);if(!asset){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':asset.type});res.end(fs.readFileSync(asset.file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await openBrowser();t.after(()=>browser.close());
 await browser.send('Page.enable');await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/tests/power-query-lineage.fixture.html'});
 await browser.evaluate(`new Promise((resolve,reject)=>{let tries=0;const timer=setInterval(()=>{if(window.fixtureApp){clearInterval(timer);resolve(true);}else if(++tries>100){clearInterval(timer);reject(new Error('Fixture did not load'));}},20);})`);
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 const run=expression=>browser.evaluate(expression);
 await run(`document.getElementById('open').click()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),2);
 await run(`[...document.querySelectorAll('.pq-lineage button')].find(b=>b.textContent==='Expand 1 references').click()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),3);
 assert.ok(await run(`document.querySelector('.pq-lineage').textContent.includes('Cycle group: A, B')`));
 t.diagnostic(JSON.stringify(await run(`({stage:'before-key',text:document.activeElement.textContent,key:document.activeElement.dataset.lineageKey})`)));
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38});
 t.diagnostic(JSON.stringify(await run(`({stage:'after-arrow',text:document.activeElement.textContent,key:document.activeElement.dataset.lineageKey})`)));
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
 await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 t.diagnostic(JSON.stringify(await run(`({stage:'after-enter',focus:document.activeElement.dataset.lineageKey,heading:document.querySelector('.pq-main>h3').textContent,highlight:document.querySelector('.pq-lineage-inspected h4').textContent})`)));
 const opened=await run(`({code:document.querySelector('.pq-code').textContent,root:document.querySelector('.pq-lineage-root h4').textContent,nodes:document.querySelectorAll('.pq-lineage-node').length,focus:document.activeElement.textContent,dynamic:[...document.querySelectorAll('.pq-lineage details[open]')].some(d=>d.textContent.includes('Dynamic/environment'))})`);
 assert.deepEqual(opened,{code:'B & Expression.Evaluate("Unknown")',root:'Sales / Main',nodes:3,focus:'Open code',dynamic:true});
 await run(`(()=>{const s=document.querySelector('[aria-label="Power Query partition"]');s.value=JSON.stringify(['partition','Sales','Other']);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),1);
 await run(`(()=>{const s=document.querySelector('[aria-label="Power Query partition"]');s.value=JSON.stringify(['partition','Sales','Main']);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),3);
 await run(`PowerQuery.close(fixtureApp);document.getElementById('replace').click()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),2);
 await run(`PowerQuery.close(fixtureApp);document.getElementById('large').click()`);
 assert.equal(await run(`document.querySelectorAll('.pq-lineage-node').length`),41);
 assert.ok(await run(`document.querySelector('.pq-lineage').textContent.includes('Large-model mode')`));
 await run(`[...document.querySelectorAll('.pq-lineage button')].find(b=>b.textContent==='Next references').click()`);
 assert.ok(await run(`document.querySelector('.pq-lineage').textContent.includes('References 41–80 of 100')`));
 assert.ok(await run(`[...document.querySelectorAll('.pq-lineage h4')].some(x=>x.textContent==='Q40')`));
 assert.equal(await run(`[...document.querySelectorAll('.pq-lineage h4')].some(x=>x.textContent==='Q0')`),false);
 assert.ok(await run(`document.querySelector('.pq-lineage-graph').scrollHeight>document.querySelector('.pq-lineage-graph').clientHeight`));
 await run(`document.querySelector('.pq-lineage-graph').scrollTop=120`);
 await new Promise(resolve=>setTimeout(resolve,50));
 await run(`[...document.querySelectorAll('.pq-lineage-node')][1].querySelector('button').click()`);
 assert.ok(await run(`document.querySelector('.pq-lineage-graph').scrollTop>=120`));
 const boxes=await run(`[...document.querySelectorAll('.pq-lineage-node')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,font:getComputedStyle(e.querySelector('h4')).fontSize,overflow:e.scrollWidth>e.clientWidth};})`);
 fs.writeFileSync(path.join(os.tmpdir(),'pq37-lineage-browser.png'),Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 assert.ok(boxes.every(b=>b.width>=250&&!b.overflow&&parseFloat(b.font)>=13),JSON.stringify(boxes));
 await browser.send('Emulation.setDeviceMetricsOverride',{width:760,height:800,deviceScaleFactor:1,mobile:false});
 assert.equal(await run(`document.querySelector('.pq-lineage').scrollWidth>document.querySelector('.pq-lineage').clientWidth`),false);
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 assert.equal(await run(`!!document.querySelector('.pq-overlay')`),false);
});
