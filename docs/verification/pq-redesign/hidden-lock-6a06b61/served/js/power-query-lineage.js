/* Table/partition-focused partial metadata graph. No M evaluation or source reads.
 * Public hook: PowerQueryLineage.render(host, context); see power-query-contract.md.
 * State is weakly owned by the app and replaced when model/metadata identity changes.
 */
(function(g){
  'use strict';
  var sessions=new WeakMap(), MAX_NODES=80, MAX_EDGES=160, PAGE_SIZE=40, FULL_GRAPH_LIMIT=300;
  function session(context){
    var s=sessions.get(context.app);
    if(!s||s.model!==context.app.model||s.metadata!==context.metadata){
      s={model:context.app.model,metadata:context.metadata,roots:new Map(),analysis:new Map(),graph:null};
      // Large inputs use bounded progressive analysis against the complete metadata,
      // preserving duplicate/name ambiguity rather than truncating the resolver input.
      if((context.metadata.nodes||[]).length<=FULL_GRAPH_LIMIT)s.graph=g.PowerQueryDependencies.graph(context.metadata);
      sessions.set(context.app,s);
    }
    return s;
  }
  function view(metadata,rootId,state,s){
    var all=metadata.nodes||[], byId=new Map(), duplicates=new Set();
    all.forEach(function(n){if(byId.has(n.id))duplicates.add(n.id);else byId.set(n.id,n);});
    var nodes=[],edges=[],warnings=(metadata.warnings||[]).slice(),seen=new Set(),todo=[rootId],limited=false;
    if(s.graph)warnings=warnings.concat(s.graph.uncertainty);
    else warnings.push('Large-model mode: only visible upstream nodes are analyzed; cycle findings cover visible edges only.');
    function result(n){
      if(!s.analysis.has(n.id)){
        var row=s.graph&&s.graph.nodes.find(function(r){return r.node===n;});
        if(s.analysis.size>=FULL_GRAPH_LIMIT)s.analysis.delete(s.analysis.keys().next().value);
        s.analysis.set(n.id,row?row.result:g.PowerQueryDependencies.analyze(n,metadata));
      }
      return s.analysis.get(n.id);
    }
    while(todo.length){
      var id=todo.shift();if(seen.has(id))continue;
      if(nodes.length>=MAX_NODES){limited=true;break;}seen.add(id);
      var n=byId.get(id);if(!n){warnings.push('Missing metadata node: '+id);continue;}
      if(duplicates.has(id)){nodes.push({node:n,result:{dependencies:[],uncertainty:['Duplicate identity; code and edges cannot be chosen safely.'],partial:true},ambiguous:true});continue;}
      var r=result(n);nodes.push({node:n,result:r,ambiguous:false});
      if(state.expanded.has(id)){
        var offset=state.pages.get(id)||0;if(r.dependencies.length>PAGE_SIZE)limited=true;
        r.dependencies.slice(offset,offset+PAGE_SIZE).forEach(function(d){
        if(edges.length>=MAX_EDGES){limited=true;return;}
        edges.push({from:id,to:d.id,name:d.name,at:d.at});todo.push(d.id);
        });
      }
    }
    edges=edges.filter(function(e){if(!seen.has(e.to)){limited=true;return false;}return true;});
    var cycles=s.graph?s.graph.cycles:[];
    if(!s.graph){
      var adjacency=new Map();edges.forEach(function(e){if(!adjacency.has(e.from))adjacency.set(e.from,[]);adjacency.get(e.from).push(e.to);});
      function reach(id){var visited=new Set(),queue=[id];while(queue.length){var x=queue.pop();if(visited.has(x))continue;visited.add(x);(adjacency.get(x)||[]).forEach(function(y){queue.push(y);});}return visited;}
      var assigned=new Set();nodes.forEach(function(row){var id=row.node.id;if(assigned.has(id))return;var component=Array.from(reach(id)).filter(function(x){return reach(x).has(id);});component.forEach(function(x){assigned.add(x);});if(component.length>1||(adjacency.get(id)||[]).includes(id))cycles.push(component);});
    }
    if(limited)warnings.push('Display limit reached (40 references per page, 80 nodes / 160 edges). Use reference pages or collapse branches to explore omitted dependencies.');
    return {nodes:nodes,edges:edges,cycles:cycles,warnings:Array.from(new Set(warnings)),limited:limited};
  }
  function render(host,context){
    var doc=host.ownerDocument,previous=sessions.get(context.app);
    if(previous&&(previous.model!==context.app.model||previous.metadata!==context.metadata))sessions.delete(context.app);
    host.onkeydown=null;host.replaceChildren();host.className='pq-lineage';
    function add(tag,text,parent,cls){var e=doc.createElement(tag);e.textContent=text;if(cls)e.className=cls;(parent||host).appendChild(e);return e;}
    add('h3','Upstream query flow');
    add('p','Partial static references, not execution order. Arrows point from a query to what it references.',host,'pq-lineage-note');
    if(!g.PowerQueryDependencies||typeof g.PowerQueryDependencies.graph!=='function'||typeof g.PowerQueryDependencies.analyze!=='function'){add('p','Dependency analysis is unavailable.');return;}
    var rootId=context.partitionId;
    if(!context.table||!rootId){add('p','Choose a table and partition to inspect its upstream flow. Shared code navigation does not change the graph root.');return;}
    var roots=(context.metadata.nodes||[]).filter(function(n){return n.id===rootId;});
    if(roots.length!==1){add('p',roots.length?'Ambiguous duplicate partition identity; a graph root cannot be selected safely.':'The selected partition is missing from this metadata.');return;}
    if(roots[0].kind!=='partition'||roots[0].table!==context.table){add('p','The selected partition does not belong to this table.');return;}
    if(roots[0].state!=='available'){add('p',roots[0].state==='non-m'?'This partition is not M; upstream M flow is unavailable.':'M metadata is missing for this partition.');return;}
    var s=session(context),state=s.roots.get(rootId);
    if(!state){state={expanded:new Set([rootId]),focus:null,scroll:0,pages:new Map()};if(s.roots.size>=12)s.roots.delete(s.roots.keys().next().value);s.roots.set(rootId,state);}
    var data=view(context.metadata,rootId,state,s),buttons=[];
    var tools=add('div','',host,'pq-lineage-tools');
    var reset=add('button','Reset to direct dependencies',tools);reset.type='button';reset.addEventListener('click',function(){state.expanded=new Set([rootId]);state.pages.clear();state.scroll=0;state.focus='reset';render(host,context);});
    add('span',data.nodes.length+' visible nodes · '+data.edges.length+' visible references',tools);
    var list=add('ol','',host,'pq-lineage-graph');list.setAttribute('aria-label','Upstream metadata graph');
    function button(parent,text,key,action){var b=add('button',text,parent);b.type='button';b.dataset.lineageKey=key;buttons.push(b);b.addEventListener('click',function(){state.focus=key;action();});return b;}
    data.nodes.forEach(function(row){
      var n=row.node,card=add('li','',list,'pq-lineage-node');card.dataset.nodeId=n.id;
      if(n.id===rootId)card.classList.add('pq-lineage-root');
      if(context.selected&&context.selected.id===n.id)card.classList.add('pq-lineage-inspected');
      add('h4',(n.table?n.table+' / ':'')+n.name,card);
      add('p',n.kind+' · '+n.classification+' · '+n.state,card,'pq-lineage-note');
      var cycle=data.cycles.find(function(c){return c.includes(n.id);});
      if(cycle)add('p','Cycle group: '+cycle.map(function(id){var match=(context.metadata.nodes||[]).find(function(x){return x.id===id;});return match?match.name:id;}).join(', '),card,'pq-lineage-warning');
      var actions=add('div','',card,'pq-lineage-actions');
      if(!row.ambiguous)button(actions,'Open code','code:'+n.id,function(){context.openCode(n.id);});
      if(row.result.dependencies.length){var isOpen=state.expanded.has(n.id),b=button(actions,(isOpen?'Collapse':'Expand')+' '+row.result.dependencies.length+' references','expand:'+n.id,function(){if(state.expanded.has(n.id))state.expanded.delete(n.id);else {if(state.expanded.size>=MAX_NODES)state.expanded.delete(Array.from(state.expanded).find(function(id){return id!==rootId;}));state.expanded.add(n.id);}render(host,context);});b.setAttribute('aria-expanded',String(isOpen));}
      else add('p','No direct references resolved; upstream dependencies may still exist.',card,'pq-lineage-note');
      if(state.expanded.has(n.id)&&row.result.dependencies.length>PAGE_SIZE){
        var offset=state.pages.get(n.id)||0;
        if(offset>0)button(actions,'Previous references','previous:'+n.id,function(){state.pages.set(n.id,Math.max(0,offset-PAGE_SIZE));state.focus='code:'+n.id;render(host,context);});
        if(offset+PAGE_SIZE<row.result.dependencies.length)button(actions,'Next references','next:'+n.id,function(){if(state.pages.size>=MAX_NODES&&!state.pages.has(n.id))state.pages.delete(state.pages.keys().next().value);state.pages.set(n.id,offset+PAGE_SIZE);state.focus='code:'+n.id;render(host,context);});
        add('p','References '+(offset+1)+'–'+Math.min(offset+PAGE_SIZE,row.result.dependencies.length)+' of '+row.result.dependencies.length,card,'pq-lineage-note');
      }
      var refs=data.edges.filter(function(e){return e.from===n.id;});
      if(refs.length){var links=add('ul','',card,'pq-lineage-edges');refs.forEach(function(e){var li=add('li','',links);button(li,'→ '+e.name,'edge:'+e.from+':'+e.to,function(){var target=buttons.find(function(b){return b.dataset.lineageKey==='code:'+e.to;});if(target)target.focus();});});}
      var details=add('details','',card,'pq-lineage-uncertainty');details.open=row.result.uncertainty.length>1;add('summary','Uncertainty ('+row.result.uncertainty.length+')',details);row.result.uncertainty.slice(0,30).forEach(function(w){add('p',w,details);});if(row.result.uncertainty.length>30)add('p','Additional uncertainty messages omitted.',details);
    });
    if(!data.nodes.length)add('p','The selected partition is missing from this metadata.');
    data.warnings.slice(0,30).forEach(function(w){add('p',w,host,'pq-lineage-warning');});
    if(data.warnings.length>30)add('p','Additional metadata warnings omitted from this view.',host,'pq-lineage-warning');
    list.scrollTop=state.scroll;list.addEventListener('scroll',function(){state.scroll=list.scrollTop;});
    host.onkeydown=function(e){if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||!buttons.includes(doc.activeElement))return;var i=buttons.indexOf(doc.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowDown'?1:-1)));e.preventDefault();buttons[next].focus();};
    if(state.focus){var focused=state.focus==='reset'?reset:buttons.find(function(b){return b.dataset.lineageKey===state.focus;});if(focused)focused.focus({preventScroll:true});state.focus=null;}
  }
  g.PowerQueryLineage={render:render};
})(window);
