'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ext=path.join(root,'vscode-extension');
function records(dir,relative=''){
 return fs.readdirSync(path.join(dir,relative),{withFileTypes:true}).flatMap(e=>{const file=relative?relative+'/'+e.name:e.name;return e.isDirectory()?records(dir,file):e.name.endsWith('.tmdl')?[{name:e.name,path:file,text:fs.readFileSync(path.join(dir,file),'utf8')}]:[];});
}
test('shared record engine preserves CLI relationship answers and renders both diagram modes',()=>{
 const source=path.join(root,'Models/demo/Contoso Retail.SemanticModel');
 const engine=require('../packages/engine/index.cjs'),query=require('../Models/tools/viewer/scripts/cli/query.cjs');
 const loaded=engine.loadRecords(records(source),{identity:'vscode-remote://test/model',name:'Demo'});
 assert.equal(engine.relations(loaded,'Sales').counts.total,query.focused(source,'Sales','relations').counts.total);
 assert.equal(engine.dependents(loaded,'Sales').counts.total,query.focused(source,'Sales','dependents').counts.total);
 const plan=engine.plan(loaded,{table:'Sales',related:true,dependents:true});assert.equal(plan.views.length,2);
 for(const item of plan.views){const rendered=engine.render(loaded,item.view);assert.match(rendered.html,/SMVExplanation.start/);assert.equal(rendered.view.mode,item.view.mode);assert.equal(rendered.provenance.source,'vscode-remote://test/model');}
 assert.throws(()=>engine.loadRecords([{name:'model.bim',text:'{"model":{"tables":[]}}'}]),/No tables/);
 assert.throws(()=>engine.plan(loaded,{table:'Missing'}),/Unknown table/);
 const mixed=engine.loadRecords([...records(source),{name:'model.bim',path:'model.bim',text:'stale invalid BIM must not be parsed'},{name:'other.tmdl',path:'backup/other.tmdl',text:'table StaleOutsideDefinition'}]);
 assert.equal(mixed.model.tables.length,loaded.model.tables.length);assert.equal(mixed.model.tables.some(t=>t.name==='StaleOutsideDefinition'),false);
});
test('native tools use the packaged worker, require workspace trust, preserve views and acknowledge revisions',async t=>{
 require('../scripts/sync-engine.cjs').sync(path.join(ext,'engine'));
 const {makeVscode,install,Uri}=require('./vscode-mock');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv native tools '));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const model=path.join(temp,'Demo.SemanticModel');fs.cpSync(path.join(root,'Models/demo/Contoso Retail.SemanticModel'),model,{recursive:true});
 const vscode=makeVscode({folders:[temp],extensionRoot:ext,saveDialog:()=>Uri.file(path.join(temp,'diagram.html'))});
 const tools=new Map();vscode.workspace.isTrusted=true;
 vscode.lm={registerTool:(name,tool)=>{tools.set(name,tool);return {dispose:()=>tools.delete(name)};}};
 vscode.LanguageModelTextPart=class{constructor(value){this.value=value;}};
 vscode.LanguageModelToolResult=class{constructor(content){this.content=content;}};
 const restore=install(vscode);t.after(restore);
 // Do not reuse another test's host binding.
 for(const file of ['agent-tools.js','workspace.js'])delete require.cache[require.resolve(path.join(ext,'src',file))];
 const api=require(path.join(ext,'src/agent-tools')).register({extensionPath:ext});t.after(()=>api.dispose());
 assert.equal(tools.size,6);
 const discover=await api.run('discover');assert.equal(discover.models.length,1);
 const input={model:discover.models[0].id,table:'Sales',related:true,dependents:true};
 const first=await api.run('show',input);assert.equal(first.views.length,2);assert.equal(vscode._panels.length,2);
 for(const [index,panel] of vscode._panels.entries()){
  assert.match(panel.webview.html,/Content-Security-Policy/);assert.match(panel.webview.html,/connect-src 'none'/);
  assert.deepEqual(panel.options.localResourceRoots,[]);
  panel.webview.receive({type:'applied',revision:first.views[index].revision-1});
 }
 let again=await api.run('show',input);assert.ok(again.views.every(v=>v.reused&&v.status==='awaiting-viewer'));
 for(const [index,panel] of vscode._panels.entries())panel.webview.receive({type:'applied',revision:first.views[index].revision});
 again=await api.run('show',input);assert.ok(again.views.every(v=>v.reused&&v.status==='applied'));assert.equal(vscode._panels.length,2);
 fs.appendFileSync(path.join(model,'definition/model.tmdl'),'\n// changed source\n');
 const changed=await api.run('show',input);assert.ok(changed.views.every(v=>!v.reused&&v.status==='awaiting-viewer'));assert.equal(vscode._panels.length,2);
 const exported=await api.run('snapshot',{...input,dependents:false});assert.ok(fs.statSync(path.join(temp,'diagram.html')).size>10000);assert.match(exported.contents,/Full-model/);
 const revision=changed.views[0].revision;vscode._panels[0].webview.receive({type:'failed',revision,error:'test failure'});
 const retry=await api.run('show',input);assert.equal(retry.views[0].reused,false);assert.ok(retry.views[0].revision>revision);
 const result=await tools.get('smv_relations').invoke({input},{});assert.equal(JSON.parse(result.content[0].value).table,'Sales');
 await assert.rejects(api.run('inspect',input,{isCancellationRequested:true}),/Cancelled/);
 vscode.workspace.isTrusted=false;await assert.rejects(api.run('discover'),/Trust/);
});
test('source launcher fails clearly without a private runtime and never invokes a PATH CLI',t=>{
 if(process.platform==='win32')return t.skip('POSIX launcher covered on macOS/Linux; Windows complete-package test runs in portable CI');
 const result=spawnSync('/bin/sh',[path.join(root,'bin/smv'),'--version'],{env:{PATH:'',HOME:os.homedir()},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/complete portable plugin package/);
});

test('runtime assembly rejects corrupt downloads and inputs before producing a package',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv runtime trust '));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const {vendor}=require('../scripts/vendor-node.cjs'),lock=require('../runtime/node-lock.json');
 t.mock.method(globalThis,'fetch',async()=>new Response('corrupt runtime',{status:200,headers:{'content-length':'15'}}));
 await assert.rejects(vendor('linux-x64',path.join(temp,'runtime')),/checksum mismatch/);
 assert.deepEqual(fs.readdirSync(temp),[]);
 const target=path.join(temp,'linux-x64');fs.mkdirSync(target);fs.writeFileSync(path.join(target,'node'),'corrupt');fs.writeFileSync(path.join(target,'LICENSE'),'test');
 fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify({version:lock.version,target:'linux-x64',archiveSha256:lock.targets['linux-x64'].sha256,files:{node:'0'.repeat(64),LICENSE:'0'.repeat(64)}}));
 assert.throws(()=>require('../scripts/build-portable.cjs').build({out:path.join(temp,'payload'),runtimeRoot:temp,targets:['linux-x64']}),/checksum mismatch/);
 assert.equal(fs.existsSync(path.join(temp,'payload')),false);
});
