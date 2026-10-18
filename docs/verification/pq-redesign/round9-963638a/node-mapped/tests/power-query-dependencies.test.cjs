const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function api(){const g={};g.window=g;vm.createContext(g);vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/power-query-dependencies.js'),'utf8'),g);return g.PowerQueryDependencies;}
const plain=x=>JSON.parse(JSON.stringify(x));
function node(name,code='1',extra={}){return {id:name,name,kind:'expression',state:'available',code,...extra};}
function analyze(code,names=['Upstream','Param','Fn','x','Missing Query']){const root=node('Root',code),metadata={nodes:[root,...names.map(n=>node(n))]};return plain(api().analyze(root,metadata));}
function deps(code,names){return analyze(code,names).dependencies.map(d=>d.name);}
test('quoted identifiers decode escapes; strings and comments never create edges',()=>{
 assert.deepEqual(deps('let s = "Upstream", x = #"Missing#(0020)Query" /* Fn */ // Param\nin x'),['Missing Query']);
 assert.deepEqual(deps('#"let" & #"a""b" & #"a#(#)(lf)b"',['let','a"b','a#(lf)b']),['let','a"b','a#(lf)b']);
 assert.deepEqual(deps('Ünicode',['Ünicode']),['Ünicode']);
});
test('let forward references, nested sibling scopes and quoted shadowing',()=>{
 assert.deepEqual(deps('let a = b, b = Upstream in a'),['Upstream']);
 assert.deepEqual(deps('let a = (let Upstream = 1 in Upstream), b = Upstream in b'),['Upstream']);
 assert.deepEqual(deps('let #"Missing Query" = 1 in #"Missing Query"'),[]);
});
test('exclusive initialization is explicit, inclusive recursive references are local',()=>{
 assert.match(analyze('let Upstream = Upstream in Upstream').uncertainty.join('\n'),/Exclusive self-reference/);
 assert.deepEqual(deps('let Fn = (x) => @Fn(x) in Fn(1)'),[]);
 assert.deepEqual(deps('[Upstream = @Upstream, Result = Param]'),['Param']);
 assert.match(analyze('[Upstream = Upstream]').uncertainty.join('\n'),/Exclusive self-reference/);
});
test('typed functions and each do not shadow sibling arguments or branches',()=>{
 assert.deepEqual(deps('(Upstream as text, optional x as nullable number) as text => Upstream'),[]);
 assert.deepEqual(deps('Fn((x) => x, x)'),['Fn','x']);
 assert.deepEqual(deps('List.Transform(Upstream, each [Param] & Fn(_))'),['Upstream','Fn']);
 assert.deepEqual(deps('if true then (Upstream) => Upstream else Upstream'),['Upstream']);
 assert.deepEqual(deps('Fn(each _, _)',['Fn','_']),['Fn','_']);
});
test('record generalized fields, projection, item access and type names',()=>{
 assert.deepEqual(deps('[Missing Query = Param, Result = #"Missing Query"]'),['Param']);
 assert.deepEqual(deps('Upstream[Param] & Upstream[[Param],[x]] & Upstream{Param}'),['Upstream','Param']);
 assert.deepEqual(deps('x as text & type text',['x','text']),['x']);
 assert.deepEqual(deps('try Fn(Param) otherwise Upstream'),['Fn','Param','Upstream']);
});
test('dynamic, unresolved, library and malformed inputs remain explicit',()=>{
 const r=analyze('Expression.Evaluate("Param", #shared) & Ghost');
 assert.match(r.uncertainty.join('\n'),/Dynamic\/environment/);assert.match(r.uncertainty.join('\n'),/Ghost/);assert.deepEqual(r.dependencies,[]);
 for(const code of ['Upstream /* unclosed','"Upstream','let a = Upstream','Upstream ]','section S; shared X = Upstream;','type [x = text]']){
  const r=analyze(code);assert.deepEqual(r.dependencies,[],code);assert.match(r.uncertainty.join('\n'),/incomplete/i,code);
 }
 assert.match(analyze('Unknown.Library(1)').uncertainty.join('\n'),/library\/external/);
 assert.match(analyze('#"Bad#(zz)"').uncertainty.join('\n'),/Unsupported escape/);
});
test('table names resolve rather than partition names; ambiguous identities never resolve',()=>{
 const a=api(),root=node('Root','Sales'),p=node('P','1',{id:'partition',kind:'partition',table:'Sales'});
 assert.equal(a.analyze(root,{nodes:[root,p]}).dependencies[0].id,'partition');
 for(const nodes of [[root,p,{...p,id:'second'}],[root,p,{...p}],[root,p,node('Sales')]]){
  const r=a.analyze(root,{nodes});assert.equal(r.dependencies.length,0);assert.match(r.uncertainty.join('\n'),/Ambiguous/);
 }
 assert.equal(a.analyze(node('Root','P'),{nodes:[p]}).dependencies.length,0);
 assert.match(a.analyze({...root,state:'missing',code:null},{nodes:[]}).uncertainty.join('\n'),/missing/);
});
test('graph exposes direct edges, cycle components and disconnected nodes without mutation',()=>{
 const metadata={nodes:[node('A','B'),node('B','A'),node('Self','Self'),node('Disconnected')]};
 const before=JSON.stringify(metadata),g=plain(api().graph(metadata));
 assert.deepEqual(g.cycles,[['A','B'],['Self']]);assert.equal(g.nodes.length,4);assert.equal(g.edges.length,3);assert.equal(JSON.stringify(metadata),before);assert.equal(g.partial,true);
 const duplicate=plain(api().graph({nodes:[node('A','B'),node('A','B'),node('B','A')]}));assert.equal(duplicate.edges.length,0);assert.match(duplicate.uncertainty.join('\n'),/Duplicate/);
});
test('depth limits are explicit and do not throw to consumers',()=>{
 assert.match(analyze('('.repeat(250)+'Upstream'+')'.repeat(250)).uncertainty.join('\n'),/limit/);
});
test('render provides safe clickable code navigation and visible uncertainty in its host',()=>{
 class Element {constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.ownerDocument=doc;}appendChild(e){this.children.push(e);}replaceChildren(){this.children=[];}addEventListener(k,fn){this.listeners[k]=fn;}}
 const doc={createElement:t=>new Element(t)},host=new Element('section'),calls=[];
 const name='<img src=x onerror=evil()>',root=node('Root','#"'+name+'" & Ghost'),metadata={nodes:[root,node(name)],warnings:['Extraction warning']};
 api().render(host,{selected:root,metadata,openCode:id=>calls.push(id)});
 const button=host.children.find(e=>e.tag==='button');assert.equal(button.textContent,'Open '+name);assert.equal(button.type,'button');button.listeners.click();assert.deepEqual(calls,[name]);
 const details=host.children.find(e=>e.tag==='details');assert.equal(details.open,true);assert.match(details.children.map(e=>e.textContent).join('\n'),/Ghost.*|Extraction warning/);assert.ok(details.children.some(e=>e.textContent==='Extraction warning'));
});
test('missing/non-M targets remain navigable and every result retains partial status',()=>{
 const root=node('Root','Missing & Native'),metadata={nodes:[root,node('Missing',null,{state:'missing'}),node('Native',null,{state:'non-m'})]};
 Object.freeze(metadata.nodes);metadata.nodes.forEach(Object.freeze);Object.freeze(metadata);
 const r=plain(api().analyze(root,metadata));assert.deepEqual(r.dependencies.map(d=>d.id),['Missing','Native']);assert.equal(r.partial,true);assert.match(r.uncertainty.join('\n'),/no arrow does not mean no dependency/);
});
test('render exposes cycles and replaces the old host contents on navigation',()=>{
 const doc={createElement(tag){return {tag,textContent:'',children:[],ownerDocument:doc,appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},addEventListener(){}};}},host=doc.createElement('section'),a=api(),metadata={nodes:[node('A','B'),node('B','A')]};
 a.render(host,{selected:metadata.nodes[0],metadata,openCode(){}});assert.ok(host.children.some(e=>e.textContent==='Cycle detected among metadata references: A → B'));
 a.render(host,{selected:node('Empty'),metadata:{nodes:[]},openCode(){}});assert.equal(host.children.some(e=>e.tag==='button'),false);assert.equal(host.children.filter(e=>e.tag==='h3').length,1);
});

