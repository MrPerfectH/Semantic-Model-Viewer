/* Read-only model reference. The same index and UI run in the app and offline HTML. */
(function(g){
  'use strict';
  var labels={table:'Tables',measure:'Measures',column:'Columns',calculationGroup:'Calculation groups',calculationItem:'Calculation items',hierarchy:'Hierarchies',query:'Power Query'};
  var singular={table:'Table',column:'Column',measure:'Measure',calculationGroup:'Calculation group',calculationItem:'Calculation item',hierarchy:'Hierarchy',query:'Query'};
  function id(kind,table,name){return JSON.stringify([kind,table||'',name||'']);}
  function index(model){
    var objects=[],byId=new Map();
    function add(kind,table,data){var o={id:id(kind,table,data.name),kind:kind,table:table,name:data.name,data:data};objects.push(o);byId.set(o.id,o);}
    (model.tables||[]).forEach(function(t){
      add(t.calculationGroup||t.role==='calcgroup'?'calculationGroup':'table','',t);
      (t.columns||[]).forEach(function(c){add('column',t.name,c);});
      (t.measures||[]).forEach(function(m){add('measure',t.name,m);});
      (t.calcItems||[]).forEach(function(c){add('calculationItem',t.name,c);});
      (t.hierarchies||[]).forEach(function(h){add('hierarchy',t.name,h);});
    });
    (model.powerQuery&&model.powerQuery.nodes||[]).forEach(function(q){var o={id:id('query',q.table,q.id),kind:'query',table:q.table||'',name:q.name,data:q};objects.push(o);byId.set(o.id,o);});
    return {objects:objects,byId:byId};
  }
  function search(objects,query,kind,code){
    var q=query.trim().toLocaleLowerCase();
    return objects.filter(function(o){return !kind||kind==='all'||o.kind===kind;}).map(function(o){
      var fields=[['Name',o.name],['Table',o.table],['Description',o.data.description],['Folder',o.data.folder||o.data.displayFolder]];
      if(code)fields.push(['Expression',o.data.dax||o.data.code||o.data.formatExpression]);
      var hit=q?fields.find(function(f){return String(f[1]||'').toLocaleLowerCase().includes(q);}):null;
      return !q||hit?{object:o,reason:hit?hit[0]+' matches: '+query:'',rank:!q?0:o.name.toLocaleLowerCase()===q?0:hit[0]==='Name'?1:2}:null;
    }).filter(Boolean).sort(function(a,b){return a.rank-b.rank||a.object.name.localeCompare(b.object.name)||a.object.id.localeCompare(b.object.id);});
  }
  function ReferenceView(app,host){
    this.app=app;this.host=host;this.model=null;this.state={query:'',kind:'all',code:false,selected:null,tab:'overview'};this.history=[];this.limit=100;
    var self=this;g.addEventListener('hashchange',function(){self.readLink();});
  }
  ReferenceView.prototype={
    captureSnapshot:function(){return Object.assign({},this.state);},
    restoreSnapshot:function(state){this.pending=state||{};this.model=null;},
    readLink:function(){
      if(!this.model)return;
      var params=new URLSearchParams((g.location.hash||'').slice(1)),key=params.get('reference');
      if(key&&this.data.byId.has(key)){this.open(key,params.get('tab')||'overview');this.app.setViewMode('reference');}
    },
    update:function(){
      if(this.model!==this.app.model){
        this.model=this.app.model;this.loadedAt=this.model&&this.model.referenceLoadedAt||(!this.app.snapshotMode?new Date().toISOString():null);this.data=index(this.model||{});this.history=[];this.state={query:'',kind:'all',code:false,selected:null,tab:'overview'};
        var p=this.pending;this.pending=null;if(p){['query','kind','selected','tab'].forEach(function(k){if(typeof p[k]==='string')this.state[k]=p[k];},this);this.state.code=p.code===true;}
        if(!this.data.byId.has(this.state.selected))this.state.selected=null;
        this.build();this.readLink();
      }
      this.host.hidden=this.app.state.viewMode!=='reference'||!this.app.state.loaded;
    },
    build:function(){
      var self=this,U=g.U,el=U.el;U.clear(this.host);
      this.library=el('aside',{cls:'ref-library','aria-label':'Reference library'});
      this.library.appendChild(el('h2',{text:'Reference library'}));
      this.input=el('input',{type:'search',value:this.state.query,placeholder:'Find any model object…','aria-label':'Search model reference',onInput:function(){self.state.query=this.value;self.limit=100;self.renderList();}});
      this.filter=el('select',{'aria-label':'Object type',onChange:function(){self.state.kind=this.value;self.limit=100;self.renderList();}},[el('option',{value:'all',text:'All objects'})]);
      Object.keys(labels).forEach(function(k){self.filter.appendChild(el('option',{value:k,text:labels[k]}));});this.filter.value=this.state.kind;
      this.code=el('input',{type:'checkbox','aria-label':'Search expressions',onChange:function(){self.state.code=this.checked;self.renderList();}});this.code.checked=this.state.code;
      this.count=el('p',{cls:'ref-muted',role:'status','aria-live':'polite'});this.results=el('div',{cls:'ref-results'});
      this.library.append(this.input,this.filter,el('label',{cls:'ref-code-search'},[this.code,' Include DAX and M']),this.count,this.results);
      this.page=el('article',{cls:'ref-page','aria-label':'Object reference'});
      this.host.append(this.library,this.page);this.renderList();this.renderPage();
    },
    renderList:function(){
      var self=this,el=g.U.el;g.U.clear(this.results);
      var matches=search(this.data.objects,this.state.query,this.state.kind,this.state.code);
      this.count.textContent=matches.length+' of '+this.data.objects.length+' objects';
      var visible=matches.slice(0,this.limit);
      Object.keys(labels).forEach(function(kind){var group=visible.filter(function(m){return m.object.kind===kind;});if(!group.length)return;
        self.results.appendChild(el('h3',{text:labels[kind]}));
        group.forEach(function(m){var o=m.object;self.results.appendChild(el('button',{cls:'ref-result','aria-current':self.state.selected===o.id?'page':null,onClick:function(){self.open(o.id);}},[
          el('strong',{text:o.name}),el('small',{text:o.table||singular[o.kind]}),m.reason?el('small',{text:m.reason}):null]));});
      });
      if(!matches.length)this.results.appendChild(el('p',{cls:'ref-muted',text:'No matching objects. Try another name or object type.'}));
      if(matches.length>visible.length)this.results.appendChild(this.button('Show more ('+(matches.length-visible.length)+' remaining)',function(){self.limit+=100;self.renderList();}));
    },
    open:function(key,tab){
      if(!this.data.byId.has(key))return;
      if(this.state.selected)this.history.push({state:Object.assign({},this.state),scroll:this.page.scrollTop});
      if(this.history.length>100)this.history.shift();
      this.state.selected=key;this.state.tab=tab||'overview';this.renderList();this.renderPage();this.page.scrollTop=0;
      var title=this.page.querySelector('h1');if(title)title.focus({preventScroll:true});
    },
    back:function(){var h=this.history.pop();if(!h)return;this.state=h.state;this.input.value=this.state.query;this.filter.value=this.state.kind;this.code.checked=this.state.code;this.renderList();this.renderPage();this.page.scrollTop=h.scroll;},
    button:function(text,fn,primary){return g.U.el('button',{cls:'ex-button'+(primary?' ex-primary':''),text:text,onClick:fn});},
    link:function(key,text){var self=this;return this.data.byId.has(key)?g.U.el('button',{cls:'ref-link',text:text,onClick:function(){self.open(key);}}):g.U.el('span',{text:text});},
    tableKey:function(name){return id(this.model.byName[name]&&this.model.byName[name].calculationGroup||this.model.byName[name]&&this.model.byName[name].role==='calcgroup'?'calculationGroup':'table','',name);},
    section:function(title,children,action){var el=g.U.el;return el('section',{cls:'ref-section'},[el('header',{},[el('h2',{text:title}),action]),children]);},
    grid:function(headers,rows,empty){var el=g.U.el;if(!rows.length)return el('p',{cls:'ref-muted',text:empty||'None in the captured metadata.'});return el('div',{cls:'ref-grid-wrap'},[el('table',{cls:'ref-grid'},[el('thead',{},[el('tr',{},headers.map(function(x){return el('th',{scope:'col',text:x});}))]),el('tbody',{},rows.map(function(row){return el('tr',{},row.map(function(x){return el('td',{},x==null?'Not provided':typeof x==='string'||typeof x==='number'?String(x):x);}));}))])]);},
    tabs:function(o){
      if(o.kind==='table'||o.kind==='calculationGroup')return [['overview','Overview'],['columns','Columns'],['relationships','Relationships'],['measures','Measures'],['queries','Power Query'],['hierarchies','Hierarchies']].concat(o.kind==='calculationGroup'?[['items','Calculation items']]:[]).concat([['properties','Properties']]);
      if(o.kind==='hierarchy')return [['overview','Overview'],['properties','Properties']];
      if(o.kind==='query')return [['overview','Overview'],['expression','Expression'],['properties','Properties']];
      return [['overview','Overview'],['expression','Expression'],['dependencies','Dependencies'],['properties','Properties']];
    },
    renderPage:function(){
      var self=this,el=g.U.el,o=this.data.byId.get(this.state.selected);g.U.clear(this.page);
      if(!o){this.page.append(el('div',{cls:'ref-welcome'},[el('p',{cls:'ref-eyebrow',text:'MODEL REFERENCE'}),el('h1',{text:this.app.state.modelName||(this.model&&this.model.name)||'Your model'}),el('p',{text:'Find an object. Understand its definition. Follow its connections.'}),el('p',{cls:'ref-muted',text:'Search tables, columns, measures, calculation groups, hierarchies, and Power Query. Select an object in the library to begin.'})]));return;}
      var top=el('div',{cls:'ref-breadcrumb'},[this.button('Back',function(){self.back();}),el('span',{text:'Model'}),o.table?this.link(this.tableKey(o.table),o.table):el('span',{text:labels[o.kind]}),el('span',{text:o.name})]);top.firstChild.disabled=!this.history.length;
      this.page.appendChild(top);
      var date=this.loadedAt||(g.Snapshots&&g.Snapshots.embedded&&g.Snapshots.embedded.createdAt);
      this.page.appendChild(el('p',{cls:'ref-provenance',text:(this.app.snapshotMode?'Offline reference':'Local model reference')+(date?' · '+(this.loadedAt?'Metadata opened ':'Snapshot created ')+new Date(date).toLocaleString():' · Capture time unavailable')}));
      var actions=el('div',{cls:'ref-actions'});
      if(o.kind==='table'||o.kind==='calculationGroup')actions.appendChild(this.button('Explore relationships',function(){self.app.focusTable(o.name);},true));
      if(o.kind==='measure')actions.appendChild(this.button('Explore dependencies',function(){self.app.setViewMode('measures');self.app.measures.pickMeasure(o.name);},true));
      if(o.kind==='column')actions.appendChild(this.button('Explore dependencies',function(){self.app.measures.analyzeSource(o.table,o.name);},true));
      if(o.kind==='query')actions.appendChild(this.button('Open Power Query',function(){if(o.table&&self.app.powerQueryWorkspace)self.app.powerQueryWorkspace.openTable(o.table);else self.app.setViewMode('power-query');},true));
      actions.appendChild(this.button('Link to object',function(){var hash='#'+new URLSearchParams({reference:o.id,tab:self.state.tab}).toString();try{g.history.replaceState(null,'',hash);}catch(e){}var link=el('input',{value:g.location.href.split('#')[0]+hash,readonly:true,'aria-label':'Object link'});actions.appendChild(link);link.select();}));
      this.page.append(el('div',{cls:'ref-title-row'},[el('div',{},[el('h1',{text:o.name,tabindex:'-1'}),el('span',{cls:'ref-kind',text:singular[o.kind]})]),actions]));
      this.page.appendChild(el('p',{cls:'ref-description'+(!o.data.description?' ref-muted':''),text:o.data.description||'No description provided in the captured metadata.'}));
      var tabs=this.tabs(o);if(!tabs.some(function(t){return t[0]===self.state.tab;}))this.state.tab='overview';
      var nav=el('div',{cls:'ref-tabs',role:'tablist','aria-label':'Object information'});
      tabs.forEach(function(t,i){var b=el('button',{id:'ref-tab-'+t[0],role:'tab','aria-controls':'ref-content','aria-selected':self.state.tab===t[0]?'true':'false',tabindex:self.state.tab===t[0]?'0':'-1',text:t[1],onClick:function(){self.state.tab=t[0];self.renderPage();self.page.querySelector('#ref-tab-'+t[0]).focus();},onKeydown:function(e){var n=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;if(n!=null){e.preventDefault();self.state.tab=tabs[n][0];self.renderPage();self.page.querySelector('#ref-tab-'+tabs[n][0]).focus();}}});nav.appendChild(b);});
      this.page.appendChild(nav);var body=el('div',{id:'ref-content',role:'tabpanel','aria-labelledby':'ref-tab-'+this.state.tab});this.page.appendChild(body);this.renderContent(body,o);
      this.page.appendChild(el('p',{cls:'ref-coverage',text:'Reference covers available definitions and metadata. Static references may be incomplete; absence does not prove an object is unused. Security roles, perspectives, and translations are not included in this reference view.'}));
    },
    goTab:function(tab){this.state.tab=tab;this.renderPage();this.page.scrollTop=0;},
    renderContent:function(body,o){
      var self=this,el=g.U.el,d=o.data,tab=this.state.tab,isTable=o.kind==='table'||o.kind==='calculationGroup';
      if(isTable){
        if(tab==='overview'||tab==='columns')body.appendChild(this.columns(d,tab==='overview'?3:Infinity));
        if(tab==='overview'){var pair=el('div',{cls:'ref-pair'},[this.relationships(d,3),this.measures(d,3)]);body.appendChild(pair);body.appendChild(this.queries(d,true));if(o.kind==='calculationGroup')body.appendChild(this.items(d));}
        if(tab==='relationships')body.appendChild(this.relationships(d));
        if(tab==='measures')body.appendChild(this.measures(d));
        if(tab==='queries')body.appendChild(this.queries(d,false));
        if(tab==='hierarchies')body.appendChild(this.section('Hierarchies',this.grid(['Hierarchy','Levels','Description'],(d.hierarchies||[]).map(function(h){return [self.link(id('hierarchy',d.name,h.name),h.name),(h.levels||[]).map(function(l){return l.name;}).join(' / '),h.description];}),d.referenceVersion?'No hierarchies defined.':'Hierarchy metadata unavailable. Reimport the source model.')));
        if(tab==='items')body.appendChild(this.items(d));
      }else{
        if(tab==='overview'&&o.table)body.appendChild(this.section('Location',this.link(this.tableKey(o.table),o.table)));
        if(o.kind==='hierarchy'&&tab==='overview')body.appendChild(this.section('Levels',this.grid(['Level','Column','Ordinal'],(d.levels||[]).slice().sort(function(a,b){return (a.ordinal||0)-(b.ordinal||0);}).map(function(l){return [l.name,self.link(id('column',o.table,l.column),l.column||'Unavailable'),l.ordinal];}))));
        if(tab==='overview'||tab==='expression')body.appendChild(this.expression(o));
        if(o.kind==='query'&&tab==='overview'&&g.PowerQueryDependencies){
          var analysis=g.PowerQueryDependencies.analyze(d,this.model.powerQuery);
          body.appendChild(this.section('Detected query inputs',this.grid(['Query'],analysis.dependencies.map(function(dep){var target=self.data.objects.find(function(x){return x.kind==='query'&&x.data.id===dep.id;});return [target?self.link(target.id,target.name):dep.name];}),'No direct references resolved. This does not prove independence.')));
          if(analysis.uncertainty.length)body.appendChild(el('p',{cls:'ref-muted',text:analysis.uncertainty.join(' ')}));
        }
        if((tab==='overview'||tab==='dependencies')&&['measure','column','calculationItem'].includes(o.kind))body.appendChild(this.dependencies(o));
      }
      if(tab==='properties'){
        var keys=['dataType','hidden','h','isKey','isCalc','formatString','fmt','formatExpression','displayFolder','folder','sortByColumn','summarizeBy','dataCategory','sourceColumn','lineageTag','ordinal','type','state','classification','mode'];
        var rows=keys.filter(function(k){return d[k]!=null&&d[k]!=='';}).map(function(k){return [k,String(d[k])];});
        if(d.calculationGroup)Object.keys(d.calculationGroup).forEach(function(k){rows.push(['Calculation group '+k,String(d.calculationGroup[k])]);});
        body.appendChild(this.section('Model properties',this.grid(['Property','Value'],rows)));
        if(isTable)body.appendChild(this.section('Partitions',this.grid(['Partition','Type','Mode'],(d.partitions||[]).map(function(p){return [p.name,p.type,p.mode];}),d.referenceVersion?'No partition definitions.':'Partition properties unavailable. Reimport the source model.')));
      }
    },
    columns:function(t,limit){var self=this,cs=t.columns||[];return this.section('Columns ('+(cs.length>limit?Math.min(cs.length,limit)+' of ':'')+cs.length+')',this.grid(['Column','Type','Description'],cs.slice(0,limit).map(function(c){return [self.link(id('column',t.name,c.name),c.name),c.dataType||'Not provided',c.description||'No description'];})),cs.length>limit?this.button('View all columns',function(){self.goTab('columns');}):null);},
    relationships:function(t,limit){var self=this,rs=(this.model.relationships||[]).filter(function(r){return r.from===t.name||r.to===t.name;});return this.section('Relationships ('+rs.length+')',this.grid(limit?['Related table','Cardinality','Status']:['Related table','Endpoints','Behavior'],rs.slice(0,limit).map(function(r){var other=r.from===t.name?r.to:r.from;if(limit)return [self.link(self.tableKey(other),other),(r.from===t.name?r.fromCard:r.toCard)+' to '+(r.from===t.name?r.toCard:r.fromCard),r.inactive?'Inactive':'Active'];return [self.link(self.tableKey(other),other),r.from+'['+r.fromCol+'] ('+r.fromCard+') → '+r.to+'['+r.toCol+'] ('+r.toCard+')',(r.inactive?'Inactive':'Active')+' · '+(r.both?'Both directions':r.crossFilteringBehavior||'Single direction')];})),limit&&rs.length>limit?this.button('View all relationships',function(){self.goTab('relationships');}):null);},
    measures:function(t,limit){
      var self=this,el=g.U.el,impact=this.app.measureImpact({table:t.name}),direct=new Set(impact.direct);
      impact.all.sort(function(a,b){return Number(direct.has(b))-Number(direct.has(a))||a.localeCompare(b);});
      var content=el('div',{},[this.grid(['Measure','Reference'],impact.all.slice(0,limit).map(function(n){return [self.link(id('measure',self.model.msrHome[n],n),n),direct.has(n)?'Detected direct':'Via another measure'];}),'No measure references detected. This does not prove the table is unused.'),el('h3',{text:'Measures stored here ('+t.measures.length+')'}),this.grid(['Measure','Description'],t.measures.slice(0,limit).map(function(m){return [self.link(id('measure',t.name,m.name),m.name),m.description||'No description'];}),'No measures stored in this table.')]);
      return this.section('Measures referencing '+t.name+' ('+impact.all.length+')',content,limit&&(impact.all.length>limit||t.measures.length>limit)?this.button('View all measures',function(){self.goTab('measures');}):null);
    },
    queries:function(t,summary){var self=this,el=g.U.el,qs=this.data.objects.filter(function(o){return o.kind==='query'&&o.table===t.name;});var content=this.grid(['Definition','Type','Availability'],qs.map(function(o){return [self.link(o.id,o.name),o.data.type,o.data.code!=null?'Definition available':o.data.state||'Unavailable'];}),'Power Query metadata unavailable for this table.');return this.section('Power Query',content,summary?this.button('View Power Query',function(){self.goTab('queries');}):null);},
    items:function(t){var self=this,el=g.U.el;return this.section('Calculation items',el('div',{},[el('p',{cls:'ref-muted',text:'Precedence: '+(t.calculationGroup&&t.calculationGroup.precedence!=null?t.calculationGroup.precedence:'Unavailable')+'. SELECTEDMEASURE() refers to the measure in context, not a fixed measure dependency.'}),this.grid(['Item','Ordinal','Description'],(t.calcItems||[]).slice().sort(function(a,b){return (a.ordinal||0)-(b.ordinal||0);}).map(function(c){return [self.link(id('calculationItem',t.name,c.name),c.name),c.ordinal,c.description||'No description'];}))]));},
    expression:function(o){var el=g.U.el,d=o.data,code=o.kind==='query'?d.code:d.dax;var children=[code!=null&&code!==''?el('pre',{},[el('code',{text:code})]):el('p',{cls:'ref-muted',text:o.kind==='column'&&!d.isCalc?'Source column; no DAX expression.':'Expression unavailable in the captured metadata.'})];if(d.formatExpression||o.kind==='calculationItem'&&d.fmt)children.push(el('h3',{text:'Dynamic format expression'}),el('pre',{},[el('code',{text:d.formatExpression||d.fmt})]));return this.section(o.kind==='query'?'Power Query definition':'Expression',children);},
    dependencies:function(o){
      var self=this,el=g.U.el,refs=this.app.referencesInDax(o.data.dax||'',o.table),rows=[];
      refs.measures.forEach(function(n){rows.push([self.link(id('measure',self.model.msrHome[n],n),n),'Measure reference']);});
      refs.tables.forEach(function(n){rows.push([self.link(self.tableKey(n),n),'Table reference']);});
      refs.columns.forEach(function(group){group.cs.forEach(function(c){rows.push([self.link(id('column',group.t,c),group.t+'['+c+']'),'Column reference']);});});
      var users=o.kind==='measure'?this.model.msrUsedBy[o.name]||[]:o.kind==='column'?this.app.measureImpact({table:o.table,column:o.name}).all:[];
      var c=[this.grid(['Uses','Type'],rows,'No fixed references detected.'),el('p',{cls:'ref-muted',text:'Static expression analysis; dynamic behavior and implicit filter paths are not fully resolved.'})];
      if(refs.unresolved&&refs.unresolved.length)c.push(el('p',{cls:'ref-muted',text:'Some references could not be resolved.'}));
      if(o.kind==='calculationItem')c.push(el('p',{text:'SELECTEDMEASURE() is context-dependent. Applicability to measures is not inferred.'}));
      else c.push(el('h3',{text:'Referenced by measures'}),this.grid(['Measure'],users.map(function(n){return [self.link(id('measure',self.model.msrHome[n],n),n)];}),'No measure consumers detected.'));
      return this.section('Dependencies',c);
    }
  };
  g.ModelReference={index:index,search:search,id:id};g.ReferenceView=ReferenceView;
  if(typeof module!=='undefined'&&module.exports)module.exports=g.ModelReference;
})(typeof window!=='undefined'?window:globalThis);
