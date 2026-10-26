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
async function request(file,action,payload,viewId,timeoutMs=10000){
  const state=readJSON(file);if(state.version!==1||typeof state.url!=='string')throw new Error('Invalid session file');
  const url=new URL(state.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Session URL must be local');
  url.pathname='/'+action;if(viewId)url.searchParams.set('view',viewId);
  const post=payload!==undefined||action==='stop';
  let r;try{r=await fetch(url,{method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:undefined,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});}
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
const managed=require('./managed.cjs');
async function serve(source,options={}){
  source=managed.canonical(source);
  if(options._spawned)return start(source,options);
  if(options.session&&fs.existsSync(path.resolve(options.session))){
    if(options.newSession)throw new Error('--new-session requires a new state-file path, or omit --session');
    const old=await request(options.session,'status');
    if(old.source!==source||(!options.reuseNamed&&old.view!==(options.view?path.resolve(options.view):null))||old.report!==(options.report?path.resolve(options.report):null)||old.watch!==!!options.watch)throw new Error('Session belongs to different inputs or watch settings');
    if(!options.watch&&old.inputFingerprint!==fingerprint(source,old.view,old.report))throw new Error('Session source changed; stop and restart it, or use --watch');
    return reused(old);
  }
  const launch=async()=>{
    if(!options.session&&!options.newSession){const existing=await managed.find(source,{...options,forNamedViews:options.reuseNamed});if(existing)return reused(existing);}
    const sessionId=crypto.randomUUID(),file=options.session?path.resolve(options.session):path.join(managed.directory(),sessionId+'.session.json');
    const settings={...options,session:file,sessionId};
    if(!options.background)return start(source,settings);
    prepare(source,liveView(options.view?readJSON(options.view):{version:2}),{report:options.report});
    fs.mkdirSync(path.dirname(file),{recursive:true});const log=fs.openSync(file+'.log','a',0o600);
    const child=spawn(process.execPath,[__filename,source,JSON.stringify({...settings,background:false,_spawned:true})],{detached:true,stdio:['ignore',log,log]});fs.closeSync(log);
    let error;child.once('error',e=>error=e);child.unref();
    const end=Date.now()+15000;while(!fs.existsSync(file)){if(error)throw error;if(child.exitCode!==null)throw new Error('Session failed; see '+file+'.log');if(Date.now()>end){child.kill();throw new Error('Session startup timed out; see '+file+'.log');}await new Promise(r=>setTimeout(r,50));}
    const state=await request(file,'status');managed.register(state);return state;
  };
  return options.session?launch():managed.lock(source,launch);
}
function reused(old){const {record,...state}=old;return {reused:true,...state,warnings:old.pluginVersion===managed.version()?[]:['This session runs plugin '+(old.pluginVersion||'unknown/legacy')+'; the installed plugin is '+managed.version()+'. Use --new-session to start the new runtime.']};}
async function start(source,options){
  const file=path.resolve(options.session),view=options.view?path.resolve(options.view):null,report=options.report?path.resolve(options.report):null;
  const entries=new Map(),clients=new Map();let interval,closing=false,lastAttempt='';
  function entry(id,label,input){const prepared=prepare(source,liveView(input),{report});return {id,label,input:liveView(input),prepared,revision:1,applyRevision:0,error:null};}
  entries.set('default',entry('default','Model',view?readJSON(view):{version:2}));
  function rebuild(){const next=fingerprint(source,view,report);if(next===lastAttempt)return;
    for(const e of entries.values()){try{const p=prepare(source,liveView(e.id==='default'&&view?readJSON(view):e.input),{report});if(lastAttempt)e.revision++;e.prepared=p;if(e.id==='default'&&view)e.input=liveView(readJSON(view));e.error=null;e.applyRevision=0;}catch(err){e.error=err.message;}}
    lastAttempt=next;
  }
  rebuild();
  const state={version:1,protocolVersion:2,managedBy:managed.OWNER,sessionId:options.sessionId||crypto.randomUUID(),sessionFile:file,pluginVersion:managed.version(),source,view,report,watch:!!options.watch,pid:process.pid,startedAt:new Date().toISOString()};
  const viewUrl=id=>{const u=new URL(state.url);if(id!=='default')u.searchParams.set('view',id);return u.href;};
  const workspaceUrl=()=>{const u=new URL(state.url);u.pathname='/workspace';return u.href;};
  function histories(e){return [...clients.values()].filter(c=>c.viewId===e.id);}
  function alive(e){return histories(e).filter(c=>Date.now()-c.receivedAt<5000);}
  function application(e){const history=histories(e),fresh=alive(e),waiting=fresh.filter(c=>c.revision!==e.revision||c.sourceRevision!==e.prepared.hash),latest=history.slice().sort((a,b)=>b.receivedAt-a.receivedAt)[0];
    const evidence={browserAcknowledged:fresh.length>0&&!waiting.length&&!e.error,applyRequested:e.applyRevision===e.revision,lastAcknowledgedRevision:history.length?Math.max(...history.map(c=>c.revision)):null,lastSeenAt:latest?new Date(latest.receivedAt).toISOString():null};
    if(e.error)return {...evidence,state:'source-changed',message:e.error};
    if(!fresh.length)return {...evidence,state:latest?'unconfirmed':'awaiting-viewer',message:latest?'No fresh browser acknowledgement. Last known viewer revision: '+evidence.lastAcknowledgedRevision+'. Reopen or focus the browser to confirm.':'No browser has acknowledged this view. Open its URL, or export authored HTML for a server-free view.'};
    if(!waiting.length)return {...evidence,state:'applied',message:'All active viewers acknowledged the requested view.'};
    const click=e.applyRevision!==e.revision&&waiting.some(c=>c.pendingRevision===e.revision);
    return {...evidence,state:click?'waiting-for-apply':'awaiting-viewer',message:click?'Waiting for Apply click in the viewer. Use --apply only when explicitly taking over.':'Waiting for the viewer to receive and apply the requested view.'};
  }
  function clientRows(e){return histories(e).map(c=>({clientId:c.clientId,viewId:c.viewId,revision:c.revision,sourceRevision:c.sourceRevision,explored:c.explored,pendingRevision:c.pendingRevision,receivedAt:c.receivedAt,fresh:Date.now()-c.receivedAt<5000,appliedSummary:c.appliedSummary,renderedSummary:c.renderedSummary}));}
  function viewStatus(e){return {sourceIdentity:e.prepared.provenance,id:e.id,label:e.label,url:viewUrl(e.id),revision:e.revision,sourceRevision:e.prepared.hash,summary:e.prepared.summary,application:application(e),clients:clientRows(e),error:e.error};}
  function status(e=entries.get('default')){return {...state,sourceIdentity:e.prepared.provenance,url:viewUrl(e.id),viewId:e.id,workspaceUrl:workspaceUrl(),workspaceApplication:{views:entries.size-1,acknowledgedViews:[...entries.values()].filter(v=>v.id!=='default'&&application(v).browserAcknowledged).length,freshClients:[...clients.values()].filter(c=>Date.now()-c.receivedAt<5000).length},revision:e.revision,sourceRevision:e.prepared.hash,appliedView:e.prepared.view,authoredSummary:e.prepared.summary,application:application(e),inputFingerprint:lastAttempt,error:e.error,clients:clientRows(e),views:[...entries.values()].map(viewStatus),presentation:presentation({...state,revision:e.revision})};}
  async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2*1024*1024)throw fault('REQUEST_TOO_LARGE','Session payload exceeds 2MB');}try{return JSON.parse(text);}catch{throw fault('JSON_INVALID','Invalid session JSON');}}
  function stable(){if(fingerprint(source,view,report)!==lastAttempt)throw fault('SOURCE_CHANGED','Source changed; refresh or restart before updating');}
  function choose(e,payload={}){const fresh=alive(e),candidates=payload.clientId?fresh.filter(c=>c.clientId===payload.clientId):fresh;
    if(candidates.length!==1)throw fault(candidates.length?'CLIENT_AMBIGUOUS':'CLIENT_UNAVAILABLE',candidates.length?'Select one clientId; several viewer tabs are active':'No fresh viewer acknowledgement. Open the view and retry.');
    const c=candidates[0];if(c.sourceRevision!==e.prepared.hash||c.revision!==e.revision)throw fault('VIEW_NOT_APPLIED','Viewer has not applied the requested source/view revision',{clientRevision:c.revision,revision:e.revision});return c;}
  function update(e,input,apply){const candidate=prepare(source,liveView(input),{report});if(candidate.hash!==entries.get('default').prepared.hash)throw fault('SOURCE_CHANGED','Source changed during update');e.prepared=candidate;e.input=liveView(input);e.revision++;e.applyRevision=apply?e.revision:0;e.error=null;}
  const token=crypto.randomBytes(24).toString('hex');
  const server=http.createServer(async(req,res)=>{
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end('Malformed URL');return;}
      if(req.headers.host!=='127.0.0.1:'+server.address().port||url.searchParams.get('token')!==token){res.writeHead(403);res.end('Forbidden');return;}
      const origin=req.headers.origin;if(req.method==='POST'&&origin&&origin!==new URL(state.url).origin)throw fault('ORIGIN_FORBIDDEN','Cross-origin session mutation is forbidden');
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      const e=entries.get(url.searchParams.get('view')||'default');if(!e)throw fault('VIEW_NOT_FOUND','Unknown named view');
      if(url.pathname==='/status'&&req.method==='GET'){json(200,status(e));return;}
      if(url.pathname==='/stop'&&req.method==='POST'){json(200,{stopped:true,sessionId:state.sessionId});setImmediate(close);return;}
      if(url.pathname==='/view'&&req.method==='GET'){json(200,{revision:e.revision,sourceRevision:e.prepared.hash,view:e.prepared.view,summary:e.prepared.summary,apply:e.applyRevision===e.revision,error:e.error});return;}
      if(url.pathname==='/views'&&req.method==='GET'){json(200,{sessionFile:file,workspaceUrl:workspaceUrl(),views:[...entries.values()].map(viewStatus)});return;}
      if(url.pathname==='/views'&&req.method==='POST'){
        stable();const payload=await body(req);if(!Array.isArray(payload.views)||!payload.views.length||payload.views.length>32)throw fault('VIEWS_INVALID','Provide 1 to 32 named views');
        const ids=new Set(),candidates=payload.views.map(v=>{if(!v||typeof v.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(v.id)||v.id==='default'||ids.has(v.id)||typeof v.label!=='string'||v.label.length>160)throw fault('VIEWS_INVALID','Each view needs a unique simple id and label up to 160 characters');ids.add(v.id);return entry(v.id,v.label,v.view);});
        if(new Set([...entries.keys(),...ids]).size>33)throw fault('VIEWS_INVALID','Session has 32 named views; start --new-session for additional views');
        for(const candidate of candidates)if(candidate.prepared.hash!==entries.get('default').prepared.hash)throw fault('SOURCE_CHANGED','Source changed while preparing named views');
        stable();
        for(const candidate of candidates){const old=entries.get(candidate.id);if(old){candidate.revision=old.revision;candidate.applyRevision=old.applyRevision;if(JSON.stringify(old.input)!==JSON.stringify(candidate.input)){candidate.revision++;candidate.applyRevision=payload.apply===true?candidate.revision:0;}}entries.set(candidate.id,candidate);}
        const selected=candidates.map(c=>entries.get(c.id));const u=new URL(workspaceUrl());u.searchParams.set('views',selected.map(c=>c.id).join(','));
        json(200,{sessionFile:file,sessionId:state.sessionId,workspaceUrl:u.href,views:selected.map(viewStatus)});return;
      }
      if(url.pathname==='/update'&&req.method==='POST'){
        const payload=await body(req);if(payload.apply!==undefined&&typeof payload.apply!=='boolean')throw fault('UPDATE_INVALID','apply must be boolean');if(payload.expectedRevision!==e.revision)throw fault('REVISION_CONFLICT','Session revision changed',{expected:payload.expectedRevision,actual:e.revision});
        stable();if(e.error)throw fault('SOURCE_CHANGED',e.error);update(e,payload.view,payload.apply);json(200,{state:'awaiting-viewer',application:application(e),requestRevision:payload.expectedRevision,revision:e.revision,viewId:e.id,sourceRevision:e.prepared.hash,view:e.prepared.view,summary:e.prepared.summary,clients:clientRows(e)});return;
      }
      if(url.pathname==='/client'&&req.method==='POST'){
        const payload=await body(req);if(typeof payload.clientId!=='string'||payload.clientId.length>100)throw fault('CLIENT_INVALID','Client ID required');if(payload.sourceRevision!==e.prepared.hash)throw fault('SOURCE_CHANGED','Client source is stale');
        const {validate,resolve}=require('../../js/explanation-view.js'),current=validate(e.prepared.model,payload.currentView);if(payload.selection)resolve(e.prepared.model,payload.selection);
        if(!Number.isInteger(payload.revision)||payload.revision<1||payload.revision>e.revision)throw fault('CLIENT_INVALID','Invalid client revision');
        const rendered=payload.renderedSummary;if(rendered&&(!['graph','measures','clusters','matrix','power-query'].includes(rendered.workspace)||Object.entries(rendered).some(([k,v])=>k!=='workspace'&&(!['tableCanvasTables','measureGraphNodes'].includes(k)||!Number.isInteger(v)||v<0||v>100000))))throw fault('CLIENT_INVALID','Invalid rendered summary');
        clients.set(e.id+':'+payload.clientId,{...payload,renderedSummary:rendered||null,viewId:e.id,receivedAt:Date.now(),appliedSummary:require('./query.cjs').summary(e.prepared.model,e.prepared.analysis,current)});if(clients.size>128)clients.delete(clients.keys().next().value);json(200,{acknowledged:payload.revision});return;
      }
      if(url.pathname==='/selection'&&req.method==='POST'){const c=choose(e,await body(req));json(200,{clientId:c.clientId,selection:c.selection,selectedAt:c.selectedAt,workspace:c.workspace,authoredFocus:e.prepared.view.focus||null,revision:e.revision,sourceRevision:e.prepared.hash,explored:c.explored,viewId:e.id});return;}
      if(url.pathname==='/snapshot'&&req.method==='POST'){
        const payload=await body(req);if(!['authored','current'].includes(payload.basis))throw fault('BASIS_REQUIRED','Choose authored or current state');if(payload.expectedRevision!==e.revision)throw fault('REVISION_CONFLICT','Session revision changed');stable();if(e.error)throw fault('SOURCE_CHANGED',e.error);
        const c=payload.basis==='current'?choose(e,payload):null;if(c&&!['graph','measures'].includes(c.currentView.mode))throw fault('WORKSPACE_UNSUPPORTED','Current-state export supports Tables and Measures');json(200,{source,report,basis:payload.basis,revision:e.revision,sourceRevision:e.prepared.hash,view:c?c.currentView:e.prepared.view,viewId:e.id,clientId:c?.clientId||null});return;
      }
      if(url.pathname==='/workspace'&&req.method==='GET'){
        const ids=(url.searchParams.get('views')||'').split(',').filter(Boolean),selected=ids.length?ids.map(id=>entries.get(id)).filter(Boolean):[...entries.values()].filter(v=>v.id!=='default');if(!selected.length)selected.push(entries.get('default'));
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');res.end(require('./workspace.cjs').page(selected.map(viewStatus),state.url,source));return;
      }
      if(url.pathname==='/'&&req.method==='GET'){
        res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=e.error?409:200;
        const config='window.SMV_WORKSPACE_EMBEDDED='+JSON.stringify(url.searchParams.get('embedded')==='1')+';window.SMV_SESSION_URL='+JSON.stringify(viewUrl(e.id))+';window.SMV_SESSION_REVISION='+e.revision+';';
        res.end(e.error?'<!doctype html><title>Source changed</title><h1>Source changed</h1><p>'+escape(e.error)+'</p>':e.prepared.html.replace("connect-src 'none'","connect-src 'self'").replace('SMVExplanation.start(',config+'SMVExplanation.start('));return;
      }
      json(404,{error:{code:'NOT_FOUND',message:'Not found'}});
    }catch(err){json(err.code==='REVISION_CONFLICT'?409:400,{error:{code:err.code||'SESSION_INVALID',message:err.message,details:err.details||{}}});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',resolve);});state.url='http://127.0.0.1:'+server.address().port+'/?token='+token;
  try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});managed.register(state);}catch(err){server.close();throw err;}
  if(options.watch)interval=setInterval(rebuild,1000);
  function close(){if(closing)return;closing=true;clearInterval(interval);server.close();server.closeAllConnections();try{if(readJSON(file).sessionId===state.sessionId)fs.unlinkSync(file);}catch{}managed.forget(state.sessionId);process.removeListener('SIGTERM',close);process.removeListener('SIGINT',close);}
  process.on('SIGTERM',close);process.on('SIGINT',close);return {...status(),close};
}
async function waitForApply(file,revision,{seconds,clientId,viewId}={}){
  if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw new Error('Wait must be 0 to 60 seconds');const end=Date.now()+seconds*1000;
  while(true){const status=await request(file,'status',undefined,viewId);if(status.revision!==revision)throw fault('REVISION_CONFLICT','Requested view changed while waiting for acknowledgement',{expected:revision,actual:status.revision});const viewers=status.clients.filter(c=>c.fresh&&(!clientId||c.clientId===clientId));const confirmed=!status.error&&viewers.length>0&&viewers.every(c=>c.revision===revision&&c.sourceRevision===status.sourceRevision);
    if(confirmed||Date.now()>=end)return {state:confirmed?'applied':status.application.state,confirmed,timedOut:!confirmed,clientId:clientId||null,viewId:status.viewId,revision,application:status.application,clients:status.clients};await new Promise(r=>setTimeout(r,Math.min(200,Math.max(0,end-Date.now()))));}
}
async function open(url,options={}){return require('./opener.cjs').open(url,options,'system');}
async function exportSession(file,options){
  const info=await request(file,'snapshot',{basis:options.basis,expectedRevision:options.revision,clientId:options.clientId},options.viewId);
  const p=prepare(info.source,info.view,{report:info.report});if(p.hash!==info.sourceRevision)throw fault('SOURCE_CHANGED','Source changed before export');
  const output=path.resolve(options.out);fs.mkdirSync(path.dirname(output),{recursive:true});
  require('./provenance.cjs').reserveOutput(output,options.force);
  if(!['.png','.html'].includes(path.extname(output)))throw fault('OUTPUT_INVALID','Session export requires .html or .png');
  const temp=fs.mkdtempSync(path.join(path.dirname(output),'.smv-export-')),artifact=path.join(temp,path.basename(output));let evidence;
  try{
    if(path.extname(output)==='.png')await require('./capture.cjs').capture(p.html,artifact,p.view,options);
    else fs.writeFileSync(artifact,p.html,{flag:'wx'});
    // Revalidate the actual source fingerprint even when source watching is off.
    await request(file,'snapshot',{basis:'authored',expectedRevision:info.revision},options.viewId);
    if(fs.existsSync(output)&&!options.force)throw fault('OUTPUT_EXISTS','Output exists');
    evidence=await require('./provenance.cjs').publish(info.source,p,output,options,async candidate=>fs.copyFileSync(artifact,candidate));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  return {...info,path:output,containsFullMetadata:true,...evidence,opening:await require('./opener.cjs').open(output,options)};
}
if(require.main===module)serve(process.argv[2],JSON.parse(process.argv[3])).then(s=>process.stdout.write(s.url+'\n')).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={serve,request,open,fingerprint,exportSession,presentation,waitForApply};
