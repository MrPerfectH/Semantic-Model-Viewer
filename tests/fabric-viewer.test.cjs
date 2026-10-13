const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FabricConnection,sourceOf,key}=require('../Models/tools/viewer/js/fabric.js');
function harness(){
  let records=[],opened=[];global.U={store:{set(){},del(){}}};
  const app={snapshotMode:false,server:{},modelKey:'old',getStore:()=>records,setStore(r){records=r;return true;},hostOpenModel(r){opened.push(r);this.modelKey=r.id;},render(){},setState(p){this.message=p;},loadEmptyModel(){this.modelKey=null;}};
  const c=new FabricConnection(app);c.draw=()=>{};c.workspace={id:'workspace',name:'Workspace'};c.account={tenantId:'tenant'};
  return {c,app,opened};
}
test('connection identity cannot persist credentials or collide across tenants',()=>{
  const s=sourceOf({tenantId:'t',workspaceId:'w',modelId:'m',accessToken:'secret',refreshToken:'secret'});
  assert.equal(s.accessToken,undefined);assert.equal(s.refreshToken,undefined);
  assert.notEqual(key(s),key({...s,tenantId:'other'}));assert.throws(()=>sourceOf({modelId:'m'}),/identity/);
});
test('open caches parsed metadata, never the host response credentials',async()=>{
  const {c,app,opened}=harness();c.request=async()=>({tenantId:'tenant',accessToken:'secret',files:[{name:'model.bim',text:'dummy'}],model:{tables:[{name:'A'}],relationships:[]}});
  await c.run(async function(n){await this.open({id:'model',name:'Model'},n);});
  assert.equal(opened.length,1);assert.equal(app.getStore()[0].source.kind,'fabric');
  assert.ok(!JSON.stringify(app.getStore()).includes('secret'));
});
test('cancelled and superseded requests cannot cache or replace a model',async()=>{
  const {c,app,opened}=harness();let resolve;c.request=p=>p.action==='cancel'?Promise.resolve({}):new Promise(r=>resolve=r);
  const pending=c.run(async function(n){await this.open({id:'model',name:'Model'},n);});
  c.close();resolve({tenantId:'tenant',model:{tables:[],relationships:[]}});await pending;
  assert.equal(opened.length,0);assert.equal(app.getStore().length,0);
});
test('switching models during a fetch keeps the newly chosen model',async()=>{
  const {c,app,opened}=harness();let resolve;c.request=p=>p.action==='cancel'?Promise.resolve({}):new Promise(r=>resolve=r);
  const pending=c.run(async function(n){await this.open({id:'model',name:'Model'},n);});
  app.modelKey='new';resolve({tenantId:'tenant',model:{tables:[],relationships:[]}});await pending;
  assert.equal(opened.length,0);assert.equal(app.modelKey,'new');
});
test('failed refresh preserves the cached model and exposes an error',async()=>{
  const {c,app}=harness();app.setStore([{id:'old',name:'Cached',model:{tables:[]},source:{tenantId:'tenant',workspaceId:'workspace',modelId:'model'}}]);
  c.request=async()=>{throw new Error('Access revoked');};
  await c.run(async function(n){await this.open({id:'model',name:'Model'},n);});
  assert.equal(app.getStore()[0].name,'Cached');assert.equal(app.message.snapshotError,'Access revoked');
});
test('snapshot mode does not permit connection requests',async()=>{
  const {c,app}=harness();app.snapshotMode=true;
  await assert.rejects(c.request({action:'signIn'}),/available/);
});
test('refresh refuses a response from a different account',async()=>{
  const {c,app,opened}=harness();c.account={tenantId:'tenant',id:'original'};
  c.request=async()=>({tenantId:'tenant',accountId:'other',model:{tables:[],relationships:[]}});
  await c.run(async function(n){await this.open({id:'model',name:'Model'},n);});
  assert.equal(opened.length,0);assert.equal(app.getStore().length,0);assert.match(c.error,/original work account/);
});
test('native cache removal must succeed before deleting local metadata',async()=>{
  const {c,app}=harness();const r={id:'fabric:model',source:{kind:'fabric',tenantId:'tenant',workspaceId:'w',modelId:'m'}};app.setStore([r]);
  app.host={fabricRequest:async()=>{throw new Error('Disk full');}};
  await c.remove(r);assert.equal(app.getStore().length,1);assert.equal(c.error,'Disk full');
  app.host.fabricRequest=async p=>{assert.equal(p.action,'removeModel');return {};};
  await c.remove(r);assert.equal(app.getStore().length,0);
});
