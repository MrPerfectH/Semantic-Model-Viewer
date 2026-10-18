/* Controller contract without a browser: real storage wrapper, UI nodes and events. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(seed={},denied=false){
  const storage=new Map(Object.entries(seed)),events={};
  let document;
  function node(tag){return {tag,children:[],style:{},attrs:{},events:{},isConnected:true,offsetWidth:320,offsetHeight:240,
    setAttribute(k,v){this.attrs[k]=v;},appendChild(n){this.children.push(n);n.parent=this;return n;},
    addEventListener(k,f){this.events[k]=f;},getClientRects(){return [];},
    remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(x=>x!==this);},
    contains(n){return n===this||this.children.some(x=>x.contains&&x.contains(n));},focus(){document.activeElement=this;}};}
  const help=node('button');
  document={body:node('body'),activeElement:help,createElement:node,createTextNode:text=>({textContent:text}),
    querySelector:s=>s==='[data-onboarding-help]'?help:null,addEventListener(k,f){events[k]=f;}};
  const ctx={document,innerWidth:360,innerHeight:480,addEventListener(){},localStorage:{
    getItem:k=>{if(denied)throw Error('denied');return storage.get(k)||null;},setItem(k,v){if(denied)throw Error('denied');storage.set(k,v);}}};
  ctx.window=ctx;vm.createContext(ctx);
  for(const name of ['util','onboarding'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/'+name+'.js'),'utf8'),ctx);
  const app={modelKey:'fixture',state:{loaded:true,viewMode:'graph'},model:{tables:[],relationships:[]}};
  const guide=new ctx.ViewerOnboarding(app);
  const click=label=>{const all=n=>[n,...(n.children||[]).flatMap(all)];const button=all(guide.card).find(n=>n.textContent===label);assert.ok(button,label);document.activeElement=button;button.events.click();};
  return {ctx,document,storage,app,guide,click,help};
}
test('welcome is optional, host-backed dismissal survives construction, restart restores focus',()=>{
  const h=harness();h.guide.update();assert.equal(h.guide.id,'welcome');assert.equal(h.document.activeElement,h.help);
  h.click('Skip tour');h.app.state.viewMode='measures';h.guide.update();assert.equal(h.guide.card,null);
  const second=new h.ctx.ViewerOnboarding(h.app);second.update();assert.equal(second.card,null);
  h.guide.restart();assert.equal(h.document.activeElement.textContent,'Welcome to Semantic Model Viewer');
  h.guide.card.events.keydown({key:'Escape',stopPropagation(){},preventDefault(){}});
  assert.equal(h.document.activeElement,h.help);assert.equal(h.guide.card,null);
});
test('tips follow user context once and never mutate model/layout state',()=>{
  const h=harness(),before=JSON.stringify(h.app);h.guide.update();h.click('Show tips');assert.equal(h.guide.id,'tables');
  h.click('Close');h.guide.update();assert.equal(h.guide.card,null);
  assert.equal(JSON.stringify(h.app),before);
  h.app.state.selected='Sales';h.guide.update();assert.equal(h.guide.id,'relationships');
  h.app.state.viewMode='measures';h.guide.update();assert.equal(h.guide.id,'measures');
  h.click('Close');h.guide.offer('sharing');assert.equal(h.guide.id,'sharing');
  h.click('Skip remaining tips');h.guide.update();assert.equal(h.guide.card,null);
});
test('denied/corrupt storage, absent targets and snapshots remain safe',()=>{
  for(const h of [harness({},true),harness({smv_onboarding_v1:'not JSON'})]){
    h.guide.update();h.click('Show tips');assert.equal(h.guide.card.style.left,'28px');
    h.click('Skip remaining tips');for(let i=0;i<5;i++)h.guide.update();assert.equal(h.guide.card,null);
    const before=JSON.stringify([...h.storage]);h.app.snapshotMode=true;h.guide.restart();h.guide.offer('sharing');h.guide.update();
    assert.equal(h.guide.card,null);assert.equal(JSON.stringify([...h.storage]),before);
  }
});
