'use strict';
/* The readability bar for answer views (docs/qa/diagram-readability.md), measured in a real
   browser on the views `smv show` opens: every table and measure name renders at 11px or
   larger on first open, the focus and its direct neighbours are on screen, and the diagram
   gets the pane rather than the chrome around it. Zoom % is reported, never judged — with
   name chips it no longer predicts text size.
   Run: node --test tests/diagram-readability.browser.cjs */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {browserPath}=require('../Models/tools/viewer/scripts/cli/capture.cjs');
let chrome;try{chrome=browserPath();}catch(e){if(process.env.CI)throw e;}
const root=path.resolve(__dirname,'..'),model=path.join(root,'Models/demo/Contoso Retail.SemanticModel');
const READABLE=11;

async function openBrowser(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'smv-readability-'));
  const child=spawn(chrome,['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Chrome did not start: '+out)),15000);child.stderr.on('data',c=>{out+=c;const m=out.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Chrome exited: '+code+' '+out));});});
  const targets=await (await fetch('http://127.0.0.1:'+new URL(endpoint).port+'/json/list')).json();
  const socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let id=0;const waiting=new Map();
  const api={};
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown'&&api.onException){const x=data.params.exceptionDetails;api.onException((x.exception&&x.exception.description||x.text||'').split('\n')[0]);}const p=data.id&&waiting.get(data.id);if(!p)return;waiting.delete(data.id);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;waiting.set(seq,{resolve,reject});socket.send(JSON.stringify({id:seq,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value;};
  return Object.assign(api,{send,evaluate,async close(){socket.close();child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});}});
}

/* A link crossing a measure box it does not connect: every segment of its path (corner
   control points included) against every other node's box, shrunk by 2px. */
const CROSSINGS=`m=>{
    const L=m._gC&&m._gC.g;if(!L)return [];const boxes=L.names.map(n=>Object.assign({n},L.xy[n])).filter(b=>b.w);const found=[];
    L.geo.forEach(e=>{if(e.back)return;const p=[...String(e.d).matchAll(/(-?[0-9.]+),(-?[0-9.]+)/g)].map(q=>[+q[1],+q[2]]);
      for(let i=1;i<p.length;i++){const [x1,y1]=p[i-1],[x2,y2]=p[i];for(const b of boxes){if(b.n===e.a||b.n===e.b)continue;const l=b.x+2,r=b.x+b.w-2,t=b.y+2,u=b.y+32;
        if(Math.max(x1,x2)<l||Math.min(x1,x2)>r||Math.max(y1,y2)<t||Math.min(y1,y2)>u)continue;
        const steps=20;for(let k=0;k<=steps;k++){const x=x1+(x2-x1)*k/steps,y=y1+(y2-y1)*k/steps;if(x>l&&x<r&&y>t&&y<u){found.push(e.a+' → '+e.b+' crosses '+b.n);k=steps+1;}}}}});
    return [...new Set(found)].slice(0,5);}`;
/* Reads every viewer on the page (the workspace's iframes, or the page itself) once each
   has applied its view. Text size is the computed font of the element carrying the name,
   times the zoom it is drawn at. */
