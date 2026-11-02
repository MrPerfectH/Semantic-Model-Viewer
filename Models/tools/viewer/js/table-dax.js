/* Calculated-object DAX inspection in Measures. References are static metadata, never DAX evaluation. */
(function (g) {
  'use strict';
  var NODE_LIMIT = 80, EDGE_LIMIT = 160;
  function kind(table) {
    if (!table) return null;
    if (table.calculationGroup || table.role === 'calcgroup' || table.baseRole === 'calcgroup' || table.autoRole === 'calcgroup' || (table.calcItems || []).length) return 'calculationGroup';
    if (table.role === 'fieldparam' || table.baseRole === 'fieldparam' || table.autoRole === 'fieldparam') return 'fieldParameter';
    return table.dax ? 'calculatedTable' : null;
  }
  function label(table) { return { fieldParameter: 'Field parameter table', calculationGroup: 'Calculation group table', calculatedTable: 'Calculated table' }[kind(table)] || 'Table'; }
  function identity(type, table, name) { return JSON.stringify([type, table || '', name || '']); }
  function references(app, text, home) {
    return app.referencesInDax(text || '', home);
  }
  function targets(refs, model) {
    var out = [];
    refs.measures.forEach(function (name) { out.push({ id: identity('measure', model.msrHome[name], name), kind: 'measure', table: model.msrHome[name], name: name }); });
    refs.columns.forEach(function (group) { group.cs.forEach(function (name) { out.push({ id: identity('column', group.t, name), kind: 'column', table: group.t, name: name }); }); });
    refs.tables.forEach(function (name) { out.push({ id: identity('table', name), kind: 'table', table: name, name: name }); });
    return out;
  }
  function analyze(app, table, itemName, scope, columnName) {
    var column = columnName && (table.columns || []).find(function (c) { return c.name === columnName && c.dax; });
    var type = column ? 'calculatedColumn' : kind(table), items = table && table.calcItems || [];
    var item = items.find(function (c) { return c.name === itemName; }) || items[0];
    var object = column || (type === 'calculationGroup' ? item : table);
    var expression = object && object.dax || '', formatExpression = object && (object.formatExpression || (type === 'calculationGroup' ? object.fmt : '')) || '';
    var text = scope === 'format' ? formatExpression : expression, notes = [], fields = [], contextual = [];
    var refs = references(app, text, table.name);
    // The formatter's tokenizer excludes strings/comments from call detection and handles
    // escaped identifiers. Only literal NAMEOF targets are classified as field choices.
    try {
      var tokens = g.DaxFormat.tokenize(text).filter(function (t) { return t.t !== 'cmt'; }), calls = [];
      tokens.forEach(function (t, i) { if (t.t === 'word' && tokens[i + 1] && tokens[i + 1].t === '(') calls.push(t.v.toUpperCase()); });
      ['SELECTEDMEASURE', 'SELECTEDMEASURENAME', 'SELECTEDMEASUREFORMATSTRING'].forEach(function (name) { if (calls.includes(name)) contextual.push(name + '()'); });
      if (type === 'fieldParameter' && scope !== 'format') {
        var tree = g.DaxFormat.parse(tokens), seen = 0;
        function walk(nodes, depth) {
          if (depth > 80 || ++seen > 10000) throw new Error('Field parameter analysis limit reached.');
          nodes.forEach(function (n) {
            if (n.k === 'group' && n.seq.length >= 3) {
              var a = n.seq.map(function (s) { return s.filter(function (x) { return x.t !== 'cmt'; }); });
              var display = a[0][0], call = a[1][0], order = a[2][0];
              if (a[0].length === 1 && display && call && order && display.t === 'str' && a[1].length === 1 && call.k === 'call' && call.name.toUpperCase() === 'NAMEOF') {
                var argument = (call.args[0] || []).filter(function (x) { return x.t !== 'cmt'; });
                if (argument.length === 1 && argument[0].k === 'atom' && ['ref', 'word'].includes(argument[0].t)) {
                  var resolved = references(app, argument[0].v, table.name), found = targets(resolved, app.model);
                  fields.push({ label: display.v.slice(1, -1).replace(/""/g, '"'), order: a[2].length === 1 && order.t === 'num' ? Number(order.v) : null,
                    reference: argument[0].v, target: found.length === 1 && !resolved.unresolved.length ? found[0] : null });
                }
              }
            }
            if (n.args) n.args.forEach(function (a) { walk(a, depth + 1); });
            if (n.seq) n.seq.forEach(function (a) { walk(a, depth + 1); });
          });
        }
        walk(tree, 0);
        if (!fields.length && expression) notes.push('No standard field-parameter entries resolved. Explicit DAX references are shown without guessing field choices.');
      }
    } catch (error) { notes.push('Expression analysis is partial: ' + error.message); }
    if (refs.unresolved.length) notes.push(refs.unresolved.length + ' unresolved DAX reference(s).');
    if (fields.some(function (f) { return !f.target; })) notes.push('Some selectable fields could not be resolved in the captured model.');
    return { kind: type, table: table.name, item: type === 'calculationGroup' ? item && item.name : null,
      name: column ? column.name : type === 'calculationGroup' ? item && item.name || 'No calculation items' : table.name, column: column ? column.name : null,
      expression: expression, formatExpression: formatExpression, text: text, refs: refs, fields: fields, contextual: contextual, notes: notes, scope: scope === 'format' ? 'format' : 'expression' };
  }
  function graph(app, analysis, expanded) {
    var root = { id: identity(analysis.column ? 'column' : analysis.kind === 'calculationGroup' ? 'calculationItem' : 'table', analysis.table, analysis.column || analysis.item), kind: analysis.kind,
      table: analysis.table, name: analysis.name, depth: 0 }, nodes = [root], byId = new Map([[root.id, root]]), edges = [], limited = false;
    var selectable = new Set(analysis.fields.filter(function (f) { return f.target; }).map(function (f) { return f.target.id; }));
    function addRefs(refs, consumer, depth, direct) {
      targets(refs, app.model).forEach(function (input) {
        if (edges.length >= EDGE_LIMIT || (!byId.has(input.id) && nodes.length >= NODE_LIMIT)) { limited = true; return; }
        if (input.id === consumer.id) return;
        if (!byId.has(input.id)) { input.depth = depth; nodes.push(input); byId.set(input.id, input); }
        if (!edges.some(function (e) { return e.from === input.id && e.to === consumer.id; })) edges.push({ from: input.id, to: consumer.id,
          label: direct && selectable.has(input.id) ? 'Selectable field' : input.kind === 'column' ? 'Column reference' : input.kind === 'measure' ? 'Measure reference' : 'Table reference' });
      });
    }
    addRefs(analysis.refs, root, 1, true);
    if (expanded) {
      for (var i = 1; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.kind !== 'measure') continue;
        if (node.depth >= 8) { limited = true; continue; }
        var m = app.msrOf(node.name);
        if (m) addRefs(references(app, m.dax, node.table), node, node.depth + 1, false);
      }
    }
    return { root: root, nodes: nodes, edges: edges, limited: limited };
  }
  function objects(app) {
    var result = [];
    (app.model.tables || []).forEach(function (table) {
      var type = kind(table), items = type === 'calculationGroup' ? table.calcItems || [] : [null];
      if (type === 'calculationGroup' && !items.length) items = [null];
      if (type) items.forEach(function (item) {
        var a = analyze(app, table, item && item.name);
        result.push({ id: identity(type, table.name, item && item.name), table: table.name, item: item && item.name, column: null,
          name: item ? table.name + ' / ' + item.name : table.name, label: item ? 'Calculation item' : label(table), kind: type, analysis: a });
      });
      (table.columns || []).filter(function (c) { return c.dax; }).forEach(function (c) {
        result.push({ id: identity('calculatedColumn', table.name, c.name), table: table.name, column: c.name, item: null,
          name: table.name + '[' + c.name + ']', label: 'Calculated column', kind: 'calculatedColumn', analysis: analyze(app, table, null, 'expression', c.name) });
      });
    });
    return result;
  }
  // Selection and metadata only. Measures owns the graph, DAX cards and layout.
  function TableDaxView(app, host) {
    this.app = app; this.host = host; this.renderer = app.measures || new g.MeasuresView(app, null); this.reset();
  }
  TableDaxView.prototype = {
    reset: function () {
      this.mode = 'measure'; this.objectTable = null; this.column = null; this.items = Object.create(null);
      this.scope = 'expression'; this.analysis = null; this._catalog = null; this._model = this.app.model;
    },
    table: function () { return this.app.model && this.app.model.byName[this.objectTable]; },
    supports: function (table, column) { return !!(kind(table) || table && column && (table.columns || []).some(function (c) { return c.name === column && c.dax; })); },
    isActive: function () { return !!(this._model === this.app.model && this.app.state.loaded && this.app.state.viewMode === 'measures' && this.mode === 'calculation' && this.supports(this.table(), this.column)); },
    objects: function () {
      if (!this._catalog || this._catalog.model !== this.app.model) this._catalog = { model: this.app.model, objects: objects(this.app) };
      return this._catalog.objects;
    },
    rootKey: function () { var a = this.analysis; return a && 'calculated:' + identity(a.kind, a.table, a.column || a.item); },
    selectExpression: function () {
      this.analysis = analyze(this.app, this.table(), this.items[this.objectTable], this.scope, this.column);
      if (this.scope === 'format' && !this.analysis.formatExpression) { this.scope = 'expression'; this.analysis = analyze(this.app, this.table(), this.items[this.objectTable], this.scope, this.column); }
      this.items[this.objectTable] = this.analysis.item;
    },
    open: function (table, item, column, scope) {
      var target = this.app.model.byName[table]; if (!this.supports(target, column)) return;
      this._model = this.app.model; this.objectTable = table; this.column = column || null; this.mode = 'calculation'; this.scope = scope === 'format' ? 'format' : 'expression';
      this.items[table] = item || this.items[table]; this.selectExpression();
      var view = this.app.measures;
      if (view) { view.cancelSnapshotViewport(); view._mainKey = null; view._gC = null; }
      this.app.setState({ viewMode: 'measures', dependencySource: null, mvSourceMode: 'calculations', gPin: null, gHover: null, gExtra: {} });
    },
    close: function () { this.mode = 'measure'; },
    refresh: function () { this.selectExpression(); this.app.measures._mainKey = null; this.app.measures._gC = null; this.app.setState({ gPin: null, gHover: null, gExtra: {} }); },
    captureSnapshot: function () {
      return { version: 3, active: this.isActive(), table: this.objectTable, column: this.column, items: Object.assign({}, this.items), scope: this.scope, graph: this.renderer.captureGraphViewport(),
        comparison: this.app.msrOf(this.app.state.gPin) ? this.app.state.gPin : null,
        extraMeasures: Object.keys(this.app.state.gExtra || {}).filter(function (name) { return !!this.app.msrOf(name); }, this).slice(0, 500) };
    },
    restoreSnapshot: function (data) {
      this.reset(); if (!data || ![1, 2, 3].includes(data.version)) return;
      var self = this, tables = this.app.model.byName;
      Object.keys(data.items || {}).forEach(function (name) { if (tables[name] && (tables[name].calcItems || []).some(function (i) { return i.name === data.items[name]; })) self.items[name] = data.items[name]; });
      this.scope = data.scope === 'format' ? 'format' : 'expression';
      if (data.version < 3 && data.active) {
        this.renderer._workspaceMode = ['split', 'dax', 'graph'].includes(data.display) ? data.display : this.renderer._workspaceMode;
        this.renderer._fmt = ['original', 'long', 'short'].includes(data.format) ? data.format : this.renderer._fmt;
        this.renderer._wrapDax = data.wrap !== false;
      }
      if (data.active && this.supports(tables[data.table], data.column)) { this.objectTable = data.table; this.column = data.column || null; this.mode = 'calculation'; this.selectExpression(); this.app.state.viewMode = 'measures'; this.app.state.mvSourceMode = 'calculations';
        this.app.state.gPin = this.app.msrOf(data.comparison) ? data.comparison : null;
        this.app.state.gExtra = Object.create(null);
        (Array.isArray(data.extraMeasures) ? data.extraMeasures : []).slice(0, 500).forEach(function (name) { if (self.app.msrOf(name)) self.app.state.gExtra[name] = 1; });
        if (data.graph) {
          var graphState = this.renderer.sanitizeSnapshot({ graph: data.graph }).graph;
          this.renderer._snapshotViewport = { model: this.app.model, selected: this.rootKey(), graph: graphState };
        }
      }
    },
    update: function () {
      if (this._model !== this.app.model) this.reset();
      if (this.host) this.host.hidden = true;
    }
  };
  g.TableDax = { kind: kind, label: label, analyze: analyze, graph: graph, targets: targets, identity: identity, objects: objects };
  g.TableDaxView = TableDaxView;
  if (typeof module === 'object' && module.exports) module.exports = g.TableDax;
})(window);
