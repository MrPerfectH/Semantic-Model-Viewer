/* Portable model snapshots. Only analytical metadata is included; runtime handles,
   raw import files and data-source connection settings never enter the package. */
(function (g) {
  'use strict';
  var FORMAT = 'semantic-model-viewer', VERSION = 1;
  var FILES = ['js/util.js', 'js/snapshot.js', 'js/usage-adapter.js', 'js/roles.js', 'js/tmdl-parser.js', 'js/workspace-ui.js', 'js/canvas.js', 'js/layouts.js',
    'js/matrix.js', 'js/dax-format.js', 'js/measures.js', 'js/power-query-dependencies.js', 'js/power-query-graph-model.js', 'js/power-query-canvas.js', 'js/power-query-inspector.js', 'js/power-query-workspace.js', 'js/power-query-lineage.js', 'js/power-query.js', 'js/sidebar.js', 'js/topbar.js', 'js/rules.js', 'js/relationships.js', 'js/explorer.js', 'js/app.js', 'explorer.css', 'measures.css', 'power-query.css', 'power-query-canvas.css', 'power-query-inspector.css', 'power-query-workspace.css', 'power-query-lineage.css'];
  var CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  function clone(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function pick(value, keys) {
    var out = {};
    keys.forEach(function (key) { if (value && Object.prototype.hasOwnProperty.call(value, key) && ['string','number','boolean'].includes(typeof value[key])) out[key] = value[key]; });
    return out;
  }
  function escapeHTML(text) { return String(text).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function safeJSON(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  function assetPath(url) { return String(url).replace(/^\.\//, '').split(/[?#]/)[0]; }
  function modelData(model) {
    return { name: String(model.name || ''), tables: model.tables.map(function(t){
      var row = pick(t, ['name','domain','role','baseRole','autoRole','roleVia','ann','description','hidden']);
      row.columns = (t.columns || []).map(function(c){return pick(c,['name','dataType','hidden','isCalc','isKey','rel','description','dax']);});
      row.measures = (t.measures || []).map(function(m){var measure=pick(m,['name','dax','fmt','folder','h','description']);measure.dax=String(measure.dax||'');return measure;});
      if (typeof t.dax === 'string' && t.dax) row.dax = t.dax;
      if (Array.isArray(t.calcItems)) row.calcItems = t.calcItems.map(function(ci){return pick(ci,['name','dax','fmt']);});
      row.colCount = row.columns.length; row.measureCount = row.measures.length;
      // Human-readable source identity is useful; endpoints and raw query text are not required to explore the model.
      row.source = pick(t.source, ['kind','schema','table','via']);
      if (!row.source.kind) row.source.kind = 'other';
      return row;
    }), relationships: (model.relationships || []).map(function(r){return pick(r,['name','from','to','fromCol','toCol','fromCard','toCard','both','inactive','isActive','crossFilteringBehavior']);}) };
  }
  function usageData(app) {
    if (!app._usage) return null;
    var measures = {};
    Object.keys(app._usage).forEach(function(name){
      Object.defineProperty(measures,name,{value:(Array.isArray(app._usage[name])?app._usage[name]:[]).map(function(row){return pick(row,['p','v','f','r']);}),enumerable:true,writable:true,configurable:true});
    });
    function statuses(records) {
      var out = {};
      Object.keys(records || {}).forEach(function (name) { Object.defineProperty(out,name,{value:pick(records[name], ['status','raw','risk']),enumerable:true,writable:true,configurable:true}); });
      return out;
    }
    return { measures: measures, meta: pick(app._usageMeta,['source','report','model','pageCount','scanned']),
      status: statuses(app._usageStatus), columns: statuses(app._usageCols) };
  }
  function capture(app) {
    if (!app.model || !Array.isArray(app.model.tables)) throw new Error('Open a model before saving a snapshot.');
    var cv=app.canvas,ex=app.explorer,model=modelData(app.model);
    model.name=String(app.state.modelName || model.name || 'Semantic model');
    var tableView=app.captureTableView?clone(app.captureTableView()):{version:2,name:'Snapshot starting view',tables:cv.workspaceNames?Array.from(cv.workspaceNames):model.tables.map(function(t){return t.name;}),
      pos:clone(cv.pos),view:clone(app.state.viewMode==='graph'?cv.view:(app._tableViewport||cv.view)),focus:cv.captureFocus(),display:cv.captureDisplay()};
    return {format:FORMAT,version:VERSION,name:model.name,createdAt:new Date().toISOString(),model:model,usage:usageData(app),
      settings:{roleRules:app.getRules?app.getRules().map(function(r){return pick(r,['role','name','sides','measures','kind']);}):[]},
      workspace:{viewMode:app.state.viewMode,tableView:tableView,presets:clone(cv.getPresets()),matrix:app.captureMatrix?clone(app.captureMatrix()):null,
        explorer:ex?{query:ex.query,filter:ex.filter,direction:ex.direction,depth:ex.depth,includeInactive:!!ex.includeInactive,mapHidden:!!ex.mapHidden}:{},
        domains:app.captureDomains?clone(app.captureDomains()):{expandedGroups:Array.from(cv.expandedGroups || []),positions:Object.keys(cv.groups || {}).map(function(key){var group=cv.groups[key];return {key:key,x:group.x,y:group.y};}),tablePositions:clone(cv.cpos || {}),view:clone(cv.view)}},
      measures:app.measures.captureSnapshot?app.measures.captureSnapshot():null};
  }
  function validate(payload) {
    if (!payload || payload.format!==FORMAT || payload.version!==VERSION) throw new Error('This snapshot format is not supported by this viewer.');
    if (!payload.model || !Array.isArray(payload.model.tables) || !Array.isArray(payload.model.relationships)) throw new Error('The snapshot does not contain a valid model.');
    if (!Number.isFinite(Date.parse(payload.createdAt))) throw new Error('The snapshot creation date is invalid.');
    payload.model.tables.forEach(function(t){
      if(!t||typeof t.name!=='string'||!Array.isArray(t.columns)||!Array.isArray(t.measures)) throw new Error('The snapshot contains an invalid table.');
      t.columns.forEach(function(c){if(!c||typeof c.name!=='string')throw new Error('The snapshot contains an invalid column.');});
      t.measures.forEach(function(m){if(!m||typeof m.name!=='string'||typeof m.dax!=='string')throw new Error('The snapshot contains an invalid measure.');});
    });
    payload.model.relationships.forEach(function(r){if(!r||typeof r.from!=='string'||typeof r.to!=='string')throw new Error('The snapshot contains an invalid relationship.');});
    return payload;
  }
  function seedStorage(payload) {
    var ws=payload.workspace||{},tv=ws.tableView||{},d=tv.display||{},mv=payload.measures||{},prefs=mv.preferences||{},seed={};
    seed.smv_presets_snapshot=JSON.stringify(ws.presets||[]);
    seed.smv_layout_snapshot=JSON.stringify(tv.pos||{});
    seed.smv_workspace_v1_snapshot=JSON.stringify({tables:tv.tables||[]});
    seed['smv-detail']=d.detail||'auto';seed['smv-lines']=d.lines||'ortho';
    if(mv.library&&mv.library.width)seed['smv-mvw']=String(mv.library.width);
    seed['smv-measures-workspace-v1']=JSON.stringify(prefs);
    if(payload.settings&&payload.settings.roleRules&&payload.settings.roleRules.length)seed.smv_role_rules_v1=JSON.stringify(payload.settings.roleRules);
    return seed;
  }
  function buildHTML(template, sources, payload) {
    validate(payload);
    if (typeof template!=='string' || !template.includes('id="root"')) throw new Error('The viewer template is unavailable.');
    var used = new Set();
    var html=template.replace(/<link\b[^>]*>/gi,function(tag){
      var match=tag.match(/\bhref\s*=\s*["']([^"']+)["']/i),path=match&&assetPath(match[1]);
      if(FILES.includes(path)&&path.endsWith('.css')) {
        if(typeof sources[path]!=='string')throw new Error('Missing viewer style: '+path);
        return '<style data-smv-asset="'+path+'">'+sources[path].replace(/<\/style/gi,'<\\/style')+'</style>';
      }
      return ''; // Offline files use system fonts and have no preconnects or external styles.
    });
    html=html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi,function(tag,url){
      var path=assetPath(url);
      if(!FILES.includes(path)||typeof sources[path]!=='string')throw new Error('Missing viewer script: '+path);
      used.add(path);
      return '<script data-smv-asset="'+path+'">'+sources[path].replace(/<\/script/gi,'<\\/script')+'</script>';
    });
    if(!used.has('js/snapshot.js')||!used.has('js/app.js'))throw new Error('This viewer version cannot create interactive snapshots.');
    // Callback replacements keep dollar sequences in model text and embedded JSON literal.
    html=html.replace(/<title>[\s\S]*?<\/title>/i,function(){return '<title>'+escapeHTML(payload.name)+' — interactive snapshot</title>';});
    html=html.replace('<head>',function(){return '<head>\n<meta http-equiv="Content-Security-Policy" content="'+CSP+'">';});
    var data='<script id="smv-snapshot-data" type="application/json">'+safeJSON(payload)+'</script>';
    var savedTemplate='<script id="smv-snapshot-template" type="application/json">'+safeJSON(template)+'</script>';
    // Data exists before util/snapshot initialization, while app markup starts empty.
    html=html.replace('<body>',function(){return '<body>\n'+data+'\n'+savedTemplate;});
    return html;
  }
  async function loadAssets(doc) {
    var templateNode=doc.getElementById('smv-snapshot-template'),sources={};
    if (!templateNode && g.SMVHost && g.SMVHost.kind === 'vscode') return g.SMVHost.snapshotAssets();
    if(templateNode) {
      var template=JSON.parse(templateNode.textContent);
      doc.querySelectorAll('[data-smv-asset]').forEach(function(node){sources[node.getAttribute('data-smv-asset')]=node.textContent;});
      return {template:template,sources:sources};
    }
    var base=new URL('.',doc.baseURI),assets={};
    doc.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(function(node){
      var url=new URL(node.getAttribute('src')||node.getAttribute('href'),doc.baseURI);
      if(url.origin!==base.origin)return;
      var path=url.pathname.slice(base.pathname.length);if(FILES.includes(path))assets[path]=url.href;
    });
    async function read(url) { var response=await g.fetch(url,{cache:'no-cache'});if(!response.ok)throw new Error('Could not package the viewer. Reload the app and try again.');return response.text(); }
    var entries=await Promise.all(FILES.map(async function(path){if(!assets[path])throw new Error('Missing viewer asset: '+path);return [path,await read(assets[path])];}));
    entries.forEach(function(entry){sources[entry[0]]=entry[1];});
    return {template:await read(new URL('index.html',base).href),sources:sources};
  }
  function filename(payload) { return (String(payload.name||'Semantic model').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().slice(0,100)||'Semantic model')+' snapshot '+payload.createdAt.slice(0,10)+'.html'; }
  async function exportHTML(app) {
    var payload=capture(app),assets=await loadAssets(g.document),html=buildHTML(assets.template,assets.sources,payload);
    var name=filename(payload);
    if (g.SMVHost && g.SMVHost.kind === 'vscode') {
      var saved = await g.SMVHost.saveSnapshot({html:html,filename:name});
      return saved && !saved.cancelled ? saved.filename || name : null;
    }
    var url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),link=g.document.createElement('a'),name=filename(payload);
    link.href=url;link.download=name;g.document.body.appendChild(link);link.click();link.remove();
    g.setTimeout(function(){URL.revokeObjectURL(url);},1000);
    return name;
  }
  var api={files:FILES.slice(),capture:capture,modelData:modelData,validate:validate,seedStorage:seedStorage,buildHTML:buildHTML,loadAssets:loadAssets,filename:filename,exportHTML:exportHTML,embedded:null,error:null};
  var doc=g.document,node=doc&&doc.getElementById('smv-snapshot-data');
  if(node) {
    try { api.embedded=validate(JSON.parse(node.textContent));g.U.store.useMemory(seedStorage(api.embedded)); }
    catch(error) { api.error=error;g.U.store.useMemory({}); }
  }
  g.Snapshots=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
