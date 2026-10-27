'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const [host,input]=process.argv.slice(2);if(!['claude','codex'].includes(host)||!input)throw new Error('Use test-agent-install.cjs claude|codex <complete-package>');
if(process.platform==='win32')throw new Error('Host installer acceptance runs on a POSIX runner; native Windows launcher acceptance is separate.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv complete installer '));
try{
 const catalog=path.join(temp,'catalog'),plugin=path.join(catalog,'plugins/semantic-model-viewer'),config=path.join(temp,'config');
 fs.mkdirSync(path.dirname(plugin),{recursive:true});fs.cpSync(path.resolve(input),plugin,{recursive:true});fs.mkdirSync(config);
 const env={...process.env,...(host==='claude'?{CLAUDE_CONFIG_DIR:config}:{CODEX_HOME:config})};
 if(process.env.SMV_TEST_INSTALL_WITHOUT_PATH==='1')env.PATH='';
 const command=host==='claude'?(process.env.SMV_CLAUDE_COMMAND||'claude'):(process.env.SMV_CODEX_COMMAND||'codex');
 const invoke=args=>execFileSync(command,args,{env,encoding:'utf8',timeout:120000});
 let installed;
 if(host==='claude'){
  fs.mkdirSync(path.join(catalog,'.claude-plugin'));
  fs.writeFileSync(path.join(catalog,'.claude-plugin/marketplace.json'),JSON.stringify({name:'smv-complete-test',owner:{name:'SMV acceptance'},plugins:[{name:'semantic-model-viewer',source:'./plugins/semantic-model-viewer'}]}));
  invoke(['plugin','marketplace','add',catalog]);invoke(['plugin','install','semantic-model-viewer@smv-complete-test','--scope','user','--json']);
  installed=JSON.parse(fs.readFileSync(path.join(config,'plugins/installed_plugins.json'),'utf8')).plugins['semantic-model-viewer@smv-complete-test'][0].installPath;
 }else{
  fs.mkdirSync(path.join(catalog,'.agents/plugins'),{recursive:true});
  fs.writeFileSync(path.join(catalog,'.agents/plugins/marketplace.json'),JSON.stringify({name:'smv-complete-test',plugins:[{name:'semantic-model-viewer',source:{source:'local',path:'./plugins/semantic-model-viewer'},policy:{installation:'AVAILABLE',authentication:'ON_USE'},category:'Productivity'}]}));
  invoke(['plugin','marketplace','add',catalog,'--json']);installed=JSON.parse(invoke(['plugin','add','semantic-model-viewer@smv-complete-test','--json'])).installedPath;
 }
 assert.ok(installed);assert.ok(fs.existsSync(path.join(installed,'build-info.json')));
 const result=execFileSync(process.execPath,[path.join(__dirname,'test-portable.cjs'),installed],{env,encoding:'utf8',timeout:120000});
 console.log(result.trim());console.log(JSON.stringify({host,freshInstallation:true,globalConfigurationUnchanged:true}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
