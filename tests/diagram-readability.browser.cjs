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
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);const p=data.id&&waiting.get(data.id);if(!p)return;waiting.delete(data.id);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;waiting.set(seq,{resolve,reject});socket.send(JSON.stringify({id:seq,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+': '+JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description));return r.result.value;};
  return {send,evaluate,async close(){socket.close();child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));fs.rmSync(profile,{recursive:true,force:true});}};
}

/* Reads every viewer on the page (the workspace's iframes, or the page itself) once each
   has applied its view. Text size is the computed font of the element carrying the name,
   times the zoom it is drawn at. */
const READ=`(async()=>{
  const frames=[...document.querySelectorAll('iframe')];
  const wins=frames.length?frames.map(f=>({w:f.contentWindow,r:f.getBoundingClientRect()})):[{w:window,r:{width:innerWidth,height:innerHeight}}];
  for(const {w} of wins)for(let i=0;i<300&&!(w.document.body&&w.document.body.dataset.smvReady==='1');i++)await new Promise(r=>setTimeout(r,50));
  await new Promise(r=>setTimeout(r,700));
  const shown=(w,sel)=>{const n=w.document.querySelector(sel);return !!n&&!n.hidden&&n.getClientRects().length>0;};
  return {workspace:frames.length?{pickers:[...document.querySelectorAll('section select')].filter(s=>s.getClientRects().length).length,panes:frames.length}:null,panes:wins.map(({w,r})=>{
    const app=w.app,out={pane:[Math.round(r.width),Math.round(r.height)],mode:app.state.viewMode,caption:!!w.document.getElementById('smv-question-caption')};
    if(app.state.viewMode==='measures'){
      const m=app.measures,z=m._gZoom||1,s=m.gScroll.getBoundingClientRect(),G=m._g;
      const names=Object.keys(m._nodeEls||{}),px=names.map(n=>parseFloat(w.getComputedStyle(m._nodeEls[n].btn).fontSize)*z);
      const inside=el=>{const b=el.getBoundingClientRect();return b.left>=s.left-1&&b.right<=s.right+1&&b.top>=s.top-1&&b.bottom<=s.bottom+1;};
      const source=w.document.querySelector('.mv-source-card,.mv-graph-canvas [data-source-key]');
      const rootEl=m._nodeEls[G.root]?m._nodeEls[G.root].btn:source;
      Object.assign(out,{zoom:+z.toFixed(3),graph:[Math.round(s.width),Math.round(s.height)],nodes:names.length,minPx:Math.min(...px),rootVisible:!!rootEl&&inside(rootEl),header:Math.round(w.document.querySelector('.mv-analysis-header').getBoundingClientRect().height)});
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
    for(const [w,h] of [[1100,800],[1280,720],[1920,1080]]){
      const r=await open(shown.workspaceUrl,w,h);
      assert.equal(r.workspace.pickers,0,'two views fill two panes without view pickers');
      r.panes.forEach((p,i)=>{checkPane(p,`${table} side by side ${w}x${h} pane ${i}`);t.diagnostic(`${table} side by side ${w}x${h} ${p.mode}: zoom ${(p.zoom*100).toFixed(0)}%, names ${p.minPx.toFixed(1)}px`);});
    }
    for(const [w,h] of [[1280,720],[1920,1080]])for(const i of [0,1]){
      const [p]=(await open(shown.views[i].url,w,h)).panes;
      checkPane(p,`${table} view ${i} ${w}x${h}`);t.diagnostic(`${table} ${p.mode} ${w}x${h}: zoom ${(p.zoom*100).toFixed(0)}%, names ${p.minPx.toFixed(1)}px`);
    }
  }
  await t.test('Tools brings the editing chrome back on demand',async()=>{
    const r=await browser.evaluate(`(async()=>{app.setViewMode('graph');await new Promise(r=>setTimeout(r,200));const t=[...document.querySelectorAll('#canvas-navigation button')].find(b=>b.textContent==='Tools');if(!t)throw new Error('no Tools button');t.click();await new Promise(r=>setTimeout(r,200));return {toolbar:!document.getElementById('workspace-toolbar').hidden,expanded:[...document.querySelectorAll('#canvas-navigation button')].find(b=>b.textContent==='Tools').getAttribute('aria-expanded'),legend:[...document.querySelectorAll('#canvas-navigation label')].some(l=>l.textContent.includes('Legend'))};})()`);
    assert.deepEqual(r,{toolbar:true,expanded:'true',legend:true});
  });
});
