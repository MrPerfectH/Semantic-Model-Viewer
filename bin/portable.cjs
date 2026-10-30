'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
try{
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('SMV requires Node.js 22+; use the packaged runtime.');
  const infoFile=path.join(root,'build-info.json');
  // Source checkouts may opt into a developer-supplied runtime, never PATH lookup.
  if(!fs.existsSync(infoFile)){
    if(!process.env.SMV_NODE)throw new Error('Incomplete portable package: build-info.json is missing. Install a complete plugin artifact.');
    require('./smv.cjs');
  }else{
    const info=JSON.parse(fs.readFileSync(infoFile,'utf8'));
    if(!/^[a-f0-9]{64}$/.test(info.sha256)||!info.files||info.sha256!==require('node:crypto').createHash('sha256').update(JSON.stringify(info.files)).digest('hex'))throw new Error('Invalid portable package identity');
    let selected=root;
    const live=['show','compare','open','serve'].includes(args[0])&&!args.includes('--out')&&!args.includes('-o');
    if(live){
      const cache=path.resolve(process.env.SMV_PACKAGE_CACHE||path.join(os.homedir(),'.cache','semantic-model-viewer','packages'));
      selected=path.join(cache,info.sha256);
      if(!fs.existsSync(selected)){
        fs.mkdirSync(cache,{recursive:true});const temp=fs.mkdtempSync(path.join(cache,'.package-'));
        try{
          const target=(process.platform==='win32'?'win':process.platform)+'-'+process.arch;
          fs.cpSync(root,temp,{recursive:true,filter:file=>{
            const rel=path.relative(root,file).split(path.sep);
            return rel[0]!=='runtime'||rel.length<2||rel[1]===target;
          }});
          for(const [file,expected] of Object.entries(info.files)){
            if(file.startsWith('runtime/')&&!file.startsWith('runtime/'+target+'/'))continue;
            const actual=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(temp,file))).digest('hex');
            if(actual!==expected)throw new Error('Package changed during session preparation: '+file);
          }
          if(process.platform!=='win32')fs.chmodSync(path.join(temp,'runtime',target,'node'),0o700);
          try{fs.renameSync(temp,selected);}catch(error){if(!['EEXIST','ENOTEMPTY','EPERM'].includes(error.code)||!fs.existsSync(path.join(selected,'build-info.json')))throw error;}
        }finally{fs.rmSync(temp,{recursive:true,force:true});}
      }
      if(fs.lstatSync(selected).isSymbolicLink())throw new Error('Package cache must not be a symbolic link');
    }
    const target=(process.platform==='win32'?'win':process.platform)+'-'+process.arch;
    const executable=selected===root?process.execPath:path.join(selected,'runtime',target,process.platform==='win32'?'node.exe':'node');
    const result=spawnSync(executable,[path.join(selected,'bin/smv.cjs'),...args],{stdio:'inherit'});
    if(result.error)throw result.error;process.exitCode=result.status===null?1:result.status;
  }
}catch(error){process.stderr.write('SMV: '+error.message+'\n');process.exitCode=1;}
