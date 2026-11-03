const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness}=require('./power-query-ui-harness.cjs');
function setup(){
  const h=harness('util.js'),{win,doc,host}=h;
  const proto=Object.getPrototypeOf(host);
  const rects=proto.getClientRects;proto.getClientRects=function(){return /display:none/.test(this.style.cssText||'')?[]:rects.call(this);};
  proto.contains=function(node){for(;node;node=node.parentElement)if(node===this)return true;return false;};
  Object.defineProperty(proto,'isConnected',{get(){return doc.body.contains(this);},configurable:true});
  const events=doc.createElement('events');
  doc.addEventListener=events.addEventListener.bind(events);
  doc.removeEventListener=events.removeEventListener.bind(events);
  doc.querySelector=doc.body.querySelector.bind(doc.body);
  win.U.clear=node=>node.replaceChildren();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../Models/tools/viewer/js/topbar.js'),'utf8'),win);
  const background=doc.createElement('div'),opener=doc.createElement('button');
  opener.setAttribute('data-open-import','');background.appendChild(opener);doc.body.appendChild(background);opener.focus();
  const app={state:{showImport:false},canFS:()=>false,importTarget:()=>null,
    setState(p){Object.assign(this.state,p);modal.update();},
    finishFolderPick(){this.setState({folderPick:null});}};
  const modal=new win.ImportModal(app,host);
  const get=key=>host.querySelectorAll('[data-import-focus]').find(n=>n.getAttribute('data-import-focus')===key);
  return {...h,app,modal,get,opener,background,key:(key,shiftKey=false)=>events.fire('keydown',{key,shiftKey})};
}
test('import dialog names, focus entry, wrap, Escape and opener restoration',()=>{
  const h=setup();h.app.setState({showImport:true});
  assert.equal(h.host.querySelector('[role="dialog"]').getAttribute('aria-label'),'Import model');
  assert.equal(h.doc.activeElement,h.get('choose-folder'));assert.equal(h.background.inert,true);
  h.get('choose-files').focus();assert.equal(h.key('Tab').defaultPrevented,true);assert.equal(h.doc.activeElement,h.get('close-import'));
  h.key('Tab',true);assert.equal(h.doc.activeElement,h.get('choose-files'));
  assert.equal(h.get('close-import').getAttribute('aria-label'),'Close import model');
  h.key('Escape');assert.equal(h.app.state.showImport,false);assert.equal(h.doc.activeElement,h.opener);assert.ok(!h.background.inert);
});
test('async error/ready rerenders retain focus and caret; errors are announced',()=>{
  const h=setup();h.app.setState({showImport:true,importReady:true,importName:'Demo',importSummary:'1 table'});
  h.get('model-name').focus();h.get('model-name').selectionStart=2;h.get('model-name').selectionEnd=3;
  let range;Object.getPrototypeOf(h.host).setSelectionRange=function(a,b){range=[a,b];};
  h.app.setState({importError:'Could not save'});
  assert.equal(h.doc.activeElement,h.get('model-name'));assert.deepEqual(range,[2,3]);
  assert.equal(h.host.querySelector('[role="alert"]').textContent,'Could not save');
});
test('nested folder chooser traps focus, announces loading/errors, and dismisses only top layer',()=>{
  const h=setup();h.app.setState({showImport:true});h.get('choose-folder').focus();
  h.app.setState({folderPick:{title:'Select model folder',path:'/models',loading:true}});
  assert.equal(h.doc.activeElement,h.get('folder-path'));
  assert.equal(h.host.querySelector('[role="status"]').textContent,'Loading…');
  assert.equal(h.host.children[0].inert,true);
  h.app.setState({folderPick:{title:'Select model folder',path:'/models',error:'Permission denied',dirs:[]}});
  assert.equal(h.doc.activeElement,h.get('folder-path'));
  assert.equal(h.host.querySelector('[role="alert"]').textContent,'Permission denied');
  h.key('Escape');assert.equal(h.app.state.showImport,true);assert.equal(h.app.state.folderPick,null);
  assert.equal(h.doc.activeElement,h.get('choose-folder'));
  h.key('Escape');assert.equal(h.doc.activeElement,h.opener);
});
test('return focus survives replacement of toolbar opener',()=>{
  const h=setup();h.app.setState({showImport:true});h.opener.remove();
  const replacement=h.doc.createElement('button');replacement.setAttribute('data-open-import','');h.background.appendChild(replacement);
  h.key('Escape');assert.equal(h.doc.activeElement,replacement);
});
test('folder path drafts survive unrelated redraws but navigation updates the path',()=>{
  const h=setup();h.app.setState({folderPick:{title:'Folder',path:'/models',dirs:[]}});
  h.get('folder-path').value='/typing/new/path';
  h.app.setState({importError:'Unrelated status'});
  assert.equal(h.get('folder-path').value,'/typing/new/path');
  h.app.setState({folderPick:{title:'Folder',path:'/other',dirs:[]}});
  assert.equal(h.get('folder-path').getAttribute('value'),'/other');
});
test('closing restores preexisting inert state and removes keyboard capture',()=>{
  const h=setup();h.background.inert=true;h.app.setState({showImport:true});h.key('Escape');
  assert.equal(h.background.inert,true);assert.ok(!h.key('Tab').defaultPrevented);
});
