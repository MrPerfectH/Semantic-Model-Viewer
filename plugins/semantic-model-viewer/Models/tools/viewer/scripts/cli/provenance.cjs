'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MARKER='.smv-source.json';
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
function files(source){
  source=fs.realpathSync(source);if(path.basename(source)==='definition'&&fs.existsSync(path.join(source,'model.tmdl')))source=path.dirname(source);
  const out=[];
  function walk(p,relative){const stat=fs.lstatSync(p);if(stat.isSymbolicLink())throw new Error('Model provenance cannot follow symlinks: '+relative);
    if(stat.isDirectory()){for(const name of fs.readdirSync(p).sort())if(!['.git','node_modules','.smv-artifacts',MARKER].includes(name))walk(path.join(p,name),relative?relative+'/'+name:name);}
    else if(/\.(tmdl|bim|pbism|json)$/i.test(p)||path.basename(p)==='.platform')out.push({path:relative||path.basename(p),bytes:stat.size,sha256:sha256(fs.readFileSync(p))});}
  walk(source,'');return out;
}
function contentHash(source){return sha256(JSON.stringify(files(source)));}
function describe(source,metadata={}){
  source=fs.realpathSync(source);if(path.basename(source)==='definition'&&fs.existsSync(path.join(source,'model.tmdl')))source=path.dirname(source);
  const current=contentHash(source),result={kind:'local',path:source,contentHash:current,capturedAt:new Date().toISOString(),...metadata};
  const marker=path.join(source,MARKER);
  if(fs.existsSync(marker)){
    const stat=fs.lstatSync(marker);if(stat.isSymbolicLink()||stat.size>65536)throw new Error('Invalid fetch provenance record');
    let record;try{record=JSON.parse(fs.readFileSync(marker,'utf8'));}catch{throw new Error('Invalid fetch provenance record');}
    if(record.schemaVersion!==1||record.kind!=='fabric-definition'||!record.workspace||!record.model||typeof record.fetchedAt!=='string'||typeof record.contentHash!=='string')throw new Error('Invalid fetch provenance record');
    Object.assign(result,{kind:record.kind,workspace:record.workspace,model:record.model,fetchedAt:record.fetchedAt,fetchedContentHash:record.contentHash,unchangedSinceFetch:current===record.contentHash,remoteFreshness:'Not checked. This is a local copy of the definition fetched at fetchedAt.'});
  }
  return result;
}
function receipt(source,prepared,output,scope){
  const result={schemaVersion:1,generatedAt:new Date().toISOString(),pluginVersion:require('./managed.cjs').version(),source:describe(source,{modelHash:prepared.hash}),renderer:prepared.renderer,view:scope||prepared.summary,artifact:{path:path.resolve(output),bytes:fs.statSync(output).size,sha256:sha256(fs.readFileSync(output)),containsFullModelMetadata:path.extname(output).toLowerCase()==='.html'}};
  if(prepared.sourceContentHash&&result.source.contentHash!==prepared.sourceContentHash)throw Object.assign(new Error('Model files changed while generating the artifact; retry with stable files'),{code:'SOURCE_CHANGED'});
  return result;
}
function saveReceipt(receipt,output,force=false){const file=path.resolve(output)+'.receipt.json';if(fs.existsSync(file)&&(!force||fs.lstatSync(file).isSymbolicLink()))throw new Error('Receipt already exists; use --force for a regular file: '+file);fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n',{flag:force?'w':'wx',mode:0o600});return file;}
function reserveOutput(output,force=false){for(const file of [path.resolve(output),path.resolve(output)+'.receipt.json'])if(fs.existsSync(file)&&(!force||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw new Error('Output or receipt exists; use --force for regular files: '+file);}
module.exports={MARKER,sha256,files,contentHash,describe,receipt,saveReceipt,reserveOutput};

// Stage first: a changed source never replaces the previous successful artifact.
async function publish(source,prepared,output,options,produce){
  output=path.resolve(output);reserveOutput(output,options.force);fs.mkdirSync(path.dirname(output),{recursive:true});
  const temp=fs.mkdtempSync(path.join(path.dirname(output),'.smv-artifact-')),candidate=path.join(temp,path.basename(output)),sidecar=output+'.receipt.json';
  try{
    await produce(candidate);
    const evidence=receipt(source,prepared,candidate);evidence.artifact.path=output;
    const stagedReceipt=path.join(temp,'receipt.json');fs.writeFileSync(stagedReceipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
    reserveOutput(output,options.force);
    if(options.force){fs.renameSync(candidate,output);fs.renameSync(stagedReceipt,sidecar);}
    else{fs.linkSync(candidate,output);try{fs.linkSync(stagedReceipt,sidecar);}catch(e){fs.unlinkSync(output);throw e;}}
    return {receipt:evidence,receiptPath:sidecar};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports.publish=publish;
