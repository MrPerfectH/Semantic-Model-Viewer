/* Initial demo camera regression. Uses the same Chrome/CDP harness as star-layout.browser.cjs. */
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]);
    if (name === '/frame') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<iframe id="demo" src="/" style="border:0;width:1900px;height:1050px"></iframe>'); return;
    }
    const file = path.join(sourceRoot, name === '/' ? 'index.html' : name);
    if (!file.startsWith(sourceRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-star-layout-'));
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // `close` follows exit AND drained stdio; register before Chrome can exit.
  const closed = new Promise(resolve => child.once('close', resolve));
  const waitClosed = async timeout => {
    let timer;
    try { return await Promise.race([closed.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); })]); }
    finally { clearTimeout(timer); }
  };
  let endpoint;
  try {
    endpoint = await new Promise((resolve, reject) => {
      // Match the other browser suites' cold-start allowance on hosted runners.
      let output = ''; const timer = setTimeout(() => reject(new Error('Chrome did not start: ' + output)), 30000);
      child.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Chrome exited during startup: ' + code + ' ' + output)); });
    });
  } catch (error) {
    // openBrowser has not returned, so the test's browser teardown cannot run.
    // Reap the process here instead of keeping the test worker alive until CI times out.
    child.kill('SIGKILL');
    try {
      if (await waitClosed(3000)) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } finally {
      child.stderr.destroy();
      child.unref();
    }
    throw error;
  }
  const port = new URL(endpoint).port;
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const waiting = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!data.id) return; const promise = waiting.get(data.id); if (!promise) return; waiting.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; waiting.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  };
  return { send, evaluate, async close() {
    // Let Chrome stop its profile writers normally before escalating termination.
    // A disconnected CDP socket is expected during shutdown, not a test assertion.
    void send('Browser.close').catch(() => {});
    try {
      if (!await waitClosed(5000)) {
        child.kill('SIGTERM');
        if (!await waitClosed(3000)) {
          child.kill('SIGKILL');
          if (!await waitClosed(3000)) throw new Error('Chrome did not close after SIGKILL; retained profile: ' + profile);
        }
      }
      // Some filesystems briefly retain directory entries after Chrome closes.
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } finally {
      socket.close();
      child.stderr.destroy();
      child.unref();
    }
  } };
}


