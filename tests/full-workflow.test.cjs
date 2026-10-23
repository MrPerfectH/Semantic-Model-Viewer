'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cli=path.join(root,'bin/smv.cjs'),demo=path.join(root,'Models/demo/Contoso Retail.SemanticModel');
const api=require('../Models/tools/viewer/scripts/cli/session.cjs'),managed=require('../Models/tools/viewer/scripts/cli/managed.cjs'),{prepare}=require('../Models/tools/viewer/scripts/cli/explain.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv workflow '));const oldState=process.env.SMV_STATE_DIR;process.env.SMV_STATE_DIR=path.join(dir,'state');const model=path.join(dir,'Model with spaces.SemanticModel');fs.cpSync(demo,model,{recursive:true});t.after(async()=>{try{await managed.stopAll();await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:50});}finally{if(oldState===undefined)delete process.env.SMV_STATE_DIR;else process.env.SMV_STATE_DIR=oldState;}});return {dir,model};}
function run(cwd,...args){const r=spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:20000,env:process.env});assert.equal(r.status,0,r.stderr||String(r.error));return JSON.parse(r.stdout);}
test('relative table sets resolve consistently and focused queries omit formulas by default',t=>{
  const {model,dir}=setup(t);
  const rel=run(dir,'relations',model,'--table','Date');assert.ok(rel.tables.some(t=>t.name==='Sales'));assert.ok(rel.counts.inactive>0);assert.ok(!rel.relationships);assert.ok(JSON.stringify(rel).length<5000);
  const deps=run(dir,'dependents','Date','--model',model);assert.ok(deps.counts.direct>0);assert.ok(deps.measures.every(m=>!('dax' in m)));assert.ok(run(dir,'dependents',model,'--table','Date','--details').measures.every(m=>'dax' in m));
  const p=prepare(model,{version:2,tables:{relatedTo:'date'},focus:{kind:'table',name:'Date'},arrange:true,banner:false});assert.ok(p.view.tables.includes('Sales'));assert.equal(p.summary.tables,p.view.tables.length);
  assert.ok(prepare(model,{version:2,tables:{filteredBy:'Date',depth:1}}).view.tables.includes('Sales'));
  assert.ok(prepare(model,{version:2,tables:{filters:'Sales',depth:1}}).view.tables.includes('Date'));
  assert.throws(()=>prepare(model,{version:2,tables:{relatedTo:'Missing'}}),/unknown related table/);
  assert.throws(()=>prepare(model,{version:2,tables:{relatedTo:'Sales',filteredBy:'Date'}}),/exactly one/);
  assert.throws(()=>prepare(model,{version:2,arrange:'yes'}),/arrange must be boolean/);
  const view=path.join(dir,'view.json'),html=path.join(dir,'portable.html');fs.writeFileSync(view,JSON.stringify({version:2,tables:{relatedTo:'Date',depth:1},arrange:true,banner:false}));
  const r=spawnSync(process.execPath,[cli,'snapshot',model,'--view',view,'--out',html],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(fs.readFileSync(html,'utf8'),/SMVExplanation.start/);
});
test('show reuses one model session, creates independent named views and reports real applied counts',async t=>{
  const {dir,model}=setup(t),first=run(dir,'show',model,'--table','Date','--related','--dependents');assert.equal(first.views.length,2);assert.ok(first.workspaceUrl.includes('/workspace'));
  const again=run(dir,'show',model,'--table','Date','--related','--dependents');assert.equal(again.sessionId,first.sessionId);assert.equal(again.reused,true);assert.equal(again.views[0].revision,1);
  const served=run(dir,'serve',path.join(model,'definition'),'--background','--json');assert.equal(served.sessionId,first.sessionId);
  const second=run(dir,'show',model,'--table','Sales');assert.equal(second.sessionId,first.sessionId);assert.equal((await api.request(first.sessionFile,'views')).views.length,5);
  const [tables,measures]=first.views,workspace=await (await fetch(first.workspaceUrl)).text();assert.match(workspace,/Side by side/);assert.match(workspace,/<iframe/);
  const before=await api.request(first.sessionFile,'status',undefined,tables.id);assert.equal(before.application.browserAcknowledged,false);
  await api.request(first.sessionFile,'update',{expectedRevision:1,view:{version:2,mode:'graph',tables:{relatedTo:'Date',depth:1}},apply:true},tables.id);
  assert.equal((await api.request(first.sessionFile,'status',undefined,measures.id)).revision,1);
  const current={version:2,mode:'graph',tables:['Date','Sales']};
  await api.request(first.sessionFile,'client',{clientId:'browser',revision:2,sourceRevision:before.sourceRevision,currentView:current,renderedSummary:{workspace:'graph',tableCanvasTables:2}},tables.id);
  const applied=await api.request(first.sessionFile,'status',undefined,tables.id);assert.equal(applied.application.browserAcknowledged,true);assert.equal(applied.clients[0].appliedSummary.tables,2);assert.equal(applied.clients[0].renderedSummary.tableCanvasTables,2);
  assert.equal((await api.request(first.sessionFile,'status',undefined,measures.id)).application.browserAcknowledged,false);
  assert.equal(run(dir,'session','list','--model',model).length,1);
  const stopped=run(dir,'session','stop','--all','--model',model);assert.deepEqual(stopped.stopped,[first.sessionId]);
});
test('managed sessions warn about old runtime versions and bulk cleanup leaves foreign files alone',async t=>{
  const {model,dir}=setup(t);const real=managed.version;t.mock.method(managed,'version',()=> '0.0.1');const server=await api.serve(model,{newSession:true});t.mock.method(managed,'version',real);
  const again=await api.serve(model,{background:true});assert.equal(again.sessionId,server.sessionId);assert.ok(again.warnings.length);
  const foreign=path.join(managed.directory(),'foreign.json');fs.writeFileSync(foreign,JSON.stringify({file:'/unrelated',pid:process.pid}));await managed.stopAll();assert.ok(fs.existsSync(foreign));
});
test('stable launcher follows plugin registry updates and refuses to replace unrelated commands',t=>{
  const {dir}=setup(t),bin=path.join(dir,'bin'),registry=path.join(dir,'registry.json');const oldRegistry=process.env.SMV_INSTALL_REGISTRY;process.env.SMV_INSTALL_REGISTRY=registry;t.after(()=>{if(oldRegistry===undefined)delete process.env.SMV_INSTALL_REGISTRY;else process.env.SMV_INSTALL_REGISTRY=oldRegistry;});
  function plugin(version,text){const p=path.join(dir,'cache',version);fs.mkdirSync(path.join(p,'bin'),{recursive:true});fs.mkdirSync(path.join(p,'.claude-plugin'));fs.writeFileSync(path.join(p,'.claude-plugin','plugin.json'),JSON.stringify({name:'semantic-model-viewer'}));fs.writeFileSync(path.join(p,'bin','smv.cjs'),'process.stdout.write('+JSON.stringify(text)+')');return p;}
  const v1=plugin('1','first'),v2=plugin('2','second');const set=p=>fs.writeFileSync(registry,JSON.stringify({plugins:{'semantic-model-viewer@semantic-model-tools':[{scope:'user',installPath:p}]}}));set(v1);
  const installed=require('../Models/tools/viewer/scripts/cli/install.cjs').install({binDir:bin});const file=process.platform==='win32'?path.join(bin,'smv.cjs'):installed.path;
  assert.equal(spawnSync(process.execPath,[file],{encoding:'utf8'}).stdout,'first');set(v2);assert.equal(spawnSync(process.execPath,[file],{encoding:'utf8'}).stdout,'second');
  fs.writeFileSync(file,'unrelated');assert.throws(()=>require('../Models/tools/viewer/scripts/cli/install.cjs').install({binDir:bin}),/unrelated command/);assert.equal(fs.readFileSync(file,'utf8'),'unrelated');
});

test('concurrent serve calls share a managed server instead of racing duplicate starts',async t=>{
  const {dir,model}=setup(t),{promisify}=require('node:util'),exec=promisify(require('node:child_process').execFile);
  const results=await Promise.all([1,2].map(()=>exec(process.execPath,[cli,'serve',model,'--background','--json'],{cwd:dir,env:process.env,timeout:20000})));
  const rows=results.map(r=>JSON.parse(r.stdout));assert.equal(rows[0].sessionId,rows[1].sessionId);assert.equal((await managed.list(model)).filter(r=>r.running).length,1);
});
test('watched relative views recompute membership when a new relationship appears',async t=>{
  const {dir}=setup(t),file=path.join(dir,'relative.bim');
  const data={name:'Relative',model:{tables:['A','B','C'].map(name=>({name,columns:[{name:'Key',dataType:'int64'}],measures:[]})),relationships:[{name:'ab',fromTable:'B',fromColumn:'Key',toTable:'A',toColumn:'Key'}]}};
  fs.writeFileSync(file,JSON.stringify(data));const server=await api.serve(file,{watch:true,newSession:true});
  await api.request(server.sessionFile,'views',{views:[{id:'related',label:'Related',view:{version:2,tables:{filteredBy:'A'}}}]});
  assert.equal((await api.request(server.sessionFile,'status',undefined,'related')).authoredSummary.tables,2);
  data.model.relationships.push({name:'ac',fromTable:'C',fromColumn:'Key',toTable:'A',toColumn:'Key'});fs.writeFileSync(file,JSON.stringify(data));
  const end=Date.now()+4000;let status;do{await new Promise(r=>setTimeout(r,100));status=await api.request(server.sessionFile,'status',undefined,'related');}while(status.revision===1&&Date.now()<end);
  assert.equal(status.authoredSummary.tables,3);assert.equal(status.revision,2);
});

test('show reuses a compatible model server with a custom default view',async t=>{
  const {dir,model}=setup(t),view=path.join(dir,'initial.json');fs.writeFileSync(view,JSON.stringify({version:2,tables:['Date']}));
  const server=await api.serve(model,{view,background:true});const shown=run(dir,'show',model,'--table','Cost Center');assert.equal(shown.sessionId,server.sessionId);assert.equal(shown.reused,true);
});
