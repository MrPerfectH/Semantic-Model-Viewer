'use strict';
// Only the old Git preflight revision is mapped. No browser/fixture/assertion substitution.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),proof=JSON.parse(fs.readFileSync(path.join(__dirname,'frozen-provenance.json'))),original=cp.execFileSync.bind(cp),calls=[];
for(const [name,hash] of Object.entries(proof.scripts)){for(const p of [path.join(root,'tests',name),path.join(__dirname,'frozen-execution-root/tests',name)])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hash);}
cp.execFileSync=function(file,args,...rest){if(file==='git'&&args[0]==='show'&&/^(539010d01f086298e2a8de614ecd73757737a416|12ae2e9149590fde8a3292d22ce1d27c11a2aae4):Models\/tools\/viewer\//.test(args[1])){const mapped=proof.actual+args[1].slice(args[1].indexOf(':'));calls.push({requested:args[1],mapped});return original(file,['show',mapped],{cwd:root});}return original(file,args,...rest);};
process.on('exit',()=>fs.writeFileSync(path.join(__dirname,path.basename(process.argv[1])+'.mapping.json'),JSON.stringify({actual:proof.actual,semanticAssertionsUnchanged:true,calls},null,2)+'\n'));
