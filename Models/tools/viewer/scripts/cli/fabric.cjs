'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const auth=require('./fabric-auth.cjs'),provenance=require('./provenance.cjs');
const ORIGIN='https://api.fabric.microsoft.com',BASE=ORIGIN+'/v1';
function fail(code,message,details={}){return Object.assign(new Error(message),{code,details});}
function safeUrl(value){const u=new URL(value,BASE+'/');if(u.origin!==ORIGIN||u.username||u.password||u.hash||!u.pathname.startsWith('/v1/'))throw fail('FABRIC_UNSAFE_URL','Fabric returned an unexpected endpoint; no credentials were sent to it');return u.href;}
function createClient(token,options={}){
  const fetchImpl=options.fetch||fetch,now=options.now||Date.now,sleep=options.sleep||(ms=>new Promise(r=>setTimeout(r,ms))),end=now()+(options.timeoutMs||300000);
  const remaining=()=>{const n=end-now();if(n<=0)throw fail('FABRIC_TIMEOUT','Definition download timed out; no completed model was replaced');return n;};
  async function delay(header){const sec=Number(header||1);if(!Number.isFinite(sec)||sec<0||sec*1000>remaining())throw fail('FABRIC_TIMEOUT','Fabric requested a retry beyond the download deadline');await sleep(sec*1000);}
  async function request(url,method='GET'){
    url=safeUrl(url);
    for(let i=0;i<5;i++){
      let r;try{r=await fetchImpl(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:method==='POST'?'{}':undefined,redirect:'manual',signal:AbortSignal.timeout(Math.min(60000,remaining()))});}
      catch(e){if(e.code?.startsWith('FABRIC_'))throw e;throw fail('FABRIC_NETWORK','Fabric request failed or timed out. Check connectivity and retry.');}
      if(r.status===429||r.status===503){if(r.body)await r.body.cancel();await delay(r.headers.get('retry-after'));continue;}
      if(r.status===401)throw fail('FABRIC_AUTH','Fabric rejected the token. Sign in again for the intended tenant.');
      if(r.status===403)throw fail('FABRIC_PERMISSION','Fabric denied definition access. getDefinition requires model read/write permissions; Read + Build alone is insufficient. Encrypted sensitivity labels can also block this API.');
      if(![200,202].includes(r.status))throw fail('FABRIC_HTTP','Fabric request failed (HTTP '+r.status+'). No model was written.',{status:r.status});
      let bytes=0,chunks=[];if(r.body)for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>96*1024*1024)throw fail('FABRIC_TOO_LARGE','Definition response exceeds 96 MB');chunks.push(Buffer.from(chunk));}const text=Buffer.concat(chunks).toString('utf8');
      let data={};if(text.trim()){try{data=JSON.parse(text);}catch{throw fail('FABRIC_RESPONSE','Fabric returned invalid JSON');}}
      return {status:r.status,headers:r.headers,data};
    }
    throw fail('FABRIC_THROTTLED','Fabric remained busy after bounded retries; try later');
  }
  async function list(url){const rows=[],seen=new Set();for(let i=0;url&&i<1000;i++){
    url=safeUrl(url);if(seen.has(url))throw fail('FABRIC_RESPONSE','Fabric repeated a pagination URL');seen.add(url);
    const {data,status}=await request(url);if(status!==200||!Array.isArray(data.value))throw fail('FABRIC_RESPONSE','Fabric returned an invalid item list');rows.push(...data.value);
    if(data.continuationUri)url=safeUrl(data.continuationUri);else if(data.continuationToken){const next=new URL(url);next.searchParams.set('continuationToken',data.continuationToken);url=next.href;}else url=null;
  }if(url)throw fail('FABRIC_RESPONSE','Too many result pages');return rows;}
  async function definition(workspace,model){const initial=await request(`${BASE}/workspaces/${workspace}/semanticModels/${model}/getDefinition?format=TMDL`,'POST');if(initial.status===200)return initial.data;
    const operation=initial.headers.get('location')||`${BASE}/operations/${initial.headers.get('x-ms-operation-id')}`;
    const operationUrl=safeUrl(operation);if(!/^\/v1\/operations\/[0-9a-f-]+$/i.test(new URL(operationUrl).pathname))throw fail('FABRIC_RESPONSE','Invalid long-running operation URL');
    await delay(initial.headers.get('retry-after'));
    for(let i=0;i<300;i++){
      const poll=await request(operationUrl);if(poll.data.status==='Succeeded'){const result=await request(operationUrl+'/result');if(result.status!==200)throw fail('FABRIC_RESPONSE','Fabric definition result is not ready');return result.data;}
      if(['Failed','Cancelled','Canceled'].includes(poll.data.status))throw fail('FABRIC_OPERATION','Fabric could not retrieve this definition. Check model access and API support.');
      if(!['NotStarted','Running','Undefined'].includes(poll.data.status))throw fail('FABRIC_RESPONSE','Unexpected Fabric operation status');await delay(poll.headers.get('retry-after'));
    }throw fail('FABRIC_TIMEOUT','Definition operation did not finish within the polling limit');
  }
  return {list,definition};
}
function resolve(rows,requested,kind){const matches=rows.filter(r=>String(r.displayName||'').toLowerCase()===requested.toLowerCase());if(matches.length!==1)throw fail(matches.length?'FABRIC_AMBIGUOUS':'FABRIC_NOT_FOUND',matches.length?`Several ${kind}s have this name; specify its UUID`:`No accessible ${kind} matched the exact name`,{matches:matches.map(r=>({id:r.id,name:r.displayName}))});return matches[0];}
function validateParts(data){const parts=data?.definition?.parts;if(!Array.isArray(parts)||!parts.length||parts.length>10000)throw fail('FABRIC_DEFINITION','Definition must contain 1–10000 inline parts');const seen=new Set();let total=0;
  const result=parts.map(p=>{
    if(typeof p.path!=='string'||p.path.length>1024||/[\\:\x00-\x1f]/.test(p.path)||p.path.startsWith('/')||p.path.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s))||p.path.toLowerCase()===provenance.MARKER||p.path.split('/').some(s=>['.git','node_modules'].includes(s.toLowerCase())))throw fail('FABRIC_PATH','Unsafe definition part path');
    const key=p.path.toLowerCase();if(seen.has(key))throw fail('FABRIC_PATH','Duplicate definition part path');seen.add(key);
    if(p.payloadType!=='InlineBase64'||typeof p.payload!=='string'||p.payload.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.payload))throw fail('FABRIC_DEFINITION','Definition contains unsupported or invalid inline payload');
    const bytes=Buffer.from(p.payload,'base64');total+=bytes.length;if(total>64*1024*1024)throw fail('FABRIC_TOO_LARGE','Decoded definition exceeds 64 MB');return {path:p.path,bytes};
  });if(!seen.has('definition/model.tmdl'))throw fail('FABRIC_DEFINITION','Fabric did not return a TMDL model definition');return result;
}
async function fetchModel(options={},deps={}){
  if(!options.workspace||!options.model)throw fail('INVALID_INPUT','fetch requires --workspace <name|UUID> and --model <name|UUID>');
  const token=await (deps.token||auth.token)(options),client=deps.client||createClient(token,deps);
  const ws=auth.UUID.test(options.workspace)?{id:options.workspace}:resolve(await client.list(BASE+'/workspaces'),options.workspace,'workspace');
  if(!auth.UUID.test(ws.id))throw fail('FABRIC_RESPONSE','Invalid workspace identifier');
  const model=auth.UUID.test(options.model)?{id:options.model}:resolve(await client.list(`${BASE}/workspaces/${ws.id}/items?type=SemanticModel`),options.model,'semantic model');
  if(!auth.UUID.test(model.id))throw fail('FABRIC_RESPONSE','Invalid model identifier');
  let cacheName=String(model.displayName||model.id).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,120)||model.id;
  if(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(cacheName))cacheName='Model-'+cacheName;
  const target=path.resolve(options.out||path.join(process.env.SMV_CACHE_DIR||path.join(os.homedir(),'.cache','semantic-model-viewer'),'fabric',ws.id,model.id,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID(),cacheName+'.SemanticModel'));
  if(fs.existsSync(target))throw fail('OUTPUT_EXISTS','Fetch writes a new directory; choose another --out to preserve the existing model');
  fs.mkdirSync(path.dirname(target),{recursive:true});const lock=target+'.smv-fetch.lock';let stage,owned=false;
  try{
    fs.writeFileSync(lock,'',{flag:'wx',mode:0o600});owned=true;
    const parts=validateParts(await client.definition(ws.id,model.id));stage=fs.mkdtempSync(path.join(path.dirname(target),'.smv-fetch-'));
    for(const part of parts){const file=path.join(stage,...part.path.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,part.bytes,{flag:'wx',mode:0o600});}
    const {runtime,readModel}=require('./model.cjs');readModel(runtime(),stage);
    const record={schemaVersion:1,kind:'fabric-definition',workspace:{id:ws.id,name:ws.displayName||null},model:{id:model.id,name:model.displayName||null},fetchedAt:new Date().toISOString(),contentHash:provenance.contentHash(stage),parts:parts.length};
    fs.writeFileSync(path.join(stage,provenance.MARKER),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
    if(fs.existsSync(target))throw fail('OUTPUT_EXISTS','Output appeared while downloading; it was preserved');fs.renameSync(stage,target);stage=null;
    return {path:target,...record,contents:'Local TMDL metadata copy, not model data or a live connection. Subsequent viewing does not contact Fabric.',authentication:options.tokenStdin?'stdin':'existing Azure CLI login'};
  }finally{if(stage)fs.rmSync(stage,{recursive:true,force:true});if(owned)fs.unlinkSync(lock);}
}
module.exports={fetchModel,createClient,validateParts,safeUrl,BASE};
