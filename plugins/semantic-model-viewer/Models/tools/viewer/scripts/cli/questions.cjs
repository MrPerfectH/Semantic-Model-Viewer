'use strict';
const query=require('./query.cjs');
function build(source,options={}){
  if(!options.table||!options.table.trim())throw new Error('show requires --table <name>');
  if(options.with&&options.dependents)throw new Error('--with is a table relationship diagram; use a separate --dependents view');
  if(options.with&&options.direction)throw new Error('--with finds a relationship connection; omit --direction');
  const loaded=query.load(source,options.table),table=loaded.table.name,canonical=loaded.source;
  const relations=query.focused(canonical,table,'relations',{...options,loaded}),dependents=query.focused(canonical,table,'dependents',{...options,loaded});
  const views=[],warnings=[],direction=options.direction||'both',depth=options.direct?1:100;
  let answer;
  if(options.with){
    const pair=query.between(canonical,table,options.with,{...options,loaded});
    answer=pair.connected?(pair.filtersOther&&pair.filteredByOther?`${table} and ${pair.other} filter each other.`:pair.filtersOther?`${table} filters ${pair.other}.`:pair.filteredByOther?`${pair.other} filters ${table}.`:`${table} and ${pair.other} are connected, but neither filters the other along a complete directed path.`):`No ${options.includeInactive?'':'active '}${options.direct?'direct ':''}relationship connection between ${table} and ${pair.other}.`;
    if(options.includeInactive)answer='Potential paths including inactive relationships: '+answer;
    views.push({key:'between',label:`${table} ↔ ${pair.other}`,answer,evidence:pair,view:{version:2,mode:'graph',tables:pair.tables,focus:{kind:'table',name:table},paths:{direction:'connected',includeInactive:!!options.includeInactive,depth},arrange:true,banner:false,callouts:[{object:{kind:'table',name:table},text:answer.slice(0,240)}]}});
  }else{
    const graph=options.related||(!options.dependents),measures=options.dependents||(!options.related&&!options.out);
    if(graph){
      const incoming=relations.tables.filter(t=>t.filtersRoot).length,outgoing=relations.tables.filter(t=>t.filteredByRoot).length;
      const prefix=options.includeInactive?'Potential filter paths including inactive relationships':'Active filter paths';
      answer=direction==='incoming'?`${incoming} table${incoming===1?'':'s'} filter ${table}.`:direction==='outgoing'?`${table} filters ${outgoing} table${outgoing===1?'':'s'}.`:`${incoming} table${incoming===1?'':'s'} filter ${table}; ${table} filters ${outgoing} table${outgoing===1?'':'s'}.`;
      answer=prefix+': '+answer;
      views.push({key:'relations',label:direction==='incoming'?`What filters ${table}?`:direction==='outgoing'?`What does ${table} filter?`:`${table} · Filter paths`,answer,view:{version:2,mode:'graph',tables:{[direction==='incoming'?'filters':direction==='outgoing'?'filteredBy':'relatedTo']:table,...(options.direct?{depth:1}:{}),includeInactive:!!options.includeInactive},focus:{kind:'table',name:table},paths:{direction,includeInactive:!!options.includeInactive,depth},arrange:true,banner:false,callouts:[{object:{kind:'table',name:table},text:answer.slice(0,240)}]}});
    }
    if(measures){
      if(!dependents.counts.total)warnings.push(`No calculations statically reference ${table}; its calculation diagram contains only the table. Relationship propagation is not simulated.`);
      views.push({key:'dependents',label:`Calculations depending on ${table}`,answer:`${dependents.counts.total} calculations reference ${table}: ${dependents.counts.direct} directly and ${dependents.counts.indirect} through other calculations.`,view:{version:2,mode:'measures',focus:{kind:'table',name:table},banner:false}});
    }
  }
  for(const item of views){item.view.caption=item.answer+(item.view.mode==='graph'?' Arrows show model filter flow. Dashed relationships are inactive.':' Links show formula references; values are not evaluated.');delete item.view.callouts;if(options.out&&require('node:path').extname(options.out).toLowerCase()==='.png')item.view.chrome=false;}
  return {source:canonical,table,views,warnings,counts:{relations:relations.counts,dependents:dependents.counts},legend:'Relationship arrows follow model filter flow; exploring both directions does not change the model. Calculation links show static DAX references, not evaluated results.'};
}
module.exports={build};
