'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const session=require('./session.cjs'),questions=require('./questions.cjs');
async function show(source,options,providedPlan){
  const opener=require('./opener.cjs');opener.policy(options);
  const provenance=require('./provenance.cjs');
  const plan=providedPlan||questions.build(source,options);
  if(options.out){
    if(plan.views.length!==1)throw new Error('--out exports one diagram: choose --related, --dependents or --with <table>');
    const target=path.resolve(options.out),ext=path.extname(target).toLowerCase();
    if(!['.html','.png'].includes(ext))throw new Error('Diagram output must use .html or .png');
    provenance.reserveOutput(target,options.force);
    const item=plan.views[0],api=require('./explain.cjs');
    const prepared=api.prepare(source,item.view);
    if(plan.modelHash&&plan.modelHash!==prepared.hash)throw Object.assign(new Error('Source changed while planning the comparison; retry with stable files'),{code:'SOURCE_CHANGED'});
    const {receipt,receiptPath}=await provenance.publish(source,prepared,target,options,async candidate=>{if(ext==='.png')await require('./capture.cjs').capture(prepared.html,candidate,prepared.view,options);else fs.writeFileSync(candidate,prepared.html,{flag:'wx'});});
    process.stderr.write(ext==='.png'?'smv show: exported a static image; no server was started. Omit --out for the live interactive viewer.\n':'smv show: exported a standalone interactive HTML snapshot; no server was started. Omit --out for the live viewer.\n');
    const opening=await opener.open(target,options);
    return {...(plan.analysis?{analysis:plan.analysis}:{}),receipt,receiptPath,opening,source:plan.source,table:plan.table,question:item.label,answer:item.answer,diagram:prepared.summary,legend:plan.legend,counts:plan.counts,warnings:plan.warnings,artifact:{path:target,format:ext.slice(1),bytes:fs.statSync(target).size,contents:ext==='.html'?'Interactive viewer containing full-model metadata and DAX; the starting diagram is focused.':'Image of the focused diagram.'},...(item.evidence?{evidence:item.evidence}: {})};
  }
  let state=await session.serve(plan.source,{background:true,reuseNamed:true,session:options.session,newSession:options.newSession,watch:options.watch});
  if(!require('./managed.cjs').compatible(state)){
    if(options.session)throw new Error('The selected session runs a different plugin version or engine/runtime identity. Omit --session and use --new-session for question diagrams.');
    const previous=state;
    state=await session.serve(plan.source,{background:true,reuseNamed:true,newSession:true,watch:options.watch});
    state.warnings=[...(state.warnings||[]),`Started a current viewer for question diagrams; the existing ${previous.pluginVersion} session was left running.`];
  }
  if(state.protocolVersion!==2)throw new Error('This session uses an older runtime without named views. Stop it or omit --session and use --new-session');
  const views=plan.views.map(item=>({...item,id:item.key+'-'+crypto.createHash('sha256').update(JSON.stringify([plan.identity||plan.table,options.with||null,options.direction||'both',!!options.direct,!!options.includeInactive])).digest('hex').slice(0,12)}));
  const result=await session.request(state.sessionFile,'views',{views:views.map(({id,label,view})=>({id,label,view}))});
  if(plan.modelHash&&result.views.some(v=>v.sourceRevision!==plan.modelHash))throw Object.assign(new Error('Source changed while planning the comparison; retry with stable files'),{code:'SOURCE_CHANGED'});
  const opening=await opener.open(plan.analysis?result.views[0].url:result.workspaceUrl,options);
  return {...(plan.analysis?{analysis:plan.analysis}:{}),opening,sourceIdentity:result.views[0].sourceIdentity,source:plan.source,table:plan.table,sessionId:state.sessionId,sessionFile:state.sessionFile,reused:!!state.reused,pluginVersion:state.pluginVersion,runtimeIdentity:state.runtimeIdentity,warnings:[...(state.warnings||[]),...plan.warnings],counts:plan.counts,workspaceUrl:result.workspaceUrl,
    views:result.views.map(v=>({id:v.id,label:v.label,answer:views.find(item=>item.id===v.id).answer,url:v.url,revision:v.revision,summary:v.summary,application:v.application})),
    legend:plan.legend,note:'Open workspaceUrl to explore these diagrams. Counts are computed from local metadata; browser application requires a fresh acknowledgement.'};
}
module.exports={show};