const READ=`(async()=>{
  const frames=[...document.querySelectorAll('iframe')].filter(f=>f.getClientRects().length);
  const wins=frames.length?frames.map(f=>({w:f.contentWindow,r:f.getBoundingClientRect()})):[{w:window,r:{width:innerWidth,height:innerHeight}}];
  for(const {w} of wins)for(let i=0;i<300&&!(w.document.body&&w.document.body.dataset.smvReady==='1');i++)await new Promise(r=>setTimeout(r,50));
  await new Promise(r=>setTimeout(r,700));
  for(const {w} of wins)w.SMV_LINK_CROSSINGS=${CROSSINGS};
  const shown=(w,sel)=>{const n=w.document.querySelector(sel);return !!n&&!n.hidden&&n.getClientRects().length>0;};
  return {workspace:frames.length?{pickers:[...document.querySelectorAll('section select')].filter(s=>s.getClientRects().length).length,panes:frames.length,layout:document.body.dataset.layout,choice:!!document.querySelector('#split')&&document.querySelector('#split').getClientRects().length>0,tabs:[...document.querySelectorAll('#tabs-bar button')].filter(b=>b.getClientRects().length).map(b=>b.textContent)}:null,panes:wins.map(({w,r})=>{
    const app=w.app,out={pane:[Math.round(r.width),Math.round(r.height)],mode:app.state.viewMode,caption:!!w.document.getElementById('smv-question-caption')};
    if(app.state.viewMode==='measures'){
      const m=app.measures,z=m._gZoom||1,s=m.gScroll.getBoundingClientRect(),G=m._g;
      const names=Object.keys(m._nodeEls||{}),px=names.map(n=>parseFloat(w.getComputedStyle(m._nodeEls[n].btn).fontSize)*z);
      const inside=el=>{const b=el.getBoundingClientRect();return b.left>=s.left-1&&b.right<=s.right+1&&b.top>=s.top-1&&b.bottom<=s.bottom+1;};
      const source=w.document.querySelector('.mv-source-card,.mv-graph-canvas [data-source-key]');
      const rootEl=m._nodeEls[G.root]?m._nodeEls[G.root].btn:source;
      Object.assign(out,{zoom:+z.toFixed(3),graph:[Math.round(s.width),Math.round(s.height)],nodes:names.length,minPx:Math.min(...px),rootVisible:!!rootEl&&inside(rootEl),header:Math.round(w.document.querySelector('.mv-analysis-header').getBoundingClientRect().height),
        orientation:m._gC.g.orientation,sideways:m.gScroll.scrollWidth>m.gScroll.clientWidth+1,crossings:w.SMV_LINK_CROSSINGS(m)});
    }else{
      const cv=app.canvas,k=cv.view.k,hb=cv.host.getBoundingClientRect(),vp=cv.viewportRect();
      const names=Object.keys(cv.cards).filter(n=>cv.cards[n].el.style.display!=='none');
      const px=names.map(n=>parseFloat(w.getComputedStyle(cv.cards[n].nm).fontSize)*k);
      const outside=names.filter(n=>{const q=cv.cards[n].el.getBoundingClientRect();return q.left<hb.left+vp.x-2||q.right>hb.left+vp.x+vp.w+2||q.top<hb.top+vp.y-2||q.bottom>hb.top+vp.y+vp.h+2;});
      Object.assign(out,{zoom:+k.toFixed(3),chips:!!cv._chip,cards:names.length,minPx:Math.min(...px),outside,canvas:[Math.round(hb.width),Math.round(hb.height)],
        chrome:{library:shown(w,'#table-library'),toolbar:shown(w,'#workspace-toolbar'),legend:shown(w,'#canvas-legend'),map:shown(w,'#model-minimap'),status:shown(w,'#workspace-status'),inspector:!!w.document.querySelector('#drawer>div')}});
    }
    return out;
  })};
})()`;

function checkPane(p,where){
  assert.equal(p.caption,false,where+': the answer text belongs in the chat, not above the diagram');
  assert.ok(p.minPx>=READABLE-0.05,where+': names render at '+p.minPx.toFixed(2)+'px');
  if(p.mode==='measures'){
    assert.ok(p.rootVisible,where+': the analyzed node is on screen');
    assert.ok(p.graph[1]>=p.pane[1]*0.6,where+': the graph gets '+p.graph[1]+' of '+p.pane[1]+'px');
    assert.ok(p.header<=96,where+': the header takes '+p.header+'px');
    // Top to bottom routes every link through open space. Left to right still lets a link
    // that skips a layer curve over the boxes in between; that is reported, not judged here.
    if(p.orientation==='tb')assert.deepEqual(p.crossings,[],where+': links cross measures they do not connect');
    // A narrow pane reads top to bottom and only ever scrolls down.
    if(p.pane[0]<760){assert.equal(p.orientation,'tb',where+': narrow pane direction');assert.equal(p.sideways,false,where+': the flow scrolls sideways');}
  }else{
    assert.deepEqual(p.outside,[],where+': tables outside the visible canvas');
    assert.deepEqual(p.chrome,{library:false,toolbar:false,legend:false,map:false,status:false,inspector:false},where+': only the diagram and its zoom bar are open');
    assert.ok(p.canvas[1]>=p.pane[1]*0.75,where+': the canvas gets '+p.canvas[1]+' of '+p.pane[1]+'px');
  }
}

