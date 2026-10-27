'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const lock=require('../runtime/node-lock.json');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function walk(root,relative=''){
  return fs.readdirSync(path.join(root,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(entry.isSymbolicLink())throw new Error('Portable payload may not contain symlinks');
    const file=relative?relative+'/'+entry.name:entry.name;return entry.isDirectory()?walk(root,file):[file];
  });
}
function build({out,runtimeRoot,targets,host='claude',npm=process.env.npm_execpath}){
  if(!['claude','codex'].includes(host))throw new Error('host must be claude or codex');
  if(!out||!runtimeRoot||!targets||!targets.length)throw new Error('Provide --out, --runtime-root and --targets');
  targets=[...new Set(targets)];out=path.resolve(out);
  // Verify all upstream-pinned runtime inputs before generating an installable package.
  for(const target of targets){
    if(!lock.targets[target])throw new Error('Unsupported runtime target: '+target);
    const base=path.join(runtimeRoot,target),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
    if(manifest.version!==lock.version||manifest.target!==target||manifest.archiveSha256!==lock.targets[target].sha256)throw new Error('Runtime does not match pinned Node release');
    const binary=target.startsWith('win-')?'node.exe':'node';
    if(!manifest.files[binary]||!manifest.files.LICENSE)throw new Error('Runtime binary and LICENSE are required');
    for(const file of [binary,'LICENSE'])if(sha(fs.readFileSync(path.join(base,file)))!==manifest.files[file])throw new Error('Runtime file checksum mismatch: '+target+'/'+file);
  }
  require('./build-claude-plugin.cjs').build(out,npm);
  try{
    if(host==='codex')require('./build-codex-plugin.cjs').convert(out);
    for(const target of targets)fs.cpSync(path.join(runtimeRoot,target),path.join(out,'runtime',target),{recursive:true});
    fs.chmodSync(path.join(out,'bin/smv'),0o755);
    const files=Object.fromEntries(walk(out).map(file=>[file,sha(fs.readFileSync(path.join(out,file)))]));
    const manifest=JSON.parse(fs.readFileSync(path.join(out,'.claude-plugin/plugin.json'),'utf8'));
    const engineFiles=Object.fromEntries(Object.entries(files).filter(([file])=>file.startsWith('Models/tools/viewer/')||file.startsWith('packages/engine/')));
    const engineHash=sha(JSON.stringify(engineFiles));
    const info={engineHash,format:'smv-portable',version:1,engineVersion:manifest.version,host,targets,nodeVersion:lock.version,sha256:sha(JSON.stringify(files)),files};
    fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify(info,null,2)+'\n');return info;
  }catch(e){fs.rmSync(out,{recursive:true,force:true});throw e;}
}
function archive(folder,out){
  if(fs.existsSync(out))throw new Error('Archive output already exists');
  const script='import os,sys,zipfile\nroot,out=sys.argv[1:]\nwith zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:\n for d,dirs,files in os.walk(root):\n  dirs.sort()\n  for f in sorted(files):\n   p=os.path.join(d,f);z.write(p,os.path.relpath(p,root))\n';
  execFileSync(process.env.SMV_PYTHON||(process.platform==='win32'?'python':'python3'),['-c',script,path.resolve(folder),path.resolve(out)]);
  const stat=fs.statSync(out);if(stat.size>256*1024*1024){fs.unlinkSync(out);throw new Error('Portable archive exceeds Claude 256 MiB download limit');}
  const receipt={file:path.basename(out),bytes:stat.size,sha256:sha(fs.readFileSync(out))};fs.writeFileSync(out+'.sha256',receipt.sha256+'  '+receipt.file+'\n');return receipt;
}
if(require.main===module){try{
  const {values}=require('node:util').parseArgs({options:{out:{type:'string'},'runtime-root':{type:'string'},targets:{type:'string'},host:{type:'string'},zip:{type:'string'}}});
  const info=build({out:values.out,runtimeRoot:values['runtime-root'],targets:(values.targets||'').split(',').filter(Boolean),host:values.host||'claude'});
  console.log(JSON.stringify({engineVersion:info.engineVersion,targets:info.targets,sha256:info.sha256,...(values.zip?{archive:archive(values.out,values.zip)}:{})}));
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={build,archive};
