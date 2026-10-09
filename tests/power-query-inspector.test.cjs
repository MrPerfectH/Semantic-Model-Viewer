const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness,context,plain}=require('./power-query-ui-harness.cjs');
function setup(ctx=context()) { const h=harness('power-query-inspector.js'),events={navigate:[],close:[]};const inspector=h.win.PowerQueryInspector.mount(h.host,{context:ctx,onNavigate:e=>events.navigate.push(e),onClose:e=>events.close.push(e)});inspector.select('id-1',{open:true});return {...h,ctx,inspector,events,root:()=>h.host.querySelector('.pqi'),code:()=>h.host.querySelector('.pqi-code-scroll')}; }
test('exact CRLF/quoted/repeated/non-BMP source slices are separate from numbered gutter; Copy original source',async()=>{const c=context(),r=c.byNodeId.get('id-1');const token='#"Sales#(0020)Raw"';r.code='let\r\n  // 😀 comment Server\r\n  X = '+token+',\r\n  Again = '+token+'\r\nin "<script>Server</script>"  \r\n';r.occurrences=[r.code.indexOf(token),r.code.lastIndexOf(token)].map(at=>({targetId:'id-0',name:'Sales Raw',at,end:at+token.length}));const s=setup(c),copied=[];s.win.navigator.clipboard.writeText=source=>{copied.push(source);return Promise.resolve();};const raw=s.host.querySelectorAll('.pqi-source-line').map(e=>e.textContent).join('');assert.equal(raw,r.code);assert.equal(s.host.querySelectorAll('.pqi-reference').length,2);assert.equal(s.host.querySelectorAll('.pqi-reference').every(e=>e.textContent===token),true);assert.equal(s.host.querySelectorAll('script').length,0);s.host.querySelector('.pqi-reference').fire('click');assert.deepEqual(plain(s.events.navigate[0]),{generation:1,sourceId:'id-1',targetId:'id-0',occurrence:{at:r.occurrences[0].at,end:r.occurrences[0].end}});s.host.querySelectorAll('button').find(e=>e.textContent==='Copy M').fire('click');await Promise.resolve();assert.equal(copied[0],r.code);assert.ok(s.host.querySelectorAll('.pqi-line-number').length>=6);});
test('invalid/overlapping/missing-target spans never create guessed links',()=>{for(const occurrences of [[{at:0,end:3,targetId:'missing'}],[{at:0,end:3,targetId:'id-0'},{at:2,end:5,targetId:'id-0'}],[{at:-1,end:2,targetId:'id-0'}],[null]]){const c=context();c.byNodeId.get('id-1').occurrences=occurrences;const s=setup(c);assert.equal(s.host.querySelectorAll('.pqi-reference').length,0);assert.equal(s.host.querySelectorAll('.pqi-source-line').map(e=>e.textContent).join(''),'Server');assert.match(s.host.querySelector('.pqi-review').textContent,/Reference ranges/);}});
test('opaque uncertainty is neutral disclosure; presentation diagnostics are review; no regex classification',()=>{const c=context();c.byNodeId.get('id-1').issues=[{kind:'analysis-uncertainty',message:'Ambiguous dynamic library symbol remains exact'},{kind:'presentation-diagnostic',message:'Invalid span omitted'},{kind:'unknown-kind',message:'Unknown stays neutral'},{kind:'analysis-notice',message:'Global caveat'}];const s=setup(c);assert.equal(s.host.querySelectorAll('.pqi-review').length,1);assert.equal(s.host.querySelector('.pqi-review').textContent,'Invalid span omitted');assert.match(s.host.querySelector('.pqi-analysis-details').textContent,/Static analysis details.*Ambiguous dynamic library symbol remains exact/);assert.equal(s.root().textContent.includes('Global caveat'),false);assert.equal(s.host.querySelector('.pqi-neutral').textContent,'Unknown stays neutral');});
test('duplicate graph IDs select exactly supplied rows; status rows have no invented M',()=>{const c=context();c.byNodeId.get('id-1').metadataRow.id='duplicate';c.byNodeId.get('id-3').metadataRow.id='duplicate';c.byNodeId.get('id-1').code='ROW ONE';c.byNodeId.get('id-1').occurrences=[];c.byNodeId.get('id-3').code='ROW TWO';c.byNodeId.get('id-4').code=null;c.byNodeId.get('id-4').state='no-partitions';const s=setup(c);assert.equal(s.host.querySelector('.pqi-source-line').textContent,'ROW ONE');s.inspector.select('id-3',{open:true});assert.equal(s.host.querySelector('.pqi-source-line').textContent,'ROW TWO');s.inspector.select('id-4',{open:true});assert.equal(s.code(),null);assert.match(s.root().textContent,/Partition metadata was not supplied/);});
test('capture/restore contains both scroll axes, wrap and stable occurrence descriptor',async()=>{const s=setup();s.code().scrollLeft=71;s.code().scrollTop=123;s.root().scrollLeft=8;s.root().scrollTop=99;s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});const saved=s.inspector.captureViewState();assert.deepEqual(plain(saved),{codeX:71,codeY:123,inspectorX:8,inspectorY:99,wrap:true,focus:{kind:'reference',nodeId:'id-1',at:0,end:6},disclosures:{provenance:false},expanded:false});s.code().scrollLeft=0;s.root().scrollTop=0;const p=s.inspector.restoreViewState({...saved,wrap:true});s.flush();await p;assert.equal(s.code().scrollLeft,71);assert.equal(s.root().scrollTop,99);assert.equal(s.code().classList.contains('pqi-wrap'),true);assert.equal(s.doc.activeElement,s.host.querySelector('.pqi-reference'));assert.equal(s.inspector.focus({kind:'reference',nodeId:'id-1',at:100,end:101}),false);});
test('new selection, same-ID select, close, suspend, reset and destroy cancel queued restores',async()=>{for(const action of ['new','same','close','suspend','reset','destroy']){const s=setup(),p=s.inspector.restoreViewState({codeX:999,codeY:999,inspectorX:999,inspectorY:999,wrap:true,focus:{kind:'copy',nodeId:'id-1'}});s.runFrame();const queued=[...s.frames.values()];if(action==='new')s.inspector.select('id-3',{open:true});if(action==='same')s.inspector.select('id-1',{open:true});if(action==='close')s.root().fire('keydown',{key:'Escape'});if(action==='suspend')s.inspector.suspend(true);if(action==='reset')s.inspector.setContext(null);if(action==='destroy')s.inspector.destroy();queued.forEach(fn=>fn());await p;if(s.code()){assert.equal(s.code().scrollTop,0,action);assert.equal(s.code().classList.contains('pqi-wrap'),true,action);}else assert.equal(s.host.querySelectorAll('.pqi-source-line').length,0);}});
test('newer restore/direct focus wins within same generation',async()=>{const s=setup(),old=s.inspector.restoreViewState({codeX:20,codeY:20,wrap:true}),newer=s.inspector.restoreViewState({codeX:7,codeY:8,wrap:false,focus:{kind:'close',nodeId:'id-1'}});s.flush();await Promise.all([old,newer]);assert.equal(s.code().scrollTop,8);assert.equal(s.inspector.captureViewState().focus.kind,'close');const p=s.inspector.restoreViewState({codeY:99,focus:{kind:'copy',nodeId:'id-1'}});s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});s.flush();await p;assert.equal(s.code().scrollTop,8);assert.equal(s.inspector.captureViewState().focus.kind,'reference');});
test('same-generation context and hide/reopen preserve view; generation reset clears hidden source and callbacks',async()=>{const s=setup();s.code().scrollTop=123;s.inspector.setContext({...s.ctx});assert.equal(s.code().scrollTop,123);s.inspector.select('id-1',{open:false});assert.equal(s.root().hidden,true);s.inspector.select('id-1',{open:true});assert.equal(s.code().scrollTop,123);const oldLink=s.host.querySelector('.pqi-reference');s.inspector.setContext(context(2));assert.equal(s.root().textContent,'');oldLink.fire('click');assert.equal(s.events.navigate.length,0);s.inspector.select('id-1',{open:true});assert.equal(s.code().scrollTop,0);s.inspector.suspend(true);s.inspector.setContext(null);assert.equal(s.root().textContent,'');s.inspector.destroy();s.inspector.destroy();assert.equal(s.host.children.length,0);});
test('clipboard completion after close/reopen or reset cannot repaint code/status',async()=>{const s=setup();let finish;s.win.navigator.clipboard.writeText=()=>new Promise(resolve=>finish=resolve);s.host.querySelectorAll('button').find(e=>e.textContent==='Copy M').fire('click');s.root().fire('keydown',{key:'Escape'});assert.deepEqual(plain(s.events.close[0]),{generation:1,reason:'escape'});s.inspector.select('id-1',{open:true});finish();await Promise.resolve();await Promise.resolve();assert.equal(s.host.querySelector('.pqi-copy-status').textContent,'');s.inspector.setContext(null);assert.equal(s.root().textContent,'');});
test('focus controls emit only generation/selected-ID actions; Infinity serializes without changing source/view',()=>{const s=setup(),focus=[],membership=[];s.inspector.destroy();s.inspector=s.win.PowerQueryInspector.mount(s.host,{context:s.ctx,onFocusChange:e=>focus.push(e),onMembershipAction:e=>membership.push(e)});s.inspector.select('id-1',{open:true});const code=s.code();code.scrollTop=44;const settings={mode:'dim',direction:'inputs',depth:Infinity,relatedCount:4,missingCount:2,removableCount:1};s.inspector.setFocusControls(settings);assert.equal(s.code(),code);assert.equal(code.scrollTop,44);const selects=s.host.querySelectorAll('select');assert.equal(selects[1].value,'all');selects[1].value='0';selects[1].fire('change');assert.deepEqual(plain(focus.at(-1)),{generation:1,nodeId:'id-1',mode:'dim',direction:'inputs',depth:0});const hide=s.host.querySelectorAll('button').find(e=>e.textContent==='Hide unrelated');hide.fire('click');assert.equal(focus.at(-1).depth,Infinity);assert.equal(focus.at(-1).mode,'hide');const add=s.host.querySelectorAll('button').find(e=>e.textContent==='Add 2 related to canvas');add.fire('click');assert.deepEqual(plain(membership.at(-1)),{generation:1,nodeId:'id-1',action:'add-related'});s.inspector.setFocusControls({...settings,missingCount:0});add.fire('click');hide.fire('click');assert.equal(membership.length,1);assert.equal(focus.length,2);assert.equal(s.code(),code);s.inspector.select('id-3',{open:true});assert.equal(s.inspector.focus({kind:'focus-depth',nodeId:'id-3'}),true);assert.equal(s.doc.activeElement.value,'all');s.inspector.setContext(null);const late=s.doc.activeElement;late.fire('change');assert.equal(focus.length,2);});
test('history restores focused controls by descriptor and never keeps old control DOM',async()=>{const s=setup();s.inspector.setFocusControls({mode:'hide',direction:'consumers',depth:2,relatedCount:3,missingCount:1,removableCount:0});assert.equal(s.inspector.focus({kind:'focus-depth',nodeId:'id-1'}),true);const saved=s.inspector.captureViewState(),old=s.doc.activeElement;assert.equal(saved.focus.kind,'focus-depth');s.inspector.setFocusControls({mode:'dim',direction:'inputs',depth:0,relatedCount:0,missingCount:0,removableCount:3});assert.notEqual(s.doc.activeElement,old);const p=s.inspector.restoreViewState(saved);s.flush();await p;assert.equal(s.doc.activeElement.getAttribute('aria-label'),'Query reference distance');assert.notEqual(s.doc.activeElement,old);assert.equal(s.doc.activeElement.closest('.pqi-reference-options')!==null,true);});

