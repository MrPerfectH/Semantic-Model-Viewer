'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const root=process.env.SMV_PLUGIN_TEST_ROOT||path.resolve(__dirname,'..');
const load=name=>require(path.join(root,'Models/tools/viewer/scripts/cli',name+'.cjs'));
const fabric=load('fabric'),auth=load('fabric-auth'),provenance=load('provenance'),opener=load('opener');
const cli=path.join(root,'bin/smv.cjs'),WS='11111111-1111-1111-1111-111111111111',MODEL='22222222-2222-2222-2222-222222222222',OP='33333333-3333-3333-3333-333333333333';
const part=(file,text)=>({path:file,payload:Buffer.from(text).toString('base64'),payloadType:'InlineBase64'});
const definition={definition:{parts:[part('definition/model.tmdl','model Retail\n\tculture: en-US\n'),part('definition/tables/Date.tmdl','table Date\n\tcolumn Key\n\t\tdataType: int64\n')]}};
const response=(data,status=200,headers={})=>new Response(data===null?null:JSON.stringify(data),{status,headers});
function workspace(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv fetch '));t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:50}));return dir;}
function run(cwd,args,options={}){const result=spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:30000,env:{...process.env,SMV_STATE_DIR:path.join(cwd,'state'),SMV_CACHE_DIR:path.join(cwd,'cache'),SMV_OPENER:'none',...options.env},input:options.input});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
test('Fabric transport resolves paginated names, polls LROs and keeps credentials out of the downloaded model',async t=>{
 const dir=workspace(t),calls=[];let polls=0;
 const client=fabric.createClient('test-credential',{sleep:async()=>{},fetch:async(url,options)=>{calls.push({url,options});assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer test-credential');
  if(url.endsWith('/workspaces'))return response({value:[],continuationToken:'next'});
  if(url.includes('continuationToken='))return response({value:[{id:WS,displayName:'Wörkspace'}]});
  if(url.includes('/items?'))return response({value:[{id:MODEL,displayName:'Retail'}]});
  if(options.method==='POST')return response(null,202,{Location:`${fabric.BASE}/operations/${OP}`,'Retry-After':'0'});
  if(url.endsWith('/result'))return response(definition);
  polls++;return response({status:polls===1?'Running':'Succeeded'},200,{'Retry-After':'0'});
 }});
 const fetched=await fabric.fetchModel({workspace:'wörkspace',model:'retail',out:path.join(dir,'Retail.SemanticModel')},{token:async()=> 'test-credential',client});
 assert.equal(fetched.workspace.id,WS);assert.equal(polls,2);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 const receipt=provenance.describe(fetched.path);assert.equal(receipt.kind,'fabric-definition');assert.equal(receipt.unchangedSinceFetch,true);assert.match(receipt.remoteFreshness,/Not checked/);
 const marker=fs.readFileSync(path.join(fetched.path,provenance.MARKER),'utf8');assert.ok(!marker.includes('test-credential'));
 fs.appendFileSync(path.join(fetched.path,'definition/model.tmdl'),'\tdefaultPowerBIDataSourceVersion: powerBI_V3\n');assert.equal(provenance.describe(fetched.path).unchangedSinceFetch,false);
});
test('Fabric retries are bounded and never forward credentials to redirects or foreign pagination hosts',async()=>{
 let attempts=0;const waits=[];
 const busy=fabric.createClient('private',{sleep:async ms=>waits.push(ms),fetch:async()=>{attempts++;return response({},429,{'Retry-After':'0'});}});
 await assert.rejects(busy.list(fabric.BASE+'/workspaces'),{code:'FABRIC_THROTTLED'});assert.equal(attempts,5);
 const malicious=fabric.createClient('private',{fetch:async()=>response({value:[],continuationUri:'https://example.com/steal'})});await assert.rejects(malicious.list(fabric.BASE+'/workspaces'),{code:'FABRIC_UNSAFE_URL'});
 const redirected=fabric.createClient('private',{fetch:async()=>response({},302,{Location:'https://example.com/'})});await assert.rejects(redirected.list(fabric.BASE+'/workspaces'),{code:'FABRIC_HTTP'});
 const denied=fabric.createClient('private',{fetch:async()=>response({message:'DO NOT EXPOSE private'},403)});await assert.rejects(denied.definition(WS,MODEL),e=>e.code==='FABRIC_PERMISSION'&&!e.message.includes('private'));
 const failed=fabric.createClient('private',{sleep:async()=>{},fetch:async(url,opts)=>opts.method==='POST'?response(null,202,{Location:`${fabric.BASE}/operations/${OP}`,'Retry-After':'0'}):response({status:'Failed',error:{message:'private'}})});await assert.rejects(failed.definition(WS,MODEL),{code:'FABRIC_OPERATION'});
});
test('downloads reject traversal, duplicate and malformed parts and preserve existing output',async t=>{
 const dir=workspace(t);
 for(const file of ['../outside','/root','C:/escape','definition/../escape','definition\\escape','definition/NUL.tmdl','.git/config','.smv-source.json'])assert.throws(()=>fabric.validateParts({definition:{parts:[...definition.definition.parts,part(file,'x')]}}),{code:'FABRIC_PATH'});
 assert.throws(()=>fabric.validateParts({definition:{parts:[...definition.definition.parts,part('definition/MODEL.tmdl','duplicate')]}}),{code:'FABRIC_PATH'});
 assert.throws(()=>fabric.validateParts({definition:{parts:[{...definition.definition.parts[0],payload:'@bad'}]}}),{code:'FABRIC_DEFINITION'});
 const output=path.join(dir,'existing.SemanticModel');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'keep.txt'),'preserved');
 await assert.rejects(fabric.fetchModel({workspace:WS,model:MODEL,out:output},{token:async()=> 'x',client:{definition:async()=>definition}}),{code:'OUTPUT_EXISTS'});assert.equal(fs.readFileSync(path.join(output,'keep.txt'),'utf8'),'preserved');
 const target=path.join(dir,'failed.SemanticModel');await assert.rejects(fabric.fetchModel({workspace:WS,model:MODEL,out:target},{token:async()=> 'x',client:{definition:async()=>({definition:{parts:[part('../escape','x')]}})}}));assert.ok(!fs.existsSync(target));assert.ok(!fs.existsSync(target+'.smv-fetch.lock'));assert.ok(!fs.readdirSync(dir).some(n=>n.startsWith('.smv-fetch-')));
 await assert.rejects(fabric.fetchModel({workspace:'Duplicate',model:MODEL,out:target},{token:async()=> 'x',client:{list:async()=>[{id:WS,displayName:'Duplicate'},{id:MODEL,displayName:'Duplicate'}]}}),e=>e.code==='FABRIC_AMBIGUOUS'&&e.details.matches.length===2);
});
test('authentication reuses Azure login without logging its output or interpolating tenant commands',async()=>{
 const seen=[];const exec=async(command,args)=>{seen.push({command,args});return {stdout:JSON.stringify({accessToken:'private-token'})};};
 assert.equal(await auth.token({tenant:WS},{exec,platform:'linux'}),'private-token');assert.ok(seen[0].args.includes('https://api.fabric.microsoft.com'));
 assert.equal(await auth.token({tenant:WS},{exec,platform:'win32'}),'private-token');assert.equal(seen[1].command,'cmd.exe');
 await assert.rejects(auth.token({tenant:'bad; command'},{exec}),{code:'AUTH_INVALID'});
 await assert.rejects(auth.token({},{exec:async()=>{throw Object.assign(new Error('private-token'),{code:'FAIL'});}}),e=>e.code==='AUTH_REQUIRED'&&!e.message.includes('private-token'));
 assert.equal(await auth.token({tokenStdin:true},{stdin:(async function*(){yield 'stdin-token\n';})()}),'stdin-token');
});
test('opening policy respects explicit none and passes exactly one argument without a shell',async()=>{
 assert.equal(opener.policy({},'none',{}).mode,'none');assert.equal(opener.policy({},'system',{SMV_OPENER:'none'}).mode,'none');assert.equal(opener.policy({open:'none'},'none',{SMV_OPENER:'firefox'}).mode,'none');assert.throws(()=>opener.policy({open:'bad'}));
 let call;const spawn=(command,args,options)=>{call={command,args,options};const child=new EventEmitter();child.kill=()=>{};queueMicrotask(()=>child.emit('exit',0));return child;};
 const result=await opener.open('/tmp/a file.html',{open:'system',opener:'/bin/custom browser'},'none',{spawn,env:{}});assert.equal(result.launched,true);assert.equal(call.command,'/bin/custom browser');assert.equal(call.args.length,1);assert.match(call.args[0],/a%20file.html/);assert.equal(call.options.shell,false);
 const fail=await opener.open('http://127.0.0.1:1234/',{open:'system'},'none',{spawn:()=>{throw new Error('missing');},env:{}});assert.equal(fail.launched,false);assert.match(fail.message,/remains available/);
});
test('one-command workspace diagram downloads through the adapter and writes verifiable offline receipts',t=>{
 const dir=workspace(t),preload=path.join(dir,'fabric-mock.cjs');
 fs.writeFileSync(preload,`global.fetch=async (url,options)=>{if(!url.startsWith('https://api.fabric.microsoft.com/v1/'))throw new Error('unexpected origin');return new Response(JSON.stringify(${JSON.stringify(definition)}),{status:200});};`);
 const out=path.join(dir,'diagram.html');
 const result=run(dir,['show','--workspace',WS,'--model',MODEL,'--table','Date','--related','--out',out,'--token-stdin','--open','none'],{input:'private-stdin-token',env:{NODE_OPTIONS:'--require '+JSON.stringify(preload)}});
 assert.equal(result.opening.launched,false);assert.equal(result.receipt.source.workspace.id,WS);assert.equal(result.receipt.source.unchangedSinceFetch,true);
 const receipt=JSON.parse(fs.readFileSync(result.receiptPath,'utf8'));assert.equal(receipt.artifact.sha256,provenance.sha256(fs.readFileSync(out)));assert.equal(receipt.artifact.containsFullModelMetadata,true);assert.match(receipt.renderer.sha256,/^[a-f0-9]{64}$/);assert.match(receipt.source.modelHash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(result).includes('private-stdin-token'));
 const plain=run(dir,['snapshot',receipt.source.path,'--out',path.join(dir,'snapshot.html'),'--json','--open','none']);assert.equal(plain.receipt.source.kind,'fabric-definition');assert.ok(fs.existsSync(plain.receiptPath));
 assert.deepEqual(run(dir,['session','list']),[]);
 const blocked=spawnSync(process.execPath,[cli,'show',receipt.source.path,'--table','Date','--out',out],{cwd:dir,encoding:'utf8',env:{...process.env,SMV_OPENER:'none'}});assert.notEqual(blocked.status,0);assert.equal(provenance.sha256(fs.readFileSync(out)),receipt.artifact.sha256);
});

test('source changes during export cannot replace the last successful artifact or receipt',async t=>{
 const dir=workspace(t),model=path.join(dir,'model.bim'),out=path.join(dir,'view.html');fs.writeFileSync(model,JSON.stringify({name:'Stable',model:{tables:[]}}));
 const prepared={hash:'metadata-hash',renderer:{sha256:'renderer-hash'},summary:{tables:0},sourceContentHash:provenance.contentHash(model)};
 fs.writeFileSync(out,'last good artifact');fs.writeFileSync(out+'.receipt.json','last good receipt');
 await assert.rejects(provenance.publish(model,prepared,out,{force:true},async candidate=>{fs.writeFileSync(candidate,'new artifact');fs.appendFileSync(model,' ');}),{code:'SOURCE_CHANGED'});
 assert.equal(fs.readFileSync(out,'utf8'),'last good artifact');assert.equal(fs.readFileSync(out+'.receipt.json','utf8'),'last good receipt');assert.ok(!fs.readdirSync(dir).some(n=>n.startsWith('.smv-artifact-')));
});
