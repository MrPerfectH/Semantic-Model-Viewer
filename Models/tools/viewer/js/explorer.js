/* A model-scoped working canvas. Membership is separate from table positions. */
(function (g) {
  'use strict';
  var el = U.el, store = U.store, MIME = 'application/x-smv-table';
  function button(text, action, primary, title) {
    return el('button', {text:text, cls:'ex-button' + (primary ? ' ex-primary' : ''), title:title || text, onClick:action});
  }
  function TableExplorer(app) {
    this.app = app; this.names = new Set(); this.query = ''; this.filter = 'all'; this.domain = ''; this.source = ''; this.history = [];
    this.direction = 'connected'; this.depth = 'direct'; this.includeInactive = true; this.message = '';
    this.library = document.getElementById('table-library'); this.toolbar = document.getElementById('workspace-toolbar');
    this.empty = document.getElementById('canvas-empty'); this.nav = document.getElementById('canvas-navigation');
    this.status = document.getElementById('workspace-status'); this.mapHost = document.getElementById('model-minimap');
    this.map = el('canvas', {width:200,height:112,tabindex:'0',role:'img','aria-label':'Diagram overview. Click to navigate; arrow keys pan the diagram.'});
    this.mapHost.appendChild(el('div',{cls:'ex-map-label',text:'OVERVIEW'})); this.mapHost.appendChild(this.map);
    var self = this, host = app.canvas.host;
    var dropSurface=document.getElementById('main');
    dropSurface.addEventListener('dragover', function (e) { if (Array.from(e.dataTransfer.types).includes(MIME)) {var r=host.getBoundingClientRect();if(app.state.viewMode!=='graph'||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){host.classList.remove('ex-drop');return;}e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';host.classList.add('ex-drop');} });
    dropSurface.addEventListener('dragleave', function () {host.classList.remove('ex-drop');});
    window.addEventListener('dragend', function () {host.classList.remove('ex-drop');dropSurface.classList.remove('ex-dragging');});
    dropSurface.addEventListener('drop', function (e) {
      var name=e.dataTransfer.getData(MIME); if (!name) return;
      var area=host.getBoundingClientRect();if(app.state.viewMode!=='graph'||e.clientX<area.left||e.clientX>area.right||e.clientY<area.top||e.clientY>area.bottom){host.classList.remove('ex-drop');return;}
      e.preventDefault();e.stopPropagation();host.classList.remove('ex-drop');
      if (!app.model.byName[name]) return;
      var r=host.getBoundingClientRect(),v=app.canvas.view;
      self.add([name], {x:(e.clientX-r.left-v.x)/v.k-app.canvas.CARD_W/2,y:(e.clientY-r.top-v.y)/v.k-30});
    });
    this.map.addEventListener('pointerdown', function(e){self.navigateMap(e); self.map.setPointerCapture(e.pointerId);});
    this.map.addEventListener('pointermove', function(e){if(e.buttons===1) self.navigateMap(e);});
    this.map.addEventListener('keydown', function(e){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();var v=app.canvas.view;v.x += e.key==='ArrowLeft'?70:e.key==='ArrowRight'?-70:0;v.y += e.key==='ArrowUp'?70:e.key==='ArrowDown'?-70:0;app.canvas.updateTransform();});
    window.addEventListener('resize', function(){self.update();self.drawMap();});
    this.selbar=el('div',{id:'canvas-selection',hidden:true,role:'status'});dropSurface.appendChild(this.selbar);
    /* A press anywhere outside an open toolbar popover closes it. Presses on the menu or on
       its own button are left alone (the button toggles by itself). */
    window.addEventListener('pointerdown', function(e){
      if(!(self.legendOpen||self.optionsOpen||app.state.showPresets))return;
      if(e.target&&e.target.closest&&e.target.closest('.ex-menu-anchor'))return;
      self.closeMenus(true);
    },true);
    window.addEventListener('keydown', function(e){
      if(e.key==='Escape'){if(self.closeMenus())e.stopPropagation();else if(app.canvas.marked.size)app.canvas.setMarked([]);return;}
      if(e.key!=='Delete'&&e.key!=='Backspace')return;
      var t=e.target,tag=t&&t.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
      if(app.state.viewMode!=='graph'||!app.state.loaded)return;
      var cv=app.canvas,targets=cv.marked.size?Array.from(cv.marked):app.state.selected?[app.state.selected]:[];
      if(!targets.length)return;e.preventDefault();self.removeMany(targets);
    });
  }
  TableExplorer.prototype = {
    /* Escape closes the toolbar popovers and hands focus back to the button that opened
       them, so keyboard users are never left with focus inside a menu that is gone.
       Returns true when something was actually closed. */
    closeMenus:function(outside){
      var app=this.app,self=this;
      if(outside){
        var any=this.legendOpen||this.optionsOpen||app.state.showPresets;
        this.legendOpen=false;this.optionsOpen=false;this._clusterKey=null;this._key=null;
        if(app.state.showPresets)app.setState({showPresets:false});else if(any)this.update();
        return any;
      }
      if(this.legendOpen){this.legendOpen=false;this._clusterKey=null;this.update();if(this.legendBtn&&this.legendBtn.focus)this.legendBtn.focus();return true;}
      if(this.optionsOpen){this.optionsOpen=false;this._key=null;this.update();if(this.displayBtn&&this.displayBtn.focus)this.displayBtn.focus();return true;}
      if(app.state.showPresets){app.setState({showPresets:false},function(){if(self.presetsBtn&&self.presetsBtn.focus)self.presetsBtn.focus();});return true;}
      return false;
    },
    storageKey:function(){return 'smv_workspace_v1_'+this.app.modelKey;},
    loadModel:function(){
      var data=store.getJSON(this.storageKey(),null), M=this.app.model;
      this.names=new Set(data && Array.isArray(data.tables)?data.tables.filter(function(n){return !!M.byName[n];}):[]);
      this.direction='connected';this.depth='direct';this.includeInactive=true;this.app.state.focusDepth=1;
      this.history=[];this.query='';this.filter='all';this.domain='';this.source='';this.message='';this._key=null;this._relationKey=null;this.optionsOpen=false;
      this.app.canvas.workspaceNames=this.names;this.app.state.isolate=false;this.app.state.showStandalone=true;this.app.canvas.showSA=true;
    },
    persist:function(){store.setJSON(this.storageKey(),{tables:Array.from(this.names)});},
    snapshot:function(){this.history.push({names:Array.from(this.names),pos:JSON.parse(JSON.stringify(this.app.canvas.pos)),view:Object.assign({},this.app.canvas.view),focus:this.app.canvas.captureFocus(),display:this.app.canvas.captureDisplay()});if(this.history.length>25)this.history.shift();},
    commit:function(message,fit){
      var app=this.app, cv=app.canvas, self=this;
      cv.pinned.forEach(function(n){if(!self.names.has(n))cv.pinned.delete(n);});
      cv.marked.forEach(function(n){if(!self.names.has(n))cv.marked.delete(n);});
      if(cv.locked&&!this.names.has(cv.locked))cv.locked=null;
      if(app.state.selected&&!this.names.has(app.state.selected)){app.state.selected=null;cv._activeSel=null;}
      if(cv.selRel&&(!this.names.has(cv.selRel.from)||!this.names.has(cv.selRel.to))){cv.selRel=null;}
      if(!cv.selRel&&cv.hideRelPopover)cv.hideRelPopover();
      this.message=message;this._key=null;this._relationKey=null;app.canvas.workspaceNames=this.names;this.persist();
      app.sidebar._key=undefined;app.canvas.applyHighlight();app.canvas.renderLines();this.update();
      if(fit)app.canvas.fitView();app.setState({});
    },
    ensureTable:function(name){if(!this.names.has(name)&&this.app.model.byName[name]){this.names.add(name);this.app.canvas.workspaceNames=this.names;this.persist();this._key=null;this.app.canvas.refreshVisibility();this.app.canvas.renderLines();this.update();}},
    add:function(names,point){
      var self=this,app=this.app,cv=app.canvas,valid=names.filter(function(n){return !!app.model.byName[n];}),fresh=valid.filter(function(n){return !self.names.has(n);});
      if(!fresh.length&&!point){this.message='These tables are already on the canvas.';this.update();return;}
      this.snapshot();
      var pinnedDrop=false,focusSet=point&&app.state.selected&&app.state.isolate?cv.neighborhood(Array.from(cv.rootsSet()),app.state.focusDepth||1):null;
      valid.forEach(function(n,i){
        if(focusSet&&!focusSet.has(n)){cv.pinned.add(n);pinnedDrop=true;}
        self.names.add(n);if(point)cv.pos[n]={x:point.x+i*285,y:point.y};
      });
      if(fresh.length&&!point) {
        var placed=Array.from(this.names).filter(function(n){return fresh.indexOf(n)<0&&cv.pos[n];});
        var baseY=placed.length?Math.max.apply(null,placed.map(function(n){return cv.pos[n].y+(cv.cards[n]?cv.cards[n].h||110:110);}))+70:0;
        var baseX=placed.length?Math.min.apply(null,placed.map(function(n){return cv.pos[n].x;})):0;
        var cols=Math.max(1,Math.ceil(Math.sqrt(fresh.length*1.4)));
        fresh.forEach(function(n,i){cv.pos[n]={x:baseX+(i%cols)*335,y:baseY+Math.floor(i/cols)*190};});
      }
      cv.persist();
      valid.forEach(function(n){cv.layoutCard(n);});
      this.commit(pinnedDrop?'Table added and pinned to keep it visible in focus.':fresh.length+' table'+(fresh.length===1?'':'s')+' added.',!point);
      if(valid.length===1&&(!point||!app.state.selected))cv.selectTable(valid[0]);
    },
    remove:function(name){this.removeMany([name]);},
    removeMany:function(list){
      var self=this,cv=this.app.canvas,gone=list.filter(function(n){return self.names.has(n);});if(!gone.length)return;
      this.snapshot();
      gone.forEach(function(n){self.names.delete(n);cv.pinned.delete(n);cv.marked.delete(n);if(cv.locked===n)cv.locked=null;if(self.app.state.selected===n){self.app.state.selected=null;cv._activeSel=null;}});
      this.commit((gone.length===1?gone[0]+' removed':gone.length+' tables removed')+' from this layout. Undo brings '+(gone.length===1?'it':'them')+' back.',false);
    },
    blank:function(){this.snapshot();this.names=new Set();this.app.canvas.pinned.clear();this.app.canvas.locked=null;this.app.canvas._activeSel=null;this.app.canvas.selRel=null;this.app.state.selected=null;this.app.state.isolate=false;this.app.canvas.view={x:0,y:0,k:1};this.app.canvas.updateTransform();this.commit('Blank layout ready. Add a table from the library.',false);},
    /* First screen: a model nobody has arranged yet gets the chosen layout straight away,
       so "Explore all N tables" opens on a readable picture instead of the force-directed
       cloud. A model with saved positions keeps every one of them. */
    showAll:function(){
      var cv=this.app.canvas;this.snapshot();
      this.names=new Set(this.app.model.tables.map(function(t){return t.name;}));
      this.app.state.isolate=false;this.app.state.selected=null;cv._activeSel=null;
      cv.workspaceNames=this.names;
      cv.refreshVisibility();
      /* The chrome Fit has to dodge — the overview map above all, hidden while the canvas was
         empty — must be on screen before the convergence asks how much room there is. Asking
         first and rendering after is how the first screen came out laid for a viewport 150px
         taller than the one it was then drawn into. */
      this.update();
      if(!cv.hasSavedLayout||!cv.hasSavedLayout()){
        /* Lanes are cut for a zoom; the picture is then shown at whatever zoom it fits at.
           Converge the two before committing, so the chips drawn on the first screen are the
           chips the gaps between the cards were sized for. */
        var scope=new Set(this.names);
        cv.arrangeAtFitZoom(function(){cv.untangle({names:scope,quiet:true});});
        Object.keys(cv.cards).forEach(function(n){cv.layoutCard(n);});
        cv.persist();
      }
      this.commit('All model tables are on the canvas.',true);
    },
    undo:function(){var s=this.history.pop();if(!s)return;this.names=new Set(s.names);var cv=this.app.canvas;cv.pos=s.pos;cv.view=s.view;cv.persist();cv.workspaceNames=this.names;cv.restoreFocus(s.focus);cv.restoreDisplay(s.display);Object.keys(cv.cards).forEach(function(n){cv.layoutCard(n);});this.commit('Layout change undone.',false);cv.updateTransform();},
    /* Arrange applies the layout chosen under Display to the tables on this canvas only.
       Tables outside the layout — or hidden by focus — keep the positions they had. */
    arrangeSubset:function(save){
      var cv=this.app.canvas,app=this.app,ns=Array.from(this.names).filter(function(n){return !app.state.isolate||cv.cards[n]&&cv.cards[n].el.style.display!=='none';});if(!ns.length)return;
      if(save)this.snapshot();
      var root=app.state.selected&&ns.indexOf(app.state.selected)>=0?app.state.selected:null;
      /* quiet: the layout only writes positions. Moving the cards, storing them and
         redrawing happen once here instead of once inside the algorithm and again in
         commit(), which is one SVG rebuild and one fit per Arrange. */
      var scope=new Set(ns);
      cv.arrangeAtFitZoom(function(){cv.untangle({names:scope,center:root,quiet:true});});
      ns.forEach(function(n){cv.layoutCard(n);});
      cv.persist();if(cv.markArranged)cv.markArranged();
      if(save)this.commit('Visible tables arranged.',true);
      else{cv.renderLines();cv.fitView();}
    },
    setNames:function(names){var M=this.app.model;this.names=new Set(names.filter(function(n){return !!M.byName[n];}));this.commit('Saved layout restored.',false);},
    related:function(){var n=this.app.state.selected;if(!n)return null;return g.RelationshipGraph.traverse(this.app.model,[n],{direction:this.direction,maxDepth:this.depth==='direct'?1:this.depth==='two'?2:Infinity,includeInactive:this.includeInactive});},
    setFocus:function(hidden,depth){
      var cv=this.app.canvas;this.snapshot();
      this.app.state.isolate=hidden;
      this.app.state.focusDepth=depth;
      this.depth=depth===1?'direct':depth===2?'two':'all';
      this.app.sidebar._key=null;
      this.commit(hidden?'Unrelated tables are hidden. They remain in this layout.':'All layout tables are visible; unrelated tables are dimmed.',false);
      if(hidden)cv.fitView();
    },
    refreshPaths:function(){
      this.app.state.focusDepth=this.depth==='direct'?1:this.depth==='two'?2:1000000;
      this.app.sidebar._key=null;
      this.app.canvas.applyHighlight();
      this.app.setState({});
    },
    relationControls:function(){
      var self=this,app=this.app,sel=app.state.selected;if(!sel)return null;
      var result=this.related(),others=Array.from(result.names).filter(function(n){return n!==sel;}),fresh=others.filter(function(n){return !self.names.has(n);});
      var box=el('section',{cls:'ex-related','aria-label':'Explore related tables'});
      box.appendChild(el('h3',{text:'Canvas focus'}));
      var focus=el('div',{cls:'ex-focus-options',role:'group','aria-label':'Unrelated tables'});
      [[false,'Dim unrelated'],[true,'Hide unrelated']].forEach(function(o){var b=button(o[1],function(){self.setFocus(o[0],self.depth==='direct'?1:self.depth==='two'?2:1000000);});b.setAttribute('aria-pressed',String(!!app.state.isolate===o[0]));focus.appendChild(b);});
      box.appendChild(focus);
      box.appendChild(el('h3',{text:'Explore filter paths'}));
      box.appendChild(el('p',{cls:'ex-muted',text:'These settings control highlighted tables and lines, and which tables are added. Hidden tables stay in your saved view.'}));
      var direction=el('select',{'aria-label':'Relationship direction',onChange:function(e){self.direction=e.target.value;self.refreshPaths();}},[
        el('option',{value:'incoming',text:'Tables that filter this table'}),el('option',{value:'outgoing',text:'Tables filtered by this table'}),el('option',{value:'connected',text:'All connected tables'})]);direction.value=this.direction;
      var depth=el('select',{'aria-label':'Relationship distance',onChange:function(e){self.depth=e.target.value;self.refreshPaths();}},[el('option',{value:'direct',text:'Direct only'}),el('option',{value:'two',text:'Up to 2 connections'}),el('option',{value:'all',text:'Direct + indirect'})]);depth.value=this.depth;
      box.appendChild(direction);box.appendChild(depth);
      var check=el('input',{type:'checkbox',onChange:function(e){self.includeInactive=e.target.checked;self.refreshPaths();}});check.checked=this.includeInactive;
      box.appendChild(el('label',{cls:'ex-check'},[check,'Include inactive relationships']));
      box.appendChild(el('p',{text:others.length+' related · '+fresh.length+' to add',cls:'ex-related-count'}));
      var add=button('Add '+fresh.length+' to canvas',function(){self.add(others);},true);add.disabled=!fresh.length;box.appendChild(add);
      if(!others.length)box.appendChild(el('p',{cls:'ex-muted',text:'No tables match this direction and distance.'}));
      box.appendChild(el('p',{cls:'ex-muted',text:this.direction==='connected'?'Follows relationship connections in either direction.':this.includeInactive?'Potential paths including inactive relationships.':'Follows active model filter directions. DAX can change filter behavior.'}));
      var keep=new Set(Array.from(result.names)),unrelated=Array.from(this.names).filter(function(n){return !keep.has(n);});
      var prune=button('Remove '+unrelated.length+' unrelated from layout',function(){self.removeMany(unrelated);},false,'Remove every table on the canvas that is not shown as related above');
      prune.disabled=!unrelated.length;box.appendChild(prune);
      box.appendChild(button('Remove this table from layout',function(){self.remove(sel);},false));
      return box;
    },
    renderSelection:function(){
      var self=this,cv=this.app.canvas,bar=this.selbar,n=cv.marked.size,graph=this.app.state.loaded&&this.app.state.viewMode==='graph';
      bar.hidden=!graph||!n;if(bar.hidden){this._selKey=null;return;}
      var key=Array.from(cv.marked).join('\n');if(key===this._selKey)return;this._selKey=key;
      U.clear(bar);
      bar.appendChild(el('strong',{text:n+' table'+(n===1?'':'s')+' selected'}));
      bar.appendChild(button('Remove '+n+' from layout',function(){self.removeMany(Array.from(cv.marked));},true));
      bar.appendChild(button('Clear',function(){cv.setMarked([]);},false,'Clear the selection (Esc)'));
    },
    update:function(){
      var self=this,app=this.app,st=app.state,cv=app.canvas,graph=st.loaded&&st.viewMode==='graph';
      this.renderSelection();
      /* Domains borrows the Tables chrome — the same toolbar row and status line — so the two
         canvases speak one visual language instead of the old floating chip plus legend. */
      var clusters=st.loaded&&st.viewMode==='clusters';
      var width=window.innerWidth<1050?234:268,drawer=graph&&st.selected?330:0;
      this.library.hidden=!graph;this.empty.hidden=!graph;this.nav.hidden=!graph;
      this.toolbar.hidden=!graph&&!clusters;this.status.hidden=!graph&&!clusters;
      this.mapHost.hidden=!graph||!this.names.size||this.mapHidden;
      var main=document.getElementById('main');
      main.classList.toggle('ex-graph',!!graph);
      main.classList.toggle('ex-clusters',!!clusters);
      main.style.setProperty('--library-width',width+'px');
      main.style.setProperty('--inspector-width',drawer+'px');
      if(graph){cv.host.style.left=width+'px';cv.host.style.right=drawer+'px';cv.host.style.top='62px';cv.host.style.bottom='30px';}
      else if(clusters){cv.host.style.left='0';cv.host.style.right='0';cv.host.style.top='62px';cv.host.style.bottom='30px';}
      else{cv.host.style.left='0';cv.host.style.right='0';cv.host.style.top='0';cv.host.style.bottom='0';}
      cv.host.hidden = st.viewMode !== 'graph' && st.viewMode !== 'clusters';
      if(clusters){
        this.status.textContent='click a group to expand or collapse · drag to arrange · scroll to zoom';
        var ckey=[app.modelKey,app.colorBy,cv.expandedGroups?cv.expandedGroups.size:0,cv.groupOrder?cv.groupOrder.length:0,this.legendOpen,st.activeFilter].join('|');
        if(ckey!==this._clusterKey){this._clusterKey=ckey;this.renderClusterToolbar();}
        return;
      }
      this._clusterKey=null;
      if(!graph)return;
      this.empty.hidden=!!this.names.size;
      this.status.textContent=this.message || 'Drag tables onto the canvas · click a table to explore its relationships · shift+drag to select several';
      var key=[app.modelKey,this.query,this.filter,this.domain,this.source,Array.from(this.names).join('\n'),st.selected,this.history.length,st.showPresets,this.optionsOpen,cv.detailMode,cv.lineStyle,app.colorBy,app.paletteName,this.mapHidden,st.isolate,st.focusDepth].join('|');
      if(key!==this._key){this._key=key;this.renderLibrary();this.renderToolbar();this.renderEmpty();}
      this.renderNavigation();this.drawMap();
    },
    /* Domain / Source facets for the library. Source uses the same key as the colour legend
       (connector kind, or the schema for Databricks / SQL), so the two always agree. */
    facetKey:function(kind,t){return kind==='source'?this.app.srcKeyOf(t):t.domain;},
    facetLabel:function(kind,key){
      if(kind!=='source')return key;
      var kinds=this.app.SOURCE_KINDS||{};
      if(key==='manual')return 'Manual';if(key==='calculated')return 'Calculated';
      return kinds[key]?kinds[key].label:key;
    },
    facetOptions:function(kind){
      var self=this,counts={};
      this.app.model.tables.forEach(function(t){var k=self.facetKey(kind,t);counts[k]=(counts[k]||0)+1;});
      return Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b);}).map(function(k){return {key:k,label:self.facetLabel(kind,k),count:counts[k]};});
    },
    matchesLibrary:function(t){
      var q=this.query.trim().toLowerCase();
      if(this.filter==='canvas'&&!this.names.has(t.name))return false;
      if(this.filter==='available'&&this.names.has(t.name))return false;
      if(this.domain&&this.facetKey('domain',t)!==this.domain)return false;
      if(this.source&&this.facetKey('source',t)!==this.source)return false;
      return !q||[t.name,t.domain,t.role].join(' ').toLowerCase().includes(q)||t.columns.some(function(c){return c.name.toLowerCase().includes(q);});
    },
    renderLibrary:function(){
      var self=this,app=this.app,active=document.activeElement,focus=active&&active===this.input,start=focus?active.selectionStart:0,scroll=this.list?this.list.scrollTop:0;
      U.clear(this.library);
      this.library.appendChild(el('div',{cls:'ex-library-heading'},[el('div',{},[el('h2',{text:'Tables'}),el('p',{text:app.model.tables.length+' in this model'})]),el('span',{cls:'ex-count',text:String(this.names.size)+' on canvas'})]));
      this.input=el('input',{type:'search',placeholder:'Find tables or columns…','aria-label':'Search table library',value:this.query,onInput:function(e){self.query=e.target.value;self._key=null;self.update();}});this.library.appendChild(this.input);
      var filters=el('div',{cls:'ex-segments','aria-label':'Table library filter'});[['all','All tables'],['canvas','On canvas'],['available','Available']].forEach(function(p){var b=button(p[1],function(){self.filter=p[0];self._key=null;self.update();});b.setAttribute('aria-pressed',String(self.filter===p[0]));filters.appendChild(b);});this.library.appendChild(filters);
      var facets=el('div',{cls:'ex-facets'});
      [['domain','Domain','All domains'],['source','Source','All sources']].forEach(function(f){
        var opts=self.facetOptions(f[0]);if(self[f[0]]&&!opts.some(function(o){return o.key===self[f[0]];}))self[f[0]]='';
        if(opts.length<2&&!self[f[0]])return;
        var sel=el('select',{'aria-label':'Filter tables by '+f[1].toLowerCase(),onChange:function(e){self[f[0]]=e.target.value;self._key=null;self.update();}},
          [el('option',{value:'',text:f[2]})].concat(opts.map(function(o){return el('option',{value:o.key,text:o.label+' ('+o.count+')'});})));
        sel.value=self[f[0]];facets.appendChild(sel);
      });
      if(facets.children.length)this.library.appendChild(facets);
      this.list=el('div',{cls:'ex-table-list'});this.library.appendChild(this.list);
      var ts=app.model.tables.filter(function(t){return self.matchesLibrary(t);}).sort(function(a,b){return a.name.localeCompare(b.name);});
      ts.forEach(function(t){var on=self.names.has(t.name),row=el('div',{cls:'ex-table-row'+(app.state.selected===t.name?' selected':''),draggable:'true'});
        row.addEventListener('dragstart',function(e){document.getElementById('main').classList.add('ex-dragging');e.dataTransfer.setData(MIME,t.name);e.dataTransfer.effectAllowed='copy';});
        var name=el('button',{cls:'ex-table-name',title:t.name,onClick:function(){if(!on)self.add([t.name]);app.focusTable(t.name);}},[el('span',{cls:'ex-table-dot',style:'background:'+app.tableColor(t)}),el('span',{},[el('strong',{text:t.name}),el('small',{text:({dim:'Dimension',fact:'Fact',measures:'Measures',calcgroup:'Calculation group',fieldparam:'Field parameter'}[t.role]||'Table')+' · '+t.colCount+' columns'})])]);
        row.appendChild(name);var add=button(on?'−':'+',function(){if(on)self.remove(t.name);else self.add([t.name]);},false,(on?'Remove ':'Add ')+t.name+(on?' from layout':' to canvas'));add.setAttribute('aria-label',(on?'Remove ':'Add ')+t.name+(on?' from layout':' to canvas'));row.appendChild(add);self.list.appendChild(row);
      });
      if(!ts.length)this.list.appendChild(el('div',{cls:'ex-list-empty'},[el('strong',{text:'No matching tables'}),el('p',{text:'Try another name or change the filters.'})]));
      this.library.appendChild(el('div',{cls:'ex-library-footer',text:app.snapshotMode?'Changes stay in this tab. Save snapshot downloads a copy with your changes.':app.host?'Add with + or drag onto the canvas. Save view keeps your arrangement and focus in this VS Code workspace.':'Add with + or drag onto the canvas. Save view keeps your arrangement and focus in this browser.'}));
      this.list.scrollTop=scroll;if(focus){this.input.focus();this.input.setSelectionRange(start,start);}
    },
    renderToolbar:function(){
      var self=this,app=this.app,cv=app.canvas;U.clear(this.toolbar);
      this.toolbar.appendChild(el('div',{cls:'ex-workspace-title'},[el('strong',{text:'Model canvas'}),el('span',{text:this.names.size+' / '+app.model.tables.length+' tables'})]));
      this.toolbar.appendChild(button('Blank layout',function(){self.blank();}));this.toolbar.appendChild(button('Show all',function(){self.showAll();}));
      var undo=button('Undo',function(){self.undo();});undo.disabled=!this.history.length;this.toolbar.appendChild(undo);
      this.toolbar.appendChild(el('div',{cls:'ex-spacer'}));
      this.toolbar.appendChild(button('Arrange',function(){self.arrangeSubset(true);}));
      this.toolbar.appendChild(button('Save view',function(){app.setState({showPresets:true});requestAnimationFrame(function(){var input=document.getElementById('saved-view-name');if(input){input.focus();input.select();}});},true));
      this.presetsBtn=button('Saved views',function(){app.setState({showPresets:!app.state.showPresets});});
      this.presetsBtn.setAttribute('aria-expanded',String(!!app.state.showPresets));
      var layouts=el('div',{cls:'ex-menu-anchor'},[this.presetsBtn]);
      if(app.state.showPresets)layouts.appendChild(app.topbar.presetsMenu());this.toolbar.appendChild(layouts);
      this.displayBtn=button('Display',function(){self.optionsOpen=!self.optionsOpen;self._key=null;self.update();});
      this.displayBtn.setAttribute('aria-expanded',String(!!this.optionsOpen));
      var options=el('div',{cls:'ex-menu-anchor'},[this.displayBtn]);
      if(this.optionsOpen){var box=el('div',{cls:'ex-display-menu'});
        [['Auto layout',cv.layoutAlgo,[['star','Star'],['constellation','Constellation'],['layered','Layered'],['galaxy','Galaxy rows'],['columns','Star columns'],['waterfall','Waterfall'],['grid','Grid']],function(v){cv.setLayoutAlgo(v);self.arrangeSubset(true);} ],['Detail',cv.detailMode,[['auto','Auto'],['names','Names'],['cards','Cards']],function(v){cv.setDetailMode(v);} ],['Lines',cv.lineStyle,[['ortho','Straight'],['curve','Curved']],function(v){cv.setLineStyle(v);} ],['Color',app.colorBy,[['domain','Domain'],['source','Source']],function(v){cv.setColorMode(v);}],['Palette',app.paletteName,[['muted','Muted'],['vivid','Vivid']],function(v){app.setPalette(v);}]].forEach(function(p){var sel=el('select',{'aria-label':p[0],onChange:function(e){p[3](e.target.value);self._key=null;self.update();}},p[2].map(function(o){return el('option',{value:o[0],text:o[1]});}));sel.value=p[1];box.appendChild(el('label',{},[p[0],sel]));});
        box.appendChild(button(app.state.allExpanded?'Collapse all cards':'Expand all cards',function(){cv.toggleExpandAll();self.optionsOpen=false;self._key=null;self.update();}));
        box.appendChild(button(this.mapHidden?'Show overview map':'Hide overview map',function(){self.mapHidden=!self.mapHidden;self._key=null;self.update();}));
        box.appendChild(button('Table role rules',function(){app.setState({showRules:true});self.optionsOpen=false;self._key=null;self.update();}));
        box.appendChild(button('Close display settings',function(){self.optionsOpen=false;self._key=null;self.update();}));options.appendChild(box);
      }this.toolbar.appendChild(options);
    },
    /* Domains toolbar: same row, same button language as Tables. The colour key lives in a
       popover here rather than a floating panel, and the old dark hint chip is now the
       status line at the bottom. */
    renderClusterToolbar:function(){
      var self=this,app=this.app,cv=app.canvas;U.clear(this.toolbar);this._key=null;
      var groups=cv.groupOrder||[],open=cv.expandedGroups?cv.expandedGroups.size:0;
      this.toolbar.appendChild(el('div',{cls:'ex-workspace-title'},[el('strong',{text:'Domain canvas'}),
        el('span',{text:groups.length+' '+(app.colorBy==='source'?'sources':'domains')+' · '+open+' expanded'})]));
      var expand=button('Expand all',function(){cv.setAllGroups(true);self._clusterKey=null;self.update();});
      expand.disabled=!groups.length||open===groups.length;this.toolbar.appendChild(expand);
      var collapse=button('Collapse all',function(){cv.setAllGroups(false);self._clusterKey=null;self.update();});
      collapse.disabled=!open;this.toolbar.appendChild(collapse);
      this.toolbar.appendChild(el('div',{cls:'ex-spacer'}));
      this.toolbar.appendChild(button('Fit',function(){cv.fitView();},false,'Fit every group in view'));
      this.legendBtn=button('Legend',function(){self.legendOpen=!self.legendOpen;self._clusterKey=null;self.update();});
      this.legendBtn.setAttribute('aria-expanded',String(!!this.legendOpen));
      var anchor=el('div',{cls:'ex-menu-anchor'},[this.legendBtn]);
      if(this.legendOpen){
        var box=el('div',{cls:'ex-display-menu ex-legend-menu','data-canvas-overlay':true});
        box.appendChild(el('h3',{text:app.colorBy==='source'?'Source':'Domain'}));
        (app.legend&&app.legend.build?app.legend.build():[]).forEach(function(L){
          var active=app.state.activeFilter===L.key;
          var row=el('button',{cls:'ex-legend-row'+(active?' is-active':''),title:L.tip,onClick:function(){cv.setFilter(active?null:L.key);self._clusterKey=null;self.update();}},[
            el('span',{cls:'ex-legend-dot',style:'background:'+L.color}),
            el('span',{cls:'ex-legend-name',text:L.label}),
            el('span',{cls:'ex-legend-count',text:String(L.count)+(L.plus?' '+L.plus:'')})]);
          row.setAttribute('aria-pressed',String(active));box.appendChild(row);
        });
        box.appendChild(button('Close legend',function(){self.legendOpen=false;self._clusterKey=null;self.update();}));
        anchor.appendChild(box);
      }
      this.toolbar.appendChild(anchor);
    },
    renderEmpty:function(){
      var self=this,app=this.app;U.clear(this.empty);
      /* No model chosen yet (see app.js init) vs. a real model with an empty
         canvas: the first needs "pick a model", not "explore 0 tables". */
      if(!app.model.tables.length&&app.state.modelName==='Choose a model'){
        this.empty.appendChild(el('div',{cls:'ex-empty-card'},[
          el('span',{cls:'ex-eyebrow',text:'SEMANTIC MODEL VIEWER'}),el('h1',{text:'No model selected.'}),
          el('p',{text:'Open the built-in sample, import a model, or connect a repo folder to get started.'}),
          button('Choose a model',function(){app.setState({showModelMenu:true});},true)
        ]));
        return;
      }
      this.empty.appendChild(el('div',{cls:'ex-empty-card'},[
        el('span',{cls:'ex-eyebrow',text:'YOUR MODEL, ONE QUESTION AT A TIME'}),el('h1',{text:'Build a clearer picture.'}),el('p',{text:'Start with the tables you care about. Follow filter paths and discover how your model connects.'}),
        button('Explore all '+app.model.tables.length+' tables',function(){self.showAll();},true),el('p',{cls:'ex-empty-or',text:'Or start with a table from the library'})
      ]));
      var starters=app.model.tables.filter(function(t){return t.relCount>0;}).sort(function(a,b){return b.relCount-a.relCount;}).slice(0,3);
      var samples=el('div',{cls:'ex-starters'});starters.forEach(function(t){samples.appendChild(button(t.name,function(){self.add([t.name]);app.focusTable(t.name);},false,t.name+' · '+t.relCount+' relationships'));});this.empty.firstChild.appendChild(samples);
    },
    renderNavigation:function(){var cv=this.app.canvas,self=this,key=this.app.state.selected||'';if(this._navKey===key&&this.nav.firstChild){this.nav.querySelector('.ex-zoom-value').textContent=this.app.state.zoomPct;return;}this._navKey=key;U.clear(this.nav);this.nav.appendChild(button('−',function(){cv.zoomOut();},false,'Zoom out'));this.nav.appendChild(el('span',{cls:'ex-zoom-value',text:this.app.state.zoomPct}));this.nav.appendChild(button('+',function(){cv.zoomIn();},false,'Zoom in'));this.nav.appendChild(button('Fit',function(){cv.fitView();},false,'Fit all tables in this layout'));if(this.app.state.selected)this.nav.appendChild(button('Center selected',function(){cv.focusGraph(self.app.state.selected);}));},
    drawMap:function(){
      if(this._mapFrame)return;var self=this;this._mapFrame=requestAnimationFrame(function(){self._mapFrame=null;self.paintMap();});
    },
    paintMap:function(){
      if(this.mapHost.hidden)return;var cv=this.app.canvas,app=this.app,ctx=this.map.getContext('2d');if(!ctx)return;
      var ns=Array.from(this.names).filter(function(n){return cv.pos[n]&&cv.cards[n]&&cv.cards[n].el.style.display!=='none';});ctx.clearRect(0,0,200,112);if(!ns.length)return;
      /* the overview measures the drawn box, chips included, so a widened chip is never
         clipped; the box map doubles as the "is this table on the canvas" test the lines
         need, and the bounds come out of the same pass that builds it */
      var v=cv.view,view={x:-v.x/v.k,y:-v.y/v.k,w:cv.host.clientWidth/v.k,h:cv.host.clientHeight/v.k};
      var boxes={},x0=view.x,y0=view.y,x1=view.x+view.w,y1=view.y+view.h;
      ns.forEach(function(n){
        var b=cv.cardBox?cv.cardBox(n):{x:cv.pos[n].x,y:cv.pos[n].y,w:cv.CARD_W,h:cv.cards[n].h||90};
        b={x:b.x,y:b.y,w:b.w||cv.CARD_W,h:b.h||90};boxes[n]=b;
        x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h);
      });
      var scale=Math.min(184/Math.max(1,x1-x0),96/Math.max(1,y1-y0)),ox=(200-(x1-x0)*scale)/2,oy=(112-(y1-y0)*scale)/2;
      this.mapBounds={x:x0,y:y0,scale:scale,ox:ox,oy:oy};ctx.strokeStyle='#d4dbe8';ctx.lineWidth=.7;
      app.model.relationships.forEach(function(r){var a=boxes[r.from],b=boxes[r.to];if(!a||!b)return;ctx.beginPath();ctx.moveTo(ox+(a.x+a.w/2-x0)*scale,oy+(a.y+35-y0)*scale);ctx.lineTo(ox+(b.x+b.w/2-x0)*scale,oy+(b.y+35-y0)*scale);ctx.stroke();});
      ns.forEach(function(n){var p=boxes[n];ctx.fillStyle=app.tableColor(app.model.byName[n]);ctx.fillRect(ox+(p.x-x0)*scale,oy+(p.y-y0)*scale,Math.max(3,p.w*scale),Math.max(2,p.h*scale));});
      ctx.fillStyle='rgba(37,99,235,.07)';ctx.strokeStyle='#2563eb';ctx.lineWidth=1.5;var bx=ox+(view.x-x0)*scale,by=oy+(view.y-y0)*scale;ctx.fillRect(bx,by,view.w*scale,view.h*scale);ctx.strokeRect(bx,by,view.w*scale,view.h*scale);
    },
    navigateMap:function(e){var b=this.mapBounds;if(!b)return;var r=this.map.getBoundingClientRect(),cv=this.app.canvas;var x=((e.clientX-r.left)*200/r.width-b.ox)/b.scale+b.x,y=((e.clientY-r.top)*112/r.height-b.oy)/b.scale+b.y;cv.view.x=cv.host.clientWidth/2-x*cv.view.k;cv.view.y=cv.host.clientHeight/2-y*cv.view.k;cv.updateTransform();}
  };
  g.TableExplorer=TableExplorer;
})(window);
