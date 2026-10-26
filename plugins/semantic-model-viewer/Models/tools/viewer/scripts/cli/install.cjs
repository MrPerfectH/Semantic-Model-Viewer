'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const MARK='SMV_MANAGED_LAUNCHER_V1';
function install(options={}){
  if(options.binDir!==undefined&&!options.binDir.trim())throw new Error('--bin-dir cannot be empty');
  const dir=path.resolve(options.binDir||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA||os.homedir(),'SemanticModelViewer','bin'):path.join(os.homedir(),'.local','bin')));
  fs.mkdirSync(dir,{recursive:true});
  const fallback=fs.realpathSync(path.resolve(__dirname,'../../../../../bin/smv.cjs'));
  const registry=path.resolve(process.env.SMV_INSTALL_REGISTRY||path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'plugins','installed_plugins.json'));
  const config={fallback,registry};
  const content=`#!/usr/bin/env node\n// ${MARK}\n'use strict';\nconst fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');\nconst config=${JSON.stringify(config)};\nlet cli;try{const data=JSON.parse(fs.readFileSync(config.registry,'utf8'));const entries=data.plugins['semantic-model-viewer@semantic-model-tools']||[];const sorted=entries.slice().sort((a,b)=>(a.scope==='user'?-1:0)-(b.scope==='user'?-1:0));for(const entry of sorted){const file=path.join(entry.installPath,'bin','smv.cjs');const manifest=path.join(entry.installPath,'.claude-plugin','plugin.json');if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(manifest,'utf8')).name==='semantic-model-viewer'){cli=file;break;}}}catch{}\ncli=cli||config.fallback;if(!fs.existsSync(cli)){process.stderr.write('SMV installation not found. Reinstall the Semantic Model Viewer Claude plugin and rerun its install command.\\n');process.exit(1);}\nconst result=spawnSync(process.execPath,[cli,...process.argv.slice(2)],{stdio:'inherit'});if(result.error){process.stderr.write(result.error.message+'\\n');process.exit(1);}process.exit(result.status===null?1:result.status);\n`;
  const files=process.platform==='win32'?[[path.join(dir,'smv.cjs'),content],[path.join(dir,'smv.cmd'),'@rem '+MARK+'\r\n@node "%~dp0smv.cjs" %*\r\n']]:[[path.join(dir,'smv'),content]];
  for(const [file] of files)if(fs.existsSync(file)&&(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file,'utf8').includes(MARK)))throw new Error('Refusing to overwrite an unrelated command: '+file);
  for(const [file,text] of files){fs.writeFileSync(file,text,{mode:0o755});if(process.platform!=='win32')fs.chmodSync(file,0o755);}
  const onPath=(process.env.PATH||'').split(path.delimiter).some(p=>process.platform==='win32'?path.resolve(p).toLowerCase()===dir.toLowerCase():path.resolve(p)===dir);
  return {command:'smv',path:files[0][0],binDir:dir,onPath,registry,fallback,
    message:onPath?'smv is installed on PATH and resolves plugin upgrades automatically.':'Launcher installed. Add '+dir+' to your user PATH, then reopen the terminal. Shell configuration was not changed.'};
}
module.exports={install};
