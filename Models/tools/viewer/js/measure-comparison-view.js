/* Paired native Measures workspaces. Each row owns mutable UI and layout state. */
(function(g){
  'use strict';
  var el=U.el;
  function MeasureComparisonView(owner,spec,saved){
    this.owner=owner;this.app=owner.app;this.model=this.app.model;
    this.analysis=MeasureComparison.analyze(this.model,spec.left,spec.right,{maxMeasures:spec.maxMeasures||200});
    this.spec={version:1,left:this.analysis.roots[0],right:this.analysis.roots[1],maxMeasures:spec.maxMeasures||200};
    var opening=saved&&saved.comparison||spec;this.active=opening.active===1?1:0;this.layout='rows';this.views=[];this.rows=[];this.tabs=[];
    this.settings=Object.assign({mode:'split',split:'beside',orientation:'lr',sources:true,inline:true,plain:true,fmt:'original',wrap:true},saved&&saved.comparison.rows&&saved.comparison.rows[0]&&saved.comparison.rows[0].preferences||{});
    var self=this;U.clear(owner.host);owner._built=false;
    this.shell=el('div',{cls:'mv-workspace mv-comparison-shell'});this.workspace=el('div',{cls:'mv-comparison-workspace'});
    this.strip=el('div',{cls:'mv-comparison-strip'});this.summary=el('p',{cls:'mv-comparison-summary',text:this.analysis.summary});
    var controls=el('div',{cls:'mv-comparison-controls'});
    this.analysis.roots.forEach(function(root,i){
      var select=el('select',{cls:'mv-layout-select','aria-label':i?'Second measure':'First measure',onChange:function(){var pair=self.analysis.roots.slice();pair[i]={kind:'measure',table:self.model.msrHome[select.value],name:select.value};try{self.replaceRoots(pair);}catch(error){select.value=root.name;self.notice.textContent=error.message;}}});
      Object.keys(self.model.msrHome).sort().forEach(function(n){select.appendChild(el('option',{value:n,text:n}));});select.value=root.name;
      controls.appendChild(el('label',{},[el('span',{text:i?'with':'Compare'}),select]));
    });
    controls.appendChild(el('button',{cls:'mv-button',text:'Exit comparison',onClick:function(){owner.clearComparison();self.app.setState({selMeasure:self.analysis.roots[self.active].name,dependencySource:null,gPin:null,gExtra:{},gHover:null});}}));
    this.sharedControls=this.buildControls();
    this.notice=el('p',{cls:'mv-comparison-notice',role:'status',text:this.analysis.warnings.join(' ')});
    this.strip.append(controls,this.sharedControls,this.summary,el('p',{cls:'mv-comparison-legend',text:'Blue: shared object · Pink: shared written definition · Amber: side-specific logic or connection · Membership is within this analyzed scope. Expanded DAX is for inspection; it does not preserve implicit context transition.'}),this.notice);
    this.tabbar=el('div',{cls:'mv-comparison-tabs',role:'tablist','aria-label':'Compared measures'});this.rowHost=el('div',{cls:'mv-comparison-rows'});
    this.workspace.append(this.strip,this.tabbar,this.rowHost);this.shell.appendChild(this.workspace);owner.host.appendChild(this.shell);
    this.analysis.roots.forEach(function(root,i){
      var rowApp=Object.create(self.app);rowApp.state=Object.assign({},self.app.state,{viewMode:'measures',selMeasure:root.name,dependencySource:null,gPin:null,gHover:null,gExtra:{},mvQuery:'',mvOpen:self.app.mvOpenFor(root.name),mvTable:''});
      var host=el('div',{cls:'mv-comparison-child'}),row=el('section',{cls:'mv-comparison-row',data:{comparisonRow:String(i)},'aria-label':'Comparison '+(i?'B':'A')+': '+root.name});
      var view=new MeasuresView(rowApp,host,{comparison:true,comparisonSide:i,onSplitShare:function(layout,value){self.views.forEach(function(v,j){if(j!==i){v._splitShares[layout]=value;if(v.analysisBody)v.applyWorkspaceLayout();}});},onGraphChange:function(){self.schedule();},comparisonRoots:self.analysis.roots.map(function(r){return r.name;}),comparisonGroups:function(){return Object.assign({},self.views[0].graphGroupState(),self.views[1].graphGroupState());},analysis:function(){return self.analysis;},onPickMeasure:function(n){var pair=self.analysis.roots.slice();if(n===pair[1-i].name){self.notice.textContent='Choose two different comparison roots.';return;}pair[i]={kind:'measure',table:self.model.msrHome[n],name:n};self.replaceRoots(pair);},layout:function(v){return self.buildLayout(v);},decorateObject:function(node,kind,table,name){self.decorateObject(node,kind,table,name);},decorateEdge:function(node,edge){self.decorateEdge(node,edge);}});
      view._showSources=true;view._inlineDax=true;view._plainDax=true;view._fmt='original';view._wrapDax=true;view._splitShares.beside=.65;
      rowApp.measures=view;
      rowApp.setState=function(patch,cb){
        if(Object.prototype.hasOwnProperty.call(patch,'selMeasure')&&patch.selMeasure==null)patch=Object.assign({},patch,{selMeasure:root.name});
        if(patch.selMeasure&&patch.selMeasure!==root.name){patch=Object.assign({},patch,{selMeasure:root.name,gPin:patch.selMeasure});}
        Object.assign(rowApp.state,patch);
        if(Object.prototype.hasOwnProperty.call(patch,'gHover'))self.views.forEach(function(other){if(other!==view)other.app.state.gHover=patch.gHover&&MeasureComparison.membership(self.analysis,'measure',self.model.msrHome[patch.gHover],patch.gHover)==='shared'?patch.gHover:null;});
        if(patch.gExtra){self.views.forEach(function(v){v._gC=null;});}self.schedule();if(cb)requestAnimationFrame(cb);
      };
      rowApp.focusTable=function(name){self.app.focusTable(name);};
      self.views.push(view);self.rows.push(row);row.appendChild(host);self.rowHost.appendChild(row);
      row.addEventListener('pointerdown',function(){if(self.active!==i){self.active=i;self.refresh();}});
      var tab=el('button',{role:'tab',text:root.name,onClick:function(){self.active=i;self.refresh();},onKeydown:function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();self.active=1-self.active;self.refresh();self.tabs[self.active].focus();}}});
      tab.id='mv-comparison-tab-'+owner.markerId+'-'+i;row.id='mv-comparison-row-'+owner.markerId+'-'+i;tab.setAttribute('aria-controls',row.id);row.setAttribute('aria-labelledby',tab.id);
      self.tabs.push(tab);self.tabbar.appendChild(tab);
    });
    this.views.forEach(function(v,i){if(saved&&Array.isArray(saved.comparison.rows)&&saved.comparison.rows[i]){var state=Object.assign({},saved.comparison.rows[i],{selectedMeasure:self.analysis.roots[i].name,source:null});v.restoreSnapshot(state);if(saved.comparison.folds&&saved.comparison.folds[i])v._folds=JSON.parse(JSON.stringify(saved.comparison.folds[i]));}});
    this.settings=Object.assign({},this.settings,this.views[0].captureSnapshot().preferences);
    this.views[1]._splitShares=Object.assign({},this.views[0]._splitShares);this.syncControls();
    this.resize=function(){self.refresh();};g.addEventListener('resize',this.resize);
  }
  MeasureComparisonView.prototype={
    replaceRoots:function(pair){
      var state=this.captureSnapshot();state.comparison.left=pair[0];state.comparison.right=pair[1];
      state.comparison.rows.forEach(function(row,i){row.selectedMeasure=pair[i].name;row.comparisonMeasure=null;row.extraMeasures=[];row.graph={autoFit:true};});state.comparison.folds=[{},{}];
      this.owner.setComparison(Object.assign({},this.spec,{left:pair[0],right:pair[1]}),state);
    },
    buildControls:function(){
      var self=this,bar=el('div',{cls:'mv-comparison-settings','aria-label':'Settings for both measures'});this.settingControls={};
      var modes=el('div',{cls:'mv-mode-switch',role:'group','aria-label':'Analysis view for both measures'});
      [['split','Split view'],['dax','DAX'],['graph','Dependencies']].forEach(function(item){var button=el('button',{text:item[1],'aria-pressed':String(self.settings.mode===item[0]),onClick:function(){self.setSetting('mode',item[0]);}});self.settingControls['mode-'+item[0]]=button;modes.appendChild(button);});bar.appendChild(modes);
      function select(key,label,options){var control=el('select',{cls:'mv-layout-select','aria-label':label,onChange:function(){self.setSetting(key,control.value);}},options.map(function(item){return el('option',{value:item[0],text:item[1]});}));control.value=self.settings[key];self.settingControls[key]=control;bar.appendChild(control);}
      function toggle(key,label){var control=el('button',{cls:'mv-button',text:label,'aria-pressed':String(!!self.settings[key]),onClick:function(){self.setSetting(key,!self.settings[key]);}});self.settingControls[key]=control;bar.appendChild(control);}
      select('split','DAX position for both measures',[['beside','DAX beside graph'],['below','DAX below graph']]);
      select('orientation','Graph direction for both measures',[['lr','Left → right'],['tb','Top → bottom'],['bt','Bottom → top']]);
      toggle('sources','Table and column references');toggle('wrap','Wrap lines');toggle('inline','Inline measures');toggle('plain','Compact');
      select('fmt','DAX layout for both measures',[['original','Original'],['long','Long lines'],['short','Short lines']]);
      bar.appendChild(el('button',{cls:'mv-button',text:'Loaded originals',onClick:function(){self.settings.inline=false;self.settings.fmt='original';self.setSetting('inline',false);}}));
      return bar;
    },
    setSetting:function(key,value){
      this.settings[key]=value;var self=this;
      this.views.forEach(function(v){if(['sources','orientation'].includes(key)){v.rememberGraphViewport();v._gC=null;v._mainKey=null;}v._daxKey=null;});
      this.syncControls();this.update();
    },
    syncControls:function(){
      var self=this;
      Object.keys(this.settingControls).forEach(function(k){var c=self.settingControls[k];if(k.indexOf('mode-')===0)c.setAttribute('aria-pressed',String(self.settings.mode===k.slice(5)));else if(c.tagName==='SELECT')c.value=self.settings[k];else c.setAttribute('aria-pressed',String(!!self.settings[k]));});
      this.settingControls.plain.hidden=!this.settings.inline;this.settingControls.split.hidden=this.settings.mode!=='split';
    },
    applySettings:function(v){
      var s=this.settings;v._workspaceMode=s.mode;v._splitLayout=s.split;v._graphOrientation=s.orientation;v._showSources=s.sources;v._wrapDax=s.wrap;v._inlineDax=s.inline;v._plainDax=s.plain;v._fmt=s.fmt;
      if(v.daxGrid)v.daxGrid.classList.toggle('mv-no-wrap',!s.wrap);
      if(v.orientationSelect)v.orientationSelect.value=s.orientation;
      if(v.directionLabel)v.updateDirectionLabel();
    },
    schedule:function(){if(this.frame)return;var self=this;this.frame=requestAnimationFrame(function(){self.frame=0;self.update();});},
    update:function(){
      if(this.model!==this.app.model){var spec=this.spec;try{this.owner.setComparison(spec);}catch(error){this.owner.clearComparison();this.app.state.selMeasure=null;this.owner.update();}return;}
      var on=this.app.state.viewMode==='measures'&&this.app.state.loaded;this.shell.hidden=!on;if(!on)return;
      var self=this;this.views.forEach(function(v){self.applySettings(v);v.update();if(v.pane&&!v._comparisonResize)v._comparisonResize=v.pane.nextElementSibling;});this.refresh();
    },
    refresh:function(){
      var self=this,narrow=innerWidth<=1100,tabbed=narrow;this.workspace.dataset.layout=tabbed?'tabs':'rows';
      this.views.forEach(function(v,i){
        self.rows[i].hidden=tabbed&&i!==self.active;self.tabs[i].setAttribute('aria-selected',String(i===self.active));self.tabs[i].tabIndex=i===self.active?0:-1;
        // Reuse the active native library and its resizer; state stays with its row.
        if(v.pane){if(i===self.active){self.shell.insertBefore(v.pane,self.workspace);if(v._comparisonResize)self.shell.insertBefore(v._comparisonResize,self.workspace);}else{if(!v._comparisonResize)v._comparisonResize=v.pane.nextElementSibling;v.pane.remove();if(v._comparisonResize)v._comparisonResize.remove();}}
        if(v.mainEl&&v.mainEl.parentNode!==self.rows[i]){if(!v._comparisonResize)v._comparisonResize=v.pane.nextElementSibling;self.rows[i].appendChild(v.mainEl);}
        if(!self.rows[i].hidden){v.applyWorkspaceLayout();v.restorePendingViewport();}
      });
    },
    captureSnapshot:function(){
      var rows=this.views.map(function(v){return v.captureSnapshot();}),base=Object.assign({},rows[0]);
      base.comparison=Object.assign({},this.spec,{active:this.active,layout:this.layout,rows:rows,folds:this.views.map(function(v){return JSON.parse(JSON.stringify(v._folds));})});return base;
    },
    destroy:function(){if(this.frame)cancelAnimationFrame(this.frame);g.removeEventListener('resize',this.resize);this.views.forEach(function(v){v.cancelSnapshotViewport();if(v._graphObserver)v._graphObserver.disconnect();if(v._matchingDialog)v.closeMatchingResults();clearTimeout(v._clkT);});this.shell.remove();},
    decorateObject:function(node,kind,table,name){
      node.dataset.smvKind=kind;node.dataset.smvName=name;if(table)node.dataset.smvTable=table;
      var membership=MeasureComparison.membership(this.analysis,kind,table,name);node.dataset.comparisonMembership=membership;
      var rootIndex=kind==='measure'?this.analysis.roots.findIndex(function(r){return r.table===table&&r.name===name;}):-1;
      if(rootIndex>=0){node.dataset.comparisonFocus=rootIndex===0?'A':'B';node.title+=' · Comparison focus '+node.dataset.comparisonFocus;}else delete node.dataset.comparisonFocus;
      node.classList.toggle('mv-compare-only',membership==='left'||membership==='right');node.classList.toggle('mv-compare-common',membership==='shared');
      node.title+=(membership==='shared'?' · Shared object':membership==='unknown'?' · Membership unknown within scope':' · Only in '+(membership==='left'?'A':'B')+' within the analyzed scope');
    },
    decorateEdge:function(node,edge){
      var pair=edge.key.split('\u0001'),from=pair[0],to=pair[1],kind='measure-reference',source;
      if(from.indexOf('\u0000source:')===0){source=JSON.parse(from.slice(8));kind=source[1]==null?'table-reference':'column-reference';from=MeasureComparison.id(source[1]==null?'table':'column',source[1]==null?'':source[0],source[1]==null?source[0]:source[1]);}
      else from=MeasureComparison.id('measure',this.model.msrHome[from],from);
      to=MeasureComparison.id('measure',this.model.msrHome[to],to);
      var record=this.analysis.edges.find(function(e){return e.from===from&&e.to===to&&e.kind===kind;}),membership=record?record.membership:'unknown';
      node.dataset.comparisonMembership=membership;
      if(membership==='left'||membership==='right'){node.style.stroke='#b87516';node.style.strokeWidth='2px';}
      node.firstChild.textContent+=' · '+(membership==='shared'?'Shared connection':membership==='unknown'?'Connection outside analyzed scope':'Side-specific connection');
    },
    buildLayout:function(view){
      // A bounded union determines coordinates. Each projection contains only actual
      // dependencies of its root; no alignment-only semantic edges are introduced.
      var self=this,roots=this.analysis.roots.map(function(r){return r.name;}),scopes=roots.map(function(root){
        var seen=new Set(),pending=[root];for(var i=0;i<pending.length&&seen.size<self.spec.maxMeasures;i++){var n=pending[i];if(seen.has(n))continue;seen.add(n);var m=self.app.msrOf(n);(m?m._deps||[]:[]).forEach(function(d){if(!seen.has(d))pending.push(d);});}return seen;
      });
      this.views.forEach(function(v,i){Object.keys(v.app.state.gExtra||{}).slice(0,100).forEach(function(n){if(self.app.msrOf(n))scopes[i].add(n);});});
      var own=scopes[this.views.indexOf(view)],names=Array.from(new Set(Array.from(scopes[0]).concat(Array.from(scopes[1]))));
      // Current native layout recursively ranks nodes. Keep this union bounded even
      // if analysis follows a much larger graph; residual links stay expandable.
      names=names.slice(0,498);roots.forEach(function(r){if(!names.includes(r))names.push(r);});
      own=new Set(Array.from(own).filter(function(n){return names.includes(n);}));
      var union=view.gLayout(roots[1],{},500,view._graphOrientation,names);
      if(view._graphOrientation==='lr'){
        var columns=Array.from(new Set(Object.values(union.xy).map(function(p){return p.x;}))).sort(function(a,b){return a-b;});
        Object.values(union.xy).forEach(function(p){p.x-=64+columns.indexOf(p.x)*48;p.y-=44;});
        union.boxes.forEach(function(b){var p=union.xy[union.names.find(function(n){return union.groupOf[n]===b.key;})];if(p){b.x=p.x-10;b.y-=44;}});
        union.w-=128+Math.max(0,columns.length-1)*48;union.h-=88;
        union.geo.forEach(function(e){var a=union.xy[e.a],b=union.xy[e.b],x=a.x+a.w,y=a.y+17,x2=b.x,y2=b.y+17,k=Math.min(60,(x2-x)/2);e.d='M'+x+','+y+' C'+(x+k)+','+y+' '+(x2-k)+','+y2+' '+x2+','+y2;});
      }
      var projection=view.gLayout(view.graphRoot(),{},500,view._graphOrientation,Array.from(own));
      if(view._graphOrientation!=='lr')return view._showSources?view.addSourceLayout(projection):projection;
      // Project the union's visible subset, preserving each row's own adjacency.
      projection.xy={};Object.keys(union.xy).forEach(function(n){projection.xy[n]=Object.assign({},union.xy[n]);});
      projection.names=union.names.filter(function(n){return own.has(n);});projection.hiddenByGroup=new Set(Array.from(union.hiddenByGroup).filter(function(n){return own.has(n);}));projection.groupOf=Object.assign({},union.groupOf);
      projection.boxes=union.boxes.filter(function(b){return projection.names.some(function(n){return union.groupOf[n]===b.key;});}).map(function(b){return Object.assign({},b);});
      projection.boxes.forEach(function(b){b.count=Array.from(own).filter(function(n){return union.groupOf[n]===b.key;}).length;b.shown=projection.names.filter(function(n){return union.groupOf[n]===b.key;}).length;b.hidden=b.count-b.shown;b.label=(b.table||'Model')+(b.folder?' · '+b.folder:'')+' · '+b.count;});
      projection.w=union.w;projection.h=union.h;projection.geo=union.geo.filter(function(e){return projection.names.includes(e.a)&&projection.names.includes(e.b);}).map(function(e){return Object.assign({},e);});projection.nE=projection.geo.length;
      if(!view._showSources)return projection;
      view.addSourceLayout(union);view.addSourceLayout(projection);
      projection.w=union.w;projection.h=union.h;
      projection.names.forEach(function(n){projection.xy[n]=Object.assign({},union.xy[n]);});
      projection.boxes.forEach(function(b){var target=union.boxes.find(function(v){return v.key===b.key;});if(target){b.x=target.x;b.y=target.y;}});
      projection.sources.forEach(function(s){var target=union.sources.find(function(t){return t.table===s.table;});if(!target)return;s.x=target.x;s.y=target.y;[null].concat(s.columns).forEach(function(c,i){projection.xy[view.sourceKey(s.table,c)]={x:s.x,y:s.y+i*34,w:s.w};});});
      projection.geo.forEach(function(e){var a=projection.xy[e.a],b=projection.xy[e.b];if(!a||!b)return;var x=a.x+a.w,y=a.y+17,x2=b.x,y2=b.y+17,k=Math.min(60,Math.max(12,(x2-x)/2));e.d='M'+x+','+y+' C'+(x+k)+','+y+' '+(x2-k)+','+y2+' '+x2+','+y2;e.labelX=x+10;e.labelY=y-7;});
      return projection;
    }
  };
  g.MeasureComparisonView=MeasureComparisonView;
})(window);