test('answer views from smv show meet the readability bar',{skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:300000},async t=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'smv-readability-state-')),env={...process.env,SMV_STATE_DIR:state,SMV_OPENER:'none'};
  const smv=args=>{const r=spawnSync(process.execPath,[path.join(root,'bin/smv.cjs'),...args],{cwd:root,env,encoding:'utf8',timeout:60000});if(r.status)throw new Error(r.stderr||r.stdout);return r.stdout;};
  const browser=await openBrowser();
  t.after(async()=>{await browser.close();try{smv(['session','stop','--all']);}catch{}fs.rmSync(state,{recursive:true,force:true});});
  await browser.send('Page.enable');
  const open=async(url,w,h)=>{await browser.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});await browser.send('Page.navigate',{url});for(let i=0;i<200&&!(await browser.evaluate("document.readyState==='complete'"));i++)await new Promise(r=>setTimeout(r,50));return browser.evaluate(READ);};
  // Inventory is the reported case: a chain-shaped star and a three-layer flow. Sales is the dense one.
  for(const table of ['Inventory','Sales']){
    const shown=JSON.parse(smv(['show',model,'--table',table,'--new-session','--open','none','--json']));
    assert.equal(shown.views.length,2);
    assert.ok(shown.views[0].answer&&shown.views[1].answer,'the answer still reaches the agent');
    /* Below 1100px a side-by-side pane would be under ~540px: the workspace shows one view
       at a time, full width, with a named tab for each, and offers no side by side. */
    {
      const r=await open(shown.workspaceUrl,1000,800);
      assert.equal(r.workspace.layout,'tabs','a 1000px window shows tabs');
      assert.equal(r.workspace.choice,false,'side by side is not offered below 1100px');
      assert.deepEqual(r.workspace.tabs,shown.views.map(v=>v.label),'one named tab per view');
      assert.equal(r.panes.length,1);assert.ok(r.panes[0].pane[0]>=960,'the view gets the full width');
      checkPane(r.panes[0],`${table} tabs 1000x800 view 0`);
      await browser.evaluate("document.querySelectorAll('#tabs-bar button')[1].click()");
      const second=(await browser.evaluate(READ)).panes;
      assert.equal(second.length,1);assert.equal(second[0].mode,'measures','the second tab shows the other view');
      checkPane(second[0],`${table} tabs 1000x800 view 1`);
      t.diagnostic(`${table} tabs 1000x800: ${r.panes[0].mode} names ${r.panes[0].minPx.toFixed(1)}px, ${second[0].mode} names ${second[0].minPx.toFixed(1)}px`);
    }
    for(const [w,h] of [[1100,800],[1280,720],[1920,1080]]){
      const r=await open(shown.workspaceUrl,w,h);
      assert.equal(r.workspace.layout,'split',w+'px offers side by side');
      assert.equal(r.workspace.pickers,0,'two views fill two panes without view pickers');
      r.panes.forEach((p,i)=>{checkPane(p,`${table} side by side ${w}x${h} pane ${i}`);t.diagnostic(`${table} side by side ${w}x${h} ${p.mode}: zoom ${(p.zoom*100).toFixed(0)}%, names ${p.minPx.toFixed(1)}px${p.orientation?', '+p.orientation+(p.crossings.length?', '+p.crossings.length+'+ crossings':''):''}`);});
    }
    for(const [w,h] of [[1280,720],[1920,1080]])for(const i of [0,1]){
      const [p]=(await open(shown.views[i].url,w,h)).panes;
      checkPane(p,`${table} view ${i} ${w}x${h}`);t.diagnostic(`${table} ${p.mode} ${w}x${h}: zoom ${(p.zoom*100).toFixed(0)}%, names ${p.minPx.toFixed(1)}px${p.orientation?', '+p.orientation+(p.crossings.length?', '+p.crossings.length+'+ crossings':''):''}`);
    }
  }
  await t.test('Tools brings the editing chrome back on demand',async()=>{
    const r=await browser.evaluate(`(async()=>{app.setViewMode('graph');await new Promise(r=>setTimeout(r,200));const t=[...document.querySelectorAll('#canvas-navigation button')].find(b=>b.textContent==='Tools');if(!t)throw new Error('no Tools button');t.click();await new Promise(r=>setTimeout(r,200));return {toolbar:!document.getElementById('workspace-toolbar').hidden,expanded:[...document.querySelectorAll('#canvas-navigation button')].find(b=>b.textContent==='Tools').getAttribute('aria-expanded'),legend:[...document.querySelectorAll('#canvas-navigation label')].some(l=>l.textContent.includes('Legend'))};})()`);
    assert.deepEqual(r,{toolbar:true,expanded:'true',legend:true});
  });
});

