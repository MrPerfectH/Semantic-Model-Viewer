'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {prepare,readJSON,escape}=require('./explain.cjs');
function fault(code,message,details={}){return Object.assign(new Error(message),{code,details});}
function fingerprint(source,view,report){
  const hash=crypto.createHash('sha256');
  function walk(p){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const e of fs.readdirSync(p).sort())if(!['.git','node_modules'].includes(e))walk(path.join(p,e));}else if(/\.(tmdl|bim|json)$/i.test(p))hash.update(p).update(fs.readFileSync(p));}
  walk(source);if(view)walk(view);if(report)walk(report);return hash.digest('hex');
}
async function request(file,action,payload){
  const state=readJSON(file);if(state.version!==1||typeof state.url!=='string')throw new Error('Invalid session file');
  const url=new URL(state.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Session URL must be local');
  url.pathname='/'+action;
  const post=payload!==undefined||action==='stop';
  let r;try{r=await fetch(url,{method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:undefined,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});}
  catch(e){throw fault('SESSION_UNREACHABLE','Cannot reach the local viewer server. Reopen it with serve/open, or use snapshot for a server-free HTML file.',{session:path.resolve(file),cause:e.cause?.code||e.name});}
  const result=await r.json();if(!r.ok)throw fault(result.error?.code||'SESSION_FAILED',result.error?.message||'Session request failed: '+r.status,result.error?.details);return result;
}
function presentation(state,capabilities={}){
  const accessible=capabilities.localBrowser===true;
  return {preferred:accessible?'browser':'artifact',live:{url:state.url,accessibleFrom:'same machine as CLI',revision:state.revision},fallback:{kind:'interactive-html-or-png',reason:accessible?null:'The CLI has not tested host browser reachability. Use a reachable browser URL or export an offline view.'},inline:{available:false,reason:'The CLI provides browser URLs and files. Displaying them in chat depends on the host.'}};
}
function liveView(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.banner!==undefined)return input;
  return {...input,banner:['highlights','callouts','proposals'].some(key=>Array.isArray(input[key])&&input[key].length>0)};
}
async function serve(source,options={}){
  source=fs.realpathSync(source);const view=options.view?path.resolve(options.view):null,report=options.report?path.resolve(options.report):null;
  const file=options.session?path.resolve(options.session):null;
  if(file&&fs.existsSync(file)){
    let old;try{old=await request(file,'status');}catch(e){throw new Error('Existing session is unreachable; inspect or remove its stale session file before restarting: '+file);}
    if(old.source!==source||old.view!==view||old.report!==report||old.watch!==!!options.watch)throw new Error('Session belongs to different inputs or watch settings');
    if(!options.watch&&old.inputFingerprint!==fingerprint(source,view,report))throw new Error('Session source changed; stop and restart it, or use --watch');return {reused:true,...old};
  }
  if(options.background){
    if(!file)throw new Error('--background requires --session <state.json>');
    prepare(source,liveView(view?readJSON(view):{version:2}),{report});
    fs.mkdirSync(path.dirname(file),{recursive:true});const log=fs.openSync(file+'.log','a',0o600);
    const child=spawn(process.execPath,[__filename,source,JSON.stringify({...options,background:false,view,report,session:file})],{detached:true,stdio:['ignore',log,log]});fs.closeSync(log);
    let error;child.once('error',e=>{error=e;});child.unref();
    const end=Date.now()+15000;while(!fs.existsSync(file)){if(error)throw error;if(child.exitCode!==null)throw new Error('Session failed; see '+file+'.log');if(Date.now()>end){child.kill();throw new Error('Session startup timed out; see '+file+'.log');}await new Promise(r=>setTimeout(r,50));}
    return request(file,'status');
  }
  const token=crypto.randomBytes(24).toString('hex');let prepared,revision=1,applyRevision=0,error=null,lastAttempt='',interval,closing=false;
  let input=view?readJSON(view):{version:2,banner:false};const clients=new Map();
  function rebuild(){try{const next=fingerprint(source,view,report);if(next===lastAttempt)return;const candidate=prepare(source,liveView(view?readJSON(view):input),{report});if(prepared)revision++;applyRevision=0;prepared=candidate;input=candidate.view;lastAttempt=next;error=null;}catch(e){lastAttempt='';error=e.message;}}
  rebuild();if(error)throw new Error(error);
  const state={version:1,source,view,report,watch:!!options.watch,pid:process.pid,startedAt:new Date().toISOString()};
  function clientState(){return Array.from(clients.values()).filter(c=>Date.now()-c.receivedAt<5000);}
  function application(){
    const alive=clientState(), waiting=alive.filter(c=>c.revision!==revision);
    const history=Array.from(clients.values()), latest=history.slice().sort((a,b)=>b.receivedAt-a.receivedAt)[0];
    const evidence={browserAcknowledged:alive.length>0&&!waiting.length,applyRequested:applyRevision===revision,
      lastAcknowledgedRevision:history.length?Math.max(...history.map(c=>c.revision)):null,
      lastSeenAt:latest?new Date(latest.receivedAt).toISOString():null};
    if(!alive.length)return {...evidence,state:latest?'unconfirmed':'awaiting-viewer',message:latest?
      'No fresh browser acknowledgement. Last known viewer revision: '+evidence.lastAcknowledgedRevision+'. Reopen or focus the browser to confirm the current view.':
      'No browser has acknowledged this view. Open the URL in any reachable browser, or export authored HTML for a server-free view.'};
    if(!waiting.length)return {...evidence,state:'applied',message:'All active viewers acknowledged the requested view.'};
    const click=applyRevision!==revision&&waiting.some(c=>c.pendingRevision===revision);
    return {...evidence,state:click?'waiting-for-apply':'awaiting-viewer',message:click?'Waiting for Apply click in the viewer. Use session update --apply only when explicitly taking over the view.':'Waiting for the viewer to receive and apply the requested view.'};
  }
  const status=()=>({...state,revision,application:application(),sourceRevision:prepared.hash,appliedView:prepared.view,inputFingerprint:lastAttempt,error,
    clients:Array.from(clients.values()).map(c=>({clientId:c.clientId,revision:c.revision,sourceRevision:c.sourceRevision,explored:c.explored,pendingRevision:c.pendingRevision,receivedAt:c.receivedAt,fresh:Date.now()-c.receivedAt<5000})),presentation:presentation({...state,revision})});
  async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2*1024*1024)throw fault('REQUEST_TOO_LARGE','Session payload exceeds 2MB');}try{return JSON.parse(text);}catch{throw fault('JSON_INVALID','Invalid session JSON');}}
  function choose(payload={}){
    const alive=clientState();const candidates=payload.clientId?alive.filter(c=>c.clientId===payload.clientId):alive;
    if(candidates.length!==1)throw fault(candidates.length?'CLIENT_AMBIGUOUS':'CLIENT_UNAVAILABLE',candidates.length?'Select one clientId; several viewer tabs are active':'No fresh viewer acknowledgement. Open the session and retry.');
    const c=candidates[0];if(c.sourceRevision!==prepared.hash||c.revision!==revision)throw fault('VIEW_NOT_APPLIED','Viewer has not applied the requested source/view revision',{clientRevision:c.revision,revision});return c;
  }
  const server=http.createServer(async(req,res)=>{
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end('Malformed URL');return;}
      if(req.headers.host!=='127.0.0.1:'+server.address().port||url.searchParams.get('token')!==token){res.writeHead(403);res.end('Forbidden');return;}
      const origin=req.headers.origin;if(req.method==='POST'&&origin&&origin!==new URL(state.url).origin)throw fault('ORIGIN_FORBIDDEN','Cross-origin session mutation is forbidden');
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      if(url.pathname==='/status'&&req.method==='GET'){json(200,status());return;}
      if(url.pathname==='/stop'&&req.method==='POST'){json(200,{stopped:true});setImmediate(close);return;}
      if(url.pathname==='/view'&&req.method==='GET'){json(200,{revision,sourceRevision:prepared.hash,view:prepared.view,apply:applyRevision===revision,error});return;}
      if(url.pathname==='/update'&&req.method==='POST'){
        const payload=await body(req);if(payload.apply!==undefined&&typeof payload.apply!=='boolean')throw fault('UPDATE_INVALID','apply must be boolean');if(payload.expectedRevision!==revision)throw fault('REVISION_CONFLICT','Session revision changed',{expected:payload.expectedRevision,actual:revision});
        if(error||fingerprint(source,view,report)!==lastAttempt)throw fault('SOURCE_CHANGED','Source changed; refresh or restart before updating');
        const candidate=prepare(source,liveView(payload.view),{report});if(candidate.hash!==prepared.hash)throw fault('SOURCE_CHANGED','Source changed during update');
        prepared=candidate;input=candidate.view;revision++;applyRevision=payload.apply?revision:0;
        json(200,{state:'awaiting-viewer',application:application(),requestRevision:payload.expectedRevision,revision,sourceRevision:prepared.hash,view:prepared.view,clients:status().clients});return;
      }
      if(url.pathname==='/client'&&req.method==='POST'){
        const payload=await body(req);if(typeof payload.clientId!=='string'||payload.clientId.length>100)throw fault('CLIENT_INVALID','Client ID required');
        if(payload.sourceRevision!==prepared.hash)throw fault('SOURCE_CHANGED','Client source is stale');
        // Validate reported state before it can be exported or used as an object identity.
        const {validate,resolve}=require('../../js/explanation-view.js');validate(prepared.model,payload.currentView);if(payload.selection)resolve(prepared.model,payload.selection);
        if(!Number.isInteger(payload.revision)||payload.revision<1||payload.revision>revision)throw fault('CLIENT_INVALID','Invalid client revision');
        clients.set(payload.clientId,{...payload,receivedAt:Date.now()});if(clients.size>20)clients.delete(clients.keys().next().value);json(200,{acknowledged:payload.revision});return;
      }
      if(url.pathname==='/selection'&&req.method==='POST'){const c=choose(await body(req));json(200,{clientId:c.clientId,selection:c.selection,selectedAt:c.selectedAt,workspace:c.workspace,authoredFocus:prepared.view.focus||null,revision,sourceRevision:prepared.hash,explored:c.explored});return;}
      if(url.pathname==='/snapshot'&&req.method==='POST'){
        const payload=await body(req);if(payload.basis!=='authored'&&payload.basis!=='current')throw fault('BASIS_REQUIRED','Choose authored or current state');
        if(payload.expectedRevision!==revision)throw fault('REVISION_CONFLICT','Session revision changed');
        if(error||fingerprint(source,view,report)!==lastAttempt)throw fault('SOURCE_CHANGED','Source changed; refresh or restart');
        const c=payload.basis==='current'?choose(payload):null;if(c&&!['graph','measures'].includes(c.currentView.mode))throw fault('WORKSPACE_UNSUPPORTED','Current-state export supports Tables and Measures; use authored state for other workspaces');json(200,{source,report,basis:payload.basis,revision,sourceRevision:prepared.hash,view:c?c.currentView:prepared.view,clientId:c?.clientId||null});return;
      }
      if(url.pathname==='/'&&req.method==='GET'){
        res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=error?409:200;
        const config='window.SMV_SESSION_URL='+JSON.stringify(state.url)+';window.SMV_SESSION_REVISION='+revision+';';
        const html=prepared.html.replace("connect-src 'none'","connect-src 'self'").replace('SMVExplanation.start(',config+'SMVExplanation.start(');
        res.end(error?'<!doctype html><title>Explanation needs attention</title><h1>Source changed</h1><p>'+escape(error)+'</p><p>Update the view specification and reload.</p>':html);return;
      }
      json(404,{error:{code:'NOT_FOUND',message:'Not found'}});
    }catch(e){json(e.code==='REVISION_CONFLICT'?409:400,{error:{code:e.code||'SESSION_INVALID',message:e.message,details:e.details||{}}});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',resolve);});
  state.url='http://127.0.0.1:'+server.address().port+'/?token='+token;
  if(file){try{fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){server.close();throw e;}}
  if(options.watch)interval=setInterval(rebuild,1000);
  function close(){if(closing)return;closing=true;clearInterval(interval);server.close();server.closeAllConnections();if(file&&fs.existsSync(file)){try{if(readJSON(file).url===state.url)fs.unlinkSync(file);}catch{}}process.removeListener('SIGTERM',close);process.removeListener('SIGINT',close);}
  process.on('SIGTERM',close);process.on('SIGINT',close);return {...status(),close};
}
async function waitForApply(file,revision,{seconds,clientId}={}){
  if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw new Error('Wait must be 0 to 60 seconds');
  const end=Date.now()+seconds*1000;
  while(true){
    const status=await request(file,'status');
    if(status.revision!==revision)throw fault('REVISION_CONFLICT','Requested view changed while waiting for acknowledgement',{expected:revision,actual:status.revision});
    const viewers=clientId?status.clients.filter(c=>c.clientId===clientId&&c.fresh):status.clients.filter(c=>c.fresh);
    const confirmed=viewers.length>0&&viewers.every(c=>c.revision===revision&&c.sourceRevision===status.sourceRevision);
    if(confirmed||Date.now()>=end)return {state:confirmed?'applied':status.application.state,confirmed,timedOut:!confirmed,clientId:clientId||null,revision,application:status.application,clients:status.clients};
    await new Promise(done=>setTimeout(done,Math.min(200,Math.max(0,end-Date.now()))));
  }
}
function open(url){const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32.exe':'xdg-open';const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launcher exited '+code)));});}
async function exportSession(file,options){
  const info=await request(file,'snapshot',{basis:options.basis,expectedRevision:options.revision,clientId:options.clientId});
  const p=prepare(info.source,info.view,{report:info.report});if(p.hash!==info.sourceRevision)throw fault('SOURCE_CHANGED','Source changed before export');
  const output=path.resolve(options.out);fs.mkdirSync(path.dirname(output),{recursive:true});
  if(fs.existsSync(output)&&!options.force)throw fault('OUTPUT_EXISTS','Output exists');
  if(!['.png','.html'].includes(path.extname(output)))throw fault('OUTPUT_INVALID','Session export requires .html or .png');
  const temp=fs.mkdtempSync(path.join(path.dirname(output),'.smv-export-')),artifact=path.join(temp,path.basename(output));
  try{
    if(path.extname(output)==='.png')await require('./capture.cjs').capture(p.html,artifact,p.view,options);
    else fs.writeFileSync(artifact,p.html,{flag:'wx'});
    // Revalidate the actual source fingerprint even when source watching is off.
    await request(file,'snapshot',{basis:'authored',expectedRevision:info.revision});
    if(fs.existsSync(output)&&!options.force)throw fault('OUTPUT_EXISTS','Output exists');
    fs.renameSync(artifact,output);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  return {...info,path:output,containsFullMetadata:true};
}
if(require.main===module)serve(process.argv[2],JSON.parse(process.argv[3])).then(s=>process.stdout.write(s.url+'\n')).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={serve,request,open,fingerprint,exportSession,presentation,waitForApply};
