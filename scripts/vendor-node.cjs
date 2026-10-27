'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const lock=require('../runtime/node-lock.json');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
async function vendor(target,output){
  const entry=lock.targets[target];if(!entry)throw new Error('Unsupported runtime target: '+target);
  output=path.resolve(output);if(fs.existsSync(output))throw new Error('Runtime output already exists: '+output);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const temp=fs.mkdtempSync(path.join(path.dirname(output),'.node-runtime-'));
  try{
    const response=await fetch(lock.origin+entry.archive,{signal:AbortSignal.timeout(180000),redirect:'error'});
    if(!response.ok)throw new Error('Node archive download failed: '+response.status);
    const length=Number(response.headers.get('content-length'));if(!length||length>150*1024*1024)throw new Error('Unexpected runtime archive size');
    const archive=path.join(temp,entry.archive);const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==length||sha(bytes)!==entry.sha256)throw new Error('Node archive checksum mismatch');
    fs.writeFileSync(archive,bytes);const unpacked=path.join(temp,'unpacked');fs.mkdirSync(unpacked);
    if(entry.archive.endsWith('.zip')){
      if(process.platform!=='win32')throw new Error('Build Windows runtime on a Windows runner');
      // Fixed script; paths travel through environment variables, never script interpolation.
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:SMV_NODE_ARCHIVE -DestinationPath $env:SMV_NODE_UNPACK'],{env:{...process.env,SMV_NODE_ARCHIVE:archive,SMV_NODE_UNPACK:unpacked}});
    }else execFileSync('tar',['-xzf',archive,'-C',unpacked]);
    const base=path.join(unpacked,'node-v'+lock.version+'-'+target),name=target.startsWith('win-')?'node.exe':'node';
    const binary=path.join(base,target.startsWith('win-')?'node.exe':'bin/node');
    const staged=path.join(temp,'runtime');fs.mkdirSync(staged);
    fs.copyFileSync(binary,path.join(staged,name));if(name==='node')fs.chmodSync(path.join(staged,name),0o755);
    fs.copyFileSync(path.join(base,'LICENSE'),path.join(staged,'LICENSE'));
    const manifest={version:lock.version,target,origin:lock.origin+entry.archive,archiveSha256:entry.sha256,files:{[name]:sha(fs.readFileSync(binary)),LICENSE:sha(fs.readFileSync(path.join(base,'LICENSE')))}};
    const checksum=name+'.sha256';fs.writeFileSync(path.join(staged,checksum),manifest.files[name]+'\n');manifest.files[checksum]=sha(fs.readFileSync(path.join(staged,checksum)));
    fs.writeFileSync(path.join(staged,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.renameSync(staged,output);return manifest;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module){const {values}=require('node:util').parseArgs({options:{target:{type:'string'},out:{type:'string'}}});vendor(values.target,values.out||'dist/runtime/'+values.target).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={vendor};