const viewer=path.join(root,'Models/tools/viewer'),TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
/* The size rules are the app's, not the CLI's: at 1280x720 the legend dock, overview map and
   status line stand down, the canvas bar keeps to one row with the display switches behind
   View, the Measures header is one row, and a narrow dependency pane reads top to bottom
   with no link through a measure. */
test('the main app gives a small screen to the diagram',{skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:180000},async t=>{
  const server=require('node:http').createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]),file=path.join(viewer,name==='/'?'index.html':name);if(!file.startsWith(viewer)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':TYPES[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await openBrowser();t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
  const wait=async(expr,what)=>{for(let n=0;!(await browser.evaluate(expr));n++){if(n>300)throw new Error(what);await new Promise(r=>setTimeout(r,25));}};
  const settle=()=>browser.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,250))))');
  await browser.send('Page.enable');await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
  await wait('!!(window.app&&app.state.loaded&&app.explorer)','viewer never initialized');
  await browser.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Try the demo').click()");
  await wait('app.modelKey==="builtin"&&app.model.tables.length===43','demo never loaded');
  await browser.evaluate("localStorage.removeItem('smv_panes_v1');app.explorer.legendOpen=true;app.explorer.mapHidden=false;app.explorer.showAll();app.canvas.selectTable('Sales');");await settle();
  const tables=await browser.evaluate(`(()=>{const shown=s=>{const n=document.querySelector(s);return !!n&&!n.hidden&&n.getClientRects().length>0;};const nav=document.getElementById('canvas-navigation');
    return {legend:shown('#canvas-legend'),map:shown('#model-minimap'),status:shown('#workspace-status'),navHeight:Math.round(nav.getBoundingClientRect().height),view:[...nav.querySelectorAll('button')].some(b=>b.textContent==='View'),focus:[...nav.querySelectorAll('button')].some(b=>b.textContent==='Focus')};})()`);
  assert.deepEqual({legend:tables.legend,map:tables.map,status:tables.status,view:tables.view,focus:tables.focus},{legend:false,map:false,status:false,view:true,focus:true},'small-screen Tables chrome');
  assert.ok(tables.navHeight<=56,'the canvas bar is one row ('+tables.navHeight+'px)');
  // Switching the legend on is honoured even while the window is small.
  await browser.evaluate("app.explorer.toggleLegend();");await settle();
  assert.equal(await browser.evaluate("!document.getElementById('canvas-legend').hidden"),true,'an explicit Legend switch wins');
  await browser.evaluate("app.explorer.toggleLegend();app.setViewMode('measures');app.measures.pickMeasure('Total Sales');");await settle();await settle();
  const measures=await browser.evaluate(`(()=>{const m=app.measures;return {compact:!!document.querySelector('.mv-analysis-header.mv-compact'),pane:m.gScroll.clientWidth,orientation:m._gC.g.orientation,sideways:m.gScroll.scrollWidth>m.gScroll.clientWidth+1,crossings:(${CROSSINGS})(m)};})()`);
  t.diagnostic('1280x720 measures pane '+measures.pane+'px, '+measures.orientation);
  assert.equal(measures.compact,true,'one-row Measures header');
  if(measures.pane<760){assert.equal(measures.orientation,'tb');assert.equal(measures.sideways,false,'the flow scrolls sideways');}
  if(measures.orientation==='tb')assert.deepEqual(measures.crossings,[],'links cross measures they do not connect');
});

