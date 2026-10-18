const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const plain=x=>JSON.parse(JSON.stringify(x));
function api(){const g={};g.window=g;vm.createContext(g);vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/power-query-dependencies.js'),'utf8'),g);return g.PowerQueryDependencies;}
const node=(name,code='1',extra={})=>({id:name,name,code,state:'available',kind:'expression',...extra});
function analyze(code,names=['A','B','Param']){const root=node('Root',code);return plain(api().analyze(root,{nodes:[root,...names.map(name=>node(name))]}));}

test('every repeated occurrence retains exact quoted spelling and UTF-16 end-exclusive range',()=>{
  const spellings=['#"Sales#(0020)😀"','#"Sales 😀"','#"a""b"','Ünicode'];
  const code='/* 😀 shifts UTF-16 offsets */\r\n{'+spellings.concat(spellings[0]).join(',\r\n')+'}';
  const r=analyze(code,['Sales 😀','a"b','Ünicode']);
  assert.deepEqual(r.dependencies.map(d=>d.name),['Sales 😀','a"b','Ünicode']);
  assert.equal(r.references.length,5);
  assert.deepEqual(r.references.map(ref=>code.slice(ref.at,ref.end)),spellings.concat(spellings[0]));
  let offset=0;for(const spelling of spellings.concat(spellings[0])){const at=code.indexOf(spelling,offset),ref=r.references.shift();assert.equal(ref.at,at);assert.equal(ref.end,at+spelling.length);offset=ref.end;}
  assert.equal(code.includes('\r\n'),true);
});
test('scope walk excludes locals, parameters, fields, comments and strings while retaining sibling refs',()=>{
  const code='let A = 1, local = (Param) => Param, rec = [B = A] in {A, "B", /* Param */ B, local(Param), B[Param], (each [B]), (A) => A}';
  const r=analyze(code);
  assert.deepEqual(r.dependencies.map(d=>d.id),['B','Param']);
  assert.deepEqual(r.references.map(ref=>code.slice(ref.at,ref.end)),['B','Param','B']);
  assert.deepEqual(r.references.map(ref=>ref.id),['B','Param','B']);
  assert.deepEqual(analyze('let #"A" = 1 in #"A"').references,[]);
  assert.deepEqual(analyze('let A = A in @A').references,[]);
});
test('explicit inclusive global token range excludes the @ punctuation',()=>{
  const code='@#"A" & A';const r=analyze(code);
  assert.deepEqual(r.references,[{id:'A',name:'A',at:1,end:5},{id:'A',name:'A',at:8,end:9}]);
  assert.deepEqual(r.dependencies,[{id:'A',name:'A',at:1}]);
});
test('ambiguous names, duplicate IDs and multipartition tables do not produce ranges',()=>{
  const a=api(),root=node('Root','Sales & A');
  const p=node('P','1',{id:'partition-1',kind:'partition',table:'Sales'});
  for(const nodes of [[root,p,{...p,id:'partition-2'},node('A'),node('A')],[root,p,node('Sales'),node('A','1',{id:'same'}),node('B','1',{id:'same'})]]){
    const r=plain(a.analyze(root,{nodes}));assert.deepEqual(r.dependencies,[]);assert.deepEqual(r.references,[]);assert.match(r.uncertainty.join('\n'),/Ambiguous/);
  }
  const r=plain(a.analyze(root,{nodes:[root,p]}));assert.deepEqual(r.references,[{id:'partition-1',name:'Sales',at:0,end:5}]);
});
test('malformed and unavailable expressions clear both outputs',()=>{
  for(const code of ['A &','{A, B','let x = A in','A ]','A /* unclosed','A & #"unclosed','A & type [x = text]']){
    const r=analyze(code);assert.deepEqual(r.dependencies,[],code);assert.deepEqual(r.references,[],code);assert.match(r.uncertainty.join('\n'),/incomplete/i,code);
  }
  for(const state of ['missing','non-m'])assert.deepEqual(plain(api().analyze(node('R',null,{state}),{nodes:[]})).references,[]);
});
test('synthetic implicit _ remains legacy-only; real _ still has a source range',()=>{
  const code='[Field] & _';const r=analyze(code,['_','Field']);
  assert.deepEqual(r.dependencies,[{id:'_',name:'_',at:0}]);
  assert.deepEqual(r.references,[{id:'_',name:'_',at:10,end:11}]);
  assert.deepEqual(analyze('[Field]',['_']).references,[]);
});
test('legacy graph edge schema, direction and dedup remain unchanged',()=>{
  const metadata={nodes:[node('Consumer','A & A'),node('A')]};const before=JSON.stringify(metadata);
  const graph=plain(api().graph(metadata));
  assert.deepEqual(graph.edges,[{from:'Consumer',to:'A',name:'A',at:0}]);
  assert.equal(graph.nodes[0].result.references.length,2);assert.equal(JSON.stringify(metadata),before);
  assert.equal(api().version,1);
});
