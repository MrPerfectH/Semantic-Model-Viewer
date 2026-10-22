'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const graph=require('../Models/tools/viewer/js/relationships.js');
const cli=path.resolve(__dirname,'../bin/smv.cjs');
test('both filter directions are a union of directed paths, not an undirected walk',()=>{
  const model={tables:['Root','Up','Down','Sibling','Leaf'].map(name=>({name})),relationships:[
    {from:'Root',to:'Up'},{from:'Down',to:'Root'},{from:'Sibling',to:'Up'},{from:'Leaf',to:'Down'}]};
  const result=graph.traverse(model,['Root'],{direction:'both'});
  assert.deepEqual([...result.names].sort(),['Down','Leaf','Root','Up']);
  assert.equal(result.names.has('Sibling'),false);
  assert.deepEqual(graph.pathTo(result,'Leaf').map(s=>s.to),['Down','Leaf']);
  assert.deepEqual([...graph.traverse(model,['Root'],{direction:'both',maxDepth:1}).names].sort(),['Down','Root','Up']);
});
test('every CLI subcommand provides help before attempting I/O',()=>{
  for(const args of [['inspect'],['filters-by'],['discover'],['snapshot'],['serve'],['open'],['shot'],['results','import'],['explain','validate'],['explain','build'],...['status','selection','stop','update','export'].map(c=>['session',c])]){
    const r=spawnSync(process.execPath,[cli,...args,'--help'],{encoding:'utf8'});
    assert.equal(r.status,0,JSON.stringify(args)+' '+r.stderr);assert.match(r.stdout,/Usage:/);assert.match(r.stdout,/smv /);
  }
});
test('argument errors identify the missing model and how to obtain help',()=>{
  const r=spawnSync(process.execPath,[cli,'inspect','--table','Date'],{encoding:'utf8'});
  assert.equal(r.status,1);const error=JSON.parse(r.stderr).error;
  assert.match(error.message,/Missing model/);assert.match(error.details.usage,/inspect/);assert.equal(error.details.help,'smv inspect --help');
});
