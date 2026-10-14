const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planModelRename: plan } = require('../Models/tools/viewer/js/model-rename.js');
const file = (text, path = 'tables/Sales.tmdl') => ({ path, text });
const rename = { kind: 'measure', table: 'Sales', name: 'Total', newName: 'Revenue' };
test('updates original multi-file qualified and bare measure references without strings/comments', () => {
 const files = [file('table Sales\r\n\tmeasure Total = 1\r\n\tmeasure Next = [Total] + Sales[Total] + "[Total]" // [Total]\r\n'), file('table Other\n\tmeasure Copy = [Total]\n', 'Other.tmdl')];
 const result = plan(files, rename);
 assert.deepEqual(result.blockers, []);
 assert.equal(result.files[0].text, 'table Sales\r\n\tmeasure \'Revenue\' = 1\r\n\tmeasure Next = [Revenue] + Sales[Revenue] + "[Total]" // [Total]\r\n');
 assert.match(result.files[1].text, /\[Revenue\]/);
});
test('table VAR shadowing blocks unresolved scope and block comments remain untouched', () => {
 const source = "table Sales\n\tcolumn Amount\n\tmeasure X =\n\t\tVAR Sales = 1\n\t\tRETURN Sales + SUM('Sales'[Amount]) /*\n\t\t Sales[Amount]\n\t\t*/\n";
 const result = plan([file(source)], {kind:'table', name:'Sales', newName:'New Sales'});
 assert.match(result.blockers.join(), /local DAX variable/);
 assert.equal(result.files.length,0);
 const safe = plan([file(source.replace('VAR Sales = 1','VAR Value = 1').replace('RETURN Sales','RETURN Value'))],{kind:'table', name:'Sales',newName:'New Sales'});
 assert.deepEqual(safe.blockers,[]);
 assert.match(safe.files[0].text,/SUM\('New Sales'/);
 assert.match(safe.files[0].text,/\n\t\t Sales\[Amount\]/);
});
test('column declaration, NAMEOF, hierarchy, sortBy and relationships use exact identity', () => {
 const result = plan([file("table Sales\n\tcolumn 'Old Name'\n\tcolumn Sorted\n\t\tsortByColumn: 'Old Name'\n\thierarchy H\n\t\tlevel L\n\t\t\tcolumn: 'Old Name'\n\tmeasure X = NAMEOF(Sales[Old Name])\n"), file("relationship r\n\tfromColumn: Sales.'Old Name'\n\ttoColumn: Other.Id\n", 'relationships.tmdl')], {kind:'column',table:'Sales',name:'Old Name',newName:"It's New"});
 assert.deepEqual(result.blockers, []);
 assert.match(result.files[0].text, /column 'It''s New'/);
 assert.match(result.files[0].text, /Sales\[It's New\]/);
 assert.match(result.files[1].text, /Sales\.'It''s New'/);
});
test('blocks ambiguous bare column/measure and collisions without proposed writes', () => {
 const source = file('table Sales\n\tcolumn Total\n\tmeasure Total = 1\n\tmeasure X = [Total]\n');
 assert.equal(plan([source], rename).files.length, 0);
 assert.match(plan([source], rename).blockers.join(), /ambiguous/);
 assert.match(plan([file('table Sales\n\tmeasure Total = 1\n\tmeasure Revenue = 2\n')], rename).blockers.join(), /collides/);
});
test('blocks BIM, translations and unfamiliar structural syntax', () => {
 for (const unsupported of [file('{}', 'model.bim'), file('culture en-US\n'), file('relationship R\n\tfromColumn: weird syntax\n')]) {
  const result = plan([file('table Sales\n\tmeasure Total = 1\n'), unsupported], rename);
  assert.equal(result.files.length, 0);
  assert.ok(result.blockers.length);
 }
});
test('calculated partition and dynamic expression references renamed', () => {
 const result = plan([file('table Sales\n\tmeasure Total = 1\n\tmeasure X = 1\n\t\tformatStringDefinition = IF([Total], "0", "")\n\tpartition P = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t{ [Total] }\n')], rename);
 assert.deepEqual(result.blockers, []);
 assert.equal((result.files[0].text.match(/\[Revenue\]/g)||[]).length, 2);
});
test('role filters resolve columns in their permission table', () => {
 const result = plan([file('table Sales\n\tcolumn Region\n'),file("role R\n\ttablePermission Sales\n\t\tfilterExpression = [Region] = \"Region\"\n",'roles/R.tmdl')], {kind:'column',table:'Sales',name:'Region',newName:'Area'});
 assert.deepEqual(result.blockers,[]);
 assert.match(result.files[1].text,/\[Area\] = "Region"/);
});
test('table rename updates permission and model references without partition or source column labels', () => {
 const result=plan([file('table Sales\n\tcolumn Id\n\t\tsourceColumn: Sales\n\tpartition Sales = m\n\t\tsource = Sales\n'),file('ref table Sales\n','model.tmdl'),file('role R\n\ttablePermission Sales\n\t\tfilterExpression = Sales[Id] > 0\n','roles/R.tmdl')],{kind:'table',name:'Sales',newName:'Revenue'});
 assert.deepEqual(result.blockers,[]);
 assert.match(result.files[0].text,/sourceColumn: Sales/);
 assert.match(result.files[1].text,/ref table 'Revenue'/);
 assert.match(result.files[2].text,/tablePermission 'Revenue'/);
});
test('escaped identifiers and adjacent expressions preserve unrelated bytes', () => {
 const result=plan([file("table 'Bob''s Sales'\n\tcolumn 'A]B'\n\tmeasure X = 'Bob''s Sales'[A]]B]\n\tmeasure Y = \"literal\"\n")],{kind:'column',table:"Bob's Sales",name:'A]B',newName:'C]D'});
 assert.deepEqual(result.blockers,[]);
 assert.match(result.files[0].text,/\[C\]\]D\]/);
 assert.match(result.files[0].text,/measure Y = "literal"/);
});
test('M partitions and shared expressions never rewrite query identifiers or records', () => {
 const source = "table Sales\n\tcolumn Amount = Sales[Id]\n\t\tsourceColumn: Sales\n\t\tdescription: Sales\n\tcolumn Id\n\tpartition Sales = m\n\t\tsource =\n\t\t\tlet Sales = [Amount = 1] in Sales\n";
 const result=plan([file(source),file('expression Query =\n\tlet Sales = 1 in Sales\n','expressions.tmdl')],{kind:'table',name:'Sales',newName:'Revenue'});
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.files.length,1);
 assert.match(result.files[0].text,/column Amount = 'Revenue'\[Id\]/);
 assert.match(result.files[0].text,/sourceColumn: Sales\n\t\tdescription: Sales/);
 assert.match(result.files[0].text,/let Sales = \[Amount = 1\] in Sales/);
});
test('source object inventory uses original quoted identities and excludes M body declarations',()=>{
 const {listObjects}=require('../Models/tools/viewer/js/model-rename.js');
 assert.deepEqual(listObjects([file("table 'Bob''s Sales'\n\tcolumn 'A]B'\n\tmeasure 'It''s Total' = 1\n\tpartition P = m\n\t\tsource =\n\t\t\tcolumn Fake\n")]),[{kind:'table',table:"Bob's Sales",name:"Bob's Sales"},{kind:'column',table:"Bob's Sales",name:'A]B'},{kind:'measure',table:"Bob's Sales",name:"It's Total"}]);
});
test('metadata-looking comment text cannot terminate a DAX expression',()=>{
 const result=plan([file('table Sales\n\tmeasure Total = 1\n\tmeasure X =\n\t\t/*\n\t\tsourceColumn: Total\n\t\t*/ [Total]\n')],rename);
 assert.deepEqual(result.blockers,[]);
 assert.match(result.files[0].text,/sourceColumn: Total\n\t\t\*\/ \[Revenue\]/);
});
test('virtual DAX columns shadowing model names block bare reference rewrites',()=>{
 for(const constructor of ['SELECTCOLUMNS','ADDCOLUMNS','ROW','SUMMARIZE','SUMMARIZECOLUMNS','GROUPBY']) {
  const result=plan([file('table Sales\n\tcolumn Amount\n\tmeasure Total = 1\n\tmeasure X =\n\t\tVAR x = '+constructor+'(Sales, "Total", Sales[Amount])\n\t\tRETURN SUMX(x, [Total])\n')],rename);
  assert.equal(result.files.length,0);
  assert.match(result.blockers.join(),/virtual DAX column/);
 }
});
test('qualified model references remain supported inside virtual table constructor expressions',()=>{
 const result=plan([file('table Sales\n\tcolumn Amount\n\tmeasure Total = 1\n\tmeasure X = SELECTCOLUMNS(Sales, "Total", Sales[Total])\n')],rename);
 assert.deepEqual(result.blockers,[]);
 assert.match(result.files[0].text,/"Total", Sales\[Revenue\]/);
});
test('Unicode bare DAX table references remain qualified and rename as complete identifiers',()=>{
 const files=[file("table Sales\n\tcolumn Amount\n\tmeasure X = SUM(Żółć[Amount])\n"),file("table 'Żółć'\n\tcolumn Amount\n",'tables/Unicode.tmdl')];
 const column=plan(files,{kind:'column',table:'Sales',name:'Amount',newName:'Value'});
 assert.deepEqual(column.blockers,[]);
 assert.equal(column.files.length,1);
 assert.match(column.files[0].text,/SUM\(Żółć\[Amount\]\)/);
 const table=plan(files,{kind:'table',name:'Żółć',newName:'Unicode Sales'});
 assert.deepEqual(table.blockers,[]);
 assert.match(table.files.find(f=>f.path==='tables/Sales.tmdl').text,/SUM\('Unicode Sales'\[Amount\]\)/);
});
test('Unicode original declarations participate in identity and collision validation',()=>{
 const files=[file('table Żółć\n\tcolumn Amount\n\tmeasure ŻółćTotal = SUM(Żółć[Amount])\n\tmeasure Revenue = 1\n')];
 const inventory=require('../Models/tools/viewer/js/model-rename.js').listObjects(files);
 assert.equal(inventory[0].name,'Żółć');
 const result=plan(files,{kind:'measure',table:'Żółć',name:'ŻółćTotal',newName:'Revenue'});
 assert.match(result.blockers.join(),/collides/);
});
test('unsupported declaration syntax blocks instead of omitting inventory or collisions',()=>{
 const result=plan([file('table Sales\n\tmeasure Total = 1\n\tcolumn unsupported-name\n')],rename);
 assert.equal(result.files.length,0);
 assert.match(result.blockers.join(),/unsupported object declaration/);
});
test('new measure names collide across home tables while columns remain table-scoped',()=>{
 const files=[file('table Sales\n\tcolumn Total\n\tmeasure TotalMeasure = 1\n'),file('table Other\n\tcolumn Revenue\n\tmeasure Revenue = 2\n','tables/Other.tmdl')];
 const measure=plan(files,{kind:'measure',table:'Sales',name:'TotalMeasure',newName:'Revenue'});
 assert.equal(measure.files.length,0);
 assert.match(measure.blockers.join(),/collides/);
 const column=plan(files,{kind:'column',table:'Sales',name:'Total',newName:'Revenue'});
 assert.deepEqual(column.blockers,[]);
});
