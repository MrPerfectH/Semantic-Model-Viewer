const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(){const g={console,Set,Map};g.window=g;vm.createContext(g);for(const f of ['util.js','roles.js','tmdl-parser.js','power-query.js','snapshot.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js',f),'utf8'),g);return g;}
const plain=x=>JSON.parse(JSON.stringify(x));
test('BIM preserves exact string / array code, partitions, stable identities, kinds and missing states',()=>{const g=harness(),code='let\r\n  x = "a ""quoted"" value"  \r\nin x\r\n';const model=g.TMDLParser.parseBIM({model:{tables:[{name:'Sales',partitions:[{name:'A',source:{type:'m',expression:code}},{name:'B',source:{type:'m',expression:['let','  x = Upstream','in x']}},{name:'DAX',source:{type:'calculated',expression:'1'}},{name:'Missing'}]}],expressions:[{name:'Param',kind:'m',expression:'"v" meta [IsParameterQuery=true]'},{name:'Fn',kind:'m',expression:'(x as text) => x'},{name:'Native',kind:'sql',expression:'private source'}]}});const n=model.powerQuery.nodes;assert.equal(n[0].code,code);assert.equal(n[1].code,'let\n  x = Upstream\nin x');assert.equal(n[2].state,'non-m');assert.equal(n[2].code,null);assert.equal(n[3].state,'missing');assert.equal(n[4].classification,'parameter');assert.match(n[4].basis,/metadata marker/);assert.equal(n[5].classification,'function');assert.equal(n[6].basis,'declared kind');assert.equal(new Set(n.map(x=>x.id)).size,n.length);});
test('TMDL keeps decoded M indentation, quoted names, multiple partitions and shared expressions',()=>{const g=harness();const m=g.TMDLParser.parseTMDL([{name:'Sales.tmdl',text:"table 'Sales Table'\n\tpartition 'First ''quoted''' = m\n\t\tmode: import\n\t\tsource =\n\t\t\tlet\n\t\t\t  x = #\"Missing Query\",\n\n\t\t\t  s = \"line\"\n\t\t\tin x\n\tpartition Second = m\n\t\tsource = Upstream\n\tpartition Third = calculated\n\t\tsource = 1\n"},{name:'expressions.tmdl',text:"expression 'Missing Query' =\n\t\tlet\n\t\t  x = 1\n\t\tin x\n\tlineageTag: foo\nexpression Param = \"a\" meta [IsParameterQuery=true]\nexpression Fn = (x) => x\n"}]);const n=m.powerQuery.nodes;assert.equal(n.length,6);assert.equal(n[0].name,"First 'quoted'");assert.equal(n[0].code,'let\n  x = #"Missing Query",\n\n  s = "line"\nin x');assert.equal(n[1].code,'Upstream');assert.equal(n[2].state,'non-m');assert.equal(n[3].code,'let\n  x = 1\nin x');assert.equal(n[5].classification,'function');});
test('TMDL fenced code preserves trailing whitespace, blank lines and CRLF',()=>{const g=harness();const text='table T\r\n\tpartition P = m\r\n\t\tsource = ```\r\n\t\t\tlet  \r\n\t\t\t  x = "line"  \r\n\t\t\tin x\r\n\t\t\t\r\n\t\t\t```\r\n';const n=g.TMDLParser.parseTMDL([{name:'t.tmdl',text}]).powerQuery.nodes[0];assert.equal(n.code,'let  \r\n  x = "line"  \r\nin x\r\n');});
test('identities survive file order and no metadata does not invent code',()=>{const g=harness(),a={name:'t.tmdl',text:'table T\n\tpartition P = m\n\t\tsource = 1'},b={name:'e.tmdl',text:'expression Q = 2'};const ids=x=>g.TMDLParser.parseTMDL(x).powerQuery.nodes.map(n=>n.id).sort();assert.deepEqual(plain(ids([a,b])),plain(ids([b,a])));assert.equal(g.TMDLParser.parseTMDL([{name:'t.tmdl',text:'table T'}]).powerQuery.nodes.length,0);});
test('snapshot export allowlist excludes raw M and metadata (including hostile markers)',()=>{const g=harness(),model=g.TMDLParser.parseBIM({model:{tables:[{name:'Sales',partitions:[{name:'P',source:{type:'m',expression:'SECRET_M_SOURCE_MARKER'}}]}],expressions:[{name:'Secret',expression:'SECRET_PARAMETER_MARKER',kind:'m'}]}});const exported=g.Snapshots.modelData?g.Snapshots.modelData(model):null;assert.ok(exported);const text=JSON.stringify(exported);assert.equal(text.includes('SECRET_'),false);assert.equal(text.includes('powerQuery'),false);});

