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
  const scripts = ['util.js', 'dax-format.js', 'measures.js'].map(file => fs.readFileSync(path.join(sourceRoot, 'js', file), 'utf8')).join('\n');
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
    tableColor:()=>'#3b82f6',msrOf:n=>measures.find(m=>m.name===n),msrUse:()=>null,useTip:()=>'',tipFlags:()=>'',mvOpenFor:()=>({}),focusTable(){},
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
  return { send, evaluate, async close() {
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
      const result = await browser.evaluate(`({grid:box('.mv-dax-grid'), cards:[...document.querySelectorAll('.mv-dax-card')].map(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})), bodyScrolls:[...document.querySelectorAll('.mv-dax-body')].some(b=>b.scrollHeight>b.clientHeight), columns:getComputedStyle(document.querySelector('.mv-dax-grid')).gridTemplateColumns.split(' ')})`);
      assert.equal(result.columns.length,2);
      assert.equal(result.cards.length,2);
      assert.ok(result.cards[0].width > result.grid.clientWidth * .45, JSON.stringify(result));
      assert.ok(result.cards[1].right - result.cards[0].x >= result.grid.clientWidth - 26, JSON.stringify(result));
      assert.ok(result.grid.scrollHeight > result.grid.clientHeight || result.bodyScrolls || height > 1100, 'Long DAX remains scrollable');
      await browser.evaluate('app.setState({gPin:null})'); await settle();
      const single = await browser.evaluate(`({grid:box('.mv-dax-grid'),card:box('.mv-dax-card'),columns:getComputedStyle(document.querySelector('.mv-dax-grid')).gridTemplateColumns.split(' ')})`);
      assert.equal(single.columns.length,1); assert.ok(single.card.width >= single.grid.clientWidth-26);
    });
    await t.test('both split positions fit at ' + width + 'px', async () => {
      for (const layout of ['beside','below']) {
        await browser.evaluate(`view.setWorkspaceMode('split'); view.setSplitLayout('${layout}');`); await settle();
        const r = await browser.evaluate(`({body:box('.mv-analysis-body'),graph:box('.mv-graph-panel'),dax:box('.mv-dax-panel'),divider:box('.mv-split-divider'),layout:view._effectiveSplit})`);
        assert.equal(r.layout,layout);
        for (const pane of [r.graph,r.dax]) {
          assert.ok(pane.width>250 && pane.height>150,JSON.stringify(r));
          assert.ok(pane.right <= r.body.right,JSON.stringify(r));
          if(layout==='beside') assert.ok(pane.bottom <= r.body.bottom,JSON.stringify(r));
          else assert.ok(pane.bottom <= r.body.y+r.body.scrollHeight,JSON.stringify(r));
        }
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
    const bounds=await browser.evaluate("({body:box('.mv-analysis-body'),dax:box('.mv-dax-panel'),graph:box('.mv-graph-scroll')})");
    assert.ok(bounds.dax.right<=bounds.body.right);
    assert.ok(bounds.graph.height>=240,'Stacked graph retains usable canvas height');
    assert.ok(bounds.dax.height>=320,'DAX remains usable below the graph');
    assert.equal(await browser.evaluate('view.splitSelect.selectedOptions[0].textContent'),'DAX below graph (narrow view)');
    await browser.evaluate('view.analysisBody.scrollTop=view.analysisBody.scrollHeight');await settle();
    assert.equal(await browser.evaluate("box('.mv-dax-panel').bottom<=box('.mv-analysis-body').bottom"),true,'DAX is reachable by scrolling');
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await settle();await settle();
    assert.equal(await browser.evaluate('view._effectiveSplit'),'beside');
    assert.equal(await browser.evaluate('view.splitSelect.selectedOptions[0].textContent'),'DAX beside graph');
  });
});

