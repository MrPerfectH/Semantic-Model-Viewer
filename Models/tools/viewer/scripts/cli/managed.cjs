'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const OWNER='semantic-model-viewer';
function version(){const root=path.resolve(__dirname,'../../../../..');try{return JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8')).engineVersion;}catch{}try{return JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin/plugin.json'),'utf8')).version;}catch{return 'development';}}
function identity(){
  const root=path.resolve(__dirname,'../../../../..');let info;
  try{info=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));}catch{}
  let engineHash=info&&info.engineHash;
  if(!engineHash){
    const files=[];
    for(const directory of ['Models/tools/viewer','Models/tools/viewer/js','Models/tools/viewer/scripts/cli','packages/engine']){
      const base=path.join(root,directory);if(!fs.existsSync(base))continue;
      for(const entry of fs.readdirSync(base,{withFileTypes:true}))if(entry.isFile()&&(/\.(js|cjs|css)$/.test(entry.name)||entry.name==='index.html'))files.push(directory+'/'+entry.name);
    }
    if(fs.existsSync(path.join(root,'Models/tools/viewer/scripts/scan_report_usage.py')))files.push('Models/tools/viewer/scripts/scan_report_usage.py');
    const entries=Object.fromEntries(files.sort().map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
    engineHash=crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  }
  return {engineVersion:module.exports.version(),engineHash,nodeVersion:process.versions.node,protocolVersion:2,packageId:info?info.sha256:null};
}
function compatible(state,current=identity()){return state.pluginVersion===current.engineVersion&&!!state.runtimeIdentity&&state.runtimeIdentity.engineHash===current.engineHash&&state.runtimeIdentity.nodeVersion===current.nodeVersion;}
function directory(){const root=path.resolve(process.env.SMV_STATE_DIR||path.join(os.homedir(),'.local','state','semantic-model-viewer'));
  fs.mkdirSync(root,{recursive:true,mode:0o700});if(fs.lstatSync(root).isSymbolicLink())throw new Error('SMV state directory must not be a symlink');return root;}
function canonical(source){let file=fs.realpathSync(source);if(path.basename(file)==='definition'&&fs.existsSync(path.join(file,'model.tmdl')))file=path.dirname(file);return file;}
function register(state){const dir=directory(),record={managedBy:OWNER,sessionId:state.sessionId,file:state.sessionFile,source:state.source,pluginVersion:state.pluginVersion,url:state.url};
  const file=path.join(dir,state.sessionId+'.record.json');fs.writeFileSync(file,JSON.stringify(record),{mode:0o600});}
function records(){return fs.readdirSync(directory()).filter(n=>/^[a-f0-9-]+\.record\.json$/.test(n)).flatMap(name=>{
  const file=path.join(directory(),name);try{if(fs.lstatSync(file).isSymbolicLink())return [];const r=JSON.parse(fs.readFileSync(file,'utf8'));return r.managedBy===OWNER&&name===r.sessionId+'.record.json'?[r]:[];}catch{return [];}
});}
function forget(id){const root=path.resolve(process.env.SMV_STATE_DIR||path.join(os.homedir(),'.local','state','semantic-model-viewer'));const file=path.join(root,id+'.record.json');if(fs.existsSync(file))fs.unlinkSync(file);}
async function list(source){const rows=[];for(const record of records()){
  if(source&&record.source!==canonical(source))continue;
  try{const state=JSON.parse(fs.readFileSync(record.file,'utf8'));if(state.sessionId!==record.sessionId||state.managedBy!==OWNER||state.url!==record.url)throw new Error('Session record no longer matches its owner');
    const live=await require('./session.cjs').request(record.file,'status',undefined,undefined,2000);if(live.sessionId!==record.sessionId||live.managedBy!==OWNER)throw new Error('Server identity does not match the managed session');
    rows.push({record,...live,running:true});
  }catch(e){rows.push({record,sessionId:record.sessionId,source:record.source,sessionFile:record.file,pluginVersion:record.pluginVersion,running:false,error:e.message});}
}return rows;}
async function find(source,options={}){const rows=await list(source),current=identity();return rows.sort((a,b)=>Number(compatible(b,current))-Number(compatible(a,current))||Number(b.pluginVersion===version())-Number(a.pluginVersion===version())).find(r=>r.running&&r.protocolVersion===2&&r.report===(options.report?path.resolve(options.report):null)&&r.watch===!!options.watch&&(options.forNamedViews||r.view===(options.view?path.resolve(options.view):null))&&(r.watch||r.inputFingerprint===require('./session.cjs').fingerprint(r.source,r.view,r.report)));}
async function stopAll(source){const rows=await list(source),stopped=[],stale=[],errors=[];for(const row of rows){
  if(!row.running){stale.push(row.sessionId);continue;}
  try{await require('./session.cjs').request(row.sessionFile,'stop');stopped.push(row.sessionId);}catch(e){errors.push({sessionId:row.sessionId,error:e.message});}
}return {stopped,stale,errors};}
async function lock(source,run){const name=crypto.createHash('sha256').update(source).digest('hex')+'.lock',file=path.join(directory(),name),nonce=crypto.randomUUID(),end=Date.now()+20000;
  while(true){try{fs.writeFileSync(file,JSON.stringify({pid:process.pid,nonce}),{flag:'wx',mode:0o600});break;}catch(e){if(e.code!=='EEXIST')throw e;
    try{const owner=JSON.parse(fs.readFileSync(file,'utf8'));try{process.kill(owner.pid,0);}catch(err){if(err.code==='ESRCH')fs.unlinkSync(file);}}catch{}
    if(Date.now()>end)throw new Error('Another SMV session is starting; retry shortly');await new Promise(r=>setTimeout(r,100));}}
  try{return await run();}finally{try{if(JSON.parse(fs.readFileSync(file,'utf8')).nonce===nonce)fs.unlinkSync(file);}catch{}}
}
module.exports={OWNER,version,identity,compatible,directory,canonical,register,records,forget,list,find,stopAll,lock};
