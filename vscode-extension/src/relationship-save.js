'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {prepareRelationshipPatch}=require('../media/js/relationship-edit');
function capture(entry, files) {
  const root=fs.realpathSync(entry.uri.fsPath), out=[];
  for(const f of files) {
    const full=path.resolve(entry.uri.fsPath,f.path),real=fs.realpathSync(full),delta=path.relative(root,real);
    if(delta.startsWith('..')||path.isAbsolute(delta)||real!==path.join(root,f.path)) throw Error('Symlink model sources are unsupported for editing.');
    const bytes=fs.readFileSync(full),text=bytes.toString('utf8');
    if(!Buffer.from(text).equals(bytes)||text.replace(/^\uFEFF/,'')!==f.text.replace(/^\uFEFF/,'')) throw Error('Source changed or is not UTF-8. Refresh the model.');
    out.push({path:f.path,text});
  }
  return out;
}
async function prepare(owner,msg,panel,read) {
  if(!owner.current||owner.current.kind==='file'||msg.modelId!==owner.current.id) throw Error('Open the same TMDL model before editing.');
  const entry=owner.current,epoch=owner.epoch,files=capture(entry,await read(entry));
  if(!owner.isCurrent(panel,epoch)) throw Error('The model changed.');
  const patch=prepareRelationshipPatch(files,msg,crypto.randomUUID());
  const directory=path.join(fs.realpathSync(entry.uri.fsPath),'definition');
  if(fs.realpathSync(directory)!==directory) throw Error('Symlink definition directory is unsupported.');
  const target=path.join(fs.realpathSync(entry.uri.fsPath),patch.path),exists=fs.existsSync(target);
  if(exists&&!files.some(f=>f.path===patch.path)) throw Error('Relationship source was not read.');
  const token=crypto.randomBytes(24).toString('hex');
  owner.relationshipEdit={entry,epoch,files,patch,target,exists,token,root:fs.realpathSync(entry.uri.fsPath)};
  return {token,path:patch.path,before:patch.before,after:patch.after,validation:patch.validation};
}
async function save(owner,msg,panel,read,vscode) {
  const e=owner.relationshipEdit;
  if(!e||e.token!==msg.token||owner.current!==e.entry||!owner.isCurrent(panel,e.epoch)) throw Error('The edit is stale. Review again.');
  if((vscode.workspace.textDocuments||[]).some(d=>d.isDirty&&path.resolve(d.uri.fsPath).startsWith(path.resolve(e.entry.uri.fsPath)+path.sep))) throw Error('The model has unsaved editor changes.');
  if(fs.realpathSync(e.entry.uri.fsPath)!==e.root) throw Error('Model source directory changed externally.');
  const fresh=capture(e.entry,await read(e.entry));
  if(JSON.stringify(fresh)!==JSON.stringify(e.files)||fs.existsSync(e.target)!==e.exists||!owner.isCurrent(panel,e.epoch)) throw Error('Model source changed externally. Refresh and review again.');
  if(fs.realpathSync(path.dirname(e.target))!==path.dirname(e.target)) throw Error('Source directory changed.');
  const temp=e.target+'.smv-'+e.token;
  try {
    fs.writeFileSync(temp,e.patch.text,{flag:'wx',encoding:'utf8',mode:e.exists?fs.statSync(e.target).mode:0o644});
    // Recheck consulted bytes immediately before replacing the source.
    if(e.files.some(f=>fs.readFileSync(path.join(e.entry.uri.fsPath,f.path),'utf8')!==f.text)) throw Error('Model source changed externally.');
    if(e.exists) fs.renameSync(temp,e.target); else { fs.linkSync(temp,e.target); fs.unlinkSync(temp); }
  } finally {if(fs.existsSync(temp)) fs.unlinkSync(temp);}
  owner.relationshipEdit=null;
  return {saved:true,model:await owner.modelMessage(e.entry)};
}
module.exports={prepare,save};
