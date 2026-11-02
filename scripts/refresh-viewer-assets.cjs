'use strict';
// Keep cache-busting URLs tied to actual runtime bytes, without changing paths.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../Models/tools/viewer'),file=path.join(root,'index.html');
const before=fs.readFileSync(file,'utf8');
const after=before.replace(/((?:src|href)=["']\.\/)([^"'?#]+\.(?:js|css))(?:\?v=[^"']+)?/g,(_match,prefix,relative)=>{
 const target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep))throw Error('Asset path escapes viewer: '+relative);
 return prefix+relative+'?v='+crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0,10);
});
if(process.argv.includes('--check')){
 if(before!==after){console.error('Viewer asset hashes are stale. Run node scripts/refresh-viewer-assets.cjs');process.exitCode=1;}
 else console.log('Viewer asset hashes match runtime bytes.');
}else if(before!==after){fs.writeFileSync(file,after);console.log('Refreshed viewer asset hashes.');}
