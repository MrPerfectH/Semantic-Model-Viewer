'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFabricClient, safeDiagnostics} = require('../client.cjs');
const W = '00000000-0000-0000-0000-000000000001';
const M = '00000000-0000-0000-0000-000000000002';
const C = 'abcdef12-abcd-4abc-8abc-abcdef123456';
const R = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const base = 'https://api.fabric.microsoft.com/v1';
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers});
const definition = {definition:{parts:[{path:'definition/model.tmdl',payloadType:'InlineBase64',payload:Buffer.from('model Model').toString('base64')}]}};
const workspace = () => json({id:W,capacityId:C});
const capacities = (state,extra={}) => json({value:[{id:C.toUpperCase(),state}],...extra});
function setup(responses, extra={}) {
  const calls=[], tokens=[]; let opened=0;
  const client=createFabricClient({getAccessToken:async(...args)=>{tokens.push(args);return 'SECRET';},wait:async()=>{},
    fetch:async(url,opts)=>{calls.push({url,method:opts.method||'GET'});assert.equal(opts.redirect,'error');assert.ok(opts.signal);assert.ok(responses.length, 'unexpected fetch');return responses.shift();},
    xmlaReader:async()=>{opened++;return {transport:'xmla',parts:[],coverage:'consumer'};},...extra});
  return {client,calls,tokens,get opened(){return opened;}};
}
for (const transport of ['rest','xmla',undefined]) test(`inactive capacity stops before ${transport||'default'}`,async()=>{
  const s=setup([workspace(),capacities('Inactive')]);
  await assert.rejects(s.client.getModelDefinition(W,M,{transport}),error=>{
    assert.equal(error.code,'CapacityInactive');assert.match(error.message,/administrator/);
    assert.deepEqual(error.details,{capacityState:'Inactive',capacityObservation:'preflight'});return true;
  });
  assert.equal(s.opened,0);assert.deepEqual(s.calls.map(c=>c.method),['GET','GET']);
  assert.deepEqual(s.tokens.map(t=>t[1]),['capacity-preflight']);
});
for (const transport of ['rest','xmla']) test(`active capacity permits ${transport}`,async()=>{
  const s=setup([workspace(),capacities('Active'),...(transport==='rest'?[json(definition)]:[])]);
  const result=await s.client.getModelDefinition(W,M,{transport});assert.equal(result.transport,transport);
  assert.equal(s.opened,transport==='xmla'?1:0);
  assert.equal(s.calls.length,transport==='rest'?3:2);
});
for (const status of [401,403,404,429,500]) test(`capacity visibility ${status} does not block retrieval or retry`,async()=>{
  const s=setup([workspace(),json({errorCode:'SECRET'},status),json(definition)]);
  assert.equal((await s.client.getModelDefinition(W,M,{transport:'rest'})).transport,'rest');
  assert.equal(s.calls.length,3);
});
for (const state of [undefined,null,{},[],1,'Inactive-ish','Suspended']) test(`unknown/malformed state ${JSON.stringify(state)} proceeds`,async()=>{
  const s=setup([workspace(),capacities(state),json(definition)]);
  assert.equal((await s.client.getModelDefinition(W,M,{transport:'rest'})).transport,'rest');
});
for (const body of [{},{id:W},{id:M,capacityId:C},{id:W,capacityId:'bad'},{id:W,capacityId:[]}]) test(`workspace exact identity required ${JSON.stringify(body)}`,async()=>{
  const s=setup([json(body),json(definition)]);await s.client.getModelDefinition(W,M,{transport:'rest'});assert.equal(s.calls.length,2);
});
test('paginated exact matching and conflicts across pages',async()=>{
  for (const state of ['Inactive','Active']) {
    const s=setup([workspace(),capacities('Inactive',{continuationToken:'two+'}),capacities(state),...(state==='Active'?[json(definition)]:[])]);
    if(state==='Inactive')await assert.rejects(s.client.getModelDefinition(W,M,{transport:'rest'}),{code:'CapacityInactive'});
    else assert.equal((await s.client.getModelDefinition(W,M,{transport:'rest'})).transport,'rest');
    assert.equal(s.calls[2].url,base+'/capacities?continuationToken=two%2B');
  }
});
for (const link of ['https://evil.invalid/SECRET',base+'/capacities/../workspaces',base+'/capacities#secret',base+'/capacities?other=secret',base+'/capacities?continuationToken=a&continuationToken=b',base.replace('.com/','.com:443/')+'/capacities',base+'/capacities\n',base+'/capacities',{},[]]) test(`unsafe continuation ${JSON.stringify(link)} is never fetched`,async()=>{
  const s=setup([workspace(),capacities('Inactive',{continuationUri:link}),json(definition)]);
  assert.equal((await s.client.getModelDefinition(W,M,{transport:'rest'})).transport,'rest');assert.equal(s.calls.length,3);assert.equal(s.calls[2].method,'POST');
});
test('pagination limit and missing capacity remain Unknown',async()=>{
  for (const pages of [Array.from({length:5},(_,i)=>capacities('Inactive',{continuationToken:String(i)})),[json({value:[{id:M,state:'Inactive'}]})]]) {
    const s=setup([workspace(),...pages,json(definition)]);await s.client.getModelDefinition(W,M,{transport:'rest'});assert.equal(s.calls.length,pages.length+2);
  }
});
test('preflight timeout/unavailable metadata still attempts retrieval; caller cancellation stops',async()=>{
  let calls=0;const client=createFabricClient({getAccessToken:async()=> 'secret',fetch:async()=>{if(++calls===1)throw new DOMException('SECRET','TimeoutError');return json(definition);}});
  assert.equal((await client.getModelDefinition(W,M,{transport:'rest'})).transport,'rest');assert.equal(calls,2);
  const abort=new AbortController();abort.abort();await assert.rejects(client.getModelDefinition(W,M,{transport:'rest',signal:abort.signal}),{name:'AbortError'});assert.equal(calls,2);
});
for (const error of [{errorCode:'UnknownError',isRetriable:false,requestId:R,message:'SECRET',modelId:M},{errorCode:'SECRET'.repeat(1000),isRetriable:'false',requestId:'bad'},{errorCode:[],isRetriable:0,RequestId:R.toUpperCase()},null,[],'SECRET']) test(`terminal details sanitized ${Array.isArray(error)?'array':typeof error} ${typeof error?.errorCode}`,async()=>{
  const s=setup([workspace(),capacities('Active'),new Response(null,{status:202,headers:{'x-ms-operation-id':R,Location:'https://evil.invalid'}}),json({status:'Failed',error},200,{RequestId:R})]);
  await assert.rejects(s.client.getModelDefinition(W,M,{transport:'rest'}),failure=>{
    assert.equal(failure.code,'OperationFailed');assert.equal(failure.details.capacityState,'Active');assert.equal(failure.details.capacityObservation,'preflight');assert.equal(failure.details.responseRequestId,R);
    assert.match(failure.message,/Capacity observed during preflight: Active/);
    if(error?.isRetriable===false){assert.equal(failure.details.isRetriable,false);assert.equal(failure.details.errorCode,'UnknownError');assert.match(failure.message,/UnknownError/);assert.match(failure.message,/Retriable: false/);}
    else assert.equal('isRetriable' in failure.details,false);
    for(const secret of ['SECRET',W,M,C,'https://'])assert.ok(!JSON.stringify({message:failure.message,details:failure.details}).includes(secret));return true;
  });
  assert.equal(s.calls[3].url,base+'/operations/'+R);assert.equal(s.calls.length,4);assert.equal(s.opened,0);
});
test('request IDs must be strict UUIDs and details have fixed keys',()=>{
  for(const requestId of [null,[],{},true,1,'bad',R+'\n','{'+R+'}'])assert.deepEqual(safeDiagnostics({requestId,responseRequestId:requestId,isRetriable:1,capacityState:{},message:'SECRET'}),{});
});
test('explicit REST failure cannot be relabeled by XMLA fallback',async()=>{
  const s=setup([json({},403),json({errorCode:'SECRET'},403)]);
  await assert.rejects(s.client.getModelDefinition(W,M,{transport:'rest'}),{code:'Other',status:403});assert.equal(s.opened,0);
});
test('each new open obtains a fresh capacity observation',async()=>{
  const s=setup([workspace(),capacities('Active'),json(definition),workspace(),capacities('Inactive')]);
  await s.client.getModelDefinition(W,M,{transport:'rest'});await assert.rejects(s.client.getModelDefinition(W,M,{transport:'rest'}),{code:'CapacityInactive'});
});
