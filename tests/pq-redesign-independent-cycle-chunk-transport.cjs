// Lossless T3 evaluate transport for the unchanged frozen cycle-hit scenario.
// T3 has a 64 KB result limit. This wrapper transports exactly the original
// evaluated value as JSON chunks; it does not alter scenario/oracle inputs.
module.exports=function chunkTransport(tools){
 const unwrap=r=>{if(r.isError)throw Error(JSON.stringify(r));return r.structuredContent||JSON.parse(r.content.find(x=>x.type==='text').text)};
 return new Proxy(tools,{get(target,key){if(key!=='mcp__t3_code__preview_evaluate')return target[key];return async args=>{
  const start=unwrap(await target[key]({...args,expression:`(async()=>{const value=await (0,eval)(${JSON.stringify(args.expression)});window.__independentTransfer=JSON.stringify({value});return {length:__independentTransfer.length}})()`,awaitPromise:true}));
  let s='';for(let i=0;i<start.value.length;i+=12000){const part=unwrap(await target[key]({tabId:args.tabId,expression:`__independentTransfer.slice(${i},${i+12000})`}));s+=part.value;}
  return {structuredContent:JSON.parse(s),content:[]};
 }}});
};
