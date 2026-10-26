const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeVscode,install}=require('./vscode-mock');
const path=require('node:path');
test('Fabric colours migrate across workspaces while repository colours remain workspace-local',async()=>{
 const shared=new Map(),key='smv-group-colours-v1:fabric:tenant:workspace:model',local='smv-group-colours-v1:ws:Model';
 const first=makeVscode({extensionRoot:path.resolve(__dirname,'../vscode-extension'),globalState:shared});
 const restore=install(first);
 try{
  const {ViewerPanel}=require('../vscode-extension/src/panel');
  const a=new ViewerPanel(first.context);
  await first.context.workspaceState.update('smv:'+key,'old colours');
  await first.context.workspaceState.update('smv:'+local,'repo colours');
  await a.migrateFabricColours();
  assert.equal(first.context.workspaceState.get('smv:'+key),undefined);
  assert.equal(shared.get('smv:'+key),'old colours');
  await a.handleMessage({type:'storage',key,value:'new colours'},null,()=>{});
  const second=makeVscode({extensionRoot:path.resolve(__dirname,'../vscode-extension'),globalState:shared});
  const b=new ViewerPanel(second.context);
  await second.context.workspaceState.update('smv:'+key,'stale workspace copy');
  await b.migrateFabricColours();
  assert.equal(b.storageDump()[key],'new colours');
  assert.equal(b.storageDump()[local],undefined);
  assert.equal(a.storageDump()[local],'repo colours');
  assert.equal(shared.get('smv:'+local),undefined);
  a.dispose();b.dispose();
 }finally{restore();}
});
