/* Real layout checks, using a private headless Chrome profile and the shipped CSS/JS.
   Run: node --test tests/measures-layout.browser.cjs
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
function fixture() {
  const css = fs.readFileSync(path.join(sourceRoot, 'measures.css'), 'utf8');
  const scripts = ['util.js', 'measures.js'].map(file => fs.readFileSync(path.join(sourceRoot, 'js', file), 'utf8')).join('\n');
  return `<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;height:100%;font-family:system-ui}button,input,select{font:inherit}${css}</style></head><body><div id="fixture" style="position:fixed;inset:64px 0 0"></div><script>${scripts.replace(/<\/script/gi, '<\\/script')}</script><script>
  const measures = [
    {name:'Base', dax:'SUM(Sales[Amount])', _deps:[]},
    {name:'Costs', dax:'SUM(Sales[Cost])', _deps:[]},
    {name:'Revenue', dax:'[Base] * 2', _deps:['Base']},
    {name:'Margin', dax:Array.from({length:32},(_,i)=>'VAR Step'+i+' = [Revenue] - [Costs]').join('\\n')+'\\nRETURN Step31', _deps:['Revenue','Costs'], _cols:[{t:'Sales',cs:['Amount']}]},
    {name:'Rate', dax:'DIVIDE([Margin], [Revenue])', _deps:['Margin','Revenue']}
  ];
  measures.forEach(m=>{m.folder='Finance';});
  const table={name:'Sales',measures,columns:[]};
  const model={tables:[table],byName:{Sales:table},msrHome:Object.fromEntries(measures.map(m=>[m.name,'Sales'])),msrUsedBy:{}};
  measures.forEach(m=>m._deps.forEach(d=>(model.msrUsedBy[d] ||= []).push(m.name)));
  window.app={model,modelKey:'layout-fixture',state:{loaded:true,viewMode:'measures',selMeasure:'Margin',mvOpen:{},gPin:'Base'},
    msrOf:n=>measures.find(m=>m.name===n),msrUse:()=>null,useTip:()=>'',tipFlags:()=>'',mvOpenFor:()=>({}),focusTable(){},
    setState(patch,cb){Object.assign(this.state,patch);window.view.update();if(cb)cb();}};
  window.view=new MeasuresView(app,document.getElementById('fixture'));view.update();
  window.box=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,clientWidth:el.clientWidth,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,scrollWidth:el.scrollWidth};};
  </script></body></html>`;
}

async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-measures-layout-'));
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

test('measure workspace occupies wide screens and persists adjustable layouts', { skip: !chrome && 'Install Chrome or set CHROME_PATH', timeout: 60000 }, async t => {
  const server = http.createServer((req,res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end(fixture()); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await openBrowser();
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  await browser.send('Page.enable');
  const settle = () => browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const load = async () => { await browser.send('Page.navigate',{url}); for (let n=0;n<100;n++) { if (await browser.evaluate('!!window.view')) return settle(); await new Promise(resolve=>setTimeout(resolve,20)); } throw new Error('Measure fixture failed to load'); };
  await load();
  for (const [width,height] of [[1280,720],[1920,1080],[2978,1440]]) {
    await t.test('DAX comparison uses both full columns at ' + width + 'px', async () => {
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await browser.evaluate("app.setState({gPin:'Base'}); view.setWorkspaceMode('dax');"); await settle();
      const result = await browser.evaluate(`({grid:box('.mv-dax-grid'), cards:[...document.querySelectorAll('.mv-dax-card')].map(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})), columns:getComputedStyle(document.querySelector('.mv-dax-grid')).gridTemplateColumns.split(' ')})`);
      assert.equal(result.columns.length,2);
      assert.equal(result.cards.length,2);
      assert.ok(result.cards[0].width > result.grid.clientWidth * .45, JSON.stringify(result));
      assert.ok(result.cards[1].right - result.cards[0].x >= result.grid.clientWidth - 26, JSON.stringify(result));
      assert.ok(result.grid.scrollHeight > result.grid.clientHeight || height > 1100, 'Long DAX remains scrollable');
      await browser.evaluate('app.setState({gPin:null})'); await settle();
      const single = await browser.evaluate(`({grid:box('.mv-dax-grid'),card:box('.mv-dax-card'),columns:getComputedStyle(document.querySelector('.mv-dax-grid')).gridTemplateColumns.split(' ')})`);
      assert.equal(single.columns.length,1); assert.ok(single.card.width >= single.grid.clientWidth-26);
    });
    await t.test('both split positions fit at ' + width + 'px', async () => {
      for (const layout of ['beside','below']) {
        await browser.evaluate(`view.setWorkspaceMode('split'); view.setSplitLayout('${layout}');`); await settle();
        const r = await browser.evaluate(`({body:box('.mv-analysis-body'),graph:box('.mv-graph-panel'),dax:box('.mv-dax-panel'),divider:box('.mv-split-divider'),layout:view._effectiveSplit})`);
        assert.equal(r.layout,layout);
        for (const pane of [r.graph,r.dax]) { assert.ok(pane.width>250 && pane.height>150,JSON.stringify(r)); assert.ok(pane.right <= r.body.right && pane.bottom <= r.body.bottom,JSON.stringify(r)); }
        if(layout==='beside') { assert.equal(r.graph.y,r.dax.y); assert.ok(r.dax.x>r.graph.right); }
        else { assert.equal(r.graph.x,r.dax.x); assert.ok(r.dax.y>r.graph.bottom); }
      }
    });
  }
  await t.test('Fit centers a small vertical graph and zoom still centers the selected node',async()=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await browser.evaluate("view.setWorkspaceMode('split'); view.setSplitLayout('below'); view.setGraphOrientation('bt'); view.fitGraph();"); await settle();
    const fitted = await browser.evaluate("({pane:box('.mv-graph-scroll'),frame:box('.mv-graph-frame')})");
    assert.ok(Math.abs(fitted.frame.x-fitted.pane.x-(fitted.pane.clientWidth-fitted.frame.width)/2)<1);
    assert.ok(Math.abs(fitted.frame.y-fitted.pane.y-(fitted.pane.clientHeight-fitted.frame.height)/2)<1);
    assert.equal(fitted.pane.scrollWidth,fitted.pane.clientWidth,'Fit creates no phantom horizontal scrolling');
    assert.equal(fitted.pane.scrollHeight,fitted.pane.clientHeight,'Fit creates no phantom vertical scrolling');
    await browser.evaluate("view.setGraphZoom(1); view.gCenter();"); await settle();
    await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))');
    const centered=await browser.evaluate("({pane:box('.mv-graph-scroll'),node:(()=>{const r=view._nodeEls.Margin.btn.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()})");
    assert.ok(Math.abs(centered.node.x+centered.node.width/2-centered.pane.x-centered.pane.clientWidth/2)<2);
    assert.ok(Math.abs(centered.node.y+centered.node.height/2-centered.pane.y-centered.pane.clientHeight/2)<2);
  });
  await t.test('divider supports pointer drag, keyboard resize and persistence',async()=>{
    await browser.evaluate("view.setSplitLayout('beside');"); await settle();
    const before = await browser.evaluate("({graph:box('.mv-graph-panel'),divider:box('.mv-split-divider')})");
    const x = before.divider.x+before.divider.width/2,y=before.divider.y+before.divider.height/2;
    await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+120,y,button:'left',buttons:1});
    await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+120,y,button:'left',clickCount:1}); await settle();
    const after = await browser.evaluate("box('.mv-graph-panel').width"); assert.ok(after>before.graph.width+100);
    await browser.evaluate("view.setSplitLayout('below'); document.querySelector('.mv-split-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); view.setGraphOrientation('bt'); view.wrapBtn.click();"); await settle();
    const prefs = await browser.evaluate("JSON.parse(localStorage.getItem('smv-measures-workspace-v1'))");
    assert.equal(prefs.split,'below'); assert.equal(prefs.orientation,'bt'); assert.equal(prefs.wrap,false); assert.ok(prefs.belowShare>.52); assert.ok(prefs.besideShare>.55);
    await load();
    const restored = await browser.evaluate('({layout:view._splitLayout,orientation:view._graphOrientation,wrap:view._wrapDax,shares:view._splitShares})');
    assert.equal(restored.layout,'below'); assert.equal(restored.orientation,'bt'); assert.equal(restored.wrap,false); assert.equal(restored.shares.below,prefs.belowShare);
  });
  await t.test('snapshot round-trip restores formulas, library, layout and viewport after a fresh document',async()=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await browser.evaluate("app.setState({selMeasure:'Margin',gPin:'Base',gExtra:{Rate:1},mvQuery:'Margin',mvFilter:'all',mvTable:'Sales',mvOpen:{Finance:true},mvW:340}); view.setWorkspaceMode('split'); view.setSplitLayout('beside'); view.setGraphOrientation('bt'); if(view._wrapDax)view.wrapBtn.click();"); await settle();
    await browser.evaluate("view.setGraphZoom(1.4); view.gScroll.scrollTo({left:170,top:210,behavior:'auto'});"); await settle();
    const saved=await browser.evaluate('JSON.parse(JSON.stringify(view.captureSnapshot()))');
    assert.ok(saved.graph.scrollLeft>0 && saved.graph.scrollTop>0,'Fixture captures a panned viewport');
    await load();
    const existingPrefs=await browser.evaluate("localStorage.getItem('smv-measures-workspace-v1')");
    assert.equal(await browser.evaluate('view.restoreSnapshot('+JSON.stringify(saved)+')'),true); await settle(); await settle();
    const restored=await browser.evaluate('JSON.parse(JSON.stringify(view.captureSnapshot()))');
    assert.equal(restored.selectedMeasure,saved.selectedMeasure); assert.equal(restored.comparisonMeasure,saved.comparisonMeasure);
    assert.deepEqual(restored.library,saved.library); assert.deepEqual(restored.preferences,saved.preferences); assert.deepEqual(restored.extraMeasures,saved.extraMeasures);
    assert.equal(restored.graph.zoom,saved.graph.zoom); assert.ok(Math.abs(restored.graph.scrollLeft-saved.graph.scrollLeft)<1); assert.ok(Math.abs(restored.graph.scrollTop-saved.graph.scrollTop)<1);
    assert.equal(await browser.evaluate("localStorage.getItem('smv-measures-workspace-v1')"),existingPrefs,'Opening a snapshot does not overwrite local preferences');
    assert.equal(await browser.evaluate("document.querySelectorAll('.mv-dax-card').length"),2);
    await browser.evaluate("[...document.querySelectorAll('.mv-comparison-card button')].find(button=>button.textContent==='Analyze this measure').click()"); await settle();
    assert.equal(await browser.evaluate('app.state.selMeasure'),'Base','Restored comparisons remain interactive');
    const daxOnly={...saved,preferences:{...saved.preferences,mode:'dax'}};
    await browser.evaluate('view.restoreSnapshot('+JSON.stringify(daxOnly)+')'); await settle();
    assert.equal(await browser.evaluate('!!view._snapshotViewport'),true,'DAX-only mode defers the hidden graph viewport');
    await browser.evaluate("view.setWorkspaceMode('split')"); await settle(); await settle();
    const revealed=await browser.evaluate('view.captureSnapshot().graph');
    assert.equal(revealed.zoom,saved.graph.zoom); assert.ok(Math.abs(revealed.scrollTop-saved.graph.scrollTop)<1);
    await browser.evaluate("app.setState({viewMode:'graph'})");
    await browser.evaluate('view.restoreSnapshot('+JSON.stringify(saved)+')');
    assert.equal(await browser.evaluate('app.state.viewMode'),'graph');
    await browser.evaluate("app.setState({viewMode:'measures'})"); await settle(); await settle();
    assert.equal(await browser.evaluate('view.captureSnapshot().graph.zoom'),saved.graph.zoom);
  });
  await t.test('top-level view switching preserves the measure viewport for a Matrix export',async()=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await browser.evaluate("app.setState({viewMode:'measures',selMeasure:'Margin',gPin:'Base'}); view.setWorkspaceMode('split'); view.setSplitLayout('beside'); view.setGraphOrientation('bt');"); await settle(); await settle();
    await browser.evaluate("view.setGraphZoom(1.2);view.gScroll.scrollTo({left:90,top:160,behavior:'auto'})");await settle();
    const expected=await browser.evaluate('view.captureSnapshot().graph');assert.equal(expected.zoom,1.2);
    for(const mode of ['graph','clusters','measures','matrix']) {
      await browser.evaluate('app.setState({viewMode:'+JSON.stringify(mode)+'})');await settle();await settle();
      const current=await browser.evaluate('view.captureSnapshot().graph');
      assert.equal(current.zoom,expected.zoom,mode);assert.ok(Math.abs(current.scrollLeft-expected.scrollLeft)<1,mode);assert.ok(Math.abs(current.scrollTop-expected.scrollTop)<1,mode);
    }
    assert.equal(await browser.evaluate('app.state.viewMode'),'matrix');
    await browser.evaluate("app.setState({viewMode:'measures'})");await settle();await settle();
  });
  await t.test('narrow workspace stacks gracefully without discarding the saved beside preference',async()=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width:900,height:720,deviceScaleFactor:1,mobile:false});
    await browser.evaluate("view.setSplitLayout('beside')"); await settle();
    assert.equal(await browser.evaluate('view._effectiveSplit'),'below');
    assert.equal(await browser.evaluate('view._splitLayout'),'beside');
    const bounds=await browser.evaluate("({body:box('.mv-analysis-body'),dax:box('.mv-dax-panel')})");
    assert.ok(bounds.dax.right<=bounds.body.right); assert.ok(bounds.dax.bottom<=bounds.body.bottom);
  });
});
