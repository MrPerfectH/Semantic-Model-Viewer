'use strict';
const {test}=require('node:test'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {prepare}=require('../Models/tools/viewer/scripts/cli/explain.cjs'),{capture,browserPath}=require('../Models/tools/viewer/scripts/cli/capture.cjs'),{build}=require('../Models/tools/viewer/scripts/cli/compare.cjs');
let browser;try{browser=browserPath();}catch(e){if(process.env.CI)throw e;}
const source=path.join(__dirname,'data/measure-comparison.bim'),view=build(source,{measure:'Sales Amount',with:'Gross Margin LY'}).views[0].view;
async function verify(t,settings,code){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-compare-browser-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const p=prepare(source,{...view,...settings});const script=`<script>{const original=smv.ready;const task=(async()=>{await original();const check=(ok,message)=>{if(!ok)throw new Error(message)};const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));${code}return original();})();smv.ready=()=>task;}</script>`;await capture(p.html.replace('</body>',()=>script+'</body>'),path.join(dir,'verified.png'),p.view);}
test('native rows show shared objects, extra edges and inline definition provenance, with independent inspection',{skip:!browser},async t=>verify(t,{width:1700,height:1650},`
const c=app.measures.comparison;check(c.views.length===2,'two native rows');const [a,b]=c.views;
check(a._showSources&&b._showSources,'sources default on');check(a._g.nodes.length===4&&b._g.nodes.length===8,'scoped graph counts');
check(a._nodeEls['Sales Amount'].btn.dataset.comparisonMembership==='shared','shared measure');
check(b._nodeEls['Material Cost'].btn.dataset.comparisonMembership==='right','extra calculation amber');
const qty=[...b.mainEl.querySelectorAll('.mv-source-column')].find(n=>n.textContent==='Quantity');check(qty.dataset.comparisonMembership==='shared','Quantity shared object');
const edge=b._edgeEls[b.sourceKey('Sales','Quantity')+'\\u0001Material Cost'];check(edge.dataset.comparisonMembership==='right','extra Quantity connection');
check(b.mainEl.querySelector('.mv-dax-body').textContent.includes('SAMEPERIODLASTYEAR'),'date filter visible');
check([...b.mainEl.querySelectorAll('.mv-compare-shared')].some(n=>n.textContent.includes('Unit Price')),'shared definition pink');
check([...b.mainEl.querySelectorAll('.mv-compare-different')].some(n=>n.textContent.includes('SAMEPERIODLASTYEAR')),'wrapper amber');
const markers=[...document.querySelectorAll('marker')].map(n=>n.id);check(new Set(markers).size===markers.length,'unique marker ids');
a.app.setState({gPin:'Gross Sales'});await frame();check(a.graphRoot()==='Sales Amount'&&b.graphRoot()==='Gross Margin LY','roots remain fixed');check(a.app.state.gPin==='Gross Sales'&&!b.app.state.gPin,'inspection isolated');
const x=a._g.xy['Gross Sales'],y=b._g.xy['Gross Sales'];check(x.x===y.x&&x.y===y.y,'shared graph coordinates');
const compact=[...b.mainEl.querySelectorAll('button')].find(n=>n.textContent==='Compact');compact.click();await frame();check(b.mainEl.querySelectorAll('.mv-dax-fold-btn').length>0,'native folding available');
[...b.mainEl.querySelectorAll('button')].find(n=>n.textContent==='Collapse measures').click();await frame();
const saved=smv.inspect().currentView;check(saved.comparison&&saved.state.measures.comparison.rows.length===2,'pair and row state persisted');
await smv.apply(saved);await frame();check(app.measures.comparison.views[0].app.state.gPin==='Gross Sales','row selection restored');check(Object.keys(app.measures.comparison.views[1]._folds).length>0,'fold state restored');
const snap=Snapshots.capture(app);check(snap.measures.comparison.left.name==='Sales Amount','native snapshot captures pair');
app.loadSnapshot(snap);await frame();await frame();check(app.measures.comparison.views[0].app.state.gPin==='Gross Sales','native snapshot restore keeps row inspection');check(app.measures.comparison.views[1]._plainDax===false,'native snapshot restore keeps DAX mode');
await smv.apply({version:2,mode:'measures',focus:{kind:'measure',table:'Measures',name:'Gross Sales'},banner:false});await frame();check(!app.measures.comparison&&app.measures.graphRoot()==='Gross Sales','ordinary view lifecycle intact');
await smv.reset();check(app.measures.comparison.views.length===2,'authored reset restores comparison');
`));
test('narrow comparison uses accessible tabs, retains hidden row cameras and wraps complex DAX',{skip:!browser},async t=>verify(t,{width:390,height:900},`
const c=app.measures.comparison;check(c.workspace.dataset.layout==='tabs','responsive tabs');check(c.rows[1].hidden&&!c.rows[0].hidden,'first row visible');
check(document.documentElement.scrollWidth<=innerWidth,'no document horizontal overflow');
c.tabs[1].click();await frame();check(!c.rows[1].hidden&&c.rows[0].hidden,'switch tab');check(c.tabs[1].getAttribute('aria-selected')==='true','ARIA selected');
const state=smv.inspect().currentView;await smv.apply(state);await frame();check(app.measures.comparison.active===1,'active tab restored');
const current=app.measures.comparison;current.tabs[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await frame();check(current.active===0,'keyboard tabs');
const controls=current.strip.querySelectorAll('select');controls[1].value='Margin by Product';controls[1].dispatchEvent(new Event('change'));await frame();check(app.measures.comparison.spec.right.name==='Margin by Product','pair changes');
const body=app.measures.comparison.views[1].mainEl.querySelector('.mv-dax-body');check(body&&body.textContent.includes('SUMX'),'complex DAX retained');
`));

test('authored tabs start on the requested row and exiting returns to that measure',{skip:!browser},async t=>verify(t,{comparison:{...view.comparison,active:1,layout:'tabs'}},`
const c=app.measures.comparison;check(c.active===1&&c.layout==='tabs'&&c.rows[0].hidden,'authored active tab');
[...c.strip.querySelectorAll('button')].find(n=>n.textContent==='Exit comparison').click();await frame();check(!app.measures.comparison&&app.state.selMeasure==='Gross Margin LY','exit returns to active root');check(app.measures._nodeEls['Gross Margin LY'].btn.isConnected,'ordinary graph reattaches native nodes after exit');
`));
