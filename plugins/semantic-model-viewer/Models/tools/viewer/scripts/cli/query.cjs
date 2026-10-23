'use strict';
const { runtime, readModel } = require('./model.cjs');

function load(source, requested) {
  const context = runtime(), { model, app } = readModel(context, source);
  const table = model.tables.find(t => t.name.toLowerCase() === requested.toLowerCase());
  if (!table) throw new Error('Unknown table: ' + requested);
  return { context, model, app, table, source: require('node:fs').realpathSync(source) };
}
function relationship(graph, r) {
  const behavior = graph.behaviorOf(r);
  return { ...r, active: !(r.inactive || r.isActive === false),
    manyToMany: r.fromCard === 'many' && r.toCard === 'many',
    filterDirection: behavior === 'unresolved' ? 'unresolved' : behavior === 'both' ? 'both' : 'to -> from',
    filters: behavior === 'unresolved' ? [] : [{ from: r.to, to: r.from }, ...(behavior === 'both' ? [{ from: r.from, to: r.to }] : [])] };
}
function inspect(source, requested) {
  if (!requested) { const context = runtime(), { model } = readModel(context, source); return context.Snapshots.modelData(model); }
  const { context, model, app, table, source: canonical } = load(source, requested);
  const data = context.Snapshots.modelData(model), impact = app.measureImpact({ table: table.name });
  const direct = new Set(impact.direct), users = new Set(impact.all);
  return { source: canonical, name: model.name, table: data.tables.find(t => t.name === table.name),
    relationships: data.relationships.filter(r => r.from === table.name || r.to === table.name).map(r => relationship(context.RelationshipGraph, r)),
    measuresUsingTable: data.tables.flatMap(t => t.measures.filter(m => users.has(m.name)).map(m => ({ ...m, table: t.name, direct: direct.has(m.name) }))),
    explanation: 'Static DAX references to this table or its columns, plus downstream measure dependencies. Home-table membership alone does not imply use. Relationship filter propagation and DAX evaluation are not simulated.' };
}
function filtersBy(source, requested, options = {}) {
  const { context, model, table, source: canonical } = load(source, requested), graph = context.RelationshipGraph;
  const direction = options.direction || 'outgoing';
  if (!['outgoing', 'incoming', 'both'].includes(direction)) throw new Error('--direction must be outgoing, incoming or both');
  const result = graph.traverse(model, [table.name], { direction, includeInactive: !!options.includeInactive, maxDepth: options.direct ? 1 : Infinity });
  const data = context.Snapshots.modelData(model);
  const describe = r => relationship(graph, data.relationships[model.relationships.indexOf(r)]);
  const reachable = [...result.names].filter(n => n !== table.name).map(name => ({
    name, distance: result.distances.get(name), directions: result.directions ? result.directions.get(name) : [direction],
    path: graph.pathTo(result, name).map(step => ({ traversalFrom: step.from, traversalTo: step.to, relationship: describe(step.relationship) }))
  }));
  return { source: canonical, name: model.name, table: table.name, direction, includeInactive: !!options.includeInactive,
    tables: reachable,
    relationships: model.relationships.filter(r => (r.from === table.name || r.to === table.name) && (options.includeInactive || !(r.inactive || r.isActive === false))).map(describe),
    unresolved: result.unresolved.filter(r => result.names.has(r.from) || result.names.has(r.to)).map(describe),
    explanation: graph.explanation + ' Tables contain one shortest path per reachable table; incoming paths traverse opposite to filter propagation. Incident relationships are listed separately, including parallel edges. Unknown/automatic directions do not establish reachability.' };
}
function focused(source, requested, kind, options = {}) {
  const { context, model, app, table, source: canonical } = options.loaded || load(source, requested);
  if (kind === 'dependents') {
    const impact=app.measureImpact({table:table.name}), direct=new Set(impact.direct), names=new Set(options.direct?impact.direct:impact.all);
    const measures=model.tables.flatMap(t=>t.measures.filter(m=>names.has(m.name)).map(m=>({table:t.name,name:m.name,direct:direct.has(m.name),...(options.details?{dax:m.dax}: {})})));
    return {source:canonical,table:table.name,counts:{direct:impact.direct.length,indirect:impact.all.length-impact.direct.length,total:impact.all.length},measures,
      basis:'Static DAX table/column references and downstream measure chains; no DAX execution or filter-propagation simulation.'};
  }
  const direction=options.direction||'both';
  if(!['both','incoming','outgoing'].includes(direction))throw new Error('--direction must be both, incoming or outgoing');
  const graph=context.RelationshipGraph, result=graph.traverse(model,[table.name],{direction,includeInactive:!!options.includeInactive,maxDepth:options.direct?1:Infinity});
  const edges=model.relationships.filter(r=>r.from===table.name||r.to===table.name);
  const tables=[...result.names].filter(n=>n!==table.name).map(name=>({name,distance:result.distances.get(name),...(options.details?{path:graph.pathTo(result,name).map(s=>({from:s.from,to:s.to,relationship:relationship(graph,s.relationship)}))}: {})}));
  return {source:canonical,table:table.name,direction,includeInactive:!!options.includeInactive,
    counts:{direct:tables.filter(t=>t.distance===1).length,indirect:tables.filter(t=>t.distance>1).length,total:tables.length,relationships:edges.length,manyToMany:edges.filter(r=>r.fromCard==='many'&&r.toCard==='many').length,inactive:edges.filter(r=>r.inactive||r.isActive===false).length,unresolved:edges.filter(r=>graph.behaviorOf(r)==='unresolved').length},
    tables,...(options.details?{relationships:edges.map(r=>relationship(graph,r))}:{}),basis:graph.explanation};
}
function summary(model,app,view){
  const exploredSource=view.state&&view.state.measures&&view.state.measures.source;
  const table=exploredSource?exploredSource.table:view.focus&&(['table','column'].includes(view.focus.kind))?(view.focus.kind==='table'?view.focus.name:view.focus.table):null;
  const visible=view.tables||model.tables.map(t=>t.name),set=new Set(visible);
  const rels=model.relationships.filter(r=>set.has(r.from)&&set.has(r.to));
  const impact=table?app.measureImpact({table,column:exploredSource?exploredSource.column:view.focus&&view.focus.kind==='column'?view.focus.name:null}):null;
  return {mode:view.mode,focus:view.focus||null,tables:visible.length,relationships:rels.length,activeRelationships:rels.filter(r=>!(r.inactive||r.isActive===false)).length,
    inactiveRelationships:rels.filter(r=>r.inactive||r.isActive===false).length,manyToMany:rels.filter(r=>r.fromCard==='many'&&r.toCard==='many').length,
    ...(impact?{dependentMeasures:{direct:impact.direct.length,indirect:impact.all.length-impact.direct.length,total:impact.all.length}}:{})};
}
module.exports = { inspect, filtersBy, focused, summary, load };
