'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {prepare,build}=require('../Models/tools/viewer/scripts/cli/explain.cjs');
const {capture,browserPath}=require('../Models/tools/viewer/scripts/cli/capture.cjs');
let browser;try{browser=browserPath();}catch(e){if(process.env.CI)throw e;}
const model=path.resolve(__dirname,'../Models/demo/Contoso Retail.SemanticModel'),tables=require('../examples/explanations/interactive-tables.json'),measure=require('../examples/explanations/interactive-measure.json');
async function verify(t,view,code,html){const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-live-browser-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const p=prepare(model,view);const script=`<script>{const original=smv.ready;const testing=(async()=>{await original();const check=(ok,message)=>{if(!ok)throw new Error(message)};check(!app.onboarding&&!document.querySelector('.smv-guide, [data-onboarding-help]'),'authored views must not initialize onboarding or Help');const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));${code}return original();})();smv.ready=()=>testing;}</script>`;return capture((html||p.html).replace('</body>',()=>script+'</body>'),path.join(root,'verified.png'),p.view);}
test('native focus, semantic annotations and explored state survive pan/expand/reset',{skip:!browser},async t=>verify(t,tables,`
check(app.canvas.selRel.name===${JSON.stringify(tables.focus.name)},'native relationship selection');
check(app.explorer.names.size===2,'focused visible tables');
const source=document.querySelector('.smv-view-provenance');check(source.textContent.includes('Model content: Contoso Retail'),'metadata provenance');check(source.textContent.includes('Authored instructions:'),'author provenance');check(JSON.parse(source.querySelector('pre').textContent).focus.name===app.canvas.selRel.name,'inspectable actual view specification');
const before=document.querySelector('.smv-hl').getBoundingClientRect().x;
app.canvas.view.x+=40;app.canvas.updateTransform();await frame();await frame();
const after=document.querySelector('.smv-hl').getBoundingClientRect().x;check(Math.abs(after-before-40)<2,'annotation tracks pan');
const column=document.querySelector('[data-smv-kind="column"][data-smv-name="Ship Date"]');column.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
check(smv.inspect().selection.name==='Ship Date','qualified clicked column selection');check(smv.inspect().explored,'user exploration flagged');
const saved=smv.inspect().currentView;await smv.apply(saved);check(Math.abs(app.canvas.view.x-saved.state.tableView.view.x)<0.01,'explored viewport restored');
app.canvas.toggleCard('Sales');await frame();await frame();check(document.querySelector('.smv-hidden-targets').textContent.includes('outside this view'),'collapsed target is explicit');
await smv.reset();check(app.canvas.selRel.name===${JSON.stringify(tables.focus.name)},'reset relationship');
check(!smv.inspect().explored,'reset exploration');
`));
test('measure context is bounded and full DAX remains available',{skip:!browser},async t=>verify(t,measure,`
check(app.state.selMeasure==='Sales LY','native analyzed measure');
check(app.measures._explanationContext.direction==='up','bounded upstream context');
check(app.measures._g.nodes.some(n=>n.name==='Total Sales'),'upstream included');check(!app.measures._g.nodes.some(n=>n.name==='Sales YoY'),'downstream excluded');
check(app.measures._wrapDax===true,'formula wrapping enabled');
const formula=document.querySelector('.mv-dax-body');check(formula.scrollWidth<=formula.clientWidth+1,'wrapped formula fits capture width');
await smv.apply({...{"version": 2, "mode": "measures", "focus": {"kind": "measure", "table": "Measures", "name": "Sales LY"}, "context": {"direction": "up", "depth": 0, "limit": 1}}});
check(app.measures._g.nodes.length===1,'initial cap respected');app.setState({gExtra:{'Total Sales':1}});await frame();check(app.measures._g.nodes.some(n=>n.name==='Total Sales'),'explicit expansion works beyond initial limit');
app.measures.pickMeasure('Total Sales');await frame();check(app.state.selMeasure==='Total Sales','real dependency navigation');
await smv.reset();check(app.state.selMeasure==='Sales LY','reset measure focus');
`));
test('Browse measures opens all filtered formulas and every result can be analyzed',{skip:!browser},async t=>verify(t,{...measure,width:728,state:{measures:{version:1,selectedMeasure:'Sales LY',library:{query:'Date[Date]'},preferences:{mode:'split',split:'below',wrap:true}}}},`
const browse=()=>[...document.querySelectorAll('.smv-explanation-controls button')].find(b=>b.textContent==='Browse measures');
browse().click();await frame();check(app.state.selMeasure===null,'Browse opens overview at desktop widths');
const names=['Sales LY','Sales YTD','Sales MTD','Sales Rolling 12M','Sales Ship Date','New Customers','Stock Cover Days'];
check(document.querySelectorAll('.mv-overview .mv-starter').length===7,'all seven Date matches visible');
check(document.querySelectorAll('.mv-overview .mv-starter-dax').length===7,'each result shows its actual formula');
for(const name of names){const item=[...document.querySelectorAll('.mv-overview .mv-starter')].find(b=>b.dataset.measure===name);check(item,'missing '+name);item.click();await frame();check(app.state.selMeasure===name,'analyze '+name);check(document.querySelector('.mv-dax-body').textContent.includes('Date'),'Date formula visible for '+name);browse().click();await frame();}
app.setState({mvQuery:'USERELATIONSHIP'});await frame();check(document.querySelectorAll('.mv-overview .mv-starter').length===1,'overview follows changed filter');
`));
test('hidden annotations omit descriptions and hidden-target reminders',{skip:!browser},async t=>verify(t,{...measure,annotationsVisible:false},`
check(document.querySelector('.smv-notes').hidden,'description initially hidden');
app.measures.pickMeasure('New Customers');await frame();await frame();check(!document.querySelector('.smv-hidden-targets').textContent,'hidden annotation targets do not leave reminders');
`));
test('agent updates wait for Apply while user is exploring',{skip:!browser},async t=>verify(t,tables,`
document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
const offer={revision:2,sourceRevision:SMV_SOURCE_REVISION,view:${JSON.stringify(measure)}};
check((await smv.offer(offer)).state==='pending','pending not applied');check(app.state.viewMode==='graph','user stays in graph');
const apply=[...document.querySelectorAll('.smv-pending button')].find(b=>b.textContent==='Apply');apply.click();
for(let i=0;i<30&&smv.inspect().revision!==2;i++)await frame();
check(smv.inspect().revision===2&&app.state.viewMode==='measures','acknowledged applied update');
await smv.reset();check(app.state.selMeasure==='Sales LY','updated authored reset');
`));
test('offline walkthrough uses one real viewer and navigates steps',{skip:!browser},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-walkthrough-browser-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const out=await build(path.resolve(__dirname,'../examples/explanations/interactive-walkthrough.json'),path.join(root,'out'));
  const html=fs.readFileSync(out.interactive,'utf8');assert.match(html,/SMV_STEPS/);
  await verify(t,tables,`check(SMV_STEPS.length===2,'two steps');await smv.step(1);check(!app.onboarding&&!document.querySelector('.smv-guide, [data-onboarding-help]'),'walkthrough navigation must not start onboarding');check(app.state.selMeasure==='Sales LY','step switches actual workspace');await smv.step(0);check(app.state.viewMode==='graph'&&app.explorer.names.size===2,'previous restores tables');`,html);
});

