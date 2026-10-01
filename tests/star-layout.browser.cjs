/* The first screen, measured in a real browser: open the shipped app with the bundled model,
   show every table, Arrange, Fit — and check the numbers a reader feels. Run at both window
   sizes, because the whole point of step 5 is that the lanes are cut for the zoom the picture
   is shown at, and that zoom depends on how much canvas there is.
   Run: node --test tests/star-layout.browser.cjs
   Set CHROME_PATH when Chrome is not installed in a standard location. */
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
const ALGOS = ['star', 'constellation', 'layered', 'galaxy', 'columns', 'waterfall', 'grid'];
/* What Fit has to clear on each window, and what it has to reach. The floor is the canvas's
   own ZOOM_FLOOR; the bigger window has enough canvas to stay a rung above it. */
const SCREENS = [{ w: 1440, h: 900, minZoom: 0.30 }, { w: 1280, h: 720, minZoom: 0.25 }];

function serve() {
  return http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(sourceRoot, name === '/' ? 'index.html' : name);
    if (!file.startsWith(sourceRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(''); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-star-layout-'));
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
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const waiting = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!data.id) return; const promise = waiting.get(data.id); if (!promise) return; waiting.delete(data.id); data.error ? promise.reject(new Error(data.error.message)) : promise.resolve(data.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; waiting.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  };
  return { send, evaluate, async close() { socket.close(); child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); fs.rmSync(profile, { recursive: true, force: true }); } };
}

/* One read of the whole picture as the reader sees it, in page pixels. Overlaps are measured
   on DOM rects, not on model coordinates: two cards whose drawn boxes intersect are two names
   on top of each other, whatever the layout thinks. The title font is read off the element
   that actually carries the name (cards[n].nm) — the card element itself only inherits the
   page's 16px, and 16 x 0.16 is the 2.6px that looks like a bug and is a measuring slip. */
const READ_VIEW = `(() => {
  const cv = app.canvas, k = cv.view.k;
  const names = Object.keys(cv.cards).filter(n => cv.cards[n].el.style.display !== 'none');
  const rects = names.map(n => ({ n, r: cv.cards[n].el.getBoundingClientRect() }));
  let minFont = 1e9, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const clipped = [];
  /* Does the name still show its opening words? A clone with the same box and the same font,
     carrying only the first two words, is laid out unclamped: if it needs more lines than the
     chip has, those words cannot all be on screen. */
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;overflow-wrap:anywhere;';
  document.body.appendChild(probe);
  for (const { n, r } of rects) {
    const nm = cv.cards[n].nm, cs = getComputedStyle(nm);
    minFont = Math.min(minFont, parseFloat(cs.fontSize) * k);
    minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
    if (cv._chip) {
      probe.style.font = cs.font || (cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
      probe.style.lineHeight = cs.lineHeight;
      probe.style.width = nm.clientWidth + 'px';
      probe.textContent = n.split(/\\s+/).slice(0, 2).join(' ');
      const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.12;
      const lines = parseInt(cs.webkitLineClamp, 10) || 3;
      if (probe.offsetHeight > line * lines + 1) clipped.push(n + ' needs ' + Math.ceil(probe.offsetHeight / line) + ' of ' + lines + ' lines');
    }
  }
  probe.remove();
  const hits = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i].r, b = rects[j].r;
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits.push(rects[i].n + ' / ' + rects[j].n);
  }
  return { zoom: k, layoutK: cv.layoutK, chip: cv._chip, count: names.length, minFont,
    overlaps: hits.length, worst: hits.slice(0, 6), clipped: clipped.slice(0, 6), clippedCount: clipped.length,
    extent: { w: Math.round((maxX - minX) / k), h: Math.round((maxY - minY) / k) } };
})()`;