const disclosureSelectors={provenance:'.pqi-provenance',analysis:'.pqi-analysis-details'};
function disclosureContext(generation=1) {
  const c=context(generation);
  for(const id of ['id-1','id-3'])c.byNodeId.get(id).issues=[{kind:'analysis-uncertainty',message:'Synthetic unresolved reference'}];
  return c;
}
function disclosureState(s) {
  return Object.fromEntries(Object.entries(disclosureSelectors).filter(([,selector])=>s.host.querySelector(selector)).map(([key,selector])=>[key,!!s.host.querySelector(selector).open]));
}
function setDisclosures(s,state) {
  for(const [key,open] of Object.entries(state))s.host.querySelector(disclosureSelectors[key]).open=open;
}
function clampedInspector(s) {
  // A scroll-range oracle, not browser rendering: the measured f905 closed
  // baseline is 692-644=48. Always-visible primary options add400px; optional disclosures add content.
  // Assigning scroll before opening the saved sections must clamp and fail.
  const root=s.root(),extra={provenance:200,analysis:160};let y=0;
  Object.defineProperties(root,{
    clientHeight:{get:()=>644},
    scrollHeight:{get:()=>1092+Object.entries(extra).reduce((total,[key,height])=>total+(s.host.querySelector(disclosureSelectors[key])?.open?height:0),0)},
    scrollTop:{get:()=>Math.min(y,root.scrollHeight-root.clientHeight),set:value=>{y=Math.max(0,Math.min(value,root.scrollHeight-root.clientHeight));}}
  });
  return root;
}
test('Back retains strict 325px scroll with always-visible options; unrelated disclosures stay closed',async()=>{
  const s=setup(disclosureContext()),root=clampedInspector(s),raw=s.code().textContent;
  setDisclosures(s,{provenance:false,analysis:false});
  s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});root.scrollTop=325;
  s.code().scrollLeft=71;s.code().scrollTop=123;
  const saved=s.inspector.captureViewState();
  assert.deepEqual(plain(saved.disclosures),{provenance:false,analysis:false});
  s.inspector.select('id-3',{open:true});s.inspector.select('id-1',{open:true});
  s.inspector.setFocusControls({mode:'hide',direction:'inputs',depth:0,relatedCount:1,missingCount:0,removableCount:3});
  assert.equal(s.host.querySelector('.pqi-reference-details'),null);assert.equal(root.scrollHeight,1092);assert.equal(root.clientHeight,644);root.scrollTop=325;assert.equal(root.scrollTop,325);
  const p=s.inspector.restoreViewState(saved);s.flush();await p;
  assert.equal(root.scrollTop,325);assert.equal(root.scrollHeight-root.clientHeight,448);
  assert.deepEqual(disclosureState(s),{provenance:false,analysis:false});
  assert.equal(s.code().scrollLeft,71);assert.equal(s.code().scrollTop,123);assert.equal(s.code().textContent,raw);
  assert.equal(s.doc.activeElement,s.host.querySelector('.pqi-reference'));
});
test('all four optional disclosure combinations restore exact scroll and booleans across source selection',async()=>{
  for(let mask=0;mask<4;mask++){
    const s=setup(disclosureContext()),root=clampedInspector(s);
    const state=Object.fromEntries(Object.keys(disclosureSelectors).map((key,index)=>[key,!!(mask&(1<<index))]));
    setDisclosures(s,state);s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});
    root.scrollTop=Math.min(600,root.scrollHeight-root.clientHeight);const saved=s.inspector.captureViewState();
    s.inspector.select('id-3',{open:true});s.inspector.select('id-1',{open:true});setDisclosures(s,{provenance:true,analysis:true});
    const p=s.inspector.restoreViewState(saved);s.flush();await p;
    assert.deepEqual(disclosureState(s),state,'mask '+mask);assert.equal(root.scrollTop,saved.inspectorY,'mask '+mask);
  }
});
test('legacy and partial disclosure state leave absent, invalid and unknown sections untouched',async()=>{
  const s=setup(disclosureContext()),root=clampedInspector(s);
  setDisclosures(s,{provenance:true,analysis:false});
  const legacy=s.inspector.restoreViewState({inspectorY:100,focus:{kind:'reference',nodeId:'id-1',at:0,end:6}});s.flush();await legacy;
  assert.equal(root.scrollTop,100);assert.deepEqual(disclosureState(s),{provenance:true,analysis:false});
  const state={inspectorY:100,disclosures:{analysis:true,references:'true',unknown:true}};
  const p=s.inspector.restoreViewState(state);state.disclosures.analysis=false;s.flush();await p;
  assert.deepEqual(disclosureState(s),{provenance:true,analysis:true});assert.equal(root.scrollTop,100);
  const absent=setup();assert.deepEqual(plain(absent.inspector.captureViewState().disclosures),{provenance:false});
  const q=absent.inspector.restoreViewState({disclosures:{analysis:true}});absent.flush();await q;assert.equal(absent.host.querySelector('.pqi-analysis-details'),null);
});
test('restored primary focus preserves scroll, and focus-triggered navigation cannot receive old scroll',async()=>{
  const s=setup(disclosureContext()),root=clampedInspector(s);
  const legacy=s.inspector.restoreViewState({inspectorY:325,focus:{kind:'focus-depth',nodeId:'id-1'}});s.flush();await legacy;
  assert.equal(root.scrollTop,325);assert.deepEqual(disclosureState(s),{provenance:false,analysis:false});
  const reference=s.host.querySelector('.pqi-reference');
  reference.focus=()=>{s.doc.activeElement=reference;s.inspector.select('id-3',{open:true});};
  const p=s.inspector.restoreViewState({inspectorY:325,codeY:99,disclosures:{provenance:true,analysis:true},focus:{kind:'reference',nodeId:'id-1',at:0,end:6}});s.flush();await p;
  assert.equal(root.scrollTop,0);assert.equal(s.code().scrollTop,0);assert.equal(s.host.querySelector('.pqi-title').textContent,'Query 3');
  assert.deepEqual(disclosureState(s),{provenance:false,analysis:false});
});
test('stale disclosure restores cannot reopen prior or current source after any lifecycle cancellation',async()=>{
  for(const action of ['new','same','close','suspend','reset','destroy','focus','newer']){
    const s=setup(disclosureContext()),oldDetails=s.host.querySelector('.pqi-provenance');
    const p=s.inspector.restoreViewState({inspectorY:325,disclosures:{provenance:true,analysis:true},focus:{kind:'focus-depth',nodeId:'id-1'}});
    s.runFrame();const queued=[...s.frames.values()];let newer;
    if(action==='new')s.inspector.select('id-3',{open:true});
    if(action==='same')s.inspector.select('id-1',{open:true});
    if(action==='close')s.inspector.select('id-1',{open:false});
    if(action==='suspend')s.inspector.suspend(true);
    if(action==='reset'){s.inspector.setContext(disclosureContext(2));s.inspector.select('id-1',{open:true});}
    if(action==='destroy')s.inspector.destroy();
    if(action==='focus')s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});
    if(action==='newer')newer=s.inspector.restoreViewState({disclosures:{provenance:false,analysis:false}});
    queued.forEach(fn=>fn());s.flush();await p;if(newer)await newer;
    assert.equal(!!oldDetails.open,false,action+' detached disclosure');
    for(const open of Object.values(disclosureState(s)))assert.equal(open,false,action+' current disclosure');
  }
});
test('primary neighborhood controls stay visible, default wrap is true and explicit saved false survives history',async()=>{
  const s=setup();assert.equal(s.host.querySelector('.pqi-reference-details'),null);
  assert.equal(s.host.querySelector('select').closest('details'),null);assert.equal(s.code().classList.contains('pqi-wrap'),true);
  const p=s.inspector.restoreViewState({wrap:false,disclosures:{references:true}});s.flush();await p;assert.equal(s.code().classList.contains('pqi-wrap'),false);
  const saved=s.inspector.captureViewState();s.inspector.select('id-3',{open:true});s.inspector.select('id-1',{open:true});
  const q=s.inspector.restoreViewState(saved);s.flush();await q;assert.equal(s.inspector.captureViewState().wrap,false);
});
test('expanded reader moves exact code DOM, copies original CRLF/UTF16 source, Escape closes reader first and returns focus',async()=>{
  const c=context(),row=c.byNodeId.get('id-1');row.code='// 😀 '+'.'.repeat(400)+'\r\nServer\r\n';const at=row.code.indexOf('Server');row.occurrences=[{at,end:at+6,targetId:'id-0'}];
  const s=setup(c),code=s.code(),reference=s.host.querySelector('.pqi-reference'),copied=[];s.win.navigator.clipboard.writeText=raw=>{copied.push(raw);return Promise.resolve();};
  const expand=s.host.querySelectorAll('button').find(b=>b.textContent==='Expand M');expand.fire('click');
  const dialog=s.host.querySelector('.pqi-reader');assert.equal(dialog.open,true);assert.equal(s.code(),code);assert.equal(code.closest('.pqi-reader'),dialog);assert.equal(s.host.querySelector('.pqi-reference'),reference);assert.equal(s.inspector.captureViewState().expanded,true);
  s.host.querySelectorAll('button').find(b=>b.textContent==='Copy M').fire('click');await Promise.resolve();assert.equal(copied[0],row.code);assert.equal(s.host.querySelectorAll('.pqi-source-line').map(e=>e.textContent).join(''),row.code);
  s.inspector.focus({kind:'reference',nodeId:'id-1',at,end:at+6});const e=reference.fire('keydown',{key:'Escape'});
  assert.equal(e.defaultPrevented,true);assert.equal(e.stopped,true);assert.equal(dialog.open,false);assert.equal(s.events.close.length,0);assert.equal(s.doc.activeElement,expand);assert.equal(s.code(),code);assert.equal(s.inspector.captureViewState().expanded,false);
  expand.fire('keydown',{key:'Escape'});assert.equal(s.events.close.length,1);
});
test('expanded history restores source focus/scroll and cannot reopen after stale lifecycle work',async()=>{
  const s=setup(),expand=()=>s.host.querySelectorAll('button').find(b=>b.textContent==='Expand M').fire('click');expand();s.code().scrollTop=81;s.inspector.focus({kind:'reference',nodeId:'id-1',at:0,end:6});const saved=s.inspector.captureViewState();
  s.inspector.select('id-3',{open:true});s.inspector.select('id-1',{open:true});const p=s.inspector.restoreViewState(saved);s.flush();await p;
  assert.equal(s.host.querySelector('.pqi-reader').open,true);assert.equal(s.code().scrollTop,81);assert.equal(s.inspector.captureViewState().focus.kind,'reference');
  for(const action of ['new','same','close','suspend','reset','destroy']){
    const t=setup(),q=t.inspector.restoreViewState(saved);t.runFrame();const queued=[...t.frames.values()];
    if(action==='new')t.inspector.select('id-3',{open:true});if(action==='same')t.inspector.select('id-1',{open:true});if(action==='close')t.inspector.select('id-1',{open:false});if(action==='suspend')t.inspector.suspend(true);if(action==='reset')t.inspector.setContext(context(2));if(action==='destroy')t.inspector.destroy();queued.forEach(fn=>fn());await q;
    assert.equal(!!t.host.querySelector('.pqi-reader')?.open,false,action);
  }
});
test('reader keyboard boundary stays inside, and native-dialog autofocus navigation cancels old view restore',async()=>{
  const s=setup();s.host.querySelectorAll('button').find(b=>b.textContent==='Expand M').fire('click');
  const close=s.host.querySelectorAll('button').find(b=>b.textContent==='Close expanded reader'),last=s.host.querySelector('.pqi-reference');
  last.focus();const tab=last.fire('keydown',{key:'Tab'});assert.equal(tab.defaultPrevented,true);assert.equal(s.doc.activeElement,close);
  const reverse=close.fire('keydown',{key:'Tab',shiftKey:true});assert.equal(reverse.defaultPrevented,true);assert.equal(s.doc.activeElement,last);
  close.fire('click');const old=s.host.querySelector('.pqi-reader');
  old.showModal=()=>{old.open=true;s.inspector.select('id-3',{open:true});};
  const p=s.inspector.restoreViewState({expanded:true,wrap:false,codeY:99,inspectorY:99});s.flush();await p;
  assert.equal(s.host.querySelector('.pqi-title').textContent,'Query 3');assert.equal(s.inspector.captureViewState().expanded,false);assert.equal(s.code().scrollTop,0);assert.equal(s.inspector.captureViewState().wrap,true);assert.equal(old.open,false);
});