test('focused measures remain navigable in a narrow light/dark viewport',{skip:!browser},async t=>verify(t,{...measure,width:360,height:900},`
check(document.documentElement.scrollWidth<=innerWidth,'no page horizontal overflow');
check(getComputedStyle(document.querySelector('.mv-library')).display==='none','library initially collapsed');
const browse=[...document.querySelectorAll('.smv-explanation-controls button')].find(b=>b.textContent==='Browse measures');check(browse,'browse control');browse.click();check(getComputedStyle(document.querySelector('.mv-library')).display!=='none','library opens');browse.click();
SMVInteractive.appearance({theme:'dark'});check(getComputedStyle(document.documentElement).getPropertyValue('--smv-ink').trim()==='#e4e9f3','dark appearance');SMVInteractive.appearance({theme:'light'});check(document.documentElement.dataset.smvColorScheme==='light','light appearance');
`));

test('MCP App runs the real viewer through the official host bridge',{skip:!browser,timeout:30000},async t=>{
  const {createServer,URI}=require('../integrations/mcp/server.cjs');
  const {Client,InMemoryTransport}=require('@modelcontextprotocol/client');
  const owned=createServer({root:path.resolve(__dirname,'..')}),[a,b]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'bridge-browser-test',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
  t.after(async()=>{await client.close();owned.cleanup();});await Promise.all([owned.server.connect(a),client.connect(b)]);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view:tables}});
  const resource=await client.readResource({uri:URI});let synchronized=false,downloadedHTML;
  const checks=`<script>addEventListener('unhandledrejection',e=>parent.postMessage({testError:e.reason?.message},'*'));{const load=smv.loadView;smv.loadView=async(...args)=>{const result=await load(...args);const check=(v,m)=>{if(!v)throw new Error(m)};for(let i=0;i<30&&document.documentElement.dataset.smvColorScheme!=='dark';i++)await new Promise(r=>requestAnimationFrame(r));check(document.documentElement.dataset.smvColorScheme==='dark','host theme not applied');check(getComputedStyle(document.documentElement).getPropertyValue('--smv-ink').trim()==='#e4e9f3','host dark tokens');check([...document.querySelectorAll('button')].some(b=>b.textContent==='Expand workspace'),'missing workspace action');const action=async(label,expected)=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);b.click();check(b.disabled,'pending action stays disabled');const deadline=Date.now()+10000;while(b.disabled&&Date.now()<deadline)await new Promise(r=>requestAnimationFrame(r));check(!b.disabled,'action did not finish');check(document.querySelector('.smv-action-status').textContent.includes(expected),'missing success feedback for '+label+': '+document.querySelector('.smv-action-status').textContent);};await action('Expand workspace','expanded');await action('Use selection in conversation','Shared');await action('Save offline view','Download requested');return result;};}</script>`;
  const closing=resource.contents[0].text.lastIndexOf('</body>');resource.contents[0].text=resource.contents[0].text.slice(0,closing)+checks+resource.contents[0].text.slice(closing);
  const http=require('node:http');
  const relay=http.createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.end();return;}let text='';for await(const c of req)text+=c;try{const args=JSON.parse(text);const result=args.uri?await client.readResource({uri:args.uri}):await client.callTool(args);if(args.uri)downloadedHTML=result.contents[0].text;if(args.name==='smv_app_sync'&&args.arguments.receipt.sourceRevision===opened.structuredContent.sourceRevision&&args.arguments.receipt.currentView.tables.includes('Sales'))synchronized=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
  await new Promise(r=>relay.listen(0,'127.0.0.1',r));t.after(()=>{relay.close();relay.closeAllConnections();});
  const url='http://127.0.0.1:'+relay.address().port;
  const source=`import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const trace=[];window.addEventListener('message',e=>{if(new TextEncoder().encode(JSON.stringify(e.data)).length>262144){e.stopImmediatePropagation();if(e.data.id)frame.contentWindow.postMessage({jsonrpc:'2.0',id:e.data.id,error:{code:-32600,message:'Message too large.'}},'*');return;}trace.push(e.data?.testError||e.data?.method||e.data?.error?.message||e.data?.result?.isError||'response');},true);
const frame=document.createElement('iframe');frame.style.cssText='border:0;width:100%;height:100px';frame.setAttribute('sandbox','allow-scripts');document.body.appendChild(frame);
const bridge=new AppBridge(null,{name:'test-host',version:'1'},{serverTools:{},updateModelContext:{},downloadFile:{}});
let expanded=false,downloaded=false,shared=false,requestedHeight=0;bridge.onsizechange=({height})=>{if(Number.isFinite(height)){requestedHeight=height;frame.style.height=height+'px';}};bridge.setHostContext({theme:'dark',availableDisplayModes:['inline','fullscreen']});
bridge.onrequestdisplaymode=async({mode})=>{expanded=mode==='fullscreen';return {mode};};
bridge.onupdatemodelcontext=async({content})=>{const context=JSON.parse(content[0].text);if(context.selection.kind!=='relationship'||!context.sourceRevision)throw new Error('Qualified selection context missing');shared=true;return {};};
bridge.ondownloadfile=async({contents})=>{if(contents[0].type!=='resource_link')throw new Error('Offline export must use a small resource link');const response=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uri:contents[0].uri})});const text=(await response.json()).contents[0].text;if(!text.includes('Contoso Retail')||!text.includes('SMVExplanation.start'))throw new Error('Offline recovery did not retain the actual viewer');downloaded=true;return {};};
let resolve,reject;const ready=new Promise((a,b)=>{resolve=a;reject=b});let count=0;
bridge.oncalltool=async(params)=>{const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});const result=await r.json();trace.push({tool:params.name,error:result.isError?result.content:null,revision:params.arguments.receipt?.sourceRevision});if(params.name==='smv_app_sync'&&params.arguments.receipt.sourceRevision===${JSON.stringify(opened.structuredContent.sourceRevision)}){count++;if(count>=2&&expanded&&downloaded&&shared&&requestedHeight>=600&&requestedHeight<=1000)resolve({clip:{x:0,y:0,width:1440,height:1000},objects:[]})}return result;};
bridge.oninitialized=async()=>{bridge.setHostContext({theme:'dark',availableDisplayModes:['inline','fullscreen']});await bridge.sendToolInput({arguments:{model:'demo',view:${JSON.stringify(tables)}}});await bridge.sendToolResult(${JSON.stringify(opened)});};
await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.srcdoc=${JSON.stringify(resource.contents[0].text)};
window.smv={ready:()=>ready};setTimeout(()=>reject(new Error('MCP App did not synchronize at a usable height ('+requestedHeight+'): '+JSON.stringify(trace))),15000);`;
  const bundled=require('esbuild').buildSync({stdin:{contents:source,resolveDir:path.resolve(__dirname,'..'),sourcefile:'host-test.js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}).outputFiles[0].text;
  const html='<!doctype html><body style="margin:0"><script type="module">'+bundled.replace(/<\/script/gi,'<\\/script')+'</script></body>';
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-app-bridge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await capture(html,path.join(root,'bridge.png'),{width:1440,height:1000,scale:1});assert.equal(synchronized,true);assert.ok(downloadedHTML);
  await verify(t,tables,`check(app.canvas.selRel.name===${JSON.stringify(tables.focus.name)},'download retains current relationship');check(!window.SMV_SAVE_OFFLINE,'offline export has no disconnected host controls');`,downloadedHTML);
});

test('plain prepared views have a closable library and controls never cover formulas',{skip:!browser},async t=>verify(t,{version:2,mode:'measures',focus:{kind:'measure',table:'Measures',name:'Sales YoY'},context:{direction:'both',depth:3,limit:25},chrome:false,width:728,height:900},`
check(![...document.querySelectorAll('.smv-explanation-controls button')].some(b=>/annotations/i.test(b.textContent)),'empty annotation controls omitted');
check(!document.querySelectorAll('.smv-hl').length,'focus alone does not create annotation rings');
const browse=()=>document.querySelector('[data-smv-browse]');check(browse(),'Browse control');browse().click();await frame();
check(document.body.classList.contains('smv-browse-open'),'library opened');
const close=document.querySelector('[aria-label="Close measure library"]');check(close&&close.getBoundingClientRect().width,'visible Close control');close.click();await frame();
check(!document.body.classList.contains('smv-browse-open'),'library closes');check(app.state.selMeasure==='Sales YoY','closing restores analyzed measure');
const buttons=[...document.querySelectorAll('.mv-mode-switch button')];buttons.find(b=>b.textContent==='DAX').click();await frame();
const footer=document.querySelector('.smv-explanation-controls').getBoundingClientRect();check(document.querySelector('#root').getBoundingClientRect().bottom<=footer.top+1,'controls reserve workspace space');
const formula=document.querySelector('.mv-dax-card').getBoundingClientRect();check(formula.bottom<=footer.top,'formula card readable above controls');
`));
test('relationship view expands both endpoints and fits after the controls are laid out',{skip:!browser},async t=>verify(t,{version:2,mode:'graph',tables:['Sales','Date'],focus:tables.focus,chrome:false,width:1280,height:900},`
check(app.canvas.cards.Sales.expanded&&app.canvas.cards.Date.expanded,'both endpoint cards expanded');
check(app.canvas.detailMode==='cards','relationship columns stay visible');
const rects=['Sales','Date'].map(n=>app.canvas.cards[n].el.getBoundingClientRect());const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right));
const host=app.canvas.host.getBoundingClientRect();check(Math.abs((left+right)/2-(host.left+host.width/2))<5,'table pair centered');
check(rects.every(r=>r.top>=host.top&&r.bottom<=host.bottom),'expanded cards fit available canvas');
`));


test('host controls show progress, success and rejection without losing feedback to live status',{skip:!browser},async t=>{
  const p=prepare(model,measure),html=p.html.replace('</head>',`<script>window.SMV_SAVE_OFFLINE=()=>new Promise((resolve,reject)=>{window.finishDownload=resolve;window.rejectDownload=reject;});window.SMV_SEND_CONTEXT=async()=>{throw new Error('Select a model object first.');};</script></head>`);
  return verify(t,measure,`
const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save offline view');
const status=document.querySelector('.smv-action-status');save.click();
check(save.disabled&&status.textContent==='Preparing offline view…','visible pending action');
finishDownload('Download requested.');await frame();check(!save.disabled&&status.textContent==='Download requested.','visible success');
document.querySelector('.smv-status').textContent='Inline · view 1';check(status.textContent==='Download requested.','connection status preserves action result');
save.click();rejectDownload(new Error('Download was declined.'));await frame();check(!save.disabled&&status.textContent==='Download was declined.','visible rejection and retry');
[...document.querySelectorAll('button')].find(b=>b.textContent==='Use selection in conversation').click();await frame();check(status.textContent==='Select a model object first.','empty selection guidance');
`,html);
});

test('table and column Measures focus round-trip without a disconnected receipt', { skip: !browser }, async t => verify(t, { version: 2, mode: 'measures', focus: { kind: 'table', name: 'Sales' }, banner: false }, `
check(app.state.dependencySource.table==='Sales','table dependency view opens');
check(app.state.selMeasure===null,'table is not treated as a measure');
check(getComputedStyle(document.querySelector('.smv-explanation-controls')).display==='none','plain exploration hides banner');
const saved=smv.inspect().currentView;check(saved.focus.kind==='table'&&saved.focus.name==='Sales','receipt preserves table focus');
SMVExplanation.validate(app.model,saved);await smv.apply(saved);check(app.state.dependencySource.table==='Sales','table view restores');
await smv.apply({version:2,mode:'measures',focus:{kind:'column',table:'Sales',name:'Net Amount'},banner:false});
check(app.state.dependencySource.column==='Net Amount','column dependency view opens');
SMVExplanation.validate(app.model,smv.inspect().currentView);
await smv.apply({version:2,mode:'measures',banner:false});
check(app.state.selMeasure===null&&app.state.dependencySource===null,'Measures overview opens');
SMVExplanation.validate(app.model,smv.inspect().currentView);
await smv.apply(${JSON.stringify(measure)});check(app.state.dependencySource===null&&app.state.selMeasure==='Sales LY','measure focus clears source mode');
`));
test('quiet views expose pending Apply and explicit apply bypasses exploration', { skip: !browser }, async t => verify(t, { ...tables, banner: false }, `
const controls=()=>document.querySelector('.smv-explanation-controls');
check(getComputedStyle(controls()).display==='none','banner initially hidden');
document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
const view={...${JSON.stringify(measure)},banner:false};
check((await smv.offer({revision:2,sourceRevision:SMV_SOURCE_REVISION,view})).state==='pending','normal update respects exploration');
check(getComputedStyle(controls()).display!=='none','pending Apply remains visible');
check(document.querySelector('.smv-pending').textContent.includes('Apply'),'Apply action present');
check((await smv.offer({revision:3,sourceRevision:SMV_SOURCE_REVISION,view,apply:true})).state==='applied','explicit apply takes over');
check(smv.inspect().revision===3&&app.state.selMeasure==='Sales LY','new view acknowledged');
check(getComputedStyle(controls()).display==='none','quiet after acknowledgement');
`));

test('authored table sets start compact and clicking tables shows both filter directions',{skip:!browser},async t=>verify(t,{version:2,mode:'graph',tables:['Date','Sales','Returns','Budget','Forecast','Inventory','Purchases','Shipments','Sales Orders'],focus:{kind:'table',name:'Date'},banner:false},`
const points=[...app.explorer.names].map(n=>app.canvas.pos[n]);
check(new Set(points.map(p=>Math.round(p.y))).size>2,'table set must not start as a horizontal row');
const host=app.canvas.host.getBoundingClientRect();
for(const name of app.explorer.names){const box=app.canvas.cards[name].el.getBoundingClientRect();check(box.left>=host.left-1&&box.right<=host.right+1,'authored fit must wait for inspector width: '+name);}
check(app.explorer.direction==='both','default must include incoming and outgoing filter paths');
let related=app.explorer.related();check(related.names.has('Sales'),'Date must show the fact table it filters');
app.canvas.selectTable('Sales');await frame();
related=app.explorer.related();check(related.names.has('Date'),'Sales must show its filtering dimension');
const controls=app.explorer.relationControls();check(controls.querySelector('[aria-label="Relationship direction"]').value==='both','inspector default matches canvas');
const saved=app.canvas.captureFocus();app.explorer.direction='incoming';app.canvas.restoreFocus(saved);check(app.explorer.direction==='both','saved focus preserves both directions');check(app.explorer.depth==='all','saved focus preserves indirect paths');
`));

test('version 2 relative selectors and explicit arrange preserve later explored positions',{skip:!browser},async t=>verify(t,{version:2,tables:{relatedTo:'Date',depth:1},focus:{kind:'table',name:'Date'},arrange:true,banner:false},`
check(app.explorer.names.has('Sales'),'relative table set resolved in browser');
check(app.explorer.names.has('Date'),'relative root retained');
check(smv.inspect().renderedSummary.tableCanvasTables===app.explorer.names.size,'rendered counts match canvas');
const current=smv.inspect().currentView;check(current.arrange===false,'explored state disables forced rearrangement');
current.state.tableView.pos.Date.x+=123;await smv.apply(current);check(Math.abs(app.canvas.pos.Date.x-current.state.tableView.pos.Date.x)<1,'saved custom positions survive arrange restoration');
`));

test('authored question paths set the inspector direction and inactive state',{skip:!browser},async t=>verify(t,{version:2,tables:{filters:'Date',depth:1},focus:{kind:'table',name:'Date'},paths:{direction:'incoming',includeInactive:false,depth:1},caption:'No active tables filter Date.',arrange:true,banner:false},`
check(document.getElementById('smv-question-caption').textContent==='No active tables filter Date.','question explanation is visible without the annotation banner');
check(app.explorer.names.size===1,'incoming Date diagram has no invented filtering tables');
check(app.explorer.direction==='incoming','question direction controls explorer');
check(app.explorer.depth==='direct'&&!app.explorer.includeInactive,'question scope controls explorer');
await smv.apply({version:2,tables:['Date','Sales'],focus:{kind:'table',name:'Date'},paths:{direction:'connected',includeInactive:true,depth:100},arrange:true,banner:false});
check(app.explorer.direction==='connected'&&app.explorer.includeInactive,'inactive pair diagram controls match authored question');check(!document.getElementById('smv-question-caption'),'a later view clears the previous explanation');
`));

test('focused dependency library is discoverable without a footer and persists with explicit layout',{skip:!browser},async t=>verify(t,{version:2,mode:'measures',focus:{kind:'table',name:'Inventory'},banner:false,width:640,height:900},`
const v=app.measures,control=()=>v.libraryToggle;
check(v._graphOrientation==='auto','focused graphs follow the pane by default');
check(control().getBoundingClientRect().width>0,'library toggle visible with hidden footer');
check(control().getAttribute('aria-expanded')==='false'&&v.pane.inert,'focused library collapsed and untabbable');
control().click();await frame();check(control().getAttribute('aria-expanded')==='true'&&!v.pane.inert,'library opens');check(document.activeElement===v.qInput,'focus moves to search');
v.pane.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await frame();check(v._libraryCollapsed&&document.activeElement===control(),'Escape collapses and returns focus');
control().click();v.setGraphOrientation('bt');await frame();const saved=smv.inspect().currentView;check(saved.state.measures.library.collapsed===false,'open library captured');
await smv.apply(saved);await frame();check(!v._libraryCollapsed&&v._graphOrientation==='bt','snapshot restores library and explicit vertical option');
const snap=Snapshots.capture(app);v.setLibraryCollapsed(true);app.loadSnapshot(snap);await frame();await frame();check(!v._libraryCollapsed,'native snapshot restores visibility');
v.setLibraryCollapsed(true);await smv.reset();check(v._libraryCollapsed&&v._graphOrientation==='auto','reset returns to focused defaults');
`));

test('show PNG export confirms static output without polluting JSON',{skip:!browser},t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-show-png-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const result=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'../bin/smv.cjs'),'show',model,'--table','Inventory','--dependents','--out',path.join(dir,'inventory.png'),'--open','none','--json'],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
 assert.equal(output.artifact.format,'png');assert.equal(output.sessionFile,undefined);assert.match(result.stderr,/exported a static image; no server was started/);
 assert.equal(fs.readFileSync(output.artifact.path).subarray(1,4).toString(),'PNG');
});
