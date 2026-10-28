'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const comparison=require('../Models/tools/viewer/js/measure-comparison.js'),format=require('../Models/tools/viewer/js/dax-format.js');
const modelAPI=require('../Models/tools/viewer/scripts/cli/model.cjs'),planner=require('../Models/tools/viewer/scripts/cli/compare.cjs'),{validate}=require('../Models/tools/viewer/js/explanation-view.js');
const source=path.join(__dirname,'data/measure-comparison.bim');
function load(records){const context=modelAPI.runtime();return records?modelAPI.readRecords(context,[{name:'model.bim',text:JSON.stringify({model:{tables:records}})}]):modelAPI.readModel(context,source);}
test('comparison distinguishes shared objects from side-specific reference edges and written definitions',()=>{
 const {model}=load(),result=comparison.analyze(model,'Sales Amount',"'Measures'[Gross Margin LY]"),qty=comparison.id('column','Sales','Quantity');
 assert.equal(result.complete,true);assert.equal(result.counts.shared,4);assert.equal(result.counts.right,4);
 assert.equal(result.objects.find(o=>o.id===qty).membership,'shared');
 assert.equal(result.edges.find(e=>e.from===qty&&JSON.parse(e.to)[2]==='Material Cost').membership,'right');
 assert.equal(result.edges.find(e=>e.from===qty&&JSON.parse(e.to)[2]==='Gross Sales').membership,'shared');
 assert.equal(result.objects.find(o=>o.kind==='column'&&o.table==='Date').membership,'right');
 assert.equal(result.definitions[0].dax,model.tables.flatMap(t=>t.measures).find(m=>m.name==='Sales Amount').dax);
 assert.throws(()=>comparison.analyze(model,'Sales Amount','Sales Amount'),/different/);assert.throws(()=>comparison.analyze(model,'Missing','Sales Amount'),/Unknown/);
});
test('qualified names, strings/comments and equal text under different identities are handled factually',()=>{
 const {model}=load([{name:"O'Brien",columns:[{name:'X',dataType:'int64'}],measures:[{name:'A',expression:'SUM ( \'O\'\'Brien\'[X] )'},{name:'B',expression:'SUM ( \'O\'\'Brien\'[X] )'},{name:'Fake',expression:'"[A]" // [B]\n & "ok"'}]}]);
 const same=comparison.analyze(model,"'O''Brien'[A]",{table:"O'Brien",name:'b'});assert.equal(same.counts.shared,0);assert.equal(same.exactFormulaTextEqual,true);assert.equal(same.objects.find(o=>o.kind==='column').membership,'shared');
 const comments=comparison.analyze(model,'Fake','A');assert.equal(comments.objects.find(o=>o.kind==='measure'&&o.name==='B'),undefined);
});
test('inline colors track definition ancestry, preserve compact annotations and leave original formulas untouched',()=>{
 const {model,app}=load(),result=comparison.analyze(model,'Sales Amount','Gross Margin LY');
 const resolve=ref=>{const t=Object.keys(model.msrHome).find(n=>'['+n+']'===ref);return t?{name:t,dax:app.msrOf(t).dax}:null;};
 const original=app.msrOf('Gross Margin LY').dax,printed=comparison.annotate(format.formatInlined(original,'Gross Margin LY',resolve,{strict:true}),'Gross Margin LY',result);
 const parts=format.plainLines(printed).flatMap(l=>l.parts);
 assert.equal(parts.find(p=>p.v==='CALCULATE').comparison,'different');assert.equal(parts.find(p=>p.v.startsWith('SAMEPERIODLASTYEAR')).comparison,'different');
 assert.equal(parts.find(p=>p.v==='Sales[Unit Price]').comparison,'shared');assert.equal(parts.find(p=>p.v==='Sales[Unit Cost]').comparison,'different');
 assert.equal(app.msrOf('Gross Margin LY').dax,original);assert.ok(!format.toText(printed).includes('[Sales Amount]'));
 const unknown=comparison.annotate(format.format('1 + 2'),'A',{objects:[],complete:false});assert.ok(unknown.lines[0].parts.every(p=>p.comparison==='unknown'));
});
test('bounds and cycles constrain work and unknown absence is not labeled unique',()=>{
 const measures=Array.from({length:250},(_,i)=>({name:'M'+i,expression:i<249?'[M'+(i+1)+']':'1'}));
 const {model,app}=load([{name:'Calculations',columns:[],measures}]);const result=comparison.analyze(model,'M0','M100',{maxMeasures:10});assert.equal(result.complete,false);assert.ok(result.warnings.length);assert.ok(result.objects.some(o=>o.membership==='unknown'));assert.ok(result.objects.length<=22);
 const inlined=format.formatInlined('[M1]','M0',ref=>{const n=ref.slice(1,-1);return {name:n,dax:app.msrOf(n).dax};},{strict:true});assert.equal(inlined.capped,true);assert.ok(format.toText(inlined).includes('[M40]'));
 const large=format.formatInlined('[Huge]','Root',()=>({name:'Huge',dax:'1+'.repeat(110000)+'1'}),{strict:true});assert.equal(large.capped,true);assert.match(format.toText(large),/Huge/);
 const cyclic=load([{name:'C',columns:[],measures:[{name:'A',expression:'[B]'},{name:'B',expression:'[A]'}]}]);assert.deepEqual(comparison.analyze(cyclic.model,'A','B').cycles,[true,true]);
 assert.throws(()=>format.formatInlined('SUM (','Root',()=>null,{strict:true}),/Unbalanced/);
});
test('v2 authored and explored comparison schema validates identity and bounds',()=>{
 const {model}=load(),plan=planner.build(source,{measure:'Sales Amount',with:'Gross Margin LY'}),view=plan.views[0].view;
 assert.equal(plan.views.length,1);assert.equal(validate(model,view).focus.name,'Sales Amount');
 for(const changed of [{version:1},{mode:'graph'},{comparison:{...view.comparison,right:view.comparison.left}},{comparison:{...view.comparison,maxMeasures:201}},{comparison:{...view.comparison,left:{kind:'measure',table:'Measures',name:'Missing'}}}])assert.throws(()=>validate(model,{...view,...changed}),/View:/);
 const prepared=require('../Models/tools/viewer/scripts/cli/explain.cjs').prepare(source,view);assert.equal(prepared.summary.comparison.counts.shared,4);assert.match(prepared.html,/measure-comparison-view.js/);
 const engine=require('../packages/engine/index.cjs'),loaded=engine.loadRecords([{name:'model.bim',text:fs.readFileSync(source,'utf8')}],{identity:'vscode-remote://model'});
 assert.deepEqual(engine.compare(loaded,{measure:'Sales Amount',with:'Gross Margin LY'}).analysis.counts,plan.analysis.counts);
});
test('compare CLI exports portable provenance and gives specific errors without starting a session',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv compare '));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=args=>spawnSync(process.execPath,[path.join(__dirname,'../bin/smv.cjs'),'compare',...args],{encoding:'utf8',env:{...process.env,SMV_OPENER:'none'}});
 const output=path.join(temp,'comparison.html'),result=run([source,'--measure','Sales Amount','--with','Gross Margin LY','--out',output,'--json']);assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout);assert.equal(data.analysis.counts.shared,4);assert.ok(data.artifact.bytes>100000);assert.ok(fs.existsSync(data.receiptPath));assert.equal(data.diagram.comparison.complete,true);
 assert.notEqual(run([source,'--measure','Sales Amount']).status,0);assert.equal(run(['--help']).status,0);
});

test('union grouping never hides either comparison root among many sibling calculations',()=>{
 const context=modelAPI.runtime(),names=Array.from({length:30},(_,i)=>'Leaf '+i);
 const {model,app}=load([{name:'Measures',columns:[],measures:names.map(name=>({name,expression:'1',displayFolder:'Shared'})).concat({name:'Root',expression:names.map(n=>'['+n+']').join('+')})}]);
 const view=Object.create(context.MeasuresView.prototype);view.app=app;view.options={comparisonRoots:['Leaf 29','Root']};
 const grouping=view.gGroupColumns([names,['Root']],'Root',31,{});
 assert.equal(grouping.hidden.has('Leaf 29'),false);assert.equal(grouping.hidden.has('Root'),false);assert.ok(grouping.hidden.size>0);
});
