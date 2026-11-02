const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./power-query-ui-harness.cjs');
test('relationship selection and neighbour navigation are independent keyboard buttons',()=>{
 const h=harness('util.js');let picked=0,navigated=0;
 h.win.U.clear=n=>n.replaceChildren();Object.getPrototypeOf(h.host).contains=function(node){for(;node;node=node.parentElement)if(node===this)return true;return false;};h.doc.createTextNode=text=>{const n=h.doc.createElement('span');n.textContent=text;return n;};
 require('node:vm').runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'../Models/tools/viewer/js/sidebar.js'),'utf8'),h.win);
 const app={state:{loaded:true,selected:'Sales',viewMode:'graph'},model:{byName:{Sales:{}}},canvas:{relIndex:()=>0},roleRepo:()=>null};
 const sidebar=new h.win.Sidebar(app,h.host);
 sidebar.build=()=>({name:'Sales',role:'measures',rels:[{key:'Sales|0',other:'Date',dir:'←',join:'DateKey = DateKey',card:'* : 1',rowStyle:'',pick:()=>picked++,go:()=>navigated++}],hasRels:true,columns:[],measures:[],calcItems:[]});
 sidebar.update();
 const row=h.host.querySelector('.smv-relationship-row');
 const buttons=row.querySelectorAll('button');assert.equal(buttons.length,2);
 assert.equal(buttons[0].querySelectorAll('button').length,0);
 buttons[0].fire('click');assert.equal(picked,1);assert.equal(navigated,0);
 assert.equal(buttons[1].getAttribute('aria-label'),'Go to Date');buttons[1].fire('click');assert.equal(picked,1);assert.equal(navigated,1);
 buttons[1].focus();assert.equal(h.doc.activeElement,buttons[1]);
 buttons[0].focus();sidebar._key=null;sidebar.update();assert.equal(h.doc.activeElement.getAttribute('data-sidebar-action'),'Sales|0|select');assert.notEqual(h.doc.activeElement,buttons[0]);
});
