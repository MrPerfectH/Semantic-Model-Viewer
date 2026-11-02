const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../Models/tools/viewer');
const Ref=require(path.join(root,'js/reference.js'));
const Snap=require(path.join(root,'js/snapshot.js'));
function parser(){const c={console};c.window=c;vm.createContext(c);for(const f of ['util','roles','tmdl-parser'])vm.runInContext(fs.readFileSync(path.join(root,'js',f+'.js'),'utf8'),c);return c.TMDLParser;}
const source=`/// Sales transactions at order-line level.
/// Values before discounts.
table Sales
	/// Amount before discounts.
	column Amount
		dataType: decimal
		formatString: $#,0.00
		summarizeBy: sum
		lineageTag: column-amount
	measure Revenue = SUM(Sales[Amount])
		description:
			Revenue before discounts.
			Maintained by Finance.
		formatStringDefinition =
			"$#,0.00"
		lineageTag: measure-revenue
	hierarchy Amounts
		level Amount
			ordinal: 0
			column: Amount
	partition Sales = m
		mode: import
		source =
			let Source = #table({"Amount"}, {{12}}) in Source
`;
const calc=`table 'Time Intelligence'
	calculationGroup
		precedence: 20
		/// Year to date.
		calculationItem YTD = CALCULATE(SELECTEDMEASURE(), DATESYTD('Date'[Date]))
			ordinal: 0
			formatStringDefinition = SELECTEDMEASUREFORMATSTRING()
	column Period
		dataType: string
`;
const files=[{name:'Sales.tmdl',text:source},{name:'Time.tmdl',text:calc}];
test('reference metadata survives JS/Python TMDL imports and allowlisted offline export',()=>{
 const model=parser().parseTMDL(files),t=model.tables[0],cg=model.tables[1];
 assert.equal(t.description,'Sales transactions at order-line level.\nValues before discounts.');
 assert.equal(t.measures[0].dax.trim(),'SUM(Sales[Amount])');
 assert.equal(t.measures[0].description,'Revenue before discounts.\nMaintained by Finance.');
 assert.equal(t.measures[0].formatExpression,'"$#,0.00"');
 assert.equal(t.columns[0].formatString,'$#,0.00');
 assert.equal(t.hierarchies[0].levels[0].column,'Amount');
 assert.equal(t.partitions[0].mode,'import');
 assert.equal(cg.calculationGroup.precedence,20);assert.equal(cg.calcItems[0].description,'Year to date.');assert.equal(cg.calcItems[0].ordinal,0);
 const code=`import sys,json\nsys.path.insert(0,${JSON.stringify(path.join(root,'scripts'))})\nimport tmdl_to_model_data as p\nprint(json.dumps(p.parse_tmdl(json.load(sys.stdin))))`;
 const py=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(files),encoding:'utf8'}));
 for(let i=0;i<2;i++)for(const key of ['description','calculationGroup','calcItems','hierarchies','partitions','columns','measures'])assert.deepEqual(JSON.parse(JSON.stringify(model.tables[i][key]??null)),py.tables[i][key]??null,key);
 t.credentials='must not travel';t.hierarchies[0].secret='must not travel';
 const offline=Snap.modelData(model);assert.equal(offline.tables[0].description,t.description);assert.equal(offline.tables[1].calcItems[0].ordinal,0);assert.equal(offline.tables[1].calculationGroup.precedence,20);assert.equal(offline.tables[0].measures[0].formatExpression,'"$#,0.00"');assert.equal(JSON.stringify(offline).includes('must not travel'),false);
});
test('BIM reference fields, scoped identities, and search work for same-name columns',()=>{
 const model=parser().parseBIM({model:{tables:[{name:'Sales',description:'Order lines',columns:[{name:'Amount',dataType:'decimal',description:'Gross amount',formatString:'$0'}],measures:[],partitions:[{name:'Sales',mode:'import',source:{type:'m',expression:'1'}}],hierarchies:[{name:'Rollup',levels:[{name:'Amount',column:'Amount',ordinal:0}]}]},{name:'Returns',columns:[{name:'Amount',dataType:'decimal'}],measures:[]},{name:'Time',calculationGroup:{precedence:10,calculationItems:[{name:'YTD',expression:'SELECTEDMEASURE()',ordinal:2,description:'Year to date'}]},columns:[],measures:[]}]}});
 const data=Ref.index(model);assert.ok(data.byId.has(Ref.id('column','Sales','Amount')));assert.ok(data.byId.has(Ref.id('column','Returns','Amount')));
 assert.equal(Ref.search(data.objects,'gross','all',false)[0].reason,'Description matches: gross');
 assert.equal(Ref.search(data.objects,'SELECTEDMEASURE','all',false).length,0);
 assert.equal(Ref.search(data.objects,'SELECTEDMEASURE','calculationItem',true).length,1);
 const exported=Snap.modelData(model);assert.equal(exported.tables[0].partitions[0].mode,'import');assert.equal(exported.tables[2].calculationGroup.precedence,10);
});
test('older models still index without claiming metadata completeness',()=>{
 const model={tables:[{name:'Old',columns:[],measures:[]}],relationships:[]};const out=Snap.modelData(model);assert.equal(out.tables[0].referenceVersion,undefined);assert.equal(Ref.index(out).objects.length,1);
});
