'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {prepare,build}=require('../Models/tools/viewer/scripts/cli/explain.cjs');
const {capture,browserPath}=require('../Models/tools/viewer/scripts/cli/capture.cjs');
let browser;try{browser=browserPath();}catch(e){if(process.env.CI)throw e;}
const model=path.resolve(__dirname,'../Models/demo/Contoso Retail.SemanticModel'),tables=require('../examples/explanations/interactive-tables.json'),measure=require('../examples/explanations/interactive-measure.json');
async function verify(t,view,code,html){const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-live-browser-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const p=prepare(model,view);const script=`<script>{const original=smv.ready;const testing=(async()=>{await original();const check=(ok,message)=>{if(!ok)throw new Error(message)};const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));${code}return original();})();smv.ready=()=>testing;}</script>`;return capture((html||p.html).replace('</body>',()=>script+'</body>'),path.join(root,'verified.png'),p.view);}
test('native focus, semantic annotations and explored state survive pan/expand/reset',{skip:!browser},async t=>verify(t,tables,`
check(app.canvas.selRel.name===${JSON.stringify(tables.focus.name)},'native relationship selection');
check(app.explorer.names.size===2,'focused visible tables');
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
app.measures.pickMeasure('Total Sales');await frame();check(app.state.selMeasure==='Total Sales','real dependency navigation');
await smv.reset();check(app.state.selMeasure==='Sales LY','reset measure focus');
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
  await verify(t,tables,`check(SMV_STEPS.length===2,'two steps');await smv.step(1);check(app.state.selMeasure==='Sales LY','step switches actual workspace');await smv.step(0);check(app.state.viewMode==='graph'&&app.explorer.names.size===2,'previous restores tables');`,html);
});

test('MCP App runs the real viewer through the official host bridge',{skip:!browser,timeout:30000},async t=>{
  const {createServer,URI}=require('../Models/tools/viewer/scripts/cli/mcp.cjs');
  const {Client,InMemoryTransport}=require('@modelcontextprotocol/client');
  const owned=createServer({root:path.resolve(__dirname,'..')}),[a,b]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'bridge-browser-test',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
  t.after(async()=>{await client.close();owned.cleanup();});await Promise.all([owned.server.connect(a),client.connect(b)]);
  const opened=await client.callTool({name:'smv_open',arguments:{model:'Models/demo/Contoso Retail.SemanticModel',view:tables}});
  const resource=await client.readResource({uri:URI});let synchronized=false;
  const http=require('node:http');
  const relay=http.createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.end();return;}let text='';for await(const c of req)text+=c;try{const args=JSON.parse(text);const result=await client.callTool(args);if(args.name==='smv_app_sync'&&args.arguments.receipt.sourceRevision===opened.structuredContent.sourceRevision&&args.arguments.receipt.currentView.tables.includes('Sales'))synchronized=true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
  await new Promise(r=>relay.listen(0,'127.0.0.1',r));t.after(()=>{relay.close();relay.closeAllConnections();});
  const url='http://127.0.0.1:'+relay.address().port;
  const source=`import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const trace=[];window.addEventListener('message',e=>{trace.push(e.data?.method||e.data?.error?.message||e.data?.result?.isError||'response');});
const frame=document.createElement('iframe');frame.style.cssText='border:0;width:100%;height:850px';frame.setAttribute('sandbox','allow-scripts');document.body.appendChild(frame);
const bridge=new AppBridge(null,{name:'test-host',version:'1'},{serverTools:{},updateModelContext:{}});
let resolve,reject;const ready=new Promise((a,b)=>{resolve=a;reject=b});let count=0;
bridge.oncalltool=async(params)=>{const r=await fetch(${JSON.stringify(url)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});const result=await r.json();trace.push({tool:params.name,error:result.isError?result.content:null,revision:params.arguments.receipt?.sourceRevision});if(params.name==='smv_app_sync'&&params.arguments.receipt.sourceRevision===${JSON.stringify(opened.structuredContent.sourceRevision)}){count++;if(count>=2)resolve({clip:{x:0,y:0,width:1440,height:1000},objects:[]})}return result;};
bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{model:'demo',view:${JSON.stringify(tables)}}});await bridge.sendToolResult(${JSON.stringify(opened)});};
await bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));frame.srcdoc=${JSON.stringify(resource.contents[0].text)};
window.smv={ready:()=>ready};setTimeout(()=>reject(new Error('MCP App never synchronized: '+JSON.stringify(trace))),15000);`;
  const bundled=require('esbuild').buildSync({stdin:{contents:source,resolveDir:path.resolve(__dirname,'..'),sourcefile:'host-test.js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'}).outputFiles[0].text;
  const html='<!doctype html><body style="margin:0"><script type="module">'+bundled.replace(/<\/script/gi,'<\\/script')+'</script></body>';
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'smv-app-bridge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await capture(html,path.join(root,'bridge.png'),{width:1440,height:1000,scale:1});assert.equal(synchronized,true);
});