test('table/column dependency flow works in the complete viewer', { skip: !chrome && 'Install Chrome or set CHROME_PATH', timeout: 60000 }, async t => {
  const server = http.createServer((req,res) => {
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.join(sourceRoot,pathname==='/'?'index.html':pathname);
    if (!file.startsWith(sourceRoot+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await openBrowser();
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
  for(let n=0;n<150;n++) {
    if(await browser.evaluate('!!window.app && app.state.loaded')) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const settle=()=>browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await browser.evaluate(`(()=>{
    window.errors=[];window.addEventListener('error',e=>errors.push(e.message));
    app._applyModel({name:'Sources',tables:[
      {name:'Sales',domain:'Commercial',source:{kind:'manual'},columns:[{name:'Amount'},{name:'Unused'}],measures:[]},
      {name:'Measures',domain:'Measures',source:{kind:'manual'},columns:[],measures:[
        {name:'Revenue',dax:'SUM(Sales[Amount])'}, {name:'Rows',dax:'COUNTROWS(Sales)'}, {name:'Average',dax:'DIVIDE([Revenue],[Rows])'}
      ]}],relationships:[]},'Sources','source-test',{persist:false});
    app.setState({viewMode:'measures'});app.measures.pickMeasure('Average');app.measures.setShowSources(false);
  })()`); await settle();
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-source-card').length"),0);
  await browser.evaluate("document.querySelector('.mv-source-controls input').click()");await settle();
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-source-column')].map(el=>el.textContent)"),['Amount']);
  assert.equal(await browser.evaluate("[...document.querySelectorAll('.mv-source-edge-label')].some(el=>el.textContent==='Whole table')"),true);
  await browser.evaluate("document.querySelector('.mv-source-column').click()");await settle();
  assert.deepEqual(await browser.evaluate("app.state.dependencySource"),{table:'Sales',column:'Amount'});
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-library-row[data-mv-row^=\"impact:\"] .mv-row-name')].map(el=>el.textContent)"),['Revenue','Average']);
  assert.equal(await browser.evaluate("document.querySelector('.mv-analysis-body').dataset.mode"),'graph','Source graph uses available width before inspecting a measure');
  await browser.evaluate("document.querySelector('[data-mv-row=\"impact:Average\"]').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelector('.mv-analysis-body').dataset.mode"),'split');
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-impact-row').length"),0,'No duplicate results in DAX');
  assert.equal(await browser.evaluate("document.querySelector('.mv-dax-card h3').textContent"),'Average');
  await browser.evaluate("[...document.querySelectorAll('.mv-dax-card button')].find(b=>b.textContent==='Inline measures').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelector('.mv-dax-body').textContent.includes('COUNTROWS')"),true);
  assert.equal(await browser.evaluate("document.querySelector('.mv-card-references').dataset.referenceScope"),'expanded');
  assert.equal(await browser.evaluate("document.querySelector('.mv-card-references').textContent.includes('Sales[Amount]')"),true);
  assert.equal(await browser.evaluate("document.querySelector('.mv-card-references').textContent.includes('Whole tables (1)')"),true);
  assert.deepEqual(await browser.evaluate('app.state.dependencySource'),{table:'Sales',column:'Amount'});
  await browser.evaluate("[...document.querySelectorAll('.mv-dax-card button')].find(b=>b.textContent==='Inline measures').click()");await settle();
  await browser.evaluate("app.measures.directInput.click()");await settle();
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-library-row[data-mv-row^=\"impact:\"] .mv-row-name')].map(el=>el.textContent)"),['Revenue']);
  await browser.evaluate("document.querySelector('.mv-source-header').click()");await settle();
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-library-row[data-mv-row^=\"impact:\"] .mv-row-name')].map(el=>el.textContent)"),['Revenue','Rows','Average']);
  await browser.evaluate("window.saved=app.measures.captureSnapshot();app.measures.pickMeasure('Average')");await settle();
  await browser.evaluate("app.measures.restoreSnapshot(saved)");await settle();
  assert.deepEqual(await browser.evaluate('app.state.dependencySource'),{table:'Sales',column:null});
  for(const orientation of ['lr','tb','bt']) {
    await browser.evaluate(`app.measures.setGraphOrientation('${orientation}');app.measures.fitGraph()`);await settle();
    assert.equal(await browser.evaluate("document.querySelectorAll('.mv-source-card').length"),1);
  }
  await browser.evaluate("app.focusTable('Sales')");await settle();
  assert.equal(await browser.evaluate("[...document.querySelectorAll('#drawer button')].some(b=>b.textContent==='Find dependent measures')"),true);
  await browser.evaluate("[...document.querySelectorAll('#drawer button')].find(b=>b.textContent==='Find dependent measures').click()");await settle();
  assert.equal(await browser.evaluate('app.state.viewMode'),'measures');
  await browser.evaluate("app.measures.setLibraryMode('sources');app.setState({mvSourceQuery:'Sales'})");await settle();
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-source-choice-column')].map(e=>e.textContent)"),['Amount','Unused']);
  await browser.evaluate("document.querySelector('[aria-label=\"Use column Sales[Unused]\"]').click()");await settle();
  assert.equal(await browser.evaluate("app.measures.rowsEl.textContent.includes('No dependent measures detected')"),true);
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-source-column').length"),1,'Selected unused column stays visible');
  await browser.evaluate("app.measures.setLibraryMode('sources')");await settle();
  await browser.evaluate("document.querySelector('[aria-label=\"Use whole table Sales\"]').click()");await settle();
  assert.deepEqual(await browser.evaluate('app.state.dependencySource'),{table:'Sales',column:null});
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mv-source-column')].map(e=>e.textContent)"),['Amount'],'Only connected columns enter the graph');
  await t.test('dense source analysis keeps a usable stacked canvas in both themes',async()=>{
    await browser.evaluate(`(()=>{
      const name='Work Order Maintenance (IW_49n)';
      app._applyModel({name:'Narrow source regression',tables:[
        {name,domain:'Operations',source:{kind:'manual'},columns:[{name:'work_order_id'}],measures:[]},
        {name:'Measures',domain:'Operations',source:{kind:'manual'},columns:[],measures:Array.from({length:26},(_,i)=>({name:'Dependent '+i,dax:"COUNT('"+name+"'[work_order_id])"}))}
      ],relationships:[]},'Narrow source regression','narrow-source-test',{persist:false});
      app.measures.analyzeSource(name,'work_order_id');
      app.setState({gPin:'Dependent 0'});
      app.measures.setWorkspaceMode('split');app.measures.setSplitLayout('beside');app.measures.setGraphOrientation('tb');
    })()`);await settle();
    for(const theme of ['classic','spellbook']) {
      await browser.evaluate(`ViewerTheme.set('${theme}')`);
      for(const [width,height] of [[720,800],[900,720]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await settle();await settle();
        await browser.evaluate('app.measures.fitGraph()');await settle();
        const r=await browser.evaluate(`(()=>{
          const v=app.measures,b=v.analysisBody,g=v.gScroll;
          return {height:g.clientHeight,zoom:v._gZoom,label:v.splitSelect.selectedOptions[0].textContent,overflow:getComputedStyle(b).overflowY,scrolls:b.scrollHeight>b.clientHeight};
        })()`);
        assert.ok(r.height>=240,JSON.stringify({theme,width,...r}));
        assert.ok(r.zoom>.05,'Fit must not collapse this 26-measure fixture to 2%: '+JSON.stringify(r));
        assert.equal(r.label,'DAX below graph (narrow view)');
        assert.equal(r.overflow,'auto');assert.equal(r.scrolls,true);
        await browser.evaluate('app.measures.analysisBody.scrollTop=app.measures.analysisBody.scrollHeight');await settle();
        assert.equal(await browser.evaluate(`(()=>{const b=app.measures.analysisBody.getBoundingClientRect(),d=document.querySelector('.mv-dax-panel').getBoundingClientRect();return d.bottom<=b.bottom && d.bottom>b.top})()`),true);
      }
    }
    await browser.evaluate("app.measures.setSplitLayout('below')");await settle();
    assert.equal(await browser.evaluate('app.measures.splitSelect.selectedOptions[0].textContent'),'DAX below graph');
  });
  await t.test('table hover controls do not resize a long-name card',async()=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await browser.evaluate(`(()=>{
      const name='Sales transactions with a deliberately long descriptive table name';
      app._applyModel({name:'Hover regression',tables:[
        {name,domain:'Commercial',source:{kind:'manual'},columns:[{name:'Amount'}],measures:[]}
      ],relationships:[]},'Hover regression','hover-regression',{persist:false});
      app.explorer.showAll();
      app.setViewMode('graph');
    })()`);await settle();
    const heights=await browser.evaluate(`(()=>{
      const card=Object.values(app.canvas.cards)[0].el;
      const before=card.getBoundingClientRect().height;
      card.dispatchEvent(new MouseEvent('mouseenter'));
      const hovered=card.getBoundingClientRect().height;
      card.dispatchEvent(new MouseEvent('mouseleave'));
      return {before,hovered,after:card.getBoundingClientRect().height};
    })()`);
    assert.ok(heights.before>0);
    assert.equal(heights.hovered,heights.before);
    assert.equal(heights.after,heights.before);
  });
  assert.deepEqual(await browser.evaluate('window.errors'),[]);
});

