'use strict';
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
function policy(options={},defaultMode='none',env=process.env){
  if(options.open!==undefined&&!['none','system'].includes(options.open))throw new Error('--open must be none or system');
  if(options.opener!==undefined&&(!options.opener.trim()||/[\r\n\0]/.test(options.opener)))throw new Error('--opener must name one executable, without arguments');
  if(options.open==='none'&&options.opener)throw new Error('Choose --open none or --opener, not both');
  const setting=env.SMV_OPENER;
  const mode=options.open||(options.opener?'system':setting==='none'?'none':setting?'system':defaultMode);
  return {mode,executable:options.opener||(setting&&!['none','system'].includes(setting)?setting:null)};
}
async function open(target,options={},defaultMode='none',deps={}){
  const plan=policy(options,defaultMode,deps.env||process.env);
  if(plan.mode==='none')return {requested:'none',launched:false,target};
  let url;try{const u=new URL(target);if(!['http:','https:','file:'].includes(u.protocol))throw new Error();url=u.href;}catch{url=pathToFileURL(require('node:path').resolve(target)).href;}
  const platform=deps.platform||process.platform;
  const command=plan.executable||(platform==='darwin'?'open':platform==='win32'?'rundll32.exe':'xdg-open');
  const args=!plan.executable&&platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  try{await new Promise((resolve,reject)=>{const child=(deps.spawn||spawn)(command,args,{stdio:'ignore',windowsHide:true,shell:false});const timeout=setTimeout(()=>{child.kill();reject(new Error('timeout'));},15000);child.once('error',e=>{clearTimeout(timeout);reject(e);});child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('exit'));});});return {requested:'system',launched:true,target,opener:command,note:'Launcher succeeded; this is not proof that a browser rendered the diagram.'};}
  catch{return {requested:'system',launched:false,target,opener:command,message:'Could not launch the opener. Use the returned URL or file path; the generated view remains available.'};}
}
module.exports={policy,open};
