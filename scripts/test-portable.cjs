'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=fs.realpathSync(path.resolve(process.argv[2]||process.env.SMV_PORTABLE_ROOT||'dist/portable'));
const info=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));
const target=(process.platform==='win32'?'win':process.platform)+'-'+process.arch;
assert.ok(info.targets.includes(target),'Artifact must contain this native target');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'SMV portable unicode α '));
const env={...process.env,PATH:'',SMV_STATE_DIR:path.join(temp,'state'),SMV_PACKAGE_CACHE:path.join(temp,'cache'),SMV_RUNTIME_CACHE:path.join(temp,'runtime-cache'),SMV_OPENER:'none'};delete env.SMV_NODE;
const run=(args,selected=root)=>{
 const launcher=path.join(selected,'bin',process.platform==='win32'?'smv.cmd':'smv');
 // cmd.exe consumes its own quoted command string. Preserve those quotes rather
 // than applying Node's default Windows executable argument escaping a second time.
 const result=process.platform==='win32'?spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','"'+[launcher,...args].map(arg=>'"'+String(arg)+'"').join(' ')+'"'],{env,encoding:'utf8',cwd:temp,timeout:45000,windowsVerbatimArguments:true}):spawnSync('/bin/sh',[launcher,...args],{env,encoding:'utf8',cwd:temp,timeout:45000});
 assert.equal(result.status,0,result.stderr||String(result.error));return result.stdout;
};
let session,cached;const changedModes=[];
if(process.platform!=='win32'&&process.env.SMV_TEST_STRIPPED_EXEC==='1')for(const file of ['bin/smv','runtime/'+target+'/node']){const name=path.join(root,file);changedModes.push([name,fs.statSync(name).mode]);fs.chmodSync(name,0o644);}
try{
 assert.equal(run(['--version']).trim(),info.engineVersion);
 const where=JSON.parse(run(['--where','--json']));assert.ok(where.executable.startsWith(root));
 // A filter keeps Node 22 on its JS traversal instead of the native directory
 // copy fast path, which mishandles non-ASCII Windows destinations. The live
 // package cache already uses a filter and therefore follows this same path.
 const model=path.join(temp,'User model.SemanticModel');fs.cpSync(path.join(root,'Models/demo/Contoso Retail.SemanticModel'),model,{recursive:true,filter:()=>true});
 assert.ok(fs.existsSync(path.join(model,'definition/model.tmdl')),'Copied model must exist before launcher invocation');
 const show=JSON.parse(run(['show',model,'--table','Sales','--related','--dependents']));session=show.sessionFile;
 assert.equal(show.views.length,2);assert.ok(show.workspaceUrl);
 cached=path.join(env.SMV_PACKAGE_CACHE,info.sha256);assert.ok(fs.existsSync(path.join(cached,'runtime',target,process.platform==='win32'?'node.exe':'node')));
 // Remove the installation from its original location. A running server must be
 // independent of a plugin cache replacement during an upgrade.
 const moved=root+'.upgrade-test';fs.renameSync(root,moved);
 try{
  const status=JSON.parse(run(['session','status',session,'--json'],cached));assert.ok(status.views.length>=2);
  const response=spawnSync(process.execPath,['-e',"fetch(process.argv[1]).then(async r=>{if(!r.ok||!(await r.text()).includes('Sales'))process.exitCode=1}).catch(e=>{console.error(e);process.exitCode=1})",show.views[0].url],{env,encoding:'utf8',timeout:15000});assert.equal(response.status,0,response.stderr);
 }finally{fs.renameSync(moved,root);}
 const repeated=JSON.parse(run(['show',model,'--table','Sales','--related','--dependents']));assert.equal(repeated.sessionId,show.sessionId);assert.ok(repeated.reused);
 const compared=JSON.parse(run(['compare',model,'--measure','Total Sales','--with','Sales LY']));assert.equal(compared.sessionId,show.sessionId);assert.equal(compared.views.length,1);assert.ok(compared.analysis.counts.shared>0);
 const comparisonOut=path.join(temp,'comparison.html');run(['compare',model,'--measure','Total Sales','--with','Sales LY','--out',comparisonOut]);assert.ok(fs.statSync(comparisonOut).size>100000);
 const out=path.join(temp,'offline.html');run(['snapshot',model,'--out',out]);assert.ok(fs.statSync(out).size>100000);assert.ok(fs.existsSync(out+'.receipt.json'));
 console.log(JSON.stringify({passed:true,host:info.host,target,nodeVersion:info.nodeVersion,engineVersion:info.engineVersion,views:show.views.length,noNodeOnPath:true,strippedModesRecovered:process.env.SMV_TEST_STRIPPED_EXEC==='1',upgradeSurvived:true,snapshotBytes:fs.statSync(out).size}));
}finally{
 for(const [file,mode] of changedModes)if(fs.existsSync(file))fs.chmodSync(file,mode);
 if(session){try{run(['session','stop',session,'--json'],cached||root);}catch(error){console.error('Session cleanup failed: '+error.message);process.exitCode=1;}}
 const writable=dir=>{if(!fs.existsSync(dir))return;fs.chmodSync(dir,0o700);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())writable(file);else if(entry.isFile())fs.chmodSync(file,0o600);}};writable(temp);
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:20,retryDelay:100});
}
