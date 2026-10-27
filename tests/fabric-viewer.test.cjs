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
test('reopening a connection restores its pending device code and continues to workspace discovery',async()=>{
 const {c}=harness();const priorDocument=global.document;global.document={activeElement:null};let completion;const codes=[];let statuses=0;
 const pending={userCode:'RESTORED',expiresAt:Date.now()+60000};c.account=null;c.draw=()=>{if(c.deviceLogin)codes.push(c.deviceLogin.userCode);};
 c.request=async p=>p.action==='status'?(++statuses===1?{available:true,account:null,deviceLogin:pending}:{account:{id:'a',tenantId:'t'}}):{items:[{id:'w',name:'Showcase Demo'}]};
 const run=c.run.bind(c);c.run=fn=>completion=run(fn);
 try{c.show();await completion;assert.ok(codes.includes('RESTORED'));assert.equal(c.account.id,'a');assert.equal(c.items[0].name,'Showcase Demo');assert.equal(c.deviceLogin,null);assert.equal(c.busy,false);}finally{global.document=priorDocument;}
});
test('workspace discovery remains available while browsing models and appending model pages',async()=>{
  const {c}=harness();c.workspace=null;c.generation=1;
  c.request=async p=>p.action==='listWorkspaces'?{items:[{id:'w',name:'Workspace'}],continuationToken:'more-workspaces'}:{items:[{id:p.continuationToken?'m2':'m1',name:'Model'}],continuationToken:p.continuationToken?null:'more-models'};
  await c.list(false,1);c.workspace=c.items[0];await c.list(false,1);await c.list(true,1);
  assert.deepEqual(c.workspaceItems,[{id:'w',name:'Workspace'}]);assert.equal(c.workspaceNext,'more-workspaces');
  assert.deepEqual(c.items.map(i=>i.id),['m1','m2']);assert.equal(c.next,null);
});

test('real REST diagnostics propagate through bridge and host UI without cached success or raw objects',async()=>{
 const {createService}=require('../tools/fabric/bridge.cjs');
 const {createFabricClient}=require('../tools/fabric/client.cjs');
 const W='00000000-0000-0000-0000-000000000001',M='00000000-0000-0000-0000-000000000002',R='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const responses=[new Response('{}',{status:403}),new Response(null,{status:202,headers:{'x-ms-operation-id':R}}),new Response(JSON.stringify({status:'Failed',error:{errorCode:'UnknownError',isRetriable:false,requestId:R,message:'SECRET'}}))];
 const client=createFabricClient({getAccessToken:async()=> 'SECRET TOKEN',wait:async()=>{},fetch:async()=>responses.shift()});
 client.listWorkspaces=async()=>[{id:W,displayName:'Workspace'}];client.listModels=async()=>[{id:M,displayName:'Model'}];
 const service=createService({auth:{status:async()=>({account:{id:'a',tenantId:'tenant'}})},client});
 const {c,app,opened}=harness();c.transport='rest';c.workspace={id:W,name:'Workspace'};app.host={fabricRequest:payload=>service.request(payload)};
 app.setStore([{id:'old',name:'Cached',model:{tables:[]}}]);
 await c.run(async function(n){await this.open({id:M,name:'Model'},n);});
 assert.match(c.error,/Code: UnknownError/);assert.match(c.error,/Retriable: false/);assert.ok(c.error.includes(R));assert.match(c.error,/Capacity observed during preflight: Unknown/);
 for(const secret of ['SECRET',W,M,'https://','[object Object]'])assert.ok(!c.error.includes(secret));
 assert.equal(app.message.snapshotError,c.error);assert.equal(opened.length,0);assert.equal(app.getStore()[0].name,'Cached');
 await service.dispose();
});
