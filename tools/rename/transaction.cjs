'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JOURNAL = '.smv-rename-recovery';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inside(root, file) { const rel = path.relative(root, file); return rel && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel); }
function target(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => !p || p.startsWith('.')) || /[\x00-\x1f]/.test(relative)) throw new Error('Unsafe rename source path.');
  if (!/\.(?:tmdl|bim|json|pbir)$/i.test(relative)) throw new Error('Unsupported rename source file.');
  const file = path.resolve(root, relative);
  if (!inside(root, file)) throw new Error('Rename source is outside the repository.');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !inside(root, fs.realpathSync(file))) throw new Error('Rename source must be an ordinary file within the repository.');
  return file;
}
function inventory(root, modelRelative) {
  root = fs.realpathSync(root);
  const model = path.resolve(root, modelRelative);
  if (!inside(root, model) || !fs.statSync(model).isDirectory() || fs.realpathSync(model) !== model) throw new Error('Select a model folder inside the repository.');
  const files = []; let totalBytes = 0;
  function walk(dir, report = false) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.') || ['node_modules','bin','obj'].includes(item.name)) continue;
      const file = path.join(dir,item.name);
      if (item.isSymbolicLink()) throw new Error('Symbolic links in rename source folders are unsupported.');
      if (item.isDirectory()) walk(file, report);
      else if (item.isFile() && /\.(?:pbix|rdl)$/i.test(item.name)) throw new Error('Unsupported repository report format: '+item.name);
      else if (item.isFile() && /\.(?:tmdl|bim|json|pbir)$/i.test(item.name)) {
        const relative = path.relative(root,file).split(path.sep).join('/');
        const bytes = fs.readFileSync(file);
        totalBytes += bytes.length;
        if(totalBytes > 48*1024*1024)throw new Error('Repository metadata exceeds the supported rename size.');
        if (bytes.length > 16*1024*1024) throw new Error('Rename source exceeds the supported file size.');
        const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
        files.push({path:relative,text,hash:sha(bytes),report});
      }
    }
  }
  walk(model);
  function reports(dir, depth = 0) {
    if (depth > 10) throw new Error('Repository report discovery exceeds the supported depth.');
    for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
      if (item.name.startsWith('.') || ['node_modules','bin','obj'].includes(item.name)) continue;
      const child = path.join(dir,item.name);
      if (item.isSymbolicLink()) throw new Error('Repository discovery encountered a symbolic link.');
      if(item.isFile() && /\.(?:pbix|rdl)$/i.test(item.name))throw new Error('Unsupported repository report format: '+item.name);
      if (!item.isDirectory() || child === model) continue;
      if (/\.Report$/i.test(item.name)) walk(child,true); else reports(child,depth+1);
    }
  }
  reports(root);
  if (files.length > 10000) throw new Error('Rename source exceeds the supported file count.');
  return files.sort((a,b)=>a.path.localeCompare(b.path));
}
function verify(root, modelRelative, consulted) {
  const now = inventory(root,modelRelative);
  if (now.length !== consulted.length || now.some((file,i)=>file.path!==consulted[i].path || file.hash!==consulted[i].hash)) throw new Error('Sources or report membership changed after review. Create a new rename preview.');
}
function durableWrite(file, bytes, mode=0o600) {
  const fd = fs.openSync(file,'wx',mode);
  try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function syncDirectory(dir) { if(process.platform === 'win32')return; const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);} }