const frames = `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`;
const measure = `(() => {
  const cv = app.canvas, h = cv.host.getBoundingClientRect(), r = cv.viewportRect();
  const boxes = Object.values(cv.cards).filter(c => c.el.style.display !== 'none').map(c => c.el.getBoundingClientRect());
  return { count: boxes.length, view: {...cv.view},
    bounds: { left: Math.min(...boxes.map(b => b.left))-h.left, right: Math.max(...boxes.map(b => b.right))-h.left,
      top: Math.min(...boxes.map(b => b.top))-h.top, bottom: Math.max(...boxes.map(b => b.bottom))-h.top }, rect: r };
})()`;
function fitted(result) {
  const {bounds:b, rect:r} = result;
  assert.ok(result.count > 0);
  assert.ok(b.left >= r.x-2 && b.top >= r.y-2 && b.right <= r.x+r.w+2 && b.bottom <= r.y+r.h+2,
    'visible tables must fit: '+JSON.stringify(result));
  assert.ok(Math.abs((b.left+b.right)/2-(r.x+r.w/2)) < 3, 'centered horizontally');
  assert.ok(Math.abs((b.top+b.bottom)/2-(r.y+r.h/2)) < 3, 'centered vertically: '+JSON.stringify(result));
}
test('demo fits the mounted iframe, delayed sizing and reload; user cameras survive later resize', {skip:!chrome}, async t => {
  const server = serve(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    try { if (browser) await browser.close(); }
    finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  browser = await openBrowser();
  await browser.send('Page.enable');
  await browser.send('Page.addScriptToEvaluateOnNewDocument', {source:"localStorage.setItem('smv_current_v1','builtin');"});
  await browser.send('Page.navigate', {url:'http://127.0.0.1:'+server.address().port+'/frame'});
  for(let n=0;;n++) {
    if(await browser.evaluate("document.querySelector('iframe')?.contentWindow.app?.model?.tables.length===43")) break;
    if(n>200) throw new Error('Demo did not load: '+JSON.stringify(await browser.evaluate("({url:document.querySelector('iframe')?.contentWindow.location.href,state:document.querySelector('iframe')?.contentWindow.app?.state,model:document.querySelector('iframe')?.contentWindow.app?.model?.tables.length})")));
    await new Promise(resolve => setTimeout(resolve,25));
  }
  const inside = expression => browser.evaluate(`document.querySelector('iframe').contentWindow.eval(${JSON.stringify(expression)})`);
  const settle = async () => { await inside(frames); await inside(frames); };
  await inside('app.explorer.showAll()');
  await settle(); fitted(await inside(measure));
  // Resize after initial nonzero sizing, without a window resize in the parent.
  await browser.evaluate("Object.assign(document.querySelector('iframe').style,{width:'1024px',height:'768px'})");
  await settle(); fitted(await inside(measure));
  await t.test('reload fits the recipient dimensions again', async () => {
    await inside('location.reload()');
    await new Promise(resolve => setTimeout(resolve,150));
    for(let n=0;;n++) {
      if(await browser.evaluate("document.querySelector('iframe').contentWindow.app?.model?.tables.length===43")) break;
      if(n>200) throw new Error('Reload did not load');
      await new Promise(resolve => setTimeout(resolve,25));
    }
    await settle(); fitted(await inside(measure));
  });
  await t.test('zero-sized canvas defers fitting until the container is shown', async () => {
    await browser.evaluate("document.querySelector('iframe').style.display='none'");
    await inside('location.reload()');
    await new Promise(resolve => setTimeout(resolve,150));
    for(let n=0;;n++) {
      if(await browser.evaluate("document.querySelector('iframe').contentWindow.app?.model?.tables.length===43")) break;
      if(n>200) throw new Error('Hidden model did not load');
      await new Promise(resolve => setTimeout(resolve,25));
    }
    await browser.evaluate("document.querySelector('iframe').style.display='block'");
    await settle(); fitted(await inside(measure));
  });
  await t.test('automatically restored workspace keeps its 13 tables and positions, fits a new camera', async () => {
    await inside(`app.explorer.removeMany(Array.from(app.explorer.names).slice(13));
      Object.values(app.canvas.pos).forEach(p => {p.x-=1800;p.y-=900;}); app.canvas.persist();
      app.canvas.view={x:-2000,y:-1500,k:.84};app.canvas.updateTransform();`);
    const saved = await inside('({pos:JSON.parse(JSON.stringify(app.canvas.pos)),names:Array.from(app.explorer.names)})');
    await inside('location.reload()');
    await new Promise(resolve => setTimeout(resolve,150));
    for(let n=0;;n++) {
      if(await browser.evaluate("document.querySelector('iframe').contentWindow.app?.model?.tables.length===43")) break;
      if(n>200) throw new Error('Restored workspace did not load');
      await new Promise(resolve => setTimeout(resolve,25));
    }
    await settle(); const result = await inside(measure); fitted(result); assert.equal(result.count,13);
    assert.deepEqual(await inside('({pos:JSON.parse(JSON.stringify(app.canvas.pos)),names:Array.from(app.explorer.names)})'),saved);
  });
  await t.test('explicit saved view keeps its camera through resize', async () => {
    const expected={x:103,y:207,k:.84};
    await inside(`app.canvas.savePreset('Manual camera'); var preset=app.canvas.getPresets().find(p=>p.name==='Manual camera');
      preset.view=${JSON.stringify(expected)};app.canvas.applyPreset(preset);`);
    await settle(); assert.deepEqual(await inside('({...app.canvas.view})'),expected);
    await browser.evaluate("document.querySelector('iframe').style.width='1150px'");
    await settle(); assert.deepEqual(await inside('({...app.canvas.view})'),expected);
    await inside('app.canvas.fitView()'); await settle(); fitted(await inside(measure));
  });
  await t.test('wheel interaction stops initial auto fitting', async () => {
    await inside("app.canvas.host.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:500,clientY:350,bubbles:true,cancelable:true}))");
    const before=await inside('({...app.canvas.view})');
    await browser.evaluate("document.querySelector('iframe').style.width='1250px'");
    await settle(); assert.deepEqual(await inside('({...app.canvas.view})'),before);
  });
});
