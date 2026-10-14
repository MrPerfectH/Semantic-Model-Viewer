(function(g){'use strict';
var clone=function(value){return JSON.parse(JSON.stringify(value));};
function remapTable(view,rename){
 view=clone(view);if(rename.kind!=='table')return view;
 var name=function(value){return value===rename.name?rename.newName:value;};
 if(Array.isArray(view.tables))view.tables=view.tables.map(name);
 if(view.pos&&Object.prototype.hasOwnProperty.call(view.pos,rename.name)){view.pos[rename.newName]=view.pos[rename.name];delete view.pos[rename.name];}
 if(view.focus){view.focus.selected=name(view.focus.selected);view.focus.locked=name(view.focus.locked);if(Array.isArray(view.focus.pinned))view.focus.pinned=view.focus.pinned.map(name);}
 if(view.display&&Array.isArray(view.display.expanded))view.display.expanded=view.display.expanded.map(name);
 return view;
}
function remapMeasures(value,rename){
 value=clone(value);if(rename.kind==='measure'){['selectedMeasure','comparisonMeasure'].forEach(function(key){if(value[key]===rename.name)value[key]=rename.newName;});if(Array.isArray(value.extraMeasures))value.extraMeasures=value.extraMeasures.map(function(name){return name===rename.name?rename.newName:name;});}
 if(rename.kind==='table'&&value.library&&value.library.homeTable===rename.name)value.library.homeTable=rename.newName;
 return value;
}
function capture(app,rename){return{modelKey:app.modelKey,table:remapTable(app.captureTableView(),rename),measures:remapMeasures(app.measures.captureSnapshot(),rename),viewMode:app.state.viewMode};}
function remember(app,rename){
 if(rename.kind!=='table')return;
 var key='smv_presets_'+app.modelKey,views=U.store.getJSON(key,[]);U.store.setJSON(key,views.map(function(view){return remapTable(view,rename);}));
 var layoutKey=app.modelKey==='builtin'?'lsa_model_layout_v1':'smv_layout_'+app.modelKey;
 var positions=U.store.getJSON(layoutKey,{});if(positions&&Object.prototype.hasOwnProperty.call(positions,rename.name)){positions[rename.newName]=positions[rename.name];delete positions[rename.name];U.store.setJSON(layoutKey,positions);}
}
function restore(app,saved){if(!saved||saved.modelKey!==app.modelKey)return;app.canvas.applyPreset(saved.table);app._tableWorkspace=app.captureTableView();app._tableViewport=Object.assign({},app.canvas.view);app.measures.restoreSnapshot(saved.measures);if(saved.viewMode&&saved.viewMode!=='graph')app.setViewMode(saved.viewMode);app.render(true);}
var api={remapTable:remapTable,remapMeasures:remapMeasures,capture:capture,remember:remember,restore:restore};g.ModelRenameState=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