function apply(root, plan, {beforeWrite = ()=>{}}={}) {
  root=fs.realpathSync(root);
  if (plan.blockers?.length || !Array.isArray(plan.changes) || !plan.changes.length) throw new Error('There is no supported rename to save.');
  const journal = path.join(root,JOURNAL);
  if (fs.existsSync(journal)) throw new Error('An interrupted rename requires recovery before another rename.');
  verify(root,plan.modelRelative,plan.consulted);
  const seen=new Set();
  const entries=plan.changes.map(change=>{
    if(seen.has(change.path))throw new Error('Duplicate source change.');seen.add(change.path);
    const file=target(root,change.path),bytes=fs.readFileSync(file);
    if(!plan.consulted.some(source=>source.path===change.path))throw new Error('Source was not part of the reviewed inventory.');
    if((fs.statSync(file).mode&0o222)===0)throw new Error('Rename source is read-only.');
    if(bytes.toString('utf8')!==change.original)throw new Error('Source changed after review.');
    return {path:change.path,original:bytes.toString('base64'),replacement:Buffer.from(change.text,'utf8').toString('base64'),oldHash:sha(bytes),newHash:sha(Buffer.from(change.text,'utf8')),mode:fs.statSync(file).mode&0o777};
  });
  fs.mkdirSync(journal,{mode:0o700});
  durableWrite(path.join(journal,'transaction.json'),JSON.stringify({version:1,entries}));syncDirectory(journal);syncDirectory(root);
  try {
    for(let i=0;i<entries.length;i++) {
      const entry=entries[i], file=target(root,entry.path);
      beforeWrite(i,entry);
      if(sha(fs.readFileSync(file))!==entry.oldHash)throw new Error('Source changed during rename.');
      const stage=path.join(path.dirname(file),'.smv-rename-'+crypto.randomUUID()+'.tmp');
      try { durableWrite(stage,Buffer.from(entry.replacement,'base64'),entry.mode);if(sha(fs.readFileSync(file))!==entry.oldHash)throw new Error('Source changed during rename.');fs.renameSync(stage,file);syncDirectory(path.dirname(file)); }
      finally { if(fs.existsSync(stage))fs.unlinkSync(stage); }
    }
    // Check consulted but unchanged sources too. External writes never get overwritten by recovery.
    const expected=plan.consulted.map(file=>({ ...file,hash:entries.find(e=>e.path===file.path)?.newHash||file.hash }));
    verify(root,plan.modelRelative,expected);
    fs.rmSync(journal,{recursive:true});syncDirectory(root);
    return {changed:entries.map(e=>e.path)};
  } catch(error) {
    try {recover(root);}catch(recovery){throw new Error(error.message+' '+recovery.message);}
    throw error;
  }
}
function recover(root) {
  root=fs.realpathSync(root);const journal=path.join(root,JOURNAL),file=path.join(journal,'transaction.json');
  if(!fs.existsSync(journal))return {recovered:[]};
  if(fs.lstatSync(journal).isSymbolicLink() || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())throw new Error('Unsafe recovery journal.');
  const bytes=fs.readFileSync(file);if(bytes.length>128*1024*1024)throw new Error('Recovery journal exceeds supported size.');
  const data=JSON.parse(bytes.toString('utf8'));
  if(data.version!==1 || !Array.isArray(data.entries)||data.entries.length>10000)throw new Error('Unsupported recovery journal.');
  const entries=data.entries.map(entry=>{
    const file=target(root,entry.path),current=sha(fs.readFileSync(file));
    if(typeof entry.original!=='string'||sha(Buffer.from(entry.original,'base64'))!==entry.oldHash || (current!==entry.oldHash && current!==entry.newHash))throw new Error('Recovery found an external source change. Backups are retained in '+JOURNAL+'; review them before retrying.');
    return {entry,file,current};
  });
  const recovered=[];
  for(const {entry,file,current} of entries)if(current!==entry.oldHash){
    const stage=path.join(path.dirname(file),'.smv-rename-'+crypto.randomUUID()+'.tmp');
    try{durableWrite(stage,Buffer.from(entry.original,'base64'),entry.mode&0o777);if(sha(fs.readFileSync(file))!==current)throw new Error('Source changed during recovery; backups are retained.');fs.renameSync(stage,file);syncDirectory(path.dirname(file));recovered.push(entry.path);}finally{if(fs.existsSync(stage))fs.unlinkSync(stage);}
  }
  fs.rmSync(journal,{recursive:true});syncDirectory(root);return {recovered};
}
module.exports={inventory,verify,apply,recover,JOURNAL,sha};
