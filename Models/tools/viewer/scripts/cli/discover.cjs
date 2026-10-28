'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
// Folders that hold copies of models rather than models a user works on. Matched
// against path segments below the searched root, so a root inside a test folder
// still treats its own models as real.
const SUPPORT=/^(tests?|__tests__|spec|fixtures?|[\w-]*-fixtures|verification|frozen[\w-]*|snapshots?|backups?|archive|dist|build|out|tmp|temp|\.?cache)$/i;
function role(p,root){
  const segments=path.relative(root,p).split(path.sep).slice(0,-1);
  const support=segments.find(s=>SUPPORT.test(s));
  if(/backup/i.test(path.relative(root,p)))return {role:'backup',reason:'Path contains "backup"'};
  if(support)return {role:'fixture',reason:'Inside '+support+'/'};
  // A bundled agent plugin carries its own copy of the demo models.
  for(let i=1;i<=segments.length;i++){const dir=path.join(root,...segments.slice(0,i));if(['.claude-plugin','.codex-plugin'].some(n=>fs.existsSync(path.join(dir,n))))return {role:'packaged',reason:'Inside packaged plugin '+segments.slice(0,i).join('/')+'/'};}
  return {role:'model'};
}
function discover(roots,{all=false}={}){
  const found=new Map();
  function walk(input,root){const target=path.resolve(input),stat=fs.lstatSync(target);if(stat.isSymbolicLink())return;
    if(stat.isFile()){if(path.extname(target).toLowerCase()==='.bim')add(target,root);return;}
    if(!stat.isDirectory())return;
    if(fs.existsSync(path.join(target,'model.tmdl'))){add(target,root);return;}
    if(fs.existsSync(path.join(target,'definition','model.tmdl'))){add(target,root);return;}
    for(const item of fs.readdirSync(target,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['.git','node_modules','.venv'].includes(item.name)||item.isSymbolicLink())continue;if(item.isDirectory()||/\.bim$/i.test(item.name))walk(path.join(target,item.name),root);}
  }
  function add(source,root){const p=fs.realpathSync(source),format=/\.bim$/i.test(p)?'bim':'tmdl';found.set(p,{id:crypto.createHash('sha256').update(p).digest('hex').slice(0,16),name:path.basename(path.basename(p)==='definition'?path.dirname(p):p).replace(/\.(SemanticModel|bim)$/i,''),path:p,format,...role(p,fs.realpathSync(root))});}
  roots.forEach(root=>walk(root,path.resolve(root)));
  // Real models first, then TMDL before BIM, keeping walk order otherwise.
  const rank=m=>(m.role==='model'?0:2)+(m.format==='tmdl'?0:1);
  const models=[...found.values()].map((m,i)=>({m,i})).sort((a,b)=>rank(a.m)-rank(b.m)||a.i-b.i).map(x=>x.m);
  // Hide test copies unless they are all there is, so a fixture folder still works.
  return all||!models.some(m=>m.role==='model')?models:models.filter(m=>m.role==='model');
}
function select(models,ref){const matches=models.filter(m=>m.id===ref||m.name===ref||m.path===path.resolve(ref));if(matches.length!==1)throw new Error((matches.length?'Ambiguous':'Unknown')+' model: '+ref+'; use an exact path or discovery ID');return matches[0];}
// Accept a model path, or a discovered model name or ID below the current folder.
function resolve(ref,cwd=process.cwd()){
  if(fs.existsSync(path.resolve(cwd,ref)))return ref;
  const models=discover([cwd],{all:true}),key=String(ref).toLowerCase();
  const named=models.filter(m=>m.id===ref||m.name.toLowerCase()===key);
  const matches=named.length>1?named.filter(m=>m.role==='model'):named;
  if(matches.length===1)return matches[0].path;
  const listed=(matches.length?matches:models.filter(m=>m.role==='model')).slice(0,8).map(m=>m.name+' ('+m.path+')');
  const error=new Error((matches.length?'Several models are named ':'No model path or discovered model named ')+JSON.stringify(ref)+' under '+cwd+'. '+(listed.length?'Candidates: '+listed.join('; ')+'. ':'')+'Pass an exact path or discovery ID.');
  error.code=matches.length?'MODEL_AMBIGUOUS':'MODEL_NOT_FOUND';throw error;
}
module.exports={discover,select,resolve};