test('search preserves the overview and opens optional colored DAX results', { skip: !chrome && 'Install Chrome or set CHROME_PATH', timeout: 60000 }, async t => {
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.join(sourceRoot,pathname==='/'?'index.html':pathname);
    if(!file.startsWith(sourceRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await openBrowser();
  t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
  const settle=()=>browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await browser.send('Page.enable');await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
  for(let i=0;i<150;i++){if(await browser.evaluate('!!window.app && app.state.loaded'))break;await new Promise(r=>setTimeout(r,20));}
  await browser.evaluate(`app._applyModel({name:'Search',tables:[{name:'Sales',source:{kind:'manual'},columns:[{name:'Amount'}],measures:[
    {name:'Revenue',dax:'SUM(Sales[Amount])',folder:'Finance;Operations'},
    {name:'Rows',dax:'COUNTROWS(Sales)'},
    {name:'Average',dax:'DIVIDE([Revenue], [Rows])',h:true}
  ]}],relationships:[]},'Search','search-test',{persist:false});app.setState({viewMode:'measures',selMeasure:null,mvQuery:'Revenue'});`);await settle();
  assert.equal(await browser.evaluate("document.querySelector('.mv-overview h1').textContent"),'Understand the logic behind your model.');
  assert.equal(await browser.evaluate("document.querySelector('.mv-search-summary span').textContent"),'2 matching measures','Duplicate folder entries count once');
  assert.equal(await browser.evaluate("!!document.querySelector('dialog[open]')"),false);
  await browser.evaluate("document.querySelector('.mv-search-summary button').focus();document.querySelector('.mv-search-summary button').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelector('dialog[open] h2').textContent"),'2 matching measures');
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-result-card').length"),2);
  assert.ok(await browser.evaluate("new Set([...document.querySelectorAll('.mv-result-card .mv-dax-body span,.mv-result-card .mv-dax-ref')].map(e=>getComputedStyle(e).color)).size>=2"),'DAX uses the shared syntax colors');
  for(const theme of ['classic','spellbook']){
    await browser.evaluate(`ViewerTheme.set('${theme}')`);
    for(const width of [1440,680]){
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});await settle();
      const geometry=await browser.evaluate("(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:d.scrollWidth>d.clientWidth,cols:getComputedStyle(document.querySelector('.mv-results-grid')).gridTemplateColumns.split(' ').length}})()");
      assert.ok(geometry.left>=0&&geometry.right<=geometry.width,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
      assert.equal(geometry.cols,width===680?1:2);
    }
  }
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();
  assert.equal(await browser.evaluate("!!document.querySelector('dialog[open]')"),false);
  assert.equal(await browser.evaluate("document.activeElement===document.querySelector('.mv-search-summary button')"),true);
  await browser.evaluate("document.querySelector('.mv-search-summary button').click();[...document.querySelectorAll('.mv-result-card .mv-dax-ref')].find(b=>b.textContent==='[Revenue]').click()");await settle();
  assert.equal(await browser.evaluate('app.state.selMeasure'),'Revenue');
  assert.equal(await browser.evaluate("!!document.querySelector('dialog[open]')"),false);
  await browser.evaluate("app.setState({selMeasure:null,mvQuery:'not-a-measure'})");await settle();
  await browser.evaluate("document.querySelector('.mv-search-summary button').focus();document.querySelector('.mv-search-summary button').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelector('dialog h2').textContent"),'0 matching measures');
  assert.ok(await browser.evaluate("document.querySelector('.mv-results-empty').textContent.includes('No measures match')"));
  await browser.evaluate("document.querySelector('dialog button').click();app.setState({selMeasure:null,mvQuery:'',mvFilter:'hidden'})");await settle();
  assert.equal(await browser.evaluate("document.querySelector('.mv-search-summary span').textContent"),'1 matching measure');
  await browser.evaluate("document.querySelector('.mv-search-summary button').click();document.querySelector('.mv-result-card .mv-button').click()");await settle();
  assert.equal(await browser.evaluate('app.state.selMeasure'),'Average');
  await browser.evaluate(`app._applyModel({name:'Many',tables:[{name:'Sales',source:{kind:'manual'},columns:[],measures:Array.from({length:45},(_,i)=>({name:'Match '+i,dax:'1'}))}],relationships:[]},'Many','many-test',{persist:false});app.setState({viewMode:'measures',selMeasure:null,mvQuery:'Match',mvFilter:'all'});`);await settle();
  await browser.evaluate("document.querySelector('.mv-search-summary button').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-result-card').length"),40);
  await browser.evaluate("document.querySelector('.mv-results-more').click()");await settle();
  assert.equal(await browser.evaluate("document.querySelectorAll('.mv-result-card').length"),45);
  assert.equal(await browser.evaluate("document.querySelector('.mv-results-more').hidden"),true);
  await browser.evaluate("app.setState({viewMode:'matrix'})");await settle();
  assert.equal(await browser.evaluate("!!document.querySelector('dialog[open]')"),false,'Changing views closes the results');
});
