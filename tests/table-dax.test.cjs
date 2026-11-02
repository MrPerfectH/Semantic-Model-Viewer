const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const modelTools=require('../Models/tools/viewer/scripts/cli/model.cjs');
const root=path.resolve(__dirname,'../Models/tools/viewer');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const c=modelTools.runtime();
 for(const f of ['dax-format','table-dax'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);
 const {model,app}=modelTools.readModel(c,path.join(__dirname,'../Models/demo/Contoso Retail.SemanticModel'));
 return {c,api:c.TableDax,app,model};
}
test('field parameter entries retain labels, orders, and typed NAMEOF targets',()=>{
 const {api,app,model}=fixture(),a=api.analyze(app,model.byName['Metric Selector']);
 assert.deepEqual(plain(a.fields.map(f=>[f.label,f.order,f.target.kind,f.target.name])),[['Total Sales',0,'measure','Total Sales'],['Gross Profit',1,'measure','Gross Profit'],['Units Sold',2,'measure','Units Sold'],['Order Count',3,'measure','Order Count']]);
 const graph=api.graph(app,a,false);
 assert.equal(graph.nodes.length,5);assert.equal(graph.edges.length,4);assert.ok(graph.edges.every(e=>e.to===graph.root.id&&e.label==='Selectable field'));
 const dimensions=api.analyze(app,model.byName['Dimension Selector']);assert.ok(dimensions.fields.every(f=>f.target.kind==='column'));
});
test('field references exclude strings and comments, preserve repeated choices, and disclose missing targets',()=>{
 const {api,app,model}=fixture(),table=model.byName['Metric Selector'];
 table.dax=`{("Say ""yes""",NAMEOF([Total Sales]),5),("Again",NAMEOF([Total Sales]),2),("Missing",NAMEOF('Gone'[Nope]),3)} // NAMEOF([Gross Profit])`;
 const a=api.analyze(app,table);assert.deepEqual(plain(a.fields.map(f=>[f.label,f.order])),[['Say "yes"',5],['Again',2],['Missing',3]]);
 assert.equal(a.fields[2].target,null);assert.equal(api.graph(app,a,false).edges.length,1);assert.ok(a.notes.some(n=>n.includes('could not be resolved')));
 table.dax='"NAMEOF([Gross Profit]) SELECTEDMEASURE()" /* SELECTEDMEASURE() */';
 const b=api.analyze(app,table);assert.equal(b.fields.length,0);assert.equal(b.contextual.length,0);assert.equal(b.refs.measures.length,0);
});
test('calculation items and format expressions have independent references and contextual calls',()=>{
 const {api,app,model}=fixture(),table=model.byName['Time Intelligence'];table.calcItems.find(i=>i.name==='YTD').formatExpression='IF(SELECTEDMEASURE() > [Total Sales], SELECTEDMEASUREFORMATSTRING(), "0")';
 const a=api.analyze(app,table,'YTD');assert.deepEqual(plain(a.contextual),['SELECTEDMEASURE()']);assert.equal(a.refs.measures.length,0);assert.deepEqual(plain(a.refs.columns),[{t:'Date',cs:['Date']}]);
 const f=api.analyze(app,table,'YTD','format');assert.deepEqual(plain(f.refs.measures),['Total Sales']);assert.equal(f.refs.columns.length,0);assert.deepEqual(plain(f.contextual),['SELECTEDMEASURE()','SELECTEDMEASUREFORMATSTRING()']);
 const g=api.graph(app,a,true);assert.ok(!g.nodes.some(n=>n.kind==='measure'));assert.equal(g.root.kind,'calculationGroup');
});
test('measure expansion follows inputs with cycle guards and disclosed graph limits',()=>{
 const {api,app,model}=fixture(),a=api.analyze(app,model.byName['Metric Selector']);
 const g=api.graph(app,a,true);assert.ok(g.nodes.length>5);assert.ok(g.nodes.some(n=>n.kind==='column'&&n.table==='Sales'));
 const revenue=app.msrOf('Total Sales');revenue.dax='[Gross Profit]';app.msrOf('Gross Profit').dax='[Total Sales]';
 const cyclic=api.graph(app,a,true);assert.ok(cyclic.nodes.length<20);
 revenue.dax=model.byName.Product.columns.map(c=>"'Product'["+c.name+']').join('+');
 for(let i=0;i<120;i++)model.byName.Product.columns.push({name:'Extra'+i});
 revenue.dax=model.byName.Product.columns.map(c=>"'Product'["+c.name+']').join('+');
 const capped=api.graph(app,a,true);assert.ok(capped.limited);assert.ok(capped.nodes.length<=80);assert.ok(capped.edges.length<=160);
});
test('calculated tables and missing calculation-item metadata remain inspectable without invented expressions',()=>{
 const {api,app}=fixture(),t={name:'Derived',dax:'VALUES(Product[Product Name])'};
 assert.equal(api.kind(t),'calculatedTable');assert.equal(api.analyze(app,t).refs.columns[0].t,'Product');
 const empty={name:'Empty group',calculationGroup:{precedence:10},calcItems:[]};const a=api.analyze(app,empty);assert.equal(a.expression,'');assert.equal(a.item,undefined);
 assert.equal(api.kind({name:'Imported'}),null);
});
test('calculated-object selection snapshots share Measures preferences and restore typed roots',()=>{
 const {c,app,model}=fixture();app.state={loaded:true,viewMode:'measures',selected:'Time Intelligence'};
 const renderer=app.measures=new c.MeasuresView(app,null),view=app.tableDax=new c.TableDaxView(app,{});
 view.mode='calculation';view.objectTable='Time Intelligence';view.items['Time Intelligence']='YTD';view.scope='format';view.selectExpression();
 renderer._workspaceMode='dax';renderer._wrapDax=false;renderer._splitLayout='below';
 const saved=plain(view.captureSnapshot());assert.equal(saved.version,3);view.restoreSnapshot(saved);
 assert.equal(view.isActive(),true);assert.equal(view.items['Time Intelligence'],'YTD');assert.equal(renderer._workspaceMode,'dax');assert.equal(renderer._wrapDax,false);assert.equal(renderer._splitLayout,'below');
 assert.equal(renderer._snapshotViewport.selected,view.rootKey());
 view.restoreSnapshot({...saved,table:'Missing',items:{Missing:'YTD','Time Intelligence':'Missing'}});assert.equal(view.isActive(),false);assert.deepEqual(plain(view.items),{});
 view.restoreSnapshot({version:2,active:true,table:'Metric Selector',display:'graph',format:'short',wrap:true});assert.equal(view.isActive(),true);assert.equal(renderer._workspaceMode,'graph');assert.equal(renderer._fmt,'short');
 assert.equal(view.supports(model.byName.Sales),false);
});
test('table expressions use the exact Measures formatter and syntax-token styles',()=>{
 const {c,app}=fixture(),renderer=new c.MeasuresView(app,null),measure=app.msrOf('Gross Margin %');
 for(const fmt of ['original','long','short']){renderer._fmt=fmt;const a=renderer.daxCard(measure.name),b=renderer.expressionCard(measure.name,app.model.msrHome[measure.name],measure.dax);assert.deepEqual(plain(a.printed||a.toks),plain(b.printed||b.toks));}
});
function measureGraphFixture(name='Order Count'){
 const f=fixture();f.app.state={viewMode:'measures',loaded:true,selMeasure:name,gExtra:{}};f.app.tableColor=()=>'#3b82f6';
 f.app.tableDax={isActive:()=>false,objects:()=>f.api.objects(f.app)};
 const view=new f.c.MeasuresView(f.app,null);view._showSources=true;view._showCalculated=true;return {...f,view};
}
test('Measures adds a field-parameter consumer downstream of a measure, never upstream',()=>{
 const {view}=measureGraphFixture();const g=view.buildGraph(),card=g.calculations.find(c=>c.object.table==='Metric Selector');assert.ok(card);
 const raw=view._gC.g;assert.ok(raw.geo.some(e=>e.a==='Order Count'&&e.b===card.id&&e.label==='Selectable field'));
 assert.equal(view.flowKids('Order Count','up').includes(card.id),false);assert.ok(!raw.geo.some(e=>e.a===card.id&&e.b==='Order Count'));
 view._showCalculated=false;assert.equal(view.buildGraph().calculations.length,0);
 view._showCalculated=true;view._showSources=false;assert.equal(view.buildGraph().calculations.length,0);
});
test('calculation groups require explicit measure references, including separate format references',()=>{
 const {view,model}=measureGraphFixture('Total Sales');let g=view.buildGraph();const ids=g.calculations.filter(c=>c.object.table==='Time Intelligence').map(c=>c.id);assert.ok(!view._gC.g.geo.some(e=>e.a==='Total Sales'&&ids.includes(e.b)));assert.ok(!g.calculations.some(c=>c.object.table==='Time Intelligence'&&c.object.item==='Current'));
 model.byName['Time Intelligence'].calcItems.find(c=>c.name==='YTD').formatExpression='IF([Total Sales]>0,"0",SELECTEDMEASUREFORMATSTRING())';view._gC=null;
 g=view.buildGraph();const card=g.calculations.find(c=>c.object.table==='Time Intelligence'&&c.object.item==='YTD');assert.ok(card);
 assert.ok(view._gC.g.geo.some(e=>e.a==='Total Sales'&&e.b===card.id&&e.scope==='format'&&e.label==='Format reference'));
});
test('source analysis can show calculated-column consumers and remains bounded in every orientation',()=>{
 const {view,app}=measureGraphFixture();app.state.selMeasure=null;app.state.dependencySource={table:'Product',column:'List Price'};
 for(const orientation of ['lr','tb','bt']){view._graphOrientation=orientation;view._gC=null;const g=view.buildGraph();const card=g.calculations.find(c=>c.object.column==='Price Band');assert.ok(card);assert.ok(g.w>=card.x+card.w);assert.ok(g.h>=card.y+card.h);assert.ok(view._gC.g.geo.some(e=>e.b===card.id&&e.a===view.sourceKey('Product','List Price')));}
});
test('calculated-consumer display limits are explicit rather than silently dropping all consumers',()=>{
 const {view,model}=measureGraphFixture();for(let i=0;i<100;i++){const table={name:'Calculated '+i,dax:'[Order Count]',columns:[],measures:[]};model.tables.push(table);model.byName[table.name]=table;}
 const g=view.buildGraph();assert.equal(g.calculations.length,80);assert.equal(g.calculationsCapped,true);
});
test('calculated-column readers retain their own typed identity and definition',()=>{
 const {api,app,model}=fixture(),a=api.analyze(app,model.byName.Product,null,'expression','Price Band');assert.equal(a.kind,'calculatedColumn');assert.equal(a.column,'Price Band');assert.deepEqual(plain(a.refs.columns),[{t:'Product',cs:['List Price']}]);
 const entries=api.objects(app);assert.ok(entries.some(o=>o.column==='Price Band'));assert.equal(entries.filter(o=>o.table==='Time Intelligence').length,4);
});

