const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.join(__dirname,'acceptance-fixtures/pq38');
const oracle=JSON.parse(fs.readFileSync(path.join(base,'oracle/expected.json')));
const g={console};g.window=g;vm.createContext(g);
for(const name of ['util','roles','tmdl-parser','power-query-dependencies','snapshot'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/'+name+'.js'),'utf8'),g);
const bim=()=>g.TMDLParser.parseBIM(JSON.parse(fs.readFileSync(path.join(base,'bim/model.bim'))));
const tmdl=()=>{const files=[];function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory())walk(f);else files.push({name:d.name,text:fs.readFileSync(f,'utf8')});}}walk(path.join(base,'PQ38.SemanticModel'));return g.TMDLParser.parseTMDL(files);};
for(const [format,load] of [['BIM',bim],['TMDL',tmdl]])test(format+' independently authored inventory, exact text and states',()=>{
  const m=load(),ns=m.powerQuery.nodes;
  assert.equal(ns.length,16);assert.equal(new Set(ns.map(n=>n.id)).size,16);
  assert.equal(ns.find(n=>n.name==="Main 'quoted'").code,oracle.main);
  assert.equal(ns.find(n=>n.name==='Other').code,format==='TMDL'?oracle.other.replace(/\n/g,'\r\n'):oracle.other);
  assert.equal(ns.find(n=>n.name==='Calculated').state,'non-m');assert.equal(ns.find(n=>n.name==='Missing'&&n.kind==='partition').state,'missing');
  for(const [name,code] of Object.entries(oracle.shared))assert.equal(ns.find(n=>n.name===name&&n.kind==='expression').code,code,name);
  assert.match(ns.find(n=>n.name==='pRegion').basis,/metadata marker/);
  assert.equal(ns.find(n=>n.name==='Function').classification,'function');
});
test('independent scope/lexical/dynamic oracle and cycles',()=>{
  const md=bim().powerQuery;
  for(const [name,expected] of Object.entries(oracle.edges)){
    const node=md.nodes.find(n=>n.name===name&&n.kind==='expression'),r=g.PowerQueryDependencies.analyze(node,md);
    assert.deepEqual(Array.from(r.dependencies,d=>d.name),expected,name);
    if(name==='Dynamic')assert.match(r.uncertainty.join(' '),/Dynamic\/environment/);
    if(name==='Missing')assert.match(r.uncertainty.join(' '),/AbsentQuery/);
    assert.equal(r.partial,true);
  }
  assert.ok(g.PowerQueryDependencies.graph(md).cycles.some(ids=>ids.length===2));
});
test('snapshot analytical allowlist excludes all acceptance raw-code sentinels',()=>{
  const text=JSON.stringify(g.Snapshots.modelData(bim()));
  for(const marker of ['PQ_RAW_ONLY_38','PQ_SHARED_ONLY_38','PQ_CREDENTIAL_ONLY_38','pq-private-38.invalid','powerQuery'])assert.equal(text.includes(marker),false,marker);
});
test('replacement metadata contains no previous query identities',()=>{
  const m=g.TMDLParser.parseBIM(JSON.parse(fs.readFileSync(path.join(base,'reset/model.bim'))));
  assert.equal(m.powerQuery.nodes.some(n=>n.name==='CycleA'),false);
  assert.equal(m.powerQuery.nodes.find(n=>n.name==="Main 'quoted'").code,'Replacement');
});
