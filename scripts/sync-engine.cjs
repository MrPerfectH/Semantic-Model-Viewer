'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function files(){
  const out=['packages/engine/index.cjs','Models/tools/viewer/index.html'];
  for(const dir of ['Models/tools/viewer','Models/tools/viewer/js','Models/tools/viewer/scripts/cli']){
    for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true}))if(entry.isFile()&&(/\.css$/.test(entry.name)||dir.endsWith('/js')&&entry.name.endsWith('.js')||dir.endsWith('/cli')&&entry.name.endsWith('.cjs')))out.push(dir+'/'+entry.name);
  }
  return out.sort();
}
function sync(target,check=false){
  const expected=files();
  if(!check){fs.rmSync(target,{recursive:true,force:true});for(const file of expected){const dest=path.join(target,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest);}}
  else{
    const walk=(dir,rel='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),rel+e.name+'/'):[rel+e.name]);
    if(JSON.stringify(walk(target).sort())!==JSON.stringify(expected))throw new Error('Packaged engine inventory differs');
    for(const file of expected)if(!fs.readFileSync(path.join(target,file)).equals(fs.readFileSync(path.join(root,file))))throw new Error('Packaged engine is stale: '+file);
  }
  return expected;
}
module.exports={sync};