test('stale hook code navigation cannot close or change a newer model inspector',()=>{
  const g=harness(),contexts=[];
  class Element {
    constructor(tag){this.tagName=tag;this.children=[];this.style={};this.listeners={};this.isConnected=false;}
    appendChild(child){child.parent=this;child.isConnected=true;this.children.push(child);return child;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.isConnected=false;}
    setAttribute(name,value){this[name]=value;}
    addEventListener(name,fn){this.listeners[name]=fn;}
    focus(){doc.activeElement=this;}
    querySelectorAll(){return [];}
    get firstChild(){return this.children[0];}
    removeChild(child){child.remove();}
  }
  const doc={body:new Element('body'),activeElement:null,createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('text'),{textContent:text})};
  g.document=doc;
  g.PowerQueryDependencies={render(host,context){contexts.push(context);}};
  const model=name=>({tables:[{name:'Sales'}],powerQuery:{nodes:[{id:name,kind:'partition',table:'Sales',name,code:'1',type:'m',state:'available',classification:'query',basis:'inferred from syntax'}],warnings:[]}});
  const app={model:model('Old')};
  g.PowerQuery.open(app,'Sales');const old=contexts[0];
  app.model=model('New');g.PowerQuery.close(app);g.PowerQuery.open(app,'Sales');
  const current=app._powerQueryOverlay;
  old.openCode('Old');
  assert.equal(app._powerQueryOverlay,current,'old callbacks must not close the current inspector');
  assert.equal(current.isConnected,true);
  assert.equal(contexts.length,2,'old callbacks must not render stale metadata');
  g.PowerQuery.close(app);
});

test('explicit BIM query group references resolve declared nested folders without name inference or snapshot exposure',()=>{const g=harness(),m=g.TMDLParser.parseBIM({model:{queryGroups:[{name:'Stage',folder:'Private/Stage'}],tables:[{name:'Table',partitions:[{name:'P',queryGroup:'Stage',source:{type:'m',expression:'1'}}]}],expressions:[{name:'Nested_Name',queryGroup:'Stage',expression:'1'},{name:'Undeclared',queryGroup:'LiteralGroup',expression:'1'},{name:'Private_Stage_Inferred',expression:'1',annotations:[{name:'UnknownGrouping',value:'Stage'}]}]}});assert.deepEqual(plain(m.powerQuery.nodes.map(n=>n.groupPath)),['Private/Stage','Private/Stage','LiteralGroup',null]);assert.equal(JSON.stringify(g.Snapshots.modelData(m)).includes('Private/Stage'),false);});
test('TMDL group properties before/after exact fenced expressions and partition sources stay metadata',()=>{const g=harness(),code='let\r\n  Text = "queryGroup: Fake"  \r\nin Text\r\n',files=[{name:'model.tmdl',text:"model Model\r\n\tqueryGroup 'Stage'\r\n\t\tfolder: Private/Stage\r\n"},{name:'expressions.tmdl',text:"expression 'Quoted Name' = ```\r\n\t"+code.replace(/\r\n/g,'\r\n\t')+"\r\n\t```\r\n\tqueryGroup: Stage\r\nexpression Plain = 1\r\n"},{name:'Table.tmdl',text:"table Table\r\n\tpartition P = m\r\n\t\tqueryGroup: Stage\r\n\t\tsource = 1\r\n"}];const m=g.TMDLParser.parseTMDL(files);assert.equal(m.powerQuery.nodes[0].code,code);assert.deepEqual(plain(m.powerQuery.nodes.map(n=>n.groupPath)),['Private/Stage',null,'Private/Stage']);});
