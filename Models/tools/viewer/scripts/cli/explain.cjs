'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {runtime,readModel,snapshot}=require('./model.cjs');
const {validate}=require('../../js/explanation-view.js');
const {capture}=require('./capture.cjs');
const results=require('./results.cjs');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){const error=new Error('Cannot read JSON '+file+': '+e.message);error.code='JSON_INVALID';error.details={file:path.resolve(file)};throw error;}}
function reportUsage(report,model){
  const target=path.resolve(report);if(!target.endsWith('.Report')||!fs.statSync(target).isDirectory())throw new Error('Select one explicit .Report folder');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smv-report-'));
  try{const data=path.join(dir,'model.json'),out=path.join(dir,'usage.json');fs.writeFileSync(data,JSON.stringify(model));
    execFileSync(process.env.SMV_PYTHON||'python3',[path.join(__dirname,'../scan_report_usage.py'),target,'--model-data',data,'--out',out],{timeout:30000,stdio:['ignore','pipe','pipe']});
    const usage=readJSON(out);return {measures:usage.measures,meta:{report:usage.report,model:usage.model,pageCount:usage.pageCount,scanned:usage.scanned}};
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function prepare(source,input,options={}){
  const context=runtime(),{model,app}=readModel(context,source),view=validate(model,input);
  const focus={tables:view.tables || model.tables.map(t=>t.name),measure:view.mode==='measures'&&view.focus&&view.focus.kind==='measure'?view.focus.name:null};
  let html=snapshot(context,app,focus,{usage:options.report?reportUsage(options.report,model):null});
  const interactive=fs.readFileSync(path.join(__dirname,'../../js/interactive-view.js'),'utf8').replace(/<\/script/gi,'<\\/script');
  const adapter=fs.readFileSync(path.join(__dirname,'../../js/explanation-view.js'),'utf8').replace(/<\/script/gi,'<\\/script');
  const json=JSON.stringify(view).replace(/</g,'\\u003c');
  const sourceHash=crypto.createHash('sha256').update(JSON.stringify(context.Snapshots.modelData(model))).digest('hex');
  html=html.replace('</body>',()=>'<script data-smv-explanation-adapter>'+interactive+'\n'+adapter+'</script><script>window.SMV_SOURCE_REVISION='+JSON.stringify(sourceHash)+';SMVExplanation.start('+json+');</script></body>');
  const rendererHash=crypto.createHash('sha256');
  const root=path.resolve(__dirname,'../..');
  [...context.Snapshots.files,'index.html','js/explanation-view.js','js/interactive-view.js','scripts/cli/explain.cjs','scripts/cli/results.cjs','scripts/cli/model.cjs','scripts/cli/capture.cjs'].sort().forEach(file=>rendererHash.update(file).update(fs.readFileSync(path.join(root,file))));
  const renderer={format:'smv-explanation',version:1,sha256:rendererHash.digest('hex')};
  return {html,view,model,renderer,hash:crypto.createHash('sha256').update(JSON.stringify(context.Snapshots.modelData(model))).digest('hex')};
}
async function shot(source,input,output,options={}){
  if(path.extname(output).toLowerCase()!=='.png')throw new Error('Image output must use .png');
  if(fs.existsSync(output)&&!options.force)throw new Error('Output exists; use --force: '+output);
  const p=prepare(source,input,options);fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
  const result=await capture(p.html,output,p.view,options);return {...result,modelHash:p.hash,renderer:p.renderer};
}
function validateExplanation(spec){
  if(!spec || spec.version!==1)throw new Error('Explanation version must be 1');
  if(typeof spec.title!=='string'||!spec.title.trim())throw new Error('Explanation needs a title');
  if(typeof spec.model!=='string')throw new Error('Explanation needs a model path');
  if(!Array.isArray(spec.steps)||!spec.steps.length||spec.steps.length>100)throw new Error('Explanation needs 1 to 100 steps');
  const ids=new Set();spec.steps.forEach((step,i)=>{if(!step||typeof step.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(step.id)||ids.has(step.id))throw new Error('Step '+(i+1)+' needs a unique simple id');ids.add(step.id);if(typeof step.caption!=='string')throw new Error('Step '+step.id+' needs a caption');if([step.view,step.result,step.calculation].filter(x=>x!==undefined).length!==1)throw new Error('Step '+step.id+' needs exactly one view, result, or calculation');});return spec;
}
const css=`*{box-sizing:border-box}body{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #9ca3af;padding:8px}.result-scroll{overflow:auto}.result-scalar{font-size:30px;font-weight:650}.result{padding:16px;border:1px solid #9ca3af;border-radius:8px}.bar-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);gap:12px;margin:12px 0}.bar-track{position:relative;background:linear-gradient(to right,transparent 49.8%,#9ca3af 50%,transparent 50.2%);min-height:24px}.bar-track i{position:absolute;height:100%;background:#4285d4} :root{color-scheme:light dark;font-family:system-ui,sans-serif;color:var(--foreground,#202532);background:transparent}body{max-width:900px;margin:0 auto;padding:0}h1{font-size:28px;line-height:1.2}figure{margin:32px 0}img{width:100%;height:auto;border:1px solid var(--border,#cad0da);border-radius:8px}figcaption{line-height:1.6;margin:12px 0}a{color:inherit}small{color:#687587}pre{white-space:pre-wrap} @media(prefers-color-scheme:dark){:root{color:var(--foreground,#e8eaf0);background:transparent}}`;
async function build(file,output,options={}){
  const spec=validateExplanation(readJSON(file)),base=path.dirname(path.resolve(file)),source=path.resolve(base,spec.model);
  output=path.resolve(output);if(fs.existsSync(output))throw new Error('Explanation output already exists; choose a new directory: '+output);
  // Validate every view before starting the browser or publishing any artifacts.
  const baseline=prepare(source,{version:1});
  const datasets=Object.create(null);
  Object.entries(spec.datasets||{}).forEach(([id,input])=>{datasets[id]=results.load(input,base);});
  const calculations=results.calculate(spec.calculations||{},datasets);
  const prepared=spec.steps.map(s=>{
    if(s.view)return prepare(source,s.view,{report:spec.report?path.resolve(base,spec.report):undefined});
    if(s.result){if(!Object.hasOwn(datasets,s.result))throw new Error('Unknown result '+s.result);return {content:results.render(datasets[s.result],s)};}
    if(!Object.hasOwn(calculations,s.calculation))throw new Error('Unknown calculation '+s.calculation);return {content:results.renderCalculation(calculations[s.calculation])};
  });
  if(prepared.some(p=>p.hash&&p.hash!==baseline.hash))throw new Error('Model changed while preparing the explanation; retry with a stable source');
  fs.mkdirSync(path.dirname(output),{recursive:true});const temp=fs.mkdtempSync(path.join(path.dirname(output),'.smv-explanation-'));
  try{
    fs.mkdirSync(path.join(temp,'images'));fs.mkdirSync(path.join(temp,'views'));
    const steps=[],fragments=[],markdown=['# '+spec.title,''];
    for(let i=0;i<spec.steps.length;i++){
      const step=spec.steps[i],p=prepared[i],image='images/'+step.id+'.png',live='views/'+step.id+'.html';
      if(p.content){
        const data=step.result?datasets[step.result]:calculations[step.calculation];
        steps.push({id:step.id,caption:step.caption,result:step.result,calculation:step.calculation});
        fragments.push('<figure>'+p.content+'<figcaption><strong>'+(i+1)+'.</strong> '+escape(step.caption)+'</figcaption></figure>');
        markdown.push('## '+(i+1)+'. '+step.id,'',step.caption,'','```json',JSON.stringify(data,null,2),'```','');
        continue;
      }
      const info=await capture(p.html,path.join(temp,image),p.view,options);
      fs.writeFileSync(path.join(temp,live),p.html);
      steps.push({id:step.id,caption:step.caption,image,viewArtifact:live,view:p.view,capture:{...info,path:image},modelHash:p.hash});
      const data=fs.readFileSync(path.join(temp,image)).toString('base64');
      fragments.push('<figure><img alt="'+escape(step.caption)+'" src="data:image/png;base64,'+data+'"><figcaption><strong>'+(i+1)+'.</strong> '+escape(step.caption)+'</figcaption><a href="'+live+'">Explore this view offline</a></figure>');
      markdown.push('## '+(i+1)+'. '+step.id,'','![Annotated model view]('+image+')','',step.caption,'','[Explore this view offline]('+live+')','');
    }
    var lastView=prepared.find(p=>p.view)?.view||baseline.view;
    const interactiveSteps=spec.steps.map((step,i)=>{if(prepared[i].view)lastView=prepared[i].view;return {id:step.id,caption:step.caption,view:lastView,evidence:prepared[i].content||null};});
    const start=prepare(source,interactiveSteps[0].view,{report:spec.report?path.resolve(base,spec.report):undefined});
    const interactiveHTML=start.html.replace('SMVExplanation.start(',()=>'window.SMV_STEPS='+JSON.stringify(interactiveSteps).replace(/</g,'\\u003c')+';SMVExplanation.start(');
    fs.writeFileSync(path.join(temp,'interactive.html'),interactiveHTML);
    const manifest={version:1,interactiveArtifact:'interactive.html',renderer:baseline.renderer,title:spec.title,model:{source,hash:baseline.hash},datasets,calculations,steps,summary:spec.summary||''};
    fs.writeFileSync(path.join(temp,'explanation.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(spec.title)+'</title><style>'+css+'</style><body><small>Model explanation</small><h1>'+escape(spec.title)+'</h1>'+fragments.join('')+'<p>'+escape(spec.summary||'')+'</p></body></html>');
    fs.writeFileSync(path.join(temp,'explanation.md'),markdown.concat(spec.summary||'').join('\n'));
    fs.writeFileSync(path.join(temp,'explanation.json'),JSON.stringify(manifest,null,2)+'\n');
    fs.writeFileSync(path.join(temp,'source.json'),JSON.stringify({...spec,model:source,report:spec.report?path.resolve(base,spec.report):undefined,datasets},null,2)+'\n');
    fs.renameSync(temp,output);return {directory:output,interactive:path.join(output,'interactive.html'),html:path.join(output,'explanation.html'),markdown:path.join(output,'explanation.md'),manifest:path.join(output,'explanation.json')};
  }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e;}
}
function validateFile(file){
  const spec=validateExplanation(readJSON(file)),base=path.dirname(path.resolve(file));
  prepare(path.resolve(base,spec.model),{version:1});
  const datasets=Object.create(null);Object.entries(spec.datasets||{}).forEach(([id,input])=>{datasets[id]=results.load(input,base);});
  const calculations=results.calculate(spec.calculations||{},datasets);
  spec.steps.forEach(step=>{if(step.view)prepare(path.resolve(base,spec.model),step.view,{report:spec.report?path.resolve(base,spec.report):undefined});else if(step.result){if(!Object.hasOwn(datasets,step.result))throw new Error('Unknown result '+step.result);results.render(datasets[step.result],step);}else if(!Object.hasOwn(calculations,step.calculation))throw new Error('Unknown calculation '+step.calculation);});
  return {valid:true,steps:spec.steps.length,datasets:Object.keys(datasets),calculations:Object.keys(calculations)};
}
module.exports={validateFile,prepare,shot,build,readJSON,validateExplanation,escape,css};