/* Every control, pressed with real mouse events at its on-screen position, in the workspace
   panes. After each step the picture must still be whole: no two tables on top of each
   other, the focus on screen, names readable at the opening zoom, no link through a measure
   in top-to-bottom flows, and no script error in either pane. */
test('every control keeps the answer views whole',{skip:!chrome&&'Install Chrome or set CHROME_PATH',timeout:300000},async t=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'smv-interact-state-')),env={...process.env,SMV_STATE_DIR:state,SMV_OPENER:'none'};
  const smv=args=>{const r=spawnSync(process.execPath,[path.join(root,'bin/smv.cjs'),...args],{cwd:root,env,encoding:'utf8',timeout:60000});if(r.status)throw new Error(r.stderr||r.stdout);return r.stdout;};
  const browser=await openBrowser();
  t.after(async()=>{await browser.close();try{smv(['session','stop','--all']);}catch{}fs.rmSync(state,{recursive:true,force:true});});
  const errors=[];
  await browser.send('Page.enable');await browser.send('Runtime.enable');
  const shown=JSON.parse(smv(['show',model,'--table','Inventory','--new-session','--open','none','--json']));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const pane=i=>`document.querySelectorAll('iframe')[${i}]`;
  /* A real click: the element's centre in page coordinates (iframe offset included). */
  const click=async(i,finder,what)=>{
    const at=await browser.evaluate(`(()=>{const f=${pane(i)},o=f.getBoundingClientRect(),w=f.contentWindow,d=w.document;const el=(${finder})(d,w);if(!el)return null;el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return {x:o.left+r.left+r.width/2,y:o.top+r.top+r.height/2,w:r.width,h:r.height};})()`);
    assert.ok(at&&at.w>0&&at.h>0,'nothing visible to press: '+what);
    for(const type of ['mouseMoved','mousePressed','mouseReleased'])await browser.send('Input.dispatchMouseEvent',{type,x:at.x,y:at.y,button:'left',clickCount:1});
    await sleep(450);
  };
  const button=(text,scope='#canvas-navigation')=>`(d)=>[...d.querySelectorAll('${scope} button')].find(b=>b.textContent===${JSON.stringify(text)}&&b.getClientRects().length)`;
  const card=name=>`(d,w)=>w.app.canvas.cards[${JSON.stringify(name)}].head`;
  const tables=async i=>browser.evaluate(`(()=>{const w=${pane(i)}.contentWindow,cv=w.app.canvas,host=cv.host.getBoundingClientRect();
    const vis=Object.keys(cv.cards).filter(n=>cv.cards[n].el.style.display!=='none'),R=vis.map(n=>({n,r:cv.cards[n].el.getBoundingClientRect()})),hits=[];
    for(let a=0;a<R.length;a++)for(let b=a+1;b<R.length;b++){const p=R[a].r,q=R[b].r;if(p.left<q.right-1&&q.left<p.right-1&&p.top<q.bottom-1&&q.top<p.bottom-1)hits.push(R[a].n+' / '+R[b].n);}
    const off=R.filter(({r})=>r.right<host.left||r.left>host.right||r.bottom<host.top||r.top>host.bottom).map(x=>x.n);
    const px=Math.min(...vis.map(n=>parseFloat(w.getComputedStyle(cv.cards[n].nm).fontSize)*cv.view.k));
    return {k:cv.view.k,selected:w.app.state.selected,isolate:!!w.app.state.isolate,visible:vis.sort(),hits,off,px,pos:JSON.parse(JSON.stringify(cv.pos)),toolbar:!w.document.getElementById('workspace-toolbar').hidden};})()`);
  const measures=async i=>browser.evaluate(`(()=>{const w=${pane(i)}.contentWindow,m=w.app.measures,L=m._gC&&m._gC.g,s=m.gScroll.getBoundingClientRect();
    const root=w.document.querySelector('.mv-source-card')||(m._nodeEls[L.root]&&m._nodeEls[L.root].btn),r=root&&root.getBoundingClientRect();
    const pressed=[...w.document.querySelectorAll('.mv-direction-switch button')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.title);
    return {setting:m._graphOrientation,orientation:L.orientation,pressed,crossings:(${CROSSINGS})(m),rootVisible:!!r&&r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1,
      sideways:m.gScroll.scrollWidth>m.gScroll.clientWidth+1,fitsAll:m.gScroll.scrollWidth<=m.gScroll.clientWidth+1&&m.gScroll.scrollHeight<=m.gScroll.clientHeight+1,zoom:m._gZoom,nodes:Object.keys(m._nodeEls).length,
      mode:m._workspaceMode,library:w.document.body.classList.contains('smv-browse-open')};})()`);
  // Center and the zoom buttons move the camera on purpose; only Fit and Focus promise the whole picture.
  const apart=(s,where)=>assert.deepEqual(s.hits,[],where+': tables on top of each other');
  const whole=(s,where)=>{assert.deepEqual(s.hits,[],where+': tables on top of each other');assert.deepEqual(s.off,[],where+': tables off the canvas');};
  const run=async(width,height,ti,mi,label)=>{
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await browser.send('Page.navigate',{url:shown.workspaceUrl});await sleep(800);await browser.evaluate(READ);
    const errs=errors.length;
    await t.test(label+': tables',async()=>{
      const start=await tables(ti);whole(start,'opening');assert.ok(start.px>=READABLE-0.05,'opening names '+start.px.toFixed(1)+'px');
      for(const name of start.visible){await click(ti,card(name),'card '+name);const s=await tables(ti);assert.equal(s.selected,name,'clicking '+name+' selects it');whole(s,'after selecting '+name);}
      await click(ti,card('Product Category'),'Product Category');
      await click(ti,button('Center'),'Center');apart(await tables(ti),'Center');
      await click(ti,button('Focus'),'Focus');let s=await tables(ti);
      assert.ok(s.isolate&&s.visible.length<start.visible.length,'Focus hides unrelated tables');whole(s,'Focus');assert.ok(s.px>=READABLE-0.05,'focused names '+s.px.toFixed(1)+'px');
      await click(ti,card('Product'),'Product inside the focus');
      await click(ti,button('Focus'),'Focus on Product');s=await tables(ti);
      assert.equal(s.isolate,true,'Focus with another table selected moves the focus');assert.ok(s.visible.includes('Inventory'),'Product neighbourhood');whole(s,'refocus');
      await click(ti,button('Focus'),'leave Focus');s=await tables(ti);
      assert.equal(s.isolate,false);assert.deepEqual(s.visible,start.visible,'every table is back');whole(s,'after leaving Focus');
      assert.deepEqual(s.pos,start.pos,'tables return to where they were');
      for(const z of ['+','+','+','−','−','−','−']){await click(ti,button(z),'zoom '+z);apart(await tables(ti),'zoom '+z);}
      await click(ti,button('Fit'),'Fit');s=await tables(ti);whole(s,'Fit');assert.ok(s.px>=READABLE-0.05,'Fit names '+s.px.toFixed(1)+'px');
      await click(ti,button('Tools'),'Tools');assert.equal((await tables(ti)).toolbar,true,'Tools shows the toolbar');whole(await tables(ti),'Tools open');
      await click(ti,button('Tools'),'Tools again');assert.equal((await tables(ti)).toolbar,false,'Tools hides the toolbar again');
    });
    if(mi==null)return;
    await t.test(label+': measures',async()=>{
      for(const [dir,title] of [['lr','Left to right'],['tb','Top to bottom'],['bt','Bottom to top'],['auto','Left to right; top to bottom when the pane is narrow']]){
        await click(mi,`(d)=>d.querySelector('.mv-direction-switch button[title="${title}"]')`,'direction '+dir);
        const s=await measures(mi);assert.equal(s.setting,dir,'direction button '+dir);assert.deepEqual(s.pressed,[title],'only the chosen direction is pressed');
        if(dir!=='auto')assert.equal(s.orientation,dir);
        if(s.orientation==='tb')assert.deepEqual(s.crossings,[],dir+': links through measures');
      }
      await click(mi,button('Fit all','.mv-graph-toolbar'),'Fit all');assert.equal((await measures(mi)).fitsAll,true,'Fit all shows the whole flow');
      await click(mi,button('Center','.mv-graph-toolbar'),'Center');assert.equal((await measures(mi)).rootVisible,true,'Center shows the analyzed table');
      await click(mi,`(d)=>[...d.querySelectorAll('.mv-source-controls input')].find(x=>x.getClientRects().length)`,'Columns off');let s=await measures(mi);if(s.orientation==='tb')assert.deepEqual(s.crossings,[],'Columns off');
      await click(mi,`(d)=>[...d.querySelectorAll('.mv-source-controls input')].find(x=>x.getClientRects().length)`,'Columns on');s=await measures(mi);if(s.orientation==='tb')assert.deepEqual(s.crossings,[],'Columns on');
      // Expand all and Reset appear only when something is collapsed or expanded.
      if(await browser.evaluate(`!!(${button('Expand all','.mv-graph-toolbar')})(${pane(mi)}.contentWindow.document)`)){await click(mi,button('Expand all','.mv-graph-toolbar'),'Expand all');s=await measures(mi);if(s.orientation==='tb')assert.deepEqual(s.crossings,[],'Expand all');}
      if(await browser.evaluate(`!!(${button('Reset','.mv-graph-toolbar')})(${pane(mi)}.contentWindow.document)`))await click(mi,button('Reset','.mv-graph-toolbar'),'Reset');
      const pick=`(d,w)=>{const n=w.app.measures._nodeEls;return Object.keys(n).map(k=>n[k].btn).find(b=>b&&b.getClientRects().length&&b.getBoundingClientRect().width>0);}`;
      const names=await browser.evaluate(`Object.keys(${pane(mi)}.contentWindow.app.measures._nodeEls)`);assert.ok(names.length>0,'the flow has measures to press');
      await click(mi,pick,'a measure');s=await measures(mi);assert.ok(s.nodes>0,'the flow is still drawn after pressing a measure');if(s.orientation==='tb')assert.deepEqual(s.crossings,[],'after pressing a measure');
      for(const mode of ['DAX','Split view','Dependencies'])await click(mi,button(mode,'.mv-mode-switch'),mode);
      assert.equal((await measures(mi)).mode,'graph');
      await click(mi,button('Library','.mv-header-actions'),'Library');assert.equal((await measures(mi)).library,true,'Library opens');
      await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(400);
      assert.equal((await measures(mi)).library,false,'Escape closes the library');
    });
    assert.deepEqual(errors.slice(errs),[],label+': script errors');
  };
  browser.onException=e=>errors.push(e);
  await run(1680,1518,0,1,'side by side 1680x1518');
  await run(1280,800,0,1,'side by side 1280x800');
  await run(1000,800,0,null,'tabs 1000x800');
});
