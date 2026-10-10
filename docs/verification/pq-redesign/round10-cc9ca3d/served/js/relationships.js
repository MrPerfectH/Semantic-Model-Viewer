/* Relationship reachability from model metadata; independent of canvas and DOM.
   TOM oneDirection is to -> from, regardless of table role or cardinality. */
(function (g) {
  'use strict';

  var EXPLANATION = 'Follows model relationship metadata. Active relationships are used by default. ' +
    'DAX can change filter behavior with USERELATIONSHIP, CROSSFILTER or virtual relationships. ' +
    'This view does not simulate measure evaluation, query ambiguity resolution or row-level security.';

  function behaviorOf(relationship) {
    var raw = relationship.crossFilteringBehavior;
    if (raw == null || raw === '') return relationship.both ? 'both' : 'one';
    var value = String(raw).toLowerCase();
    if (value === 'onedirection' || value === '1') return 'one';
    if (value === 'bothdirections' || value === '2') return 'both';
    return 'unresolved';
  }

  /* All returned collections are new. Relationship references in path evidence
     are the original metadata objects, and are never changed by this module.
     maxDepth counts relationship hops; roots always have distance zero. */
  function traverse(model, rootNames, options) {
    options = options || {};
    var direction = options.direction || 'connected';
    if (['connected', 'incoming', 'outgoing'].indexOf(direction) < 0) {
      throw new RangeError('Unknown relationship traversal direction: ' + direction);
    }
    var maxDepth = options.maxDepth == null ? Infinity : options.maxDepth;
    if (maxDepth !== Infinity && (!Number.isInteger(maxDepth) || maxDepth < 0)) {
      throw new RangeError('maxDepth must be a non-negative integer or Infinity');
    }
    var tables = new Set((model && model.tables || []).map(function (t) { return t.name; }));
    var adjacency = new Map();
    tables.forEach(function (name) { adjacency.set(name, []); });
    var unresolved = [];
    var add = function (from, to, relationship, index) {
      adjacency.get(from).push({ table: to, relationship: relationship, index: index });
    };

    (model && model.relationships || []).forEach(function (relationship, index) {
      if (!tables.has(relationship.from) || !tables.has(relationship.to)) return;
      if (!options.includeInactive && (relationship.inactive || relationship.isActive === false)) return;
      var behavior = behaviorOf(relationship);
      if (behavior === 'unresolved') unresolved.push(relationship);
      if (direction === 'connected') {
        add(relationship.from, relationship.to, relationship, index);
        add(relationship.to, relationship.from, relationship, index);
        return;
      }
      // Automatic/unknown direction cannot establish definite filter reachability.
      if (behavior === 'unresolved') return;
      var source = direction === 'outgoing' ? relationship.to : relationship.from;
      var target = direction === 'outgoing' ? relationship.from : relationship.to;
      add(source, target, relationship, index);
      if (behavior === 'both') add(target, source, relationship, index);
    });

    var roots = typeof rootNames === 'string' ? [rootNames] : Array.from(rootNames || []);
    var names = new Set(), distances = new Map(), predecessors = new Map(), queue = [];
    roots.forEach(function (name) {
      if (!tables.has(name) || names.has(name)) return;
      names.add(name); distances.set(name, 0); queue.push(name);
    });
    for (var cursor = 0; cursor < queue.length; cursor++) {
      var name = queue[cursor], distance = distances.get(name);
      if (distance >= maxDepth) continue;
      adjacency.get(name).forEach(function (edge) {
        if (names.has(edge.table)) return;
        names.add(edge.table); distances.set(edge.table, distance + 1);
        predecessors.set(edge.table, { table: name, relationship: edge.relationship, index: edge.index });
        queue.push(edge.table);
      });
    }
    return {
      names: names, distances: distances, predecessors: predecessors,
      unresolved: unresolved, explanation: EXPLANATION
    };
  }

  /* One shortest path in traversal order, or null when the table is unreachable.
     Incoming traversal order is the reverse of actual filter propagation. */
  function pathTo(result, tableName) {
    if (!result || !result.names.has(tableName)) return null;
    var path = [], current = tableName;
    while (result.predecessors.has(current)) {
      var previous = result.predecessors.get(current);
      path.push({ from: previous.table, to: current, relationship: previous.relationship, index: previous.index });
      current = previous.table;
    }
    return path.reverse();
  }

  var api = { traverse: traverse, pathTo: pathTo, explanation: EXPLANATION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.RelationshipGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
