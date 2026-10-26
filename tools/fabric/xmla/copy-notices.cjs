/* Copy the notices from the exact restored self-contained runtime package. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const [rid, destination] = process.argv.slice(2);
if (!rid || !destination) throw new Error('Usage: node copy-notices.cjs <runtime-id> <publish-directory>');
const assets = JSON.parse(fs.readFileSync(path.join(__dirname,'obj/project.assets.json'),'utf8'));
const name = 'Microsoft.NETCore.App.Runtime.'+rid;
const dependency = Object.values(assets.project.frameworks).flatMap(f => f.downloadDependencies || []).find(d => d.name === name);
if (!dependency) throw new Error('Publish this runtime before collecting its notices: '+rid);
const version = dependency.version.match(/\d+\.\d+\.\d+/)[0];
const runtime = Object.keys(assets.packageFolders).map(root => path.join(root,name.toLowerCase(),version))
  .find(folder => fs.existsSync(path.join(folder,'THIRD-PARTY-NOTICES.TXT')));
if (!runtime) throw new Error('Restored runtime notices are missing for '+rid);
const target = path.join(destination,'notices');
fs.mkdirSync(target,{recursive:true});
for (const file of fs.readdirSync(path.join(__dirname,'notices'))) fs.copyFileSync(path.join(__dirname,'notices',file),path.join(target,file));
for (const [source, name] of [['LICENSE.TXT','DOTNET-LICENSE.txt'],['THIRD-PARTY-NOTICES.TXT','DOTNET-THIRD-PARTY-NOTICES.txt']]) {
  fs.copyFileSync(path.join(runtime,source),path.join(target,name));
}
