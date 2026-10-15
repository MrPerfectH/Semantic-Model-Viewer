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
    if (!object(input) || input.version !== 1) fail('version must be 1');
    var v = JSON.parse(JSON.stringify(input));
    var allowed = ['version','mode','tables','focus','highlights','callouts','width','height','scale','chrome','crop','proposals'];
    Object.keys(v).forEach(function (k) { if (!allowed.includes(k)) fail('unknown field ' + k); });
    v.mode = v.mode || 'graph';
    if (!['graph','measures','matrix','clusters','power-query'].includes(v.mode)) fail('unsupported mode ' + v.mode);
    v.width = v.width === undefined ? 1440 : v.width; v.height = v.height === undefined ? 1000 : v.height; v.scale = v.scale === undefined ? 2 : v.scale;
    ['width','height'].forEach(function (k) { if (!Number.isInteger(v[k]) || v[k] < 400 || v[k] > 4096) fail(k + ' must be an integer from 400 to 4096'); });
    if (![1,2].includes(v.scale)) fail('scale must be 1 or 2');
    if (v.chrome !== undefined && typeof v.chrome !== 'boolean') fail('chrome must be boolean');
    if (v.crop !== undefined && !['viewport','highlights'].includes(v.crop)) fail('crop must be viewport or highlights');
    v.highlights = v.highlights || []; v.callouts = v.callouts || [];
    if (!Array.isArray(v.highlights) || !Array.isArray(v.callouts)) fail('highlights and callouts must be arrays');
    if (v.focus) resolve(model, v.focus);
    if (v.mode === 'measures' && (!v.focus || v.focus.kind !== 'measure')) fail('measures mode requires a measure focus');
    v.highlights.forEach(function (r) { resolve(model,r); });
    v.callouts.forEach(function (c) { if (!object(c) || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 240) fail('callout needs text of 1 to 240 characters'); resolve(model,c.object); });
    if (v.tables !== undefined) {
      if (!Array.isArray(v.tables) || !v.tables.length) fail('tables must be a nonempty array');
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
    document.body.dataset.smvReady='0';delete document.body.dataset.smvError;
    var style=document.getElementById('smv-explanation-style');
    if(!style){style=document.createElement('style');style.id='smv-explanation-style';document.head.appendChild(style);}
    style.textContent='.smv-context-dim{opacity:.32!important}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.smv-hl{position:fixed;border:3px solid #d64024;border-radius:8px;pointer-events:none;z-index:9000;box-sizing:border-box}.smv-callout{position:fixed;max-width:260px;padding:8px 12px;border:1px solid #d64024;border-radius:6px;background:#fff8ed;color:#572312;font:600 15px/1.4 system-ui;z-index:9001;pointer-events:none;overflow-wrap:anywhere}';
    document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,[data-smv-toggle]').forEach(function(n){n.remove();});
    if(view.chrome===false)style.textContent+='#topbar{display:none!important}';
    if(view.chrome===false && app.explorer){app.explorer.libraryHidden=true;app.explorer.inspectorHidden=true;app.explorer.mapHidden=true;app.explorer.update();}
    if(view.tables && app.explorer){app.explorer.blank();app.explorer.add(view.tables,{x:100,y:100});}
    app.setState({showStandalone:true,search:'',activeFilter:null});
    app.setViewMode(view.mode);
    await frame();
    if(view.mode==='measures'){
      app.setState({selMeasure:view.focus.name,gPin:null});
      app.measures.setWorkspaceMode('split');
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
      await frame();
      if(view.mode==='clusters'&&cv.groups){Object.keys(cv.groups).forEach(function(k){cv.expandedGroups.add(k);});cv.reflowClusters();cv.refreshVisibility();}
      cv.fitView();
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
    var boxes=[],seen=new Set();
    refs.forEach(function(ref){
      if(seen.has(key(ref)))return;seen.add(key(ref));
      var el=target(ref);if(!el)fail('object is not visible in '+view.mode+': '+JSON.stringify(ref));
      var b=el.getBoundingClientRect();
      if(b.left<0||b.top<0||b.right>innerWidth+1||b.bottom>innerHeight+1)fail('object is clipped; increase viewport or reduce context: '+JSON.stringify(ref));
      var ring=document.createElement('div');ring.className='smv-hl';ring.style.cssText='left:'+Math.max(0,b.left-4)+'px;top:'+Math.max(0,b.top-4)+'px;width:'+(b.width+8)+'px;height:'+(b.height+8)+'px';document.body.appendChild(ring);boxes.push(ring.getBoundingClientRect());
    });
    var lastBottom=8;
    view.callouts.forEach(function(c){var b=target(c.object).getBoundingClientRect(),el=document.createElement('div');el.className='smv-callout';el.textContent=c.text;document.body.appendChild(el);var w=el.offsetWidth,h=el.offsetHeight;var left=Math.max(8,Math.min(innerWidth-w-8,b.left)),top=Math.max(lastBottom,Math.min(innerHeight-h-8,b.bottom+12));if(top+h>innerHeight-8)fail('callouts do not fit; increase height or reduce labels');el.style.left=left+'px';el.style.top=top+'px';lastBottom=top+h+8;boxes.push(el.getBoundingClientRect());});
    view.proposals.forEach(function(p){
      var anchor=target(p.object||p.to||(p.objects&&p.objects[0]));if(!anchor)fail('proposal anchor is not visible');
      if(p.kind==='relationship'||p.kind==='arrow'){
        var a=target(p.from).getBoundingClientRect(),b=target(p.to).getBoundingClientRect();
        var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('smv-proposal');svg.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9002';
        var line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',a.right);line.setAttribute('y1',a.top+a.height/2);line.setAttribute('x2',b.left);line.setAttribute('y2',b.top+b.height/2);line.setAttribute('stroke','#7c3aed');line.setAttribute('stroke-width','4');line.setAttribute('stroke-dasharray','8 6');if(p.kind==='arrow'){
          var defs=document.createElementNS(svg.namespaceURI,'defs'),marker=document.createElementNS(svg.namespaceURI,'marker'),head=document.createElementNS(svg.namespaceURI,'path'),markerId='smv-arrow-'+document.querySelectorAll('.smv-proposal').length;
          marker.setAttribute('id',markerId);marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('orient','auto');head.setAttribute('d','M 0 0 L 10 5 L 0 10 z');head.setAttribute('fill','#7c3aed');marker.appendChild(head);defs.appendChild(marker);svg.appendChild(defs);line.setAttribute('marker-end','url(#'+markerId+')');
        }
        svg.appendChild(line);document.body.appendChild(svg);
      }
      if(p.kind==='group'){
        var bounds=p.objects.map(function(r){return target(r).getBoundingClientRect();}),left=Math.min.apply(null,bounds.map(function(b){return b.left;})),top=Math.min.apply(null,bounds.map(function(b){return b.top;})),right=Math.max.apply(null,bounds.map(function(b){return b.right;})),bottom=Math.max.apply(null,bounds.map(function(b){return b.bottom;}));
        var group=document.createElement('div');group.className='smv-hl smv-proposal';group.style.cssText='left:'+Math.max(0,left-8)+'px;top:'+Math.max(0,top-8)+'px;width:'+(right-left+16)+'px;height:'+(bottom-top+16)+'px;border:2px dashed #7c3aed';document.body.appendChild(group);boxes.push(group.getBoundingClientRect());
      }
      var note=document.createElement('div');note.className='smv-callout smv-proposal';note.textContent='Proposed '+p.kind+': '+p.text;note.style.borderColor='#7c3aed';note.style.maxWidth='420px';note.style.whiteSpace='pre-wrap';document.body.appendChild(note);
      var b=anchor.getBoundingClientRect(),top=Math.max(lastBottom,Math.min(innerHeight-note.offsetHeight-8,b.bottom+12));if(top+note.offsetHeight>innerHeight)fail('proposal does not fit; increase viewport height');note.style.left=Math.max(8,Math.min(innerWidth-note.offsetWidth-8,b.left))+'px';note.style.top=top+'px';lastBottom=top+note.offsetHeight+8;boxes.push(note.getBoundingClientRect());
    });
    if(view.proposals.length){var toggle=document.createElement('button');toggle.dataset.smvToggle='1';toggle.textContent='Hide proposals';toggle.style.cssText='position:fixed;top:8px;right:8px;z-index:9999;padding:8px';toggle.onclick=function(){var hidden=toggle.textContent==='Hide proposals';document.querySelectorAll('.smv-proposal').forEach(function(n){n.style.visibility=hidden?'hidden':'';});toggle.textContent=hidden?'Show proposals':'Hide proposals';};document.body.appendChild(toggle);}
    var clip={x:0,y:0,width:innerWidth,height:innerHeight};
    if(view.crop==='highlights'&&boxes.length){var x=Math.max(0,Math.min.apply(null,boxes.map(function(b){return b.left;}))-24),y=Math.max(0,Math.min.apply(null,boxes.map(function(b){return b.top;}))-24);clip={x:x,y:y,width:Math.min(innerWidth,Math.max.apply(null,boxes.map(function(b){return b.right;}))+24)-x,height:Math.min(innerHeight,Math.max.apply(null,boxes.map(function(b){return b.bottom;}))+24)-y};}
    // Flush paint and relationship-line work queued while applying the final overlays.
    await frame(); await frame();
    document.body.dataset.smvReady='1';return {view:view,clip:clip,objects:Array.from(seen)};
  }
  function start(input){
    var promise=(async function(){var end=Date.now()+15000;while(!g.app || !g.app.state.loaded){if(Date.now()>end)fail('viewer load timed out');await new Promise(function(done){setTimeout(done,20);});}return apply(g.app,input);})();
    ['pointerdown','wheel','keydown','resize'].forEach(function(event){g.addEventListener(event,function(e){if(e.target&&e.target.closest&&e.target.closest('[data-smv-toggle]'))return;document.querySelectorAll('.smv-context-dim').forEach(function(n){n.classList.remove('smv-context-dim');});document.querySelectorAll('.smv-hl,.smv-callout,.smv-proposal,[data-smv-toggle]').forEach(function(n){n.remove();});});});
    g.smv={ready:function(){return promise;},apply:function(v){promise=apply(g.app,v);promise.catch(function(e){document.body.dataset.smvError=e.message;});return promise;}};
    promise.catch(function(e){document.body.dataset.smvError=e.message;});return promise;
  }
  var api={validate:validate,resolve:resolve,apply:apply,start:start};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.SMVExplanation=api;
})(typeof window==='undefined'?globalThis:window);
