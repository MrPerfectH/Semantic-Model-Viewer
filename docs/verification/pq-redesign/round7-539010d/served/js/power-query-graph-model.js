/* Whole-model, read-only Power Query inventory. Requires PowerQueryDependencies.
 * No source loading, M evaluation, geometry, shell state, or retained model cache.
 * Legacy consumer -> input dependencies become inputId -> consumerId here only.
 */
(function(g){
  'use strict';
  function build(model,options){
    options=options||{};
    var generation=options.generation===undefined?null:options.generation;
    var capturedMetadata=model&&model.powerQuery,metadata=capturedMetadata||{nodes:[]},source=metadata.nodes||[];
    function checkpoint(){
      if((model&&model.powerQuery)!==capturedMetadata||(options.signal&&options.signal.aborted)||(options.isCurrent&&!options.isCurrent(generation,model,capturedMetadata))){var error=new Error('Power Query graph build cancelled or superseded.');error.name='AbortError';throw error;}
    }
    checkpoint();
    if(!g.PowerQueryDependencies)throw new Error('PowerQueryDependencies must be loaded before building the graph.');
    var nodes=[],edges=[],issues=[],counts=new Map(),partitions=new Map(),used=new Set(),byId=new Map();
    source.forEach(function(n){checkpoint();counts.set(n.id,(counts.get(n.id)||0)+1);used.add(n.id);if(n.kind==='partition')partitions.set(n.table,(partitions.get(n.table)||0)+1);});
    function fresh(parts){var id=JSON.stringify(parts),suffix=0;while(used.has(id))id=JSON.stringify(parts.concat(++suffix));used.add(id);return id;}
    var occurrences=new Map();
    source.forEach(function(n){
      checkpoint();
      var duplicate=counts.get(n.id)>1,index=occurrences.get(n.id)||0;occurrences.set(n.id,index+1);
      var id=duplicate?fresh(['metadata-occurrence',n.id,index]):n.id;
      var partition=n.kind==='partition',kind=partition?'partition':(['query','parameter','function'].includes(n.classification)?n.classification:'expression');
      nodes.push({id:id,metadataId:n.id,label:partition?(partitions.get(n.table)>1?n.table+' / '+n.name:n.table):n.name,
        subtitle:partition?n.type+' · '+n.name:kind,kind:kind,table:partition?n.table:null,partition:partition?n.name:null,state:n.state});
      if(duplicate)issues.push({consumerId:id,kind:'duplicate-identity',message:'Duplicate metadata identity; navigation and dependency edges are ambiguous.'});
      else byId.set(n.id,id);
    });
    var seenTables=new Set();
    (model&&model.tables||[]).forEach(function(t){
      checkpoint();
      if(partitions.has(t.name)||seenTables.has(t.name))return;seenTables.add(t.name);
      nodes.push({id:fresh(['table-status',t.name]),metadataId:null,label:t.name,subtitle:'No partition metadata',kind:'table-status',table:t.name,partition:null,state:'no-partitions'});
    });
    // Analyze every metadata row, including disconnected and unavailable objects.
    // Keep uncertainty opaque; no string matching to invent semantic classifications.
    var notice=null;
    function progress(analyzed,complete){checkpoint();if(options.onProgress)options.onProgress({analyzed:analyzed,total:source.length,complete:complete,generation:generation});checkpoint();}
    progress(0,false);
    source.forEach(function(n,index){
      checkpoint();
      var consumerId=nodes[index].id,result=g.PowerQueryDependencies.analyze(n,metadata);
      var warnings=result.uncertainty||[];
      // The analyzer's final entry is its documented generic static-analysis notice.
      if(warnings.length){notice=warnings[warnings.length-1];warnings.slice(0,-1).forEach(function(message){issues.push({consumerId:consumerId,kind:'analysis-uncertainty',message:message});});}
      if(counts.get(n.id)!==1){progress(index+1,false);return;}
      var refs=new Map();(result.references||[]).forEach(function(r){if(!refs.has(r.id))refs.set(r.id,[]);refs.get(r.id).push({id:r.id,name:r.name,at:r.at,end:r.end});});
      result.dependencies.forEach(function(d){
        var inputId=byId.get(d.id),locations=refs.get(d.id)||[];
        if(!locations.length){issues.push({consumerId:consumerId,kind:'no-reference-range',message:'Legacy dependency has no explicit identifier occurrence; no navigable edge was emitted.'});return;}
        if(inputId===undefined)return;
        edges.push({id:JSON.stringify(['reference',inputId,consumerId]),inputId:inputId,consumerId:consumerId,referenceOccurrences:locations});
      });
      progress(index+1,false);
    });
    if(notice)issues.push({consumerId:null,kind:'analysis-notice',message:notice});
    (metadata.warnings||[]).forEach(function(message){issues.push({consumerId:null,kind:'metadata-warning',message:message});});
    if(!model||!model.powerQuery)issues.push({consumerId:null,kind:'metadata-unavailable',message:'Power Query metadata is unavailable; table status does not prove absence of partitions or dependencies.'});
    // Iterative Kosaraju: stable cycle components, no recursion or arbitrary cap.
    var outgoing=new Map(),incoming=new Map();nodes.forEach(function(n){outgoing.set(n.id,[]);incoming.set(n.id,[]);});
    edges.forEach(function(e){outgoing.get(e.inputId).push(e.consumerId);incoming.get(e.consumerId).push(e.inputId);});
    var visited=new Set(),order=[];
    nodes.forEach(function(n){
      checkpoint();
      if(visited.has(n.id))return;visited.add(n.id);var stack=[{id:n.id,next:0}];
      while(stack.length){var frame=stack[stack.length-1],adj=outgoing.get(frame.id);if(frame.next<adj.length){var next=adj[frame.next++];if(!visited.has(next)){visited.add(next);stack.push({id:next,next:0});}}else {order.push(frame.id);stack.pop();}}
    });
    visited.clear();
    order.reverse().forEach(function(id){
      checkpoint();
      if(visited.has(id))return;var component=[],todo=[id];visited.add(id);
      while(todo.length){var current=todo.pop();component.push(current);incoming.get(current).forEach(function(next){if(!visited.has(next)){visited.add(next);todo.push(next);}});}
      if(component.length>1||outgoing.get(id).includes(id)){component.sort();component.forEach(function(member){issues.push({consumerId:member,kind:'cycle',message:'Cycle among resolved static references.',componentIds:component.slice()});});}
    });
    progress(source.length,true);
    return {nodes:nodes,edges:edges,issues:issues,generation:generation,analysisProgress:{analyzed:source.length,total:source.length,complete:true,generation:generation}};
  }
  g.PowerQueryGraphModel={version:1,build:build};
})(window);
