const test = require('node:test');
const assert = require('node:assert/strict');
const { createFabricClient, decodeDefinition } = require('../client.cjs');
const { createAuth } = require('../auth.cjs');
const id = '11111111-1111-1111-1111-111111111111';
const definition = { definition: { parts: [{ path: 'definition/model.tmdl', payloadType: 'InlineBase64', payload: Buffer.from('model Model').toString('base64') }] } };
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers});
test('paginates discovery and filters after all pages', async () => {
 const urls=[]; const client=createFabricClient({getAccessToken:async()=> 'secret',fetch:async url=>{urls.push(url);return json(urls.length===1?{value:[{displayName:'A'}],continuationUri:'https://api.fabric.microsoft.com/v1/workspaces?continuationToken=b'}:{value:[{displayName:'Beta'}]});}});
 assert.deepEqual(await client.listWorkspaces({search:'beta'}),[{displayName:'Beta'}]); assert.equal(urls.length,2);
});
test('rejects malicious continuation before sending credentials', async () => {
 let calls=0; const client=createFabricClient({getAccessToken:async()=> 'secret',fetch:async()=>{calls++;return json({value:[],continuationUri:'https://evil.example/steal'});}});
 await assert.rejects(client.listWorkspaces(), {code:'UnsafeUrl'}); assert.equal(calls,1);
});
test('polls LRO and decodes definition', async () => {
 const urls=[]; const tokens=[];
 const client=createFabricClient({getAccessToken:async(...args)=>{tokens.push(args);return 'secret';},wait:async()=>{},fetch:async url=>{urls.push(url);if(urls.length===1)return new Response(null,{status:202,headers:{'x-ms-operation-id':id}});return json(url.endsWith('/result')?definition:{status:'Succeeded'});}});
 assert.equal((await client.getModelDefinition(id,id,{transport:'rest'})).parts[0].content,'model Model');
 assert.equal(urls.length,3); assert.ok(tokens.every(t=>t[1]==='definition'));
});
test('read-only XMLA default does not request REST readwrite scope', async()=>{
 const fetched=[];const client=createFabricClient({getAccessToken:async audience=>{assert.equal(audience,'https://analysis.windows.net/powerbi/api');return 'token';},fetch:async url=>{fetched.push(url);return json({},403);},xmlaReader:async()=>({transport:'xmla',parts:[]})});
 assert.equal((await client.getModelDefinition(id,id)).transport,'xmla');assert.deepEqual(fetched,[`https://api.powerbi.com/v1.0/myorg/groups/${id}`]);
});
test('never falls back on expired login or hides XMLA errors',async()=>{
 const client=createFabricClient({getAccessToken:async()=> 'token',fetch:async()=>json({},401),xmlaReader:async()=>{throw Error('unavailable');}});
 await assert.rejects(client.getModelDefinition(id,id,{transport:'rest'}),{status:401}); await assert.rejects(client.getModelDefinition(id,id),/unavailable/);
});
test('definition rejects traversal, duplicates and unsupported payloads',()=>{
 for(const part of [{path:'../secret',payloadType:'InlineBase64',payload:''},{path:'model.bim',payloadType:'External',payload:''}])assert.throws(()=>decodeDefinition({definition:{parts:[part]}}),{code:'InvalidDefinition'});
 assert.throws(()=>decodeDefinition({definition:{parts:[...definition.definition.parts,...definition.definition.parts]}}),{code:'InvalidDefinition'});
});
test('unconfigured login has actionable maintainer message',async()=>{
 const auth=createAuth({openBrowser:async()=>{}});assert.deepEqual(await auth.status(),{configured:false,account:null}); await assert.rejects(auth.signIn(),{code:'NotConfigured'});
});

test('suspended capacity stops metadata retrieval with an actionable error',async()=>{
 let opened=false;const urls=[];
 const client=createFabricClient({getAccessToken:async()=> 'token',fetch:async url=>{urls.push(url);return json(url.endsWith('/capacities')?{value:[{id:'capacity',state:'Suspended'}]}:{capacityId:'capacity'});},xmlaReader:async()=>{opened=true;}});
 await assert.rejects(client.getModelDefinition(id,id,{transport:'xmla'}),{code:'CapacitySuspended'});
 assert.equal(opened,false);assert.equal(urls.length,2);
});
test('capacity diagnostics do not require extra permissions or block an active XMLA connection',async()=>{
 for (const response of [json({},403),json({value:[{id:'capacity',state:'Active'}]})]) {
  let tokenRequests=0;const client=createFabricClient({getAccessToken:async()=>{tokenRequests++;return 'token';},fetch:async url=>url.endsWith('/capacities')?response:json({capacityId:'capacity'}),xmlaReader:async()=>({transport:'xmla',parts:[]})});
  assert.equal((await client.getModelDefinition(id,id,{transport:'xmla'})).transport,'xmla');assert.equal(tokenRequests,1);
 }
});
