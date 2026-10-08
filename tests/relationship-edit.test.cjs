'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareRelationshipPatch:patch}=require('../Models/tools/viewer/js/relationship-edit');
const tables=['A','B','C'].map(t=>({path:'definition/tables/'+t+'.tmdl',text:'table '+t+'\n\tcolumn Id\n\t\tdataType: int64\n'}));
const request={relationshipId:null,fromTable:'A',fromColumn:'Id',toTable:'B',toColumn:'Id',fromCardinality:'many',toCardinality:'one',crossFilteringBehavior:'oneDirection',isActive:true};
const source=text=>tables.concat({path:'definition/relationships.tmdl',text});
const rel=(id,a,b,extra='')=>'relationship '+id+'\n\tfromColumn: '+a+'.Id\n\ttoColumn: '+b+'.Id\n'+extra;
test('first relationship deliberately creates definition source without changing table bytes',()=>{const before=JSON.stringify(tables),p=patch(tables,request,'new-id');assert.equal(p.path,'definition/relationships.tmdl');assert.match(p.text,/relationship new-id/);assert.equal(p.before,'');assert.equal(JSON.stringify(tables),before);});
test('update preserves identity BOM CRLF scalar unknown properties and neighboring objects',()=>{const text='\uFEFF'+(rel('stable','A','B','\tsecurityFilteringBehavior: oneDirection\n\tcustomProperty: keep\n')+'\n'+rel('other','B','C','\tisActive: false\n')).replace(/\n/g,'\r\n');const p=patch(source(text),{...request,relationshipId:'stable',isActive:false},'unused');assert.ok(p.text.startsWith('\uFEFFrelationship stable\r\n'));assert.ok(p.text.includes('\tcustomProperty: keep\r\n'));assert.ok(p.text.endsWith(rel('other','B','C','\tisActive: false\n').replace(/\n/g,'\r\n')));assert.equal(p.relationshipId,'stable');});
test('rejects missing identity, invalid endpoints/settings, unsupported source and duplicate reverse pair',()=>{assert.throws(()=>patch(tables,{...request,relationshipId:'missing'},'new'),/missing/);assert.throws(()=>patch(tables,{...request,fromColumn:'Gone'},'new'),/endpoint/);assert.throws(()=>patch(tables,{...request,crossFilteringBehavior:'automatic'},'new'),/settings/);assert.throws(()=>patch(source('relationship x\n  fromColumn: A.Id\n'),request,'new'),/layout/);assert.throws(()=>patch(source(rel('x','A','B')+rel('y','B','A')),request,'new'),/Duplicate/);assert.throws(()=>patch(source(rel('x','A','B','\tannotation Note = 1\n')),request,'new'),/layout/);});
test('complete raw set validates unresolved semantics instead of trusting deduplicated projection',()=>{assert.throws(()=>patch(source(rel('x','A','Missing')),request,'new'),/unresolved/);assert.throws(()=>patch(source(rel('x','A','C','\tcrossFilteringBehavior: automatic\n')),request,'new'),/unsupported/);});
test('active path boundary rejects triangle but permits inactive candidate',()=>{const files=source(rel('x','A','C')+rel('y','C','B'));assert.throws(()=>patch(files,request,'new'),/active-path/);assert.match(patch(files,{...request,isActive:false},'new').text,/isActive: false/);});
test('cardinality constraints reject invalid one-direction combinations',()=>{assert.throws(()=>patch(tables,{...request,fromCardinality:'one'},'new'),/both directions/);assert.throws(()=>patch(tables,{...request,fromCardinality:'one',toCardinality:'many'},'new'),/one-to-many/);assert.match(patch(tables,{...request,fromCardinality:'one',crossFilteringBehavior:'bothDirections'},'new').text,/bothDirections/);});
test('added properties remain before next relationship leading descriptions and blanks',()=>{const trailing='\n/// Next relationship description\n// Keep this comment\n';const text=rel('x','A','B')+trailing+rel('y','B','C','\tisActive: false\n');const p=patch(source(text),{...request,relationshipId:'x',isActive:false},'unused');assert.ok(p.text.endsWith(trailing+rel('y','B','C','\tisActive: false\n')));assert.ok(p.text.indexOf('isActive: false')<p.text.indexOf('/// Next'));});
test('case variant known properties are validated and replaced once with spelling and colon whitespace preserved',()=>{
  const text="\uFEFFrelationship stable\r\n\tFromColumn : A.Id\r\n\tTOCOLUMN:\tB.Id\r\n\tFromCardinality \t: one\r\n\tToCardinality: one\r\n\tCrossFilteringBehavior : bothDirections\r\n\tIsActive : false\r\n\tCustomScalar : Preserve Me\r\n";
  const p=patch(source(text),{...request,relationshipId:'stable',isActive:false},'unused');
  assert.equal(p.text,text.replace('FromColumn : A.Id',"FromColumn : 'A'.'Id'").replace('TOCOLUMN:\tB.Id',"TOCOLUMN:\t'B'.'Id'").replace('FromCardinality \t: one','FromCardinality \t: many').replace('CrossFilteringBehavior : bothDirections','CrossFilteringBehavior : oneDirection'));
  for(const key of ['isActive','fromCardinality','crossFilteringBehavior'])assert.equal((p.text.match(new RegExp('^\\t'+key+'[ \\t]*:', 'gim'))||[]).length,1);
  assert.throws(()=>patch(source(text.replace('bothDirections','automatic')),{...request,relationshipId:'stable'},'unused'),/settings are unsupported/);
  assert.throws(()=>patch(source(text.replace('bothDirections','oneDirection')),{...request,relationshipId:'stable'},'unused'),/combination is unsupported/);
});
test('case variant inactive status is used by complete raw active path validation',()=>{
  const files=source(rel('x','A','C','\tIsActive : false\n')+rel('y','C','B'));
  assert.match(patch(files,request,'new').text,/relationship new/);
});
test('mixed-case duplicate scalar properties reject even with whitespace before colon',()=>{
  for(const key of ['isActive','fromCardinality','crossFilteringBehavior','customScalar']) {
    const value={isActive:'false',fromCardinality:'many',crossFilteringBehavior:'bothDirections',customScalar:'keep'}[key];
    assert.throws(()=>patch(source(rel('x','A','B','\t'+key+': '+value+'\n\t'+key.toUpperCase()+' \t: '+value+'\n')),{...request,relationshipId:'x'},'unused'),/Duplicate relationship property/);
  }
});
