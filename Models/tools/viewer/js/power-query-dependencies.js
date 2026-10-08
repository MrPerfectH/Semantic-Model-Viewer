/* Read-only partial M analysis. No evaluation or connector access.
 * Public API v1 for #37:
 * analyze(node, metadata) -> {dependencies:[{id,name,at}], uncertainty:[string], partial:true}
 * graph(metadata) -> {nodes:[{node,result}], edges:[{from,to,name,at}], cycles:[[id,...]],
 *                     uncertainty:[string], partial:true}
 * Edges are direct syntactic references, not proof of execution. Cycles are strongly
 * connected components (including self edges). Duplicate identities are never collapsed
 * into resolved edges. Inputs are not mutated; results have no retained global state.
 */
(function(g){
  'use strict';
  var notice='Partial static inspection; absence of an edge does not prove absence of a dependency.';
  function analyze(node,metadata){
    var uncertainty=[],dependencies=[],ts=[],pos=0,steps=0;
    function warn(s){if(!uncertainty.includes(s))uncertainty.push(s);}
    function fail(s){throw new Error(s);}
    if(!node||node.state!=='available'||typeof node.code!=='string')return {dependencies:[],uncertainty:['M metadata is missing or not M.',notice],partial:true};
    var code=node.code;
    function decode(s){return s.replace(/""/g,'"').replace(/#\(([^)]*)\)/g,function(all,v){var parts=v.split(','),out='';for(var x of parts){if(x==='cr')out+='\r';else if(x==='lf')out+='\n';else if(x==='tab')out+='\t';else if(x==='#')out+='#';else if(/^(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(x)&&parseInt(x,16)<=0x10ffff)out+=String.fromCodePoint(parseInt(x,16));else {warn('Unsupported escape: '+all);return all;}}return out;});}
    try{
      if(code.length>500000)fail('Code size limit reached');
      for(var i=0;i<code.length;){
        var start=i,c=code[i],m;
        if(/\s/.test(c)){i++;continue;}
        if(code.slice(i,i+2)==='//'){while(i<code.length&&!/[\r\n]/.test(code[i]))i++;continue;}
        if(code.slice(i,i+2)==='/*'){var end=code.indexOf('*/',i+2);if(end<0)fail('Unclosed comment');i=end+2;continue;}
        if(c==='"'||code.slice(i,i+2)==='#"'){
          var quoted=c==='#';i+=quoted?2:1;var begin=i,closed=false;
          while(i<code.length){if(code[i]==='"'){if(code[i+1]==='"'){i+=2;continue;}closed=true;break;}i++;}
          if(!closed)fail('Unclosed string or quoted identifier');
          ts.push({v:decode(code.slice(begin,i)),kind:quoted?'id':'literal',quoted:quoted,at:start});i++;continue;
        }
        m=/^(?:[\p{L}_][\p{L}\p{N}\p{M}_]*)(?:\.[\p{L}_][\p{L}\p{N}\p{M}_]*)*/u.exec(code.slice(i));
        if(m){ts.push({v:m[0],kind:'id',at:start});i+=m[0].length;continue;}
        m=/^#(?:shared|sections|[A-Za-z]+)/.exec(code.slice(i));
        if(m){ts.push({v:m[0],kind:'id',at:start});i+=m[0].length;continue;}
        m=/^(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(code.slice(i));
        if(m){ts.push({v:m[0],kind:'literal',at:start});i+=m[0].length;continue;}
        m=/^(?:=>|<>|<=|>=|\.\.\.|\.\.|\?\?)/.exec(code.slice(i));var v=m?m[0]:c;ts.push({v:v,kind:'punct',at:start});i+=v.length;
        if(ts.length>50000)fail('Token limit reached');
      }
      function at(v){return ts[pos]&&ts[pos].v===v&&!ts[pos].quoted;}
      function take(v){if(at(v)){return ts[pos++];}return null;}
      function need(v){if(!take(v))fail('Expected '+v+' at token '+pos);}
      function identifier(){var t=ts[pos++];if(!t||t.kind!=='id')fail('Expected identifier');return t.v;}
      function group(items){return {items:items};}
      function type(){// Type syntax is not a value reference. Complex types remain explicit uncertainty.
        if(take('nullable')){} var t=ts[pos++];if(!t)fail('Missing type');
        if(t.v==='['||t.v==='{'||t.v==='table'||t.v==='function'){warn('Complex type syntax is unsupported');fail('Unsupported type syntax');}
        if(!/^(any|anynonnull|binary|date|datetime|datetimezone|duration|logical|none|number|record|table|text|time|list|function|type)$/.test(t.v))warn('Unresolved type: '+t.v);
      }
      var operators=new Set(['+','-','*','/','&','=','<>','<','>','<=','>=','and','or','meta','??','..']);
      function expr(depth){
        if(++steps>50000||depth>180)fail('Analysis depth/work limit reached');
        var a=primary(depth+1),items=[a];
        while(pos<ts.length){
          if(take('(')){var args=[];if(!at(')')){do{args.push(expr(depth+1));}while(take(','));}need(')');items.push(group(args));continue;}
          if(take('[')){// Selection/projection names are generalized identifiers, never global references.
            var level=1;while(pos<ts.length&&level){if(take('['))level++;else if(take(']'))level--;else {if(ts[pos].kind==='punct'&&!['?',',','.'].includes(ts[pos].v))warn('Unsupported field selector syntax');pos++;}}if(level)fail('Unclosed field selector');take('?');continue;
          }
          if(take('{')){items.push(expr(depth+1));need('}');take('?');continue;}
          if(take('as')||take('is')){type();continue;}
          var t=ts[pos];if(t&&!t.quoted&&operators.has(t.v)){pos++;items.push(primary(depth+1));continue;}break;
        }
        return group(items);
      }
      function primary(depth){
        var t=ts[pos];if(!t)fail('Missing expression');
        if(take('let')){var bindings=[];do{var name=identifier();need('=');bindings.push({name:name,value:expr(depth+1)});}while(take(','));need('in');return {bindings:bindings,body:expr(depth+1)};}
        if(take('if')){var cond=expr(depth+1);need('then');var yes=expr(depth+1);need('else');return group([cond,yes,expr(depth+1)]);}
        if(take('each'))return {params:['_'],body:expr(depth+1)};
        if(take('try')){var attempt=expr(depth+1);if(take('otherwise'))return group([attempt,expr(depth+1)]);if(take('catch'))return group([attempt,expr(depth+1)]);return attempt;}
        if(take('error')||take('not')||take('+')||take('-'))return primary(depth+1);
        if(take('type')){type();return group([]);}
        if(take('(')){
          var saved=pos,params=[],fn=true;
          try{if(!at(')')){do{take('optional');params.push(identifier());if(take('as'))type();}while(take(','));}need(')');if(take('as'))type();if(!take('=>'))fn=false;}catch(e){fn=false;}
          if(fn)return {params:params,body:expr(depth+1)};
          pos=saved;var inner=expr(depth+1);need(')');return inner;
        }
        if(take('[')){
          var look=pos,level=0,record=false;while(look<ts.length){var token=ts[look++];if(!token.quoted&&token.v==='[')level++;if(!token.quoted&&token.v===']'){if(!level)break;level--;}if(!level&&!token.quoted&&token.v==='='){record=true;break;}}
          if(!record){var nested=1;while(pos<ts.length&&nested){if(take('['))nested++;else if(take(']'))nested--;else pos++;}if(nested)fail('Unclosed implicit field selector');take('?');return {ref:{v:'_',at:t.at},inclusive:false};}
          var fields=[];if(!at(']')){do{var parts=[];while(pos<ts.length&&!at('=')){if(at(',')||at(']'))fail('Unsupported record field');parts.push(ts[pos++].v);}if(!parts.length)fail('Missing record field');need('=');fields.push({name:parts.join(' '),value:expr(depth+1)});}while(take(','));}need(']');return {bindings:fields};
        }
        if(take('{')){var vals=[];if(!at('}')){do{vals.push(expr(depth+1));}while(take(','));}need('}');return group(vals);}
        var inclusive=!!take('@');t=ts[pos++];if(!t)fail('Missing identifier');
        if(t.kind==='literal'||(!t.quoted&&['true','false','null'].includes(t.v)))return group([]);
        if(t.kind==='id'&&!(!t.quoted&&['section','shared','in','then','else','otherwise'].includes(t.v)))return {ref:t,inclusive:inclusive};
        fail('Unsupported syntax at '+t.at);
      }
      var ast=expr(0);if(pos!==ts.length)fail('Unsupported trailing syntax at '+ts[pos].at);
      var names=new Map(),ids=new Map();(metadata.nodes||[]).forEach(function(n){var name=n.kind==='partition'?n.table:n.name;if(!names.has(name))names.set(name,[]);names.get(name).push(n);ids.set(n.id,(ids.get(n.id)||0)+1);});
      function visit(a,scope){
        if(a.ref){var t=a.ref,n=t.v,local=scope.get(n);if(local){if(local==='initializing'&&!a.inclusive)warn('Exclusive self-reference during initialization: '+n);return;}
          if(['Expression.Evaluate','Record.Field','Record.FieldOrDefault','#shared','#sections'].includes(n))warn('Dynamic/environment reference: '+n+'; targets cannot be established statically.');
          var found=names.get(n)||[];
          if(found.length===1&&ids.get(found[0].id)===1){if(!dependencies.some(function(d){return d.id===found[0].id;}))dependencies.push({id:found[0].id,name:n,at:t.at});}
          else if(found.length)warn('Ambiguous reference: '+n+' (duplicate identity/name or multiple partitions).');
          else warn('Unresolved '+(n.includes('.')?'library/external symbol: ':'reference: ')+n);return;
        }
        if(a.bindings){var env=new Map(scope),seen=new Set();a.bindings.forEach(function(b){if(seen.has(b.name))warn('Duplicate local binding: '+b.name);seen.add(b.name);env.set(b.name,'local');});a.bindings.forEach(function(b){var init=new Map(env);init.set(b.name,'initializing');visit(b.value,init);});if(a.body)visit(a.body,env);return;}
        if(a.params){var fn=new Map(scope);a.params.forEach(function(p){fn.set(p,'local');});visit(a.body,fn);return;}
        (a.items||[]).forEach(function(x){visit(x,scope);});
      }
      visit(ast,new Map());
    }catch(e){warn('Analysis incomplete: '+e.message);dependencies=[];}
    warn(notice);return {dependencies:dependencies,uncertainty:uncertainty,partial:true};
  }
  function graph(metadata){
    var nodes=(metadata.nodes||[]).map(function(n){return {node:n,result:analyze(n,metadata)};}),edges=[],uncertainty=[],byId=new Map();
    nodes.forEach(function(row){if(byId.has(row.node.id)){uncertainty.push('Duplicate node identity: '+row.node.id);byId.set(row.node.id,null);}else byId.set(row.node.id,row);});
    nodes.forEach(function(row){if(byId.get(row.node.id)!==row)return;row.result.dependencies.forEach(function(d){edges.push({from:row.node.id,to:d.id,name:d.name,at:d.at});});});
    // Iterative reachability finds cycle components without recursive graph stack risk.
    var adjacent=new Map();edges.forEach(function(e){if(!adjacent.has(e.from))adjacent.set(e.from,[]);adjacent.get(e.from).push(e.to);});
    var cycles=[],assigned=new Set(),work=0;
    function reachable(id){var seen=new Set(),todo=[id];while(todo.length){if(++work>2000000)throw new Error('Cycle analysis work limit reached');var x=todo.pop();if(seen.has(x))continue;seen.add(x);(adjacent.get(x)||[]).forEach(function(y){todo.push(y);});}return seen;}
    try{for(var id of byId.keys()){if(assigned.has(id)||!byId.get(id))continue;var reach=reachable(id),component=[];for(var other of reach){if(other===id||reachable(other).has(id))component.push(other);}component.sort();component.forEach(function(x){assigned.add(x);});if(component.length>1||(adjacent.get(id)||[]).includes(id))cycles.push(component);}}catch(e){uncertainty.push(e.message);}
    return {nodes:nodes,edges:edges,cycles:cycles,uncertainty:uncertainty,partial:true};
  }
  function render(host,context){
    var doc=host.ownerDocument;function add(tag,text,parent){var el=doc.createElement(tag);el.textContent=text;(parent||host).appendChild(el);return el;}
    host.replaceChildren();add('h3','Direct dependencies');var result=analyze(context.selected,context.metadata);
    if(!result.dependencies.length)add('p','No direct metadata references resolved. This does not prove there are no dependencies.');
    result.dependencies.forEach(function(d){var button=add('button','Open '+d.name);button.type='button';button.addEventListener('click',function(){context.openCode(d.id);});});
    var cycleGraph=graph(context.metadata);cycleGraph.cycles.forEach(function(cycle){if(context.selected&&cycle.includes(context.selected.id))add('p','Cycle detected among metadata references: '+cycle.map(function(id){var row=cycleGraph.nodes.find(function(r){return r.node.id===id;});return row?row.node.name:id;}).join(' → '));});
    var details=add('details','');details.open=true;add('summary','Uncertainty and unresolved references',details);
    result.uncertainty.concat(context.metadata.warnings||[],cycleGraph.uncertainty).forEach(function(s){add('p',s,details);});
  }
  g.PowerQueryDependencies={version:1,analyze:analyze,graph:graph,render:render};
})(window);
