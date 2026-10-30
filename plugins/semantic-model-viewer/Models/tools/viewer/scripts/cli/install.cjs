'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const MARK='SMV_MANAGED_LAUNCHER_V1';
function install(options={}){
  if(options.binDir!==undefined&&!options.binDir.trim())throw new Error('--bin-dir cannot be empty');
  const dir=path.resolve(options.binDir||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA||os.homedir(),'SemanticModelViewer','bin'):path.join(os.homedir(),'.local','bin')));
  const {resolveRuntime,runLauncher,currentConfig}=require('./runtime.cjs');
  const config=currentConfig();
  if(options.source!==undefined&&!['checkout','plugin'].includes(options.source))throw new Error('--source must be checkout or plugin');
  if(options.source)config.source=options.source;
  const {fallback,registry}=config;
  const runtime=resolveRuntime(config);
  fs.mkdirSync(dir,{recursive:true});
  const content=`#!/usr/bin/env node\n// ${MARK}\n'use strict';\n(${runLauncher.toString()})(${JSON.stringify(config)}, ${resolveRuntime.toString()});\n`;
  const files=process.platform==='win32'?[[path.join(dir,'smv.cjs'),content],[path.join(dir,'smv.cmd'),'@rem '+MARK+'\r\n@node "%~dp0smv.cjs" %*\r\n']]:[[path.join(dir,'smv'),content]];
  for(const [file] of files)if(fs.existsSync(file)&&(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file,'utf8').includes(MARK)))throw new Error('Refusing to overwrite an unrelated command: '+file);
  for(const [file,text] of files){fs.writeFileSync(file,text,{mode:0o755});if(process.platform!=='win32')fs.chmodSync(file,0o755);}
  const onPath=(process.env.PATH||'').split(path.delimiter).some(p=>process.platform==='win32'?path.resolve(p).toLowerCase()===dir.toLowerCase():path.resolve(p)===dir);
  return {command:'smv',path:files[0][0],binDir:dir,onPath,registry,fallback,source:config.source,runtime,
    message:(config.source==='checkout'?'Launcher uses the selected checkout only.':'Launcher follows Claude plugin registry upgrades.')+(onPath?' smv is on PATH.':' Add '+dir+' to your user PATH, then reopen the terminal. Shell configuration was not changed.')};
}
module.exports={install};
