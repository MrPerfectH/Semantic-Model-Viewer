'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function error(code,message){return Object.assign(new Error(message),{code});}
function validateToken(value){if(typeof value!=='string'||!value.trim()||value.trim().length>32768||/\s/.test(value.trim()))throw error('AUTH_INVALID','Expected one bearer token on stdin. The token is never saved.');return value.trim();}
async function token(options={},deps={}){
  if(options.tokenStdin){let text='';for await(const part of deps.stdin||process.stdin){text+=part;if(text.length>32768)throw error('AUTH_INVALID','Token input is too large');}return validateToken(text);}
  const tenant=options.tenant||process.env.FABRIC_TENANT;
  if(tenant&&!UUID.test(tenant))throw error('AUTH_INVALID','--tenant / FABRIC_TENANT must be a tenant UUID');
  const args=['account','get-access-token','--resource','https://api.fabric.microsoft.com','--output','json','--only-show-errors',...(tenant?['--tenant',tenant]:[])];
  try{
    // Windows ships az as a cmd shim. Only fixed arguments and a validated UUID
    // enter this command; bearer tokens are read from stdout, never argv.
    const windows=(deps.platform||process.platform)==='win32';
    const result=await (deps.exec||exec)(windows?'cmd.exe':'az',windows?['/d','/s','/c','az '+args.join(' ')]:args,{encoding:'utf8',timeout:30000,maxBuffer:128*1024,windowsHide:true});
    let data;try{data=JSON.parse(result.stdout);}catch{throw error('AUTH_INVALID','Azure CLI returned an invalid token response');}
    return validateToken(data.accessToken);
  }catch(e){if(e.code==='AUTH_INVALID')throw e;throw error('AUTH_REQUIRED',e.code==='ENOENT'?'Workspace fetching requires Azure CLI and an existing az login, or --token-stdin. Local viewing needs neither.':'Azure CLI could not obtain a Fabric token. Sign in with az login for the intended tenant, then retry. Local viewing still works.');}
}
module.exports={token,UUID};
