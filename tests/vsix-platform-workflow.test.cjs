'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const prerelease of ['true','false'])test(`distribution packages valid VS Code targets with matching private runtimes (preview=${prerelease})`,{skip:process.platform==='win32'},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv-platform-workflow-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const lines=fs.readFileSync(path.join(root,'.github/workflows/fabric-preview.yml'),'utf8').split('\n');
 const start=lines.findIndex(l=>l.includes('name: Package platform extensions with the complete CLI'));
 const run=lines.findIndex((l,i)=>i>start&&l.trim()==='run: |');
 const body=[];for(let i=run+1;i<lines.length;i++){if(lines[i]&&!lines[i].startsWith('          '))break;body.push(lines[i].slice(10));}
 assert.ok(body.length>5,'Extract the actual distribution shell step');
 fs.mkdirSync(path.join(temp,'vscode-extension'));for(const name of ['README.md','PRE-RELEASE.md'])fs.writeFileSync(path.join(temp,'vscode-extension',name),'fixture');
 const log=path.join(temp,'calls.jsonl'),helper=path.join(temp,'npm.cjs');
 fs.writeFileSync(helper,`const fs=require('node:fs');const args=process.argv.slice(2);if(args[1]==='package'||args[1]==='package:preview'){const {ManifestProcessor}=require(${JSON.stringify(path.join(root,'vscode-extension/node_modules/@vscode/vsce/out/package'))});new ManifestProcessor(require(${JSON.stringify(path.join(root,'vscode-extension/package.json'))}),{target:args[args.indexOf('--target')+1]});}fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');`);
 const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
 const script=`npm(){ ${quote(process.execPath)} ${quote(helper)} "$@"; }\nnode(){ :; }\nset -e\n${body.join('\n').replaceAll('/tmp/smv-preview-readme.md',quote(path.join(temp,'preview-readme.md')))}`;
 const result=spawnSync('bash',['-c',script],{cwd:temp,env:{...process.env,PRERELEASE:prerelease},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
 const builds=calls.filter(a=>a[1]==='build:vscode-cli'),packages=calls.filter(a=>a[1]=== (prerelease==='true'?'package:preview':'package'));
 assert.equal(packages.length,5);assert.equal(builds.length,5);
 for(let i=0;i<builds.length;i++){const runtime=builds[i][builds[i].indexOf('--target')+1],target=packages[i][packages[i].indexOf('--target')+1];assert.equal(target,runtime==='win-x64'?'win32-x64':runtime);assert.equal(packages[i][packages[i].indexOf('--out')+1],`semantic-model-viewer-${target}.vsix`);}
});