// Exact language symbols are a separate informational result, after lexical/model resolution.
test('documented M names do not masquerade as missing queries; unknown model names remain explicit',()=>{
 const r=analyze('Table.TransformColumnTypes(Upstream, {{"n", Int64.Type}}) & Missing.Model & Ghost');
 assert.deepEqual(r.standardLibrary,['Table.TransformColumnTypes','Int64.Type']);assert.deepEqual(r.dependencies.map(d=>d.name),['Upstream']);
 assert(!r.uncertainty.some(s=>/Table.TransformColumnTypes|Int64.Type/.test(s)));assert(r.uncertainty.some(s=>s.includes('Missing.Model')));assert(r.uncertainty.some(s=>s.includes('Ghost')));assert.equal(r.partial,true);
 assert.deepEqual(analyze('table.TransformColumnTypes(1)').standardLibrary,[],'case-sensitive names only');
 assert.deepEqual(analyze('let Int64.Type = 1 in Int64.Type').standardLibrary,[],'local scope wins');
 assert.deepEqual(deps('Int64.Type',['Int64.Type']),['Int64.Type'],'model name wins');
 const a=api(),root=node('Root','Int64.Type'),dup={nodes:[root,node('Int64.Type'),node('Int64.Type','2',{id:'other'})]},d=plain(a.analyze(root,dup));
 assert.deepEqual(d.standardLibrary,[]);assert.deepEqual(d.dependencies,[]);assert(d.uncertainty.some(s=>s.includes('Ambiguous reference')));
 const dynamic=analyze('Expression.Evaluate("Int64.Type", #shared) & Int64.Type');assert(dynamic.uncertainty.some(s=>s.includes('Dynamic/environment')));assert.deepEqual(dynamic.dependencies,[]);
 assert.deepEqual(analyze('Int64.Type ]').standardLibrary,[],'failed parse claims no recognized occurrence');
});
