/* Source planner/transaction smoke only; Power BI engine verification is separate. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createService}=require('../../../tools/rename/service.cjs');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'smv-pbip-acceptance-'));
const model=path.join(scratch,'Rename Acceptance.SemanticModel');
try {
 for(const name of ['Rename Acceptance.SemanticModel','Rename Acceptance.Report','Rename Acceptance.pbip'])fs.cpSync(path.join(__dirname,name),path.join(scratch,name),{recursive:true});
 const service=createService();
 for(const request of [{kind:'measure',table:'Sales',name:'Total Sales',newName:'Revenue'},{kind:'column',table:'Sales',name:'Amount',newName:'Net Amount'},{kind:'table',table:'Sales',name:'Sales',newName:'Orders'}]){
  const preview=service.preview(scratch,model,request);assert.deepEqual(preview.blockers,[]);assert.ok(preview.changes.some(f=>f.path.includes('.Report/')));assert.ok(preview.changes.some(f=>f.path.includes('.SemanticModel/')));service.apply(preview.token);console.log(request.kind+' rename: '+preview.changes.length+' changed files; transaction applied to temporary copy');
 }
 const sales=fs.readFileSync(path.join(model,'definition/tables/Sales.tmdl'),'utf8');assert.match(sales,/table 'Orders'/);assert.match(sales,/measure 'Revenue'/);assert.match(sales,/SUM\('Orders'\[Net Amount\]\)/);assert.match(sales,/sourceColumn: \[Amount\]/);
 const total=JSON.parse(fs.readFileSync(path.join(scratch,'Rename Acceptance.Report/definition/pages/Acceptance/visuals/TotalSalesCard/visual.json')));assert.equal(total.visual.query.queryState.Values.projections[0].queryRef,'Orders.Revenue');
 console.log('Source smoke passed. This does not verify Power BI engine loading or visual rendering.');
} finally {fs.rmSync(scratch,{recursive:true,force:true});}
