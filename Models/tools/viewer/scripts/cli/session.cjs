'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),os=require('node:os');
const {spawn}=require('node:child_process');
const {prepare,readJSON,escape}=require('./explain.cjs');
function fingerprint(source,view,report){
  const hash=crypto.createHash('sha256');
  function walk(p){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())return;if(stat.isDirectory()){for(const e of fs.readdirSync(p).sort())if(!['.git','node_modules'].includes(e))walk(path.join(p,e));}else if(/\.(tmdl|bim|json)$/i.test(p))hash.update(p).update(fs.readFileSync(p));}
  walk(source);if(view)walk(view);if(report)walk(report);return hash.digest('hex');
}
async function request(file,action){
  const state=readJSON(file);if(state.version!==1||typeof state.url!=='string')throw new Error('Invalid session file');
  const url=new URL(state.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('Session URL must be local');
  url.pathname='/'+action;
  const r=await fetch(url,{method:action==='stop'?'POST':'GET',signal:AbortSignal.timeout(3000)});
  if(!r.ok)throw new Error('Session request failed: '+r.status);return r.json();
}
async function serve(source,options={}){
  source=fs.realpathSync(source);const view=options.view?path.resolve(options.view):null,report=options.report?path.resolve(options.report):null;
  const file=options.session?path.resolve(options.session):null;
  if(file&&fs.existsSync(file)){
    let old;try{old=await request(file,'status');}catch(e){throw new Error('Existing session is unreachable; inspect or remove its stale session file before restarting: '+file);}
    if(old.source!==source||old.view!==view||old.report!==report||old.watch!==!!options.watch)throw new Error('Session belongs to different inputs or watch settings');if(!options.watch&&old.inputFingerprint!==fingerprint(source,view,report))throw new Error('Session source changed; stop and restart it, or use --watch');return {reused:true,...old};
  }
  if(options.background){
    if(!file)throw new Error('--background requires --session <state.json>');
    // Validate before spawning; a failed configuration must not create an orphan daemon.
    prepare(source,view?readJSON(view):{version:1},{report});
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const log=fs.openSync(file+'.log','a',0o600);
    const child=spawn(process.execPath,[__filename,source,JSON.stringify({...options,background:false,view,report,session:file})],{detached:true,stdio:['ignore',log,log]});fs.closeSync(log);
    let error;child.once('error',e=>{error=e;});child.unref();
    const end=Date.now()+15000;while(!fs.existsSync(file)){if(error)throw error;if(child.exitCode!==null)throw new Error('Session failed; see '+file+'.log');if(Date.now()>end){child.kill();throw new Error('Session startup timed out; see '+file+'.log');}await new Promise(r=>setTimeout(r,50));}
    return request(file,'status');
  }
  const token=crypto.randomBytes(24).toString('hex');let html='',revision='',error=null,lastAttempt='';let interval;
  function rebuild(){try{const next=fingerprint(source,view,report);if(next===lastAttempt)return;const p=prepare(source,view?readJSON(view):{version:1},{report});html=p.html;revision=p.hash;lastAttempt=next;error=null;}catch(e){lastAttempt='';error=e.message;}}
  rebuild();if(error)throw new Error(error);
  const state={version:1,source,view,report,watch:!!options.watch,pid:process.pid,startedAt:new Date().toISOString()};
  const status=()=>({...state,revision,inputFingerprint:lastAttempt,error});
  let closing=false;
  const server=http.createServer((req,res)=>{
    let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end('Malformed URL');return;}
    if(req.headers.host!=='127.0.0.1:'+server.address().port||url.searchParams.get('token')!==token){res.writeHead(403);res.end('Forbidden');return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/status'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(status()));return;}
    if(url.pathname==='/stop'&&req.method==='POST'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({stopped:true}));setImmediate(close);return;}
    if(url.pathname==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=error?409:200;res.end(error?'<!doctype html><title>Explanation needs attention</title><h1>Source changed</h1><p>'+escape(error)+'</p><p>Update the view specification and reload.</p>':html);return;}
    res.writeHead(404);res.end('Not found');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',resolve);});
  state.url='http://127.0.0.1:'+server.address().port+'/?token='+token;
  if(file){try{fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){server.close();throw e;}}
  if(options.watch)interval=setInterval(rebuild,1000);
  function close(){if(closing)return;closing=true;clearInterval(interval);server.close();server.closeAllConnections();if(file&&fs.existsSync(file)){try{if(readJSON(file).url===state.url)fs.unlinkSync(file);}catch{}}process.removeListener('SIGTERM',close);process.removeListener('SIGINT',close);}
  process.on('SIGTERM',close);process.on('SIGINT',close);
  return {...status(),close};
}
function open(url){
  const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32.exe':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Browser launcher exited '+code)));});
}
if(require.main===module)serve(process.argv[2],JSON.parse(process.argv[3])).then(s=>process.stdout.write(s.url+'\n')).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={serve,request,open,fingerprint};
