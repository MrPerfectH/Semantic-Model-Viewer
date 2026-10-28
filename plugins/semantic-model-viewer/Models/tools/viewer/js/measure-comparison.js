/* Read-only comparison of resolved model references. No DAX execution. */
(function(g){
  'use strict';
  var id=function(kind,table,name){return JSON.stringify([kind,table||'',name]);};
  function index(model){var out=new Map();model.tables.forEach(function(t){(t.measures||[]).forEach(function(m){out.set(m.name,{kind:'measure',table:t.name,name:m.name,dax:String(m.dax||''),measure:m});});});return out;}
  function resolve(model,input){
    var rows=Array.from(index(model).values()),name=typeof input==='string'?input.trim():input&&input.name,table=typeof input==='object'&&input?input.table:null;
    var matches=rows.filter(function(r){if(table)return r.table.toLowerCase()===String(table).toLowerCase()&&r.name.toLowerCase()===String(name).toLowerCase();var qualified="'"+r.table.replace(/'/g,"''")+"'["+r.name.replace(/\]/g,']]')+']';return typeof name==='string'&&[r.name,qualified,r.table+'['+r.name.replace(/\]/g,']]')+']'].some(function(v){return v.toLowerCase()===name.toLowerCase();});});
    if(matches.length!==1)throw new Error((matches.length?'Ambiguous':'Unknown')+' measure: '+String(name));
    return {kind:'measure',table:matches[0].table,name:matches[0].name};
  }
  function analyze(model,left,right,options){
    options=options||{};var roots=[resolve(model,left),resolve(model,right)],lookup=index(model);
    if(roots[0].name===roots[1].name)throw new Error('Choose two different measures to compare');
    var max=options.maxMeasures===undefined?5000:options.maxMeasures;
    if(!Number.isInteger(max)||max<1||max>20000)throw new Error('Comparison maxMeasures must be 1 to 20000');
    function collect(root){
      var objects=new Map(),edges=new Map(),visited=new Set(),pending=[root.name],warnings=[],cycle=false,complete=true;
      function node(kind,table,name){var key=id(kind,table,name);if(!objects.has(key))objects.set(key,{id:key,kind:kind,table:table||undefined,name:name});return key;}
      function link(from,to,kind){var key=JSON.stringify([from,to,kind]);edges.set(key,{id:key,from:from,to:to,kind:kind});}
      for(var cursor=0;cursor<pending.length;cursor++){
        var name=pending[cursor];if(visited.has(name))continue;
        if(visited.size>=max){complete=false;warnings.push('Measure traversal limit reached; absence from this scope is unknown.');break;}
        visited.add(name);var row=lookup.get(name);if(!row){complete=false;warnings.push('Unresolved measure '+name);continue;}
        var m=row.measure,to=node('measure',row.table,name);
        (m._deps||[]).forEach(function(dep){var r=lookup.get(dep);if(!r){complete=false;warnings.push('Unresolved measure '+dep);return;}link(node('measure',r.table,dep),to,'measure-reference');pending.push(dep);});
        (m._tables||[]).forEach(function(t){node('table','',t);link(id('table','',t),to,'table-reference');});
        (m._cols||[]).forEach(function(group){node('table','',group.t);group.cs.forEach(function(c){link(node('column',group.t,c),to,'column-reference');});});
        if((m._unresolved||[]).length){complete=false;warnings.push('Unresolved references in '+name);}
      }
      // Kahn's algorithm detects cycles without recursion on long dependency chains.
      var degree=new Map(),users=new Map();visited.forEach(function(n){degree.set(n,0);users.set(n,[]);});
      visited.forEach(function(n){var row=lookup.get(n);(row?row.measure._deps||[]:[]).forEach(function(d){if(degree.has(d)){degree.set(n,degree.get(n)+1);users.get(d).push(n);}});});
      var q=Array.from(degree.keys()).filter(function(n){return degree.get(n)===0;}),done=0;for(var k=0;k<q.length;k++){done++;users.get(q[k]).forEach(function(n){degree.set(n,degree.get(n)-1);if(!degree.get(n))q.push(n);});}cycle=done<visited.size;
      if(cycle)warnings.push('Circular references detected; expansion keeps residual references.');
      return {objects:objects,edges:edges,measures:visited,complete:complete,cycle:cycle,warnings:warnings};
    }
    var a=collect(roots[0]),b=collect(roots[1]);
    function merged(key){var all=new Map(a[key]);b[key].forEach(function(v,k){all.set(k,v);});return Array.from(all.entries()).map(function(entry){var keyId=entry[0],inA=a[key].has(keyId),inB=b[key].has(keyId);return Object.assign({},entry[1],{membership:inA&&inB?'shared':inA?(b.complete?'left':'unknown'):(a.complete?'right':'unknown')});}).sort(function(x,y){return x.id.localeCompare(y.id);});}
    var objects=merged('objects'),edges=merged('edges'),counts={shared:0,left:0,right:0,unknown:0};objects.filter(function(o){return o.kind==='measure';}).forEach(function(o){counts[o.membership]++;});
    var definitions=roots.map(function(r){return {object:r,dax:lookup.get(r.name).dax};});
    var onlyColumns=objects.filter(function(o){return o.kind==='column'&&o.membership==='right';}).map(function(o){return o.table+'['+o.name+']';});
    var summary=roots[1].name+' shares '+counts.shared+' calculation'+(counts.shared===1?'':'s')+' with '+roots[0].name+' and adds '+counts.right+' within the analyzed scope.';
    if(onlyColumns.length)summary+=' Additional column references: '+onlyColumns.slice(0,4).join(', ')+(onlyColumns.length>4?'…':'')+'.';
    return {format:'smv-measure-comparison',version:1,roots:roots,definitions:definitions,exactFormulaTextEqual:definitions[0].dax===definitions[1].dax,objects:objects,edges:edges,counts:counts,complete:a.complete&&b.complete,cycles:[a.cycle,b.cycle],warnings:Array.from(new Set(a.warnings.concat(b.warnings))),summary:summary,basis:'Static references and shared written definitions; roots are included in scope. Expanded text is for inspection, not an equivalent executable rewrite or a numeric-result comparison.'};
  }
  function membership(result,kind,table,name){var found=result.objects.find(function(o){return o.id===id(kind,table,name);});return found?found.membership:'unknown';}
  function annotate(printed,root,result){
    var shared=new Set(result.objects.filter(function(o){return o.kind==='measure'&&o.membership==='shared';}).map(function(o){return o.name;}));
    printed.lines.forEach(function(l){l.parts.forEach(function(p){p.comparison=shared.has(root)?'shared':result.complete?'different':'unknown';});});
    printed.regions.filter(function(r){return r.kind==='measure';}).sort(function(a,b){return (a.depth||0)-(b.depth||0);}).forEach(function(r){
      for(var i=r.from;i<=r.to;i++){var line=printed.lines[i],begin=0,end=line.parts.length-1;if(i===r.from){var at=line.parts.findIndex(function(p){return p.k==='inl'&&p.v===r.label;});if(at>=0)begin=at;}if(i===r.to)end=r.closePart;for(var j=begin;j<=end;j++)line.parts[j].comparison=shared.has(r.name)?'shared':result.complete?'different':'unknown';}
    });return printed;
  }
  var api={id:id,resolve:resolve,analyze:analyze,membership:membership,annotate:annotate};g.MeasureComparison=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