function selectedCalculationFixture(table,item,column){
 const f=measureGraphFixture();f.app.measures=f.view;const selected=f.app.tableDax=new f.c.TableDaxView(f.app,{});
 selected.mode='calculation';selected.objectTable=table;selected.column=column||null;selected.items[table]=item;selected.selectExpression();return {...f,selected};
}
test('selected field parameters use the standard layered graph and preserve model measure identities',()=>{
 const {view,selected,model}=selectedCalculationFixture('Metric Selector');
 const measures=Object.keys(model.msrHome),g=view.buildGraph(),root=selected.rootKey();
 assert.equal(g.root,root);assert.ok(g.nodes.some(n=>n.name===root&&n.label==='Metric Selector'));
 assert.ok(['Total Sales','Gross Profit','Units Sold','Order Count'].every(n=>g.nodes.some(node=>node.name===n)));
 assert.equal(view._gC.g.geo.filter(e=>e.b===root).length,4);assert.equal(g.calculations.some(c=>c.id===root),false);
 assert.deepEqual(Object.keys(model.msrHome),measures);assert.equal(view.flowKids(root,'down').length,0);
});
test('calculated consumers have one named row and lower consumer links leave the measure bottom',()=>{
 const {view}=measureGraphFixture(),g=view.buildGraph(),c=g.calculations.find(c=>c.object.table==='Metric Selector'),a=g.xy['Order Count'];
 assert.equal(c.rows.length,0);assert.equal(c.h,34);
 const edge=view._gC.g.geo.find(e=>e.a==='Order Count'&&e.b===c.id);assert.ok(edge.d.startsWith('M'+(a.x+a.w/2)+','+(a.y+34)+' C'));
});
test('selected calculation items retain contextual functions without invented measure dependencies',()=>{
 const {view,selected}=selectedCalculationFixture('Time Intelligence','YTD'),g=view.buildGraph();
 assert.equal(g.nodes.length,1);assert.equal(g.nodes[0].name,selected.rootKey());
 assert.ok(g.sources.some(s=>s.table==='Date'&&s.columns.includes('Date')));
 assert.equal(view._gC.g.geo.filter(e=>e.b===selected.rootKey()).length,1);
 assert.ok(selected.analysis.contextual.includes('SELECTEDMEASURE()'));
});
