'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planReportRename}=require('../tools/rename/report-references.cjs');
const binding={path:'Demo.Report/definition.pbir',text:'{"datasetReference":{"byPath":{"path":"../Demo.SemanticModel"}}}'};
const plan=(text,rename={kind:'measure',table:'Sales',name:'Total',newName:'Revenue'})=>planReportRename([binding,{path:'Demo.Report/definition/pages/a/visuals/b/visual.json',text}],{relativeSemanticModelPath:'Demo.SemanticModel'},rename);
test('typed references and queryRef change without changing labels or whitespace',()=>{
 const input=`{\n  "visual": { "Measure": {"Expression":{"SourceRef":{"Entity":"Sales"}},"Property":"Total"}, "queryRef":"Sales.Total", "displayName":"Total", "literal":"Sales.Total" }\n}`;
 const result=plan(input);assert.deepEqual(result.blockers,[]);assert.equal(result.changes[0].text,input.replace('"Property":"Total"','"Property":"Revenue"').replace('"queryRef":"Sales.Total"','"queryRef":"Sales.Revenue"'));
});
test('aliases in semantic query update bound column and projection refs',()=>{
 const input=JSON.stringify({From:[{Name:'s',Entity:'Sales'},{Name:'o',Entity:'Other'}],Select:[{Column:{Expression:{SourceRef:{Source:'s'}},Property:'Total'}},{Column:{Expression:{SourceRef:{Source:'o'}},Property:'Total'}}],projections:[{queryRef:'s.Total'}]});
 const result=plan(input,{kind:'column',table:'Sales',name:'Total',newName:'Net'});const output=JSON.parse(result.changes[0].text);assert.equal(output.Select[0].Column.Property,'Net');assert.equal(output.Select[1].Column.Property,'Total');assert.equal(output.projections[0].queryRef,'s.Net');
});
test('escaped property and array tokens remain valid',()=>{
 const result=plan(JSON.stringify([{Column:{Expression:{SourceRef:{Entity:'Sales'}},Property:'A"B'}}]),{kind:'column',table:'Sales',name:'A"B',newName:'C\\D'});assert.equal(JSON.parse(result.changes[0].text)[0].Column.Property,'C\\D');
});
test('table rename updates typed entities and queryRefs',()=>{
 const result=plan('{"Column":{"Expression":{"SourceRef":{"Entity":"Sales"}},"Property":"Total"},"queryRef":"Sales.Total","caption":"Sales"}',{kind:'table',table:'Sales',name:'Sales',newName:'Orders'});assert.equal(JSON.parse(result.changes[0].text).queryRef,'Orders.Total');assert.equal(JSON.parse(result.changes[0].text).caption,'Sales');
});
test('unrelated model reports remain untouched',()=>{
 const result=planReportRename([{...binding,text:binding.text.replace('../Demo.SemanticModel','../Other.SemanticModel')},{path:'Demo.Report/definition/visual.json',text:'{"queryRef":"Sales.Total"}'}],{relativeSemanticModelPath:'Demo.SemanticModel'},{kind:'measure',table:'Sales',name:'Total',newName:'Revenue'});assert.equal(result.changes.length,0);assert.equal(result.blockers.length,0);
});
test('external and missing bindings and legacy report block save',()=>{
 for(const files of [[{...binding,text:'{"datasetReference":{"byConnection":{}}}'}],[{path:'Demo.Report/definition/visual.json',text:'{}'}],[binding,{path:'Demo.Report/report.json',text:'{}'}]]) {assert.ok(planReportRename(files,{relativeSemanticModelPath:'Demo.SemanticModel'},{kind:'measure',table:'Sales',name:'Total',newName:'Revenue'}).blockers.length);}
});
test('invalid and duplicate-key JSON block save',()=>{
 for(const text of ['{','{"x":1,"x":2}']) assert.ok(plan(text).blockers.length);
});
test('embedded DAX and unknown matching properties block save',()=>{
 assert.ok(plan('{"expression":"SUM(Sales[Total])"}').blockers.length);assert.ok(plan('{"Property":"Total"}').blockers.length);
});
test('hierarchy and queryRefs arrays use schema reference names',()=>{
 const result=plan('{"Hierarchy":{"Expression":{"SourceRef":{"Entity":"Sales"}},"Hierarchy":"Calendar"},"queryRefs":["Sales.Calendar"],"label":"Calendar"}',{kind:'hierarchy',table:'Sales',name:'Calendar',newName:'Fiscal'});assert.deepEqual(result.blockers,[]);const output=JSON.parse(result.changes[0].text);assert.equal(output.Hierarchy.Hierarchy,'Fiscal');assert.deepEqual(output.queryRefs,['Sales.Fiscal']);assert.equal(output.label,'Calendar');
});
test('unknown properties are blocked even when another typed reference exists',()=>{
 assert.ok(plan('{"Measure":{"Expression":{"SourceRef":{"Entity":"Sales"}},"Property":"Total"},"unknown":{"Property":"Total"}}').blockers.length);
});
test('standard aggregation wrappers and semantic Select names are rewritten losslessly',()=>{
 for(const fn of ['Sum','Min','Max','CountNonNull','Count','Avg','Average','Median','DistinctCount','StandardDeviation','Variance']) {
 const input=JSON.stringify({From:[{Name:'s',Entity:'Sales'}],Select:[{Aggregation:{Expression:{Column:{Expression:{SourceRef:{Source:'s'}},Property:'Total'}},Function:0},Name:fn+'(s.Total)'}],queryRef:fn+'(Sales.Total)',queryRefs:[fn+'(s.Total)'],label:fn+'(Sales.Total)'});
 const result=plan(input,{kind:'column',table:'Sales',name:'Total',newName:'Net'});assert.deepEqual(result.blockers,[]);const output=JSON.parse(result.changes[0].text);assert.equal(output.Select[0].Name,fn+'(s.Net)');assert.equal(output.queryRef,fn+'(Sales.Net)');assert.equal(output.queryRefs[0],fn+'(s.Net)');assert.equal(output.label,fn+'(Sales.Total)');
 }
});
test('unknown aggregation wrapper and unresolved semantic alias block',()=>{
 assert.ok(plan('{"queryRef":"Unknown(Sales.Total)"}').blockers.length);
 assert.ok(plan('{"Measure":{"Expression":{"SourceRef":{"Source":"missing"}},"Property":"Total"}}').blockers.length);
});
test('UTF-8 BOM is retained with exact token offsets',()=>{
 const input='\uFEFF { "queryRef": "Sales.Total", "label": "Total" }';const result=plan(input);assert.deepEqual(result.blockers,[]);assert.equal(result.changes[0].text,'\uFEFF { "queryRef": "Sales.Revenue", "label": "Total" }');
});
test('case-insensitive model identities update references while preserving literal labels',()=>{
 const input=JSON.stringify({Measure:{Expression:{SourceRef:{Entity:'sales'}},Property:'TOTAL SALES'},queryRef:'sales.total sales',queryRefs:['sum(sales.TOTAL SALES)'],label:'TOTAL SALES'});
 const result=plan(input,{kind:'measure',table:'Sales',name:'Total Sales',newName:'Revenue'});assert.deepEqual(result.blockers,[]);const out=JSON.parse(result.changes[0].text);assert.equal(out.Measure.Property,'Revenue');assert.equal(out.queryRef,'Sales.Revenue');assert.equal(out.queryRefs[0],'sum(Sales.Revenue)');assert.equal(out.label,'TOTAL SALES');
});
test('table rename supports lowercase entities and mixed case query refs',()=>{
 const result=plan('{"SourceRef":{"Entity":"sales"},"queryRef":"MAX(SALES.Amount)","label":"sales"}',{kind:'table',table:'Sales',name:'Sales',newName:'Orders'});assert.deepEqual(result.blockers,[]);const out=JSON.parse(result.changes[0].text);assert.equal(out.SourceRef.Entity,'Orders');assert.equal(out.queryRef,'MAX(Orders.Amount)');assert.equal(out.label,'sales');
});
test('case-variant unknown or embedded references block instead of being skipped',()=>{
 for(const text of ['{"Property":"tOtAl"}','{"queryRef":"Unknown(sales.TOTAL)"}','{"expression":"[total]"}','{"Measure":{"Expression":{"SourceRef":{"Source":"unknown"}},"Property":"total"}}']) assert.ok(plan(text).blockers.length,text);
});
test('malformed target reference fields block',()=>{
 for(const text of ['{"Measure":{"Expression":{"SourceRef":{"Entity":"sAlEs"}},"Property":null}}','{"queryRefs":[9]}','{"queryRef":null}']) assert.ok(plan(text).blockers.length,text);
});
