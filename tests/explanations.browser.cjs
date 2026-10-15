'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {shot,build,prepare,validateFile}=require('../Models/tools/viewer/scripts/cli/explain.cjs');
const {browserPath}=require('../Models/tools/viewer/scripts/cli/capture.cjs');
let browser;try{browser=browserPath();}catch(e){if(process.env.CI)throw e;}
const model=path.resolve(__dirname,'../Models/demo/Contoso Retail.SemanticModel');
test('real viewer captures are repeatable and all explanation surfaces render',{skip:!browser,timeout:180000},async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smv-explanation-tests-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const initial={version:1,mode:'graph',tables:['Sales','Date'],chrome:false,highlights:[{kind:'column',table:'Sales',name:'Net Amount'}],callouts:[{object:{kind:'table',name:'Date'},text:'Date context'}]};
  const a=await shot(model,initial,path.join(temp,'a.png'));
  await shot(model,initial,path.join(temp,'b.png'));
  assert.deepEqual(fs.readFileSync(path.join(temp,'a.png')),fs.readFileSync(path.join(temp,'b.png')),'identical images in this browser environment');assert.equal(a.objects.length,2);
  const parsed=prepare(model,{version:1}).model;
  const rel=parsed.relationships.find(r=>r.from==='Sales'&&r.to==='Date');
  for(const [name,view] of [
    ['relationship',{version:1,tables:['Sales','Date'],highlights:[{kind:'relationship',name:rel.name}]}],
    ['measure',{version:1,mode:'measures',focus:{kind:'measure',table:'Measures',name:'Sales LY'},highlights:[{kind:'measure',table:'Measures',name:'Total Sales'}]}],
    ['matrix',{version:1,mode:'matrix',focus:{kind:'table',name:'Sales'}}],
    ['clusters',{version:1,mode:'clusters',tables:['Sales','Date'],highlights:[{kind:'table',name:'Sales'}]}],
    ['proposal',{version:1,tables:['Sales','Date'],proposals:[{kind:'relationship',from:{kind:'column',table:'Sales',name:'Order Date'},to:{kind:'column',table:'Date',name:'Date'},text:'Illustrative alternate relationship'}]}]
  ])await t.test(name,async()=>{await shot(model,view,path.join(temp,name+'.png'));assert.ok(fs.statSync(path.join(temp,name+'.png')).size>10000);await shot(model,view,path.join(temp,name+'-repeat.png'));assert.deepEqual(fs.readFileSync(path.join(temp,name+'.png')),fs.readFileSync(path.join(temp,name+'-repeat.png')),name+' repeats identically');});
  await t.test('offscreen matrix focus and general concept annotations',async()=>{
    const dimensions=Array.from({length:35},(_,i)=>({name:'Dimension '+String(i).padStart(2,'0'),columns:[{name:'ID',dataType:'int64'}]}));
    const file=path.join(temp,'large.bim');fs.writeFileSync(file,JSON.stringify({name:'Large',model:{tables:[{name:'Fact',columns:[{name:'ID',dataType:'int64'}]},...dimensions],relationships:dimensions.map((d,i)=>({name:'R'+i,fromTable:'Fact',fromColumn:'ID',toTable:d.name,toColumn:'ID'}))}}));
    await shot(file,{version:1,mode:'matrix',focus:{kind:'table',name:'Dimension 34'}},path.join(temp,'offscreen.png'));
    await shot(model,{version:1,tables:['Sales','Date'],proposals:[{kind:'arrow',from:{kind:'table',name:'Date'},to:{kind:'table',name:'Sales'},text:'Discuss this direction'},{kind:'group',objects:[{kind:'table',name:'Date'},{kind:'table',name:'Sales'}],text:'A conceptual group'}]},path.join(temp,'concepts.png'));
  });
  const pq=parsed.powerQuery.nodes.find(n=>n.table==='Sales');
  await t.test('Power Query',async()=>{await shot(model,{version:1,mode:'power-query',focus:{kind:'query',name:pq.id}},path.join(temp,'query.png'));});
  await t.test('walkthrough with imported numbers and calculations',async()=>{
    const start=Date.now();const out=await build(path.join(__dirname,'../examples/explanations/sales-walkthrough.json'),path.join(temp,'walkthrough'));
    const manifest=JSON.parse(fs.readFileSync(out.manifest));assert.equal(manifest.renderer.sha256.length,64);assert.equal(manifest.steps.length,4);assert.equal(validateFile(path.join(out.directory,'source.json')).valid,true);assert.equal(manifest.calculations.gap.value,'-15.05');assert.match(fs.readFileSync(out.html,'utf8'),/Illustrative values/);assert.ok(Date.now()-start<60000);
  });
  await t.test('failed build does not publish partial output',async()=>{
    const file=path.join(temp,'bad.json');fs.writeFileSync(file,JSON.stringify({version:1,title:'Bad',model,steps:[{id:'one',caption:'Invalid',view:{version:1,highlights:[{kind:'table',name:'missing'}]}}]}));
    await assert.rejects(build(file,path.join(temp,'bad-output')),/unknown/);assert.ok(!fs.existsSync(path.join(temp,'bad-output')));
  });
});
