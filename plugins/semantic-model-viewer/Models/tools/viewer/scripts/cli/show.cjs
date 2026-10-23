'use strict';
const crypto=require('node:crypto');
const query=require('./query.cjs'),session=require('./session.cjs');
async function show(source,options){
  if(!options.table)throw new Error('show requires --table <name>');
  const loaded=query.load(source,options.table),{table,source:canonical}=loaded,id=crypto.createHash('sha256').update(table.name).digest('hex').slice(0,12);
  const includeRelations=options.related||!options.dependents,includeDependents=options.dependents||!options.related;
  const relations=query.focused(canonical,table.name,'relations',{...options,loaded}),dependents=query.focused(canonical,table.name,'dependents',{...options,loaded});
  const state=await session.serve(canonical,{background:true,reuseNamed:true,session:options.session,newSession:options.newSession,watch:options.watch});
  if(state.protocolVersion!==2)throw new Error('This session uses an older runtime without named views. Stop it or omit --session and use --new-session');
  const views=[];
  if(includeRelations)views.push({id:'relations-'+id,label:table.name+' · Tables',view:{version:2,mode:'graph',tables:{[options.direction==='incoming'?'filters':options.direction==='outgoing'?'filteredBy':'relatedTo']:table.name,...(options.direct?{depth:1}:{}),includeInactive:!!options.includeInactive},focus:{kind:'table',name:table.name},arrange:true,banner:false}});
  if(includeDependents)views.push({id:'dependents-'+id,label:table.name+' · Measures',view:{version:2,mode:'measures',focus:{kind:'table',name:table.name},banner:false}});
  const result=await session.request(state.sessionFile,'views',{views});
  return {source:canonical,table:table.name,sessionId:state.sessionId,sessionFile:state.sessionFile,reused:!!state.reused,pluginVersion:state.pluginVersion,warnings:state.warnings||[],
    counts:{relations:relations.counts,dependents:dependents.counts},workspaceUrl:result.workspaceUrl,
    views:result.views.map(v=>({id:v.id,label:v.label,url:v.url,revision:v.revision,summary:v.summary,application:v.application})),
    note:'URLs use one model session with independent named views. Counts come from local metadata; browser application requires a fresh acknowledgement.'};
}
module.exports={show};
