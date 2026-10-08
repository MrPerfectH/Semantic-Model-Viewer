const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
class Element {
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.listeners={};this.attributes={};this.scrollTop=0;this.className='';this.classList={add:(name)=>{this.className+=' '+name;}};}
 set textContent(s){this.text=String(s);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(x=>x.textContent).join(' ');}
 appendChild(e){this.children.push(e);return e;}
 replaceChildren(){this.children=[];this.text='';}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 focus(options){this.focusOptions=options;this.ownerDocument.activeElement=this;}
 click(){this.listeners.click?.();}
}
function harness(){const doc={createElement(tag){return new Element(tag,this);}},g={console};g.window=g;vm.createContext(g);for(const file of ['power-query-dependencies.js','power-query-lineage.js'])vm.runInContext(fs.readFileSync('Models/tools/viewer/js/'+file,'utf8'),g);return {g,doc,host:doc.createElement('section')};}
function node(name,code='1',extra={}){return {id:name,name,code,kind:'expression',classification:'query',state:'available',...extra};}
function setup(nodes){const h=harness(),metadata={nodes,warnings:[]},app={model:{powerQuery:metadata}},context={app,metadata,table:'Sales',partitionId:'P',selected:nodes[0]};context.openCode=id=>{context.selected=metadata.nodes.find(n=>n.id===id);h.host=h.doc.createElement('section');h.g.PowerQueryLineage.render(h.host,context);};h.context=context;h.render=()=>h.g.PowerQueryLineage.render(h.host,context);h.render();return h;}
const root=(code='A',extra={})=>node('P',code,{kind:'partition',table:'Sales',...extra});
function elements(e){return [e,...e.children.flatMap(elements)];}
function byText(h,text){return elements(h.host).find(e=>e.tagName==='button'&&e.textContent===text);}
function card(h,id){return elements(h.host).find(e=>e.dataset.nodeId===id);}
function graph(h){return elements(h.host).find(e=>e.className==='pq-lineage-graph');}
test('progressive expansion and exact code navigation preserve partition root, expansion and scroll',()=>{
 const h=setup([root(),node('A','B'),node('B'),node('Disconnected')]);assert.ok(card(h,'A'));assert.equal(card(h,'B'),undefined);assert.equal(card(h,'Disconnected'),undefined);
 byText(h,'Expand 1 references').click();assert.ok(card(h,'B'));graph(h).scrollTop=100;graph(h).listeners.scroll();
 elements(card(h,'A')).find(e=>e.textContent==='Open code'&&e.tagName==='button').click();assert.equal(h.context.selected.id,'A');assert.ok(card(h,'P'));assert.ok(card(h,'B'));assert.equal(graph(h).scrollTop,100);assert.equal(h.doc.activeElement.focusOptions.preventScroll,true);
 byText(h,'Reset to direct dependencies').click();assert.equal(card(h,'B'),undefined);
});
test('partition state is isolated and app model/metadata replacement clears expansion',()=>{
 const h=setup([root(),node('A','B'),node('B'),root('A',{id:'Other',name:'Other'})]);byText(h,'Expand 1 references').click();h.context.partitionId='Other';h.render();assert.equal(card(h,'B'),undefined);h.context.partitionId='P';h.render();assert.ok(card(h,'B'));
 h.context.app.model={powerQuery:h.context.metadata};h.render();assert.equal(card(h,'B'),undefined);
 byText(h,'Expand 1 references').click();h.context.metadata={nodes:h.context.metadata.nodes.slice(),warnings:[]};h.render();assert.equal(card(h,'B'),undefined);
});
test('SCC and self cycles terminate; dynamic/missing references stay visible as uncertainty',()=>{
 const h=setup([root('A'),node('A','A & Sales & Expression.Evaluate("Missing")')]);assert.match(h.host.textContent,/Cycle group/);byText(h,'Expand 2 references').click();assert.equal(graph(h).children.length,2);assert.match(h.host.textContent,/Dynamic\/environment reference/);assert.match(h.host.textContent,/Unresolved/);
});
test('duplicate, missing, wrong-table, non-M and no-root states never open arbitrary code',()=>{
 for(const [nodes,expected] of [[[root(),root('B')],/Ambiguous duplicate/],[[node('A')],/missing from/],[[root('A',{table:'Other'})],/does not belong/],[[root('',{state:'non-m'})],/not M/],[[root('',{state:'missing'})],/metadata is missing/]]){const h=setup(nodes);assert.match(h.host.textContent,expected);assert.equal(byText(h,'Open code'),undefined);}
 const h=setup([root()]);h.context.partitionId=null;h.render();assert.match(h.host.textContent,/Choose a table/);
});
test('optional analyzer unavailable is explicit',()=>{const h=setup([root()]);h.g.PowerQueryDependencies=undefined;assert.doesNotThrow(h.render);assert.match(h.host.textContent,/unavailable/);});
test('hostile labels are text, keyboard navigation moves focus and edge navigation targets upstream code',()=>{
 const name='<img src=x onerror=alert(1)>',h=setup([root('#"'+name+'"'),node(name)]);assert.ok(card(h,name));assert.equal(elements(h.host).some(e=>e.tagName==='img'),false);
 const open=byText(h,'Open code');open.focus();let prevented=false;h.host.onkeydown({key:'ArrowDown',preventDefault(){prevented=true;}});assert.ok(prevented);assert.notEqual(h.doc.activeElement,open);
 h.host.onkeydown({key:'End',preventDefault(){}});assert.equal(h.doc.activeElement.dataset.lineageKey,'code:'+name);
 byText(h,'→ '+name).click();assert.equal(h.doc.activeElement.dataset.lineageKey,'code:'+name);
});
test('large graph uses complete metadata resolution but caps visible nodes with explicit limits',()=>{
 const nodes=[root(Array.from({length:100},(_,i)=>'Q'+i).join(' & ')),...Array.from({length:350},(_,i)=>node('Q'+i))],before=JSON.stringify(nodes),h=setup(nodes);assert.equal(graph(h).children.length,41);byText(h,'Next references').click();assert.ok(card(h,'Q40'));assert.equal(card(h,'Q0'),undefined);assert.match(h.host.textContent,/Display limit reached/);assert.match(h.host.textContent,/Large-model mode/);assert.equal(JSON.stringify(nodes),before);
});
test('large-model duplicate names never become resolved edges',()=>{
 const h=setup([root('A'),node('A'),node('A','1',{id:'duplicate'}),...Array.from({length:301},(_,i)=>node('Q'+i))]);assert.equal(graph(h).children.length,1);assert.match(h.host.textContent,/Ambiguous reference/);
});
test('branch expansion caps nodes and reset restores first page',()=>{
 const h=setup([root('A & B & C'),node('A',Array.from({length:40},(_,i)=>'Q'+i).join(' & ')),node('B',Array.from({length:40},(_,i)=>'Q'+(i+40)).join(' & ')),node('C'),...Array.from({length:80},(_,i)=>node('Q'+i))]);
 byText(h,'Expand 40 references').click();byText(h,'Expand 40 references').click();assert.equal(graph(h).children.length,80);assert.match(h.host.textContent,/Display limit/);byText(h,'Reset to direct dependencies').click();assert.equal(graph(h).children.length,4);
});
test('model replacement without a valid root still invalidates previous state',()=>{
 const h=setup([root(),node('A','B'),node('B')]);byText(h,'Expand 1 references').click();const metadata=h.context.metadata;h.context.app.model={};h.context.metadata={nodes:[]};h.context.partitionId=null;h.render();h.context.metadata=metadata;h.context.partitionId='P';h.render();assert.equal(card(h,'B'),undefined);
});
test('bounded large-model cycle findings include only expanded visible edges',()=>{
 const h=setup([root(),node('A','B'),node('B','A'),...Array.from({length:301},(_,i)=>node('Q'+i))]);assert.match(h.host.textContent,/visible edges only/);assert.equal(h.host.textContent.includes('Cycle group:'),false);byText(h,'Expand 1 references').click();assert.equal(h.host.textContent.includes('Cycle group:'),false);byText(h,'Expand 1 references').click();assert.match(h.host.textContent,/Cycle group: A, B/);assert.equal(graph(h).children.length,3);
});
