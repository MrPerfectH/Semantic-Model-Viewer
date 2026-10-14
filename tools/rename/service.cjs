'use strict';
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const tx=require('./transaction.cjs');
const {planReportRename}=require('./report-references.cjs');
function createService({modelPlanner,now=()=>Date.now()}={}){
 modelPlanner=modelPlanner||require('../../Models/tools/viewer/js/model-rename.js');
 const pending=new Map();
 function location(root,modelPath){
  root=fs.realpathSync(root);modelPath=fs.realpathSync(modelPath);
  const relative=path.relative(root,modelPath).split(path.sep).join('/');
  if(!relative||relative==='..'||relative.startsWith('../'))throw new Error('Connect the repository folder containing both the model and reports.');
  return {root,modelRelative:relative};
 }
 function objects(root,modelPath){const where=location(root,modelPath),files=tx.inventory(where.root,where.modelRelative);return {objects:modelPlanner.listObjects(files.filter(f=>!f.report)),recovery:fs.existsSync(path.join(where.root,tx.JOURNAL))};}
 function preview(root,modelPath,rename){
  const where=location(root,modelPath),consulted=tx.inventory(where.root,where.modelRelative);
  const model=modelPlanner.planModelRename(consulted.filter(f=>!f.report),rename);
  const reports=planReportRename(consulted.filter(f=>f.report),{relativeSemanticModelPath:where.modelRelative},rename);
  const blockers=[...model.blockers,...reports.blockers.map(b=>`${b.path}: ${b.message}`)];
  const changes=[...model.files,...reports.changes];
  if(Buffer.byteLength(JSON.stringify(changes))>48*1024*1024)throw new Error('Rename preview exceeds the supported size.');
  const token=crypto.randomUUID(),plan={...where,rename,consulted,changes,blockers,created:now()};
  // Bound private review memory; tokens never authorize an unchecked caller-supplied patch.
  for(const [key,value] of pending)if(now()-value.created>15*60*1000)pending.delete(key);
  if(pending.size>=8)pending.delete(pending.keys().next().value);
  if(!blockers.length&&changes.length)pending.set(token,plan);
  return {token:blockers.length?null:token,rename,changes:changes.map(c=>({path:c.path,original:c.original,text:c.text})),blockers,
   diagnostics:[...model.diagnostics,...reports.diagnostics],notice:'Updates only supported model and repository-local report references. External reports, Excel connections and queries may still need updates. This is source-reference validation, not model-engine or report-rendering validation.'};
 }
 function apply(token,{beforeApply=()=>{}}={}){
  const plan=pending.get(token);pending.delete(token);
  if(!plan||now()-plan.created>15*60*1000)throw new Error('Rename review expired. Create a new preview.');
  beforeApply(plan);
  return tx.apply(plan.root,plan);
 }
 function cancel(token){pending.delete(token);return {cancelled:true};}
 function recover(root){pending.clear();return tx.recover(root);}
 return {objects,preview,apply,cancel,recover,dispose:()=>pending.clear()};
}
module.exports={createService};
