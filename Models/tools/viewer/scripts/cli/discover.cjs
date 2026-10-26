'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function discover(roots){
  const found=new Map();
  function walk(input){const target=path.resolve(input),stat=fs.lstatSync(target);if(stat.isSymbolicLink())return;
    if(stat.isFile()){if(path.extname(target).toLowerCase()==='.bim')add(target);return;}
    if(!stat.isDirectory())return;
    if(fs.existsSync(path.join(target,'model.tmdl'))){add(target);return;}
    if(fs.existsSync(path.join(target,'definition','model.tmdl'))){add(target);return;}
    for(const item of fs.readdirSync(target,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(['.git','node_modules','.venv'].includes(item.name)||item.isSymbolicLink())continue;if(item.isDirectory()||/\.bim$/i.test(item.name))walk(path.join(target,item.name));}
  }
  function add(source){const p=fs.realpathSync(source);found.set(p,{id:crypto.createHash('sha256').update(p).digest('hex').slice(0,16),name:path.basename(path.basename(p)==='definition'?path.dirname(p):p).replace(/\.SemanticModel$/i,''),path:p});}
  roots.forEach(walk);return [...found.values()];
}
function select(models,ref){const matches=models.filter(m=>m.id===ref||m.name===ref||m.path===path.resolve(ref));if(matches.length!==1)throw new Error((matches.length?'Ambiguous':'Unknown')+' model: '+ref+'; use an exact path or discovery ID');return matches[0];}
module.exports={discover,select};
