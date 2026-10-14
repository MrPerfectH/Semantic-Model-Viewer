'use strict';
const {createService}=require('./service.cjs');
const service=createService();
function request(payload){
 if(!payload||typeof payload!=='object')throw new Error('Invalid rename request.');
 const {root,modelPath}=payload;
 switch(payload.action){
 case 'objects':return service.objects(root,modelPath);
 case 'preview':return service.preview(root,modelPath,payload.rename);
 case 'apply':return service.apply(payload.token);
 case 'cancel':return service.cancel(payload.token);
 case 'recover':return service.recover(root);
 default:throw new Error('Invalid rename action.');
 }
}
module.exports={request,service};
if(require.main===module){
 const rl=require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity});
 rl.on('line',line=>{
  let id;
  try{if(Buffer.byteLength(line)>16384)throw new Error('Rename request is too large.');const message=JSON.parse(line);id=message.id;const result=request(message.payload);process.stdout.write(JSON.stringify({id,result})+'\n');}
  catch(error){process.stdout.write(JSON.stringify({id,error:error.message})+'\n');}
 });
 rl.on('close',()=>{service.dispose();process.exit(0);});
}