for (const screen of SCREENS) {
  const label = screen.w + 'x' + screen.h;
  test(`the whole model fits and stays readable on the first screen (${label})`, { skip: !chrome && 'Install Chrome or set CHROME_PATH', timeout: 180000 }, async t => {
    const server = serve();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await openBrowser();
    t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
    const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
    await browser.send('Page.enable');
    await browser.send('Emulation.setDeviceMetricsOverride', { width: screen.w, height: screen.h, deviceScaleFactor: 1, mobile: false });
    const settle = () => browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await browser.send('Page.navigate', { url });
    for (let n = 0; ; n++) {
      if (await browser.evaluate('!!(window.app && app.state.loaded && app.explorer)')) break;
      if (n > 200) throw new Error('The viewer never finished initializing');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await browser.evaluate('app.model.tables.length'), 0, 'Fresh profiles start with no selected model');
    await browser.evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Contoso Retail')&&button.textContent.includes('built-in')).click()");
    for (let n = 0; ; n++) {
      if (await browser.evaluate('app.modelKey==="builtin"&&app.model.tables.length===43')) break;
      if (n > 200) throw new Error('The selected bundled model never finished loading');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await settle();
    const floor = await browser.evaluate('app.canvas.ZOOM_FLOOR');
    assert.equal(floor, 0.25, 'the fit floor and the chip band floor are the same constant');

    await t.test('Explore all arranges, fits at or above the floor, and stacks nothing', async () => {
      await browser.evaluate("localStorage.clear(); app.canvas.pos = {}; app.canvas.setLayoutK(app.canvas.ZOOM_FLOOR); app.canvas.computeLayout(); app.explorer.showAll();");
      await settle();
      const view = await browser.evaluate(READ_VIEW);
      const algo = await browser.evaluate('app.canvas.lastLayout && app.canvas.lastLayout.algo');
      assert.equal(algo, 'star', 'Show all must arrange an unarranged model with the chosen layout');
      assert.equal(view.count, await browser.evaluate('app.model.tables.length'), 'every table stays on the canvas');
      assert.equal(view.chip, true, 'at this zoom the cards render as chips');
      assert.ok(view.zoom >= screen.minZoom - 1e-9, `${label}: Explore all fitted at ${view.zoom.toFixed(3)}, needs ${screen.minZoom} — extent ${view.extent.w}x${view.extent.h}`);
      /* the lanes were cut for the zoom the picture is shown at: a picture shown SMALLER than
         its lanes were cut for is exactly the step-4 regression */
      assert.ok(view.zoom >= view.layoutK - 1e-6, `shown at ${view.zoom} but laid out for ${view.layoutK}`);
      assert.equal(view.overlaps, 0, 'cards overlap on screen: ' + view.worst.join(', '));
      assert.ok(view.minFont >= 11, 'smallest on-screen table name was ' + view.minFont.toFixed(2) + 'px');
      assert.equal(view.clippedCount, 0, 'names lose their first two words: ' + view.clipped.join(', '));
      t.diagnostic(`${label} star :: fit ${(view.zoom * 100).toFixed(1)}% extent ${view.extent.w}x${view.extent.h} font ${view.minFont.toFixed(2)}px overlaps ${view.overlaps}`);
    });

    await t.test('every arrange algorithm lands with nothing stacked', async () => {
      const report = [];
      for (const algo of ALGOS) {
        await browser.evaluate(`app.canvas.setLayoutAlgo('${algo}'); app.explorer.arrangeSubset(true);`);
        await settle();
        const view = await browser.evaluate(READ_VIEW);
        report.push(`${algo} ${(view.zoom * 100).toFixed(1)}% ${view.extent.w}x${view.extent.h} font ${view.minFont.toFixed(1)}`);
        assert.equal(view.count, 43, algo + ' dropped a table');
        assert.equal(view.overlaps, 0, `${algo} overlaps on screen: ` + view.worst.join(', '));
        assert.ok(view.zoom >= floor - 1e-9, `${algo} fitted at ${view.zoom}`);
        assert.ok(view.zoom >= view.layoutK - 1e-6, `${algo} shown at ${view.zoom}, laid out for ${view.layoutK}`);
        assert.ok(view.minFont >= 11, `${algo} smallest name ${view.minFont.toFixed(2)}px`);
        assert.equal(view.clippedCount, 0, `${algo} names lose their first two words: ` + view.clipped.join(', '));
      }
      t.diagnostic(label + ' :: ' + report.join(' | '));
    });

    await t.test('a focused star opens at half zoom or better', async () => {
      await browser.evaluate(`app.canvas.setLayoutAlgo('star');
        app.canvas.selectTable('Sales');
        app.explorer.setFocus(true, 1);
        app.explorer.arrangeSubset(true);`);
      await settle();
      const view = await browser.evaluate(READ_VIEW);
      assert.ok(view.count > 1 && view.count < 43, 'the focus really did hide the unrelated tables (' + view.count + ' left)');
      assert.ok(view.zoom >= 0.5 - 1e-9, 'the focused star fitted at ' + view.zoom.toFixed(3));
      assert.equal(view.overlaps, 0, 'the focused star overlaps: ' + view.worst.join(', '));
      t.diagnostic(`${label} focused star :: ${view.count} tables at ${(view.zoom * 100).toFixed(1)}%`);
      await browser.evaluate('app.explorer.setFocus(false, 1); app.canvas.clearSelection();');
    });

    await t.test('names stay at 11px or better from the LOD threshold down to the floor', async () => {
      await browser.evaluate("localStorage.clear(); app.canvas.pos = {}; app.canvas.computeLayout(); app.explorer.showAll();");
      await settle();
      for (const k of [0.69, 0.5, 0.35, 0.25]) {
        await browser.evaluate('app.canvas.zoomTo(' + k + ')');
        await settle();
        const seen = await browser.evaluate(`(() => {
          const cv = app.canvas, k = cv.view.k;
          const names = Object.keys(cv.cards).filter(n => cv.cards[n].el.style.display !== 'none');
          const px = names.map(n => parseFloat(getComputedStyle(cv.cards[n].nm).fontSize) * k);
          return { k, min: Math.min(...px), max: Math.max(...px) };
        })()`);
        assert.ok(seen.min >= 11, 'at zoom ' + seen.k + ' the smallest name was ' + seen.min.toFixed(2) + 'px');
        assert.ok(seen.max <= 13, 'at zoom ' + seen.k + ' the largest name was ' + seen.max.toFixed(2) + 'px');
      }
      /* Below the floor the font stops growing, so a chip can never outgrow the lane that was
         cut for the floor. The reader down there is looking at shape, not at names. */
      const frozen = await browser.evaluate(`(() => {
        const cv = app.canvas, one = Object.keys(cv.cards)[0];
        const at = k => { cv.zoomTo(k); return parseFloat(getComputedStyle(cv.cards[one].nm).fontSize); };
        return { floor: at(0.25), under: at(0.15) };
      })()`);
      assert.equal(frozen.under, frozen.floor, 'the chip font kept growing below the floor');
    });

    await t.test('arrowheads are always drawn, cardinality pills only above 50%', async () => {
      const at = async k => {
        await browser.evaluate('app.canvas.zoomTo(' + k + '); app.canvas.renderLines();');
        await settle();
        // the relationship layer only — card icons are inline SVG under #canvas too
        return browser.evaluate("({arrows:app.canvas.svg.querySelectorAll('polyline').length, pills:app.canvas.svg.querySelectorAll('rect').length})");
      };
      const low = await at(0.3), high = await at(0.8);
      assert.ok(low.arrows > 0, 'the filter arrows survive a 30% zoom');
      assert.equal(low.pills, 0, 'cardinality pills are hidden below 50%');
      assert.ok(high.pills > 0, 'cardinality pills come back above 50%');
      assert.ok(high.arrows > 0);
    });
  });
}
