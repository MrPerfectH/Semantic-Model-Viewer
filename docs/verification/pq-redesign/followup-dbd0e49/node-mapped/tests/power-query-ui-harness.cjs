// Deterministic DOM/event/RAF boundary for owned module contract tests.
// Layout, browser scrolling, font rendering and accessibility need the real
// browser fixture as a separate gate; this harness makes no browser claim.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function harness(file) {
  const frames = new Map(), observers = [], box = {width:1000,height:700}, doc = {activeElement:null}; let seq=0;
  class Element {
    constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.parentElement=null; this.style={}; this.dataset={}; this.attrs={}; this.className=''; this.listeners=new Map(); this.ownerDocument=doc; this.hidden=false; this.tabIndex=-1; this.scrollLeft=0; this.scrollTop=0; this._text=''; }
    get classList() { const self=this; return {contains(c){return self.className.split(/\s+/).includes(c);},add(c){this.toggle(c,true);},remove(c){this.toggle(c,false);},toggle(c,value){const set=new Set(self.className.split(/\s+/).filter(Boolean)); const add=value===undefined?!set.has(c):value; if(add)set.add(c);else set.delete(c);self.className=[...set].join(' ');return add;}}; }
    set textContent(value) { this.replaceChildren(); this._text=String(value); }
    get textContent() { return this._text+this.children.map(c=>c.textContent).join(''); }
    appendChild(child) { if(child.parentElement)child.remove(); child.parentElement=this;this.children.push(child);return child; }
    replaceChildren(...children) { this.children.forEach(c=>c.parentElement=null); this.children=[]; this._text=''; children.forEach(c=>this.appendChild(c)); }
    remove() { if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;} }
    setAttribute(key,value) { this.attrs[key]=String(value); if(key==='class')this.className=String(value); if(key==='tabindex')this.tabIndex=Number(value); if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value); }
    getAttribute(key) { return key==='class'?this.className:this.attrs[key]; }
    matches(selector) { return selector.split(',').some(sel=>{sel=sel.trim();if(sel.startsWith('.'))return this.classList.contains(sel.slice(1));if(sel.startsWith('[')){const m=/^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);if(!m)return false;let value=m[1].startsWith('data-')?this.dataset[m[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.attrs[m[1]];return m[2]===undefined?value!==undefined:String(value)===m[2];}return this.tagName.toLowerCase()===sel;}); }
    closest(selector) { for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null; }
    querySelectorAll(selector) { const result=[]; function visit(n){n.children.forEach(c=>{if(c.matches(selector))result.push(c);visit(c);});}visit(this);return result; }
    querySelector(selector) { return this.querySelectorAll(selector)[0]||null; }
    addEventListener(type,callback) { if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback); }
    removeEventListener(type,callback) { this.listeners.get(type)?.delete(callback); }
    fire(type,detail={}) { const e={target:this,button:0,pointerId:1,pointerType:'mouse',clientX:100,clientY:100,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...detail};for(let n=this;n;n=n.parentElement){for(const fn of [...(n.listeners.get(type)||[])])if(n.listeners.get(type)?.has(fn))fn(e);if(e.stopped)break;}return e; }
    focus() { doc.activeElement=this; }
    setPointerCapture() {}
    getBoundingClientRect() { return {left:0,top:0,right:box.width,bottom:box.height,width:box.width,height:box.height}; }
    getClientRects() { return box.width&&box.height&&!this.hidden?[this.getBoundingClientRect()]:[]; }
  }
  doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);doc.body=new Element('body');
  const win=new Element('window');Object.assign(win,{console,Map,Set,Promise,Number,Math,Array,Error,JSON,navigator:{clipboard:{writeText:()=>Promise.resolve()}},requestAnimationFrame(fn){const id=++seq;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},ResizeObserver:class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.off=true;}}});
  win.window=win;win.document=doc;doc.defaultView=win;vm.createContext(win);vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/workspace-ui.js'),'utf8'),win,{filename:'workspace-ui.js'});vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js',file),'utf8'),win,{filename:file});
  const host=doc.createElement('div');host.tabIndex=0;doc.body.appendChild(host);
  function runFrame(){const queue=[...frames.values()];frames.clear();queue.forEach(fn=>fn());}
  function flush(){for(let n=0;frames.size&&n<10;n++)runFrame();if(frames.size)throw Error('RAF failed to settle');}
  return {win,doc,host,box,frames,runFrame,flush,resize(){observers.filter(o=>!o.off).forEach(o=>o.fn());}};
}
function context(generation=1, count=6) {
  const nodes=Array.from({length:count},(_,i)=>({id:'id-'+i,metadataId:'id-'+i,label:i===0?'Server':i===1?'Sales Raw':'Query '+i,subtitle:i===0?'parameter':'M · Main',kind:i===0?'parameter':'partition',state:'available',table:'Table '+i,partition:'Main'}));
  const edges=count>=4?[{id:'edge-0-1',inputId:'id-0',consumerId:'id-1',referenceOccurrences:[{id:'id-0',name:'Server',at:0,end:6}]},{id:'edge-1-3',inputId:'id-1',consumerId:'id-3',referenceOccurrences:[]}]:[];
  const byNodeId=new Map(nodes.map(n=>[n.id,{node:n,metadataRow:{id:n.metadataId},code:n.id==='id-1'?'Server':'1',classification:n.kind==='parameter'?'parameter':'query',basis:'Syntax hint (not evaluated)',type:'m',state:n.state,occurrences:n.id==='id-1'?[{targetId:'id-0',name:'Server',at:0,end:6}]:[],issues:[],inputIds:edges.filter(e=>e.consumerId===n.id).map(e=>e.inputId),consumerIds:edges.filter(e=>e.inputId===n.id).map(e=>e.consumerId)}]));
  return {version:2,generation,graph:{nodes,edges,issues:[],generation,analysisProgress:{analyzed:count,total:count,complete:true,generation}},byNodeId,globalIssues:[]};
}
const plain=value=>JSON.parse(JSON.stringify(value));
module.exports={harness,context,plain};
