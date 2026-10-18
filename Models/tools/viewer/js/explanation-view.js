/* Versioned view contract shared by the CLI and the browser. No source edits. */
(function (g) {
  'use strict';
  function fail(message, details) { var error=new Error('View: '+message);error.code='VIEW_INVALID';error.details=details||{};throw error; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function resolve(model, ref) {
    if (!object(ref) || typeof ref.kind !== 'string' || typeof ref.name !== 'string') fail('object needs kind and name');
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
    var allowed = ['version','mode','tables','focus','highlights','callouts','width','height','scale','chrome','crop','proposals','context','state','annotationsVisible'];
    Object.keys(v).forEach(function (k) { if (!allowed.includes(k)) fail('unknown field ' + k); });
    v.mode = v.mode || 'graph';
    if (!['graph','measures','matrix','clusters','power-query'].includes(v.mode)) fail('unsupported mode ' + v.mode);
    v.width = v.width === undefined ? 1440 : v.width; v.height = v.height === undefined ? 1000 : v.height; v.scale = v.scale === undefined ? 2 : v.scale;
    ['width','height'].forEach(function (k) { if (!Number.isInteger(v[k]) || v[k] < (v.version===2?320:400) || v[k] > 4096) fail(k + ' must be an integer within the supported viewport range (v1: 400–4096, v2: 320–4096)'); });
    if (![1,2].includes(v.scale)) fail('scale must be 1 or 2');
    if(v.annotationsVisible!==undefined&&typeof v.annotationsVisible!=='boolean')fail('annotationsVisible must be boolean');
    if (v.chrome !== undefined && typeof v.chrome !== 'boolean') fail('chrome must be boolean');
    if (v.crop !== undefined && !['viewport','highlights'].includes(v.crop)) fail('crop must be viewport or highlights');
    v.highlights = v.highlights || []; v.callouts = v.callouts || [];
    if (!Array.isArray(v.highlights) || !Array.isArray(v.callouts)) fail('highlights and callouts must be arrays');
    if (v.focus) resolve(model, v.focus);
    if (v.mode === 'measures' && (!v.focus || v.focus.kind !== 'measure')) fail('measures mode requires a measure focus');
    if(v.context!==undefined){
      if(!object(v.context)||Object.keys(v.context).some(function(k){return !['depth','direction','limit'].includes(k);}))fail('invalid dependency context');
      if(v.mode!=='measures')fail('dependency context requires measures mode');
      if(!Number.isInteger(v.context.depth)||v.context.depth<0||v.context.depth>20)fail('context depth must be 0 to 20');
      if(!['up','down','both'].includes(v.context.direction))fail('context direction must be up, down or both');
      if(!Number.isInteger(v.context.limit)||v.context.limit<1||v.context.limit>500)fail('context limit must be 1 to 500');
    }
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
    document.body.dataset.smvReady='0';delete document.body.dataset.smvError;
    var style=document.getElementById('smv-explanation-style');
    if(!style){style=document.createElement('style');style.id='smv-explanation-style';document.head.appendChild(style);}
    style.textContent='.smv-context-dim{opacity:1!important}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.smv-hl{position:fixed;border:3px solid #d64024;border-radius:8px;pointer-events:none;z-index:9000;box-sizing:border-box}.smv-callout{position:fixed;max-width:260px;padding:8px 12px;border:1px solid #d64024;border-radius:6px;background:#fff8ed;color:#572312;font:600 15px/1.4 system-ui;z-index:9001;pointer-events:none;overflow-wrap:anywhere}';
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,[data-smv-toggle]').forEach(function(n){n.remove();});
    if(view.chrome===false)style.textContent+='#topbar{display:none!important}';
    if(app.explorer){app.explorer.libraryHidden=view.chrome===false;app.explorer.inspectorHidden=view.chrome===false;app.explorer.mapHidden=view.chrome===false;app.explorer.update();}
    if(view.chrome===false && app.explorer){app.explorer.libraryHidden=true;app.explorer.inspectorHidden=true;app.explorer.mapHidden=true;app.explorer.update();}
    if(view.tables && app.explorer){app.explorer.blank();app.explorer.add(view.tables,{x:100,y:100});}
    app.setState({showStandalone:true,search:'',activeFilter:null});
    app.setViewMode(view.mode);
    await frame();
    if(view.mode==='measures'){
      app.measures._explanationContext=view.context||null;app.measures._gC=null;app.measures._wrapDax=true;
      app.setState({selMeasure:view.focus.name,gPin:null,gExtra:{},gHover:null});
      await frame();
      app.measures.restoreSnapshot({version:1,selectedMeasure:view.focus.name,preferences:{mode:innerWidth<900?'graph':'split',orientation:'tb',wrap:true},graph:{autoFit:true}});
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
      if(!view.state||!view.state.tableView){var endpoints=[];if(view.focus&&view.focus.kind==='relationship'){var relationship=resolve(app.model,view.focus);endpoints=[relationship.from,relationship.to];}cv.restoreDisplay({detail:'cards',expanded:Array.from(new Set(endpoints.concat(refs.filter(function(r){return r.kind==='column';}).map(function(r){return r.table;}))))});}
      await frame();
      if(view.mode==='clusters'&&cv.groups){Object.keys(cv.groups).forEach(function(k){cv.expandedGroups.add(k);});cv.reflowClusters();cv.refreshVisibility();}
      cv.fitView();
    }
    if(view.focus&&(view.mode==='graph'||view.mode==='clusters')){
      if(view.focus.kind==='relationship')cv.selectRel(resolve(app.model,view.focus));
      else if(view.focus.kind==='table'||view.focus.kind==='column')cv.selectTable(view.focus.table||view.focus.name,{keepView:true});
    }
    if(view.state){
      if(view.state.tableView){var tv=view.state.tableView;Object.keys(tv.pos).forEach(function(n){cv.pos[n]=Object.assign({},tv.pos[n]);if(cv.cards[n]){cv.cards[n].x=tv.pos[n].x;cv.cards[n].y=tv.pos[n].y;cv.cards[n].el.style.left=tv.pos[n].x+'px';cv.cards[n].el.style.top=tv.pos[n].y+'px';}});if(tv.display)cv.restoreDisplay(tv.display);else if(tv.expanded)cv.restoreDisplay({expanded:tv.expanded});if(tv.focus)cv.restoreFocus(tv.focus);cv.view=Object.assign({},tv.view);cv.updateTransform();cv.renderLines();}
      if(view.state.measures)app.measures.restoreSnapshot(view.state.measures);
      if(view.state.selection&&view.state.selection.kind==='relationship')cv.selectRel(resolve(app.model,view.state.selection));
    }
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
      var candidates=Array.from(document.querySelectorAll('[data-smv-kind]')).filter(function(el){return el.dataset.smvKind===ref.kind && el.dataset.smvName===ref.name && (!ref.table || el.dataset.smvTable===ref.table);});
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
