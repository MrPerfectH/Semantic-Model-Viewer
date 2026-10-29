/* Versioned view contract shared by the CLI and the browser. No source edits. */
(function (g) {
  'use strict';
  function fail(message, details) { var error=new Error('View: '+message);error.code='VIEW_INVALID';error.details=details||{};throw error; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function resolve(model, ref) {
    if (!object(ref) || typeof ref.kind !== 'string' || typeof ref.name !== 'string') fail('object needs kind and name');
    if(ref.comparisonRow!==undefined&&(![0,1].includes(ref.comparisonRow)||ref.kind!=='measure'))fail('invalid comparison row selection');
    var matches = [];
    if (ref.kind === 'table') matches = model.tables.filter(function (t) { return t.name === ref.name; });
    else if (ref.kind === 'relationship') matches = model.relationships.filter(function (r) { return r.name === ref.name; });
    else if (ref.kind === 'query') matches = ((model.powerQuery || {}).nodes || []).filter(function (n) { return n.id === ref.name; });
    else if (ref.kind === 'column' || ref.kind === 'measure') {
      if (typeof ref.table !== 'string') fail(ref.kind + ' needs table');
      model.tables.filter(function (t) { return t.name === ref.table; }).forEach(function (t) {
        matches = matches.concat((ref.kind === 'column' ? t.columns : t.measures).filter(function (v) { return v.name === ref.name; }));
      });
    } else fail('unsupported object kind ' + ref.kind);
    if (matches.length !== 1) fail((matches.length ? 'ambiguous' : 'unknown') + ' object ' + JSON.stringify(ref),{object:ref,reason:matches.length?'ambiguous':'unknown'});
    return matches[0];
  }
  function validate(model, input) {
    if (!object(input) || ![1,2].includes(input.version)) fail('version must be 1 or 2');
    var v = JSON.parse(JSON.stringify(input));
    var allowed = ['version','mode','tables','focus','highlights','callouts','width','height','scale','chrome','crop','proposals','context','state','annotationsVisible','banner','arrange','paths','caption','comparison'];
    Object.keys(v).forEach(function (k) { if (!allowed.includes(k)) fail('unknown field ' + k); });
    v.mode = v.mode || 'graph';
    if (!['graph','measures','matrix','clusters','power-query'].includes(v.mode)) fail('unsupported mode ' + v.mode);
    v.width = v.width === undefined ? 1440 : v.width; v.height = v.height === undefined ? 1000 : v.height; v.scale = v.scale === undefined ? 2 : v.scale;
    ['width','height'].forEach(function (k) { if (!Number.isInteger(v[k]) || v[k] < (v.version===2?320:400) || v[k] > 4096) fail(k + ' must be an integer within the supported viewport range (v1: 400–4096, v2: 320–4096)'); });
    if (![1,2].includes(v.scale)) fail('scale must be 1 or 2');
    if(v.annotationsVisible!==undefined&&typeof v.annotationsVisible!=='boolean')fail('annotationsVisible must be boolean');
    if (v.arrange !== undefined && typeof v.arrange !== 'boolean') fail('arrange must be boolean');
    if(v.caption!==undefined&&(typeof v.caption!=='string'||!v.caption.trim()||v.caption.length>1000))fail('caption needs text of 1 to 1000 characters');
    if(v.paths!==undefined){
      if(!object(v.paths)||v.mode!=='graph'||Object.keys(v.paths).some(function(k){return !['direction','depth','includeInactive'].includes(k);}))fail('paths requires graph mode and direction, depth, includeInactive fields');
      if(!['both','incoming','outgoing','connected'].includes(v.paths.direction))fail('invalid paths direction');
      if(!Number.isInteger(v.paths.depth)||v.paths.depth<1||v.paths.depth>100)fail('paths depth must be 1 to 100');
      if(typeof v.paths.includeInactive!=='boolean')fail('paths includeInactive must be boolean');
    }
    if (v.tables !== undefined && object(v.tables)) {
      if(v.version!==2)fail('relative table sets require version 2');
      var spec=v.tables, selectors=['relatedTo','filteredBy','filters'].filter(function(k){return spec[k]!==undefined;});
      if(selectors.length!==1 || Object.keys(spec).some(function(k){return !['relatedTo','filteredBy','filters','depth','includeInactive'].includes(k);}))fail('relative tables need exactly one of relatedTo, filteredBy or filters');
      if(typeof spec[selectors[0]]!=='string')fail('relative table selector must be a table name');
      var root=model.tables.find(function(t){return t.name.toLowerCase()===spec[selectors[0]].toLowerCase();});
      if(!root)fail('unknown related table '+spec[selectors[0]]);
      if(spec.depth!==undefined&&(!Number.isInteger(spec.depth)||spec.depth<0||spec.depth>100))fail('relative depth must be 0 to 100');
      if(spec.includeInactive!==undefined&&typeof spec.includeInactive!=='boolean')fail('includeInactive must be boolean');
      var graph=g.RelationshipGraph;
      if(!graph && typeof require==='function')graph=require('./relationships.js');
      if(!graph)fail('relationship resolver is unavailable');
      v.tables=Array.from(graph.traverse(model,[root.name],{direction:selectors[0]==='relatedTo'?'both':selectors[0]==='filteredBy'?'outgoing':'incoming',maxDepth:spec.depth===undefined?Infinity:spec.depth,includeInactive:!!spec.includeInactive}).names);
    }
    if (v.banner !== undefined && typeof v.banner !== 'boolean') fail('banner must be boolean');
    if (v.chrome !== undefined && typeof v.chrome !== 'boolean') fail('chrome must be boolean');
    if (v.crop !== undefined && !['viewport','highlights'].includes(v.crop)) fail('crop must be viewport or highlights');
    v.highlights = v.highlights || []; v.callouts = v.callouts || [];
    if (!Array.isArray(v.highlights) || !Array.isArray(v.callouts)) fail('highlights and callouts must be arrays');
    if (v.focus) resolve(model, v.focus);
    if (v.mode === 'measures' && ((!v.focus&&v.version===1) || (v.focus&&!['measure','table','column'].includes(v.focus.kind)))) fail('measures mode requires a measure, table or column focus');
    if(v.context!==undefined){
      if(!object(v.context)||Object.keys(v.context).some(function(k){return !['depth','direction','limit'].includes(k);}))fail('invalid dependency context');
      if(v.mode!=='measures')fail('dependency context requires measures mode');
      if(!Number.isInteger(v.context.depth)||v.context.depth<0||v.context.depth>20)fail('context depth must be 0 to 20');
      if(!['up','down','both'].includes(v.context.direction))fail('context direction must be up, down or both');
      if(!Number.isInteger(v.context.limit)||v.context.limit<1||v.context.limit>500)fail('context limit must be 1 to 500');
    }
    function comparison(spec) {
      if(!object(spec)||spec.version!==1||Object.keys(spec).some(function(k){return !['version','left','right','maxMeasures','active','layout','rows','folds'].includes(k);}))fail('invalid comparison state');
      ['left','right'].forEach(function(k){if(!object(spec[k])||spec[k].kind!=='measure')fail('comparison requires two measures');resolve(model,spec[k]);});
      if(key(spec.left)===key(spec.right))fail('comparison requires two different measures');
      if(spec.maxMeasures!==undefined&&(!Number.isInteger(spec.maxMeasures)||spec.maxMeasures<1||spec.maxMeasures>200))fail('comparison maxMeasures must be 1 to 200');
      if(spec.active!==undefined&&![0,1].includes(spec.active))fail('invalid comparison active row');
      if(spec.layout!==undefined&&!['rows','tabs'].includes(spec.layout))fail('invalid comparison layout');
      if(spec.rows!==undefined&&(!Array.isArray(spec.rows)||spec.rows.length!==2||spec.rows.some(function(r){return !object(r)||r.version!==1||r.comparison;})))fail('invalid comparison rows');
      if(spec.folds!==undefined&&(!Array.isArray(spec.folds)||spec.folds.length!==2||spec.folds.some(function(r){return !object(r)||Object.values(r).some(function(v){return !object(v)||Object.values(v).some(function(b){return b!==true;});});})))fail('invalid comparison folds');
    }
    if(v.comparison!==undefined){if(v.version!==2||v.mode!=='measures')fail('comparison requires version 2 measures mode');comparison(v.comparison);v.focus=v.comparison.left;}
    if(v.state!==undefined){
      if(!object(v.state)||Object.keys(v.state).some(function(k){return !['tableView','measures','selection'].includes(k);}))fail('invalid explored state');
      if(v.state.selection)resolve(model,v.state.selection);
      if(v.state.tableView){
        var tv=v.state.tableView;
        if(!object(tv)||!object(tv.pos)||!object(tv.view)||!['x','y','k'].every(function(k){return Number.isFinite(tv.view[k]);})||tv.view.k<=0||tv.view.k>10)fail('invalid table viewport');
        Object.keys(tv.pos).forEach(function(n){resolve(model,{kind:'table',name:n});if(!object(tv.pos[n])||!['x','y'].every(function(k){return Number.isFinite(tv.pos[n][k]);}))fail('invalid table position');});
        if(tv.expanded && (!Array.isArray(tv.expanded)||tv.expanded.some(function(n){return !model.tables.some(function(t){return t.name===n;});})))fail('invalid expanded tables');
      }
      if(v.state.measures){
        var ms=v.state.measures;
        if(ms.comparison){if(v.mode!=='measures'||!v.comparison)fail('explored comparison requires authored pair');comparison(ms.comparison);if(key(ms.comparison.left)!==key(v.comparison.left)||key(ms.comparison.right)!==key(v.comparison.right))fail('explored comparison pair differs from authored pair');}
        if(ms.source){if(!object(ms.source)||typeof ms.source.table!=='string')fail('invalid dependency source');resolve(model,{kind:'table',name:ms.source.table});if(ms.source.column!=null)resolve(model,{kind:'column',table:ms.source.table,name:ms.source.column});}
        [ms.selectedMeasure,ms.comparisonMeasure].filter(Boolean).concat(ms.extraMeasures||[]).forEach(function(n){var matches=model.tables.filter(function(t){return t.measures.some(function(m){return m.name===n;});});if(matches.length!==1)fail('unknown or ambiguous explored measure '+n);});
      }
    }
    v.highlights.forEach(function (r) { resolve(model,r); });
    v.callouts.forEach(function (c) { if (!object(c) || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 240) fail('callout needs text of 1 to 240 characters'); resolve(model,c.object); });
    if (v.tables !== undefined) {
      if (!Array.isArray(v.tables) || (!v.tables.length&&v.version===1)) fail('tables must be a nonempty array');
      v.tables.forEach(function (name) { resolve(model,{kind:'table',name:name}); });
      v.tables = Array.from(new Set(v.tables));
    }
    v.proposals=v.proposals||[];
    if(!Array.isArray(v.proposals))fail('proposals must be an array');
    v.proposals.forEach(function(p){
      if(!p||!['relationship','formula','note','removal','arrow','group'].includes(p.kind))fail('unsupported proposal kind');
      if(typeof p.text!=='string'||!p.text.trim()||p.text.length>1000)fail('proposal needs text of 1 to 1000 characters');
      if(p.kind==='relationship'||p.kind==='arrow'){resolve(model,p.from);resolve(model,p.to);if(p.kind==='relationship'&&(p.from.kind!=='column'||p.to.kind!=='column'))fail('proposed relationship endpoints must be columns');if(p.kind==='relationship'&&v.mode!=='graph')fail('proposed relationships require graph mode');}
      else if(p.kind==='group'){if(!Array.isArray(p.objects)||p.objects.length<2)fail('group needs at least two objects');p.objects.forEach(function(r){resolve(model,r);});}
      else resolve(model,p.object);
    });
    return v;
  }
  function key(ref) { return JSON.stringify([ref.kind,ref.table || '',ref.name]); }
  function mark(el,ref) { el.dataset.smvKind=ref.kind; el.dataset.smvName=ref.name; if(ref.table)el.dataset.smvTable=ref.table; }
  function frame() { return new Promise(function (done) { requestAnimationFrame(function () { requestAnimationFrame(done); }); }); }
  async function apply(app, input) {
    var view=validate(app.model,input), cv=app.canvas;
    document.body.dataset.smvInteractive='1';
    var previousCaption=document.getElementById('smv-question-caption');if(previousCaption)previousCaption.remove();
    // An authored caption is accepted for compatibility but never drawn: the viewer shows the diagram, and the agent says the answer in the conversation.
    document.body.dataset.smvReady='0';delete document.body.dataset.smvError;
    var style=document.getElementById('smv-explanation-style');
    if(!style){style=document.createElement('style');style.id='smv-explanation-style';document.head.appendChild(style);}
    style.textContent='.smv-context-dim{opacity:1!important}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.smv-hl{position:fixed;border:3px solid #d64024;border-radius:8px;pointer-events:none;z-index:9000;box-sizing:border-box}.smv-callout{position:fixed;max-width:260px;padding:8px 12px;border:1px solid #d64024;border-radius:6px;background:#fff8ed;color:#572312;font:600 15px/1.4 system-ui;z-index:9001;pointer-events:none;overflow-wrap:anywhere}';
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,[data-smv-toggle]').forEach(function(n){n.remove();});
    if(view.chrome===false)style.textContent+='#topbar{display:none!important}';
    // The side-by-side workspace header already names the model and owns the appearance choice.
    else if(g.SMV_WORKSPACE_EMBEDDED)style.textContent+='#topbar .ex-brand,#topbar .ex-theme-select{display:none!important}#topbar{min-height:0!important;padding:6px 12px!important;flex-wrap:nowrap!important;justify-content:space-between}#topbar .ex-main-nav{order:0!important;width:auto!important;flex:0 1 auto;justify-content:flex-start!important;min-width:0;margin:0!important;overflow-x:auto;scrollbar-width:none}#topbar .ex-main-nav button{padding:8px 10px}#topbar .ex-header-actions{flex:0 0 auto!important;width:auto!important;min-width:0!important;margin-left:auto}';
    // An answer view opens on the diagram alone; Tools restores the editing chrome on demand.
    if(app.explorer)app.explorer.setCompact(true);
    if(app.measures)app.measures._compact=true;
    if(view.tables && app.explorer){app.explorer.blank();app.explorer.add(view.tables);}
    app.setState({showStandalone:true,search:'',activeFilter:null});
    app.setViewMode(view.mode);
    await frame();
    if(app.measures.comparison)app.measures.clearComparison();
    if(view.mode==='measures'&&view.comparison){
      app.measures.setComparison(view.comparison);
      await frame();
    } else if(view.mode==='measures'){
      app.measures._explanationContext=view.context||null;app.measures._gC=null;app.measures._wrapDax=true;
      if(!view.focus||view.focus.kind==='measure')app.setState({selMeasure:view.focus?view.focus.name:null,dependencySource:null,mvSourceMode:'measures',gPin:null,gExtra:{},gHover:null});
      else app.measures.analyzeSource(view.focus.kind==='table'?view.focus.name:view.focus.table,view.focus.kind==='column'?view.focus.name:null);
      await frame();
      var measureState=app.measures.captureSnapshot();measureState.preferences=Object.assign({},measureState.preferences,{mode:innerWidth<900?'graph':'split',orientation:'auto',wrap:true});measureState.library.collapsed=!!view.focus;measureState.graph={autoFit:true};app.measures.restoreSnapshot(measureState);
    }
    var refs=view.highlights.concat(view.callouts.map(function(c){return c.object;}));
    if(view.focus)refs.push(view.focus);
    view.proposals.forEach(function(p){if(p.kind==='relationship'||p.kind==='arrow')refs.push(p.from,p.to);else if(p.kind==='group')refs=refs.concat(p.objects);else refs.push(p.object);});
    if(view.mode==='graph' || view.mode==='clusters'){

      refs.forEach(function(r){
        var names=r.kind==='relationship'?[resolve(app.model,r).from,resolve(app.model,r).to]:[r.table || (r.kind==='table'?r.name:null)];
        names.filter(Boolean).forEach(function(n){if(app.explorer)app.explorer.ensureTable(n);});
        if(r.kind==='column' || r.kind==='measure'){var c=cv.cards[r.table];if(c&&!c.expanded)cv.toggleCard(r.table);}
      });
      if(!view.state||!view.state.tableView){var endpoints=[];if(view.focus&&view.focus.kind==='relationship'){var relationship=resolve(app.model,view.focus);endpoints=[relationship.from,relationship.to];}var expanded=Array.from(new Set(endpoints.concat(refs.filter(function(r){return r.kind==='column';}).map(function(r){return r.table;}))));cv.restoreDisplay({detail:expanded.length?'cards':'auto',expanded:expanded});}
      await frame();
      if(view.mode==='clusters'&&cv.groups){Object.keys(cv.groups).forEach(function(k){cv.expandedGroups.add(k);});cv.reflowClusters();cv.refreshVisibility();}
      cv.fitView();
    }
    if(view.focus&&(view.mode==='graph'||view.mode==='clusters')){
      if(view.focus.kind==='relationship')cv.selectRel(resolve(app.model,view.focus));
      else if(view.focus.kind==='table'||view.focus.kind==='column')cv.selectTable(view.focus.table||view.focus.name,{keepView:true});
    }
    if(view.paths&&app.explorer){app.explorer.direction=view.paths.direction;app.explorer.includeInactive=view.paths.includeInactive;app.explorer.depth=view.paths.depth===1?'direct':view.paths.depth===2?'two':'all';app.explorer.refreshPaths();}
    // Arrange newly authored table sets after native focus is set. Restored
    // explored state below keeps its exact positions and viewport.
    if(view.mode==='graph' && view.arrange!==false && (view.tables||view.arrange===true) && !(view.state&&view.state.tableView) && app.explorer){await frame();app.explorer.arrangeSubset(false);}
    if(view.state){
      if(view.state.tableView){var tv=view.state.tableView;Object.keys(tv.pos).forEach(function(n){cv.pos[n]=Object.assign({},tv.pos[n]);if(cv.cards[n]){cv.cards[n].x=tv.pos[n].x;cv.cards[n].y=tv.pos[n].y;cv.cards[n].el.style.left=tv.pos[n].x+'px';cv.cards[n].el.style.top=tv.pos[n].y+'px';}});if(tv.display)cv.restoreDisplay(tv.display);else if(tv.expanded)cv.restoreDisplay({expanded:tv.expanded});if(tv.focus)cv.restoreFocus(tv.focus);cv.view=Object.assign({},tv.view);cv.updateTransform();cv.renderLines();}
      if(view.state.measures)app.measures.restoreSnapshot(view.state.measures);
      if(view.state.selection&&view.state.selection.kind==='relationship')cv.selectRel(resolve(app.model,view.state.selection));
    }
    if(view.arrange===true&&view.mode==='graph'&&view.state&&view.state.tableView&&app.explorer){await frame();app.explorer.arrangeSubset(false);}
    if(view.mode==='power-query'){
      var deadline=Date.now()+15000;while(!app.powerQueryWorkspace.context){if(Date.now()>deadline||app.powerQueryWorkspace.phase==='error')fail('Power Query analysis failed or timed out');await new Promise(function(done){setTimeout(done,20);});}
    }
    if(view.mode==='power-query' && view.focus){
      if(view.focus.kind!=='query')fail('power-query focus must be query');
      if(!app.powerQueryWorkspace || !app.powerQueryWorkspace.context)fail('Power Query context is unavailable');
      var node=app.powerQueryWorkspace.context.graph.nodes.find(function(n){return n.metadataId===view.focus.name;});if(!node)fail('query is missing from the analyzed graph');app.powerQueryWorkspace.analyzeQuery(node.id);
    }
    await document.fonts.ready; await frame(); await frame();
    var identity=document.querySelector('.ex-snapshot-identity small');if(identity)identity.textContent='Model explanation';
    // Semantic hooks also apply to nodes created before this adapter was loaded.
    Object.keys(cv.cards || {}).forEach(function(n){var c=cv.cards[n];mark(c.el,{kind:'table',name:n});Object.keys(c.colRows).forEach(function(k){mark(c.colRows[k],{kind:'column',table:n,name:k});});});
    Object.keys(app.measures._nodeEls || {}).forEach(function(n){var table=app.model.tables.find(function(t){return t.measures.some(function(m){return m.name===n;});});if(table)mark(app.measures._nodeEls[n].btn,{kind:'measure',table:table.name,name:n});});
    document.querySelectorAll('.pqc-node').forEach(function(n){var entry=app.powerQueryWorkspace.context.byNodeId.get(n.dataset.nodeId);if(entry&&entry.metadataRow)mark(n,{kind:'query',name:entry.metadataRow.id});});
    function target(ref,includeOffscreen){
      var candidates=Array.from(document.querySelectorAll('[data-smv-kind]')).filter(function(el){return el.dataset.smvKind===ref.kind && el.dataset.smvName===ref.name && (!ref.table || el.dataset.smvTable===ref.table) && (ref.comparisonRow===undefined || !!el.closest('[data-comparison-row="'+ref.comparisonRow+'"]'));});
      if(ref.kind==='measure')candidates.sort(function(a,b){return Number(b.classList.contains('mv-dax-card'))-Number(a.classList.contains('mv-dax-card'));});
      return candidates.find(function(el){var b=el.getBoundingClientRect();return (b.width>0&&(b.height>0||ref.kind==='relationship'))&&(includeOffscreen||b.right>0&&b.bottom>0&&b.left<innerWidth&&b.top<innerHeight);});
    }
    if(view.mode==='matrix'&&view.focus){var matrixTarget=target(view.focus,true);if(matrixTarget)matrixTarget.scrollIntoView({block:'center',inline:'center'});await frame();}
    document.querySelectorAll('.smv-context-dim').forEach(function(n){n.classList.remove('smv-context-dim');});
    if(refs.length){
      document.querySelectorAll('[data-smv-kind]').forEach(function(n){
        var kind=n.dataset.smvKind,name=n.dataset.smvName,table=n.dataset.smvTable;
        if(kind==='column')return;
        var match=refs.some(function(r){if(kind==='table'&&(r.table===name||r.kind==='table'&&r.name===name))return true;if(r.kind==='relationship'&&kind==='table'){var rel=resolve(app.model,r);return rel.from===name||rel.to===name;}return r.kind===kind&&r.name===name&&(!r.table||r.table===table);});
        if(!match)n.classList.add('smv-context-dim');
      });
    }
    var annotated=g.SMVInteractive?g.SMVInteractive.annotations(app,view,refs,target):null;
    var seen=new Set(refs.map(key));
    var clip=annotated?annotated.clip:{x:0,y:0,width:innerWidth,height:innerHeight};
    // Fit promotes the canvas for gestures and normally releases it after 160ms.
    // Finish that gesture now so capture cannot race the compositor layer change.
    await frame();
    if(cv.releaseLayer)cv.releaseLayer();
    // Flush paint and relationship-line work queued while applying the final overlays.
    await frame(); await frame();
    document.body.dataset.smvReady='1';return {view:view,clip:clip,objects:Array.from(seen)};
  }
  function start(input){
    var promise=(async function(){var end=Date.now()+15000;while(!g.app || !g.app.state.loaded){if(Date.now()>end)fail('viewer load timed out');await new Promise(function(done){setTimeout(done,20);});}return apply(g.app,input);})();
    g.smv={ready:function(){return promise;},apply:function(v){promise=apply(g.app,v);promise.catch(function(e){document.body.dataset.smvError=e.message;});return promise;}};
    if(g.SMVInteractive)g.SMVInteractive.connect(g.smv,input);
    promise.catch(function(e){document.body.dataset.smvError=e.message;});return promise;
  }
  var api={validate:validate,resolve:resolve,apply:apply,start:start};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.SMVExplanation=api;
})(typeof window==='undefined'?globalThis:window);
