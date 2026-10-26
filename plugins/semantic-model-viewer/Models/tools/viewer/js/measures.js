/* Measures view: folder rail, dependency flow (layered DAG), DAX panel.
   Graph layout, loop guards and DAX tokenizer ported from the prototype. */
(function (g) {
  'use strict';
  var el = U.el, sv = U.sv, store = U.store;
  var CAP = 500, NH = 34;
  /* Grouping: graphs of GROUP_MIN nodes or fewer read fine as plain columns; a home
     table + display folder bundle of GROUP_INLINE or fewer stays inline; anything larger
     becomes a group node showing GROUP_PAGE members behind a "+ N more" expander. */
  var GROUP_MIN = 8, GROUP_INLINE = 3, GROUP_PAGE = 6, GHEAD = 22, GPAD = 10, MGAP = 8, GMORE = 20;
  var PREF_KEY = 'smv-measures-workspace-v1';
  function choice(value, values, fallback) { return values.indexOf(value) >= 0 ? value : fallback; }
  function share(value, fallback) { return typeof value === 'number' && isFinite(value) ? Math.max(.2, Math.min(.8, value)) : fallback; }
  function bounded(value, min, max, fallback) { return typeof value === 'number' && isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; }
  function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function MeasuresView(app, host) {
    this.app = app;
    this.host = host;
    this._built = false;
    this._railKey = null;
    this._mainKey = null;
    this._flowKey = null;
    this._nodeEls = {};
    this._groupEls = {};
    this._edgeEls = {};
    this._gC = null;
    var prefs = store.getJSON(PREF_KEY, {}) || {};
    this._workspaceMode = choice(prefs.mode, ['split', 'dax', 'graph'], 'split');
    this._splitLayout = choice(prefs.split, ['beside', 'below'], 'beside');
    this._graphOrientation = choice(prefs.orientation, ['lr', 'tb', 'bt'], 'lr');
    this._splitShares = { beside: share(prefs.besideShare, .55), below: share(prefs.belowShare, .52) };
    this._wrapDax = prefs.wrap !== false;
    this._showSources = prefs.sources === true;
    this._fmt = choice(prefs.fmt, ['original', 'long', 'short'], 'long');
    this._folds = {};
  }

  MeasuresView.prototype = {

    /* A snapshot contains only explicit UI state, never model objects or DOM nodes. */
    sanitizeSnapshot: function (value) {
      var data = record(value), library = record(data.library), prefs = record(data.preferences), graph = record(data.graph);
      var measures = new Set(), tables = new Set(), sourceTables = new Set(), folders = new Set();
      ((this.app.model || {}).tables || []).forEach(function (table) {
        sourceTables.add(table.name);
        if ((table.measures || []).length) tables.add(table.name);
        (table.measures || []).forEach(function (measure) {
          measures.add(measure.name);
          String(measure.folder || '').split(';').forEach(function (path) {
            var prefix = '';
            path.split('\\').map(function (part) { return part.trim(); }).filter(Boolean).forEach(function (part) {
              prefix = prefix ? prefix + '\\' + part : part; folders.add(prefix);
            });
          });
        });
      });
      var selected = typeof data.selectedMeasure === 'string' && measures.has(data.selectedMeasure) ? data.selectedMeasure : null;
      var candidate = record(data.source), source = null;
      var sourceTable = ((this.app.model || {}).tables || []).find(function (t) { return t.name === candidate.table; });
      if (sourceTable && (candidate.column == null || (sourceTable.columns || []).some(function (c) { return c.name === candidate.column; }))) {
        source = { table: sourceTable.name, column: candidate.column == null ? null : candidate.column }; selected = null;
      }
      var comparison = (selected || source) && typeof data.comparisonMeasure === 'string' && measures.has(data.comparisonMeasure) && data.comparisonMeasure !== selected ? data.comparisonMeasure : null;
      var validNames = function (items, allowed, cap) {
        return Array.from(new Set((Array.isArray(items) ? items : []).filter(function (item) { return typeof item === 'string' && allowed.has(item); }))).slice(0, cap);
      };
      return {
        version: 1, selectedMeasure: selected, comparisonMeasure: comparison, source: source, directOnly: !!source && data.directOnly === true,
        extraMeasures: selected && !source ? validNames(data.extraMeasures, measures, CAP) : [],
        library: {
          query: typeof library.query === 'string' ? library.query.slice(0, 10000) : '',
          visibility: choice(library.visibility, ['all', 'visible', 'hidden'], 'all'),
          homeTable: typeof library.homeTable === 'string' && tables.has(library.homeTable) ? library.homeTable : '',
          openFolders: validNames(library.openFolders, folders, folders.size),
          width: bounded(library.width, 240, 480, 296),
          sourceMode: source ? 'sources' : choice(library.sourceMode, ['measures', 'sources'], 'measures'),
          pickingSource: library.pickingSource === true,
          sourceQuery: typeof library.sourceQuery === 'string' ? library.sourceQuery.slice(0, 10000) : '',
          impactQuery: typeof library.impactQuery === 'string' ? library.impactQuery.slice(0, 10000) : '',
          openTables: validNames(library.openTables, sourceTables, sourceTables.size)
        },
        preferences: {
          mode: choice(prefs.mode, ['split', 'dax', 'graph'], 'split'),
          split: choice(prefs.split, ['beside', 'below'], 'beside'),
          besideShare: share(prefs.besideShare, .55), belowShare: share(prefs.belowShare, .52),
          orientation: choice(prefs.orientation, ['lr', 'tb', 'bt'], 'lr'), wrap: prefs.wrap !== false, sources: !!source || prefs.sources === true,
          fmt: choice(prefs.fmt, ['original', 'long', 'short'], 'long'), inline: prefs.inline === true, plain: prefs.plain === true
        },
        graph: { zoom: bounded(graph.zoom, .02, 1.8, 1), scrollLeft: bounded(graph.scrollLeft, 0, 10000000, 0),
          scrollTop: bounded(graph.scrollTop, 0, 10000000, 0), autoFit: graph.autoFit === true }
      };
    },
    graphViewportContext: function () {
      return JSON.stringify([this._graphOrientation, this._showSources, !!this.app.state.dependencyDirectOnly, Object.keys(this.app.state.gExtra || {}).sort()]);
    },
    captureGraphViewport: function () {
      var app = this.app, pending = this._snapshotViewport, last = this._lastGraphViewport;
      if (pending && pending.model === app.model && pending.selected === this.graphRoot()) return Object.assign({}, pending.graph);
      if (this._built && this.gScroll && this.gScroll.clientWidth && this._graphModel === app.model && this._graphMeasure === this.graphRoot()) {
        return { zoom: this._gZoom || 1, scrollLeft: this.gScroll.scrollLeft, scrollTop: this.gScroll.scrollTop, autoFit: !!this._gAutoFit };
      }
      if (last && last.model === app.model && last.selected === this.graphRoot() && last.context === this.graphViewportContext()) return Object.assign({}, last.graph);
      return { zoom: 1, scrollLeft: 0, scrollTop: 0, autoFit: false };
    },
    rememberGraphViewport: function () {
      this._lastGraphViewport = { model: this.app.model, selected: this.graphRoot(), context: this.graphViewportContext(), graph: this.captureGraphViewport() };
    },
    captureSnapshot: function () {
      var state = this.app.state;
      return this.sanitizeSnapshot({
        selectedMeasure: state.selMeasure, comparisonMeasure: state.gPin, source: state.dependencySource, directOnly: state.dependencyDirectOnly,
        extraMeasures: Object.keys(state.gExtra || {}).filter(function (name) { return !!state.gExtra[name]; }),
        library: { query: state.mvQuery, visibility: state.mvFilter, homeTable: state.mvTable,
          openFolders: Object.keys(state.mvOpen || {}).filter(function (name) { return !!state.mvOpen[name]; }), width: state.mvW,
          sourceMode: this.sourceMode(), pickingSource: !!state.mvSourcePicking, sourceQuery: state.mvSourceQuery, impactQuery: state.mvImpactQuery,
          openTables: Object.keys(state.mvSourceOpen || {}).filter(function (name) { return !!state.mvSourceOpen[name]; }) },
        preferences: { mode: this._workspaceMode, split: this._splitLayout, besideShare: this._splitShares.beside,
          belowShare: this._splitShares.below, orientation: this._graphOrientation, wrap: this._wrapDax, sources: this._showSources, fmt: this._fmt, inline: !!this._inlineDax, plain: !!this._plainDax },
        graph: this.captureGraphViewport()
      });
    },
    cancelSnapshotViewport: function () {
      if (this._snapshotFrame) cancelAnimationFrame(this._snapshotFrame);
      this._snapshotFrame = 0; this._snapshotViewport = null;
    },
    restoreSnapshot: function (value) {
      if (!value || value.version !== 1 || !this.app.model || !Array.isArray(this.app.model.tables) || !this.app.model.byName) return false;
      var data = this.sanitizeSnapshot(value), prefs = data.preferences, self = this;
      this.cancelSnapshotViewport();
      this._workspaceMode = prefs.mode; this._splitLayout = prefs.split; this._graphOrientation = prefs.orientation;
      this._splitShares = { beside: prefs.besideShare, below: prefs.belowShare }; this._wrapDax = prefs.wrap; this._showSources = prefs.sources; this._fmt = prefs.fmt; this._inlineDax = prefs.inline; this._plainDax = prefs.plain;
      this._mainKey = null; this._railKey = null; this._daxKey = null; this._gC = null; this._shellModel = null;
      var root = data.source ? this.sourceKey(data.source.table, data.source.column) : data.selectedMeasure;
      this._snapshotViewport = root ? { model: this.app.model, selected: root, graph: data.graph } : null;
      this._lastGraphViewport = { model: this.app.model, selected: root, graph: data.graph };
      var extras = Object.create(null), open = Object.create(null);
      data.extraMeasures.forEach(function (name) { extras[name] = 1; });
      data.library.openFolders.forEach(function (path) { open[path] = true; });
      var sourceOpen = Object.create(null); data.library.openTables.forEach(function (name) { sourceOpen[name] = true; });
      this.app.setState({ mvSourceMode: data.library.sourceMode, mvSourcePicking: data.library.pickingSource, mvSourceQuery: data.library.sourceQuery,
        mvSourceOpen: sourceOpen, mvImpactQuery: data.library.impactQuery, selMeasure: data.selectedMeasure, dependencySource: data.source, dependencyDirectOnly: data.directOnly, gPin: data.comparisonMeasure, gExtra: extras, gHover: null,
        mvQuery: data.library.query, mvFilter: data.library.visibility, mvTable: data.library.homeTable, mvOpen: open, mvW: data.library.width
      }, function () { self.restorePendingViewport(); });
      return true;
    },
    restorePendingViewport: function () {
      var pending = this._snapshotViewport, app = this.app, self = this;
      if (!pending) return;
      if (pending.model !== app.model || pending.selected !== self.graphRoot()) { this.cancelSnapshotViewport(); return; }
      if (this._snapshotFrame || !this._built || app.state.viewMode !== 'measures' || !this.gScroll || !this.gScroll.clientWidth) return;
      // Wait for initial centering and responsive panel sizing before restoring scroll.
      this._snapshotFrame = requestAnimationFrame(function () {
        self._snapshotFrame = requestAnimationFrame(function () {
          self._snapshotFrame = 0;
          if (self._snapshotViewport !== pending) return;
          if (pending.model !== app.model || pending.selected !== self.graphRoot()) { self.cancelSnapshotViewport(); return; }
          if (!self._built || app.state.viewMode !== 'measures' || !self.gScroll || !self.gScroll.clientWidth) return;
          if (pending.graph.autoFit) self.fitGraph();
          else {
            self.setGraphZoom(pending.graph.zoom);
            self.gScroll.scrollTo({ left: pending.graph.scrollLeft, top: pending.graph.scrollTop, behavior: 'auto' });
          }
          self._snapshotViewport = null;
          self._initViewportFor = self.graphRoot();   // the snapshot is the opening view
          self.rememberGraphViewport();
        });
      });
    },

    /* ---------- graph helpers ---------- */
    sourceKey: function (table, column) { return '\u0000source:' + JSON.stringify([table, column == null ? null : column]); },
    graphRoot: function () {
      var source = this.app.state.dependencySource;
      return source ? this.sourceKey(source.table, source.column) : this.app.state.selMeasure;
    },
    currentImpact: function () {
      var key = JSON.stringify(this.app.state.dependencySource);
      if (!this._impactCache || this._impactCache.model !== this.app.model || this._impactCache.key !== key) {
        this._impactCache = { model: this.app.model, key: key, data: this.app.measureImpact(this.app.state.dependencySource) };
      }
      return this._impactCache.data;
    },
    sourceLabel: function (source) { return source.table + (source.column == null ? '' : '[' + source.column + ']'); },
    analyzeSource: function (table, column) {
      var t = this.app.model.byName[table];
      if (!t || (column != null && !t.columns.some(function (c) { return c.name === column; }))) return;
      this._showSources = true; this.savePreferences(); this.cancelSnapshotViewport();
      this._gC = null; this._initViewportFor = null;
      this.app.setState({ dependencySource: { table: table, column: column == null ? null : column },
        selMeasure: null, mvSourceMode: 'sources', mvSourcePicking: false, mvImpactQuery: '', dependencyDirectOnly: false, gPin: null, gHover: null, gExtra: {}, viewMode: 'measures' });
    },
    setShowSources: function (on) {
      this._showSources = !!on; this.savePreferences(); this._gC = null; this._mainKey = null;
      var patch = {};
      if (!on && this.app.state.dependencySource) {
        var impact = this.app.measureImpact(this.app.state.dependencySource);
        patch = { dependencySource: null, mvSourceMode: 'measures', mvSourcePicking: false, selMeasure: this.app.state.gPin || impact.direct[0] || impact.all[0] || null, gPin: null, gExtra: {}, gHover: null };
      }
      this.app.setState(patch);
    },
    flowKids: function (name, dir) {
      var source = this.app.state.dependencySource, root = source && this.graphRoot();
      var direct = source ? this.currentImpact().direct : [];
      if (name === root) return dir === 'up' ? [] : direct;
      if (dir === 'up') {
        var m = this.app.msrOf(name), deps = ((m && m._deps) || []).slice();
        if (source && direct.indexOf(name) >= 0) deps.push(root);
        if (source) { var allowed = this.app.state.dependencyDirectOnly ? direct : this.currentImpact().all; deps = deps.filter(function (n) { return n === root || allowed.indexOf(n) >= 0; }); }
        return deps.sort(function (a, b) { return a.localeCompare(b); });
      }
      if (source && this.app.state.dependencyDirectOnly) return [];
      return (((this.app.model || {}).msrUsedBy || {})[name] || []).slice().sort(function (a, b) { return a.localeCompare(b); });
    },
    gReach: function (start, map) {
      var s = new Set(); var q = [start], __g = 0;
      while (q.length) {
        if (++__g > 200000) throw new Error('LOOP-GUARD: gReach');
        var x = q.pop();
        (map[x] || []).forEach(function (k) { if (!s.has(k)) { s.add(k); q.push(k); } });
      }
      return s;
    },
    /* Home table plus the first display folder of a measure — the two things that make a
       pile of dependents legible. */
    gGroupKey: function (name) {
      var app = this.app, home = ((app.model || {}).msrHome || {})[name] || '', m = app.msrOf(name);
      var folder = String((m && m.folder) || '').split(';')[0].split('\\').map(function (part) { return part.trim(); }).filter(Boolean).join(' \\ ');
      return { home: home, folder: folder, key: home + ' || ' + folder };
    },
    /* A base measure with 36 dependents renders as one unreadable column. Bundle each layer
       by home table then display folder so the reader sees a handful of labelled groups and
       opens the one they care about. Deterministic: groups appear in the barycentre order of
       their first member and members keep the order the layer gave them. */
    gGroupColumns: function (cols, root, total, expanded) {
      var self = this, slots = [], hidden = new Set(), groupOf = {}, on = total > GROUP_MIN;
      /* home table + folder is parsed out of the measure metadata, so resolve it once per
         name rather than three times per name per column */
      var meta = {};
      cols.forEach(function (col) { col.forEach(function (n) { if (!meta[n]) meta[n] = self.gGroupKey(n); }); });
      cols.forEach(function (col, li) {
        var out = [];
        if (!on) { col.forEach(function (n) { out.push({ kind: 'node', name: n }); }); slots.push(out); return; }
        var byKey = {};
        col.forEach(function (n) { if (n !== root) { var k = meta[n].key; (byKey[k] = byKey[k] || []).push(n); } });
        var done = {};
        col.forEach(function (n) {
          if (n === root) { out.push({ kind: 'node', name: n }); return; }
          var k = meta[n].key;
          if (done[k]) return;
          done[k] = 1;
          var members = byKey[k];
          if (members.length <= GROUP_INLINE) { members.forEach(function (mn) { out.push({ kind: 'node', name: mn }); }); return; }
          var head = meta[members[0]], id = 'L' + li + ' || ' + k;
          var open = !!(expanded && expanded[id]);
          var shown = open ? members.slice() : members.slice(0, GROUP_PAGE);
          members.slice(shown.length).forEach(function (mn) { hidden.add(mn); });
          members.forEach(function (mn) { groupOf[mn] = id; });
          out.push({ kind: 'group', key: id, table: head.home, folder: head.folder,
            label: (head.home || 'Model') + (head.folder ? ' · ' + head.folder : '') + ' · ' + members.length,
            members: members, shown: shown, hidden: members.length - shown.length, expanded: open });
        });
        slots.push(out);
      });
      return { slots: slots, hidden: hidden, groupOf: groupOf, grouped: on };
    },
    /* Which groups the reader opened, per analyzed measure. Session only — re-analyzing the
       same measure later in the session keeps the groups open; a reload starts collapsed. */
    graphGroupState: function (root) {
      var key = root || this.graphRoot() || '';
      if (!this._gGroupOpen) this._gGroupOpen = {};
      if (!this._gGroupOpen[key]) this._gGroupOpen[key] = {};
      return this._gGroupOpen[key];
    },
    toggleGraphGroup: function (id) {
      /* the expanded set is part of the layout cache key, so flipping it is enough to make
         the next buildGraph() miss — clearing _gC as well would only hide that */
      var open = this.graphGroupState();
      if (open[id]) delete open[id]; else open[id] = true;
      if (this.gCanvasEl) this.renderFlow();
    },
    /* First look at a measure: a readable zoom, never below 60%, with the analyzed node in
       the middle of the pane. Pure arithmetic, so the headless test can assert the root sits
       inside the viewport this returns. */
    initialViewport: function (G, paneW, paneH) {
      var w = Math.max(1, paneW || 0), h = Math.max(1, paneH || 0);
      var fit = Math.min((w - 32) / Math.max(1, G.w), (h - 32) / Math.max(1, G.h));
      // Source rows need readable labels. Start at 100% around the analysis root;
      // Fit all remains an explicit overview action for wider diagrams.
      var zoom = G.sources && G.sources.length ? 1 : Math.max(.6, Math.min(1, fit));
      var R = (G.xy && G.xy[G.root]) || { x: 0, y: 0, w: 0 };
      var frameW = Math.ceil(G.w * zoom), frameH = Math.ceil(G.h * zoom);
      var ox = Math.max(0, (w - frameW) / 2), oy = Math.max(0, (h - frameH) / 2);
      var cx = ox + (R.x + (R.w || 0) / 2) * zoom, cy = oy + (R.y + NH / 2) * zoom;
      return { zoom: zoom,
        scrollLeft: Math.max(0, Math.min(Math.max(0, frameW - w), cx - w / 2)),
        scrollTop: Math.max(0, Math.min(Math.max(0, frameH - h), cy - h / 2)) };
    },
    gLayout: function (root, extra, cap, orientation) {
      var self = this;
      orientation = choice(orientation || this._graphOrientation, ['lr', 'tb', 'bt'], 'lr');
      var vertical = orientation !== 'lr', direction = orientation === 'bt' ? -1 : 1;
      var dist = {}; dist[root] = 0;
      var bfs = function (dir) {
        var seen = new Set([root]); var q = [root], __g = 0, context=self._explanationContext;
        if(context&&context.direction!=='both'&&context.direction!==dir)return seen;
        while (q.length) {
          if (++__g > 200000) throw new Error('LOOP-GUARD: gLayout bfs');
          var n = q.shift();
          if(context&&dist[n]>=context.depth)continue;
          self.flowKids(n, dir).forEach(function (k) {
            if (!seen.has(k)) { seen.add(k); if (dist[k] == null || dist[n] + 1 < dist[k]) dist[k] = dist[n] + 1; q.push(k); }
          });
        }
        return seen;
      };
      var upSet = bfs('up'), dnSet = bfs('down');
      var initial=Array.from(new Set([].concat(Array.from(upSet),Array.from(dnSet))));
      if(this._explanationContext){initial.sort(function(a,b){return (dist[a]-dist[b])||a.localeCompare(b);});initial=initial.slice(0,this._explanationContext.limit);}
      // The authored limit bounds only the opening neighborhood. Explicit branch
      // expansion remains usable up to the viewer's ordinary global cap.
      var names=Array.from(new Set(initial.concat(Object.keys(extra).filter(function(n){return self.app.msrOf(n);})))) ;
      var capped = false;
      if (names.length > cap) {
        capped = true;
        names.sort(function (a, b) { return ((dist[a] != null ? dist[a] : 99) - (dist[b] != null ? dist[b] : 99)) || a.localeCompare(b); });
        names = names.slice(0, cap);
        if (names.indexOf(root) < 0) names.push(root);
      }
      var inc = new Set(names);
      var deps = {}, cons = {}, hidU = {}, hidD = {};
      names.forEach(function (n) {
        var ds = self.flowKids(n, 'up'), us = self.flowKids(n, 'down');
        deps[n] = ds.filter(function (d) { return inc.has(d); }); hidU[n] = ds.filter(function (d) { return !inc.has(d); });
        cons[n] = us.filter(function (u) { return inc.has(u); }); hidD[n] = us.filter(function (u) { return !inc.has(u); });
      });
      var layer = {}, stk = {};
      var L = function (n) {
        if (layer[n] != null) return layer[n];
        if (stk[n]) return -1;
        stk[n] = 1; var l = 0;
        deps[n].forEach(function (d) { var ld = L(d); if (ld + 1 > l) l = ld + 1; });
        stk[n] = 0; layer[n] = l; return l;
      };
      names.forEach(L);
      var nL = names.reduce(function (a, n) { return Math.max(a, layer[n]); }, 0) + 1;
      var cols = []; for (var i = 0; i < nL; i++) cols.push([]);
      names.forEach(function (n) { cols[layer[n]].push(n); });
      cols.forEach(function (c) { c.sort(function (a, b) { return a.localeCompare(b); }); });
      var pos = {}; cols.forEach(function (c) { c.forEach(function (n, i) { pos[n] = i; }); });
      for (var s = 0; s < 3; s++) {
        var down = s % 2 === 0;
        (down ? cols : cols.slice().reverse()).forEach(function (c) {
          c.sort(function (a, b) {
            var na = down ? deps[a] : cons[a], nb = down ? deps[b] : cons[b];
            var ba = na.length ? na.reduce(function (x, n) { return x + pos[n]; }, 0) / na.length : pos[a];
            var bb = nb.length ? nb.reduce(function (x, n) { return x + pos[n]; }, 0) / nb.length : pos[b];
            return ba - bb || a.localeCompare(b);
          });
          c.forEach(function (n, i) { pos[n] = i; });
        });
      }
      var GAP = 96, PX = 100, PY = 84, SLOT_GAP = 12;
      var grouping = this.gGroupColumns(cols, root, names.length, this.graphGroupState(root));
      var hidden = grouping.hidden;
      var visible = names.filter(function (n) { return !hidden.has(n); });
      /* Column width follows the measure names only. A group header is longer than most of
         them and ellipsises happily, so letting it drive the width would push every layer to
         the 390px cap and drop Fit all to a fifth of a screen. */
      var slotText = function (s) {
        if (s.kind !== 'group') return s.name.length;
        return s.shown.reduce(function (a, n) { return Math.max(a, n.length); }, 0);
      };
      var slotH = function (s) {
        if (s.kind !== 'group') return NH;
        var rows = s.shown.length;
        return GPAD * 2 + GHEAD + 6 + rows * NH + Math.max(0, rows - 1) * MGAP + (s.hidden || s.expanded ? 6 + GMORE : 0);
      };
      /* every slot's height is asked for four or five times below — measure each once */
      grouping.slots.forEach(function (ss) { ss.forEach(function (s) { s.h = slotH(s); }); });
      var colW = grouping.slots.map(function (ss) {
        return Math.min(390, Math.max(190, ss.reduce(function (a, s) { return Math.max(a, slotText(s)); }, 0) * 7 + 26));
      });
      var xy = {}, boxes = [], w, h;
      /* One slot is either a single measure or a labelled group of them; placing it writes
         the member coordinates and, for a group, the frame the reader sees around them. */
      var place = function (s, x, y, cw) {
        if (s.kind !== 'group') { xy[s.name] = { x: x, y: y, w: cw }; return; }
        var top = y + GPAD + GHEAD + 6;
        s.shown.forEach(function (n, i) { xy[n] = { x: x, y: top + i * (NH + MGAP), w: cw }; });
        boxes.push({ key: s.key, label: s.label, table: s.table, folder: s.folder, count: s.members.length,
          shown: s.shown.length, hidden: s.hidden, expanded: s.expanded,
          x: x - GPAD, y: y, w: cw + GPAD * 2, h: s.h });
      };
      if (vertical) {
        // Keep labels horizontal: each dependency layer becomes a row of slots.
        var rowW = grouping.slots.map(function (ss, li) { return ss.length * colW[li] + Math.max(0, ss.length - 1) * GAP; });
        var rowH = grouping.slots.map(function (ss) { return ss.reduce(function (a, s) { return Math.max(a, s.h); }, NH); });
        var widest = rowW.reduce(function (a, width) { return Math.max(a, width); }, 0);
        var rowY = {}, ay = PY, oi;
        for (oi = 0; oi < nL; oi++) { var li0 = direction === 1 ? oi : nL - 1 - oi; rowY[li0] = ay; ay += rowH[li0] + GAP; }
        w = PX * 2 + widest; h = ay - GAP + PY;
        grouping.slots.forEach(function (ss, li) {
          var x0 = PX + (widest - rowW[li]) / 2;
          ss.forEach(function (s, i) { place(s, x0 + i * (colW[li] + GAP), rowY[li], colW[li]); });
        });
      } else {
        var xs = [], ax = PX;
        grouping.slots.forEach(function (ss, li) { xs[li] = ax; ax += colW[li] + GAP; });
        var colH = grouping.slots.map(function (ss) {
          return ss.reduce(function (a, s) { return a + s.h; }, 0) + Math.max(0, ss.length - 1) * SLOT_GAP;
        });
        var tallest = colH.reduce(function (a, x) { return Math.max(a, x); }, NH);
        w = PX * 2 + colW.reduce(function (a, x) { return a + x; }, 0) + (nL - 1) * GAP;
        h = PY * 2 + tallest;
        grouping.slots.forEach(function (ss, li) {
          var y = PY + (tallest - colH[li]) / 2;
          ss.forEach(function (s) { place(s, xs[li], y, colW[li]); y += s.h + SLOT_GAP; });
        });
      }
      var rUp = this.gReach(root, deps), rDn = this.gReach(root, cons);
      var eList = []; visible.forEach(function (n) { deps[n].forEach(function (d) { if (!hidden.has(d)) eList.push([d, n]); }); });
      var inE = {}, outE = {}, prt = {};
      eList.forEach(function (e, i) { (inE[e[1]] = inE[e[1]] || []).push(i); (outE[e[0]] = outE[e[0]] || []).push(i); prt[i] = [0, 0]; });
      Object.keys(outE).forEach(function (a) {
        var l = outE[a].slice().sort(function (i, j) { return vertical ? xy[eList[i][1]].x - xy[eList[j][1]].x : xy[eList[i][1]].y - xy[eList[j][1]].y; });
        l.forEach(function (ei, k) { prt[ei][0] = l.length > 1 ? (k / (l.length - 1) - .5) * (vertical ? Math.min(120, xy[a].w - 40) : NH - 10) : 0; });
      });
      Object.keys(inE).forEach(function (b) {
        var l = inE[b].slice().sort(function (i, j) { return vertical ? xy[eList[i][0]].x - xy[eList[j][0]].x : xy[eList[i][0]].y - xy[eList[j][0]].y; });
        l.forEach(function (ei, k) { prt[ei][1] = l.length > 1 ? (k / (l.length - 1) - .5) * (vertical ? Math.min(120, xy[b].w - 40) : NH - 10) : 0; });
      });
      var geo = eList.map(function (e, i) {
        var a = e[0], b = e[1];
        var A = xy[a], B = xy[b], back = layer[a] >= layer[b];
        var d;
        if (vertical && !back) {
          var vx1 = A.x + A.w / 2 + prt[i][0], vy1 = A.y + (direction === 1 ? NH : 0);
          var vx2 = B.x + B.w / 2 + prt[i][1], vy2 = B.y + (direction === 1 ? 0 : NH);
          var vk = Math.min(90, Math.abs(vy2 - vy1) / 2);
          d = 'M' + vx1 + ',' + vy1 + ' C' + vx1 + ',' + (vy1 + direction * vk) + ' ' + vx2 + ',' + (vy2 - direction * vk) + ' ' + vx2 + ',' + vy2;
        } else if (vertical) {
          var right = Math.max(A.x + A.w, B.x + B.w) + 64;
          d = 'M' + (A.x + A.w) + ',' + (A.y + NH / 2) + ' C' + right + ',' + (A.y + NH / 2) + ' ' + right + ',' + (B.y + NH / 2) + ' ' + (B.x + B.w) + ',' + (B.y + NH / 2);
        } else if (!back) {
          var x1 = A.x + A.w, y1 = A.y + NH / 2 + prt[i][0], x2 = B.x, y2 = B.y + NH / 2 + prt[i][1], k = Math.min(90, (x2 - x1) / 2);
          d = 'M' + x1 + ',' + y1 + ' C' + (x1 + k) + ',' + y1 + ' ' + (x2 - k) + ',' + y2 + ' ' + x2 + ',' + y2;
        } else {
          var top = Math.min(A.y, B.y) - 64;
          d = 'M' + (A.x + A.w / 2) + ',' + A.y + ' C' + (A.x + A.w / 2) + ',' + top + ' ' + (B.x + B.w / 2) + ',' + top + ' ' + (B.x + B.w / 2) + ',' + B.y;
        }
        var base = b === root || rUp.has(b) ? 'var(--smv-up-line,#c3b1ee)' : (a === root || rDn.has(a) ? 'var(--smv-down-line,#a8c5ef)' : 'var(--smv-line,#d4d9e2)');
        return { a: a, b: b, d: d, back: back, base: base };
      });
      var relM = {}; Array.from(new Set([].concat(Array.from(upSet), Array.from(dnSet), names))).forEach(function (nm) { relM[nm] = nm === root ? 'root' : (upSet.has(nm) ? 'up' : (dnSet.has(nm) ? 'dn' : 'x')); });
      return { root: root, orientation: orientation, names: visible, inc: inc, deps: deps, cons: cons, hidU: hidU, hidD: hidD,
        upSet: upSet, dnSet: dnSet, xy: xy, w: w, h: h, geo: geo, nE: eList.length, relM: relM, capped: capped,
        boxes: boxes, groupOf: grouping.groupOf, hiddenByGroup: hidden, grouped: grouping.grouped };
    },
    /* Source cards are one table header plus only the columns used by visible links.
       Whole-table links attach to the header; column links attach to their own row. */
    addSourceLayout: function (G) {
      var self = this, app = this.app, selected = app.state.dependencySource;
      var measureNames = G.names.filter(function (name) { return !!app.msrOf(name); });
      var byTable = new Map(), links = [];
      var ensure = function (tn) {
        if (!byTable.has(tn)) byTable.set(tn, { table: tn, columns: new Set() });
        return byTable.get(tn);
      };
      measureNames.forEach(function (name) {
        var m = app.msrOf(name);
        (m._tables || []).forEach(function (tn) {
          if (selected && (selected.table !== tn || selected.column != null)) return;
          ensure(tn); links.push({ table: tn, column: null, to: name });
        });
        (m._cols || []).forEach(function (group) {
          if (selected && selected.table !== group.t) return;
          group.cs.forEach(function (cn) {
            if (selected && selected.column != null && selected.column !== cn) return;
            ensure(group.t).columns.add(cn); links.push({ table: group.t, column: cn, to: name });
          });
        });
      });
      if (selected) {
        var chosen = ensure(selected.table);
        if (selected.column != null) chosen.columns.add(selected.column);
      }
      if (!byTable.size) { G.sources = []; return G; }
      var remaining = 200;
      var sources = Array.from(byTable.values()).sort(function (a, b) { return a.table.localeCompare(b.table); }).filter(function (s) {
        if (!remaining) return false;
        remaining--;
        var columns = Array.from(s.columns).sort();
        s.omitted = Math.max(0, columns.length - remaining);
        s.columns = columns.slice(0, remaining); remaining -= s.columns.length;
        s.w = Math.min(320, Math.max(220, [s.table].concat(s.columns).reduce(function (max, n) { return Math.max(max, n.length); }, 0) * 7 + 32));
        s.h = NH + s.columns.length * NH + (s.omitted ? NH : 0);
        return true;
      });
      G.sourcesCapped = sources.length < byTable.size || sources.some(function (s) { return s.omitted; });
      var vertical = G.orientation !== 'lr', bottom = G.orientation === 'bt';
      var width = vertical ? sources.reduce(function (sum, s) { return sum + s.w + 40; }, -40) : Math.max.apply(null, sources.map(function (s) { return s.w; }));
      var height = vertical ? Math.max.apply(null, sources.map(function (s) { return s.h; })) : sources.reduce(function (sum, s) { return sum + s.h + 32; }, -32);
      var dx = vertical ? Math.max(0, (width + 120 - G.w) / 2) : width + 96;
      var dy = vertical ? (bottom ? 0 : height + 80) : Math.max(0, (height + 120 - G.h) / 2);
      // A virtual source root reserves a measure layer; reclaim it before the real nodes.
      if (selected && !vertical && measureNames.length) {
        var first = Math.min.apply(null, measureNames.map(function (n) { return G.xy[n].x; }));
        dx -= first - 100;
      }
      if (selected && vertical && !bottom && measureNames.length) {
        var firstY = Math.min.apply(null, measureNames.map(function (n) { return G.xy[n].y; }));
        dy -= firstY - 60;
      }
      var translate = function (d) {
        return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, function (_, x, y) { return (+x + dx) + ',' + (+y + dy); });
      };
      Object.keys(G.xy).forEach(function (n) { G.xy[n].x += dx; G.xy[n].y += dy; });
      G.boxes.forEach(function (b) { b.x += dx; b.y += dy; });
      G.geo = G.geo.filter(function (e) { return !selected || (e.a !== G.root && e.b !== G.root); });
      G.geo.forEach(function (e) { e.d = translate(e.d); });
      G.w = Math.max(G.w + dx, width + 120); G.h = Math.max(G.h + dy, height + 120);
      var cursor = 60, originY = bottom ? G.h + 60 : 60;
      if (bottom) G.h += height + 120;
      sources.forEach(function (s) {
        s.x = vertical ? cursor : 60; s.y = vertical ? originY : cursor;
        cursor += vertical ? s.w + 40 : s.h + 32;
        s.color = app.tableColor(app.model.byName[s.table]);
        [null].concat(s.columns).forEach(function (cn, i) {
          var key = self.sourceKey(s.table, cn);
          G.xy[key] = { x: s.x, y: s.y + i * NH, w: s.w };
          G.deps[key] = []; G.cons[key] = [];
        });
      });
      links.forEach(function (link) {
        var a = self.sourceKey(link.table, link.column), A = G.xy[a], B = G.xy[link.to];
        if (!A || !B) return;
        var x1, y1, x2, y2, d;
        if (vertical) {
          x1 = A.x + A.w / 2; y1 = A.y + (bottom ? 0 : NH);
          x2 = B.x + B.w / 2; y2 = B.y + (bottom ? NH : 0);
          var middle = (y1 + y2) / 2;
          d = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + middle + ' ' + x2 + ',' + middle + ' ' + x2 + ',' + y2;
        } else {
          x1 = A.x + A.w; y1 = A.y + NH / 2; x2 = B.x; y2 = B.y + NH / 2;
          var bend = Math.min(90, Math.max(24, (x2 - x1) / 2));
          d = 'M' + x1 + ',' + y1 + ' C' + (x1 + bend) + ',' + y1 + ' ' + (x2 - bend) + ',' + y2 + ' ' + x2 + ',' + y2;
        }
        if (G.deps[link.to].indexOf(a) < 0) G.deps[link.to].push(a); G.cons[a].push(link.to);
        G.geo.push({ a: a, b: link.to, d: d, base: app.tableColor(app.model.byName[link.table]), source: true,
          whole: link.column == null, label: link.column == null ? 'Whole table' : link.column,
          labelX: x1 + (vertical ? 6 : 10), labelY: y1 - 7 });
      });
      if (selected) {
        G.names = measureNames; G.inc.delete(G.root); G.upSet.delete(G.root); G.dnSet.delete(G.root);
        // The virtual root shares the selected source's position for Center and snapshots.
        G.xy[G.root] = G.xy[self.sourceKey(selected.table, selected.column)];
      }
      G.sources = sources; G.nE = G.geo.length;
      return G;
    },
    buildGraph: function () {
      var self = this, app = this.app;
      var root = this.graphRoot(), extra = app.state.gExtra || {};
      var key = (app.modelKey || '') + '|' + JSON.stringify(this._explanationContext) + '|' + root + '|' + this._showSources + '|' + !!app.state.dependencyDirectOnly + '|' + this._graphOrientation + '|' + Object.keys(extra).sort().join('\u0001')
        + '|' + Object.keys(this.graphGroupState(root)).sort().join('\u0001') + '|' + app.colorBy + '|' + app.paletteName;
      if (!this._gC || this._gC.k !== key) {
        var layout = this.gLayout(root, extra, CAP);
        this._gC = { k: key, g: this._showSources ? this.addSourceLayout(layout) : layout };
      }
      var G = this._gC.g;
      var pinN = app.state.gPin && app.state.gPin !== root ? app.state.gPin : null;
      var hov = app.state.gHover || pinN;
      var upR = null, dnR = null;
      if (hov && G.inc.has(hov)) { upR = this.gReach(hov, G.deps); dnR = this.gReach(hov, G.cons); }
      var edges = G.geo.map(function (e) {
        var onUp = upR && (e.b === hov || upR.has(e.b));
        var onDn = dnR && (e.a === hov || dnR.has(e.a));
        var rel = !!(onUp || onDn);
        var c = e.source ? e.base : e.back ? 'var(--smv-gold,#e58f5a)' : (rel ? (onUp ? 'var(--smv-up,#6d28d9)' : 'var(--smv-down,#2563eb)') : (hov ? 'var(--smv-line,#cdd3dd)' : e.base));
        var wd = rel ? (e.a === hov || e.b === hov ? 2 : 1.6) : 1.2, o = hov ? (rel ? 1 : .45) : .85;
        return {
          key: e.a + '\u0001' + e.b, d: e.d, da: e.back || e.whole ? '5 4' : 'none',
          label: e.whole ? 'Whole table' : '', labelX: e.labelX, labelY: e.labelY, color: c,
          st: "d:path('" + e.d + "');stroke:" + c + ";stroke-width:" + wd + "px;opacity:" + o + ";transition:d .28s ease,stroke .18s ease,opacity .18s ease,stroke-width .18s ease;"
        };
      });
      this._gRootXY = G.xy[root]; this._gInc = G.inc; this._gXY = G.xy; this._gRel = G.relM;
      this._gGroupOf = G.groupOf; this._gHiddenByGroup = G.hiddenByGroup;
      var nodes = G.names.map(function (n) {
        var p = G.xy[n], m = app.msrOf(n);
        var P = G.upSet.has(n) && n !== root ? ['var(--smv-up,#6d28d9)', 'var(--smv-up-soft,#f7f5ff)', 'var(--smv-up-border,#d9cffa)']
          : (G.dnSet.has(n) && n !== root ? ['var(--smv-down,#2563eb)', 'var(--smv-down-soft,#f2f7ff)', 'var(--smv-down-border,#c7dbfa)'] : ['var(--smv-muted,#5b6472)', '#fff', 'var(--smv-line,#dfe3e9)']);
        var dim = !!(hov && n !== hov && n !== root && !(upR && upR.has(n)) && !(dnR && dnR.has(n)));
        var removable = function (x) { return extra[x] && !G.upSet.has(x) && !G.dnSet.has(x); };
        var exU = G.deps[n].filter(removable), exD = G.cons[n].filter(removable);
        // A neighbour already included but collapsed still needs to be revealed.
        var room = Math.max(0, CAP - G.inc.size);
        var revealU = G.deps[n].filter(function (x) { return G.hiddenByGroup.has(x); }).concat(G.hidU[n].slice(0, room));
        var revealD = G.cons[n].filter(function (x) { return G.hiddenByGroup.has(x); }).concat(G.hidD[n].slice(0, room));
        var upN = revealU.length, dnN = revealD.length;
        var upLbl = upN ? '+' + upN : (exU.length ? '−' + exU.length : ''), dnLbl = dnN ? '+' + dnN : (exD.length ? '−' + exD.length : '');
        var pin = pinN === n;
        var base = (n === root
          ? 'border:1.5px solid var(--smv-burgundy,#1f2430);background:var(--smv-primary,var(--smv-burgundy,#1f2430));color:var(--smv-on-accent,#fff);font:600 12px/31px "IBM Plex Sans",sans-serif;box-shadow:0 4px 14px rgba(20,30,50,.30);'
          : 'border:1px solid ' + P[2] + ';background:' + P[1] + ';color:' + P[0] + ';font:500 12px/32px "IBM Plex Mono",monospace;')
          + (pin ? 'outline:2px solid ' + P[0] + ';outline-offset:1px;' : '');
        return {
          name: n,
          wrapS: 'position:absolute;z-index:2;left:' + (p.x - 34) + 'px;top:' + p.y + 'px;width:' + (p.w + 68) + 'px;display:flex;align-items:center;gap:4px;transition:left .28s ease,top .28s ease,opacity .18s ease;' + (dim ? 'opacity:.72;' : ''),
          s: 'flex:none;box-sizing:border-box;width:' + p.w + 'px;height:' + NH + 'px;' + base + 'border-radius:6px;padding:0 9px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          tip: n + app.tipFlags(n) + ((m && m.dax) ? '\n\n' + m.dax.trim().slice(0, 900) : ''),
          upMore: upLbl, upTip: upN ? ('Show ' + upN + ' additional upstream measures') : (exU.length ? ('Hide ' + exU.length + ' additional upstream measures') : ''),
          upBadgeS: self.gBadge(upLbl, !upN),
          dnMore: dnLbl, dnTip: dnN ? ('Show ' + dnN + ' additional downstream measures') : (exD.length ? ('Hide ' + exD.length + ' additional downstream measures') : ''),
          dnBadgeS: self.gBadge(dnLbl, !dnN),
          addUp: function () { var o = Object.assign({}, app.state.gExtra || {}); if (upN) revealU.forEach(function (k) { if (!G.inc.has(k)) o[k] = 1; }); else exU.forEach(function (k) { delete o[k]; }); self.setGraphExtras(o, upN ? revealU : []); },
          addDn: function () { var o = Object.assign({}, app.state.gExtra || {}); if (dnN) revealD.forEach(function (k) { if (!G.inc.has(k)) o[k] = 1; }); else exD.forEach(function (k) { delete o[k]; }); self.setGraphExtras(o, dnN ? revealD : []); },
          over: function () { app.setState({ gHover: n }); }, out: function () { app.setState({ gHover: null }); },
          pick: function () {
            clearTimeout(self._clkT);
            self._clkT = setTimeout(function () {
              if (app.state.dependencySource) { self.inspectMeasure(n); return; }
              var was = app.state.gPin === n;
              app.setState({ gPin: was ? null : n });
            }, 230);
          },
          reroot: function () { clearTimeout(self._clkT); self.pickMeasure(n); }
        };
      });
      var anyHid = Array.from(G.inc).some(function (n) { return G.hidU[n].length || G.hidD[n].length; });
      var groups = (G.boxes || []).map(function (b) {
        return {
          key: b.key, label: b.label + ' measures · ' + b.shown + ' shown', hidden: b.hidden, expanded: b.expanded, count: b.count,
          boxS: 'position:absolute;left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px;',
          moreLabel: b.hidden ? 'Show remaining ' + b.hidden : 'Show fewer',
          moreTip: b.hidden ? ('Show the remaining ' + b.hidden + ' measures in ' + b.label) : ('Collapse ' + b.label),
          toggle: function () { self.toggleGraphGroup(b.key); }
        };
      });
      return {
        nodes: nodes, edges: edges, groups: groups, sources: G.sources || [], sourcesCapped: G.sourcesCapped, root: G.root, xy: G.xy, w: G.w, h: G.h,
        pan: function (e) {
          if (e.button !== 0 || e.target.closest('button')) return;
          var elx = e.currentTarget;
          var sx = e.clientX, sy = e.clientY, sl = elx.scrollLeft, st = elx.scrollTop;
          elx.style.cursor = 'grabbing'; e.preventDefault();
          var mv = function (ev) { self._gAutoFit = false; elx.scrollLeft = sl - (ev.clientX - sx); elx.scrollTop = st - (ev.clientY - sy); };
          var up = function (ev) {
            elx.style.cursor = 'grab'; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
            if (Math.abs(ev.clientX - sx) < 4 && Math.abs(ev.clientY - sy) < 4 && app.state.gPin) app.setState({ gPin: null });
          };
          window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        },
        canvas: 'position:relative;width:' + G.w + 'px;height:' + G.h + 'px;',
        stat: G.inc.size + ' measures · ' + G.names.length + ' shown · ' + G.hiddenByGroup.size + ' collapsed · ' + G.nE + ' visible links',
        capped: G.capped || (G.inc.size >= CAP && anyHid), canExpand: G.hiddenByGroup.size > 0 || (anyHid && G.inc.size < CAP), hasExtra: Object.keys(extra).length > 0 || !!pinN,
        allExtra: function () {
          var o = {}; Object.keys(extra).forEach(function (n) { if (!G.upSet.has(n) && !G.dnSet.has(n)) o[n] = extra[n]; });
          var s = new Set(G.inc); var grow = true;
          while (grow && s.size < CAP) {
            grow = false;
            Array.from(s).forEach(function (n) {
              self.flowKids(n, 'up').concat(self.flowKids(n, 'down')).forEach(function (k) {
                if (!s.has(k) && s.size < CAP && app.msrOf(k)) { s.add(k); o[k] = 1; grow = true; }
              });
            });
          }
          return o;
        },
        structKey: this._gC.k
      };
    },
    setGraphExtras: function (extra, reveal, allGroups) {
      var layout = this.gLayout(this.graphRoot(), extra, CAP);
      var open = this.graphGroupState();
      if (allGroups) layout.boxes.forEach(function (box) { open[box.key] = true; });
      else (reveal || []).forEach(function (name) { if (layout.groupOf[name]) open[layout.groupOf[name]] = true; });
      this.app.setState({ gExtra: extra });
    },
    expandGraphAll: function () {
      this.setGraphExtras(this.buildGraph().allExtra(), [], true);
    },
    gBadge: function (lbl, minus) {
      return 'border:1px solid ' + (minus ? 'var(--smv-line,#c9cfd9)' : 'var(--smv-line,#d8dce3)') + ';background:' + (minus ? 'var(--smv-soft,#eef1f5)' : '#fff') +
        ';border-radius:9px;height:18px;padding:0 6px;cursor:pointer;font:600 9px/16px "IBM Plex Mono",monospace;color:' +
        (minus ? 'var(--smv-ink,#3a414d)' : 'var(--smv-muted,#7a8290)') + ';' + (lbl ? '' : 'visibility:hidden;');
    },
    gShow: function (name) {
      var self = this, app = this.app;
      if (app.state.dependencySource) { this.inspectMeasure(name); return; }
      var o = Object.assign({}, app.state.gExtra || {});
      if (!(this._gInc && this._gInc.has(name))) o[name] = 1;
      /* Opening the formula of a measure a collapsed group is hiding has to open the group
         too, otherwise the graph highlights a node that is not on screen. */
      if (this._gHiddenByGroup && this._gHiddenByGroup.has(name) && this._gGroupOf && this._gGroupOf[name]) {
        this.graphGroupState()[this._gGroupOf[name]] = true;
        this._gC = null;
      }
      app.setState({ gPin: name, gExtra: o }, function () {
        self.centerGraphNode(name);
      });
    },
    pickMeasure: function (n) {
      var self = this, app = this.app;
      if (window.SMVInteractive) window.SMVInteractive.closeLibrary(false);
      this.cancelSnapshotViewport();
      app.setState({ selMeasure: n, dependencySource: null, mvSourceMode: 'measures', mvSourcePicking: false, mvOpen: app.mvOpenFor(n), gExtra: {}, gHover: null, gPin: null });
    },
    gCenter: function () {
      this.centerGraphNode(this.graphRoot());
    },
    centerGraphNode: function (name) {
      var pane = this._gEl, R = this._gXY && this._gXY[name], z = this._gZoom || 1;
      if (!pane || !R) return;
      this._gAutoFit = false;
      var offset = this.graphStageOffset();
      pane.scrollTo({ left: Math.max(0, offset.x + (R.x + R.w / 2) * z - pane.clientWidth / 2), top: Math.max(0, offset.y + (R.y + NH / 2) * z - pane.clientHeight / 2), behavior: 'smooth' });
    },
    graphStageOffset: function () {
      var pane = this.gScroll, G = this._g, frame = this.gFrame;
      if (!pane || !G || !frame) return { x: 0, y: 0 };
      var width = parseFloat(frame.style.width) || Math.ceil(G.w * (this._gZoom || 1));
      var height = parseFloat(frame.style.height) || Math.ceil(G.h * (this._gZoom || 1));
      return { x: Math.max(0, (pane.clientWidth - width) / 2), y: Math.max(0, (pane.clientHeight - height) / 2) };
    },
    setGraphZoom: function (zoom, fit) {
      var pane = this.gScroll, G = this._g;
      if (!pane || !G) return;
      var old = this._gZoom || 1, before = this.graphStageOffset();
      var cx = (pane.scrollLeft + pane.clientWidth / 2 - before.x) / old;
      var cy = (pane.scrollTop + pane.clientHeight / 2 - before.y) / old;
      this._gZoom = Math.max(.02, Math.min(1.8, zoom));
      this._gAutoFit = !!fit;
      this.gCanvasEl.style.transform = 'scale(' + this._gZoom + ')';
      this.gFrame.style.width = Math.ceil(G.w * this._gZoom) + 'px';
      this.gFrame.style.height = Math.ceil(G.h * this._gZoom) + 'px';
      this.zoomLabel.textContent = Math.round(this._gZoom * 100) + '%';
      var after = this.graphStageOffset();
      pane.scrollLeft = Math.max(0, after.x + cx * this._gZoom - pane.clientWidth / 2);
      pane.scrollTop = Math.max(0, after.y + cy * this._gZoom - pane.clientHeight / 2);
    },
    fitGraph: function () {
      if (!this._g || !this.gScroll || !this.gScroll.clientWidth) return;
      this.setGraphZoom(Math.min(1, (this.gScroll.clientWidth - 32) / this._g.w, (this.gScroll.clientHeight - 32) / this._g.h), true);
      this.gScroll.scrollLeft = 0; this.gScroll.scrollTop = 0;
    },

    /* ---------- DAX tokenizer / cards ---------- */
    daxToks: function (dax) {
      var H = (this.app.model || {}).msrHome || {}, out = [], names = {};
      Object.keys(H).forEach(function (name) { names[name.toLowerCase()] = name; });
      var re = /(\/\/[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"]|"")*")|((?:(?:'(?:[^']|'')+'|[A-Za-z_\u0080-\uffff][A-Za-z0-9_.\u0080-\uffff]*)\s*)?\[(?:[^\]\r\n]|\]\])+\])/g;
      var pushTxt = function (s) {
        if (!s) return;
        var fre = /\b[A-Za-z_][A-Za-z0-9._]*(?=\s*\()|\b(VAR|RETURN|DEFINE|MEASURE|EVALUATE|IN|NOT|TRUE|FALSE)\b/gi;
        var l = 0, x;
        while ((x = fre.exec(s))) {
          if (x.index > l) out.push({ txt: s.slice(l, x.index) });
          if (x[1] != null) out.push({ kw: x[0] }); else out.push({ fn: x[0] });
          l = x.index + x[0].length;
        }
        if (l < s.length) out.push({ txt: s.slice(l) });
      };
      var last = 0, m, __g = 0;
      while ((m = re.exec(dax))) {
        if (++__g > 50000) throw new Error('LOOP-GUARD: daxToks');
        if (m.index > last) pushTxt(dax.slice(last, m.index));
        if (m[1] != null) out.push({ cmt: m[0] });
        else if (m[2] != null) out.push({ str: m[0] });
        else {
          var ref = m[0], parts = ref.match(/^((?:'(?:[^']|'')+'|[A-Za-z_\u0080-\uffff][A-Za-z0-9_.\u0080-\uffff]*)\s*)?(\[(?:[^\]\r\n]|\]\])+\])$/);
          var pre = parts && parts[1] ? parts[1].trim() : '';
          var inner = parts ? parts[2].slice(1, -1).replace(/\]\]/g, ']').trim() : '';
          var canonical = names[inner.toLowerCase()];
          var table = pre[0] === "'" ? pre.slice(1, -1).replace(/''/g, "'") : pre;
          if (canonical && (!pre || H[canonical].toLowerCase() === table.toLowerCase())) out.push({ msr: canonical, raw: ref });
          else out.push({ col: ref });
        }
        last = m.index + m[0].length;
      }
      if (last < dax.length) pushTxt(dax.slice(last));
      return out;
    },
    /* One colour per inlining level: the analyzed measure is purple, each level below it gets its own hue. */
    DEPTH_COLORS: [['var(--smv-up,#6d28d9)', 'var(--smv-up-soft,#f2edfd)', 'var(--smv-up-border,#dcd0f7)'], ['var(--smv-down,#2563eb)', 'var(--smv-down-soft,#eef4fe)', 'var(--smv-down-border,#c9dcf8)'], ['var(--smv-olive,#0f766e)', 'var(--smv-down-soft,#ecfaf7)', 'var(--smv-down-border,#bfe6df)'],
      ['var(--smv-gold-ink,#b45309)', 'var(--smv-soft,#fdf5e8)', 'var(--smv-line,#f1d9b0)'], ['var(--smv-burgundy,#be185d)', 'var(--smv-accent-soft,#fdeef5)', 'var(--smv-line,#f4c5da)'], ['var(--smv-muted,#475569)', 'var(--smv-soft,#f1f3f6)', 'var(--smv-line,#d5dae2)']],
    depthColor: function (d) { return this.DEPTH_COLORS[d % this.DEPTH_COLORS.length]; },
    depthChipStyle: function (d) {
      var P = this.depthColor(d);
      return 'display:inline;border:1px solid ' + P[2] + ';background:' + P[1] + ';color:' + P[0] + ';border-radius:4px;padding:0 3px;margin:0 1px;cursor:pointer;font:600 12px/1.7 "IBM Plex Mono",monospace;vertical-align:baseline;';
    },
    refStyle: function (name) {
      var r = (this._gRel || {})[name];
      var P = r === 'up' ? ['var(--smv-up,#6d28d9)', 'var(--smv-up-soft,#f2edfd)', 'var(--smv-up-border,#dcd0f7)'] : (r === 'dn' ? ['var(--smv-down,#2563eb)', 'var(--smv-down-soft,#eef4fe)', 'var(--smv-down-border,#c9dcf8)'] : ['var(--smv-ink,#3a414d)', 'var(--smv-soft,#f1f3f6)', 'var(--smv-line,#d5dae2)']);
      return 'display:inline;border:1px solid ' + P[2] + ';background:' + P[1] + ';color:' + P[0] + ';border-radius:4px;padding:0 3px;margin:0 1px;cursor:pointer;font:600 12px/1.7 "IBM Plex Mono",monospace;vertical-align:baseline;';
    },
    /* Format a measure's DAX with the local formatter; `inline` also splices in every measure it uses. */
    formatDax: function (name, dax, inline, style) {
      var self = this, app = this.app, opts = { style: style };
      if (!inline) return DaxFormat.format(dax, opts);
      return DaxFormat.formatInlined(dax, name, function (ref) {
        var t = self.daxToks(ref)[0];
        if (!t || !t.msr) return null;
        var m = app.msrOf(t.msr);
        return m ? { name: t.msr, dax: m.dax } : null;
      }, opts);
    },
    daxCard: function (name, inline) {
      var self = this, app = this.app;
      var m = app.msrOf(name); if (!m) return null;
      var rel = this._gRel || {}, dax = (m.dax || '').trim();
      var u = app.msrUse(name);
      var flags = { hid: !!m.h, hasUse: !!u, useN: u ? u.length : 0, useTip: app.useTip(u) };
      if (!dax) return Object.assign({ name: name, table: app.model.msrHome[name] || '', toks: [{ isM: false, isT: true, txt: '— no expression —', s: 'color:var(--smv-muted,#9aa1ad);' }] }, flags);
      var style = this._fmt || 'long';
      if (typeof DaxFormat !== 'undefined' && (style !== 'original' || inline)) {
        var printed = this.formatDax(name, dax, inline, style === 'original' ? 'long' : style);
        return Object.assign({ name: name, table: app.model.msrHome[name] || '', printed: printed, text: DaxFormat.toText(printed),
          inlined: inline ? { count: printed.count, cycles: printed.cycles, capped: printed.capped } : null }, flags);
      }
      var toks = this.daxToks(dax).map(function (t) {
        if (t.msr) {
          return {
            isM: true, isT: false, txt: t.raw || '[' + t.msr + ']', tip: 'Show ' + t.msr + ' on the flow',
            s: self.refStyle(t.msr),
            pick: function () { self.gShow(t.msr); }
          };
        }
        var s = 'color:var(--smv-ink,#3a414d);', txt = t.txt;
        if (t.cmt != null) { s = 'color:var(--smv-muted,#94a0b0);font-style:italic;'; txt = t.cmt; }
        else if (t.str != null) { s = 'color:var(--smv-gold-ink,#b45309);'; txt = t.str; }
        else if (t.col != null) { s = 'color:var(--smv-olive,#0f766e);'; txt = t.col; }
        else if (t.fn != null) { s = 'color:var(--smv-olive,#0e7490);font-weight:600;'; txt = t.fn; }
        else if (t.kw != null) { s = 'color:var(--smv-ink,#334155);font-weight:700;'; txt = t.kw; }
        return { isM: false, isT: true, txt: txt, s: s };
      });
      return Object.assign({ name: name, table: app.model.msrHome[name] || '', toks: toks }, flags);
    },

    /* ---------- rail rows ---------- */
    sourceMode: function () { return this.app.state.dependencySource || this.app.state.mvSourceMode === 'sources' ? 'sources' : 'measures'; },
    setLibraryMode: function (mode) {
      if (mode === 'sources') {
        var patch = { mvSourceMode: 'sources', mvSourcePicking: true };
        if (!this.app.state.dependencySource) Object.assign(patch, { selMeasure: null, gPin: null, gHover: null, gExtra: {} });
        this.app.setState(patch);
      } else {
        this.app.setState({ mvSourceMode: 'measures', mvSourcePicking: false, dependencySource: null,
          selMeasure: this.app.state.selMeasure || this.app.state.gPin || null, gPin: null, gHover: null, gExtra: {} });
      }
    },
    inspectMeasure: function (name) {
      if (!this.app.msrOf(name)) return;
      if (this._workspaceMode === 'graph') this._workspaceMode = 'split';
      var self = this;
      this.app.setState({ gPin: name, gHover: null }, function () { self.centerGraphNode(name); });
    },
    buildSourceChoices: function () {
      var state = this.app.state, query = (state.mvSourceQuery || '').trim().toLowerCase(), open = state.mvSourceOpen || {};
      return this.app.model.tables.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (t) {
        var tableMatch = t.name.toLowerCase().includes(query);
        var columns = (t.columns || []).filter(function (c) { return !query || tableMatch || c.name.toLowerCase().includes(query); });
        return { table: t.name, columns: columns, count: (t.columns || []).length,
          expanded: !!query || !!open[t.name], matches: !query || tableMatch || columns.length > 0 };
      }).filter(function (t) { return t.matches; });
    },
    sourceReason: function (name, impact) {
      var source = this.app.state.dependencySource, m = this.app.msrOf(name), direct = impact.direct.indexOf(name) >= 0;
      if (!direct) return 'Via ' + (m._deps || []).filter(function (n) { return impact.all.indexOf(n) >= 0; }).join(', ');
      if (source.column != null) return 'Direct · ' + source.column;
      var reasons = (m._tables || []).indexOf(source.table) >= 0 ? ['Whole table'] : [];
      (m._cols || []).forEach(function (group) { if (group.t === source.table) reasons = reasons.concat(group.cs); });
      return 'Direct · ' + reasons.join(', ');
    },
    buildImpactRows: function () {
      var self = this, app = this.app, impact = this.currentImpact(), direct = new Set(impact.direct);
      var query = (app.state.mvImpactQuery || '').trim().toLowerCase();
      var names = (app.state.dependencyDirectOnly ? impact.direct : impact.all).filter(function (name) {
        var m = app.msrOf(name);
        return m && (!query || [name, app.model.msrHome[name], m.folder, m.dax].join(' ').toLowerCase().includes(query));
      }).sort(function (a, b) { return Number(direct.has(b)) - Number(direct.has(a)) || a.localeCompare(b); });
      var limitKey = JSON.stringify([app.state.dependencySource, query, !!app.state.dependencyDirectOnly]);
      if (this._impactLimitKey !== limitKey) { this._impactLimitKey = limitKey; this._impactLimit = 120; }
      var visible = names.slice(0, this._impactLimit), rows = [], lastGroup;
      visible.forEach(function (name) {
        var isDirect = direct.has(name), group = isDirect ? 'Direct references' : 'Indirect dependents';
        if (group !== lastGroup) { rows.push({ isHeader: true, name: group, meta: String(names.filter(function (n) { return direct.has(n) === isDirect; }).length) }); lastGroup = group; }
        rows.push({ key: 'impact:' + name, name: name, table: app.model.msrHome[name],
          subtitle: self.sourceReason(name, impact), meta: isDirect ? 'Direct' : 'Indirect', selected: app.state.gPin === name,
          tip: name + '\n' + self.sourceReason(name, impact), depth: 0, click: function () { self.inspectMeasure(name); } });
      });
      return { rows: rows, total: names.length, modelTotal: impact.all.length, more: names.length - visible.length };
    },
    renderSourceChoices: function () {
      var self = this, app = this.app, state = app.state, choices = this.buildSourceChoices();
      U.clear(this.rowsEl);
      this.totalEl.textContent = choices.length + (choices.length === 1 ? ' table' : ' tables');
      if (!choices.length) { this.rowsEl.appendChild(el('p', { cls: 'mv-no-results', text: 'No matching tables or columns.' })); return; }
      choices.forEach(function (t) {
        var section = el('section', { cls: 'mv-source-choice' });
        section.appendChild(el('button', { cls: 'mv-source-choice-table', 'aria-expanded': String(t.expanded), 'aria-label': 'Browse columns in ' + t.table,
          onClick: function () { var open = Object.assign({}, state.mvSourceOpen || {}); open[t.table] = !t.expanded; app.setState({ mvSourceOpen: open }); }
        }, [el('span', { html: U.icon('chevRight', 12), style: 'transform:rotate(' + (t.expanded ? 90 : 0) + 'deg);' }), el('strong', { text: t.table }), el('span', { text: t.count })]));
        if (t.expanded) {
          section.appendChild(el('button', { cls: 'mv-source-choice-whole', 'aria-label': 'Use whole table ' + t.table,
            onClick: function () { self.analyzeSource(t.table); }
          }, [el('strong', { text: 'Use whole table' }), el('span', { text: 'All columns + whole-table references' })]));
          if (t.columns.length) section.appendChild(el('p', { cls: 'mv-source-choice-hint', text: 'Or choose a column' }));
          var limitKey = JSON.stringify([t.table, state.mvSourceQuery || '']);
          if (!self._sourcePages) self._sourcePages = new Map();
          var limit = self._sourcePages.get(limitKey) || 100;
          t.columns.slice(0, limit).forEach(function (c) {
            section.appendChild(el('button', { cls: 'mv-source-choice-column', text: c.name, title: self.sourceLabel({ table: t.table, column: c.name }),
              'aria-label': 'Use column ' + self.sourceLabel({ table: t.table, column: c.name }),
              onClick: function () { self.analyzeSource(t.table, c.name); } }));
          });
          if (limit < t.columns.length) section.appendChild(el('button', { cls: 'mv-text-button', text: 'Show more columns (' + (t.columns.length - limit) + ' remaining)',
            onClick: function () { self._sourcePages.set(limitKey, limit + 100); self._railKey = null; app.setState({}); } }));
        }
        self.rowsEl.appendChild(section);
      });
    },

    buildRows: function () {
      var self = this, app = this.app, M = app.model;
      var q = (app.state.mvQuery || '').trim().toLowerCase();
      var filter = app.state.mvFilter || 'all';
      var table = M.byName[app.state.mvTable] ? app.state.mvTable : '';
      var open = app.state.mvOpen || {}, rows = [], total = 0, modelTotal = 0;
      var root = { sub: {}, items: [] }, daxRoot = { sub: {}, items: [] }, daxOnly = 0;
      M.tables.forEach(function (t) {
        t.measures.forEach(function (m) {
          modelTotal++;
          if (table && t.name !== table) return;
          if (filter === 'hidden' && !m.h || filter === 'visible' && m.h) return;
          var inLabel = !q || [m.name, m.folder, t.name].join(' ').toLowerCase().includes(q);
          if (!inLabel && !String(m.dax || '').toLowerCase().includes(q)) return;
          total++;
          if (!inLabel) daxOnly++;
          String(m.folder || '').split(';').forEach(function (fp) {
            var node = inLabel ? root : daxRoot;
            fp.split('\\').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (seg) {
              node = (node.sub[seg] = node.sub[seg] || { sub: {}, items: [] });
            });
            node.items.push({ measure: m, table: t.name });
          });
        });
      });
      var cnt = function (n) { return Object.keys(n.sub).reduce(function (a, s) { return a + cnt(n.sub[s]); }, n.items.length); };
      var pushM = function (item, depth) {
        var m = item.measure, on = app.state.selMeasure === m.name, u = app.msrUse(m.name);
        var deps = (m._deps || []).length, consumers = (M.msrUsedBy[m.name] || []).length;
        rows.push({
          key: 'measure:' + item.table + ':' + m.name + ':' + rows.length,
          isFolder: false, name: m.name, table: item.table, selected: on, hid: !!m.h,
          hasUse: !!u, use: u ? u.length : 0, useTip: app.useTip(u),
          meta: deps + ' / ' + consumers,
          tip: m.name + '\n' + item.table + '\nUses ' + deps + ' measures · used by ' + consumers + ' measures',
          depth: depth, click: function () { self.pickMeasure(m.name); }
        });
      };
      var walk = function (node, depth, prefix) {
        Object.keys(node.sub).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).forEach(function (seg) {
          var child = node.sub[seg], p = prefix ? prefix + '\\' + seg : seg;
          var isOpen = q || filter !== 'all' || table ? true : !!open[p];
          rows.push({ key: 'folder:' + p, isFolder: true, name: seg, meta: String(cnt(child)), expanded: isOpen, depth: depth,
            click: function () { var o = Object.assign({}, app.state.mvOpen || {}); o[p] = !isOpen; app.setState({ mvOpen: o }); }
          });
          if (isOpen) walk(child, depth + 1, p);
        });
        node.items.slice().sort(function (a, b) { return a.measure.name.localeCompare(b.measure.name); }).forEach(function (m) { pushM(m, depth); });
      };
      // Name, folder and table matches come first; measures that only mention the text in their DAX follow.
      var heading = function (key, name, count) { rows.push({ key: 'section:' + key, isFolder: false, isHeader: true, name: name, meta: String(count), depth: 0 }); };
      var split = daxOnly > 0 && daxOnly < total;
      if (split) heading('name', 'Name matches', total - daxOnly);
      walk(root, 0, '');
      if (daxOnly) {
        if (split) heading('dax', 'Found in DAX', daxOnly);
        walk(daxRoot, 0, 'dax:');
      }
      return { rows: rows, total: total, modelTotal: modelTotal };
    },

    /* ---------- shell ---------- */
    buildShell: function () {
      var self = this, app = this.app;
      U.clear(this.host);
      var wrap = el('div', { cls: 'mv-workspace' });
      var pane = el('aside', { cls: 'mv-library', 'aria-label': 'Measure library', style: this.paneStyle() });
      var top = el('div', { cls: 'mv-library-top' });
      top.appendChild(el('div', { cls: 'mv-library-heading' }, [
        el('span', { cls: 'mv-eyebrow', text: 'MEASURE LIBRARY' }),
        el('button', { cls: 'mv-text-button', text: 'Overview', onClick: function () { app.setState({ selMeasure: null, dependencySource: null, mvSourceMode: 'measures', mvSourcePicking: false, gPin: null, gHover: null }); } })
      ]));
      if(document.body.dataset.smvInteractive&&window.SMVInteractive)top.querySelector('.mv-library-heading').appendChild(el('button', {
        cls:'mv-text-button',text:'Close','aria-label':'Close measure library',
        onClick:function(){window.SMVInteractive.closeLibrary(true);}
      }));
      var sourceModes = el('div', { cls: 'mv-filter-tabs mv-start-tabs', role: 'group', 'aria-label': 'Start analysis from' });
      this.sourceModeButtons = {};
      [['measures', 'Measure'], ['sources', 'Table or column']].forEach(function (item) {
        var button = el('button', { text: item[1], onClick: function () { self.setLibraryMode(item[0]); } });
        self.sourceModeButtons[item[0]] = button; sourceModes.appendChild(button);
      });
      top.appendChild(sourceModes);
      this.sourceSummaryEl = el('div', { cls: 'mv-library-source', hidden: true });
      top.appendChild(this.sourceSummaryEl);
      this.qInput = el('input', {
        cls: 'mv-search', type: 'search', value: app.state.mvQuery || '', placeholder: 'Search names, tables, or DAX…',
        'aria-label': 'Search measures by name, folder, table, or DAX', spellcheck: 'false',
        onInput: function (e) { var patch = {}; patch[self.libraryQueryField()] = e.target.value; app.setState(patch); },
        onKeyDown: function (e) { if (e.key === 'Escape') { var patch = {}; patch[self.libraryQueryField()] = ''; app.setState(patch); } }
      });
      top.appendChild(this.qInput);
      var filters = el('div', { cls: 'mv-filter-tabs', role: 'group', 'aria-label': 'Measure visibility' });
      this.filterBtns = {};
      [['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']].forEach(function (item) {
        var btn = el('button', { text: item[1], onClick: function () { app.setState({ mvFilter: item[0] }); } });
        self.filterBtns[item[0]] = btn; filters.appendChild(btn);
      });
      this.visibilityFilters = filters; top.appendChild(filters);
      this.tableSelect = el('select', { cls: 'mv-table-filter', 'aria-label': 'Filter measures by home table',
        onChange: function (e) { app.setState({ mvTable: e.target.value }); }
      }, el('option', { value: '', text: 'All home tables' }));
      app.model.tables.filter(function (t) { return t.measures.length; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (t) {
        self.tableSelect.appendChild(el('option', { value: t.name, text: t.name + ' (' + t.measures.length + ')' }));
      });
      top.appendChild(this.tableSelect);
      this.directInput = el('input', { type: 'checkbox', onChange: function (e) {
        self._gC = null; self._daxKey = null; app.setState({ dependencyDirectOnly: e.target.checked, gExtra: {}, gHover: null });
      } });
      this.directFilter = el('label', { cls: 'mv-library-direct', hidden: true }, [this.directInput, el('span', { text: 'Direct only' })]);
      top.appendChild(this.directFilter);
      this.totalEl = el('div', { cls: 'mv-library-count', 'aria-live': 'polite' });
      top.appendChild(this.totalEl);
      this.rowsEl = el('div', { cls: 'mv-library-rows', 'aria-label': 'Measures' });
      pane.appendChild(top); pane.appendChild(this.rowsEl);
      this.libraryFoot = el('div', { cls: 'mv-library-foot', text: 'Row counts: uses / used by · measures only' }); pane.appendChild(this.libraryFoot);
      this.pane = pane;
      var resizer = el('div', {
        cls: 'mv-resize', title: 'Resize measure library', role: 'separator', tabindex: '0',
        'aria-label': 'Resize measure library', 'aria-orientation': 'vertical',
        onKeyDown: function (e) {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault(); var w = Math.max(240, Math.min(480, (app.state.mvW || 296) + (e.key === 'ArrowRight' ? 20 : -20)));
          app.setState({ mvW: w }); store.set('smv-mvw', String(w));
        },
        onMouseDown: function (e) {
          e.preventDefault();
          var sx = e.clientX, w0 = pane.clientWidth, w = w0;
          var mv = function (ev) { w = Math.max(240, Math.min(480, w0 + ev.clientX - sx)); pane.style.width = w + 'px'; };
          var up = function () {
            window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
            app.setState({ mvW: w }); store.set('smv-mvw', String(w));
          };
          window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        }
      });
      this.mainEl = el('main', { cls: 'mv-main', 'aria-label': 'Measure analysis' });
      wrap.appendChild(pane); wrap.appendChild(resizer); wrap.appendChild(this.mainEl);
      this.host.appendChild(wrap);
      this._built = true; this._shellModel = app.modelKey;
    },
    paneStyle: function () { return 'width:' + Math.max(240, Math.min(480, this.app.state.mvW || 296)) + 'px;'; },
    libraryQueryField: function () { return this.sourceMode() === 'measures' ? 'mvQuery' : this.app.state.mvSourcePicking || !this.app.state.dependencySource ? 'mvSourceQuery' : 'mvImpactQuery'; },
    clearFilters: function () { this.app.setState({ mvQuery: '', mvFilter: 'all', mvTable: '' }); },

    renderRail: function () {
      var self = this, app = this.app;
      var key = [app.modelKey, app.state.mvQuery, app.state.mvFilter, app.state.mvTable, app.state.selMeasure, JSON.stringify(app.state.mvOpen || {}), app._usage ? 1 : 0, this.sourceMode(), app.state.mvSourcePicking, JSON.stringify(app.state.dependencySource), app.state.mvSourceQuery, JSON.stringify(app.state.mvSourceOpen || {}), app.state.mvImpactQuery, app.state.gPin, app.state.dependencyDirectOnly, this._impactLimit].join('|');
      if (key === this._railKey) return;
      this._railKey = key;
      var mode = this.sourceMode(), source = app.state.dependencySource, picking = mode === 'sources' && (app.state.mvSourcePicking || !source);
      Object.keys(this.sourceModeButtons).forEach(function (key) { self.sourceModeButtons[key].setAttribute('aria-pressed', String(key === mode)); });
      this.visibilityFilters.hidden = this.tableSelect.hidden = mode !== 'measures';
      this.directFilter.hidden = mode !== 'sources' || picking;
      this.directInput.checked = !!app.state.dependencyDirectOnly;
      this.sourceSummaryEl.hidden = !source || mode !== 'sources';
      U.clear(this.sourceSummaryEl);
      if (source && mode === 'sources') {
        this.sourceSummaryEl.appendChild(el('div', {}, [el('span', { cls: 'mv-eyebrow', text: 'SOURCE' }), el('strong', { text: this.sourceLabel(source) }),
          source.column == null ? el('span', { text: 'All columns + whole-table references' }) : null]));
        this.sourceSummaryEl.appendChild(el('button', { cls: 'mv-text-button', text: picking ? 'Cancel' : 'Change', 'aria-label': picking ? 'Cancel source selection' : 'Change analysis source',
          onClick: function () { app.setState({ mvSourcePicking: !picking }); } }));
      }
      var field = this.libraryQueryField(), placeholder = mode === 'measures' ? 'Search names, tables, or DAX…' : picking ? 'Find a table or column…' : 'Search dependent measures…';
      this.qInput.placeholder = placeholder;
      this.qInput.setAttribute('aria-label', mode === 'measures' ? 'Search measures by name, folder, table, or DAX' : picking ? 'Find a table or column' : 'Search dependent measures');
      if (this.qInput.value !== (app.state[field] || '')) this.qInput.value = app.state[field] || '';
      this.rowsEl.setAttribute('aria-label', mode === 'measures' ? 'Measures' : picking ? 'Tables and columns' : 'Dependent measures');
      this.libraryFoot.textContent = mode === 'measures' ? 'Row counts: uses / used by · measures only' : picking ? 'Choose a whole table or one column.' : 'Select to inspect DAX · Enter on a graph node to analyze';
      if (picking) { this.renderSourceChoices(); return; }
      var built = mode === 'sources' ? this.buildImpactRows() : this.buildRows();
      this.totalEl.textContent = mode === 'sources' ? built.total + ' of ' + built.modelTotal + ' dependent measures' : built.total === built.modelTotal ? built.total + ' measures' : built.total + ' of ' + built.modelTotal + ' measures';
      this.tableSelect.value = app.model.byName[app.state.mvTable] ? app.state.mvTable : '';
      Object.keys(this.filterBtns).forEach(function (f) { self.filterBtns[f].setAttribute('aria-pressed', String((app.state.mvFilter || 'all') === f)); });
      var active = document.activeElement && document.activeElement.dataset.mvRow;
      U.clear(this.rowsEl);
      if (!built.rows.length) {
        this.rowsEl.appendChild(el('div', { cls: 'mv-no-results' }, [
          el('strong', { text: mode === 'sources' && !built.modelTotal ? 'No dependent measures detected' : built.modelTotal ? 'No matching measures' : 'No measures in this model' }),
          el('p', { text: mode === 'sources' && !built.modelTotal ? 'This source has no detected measure references. Choose another table or column.' : built.modelTotal ? 'Try a different name, table, folder, or DAX function.' : 'Import a semantic model with measures to explore its DAX and dependencies.' }),
          built.modelTotal ? el('button', { cls: 'mv-button', text: 'Clear filters', onClick: function () { if (mode === 'sources') app.setState({ mvImpactQuery: '', dependencyDirectOnly: false }); else self.clearFilters(); } }) : null
        ]));
        return;
      }
      var frag = document.createDocumentFragment(), restore;
      built.rows.forEach(function (R) {
        if (R.isHeader) {
          frag.appendChild(el('div', { cls: 'mv-section-head' }, [el('span', { text: R.name }), el('span', { text: R.meta })]));
          return;
        }
        var kids = [];
        if (R.isFolder) kids.push(el('span', { cls: 'mv-folder-caret', text: R.expanded ? '▾' : '▸', 'aria-hidden': 'true' }));
        else kids.push(el('span', { cls: 'mv-measure-icon', text: 'ƒ', 'aria-hidden': 'true' }));
        kids.push(el('span', { cls: 'mv-row-label' }, [
          el('span', { cls: 'mv-row-name', text: R.name }),
          R.isFolder ? null : el('span', { cls: 'mv-row-table', text: R.subtitle || R.table })
        ]));
        if (R.hid) kids.push(el('span', { title: 'Hidden in the model', cls: 'mv-hidden-icon', 'aria-label': 'Hidden', html: U.icon('eyeOff', 12) }));
        if (R.hasUse) kids.push(el('span', { cls: 'mv-usage-badge', title: R.useTip, text: R.use + ' pg' }));
        kids.push(el('span', { cls: 'mv-row-count', text: R.meta, 'aria-hidden': 'true' }));
        var button = el('button', { cls: 'mv-library-row' + (R.isFolder ? ' mv-folder' : '') + (R.selected ? ' is-selected' : ''),
          title: R.tip || R.name, 'aria-label': R.tip || R.name, 'aria-current': R.selected ? 'true' : null,
          'aria-expanded': R.isFolder ? String(R.expanded) : null,
          data: { mvRow: R.key }, style: 'padding-left:' + (10 + R.depth * 12) + 'px;', onClick: R.click
        }, kids);
        if (active === R.key) restore = button;
        frag.appendChild(button);
      });
      this.rowsEl.appendChild(frag);
      if (built.more) this.rowsEl.appendChild(el('button', { cls: 'mv-text-button mv-library-more', text: 'Show more measures (' + built.more + ' remaining)',
        onClick: function () { self._impactLimit += 120; self._railKey = null; app.setState({}); } }));
      if (restore) restore.focus({ preventScroll: true });
    },

    /* ---------- main pane ---------- */
    renderMain: function () {
      var self = this, app = this.app, M = app.model;
      var sn = app.state.selMeasure;
      var m = app.msrOf(sn), source = app.state.dependencySource;
      var key = [app.modelKey, sn || '', JSON.stringify(source), this._showSources, this.sourceMode(), app._usage ? 1 : 0, m || source ? '' : [app.state.mvQuery, app.state.mvFilter, app.state.mvTable].join('|')].join('|');
      if (key !== this._mainKey) {
        this.closeMatchingResults();
        this._mainKey = key;
        this._flowKey = null; this._daxKey = null; this._nodeEls = {}; this._edgeEls = {}; this._edgeLabels = {}; this._groupEls = {}; this._sourceLayer = null;
        if (this._graphObserver) { this._graphObserver.disconnect(); this._graphObserver = null; }
        U.clear(this.mainEl);
        if (m || source) this.buildSelectedMain(sn, m || { _deps: [], _cols: [] }); else if (this.sourceMode() === 'sources') this.buildSourceEmptyMain(); else this.buildEmptyMain();
      }
      if (m || source) {
        this.renderFlow();
        this.renderDax();
        if (source) this.applyWorkspaceLayout();
      }
    },

    buildSourceEmptyMain: function () {
      this.mainEl.appendChild(el('div', { cls: 'mv-overview' }, [el('div', { cls: 'mv-eyebrow', text: 'CHOOSE A SOURCE' }),
        el('h1', { text: 'Start with a table or column.' }), el('p', { cls: 'mv-overview-intro', text: 'Choose a whole table to find measures referencing it or any of its columns. Expand a table to narrow the source to one column.' })]));
    },

    matchingMeasures: function () {
      var matches = new Map();
      this.buildRows().rows.forEach(function (row) { if (!row.isFolder && !row.isHeader) matches.set(row.name, row); });
      return Array.from(matches.values());
    },
    closeMatchingResults: function () {
      if (this._matchingDialog) this._matchingDialog.close();
    },
    openMatchingResults: function () {
      this.closeMatchingResults();
      var self = this, app = this.app, previous = document.activeElement, matches = this.matchingMeasures(), shown = 0;
      var dialog = el('dialog', { cls: 'mv-results-dialog', 'aria-label': 'Matching measures' });
      var close = function () { dialog.close(); };
      dialog.addEventListener('close', function () {
        dialog.remove();
        if (self._matchingDialog === dialog) self._matchingDialog = null;
        if (previous && previous.isConnected) previous.focus({ preventScroll: true });
      });
      var heading = el('header', { cls: 'mv-results-heading' }, [
        el('div', {}, [el('h2', { text: matches.length + (matches.length === 1 ? ' matching measure' : ' matching measures') }),
          el('p', { text: app.state.mvQuery ? 'Search: ' + app.state.mvQuery : 'Current library filters' })]),
        el('button', { cls: 'mv-button', text: 'Close', 'aria-label': 'Close matching results', onClick: close })
      ]);
      var results = el('div', { cls: 'mv-results-grid' });
      var more = el('button', { cls: 'mv-button mv-results-more', text: 'Show more results' });
      var open = function (name) { close(); self.pickMeasure(name); };
      var append = function () {
        matches.slice(shown, shown + 40).forEach(function (row) {
          var card = self.daxCard(row.name), body = self.daxBody(card);
          // Reference navigation leaves the preview and opens the referenced measure.
          body.addEventListener('click', function (e) {
            var button = e.target.closest('.mv-dax-ref');
            if (!button) return;
            var token = self.daxToks(button.textContent)[0];
            if (token && token.msr) { e.preventDefault(); e.stopImmediatePropagation(); open(token.msr); }
          }, true);
          results.appendChild(el('article', { cls: 'mv-dax-card mv-result-card' }, [
            el('header', { cls: 'mv-dax-card-header' }, [
              el('h3', { text: row.name }), el('div', { cls: 'mv-dax-card-meta', text: row.table }),
              el('button', { cls: 'mv-button mv-button-primary', text: 'Analyze measure',
                'aria-label': 'Analyze ' + row.name, onClick: function () { open(row.name); } })
            ]), body
          ]));
        });
        shown = Math.min(shown + 40, matches.length);
        more.hidden = shown >= matches.length;
        more.textContent = 'Show more results (' + (matches.length - shown) + ' remaining)';
      };
      more.addEventListener('click', append);
      dialog.appendChild(heading);
      if (!matches.length) dialog.appendChild(el('p', { cls: 'mv-results-empty', text: 'No measures match these filters. Close this window to change your search.' }));
      dialog.appendChild(results); dialog.appendChild(more);
      this.pane.appendChild(dialog); this._matchingDialog = dialog; this._matchingModel = app.model;
      append(); dialog.showModal();
    },

    buildEmptyMain: function () {
      var self = this, app = this.app, M = app.model, all = [], hidden = 0, links = 0;
      var filtered = !!(app.state.mvQuery || app.state.mvTable || (app.state.mvFilter && app.state.mvFilter !== 'all'));
      var matchCount = filtered ? this.matchingMeasures().length : 0;
      // Authored views explicitly request browsing formulas; preserve that opening view.
      if (filtered && this._explanationContext) {
        var matches = new Map();
        this.buildRows().rows.forEach(function (row) { if (!row.isFolder && !row.isHeader) matches.set(row.name, row); });
        var results = el('div', { cls: 'mv-starters' });
        matches.forEach(function (row) {
          var measure = app.msrOf(row.name);
          results.appendChild(el('button', { cls: 'mv-starter', data: { measure: row.name }, onClick: function () { self.pickMeasure(row.name); } }, [
            el('span', { cls: 'mv-row-label' }, [
              el('strong', { text: row.name }), el('span', { cls: 'mv-row-table', text: row.table }),
              el('code', { cls: 'mv-starter-dax', text: measure.dax || '— no expression —' })
            ]), el('span', { text: '→', 'aria-hidden': 'true' })
          ]));
        });
        this.mainEl.appendChild(el('section', { cls: 'mv-overview', 'aria-label': 'Matching measures' }, [
          el('h1', { text: matches.size + ' matching measures' }),
          el('p', { cls: 'mv-overview-intro', text: app.state.mvQuery ? 'Filter: ' + app.state.mvQuery : 'Current library filters' }),
          results, !matches.size ? el('p', { text: 'No measures match these filters.' }) : null
        ]));
        return;
      }
      M.tables.forEach(function (t) { t.measures.forEach(function (m) {
        all.push({ name: m.name, table: t.name, n: (M.msrUsedBy[m.name] || []).length });
        if (m.h) hidden++; links += (m._deps || []).length;
      }); });
      all.sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
      var stats = el('div', { cls: 'mv-overview-stats' });
      [[all.length, 'Measures'], [links, 'Dependency links'], [hidden, 'Hidden measures']].forEach(function (pair) {
        stats.appendChild(el('div', { cls: 'mv-overview-stat' }, [el('strong', { text: pair[0] }), el('span', { text: pair[1] })]));
      });
      var list = el('div', { cls: 'mv-starters' });
      all.slice(0, 8).forEach(function (item) {
        list.appendChild(el('button', { cls: 'mv-starter', onClick: function () { self.pickMeasure(item.name); } }, [
          el('span', { cls: 'mv-measure-icon', text: 'ƒ', 'aria-hidden': 'true' }),
          el('span', { cls: 'mv-row-label' }, [el('strong', { text: item.name }), el('span', { cls: 'mv-row-table', text: item.table })]),
          el('span', { cls: 'mv-starter-count', text: item.n ? item.n + ' dependents' : 'View DAX' }),
          el('span', { text: '→', 'aria-hidden': 'true' })
        ]));
      });
      this.mainEl.appendChild(el('div', { cls: 'mv-overview' }, [
        el('div', { cls: 'mv-eyebrow', text: 'MEASURE EXPLORER' }),
        el('h1', { text: 'Understand the logic behind your model.' }),
        el('p', { cls: 'mv-overview-intro', text: all.length ? 'Find a measure, read its DAX, and trace the measures it depends on. Compare formulas without losing your place in the dependency graph.' : 'This model does not contain measures. Import a model with DAX measures to explore its calculation logic.' }),
        filtered ? el('div', { cls: 'mv-search-summary' }, [
          el('span', { text: matchCount + (matchCount === 1 ? ' matching measure' : ' matching measures'), 'aria-live': 'polite' }),
          el('button', { cls: 'mv-button mv-button-primary', text: 'View matching results', onClick: function () { self.openMatchingResults(); } })
        ]) : null,
        stats,
        all.length ? el('h2', { text: all[0].n ? 'Start with a widely used measure' : 'Explore your measures' }) : null,
        list,
        el('div', { cls: 'mv-overview-note', text: 'Purple = upstream · Blue = downstream. Select a graph node to compare its DAX, then choose Analyze this measure to follow the trail.' })
      ]));
    },

    buildSelectedMain: function (sn, m) {
      var self = this, app = this.app, M = app.model, source = app.state.dependencySource, home = source ? source.table : M.msrHome[sn];
      this._graphModel = M; this._graphMeasure = this.graphRoot();
      var colGs = m._cols || [], nCols = colGs.reduce(function (a, c) { return a + c.cs.length; }, 0);
      var body = el('div', { cls: 'mv-analysis' });
      var metadata = el('div', { cls: 'mv-metadata' }, [
        el('button', { cls: 'mv-chip mv-home-table', title: 'Show home table in the table diagram', text: home, onClick: function () { app.focusTable(home); } }),
        el('span', { cls: 'mv-chip', text: (m._deps || []).length + ' direct upstream' }),
        el('span', { cls: 'mv-chip', text: (M.msrUsedBy[sn] || []).length + ' direct downstream' })
      ]);
      if (nCols) metadata.appendChild(el('span', { cls: 'mv-chip', text: nCols + (nCols === 1 ? ' column reference' : ' column references'), title: colGs.map(function (cg) { return cg.t + ': ' + cg.cs.join(', '); }).join('\n') }));
      if (m.h) metadata.appendChild(el('span', { cls: 'mv-chip', text: 'Hidden in model' }));
      var usage = app.msrUse(sn);
      if (usage) metadata.appendChild(el('span', { cls: 'mv-chip mv-chip-blue', text: usage.length + (usage.length === 1 ? ' report page' : ' report pages'), title: app.useTip(usage) }));
      else if (!usage && app._usage) metadata.appendChild(el('span', { cls: 'mv-chip', text: 'No direct report usage', title: 'Not directly referenced in ' + ((app._usageMeta && app._usageMeta.report) || 'the scanned report') + '. It may feed other measures that are used.' }));
      var header = el('header', { cls: 'mv-analysis-header' });
      var heading = el('div', { cls: 'mv-heading-block' }, [el('div', { cls: 'mv-eyebrow', text: 'ANALYZING MEASURE' }), el('h1', { text: sn }), metadata]);
      if (source) {
        U.clear(heading);
        heading.appendChild(el('div', { cls: 'mv-eyebrow', text: source.column == null ? 'ANALYZING TABLE' : 'ANALYZING COLUMN' }));
        heading.appendChild(el('h1', { text: this.sourceLabel(source) }));
        var impact = this.currentImpact();
        heading.appendChild(el('p', { cls: 'mv-source-summary', text: impact.direct.length + ' direct · ' + (impact.all.length - impact.direct.length) + ' indirect dependent measures' }));
        heading.appendChild(el('button', { cls: 'mv-text-button', text: 'Back to ' + source.table, onClick: function () { app.focusTable(source.table); } }));
      }
      header.appendChild(heading);
      var modes = el('div', { cls: 'mv-mode-switch', role: 'group', 'aria-label': 'Analysis view' });
      this._modeButtons = {};
      [['split', 'Split view'], ['dax', 'DAX'], ['graph', 'Dependencies']].forEach(function (item) {
        var btn = el('button', { text: item[1], onClick: function () { self.setWorkspaceMode(item[0]); } });
        self._modeButtons[item[0]] = btn; modes.appendChild(btn);
      });
      this.splitSelect = el('select', { cls: 'mv-layout-select', 'aria-label': 'DAX position in split view',
        onChange: function (e) { self.setSplitLayout(e.target.value); }
      }, [el('option', { value: 'beside', text: 'DAX beside graph' }), el('option', { value: 'below', text: 'DAX below graph' })]);
      header.appendChild(el('div', { cls: 'mv-view-controls' }, [modes, this.splitSelect])); body.appendChild(header);
      this.analysisBody = el('div', { cls: 'mv-analysis-body' });

      var graphPane = el('section', { cls: 'mv-graph-panel', 'aria-label': 'Measure dependency graph' });
      this.directionLabel = el('p');
      this.orientationSelect = el('select', { cls: 'mv-layout-select mv-orientation-select', 'aria-label': 'Dependency graph direction',
        onChange: function (e) { self.setGraphOrientation(e.target.value); }
      }, [el('option', { value: 'lr', text: 'Left → right' }), el('option', { value: 'tb', text: 'Top → bottom' }), el('option', { value: 'bt', text: 'Bottom → top' })]);
      var graphHeading = el('div', { cls: 'mv-panel-heading' }, [el('div', {}, [
        el('h2', { text: 'Dependency flow' }), this.directionLabel
      ]), this.orientationSelect]);
      this.updateDirectionLabel();
      graphPane.appendChild(graphHeading);
      this.sourceToggle = el('input', { type: 'checkbox', checked: this._showSources, onChange: function (e) { self.setShowSources(e.target.checked); } });
      var sourceControls = el('div', { cls: 'mv-source-controls' }, el('label', {}, [this.sourceToggle, el('span', { text: 'Show table and column references' })]));
      graphPane.appendChild(sourceControls);
      var graphToolbar = el('div', { cls: 'mv-graph-toolbar', role: 'group', 'aria-label': 'Graph navigation' });
      var graphButton = function (label, title, click) { return el('button', { cls: 'mv-button', text: label, title: title, 'aria-label': title, onClick: click }); };
      this.zoomLabel = graphButton('100%', 'Reset dependency graph zoom to 100%', function () { self.setGraphZoom(1); self.gCenter(); });
      graphToolbar.appendChild(graphButton('−', 'Zoom out dependency graph', function () { self.setGraphZoom((self._gZoom || 1) / 1.2); }));
      graphToolbar.appendChild(this.zoomLabel);
      graphToolbar.appendChild(graphButton('+', 'Zoom in dependency graph', function () { self.setGraphZoom((self._gZoom || 1) * 1.2); }));
      graphToolbar.appendChild(graphButton('Fit all', 'Fit entire dependency graph', function () { self.fitGraph(); }));
      graphToolbar.appendChild(graphButton('Center', 'Center the analysis source', function () { self.gCenter(); }));
      graphToolbar.appendChild(el('span', { cls: 'mv-toolbar-spacer' }));
      this.expandBtn = graphButton('Expand all', 'Expand all upstream and downstream branches and groups, up to 500 measures', function () { self.expandGraphAll(); });
      this.resetBtn = graphButton('Reset', 'Reset dependency expansion and comparison', function () { app.setState({ gExtra: {}, gPin: null, gHover: null }); });
      graphToolbar.appendChild(this.expandBtn); graphToolbar.appendChild(this.resetBtn);
      graphPane.appendChild(graphToolbar);
      this.cappedEl = el('div', { cls: 'mv-cap-notice', text: '500-measure display limit reached. Additional upstream or downstream measures are omitted. Analyze another measure to explore them.' });
      graphPane.appendChild(this.cappedEl);
      this.gScroll = el('div', { cls: 'mv-graph-scroll', tabindex: '0', 'aria-label': 'Dependency graph. Drag to pan or use arrow keys. Select a measure to compare its formula.' });
      this.gFrame = el('div', { cls: 'mv-graph-frame' });
      this.gCanvasEl = el('div', { cls: 'mv-graph-canvas' });
      this.gSvg = sv('svg', { width: 1, height: 1, style: 'position:absolute;z-index:1;left:0;top:0;pointer-events:none;', 'aria-hidden': 'true' });
      this.gSvg.appendChild(sv('defs', {}, sv('marker', { id: 'mv-flow-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, sv('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }))));
      this.gCanvasEl.appendChild(this.gSvg); this.gFrame.appendChild(this.gCanvasEl); this.gScroll.appendChild(this.gFrame);
      this._gEl = this.gScroll; this._gScrolledFor = null; this._gZoom = 1; this._gAutoFit = false;
      graphPane.appendChild(this.gScroll);
      this.statEl = el('span', { cls: 'mv-graph-stat' });
      graphPane.appendChild(el('div', { cls: 'mv-graph-footer' }, [
        el('span', { cls: 'mv-legend-up', text: '● Upstream' }), el('span', { cls: 'mv-legend-down', text: '● Downstream' }), this.statEl,
        this._showSources ? el('span', { cls: 'mv-graph-help', text: 'Whole table: dashed link to header · Column: solid link to row' }) : null,
        el('span', { cls: 'mv-graph-help', text: 'Click to compare · Enter to analyze' })
      ]));
      this.analysisBody.appendChild(graphPane);
      this.splitDivider = el('div', { cls: 'mv-split-divider', role: 'separator', tabindex: '0',
        'aria-label': 'Resize graph and DAX panels', 'aria-valuemin': '20', 'aria-valuemax': '80',
        title: 'Drag to resize. Use arrow keys, or double-click to reset.',
        onPointerDown: function (e) { self.beginSplitResize(e); },
        onDblClick: function () { self.setSplitShare(self._effectiveSplit === 'below' ? .52 : .55, true); },
        onKeyDown: function (e) {
          var below = self._effectiveSplit === 'below';
          if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); self.setSplitShare(e.key === 'Home' ? .2 : .8, true); return; }
          if (e.key !== (below ? 'ArrowUp' : 'ArrowLeft') && e.key !== (below ? 'ArrowDown' : 'ArrowRight')) return;
          e.preventDefault(); var direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
          self.setSplitShare(self._renderedShare + direction * .05, true);
        }
      }, el('span', { 'aria-hidden': 'true' }));
      this.analysisBody.appendChild(this.splitDivider);
      var daxPane = el('section', { cls: 'mv-dax-panel', 'aria-label': 'DAX formulas' });
      this.wrapBtn = el('button', { cls: 'mv-button', text: 'Wrap lines', 'aria-pressed': String(this._wrapDax !== false), onClick: function () {
        self._wrapDax = self._wrapDax === false;
        self.daxGrid.classList.toggle('mv-no-wrap', !self._wrapDax);
        self.wrapBtn.setAttribute('aria-pressed', String(self._wrapDax));
        self.savePreferences();
      } });
      daxPane.appendChild(el('div', { cls: 'mv-panel-heading' }, [el('div', {}, [el('h2', { text: 'DAX workspace' }), el('p', { text: 'Read the formula. Compare the logic.' })]), this.wrapBtn]));
      this.daxGrid = el('div', { cls: 'mv-dax-grid' + (this._wrapDax === false ? ' mv-no-wrap' : '') });
      daxPane.appendChild(this.daxGrid);
      this.analysisBody.appendChild(daxPane); body.appendChild(this.analysisBody); this.mainEl.appendChild(body);
      this.setWorkspaceMode(this._workspaceMode || 'split', false);
      if (typeof ResizeObserver !== 'undefined') {
        var resizeFrame = 0;
        var observer = this._graphObserver = new ResizeObserver(function () {
          if (resizeFrame) return;
          // Stacking and its label can resize the observed panes. Apply those changes
          // on the next frame rather than re-entering ResizeObserver delivery.
          resizeFrame = requestAnimationFrame(function () {
            resizeFrame = 0;
            if (self._graphObserver !== observer) return;
            self.applyWorkspaceLayout();
            /* The pane is usually still 0x0 on the frame a measure is chosen, and a viewport
               placed against nothing lands nowhere. This is the callback that fires the moment
               it gets a real size, so it is where the first placement belongs — no retry loop,
               and nothing left spinning when the pane never opens at all. */
            self.applyInitialViewport();
            if (self._gAutoFit) self.fitGraph();
          });
        });
        this._graphObserver.observe(this.gScroll);
        this._graphObserver.observe(this.analysisBody);
      }
    },
    savePreferences: function () {
      store.setJSON(PREF_KEY, { mode: this._workspaceMode, split: this._splitLayout, orientation: this._graphOrientation,
        besideShare: this._splitShares.beside, belowShare: this._splitShares.below, wrap: this._wrapDax, sources: this._showSources, fmt: this._fmt });
    },
    setWorkspaceMode: function (mode, persist) {
      if (mode === 'dax' && this._workspaceMode !== 'dax') this.rememberGraphViewport();
      this._workspaceMode = choice(mode, ['split', 'dax', 'graph'], 'split');
      if (persist !== false) this.savePreferences();
      this.applyWorkspaceLayout();
      if (this.daxGrid) this.daxGrid.scrollTop = 0;
      var self = this;
      Object.keys(this._modeButtons).forEach(function (key) { self._modeButtons[key].setAttribute('aria-pressed', String(key === self.analysisBody.getAttribute('data-mode'))); });
      if (this._workspaceMode !== 'dax') requestAnimationFrame(function () { if (self._gAutoFit) self.fitGraph(); else if (persist !== false || !self._showSources) self.gCenter(); self.restorePendingViewport(); });
    },
    setSplitLayout: function (layout) {
      this._splitLayout = choice(layout, ['beside', 'below'], 'beside');
      this.savePreferences(); this.applyWorkspaceLayout();
      var self = this;
      requestAnimationFrame(function () { if (self._gAutoFit) self.fitGraph(); else self.gCenter(); });
    },
    splitMetrics: function () {
      var rect = this.analysisBody.getBoundingClientRect(), css = getComputedStyle(this.analysisBody);
      var layout = this._splitLayout === 'beside' && rect.width < 720 ? 'below' : this._splitLayout;
      var padding = layout === 'below' ? parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) : parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
      var available = Math.max(1, (layout === 'below' ? rect.height : rect.width) - padding - 12);
      // Clamp the rendered ratio as space changes without discarding the saved preference.
      var minimum = Math.min(.45, Math.max(.2, (layout === 'below' ? 180 : 280) / available));
      return { layout: layout, available: available, share: Math.max(minimum, Math.min(1 - minimum, this._splitShares[layout])) };
    },
    applyWorkspaceLayout: function () {
      if (!this.analysisBody) return;
      var metrics = this.splitMetrics();
      this._effectiveSplit = metrics.layout; this._renderedShare = metrics.share;
      var mode = this.app.state.dependencySource && !this.app.state.gPin && this._workspaceMode === 'split' ? 'graph' : this._workspaceMode;
      this.analysisBody.setAttribute('data-mode', mode);
      var self = this;
      Object.keys(this._modeButtons || {}).forEach(function (key) { self._modeButtons[key].setAttribute('aria-pressed', String(key === mode)); });
      this.analysisBody.setAttribute('data-split', metrics.layout);
      this.analysisBody.style.setProperty('--mv-graph-share', (metrics.share * 100) + 'fr');
      this.analysisBody.style.setProperty('--mv-dax-share', ((1 - metrics.share) * 100) + 'fr');
      if (this.splitSelect) {
        var stacked = this._splitLayout !== metrics.layout;
        var label = stacked ? 'DAX below graph (narrow view)' : 'DAX beside graph';
        if (this.splitSelect.options[0].textContent !== label) this.splitSelect.options[0].textContent = label;
        this.splitSelect.value = this._splitLayout;
        this.splitSelect.hidden = mode !== 'split';
        this.splitSelect.title = stacked ? 'DAX is below the graph while the workspace is narrow. Your beside preference returns when there is room.' : 'Choose where DAX appears in split view.';
      }
      if (this.splitDivider) {
        this.splitDivider.setAttribute('aria-orientation', metrics.layout === 'below' ? 'horizontal' : 'vertical');
        this.splitDivider.setAttribute('aria-valuenow', Math.round(metrics.share * 100));
        this.splitDivider.setAttribute('aria-valuetext', 'Graph ' + Math.round(metrics.share * 100) + ' percent, DAX ' + Math.round((1 - metrics.share) * 100) + ' percent');
      }
    },
    setSplitShare: function (value, persist) {
      this._splitShares[this._effectiveSplit || this._splitLayout] = share(value, .5);
      this.applyWorkspaceLayout();
      if (persist) this.savePreferences();
    },
    beginSplitResize: function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var self = this, target = e.currentTarget, metrics = this.splitMetrics();
      var below = metrics.layout === 'below', start = below ? e.clientY : e.clientX;
      target.setPointerCapture(e.pointerId);
      target.classList.add('is-dragging');
      var move = function (ev) { self.setSplitShare(metrics.share + ((below ? ev.clientY : ev.clientX) - start) / metrics.available, false); };
      var finish = function () {
        target.classList.remove('is-dragging');
        target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', finish);
        self.savePreferences();
      };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish); target.addEventListener('pointercancel', finish);
    },
    updateDirectionLabel: function () {
      if (this.orientationSelect) this.orientationSelect.value = this._graphOrientation;
      if (this.directionLabel) this.directionLabel.textContent = this._graphOrientation === 'tb' ? 'Upstream above · downstream below'
        : this._graphOrientation === 'bt' ? 'Downstream above · upstream below' : 'Upstream → analyzed measure → downstream';
    },
    setGraphOrientation: function (orientation) {
      this._graphOrientation = choice(orientation, ['lr', 'tb', 'bt'], 'lr');
      this.savePreferences(); this.updateDirectionLabel();
      this._gC = null;
      if (this.gCanvasEl) { this.renderFlow(); if (this._gAutoFit) this.fitGraph(); else this.gCenter(); }
    },

    renderSourceCards: function (G) {
      var self = this, app = this.app;
      var key = G.structKey + '|' + (G.sources || []).map(function (s) { return s.table + ':' + s.color; }).join('|');
      if (this._sourceLayer && this._sourceLayer.parentNode === this.gCanvasEl && this._sourceRenderKey === key) return;
      this._sourceRenderKey = key;
      if (this._sourceLayer) this._sourceLayer.remove();
      this._sourceLayer = el('div', { cls: 'mv-source-layer' });
      (G.sources || []).forEach(function (s) {
        var selected = app.state.dependencySource;
        var card = el('section', { cls: 'mv-source-card', 'aria-label': 'Source table ' + s.table,
          style: 'left:' + s.x + 'px;top:' + s.y + 'px;width:' + s.w + 'px;--mv-source-color:' + s.color + ';--mv-source-tint:' + U.tint(s.color, .08) + ';' });
        var row = function (cn, label, header) {
          var active = selected && selected.table === s.table && selected.column === cn;
          return el('button', { cls: (header ? 'mv-source-header' : 'mv-source-column') + (active ? ' is-selected' : ''),
            text: label, title: header ? 'Find measures referencing ' + s.table + ' or any of its columns' : 'Find measures referencing ' + s.table + '[' + cn + ']',
            'aria-label': header ? 'Analyze table ' + s.table : 'Analyze column ' + s.table + '[' + cn + ']',
            'aria-pressed': String(!!active), onClick: function () { self.analyzeSource(s.table, cn); } });
        };
        card.appendChild(row(null, s.table, true));
        s.columns.forEach(function (cn) { card.appendChild(row(cn, cn, false)); });
        if (s.omitted) card.appendChild(el('span', { cls: 'mv-source-omitted', text: s.omitted + ' more referenced columns' }));
        self._sourceLayer.appendChild(card);
      });
      this.gCanvasEl.appendChild(this._sourceLayer);
    },

    renderFlow: function () {
      var self = this, app = this.app;
      var G;
      try { G = this.buildGraph(); }
      catch (e) { console.error(e); this.gCanvasEl.textContent = String(e.message || e); return; }
      var structureChanged = this._flowKey !== G.structKey;
      this._flowKey = G.structKey;
      this._g = G;
      this.gScroll.onmousedown = G.pan;
      this.statEl.textContent = G.stat;
      this.cappedEl.style.display = G.capped || G.sourcesCapped ? '' : 'none';
      this.cappedEl.textContent = G.sourcesCapped ? 'Source display limit reached (200 table/column rows). Select a table or column to narrow the analysis.' : '500-measure display limit reached. Select another source or measure to explore omitted branches.';
      this.expandBtn.style.display = G.canExpand ? '' : 'none';
      this.resetBtn.style.display = G.hasExtra ? '' : 'none';
      this.gCanvasEl.style.cssText = G.canvas + 'transform-origin:0 0;transform:scale(' + (this._gZoom || 1) + ');';
      this.gSvg.setAttribute('width', G.w); this.gSvg.setAttribute('height', G.h);

      this.renderSourceCards(G);

      /* edges — reuse path elements so the CSS d-transition animates on expansion */
      var seenE = {};
      G.edges.forEach(function (E) {
        seenE[E.key] = 1;
        var p = self._edgeEls[E.key];
        if (!p) {
          p = sv('path', { fill: 'none', 'marker-end': 'url(#mv-flow-arrow)' });
          self._edgeEls[E.key] = p;
          self.gSvg.appendChild(p);
          p.appendChild(sv('title', {}));
        }
        p.setAttribute('d', E.d);
        p.setAttribute('stroke-dasharray', E.da);
        p.style.cssText = E.st;
        p.firstChild.textContent = E.label || 'Dependency';
        if (!self._edgeLabels) self._edgeLabels = {};
        var label = self._edgeLabels[E.key];
        if (E.label && !label) { label = sv('text', { 'class': 'mv-source-edge-label' }); self._edgeLabels[E.key] = label; self.gSvg.appendChild(label); }
        if (label) { label.textContent = E.label; label.setAttribute('x', E.labelX); label.setAttribute('y', E.labelY); label.setAttribute('fill', '#53647c'); }
      });
      Object.keys(this._edgeEls).forEach(function (k) {
        if (!seenE[k]) { self._edgeEls[k].remove(); delete self._edgeEls[k]; }
      });

      Object.keys(this._edgeLabels || {}).forEach(function (k) { if (!seenE[k]) { self._edgeLabels[k].remove(); delete self._edgeLabels[k]; } });

      /* group frames — one per home table + display folder bundle, keyed so a frame that
         survives a re-layout keeps its element (and its expanded state reads instantly) */
      var seenG = {};
      (G.groups || []).forEach(function (grp) {
        seenG[grp.key] = 1;
        var rec = self._groupEls[grp.key];
        if (!rec) {
          var head = el('div', { cls: 'mv-flow-group-head' });
          var more = el('button', { cls: 'mv-flow-group-more' });
          var box = el('div', { cls: 'mv-flow-group' }, [head, more]);
          rec = { box: box, head: head, more: more };
          self._groupEls[grp.key] = rec;
          self.gCanvasEl.appendChild(box);
          more.addEventListener('click', function () { rec.h.toggle(); });
        }
        rec.h = grp;
        rec.box.style.cssText = grp.boxS;
        rec.head.textContent = grp.label;
        rec.head.title = grp.label;
        rec.more.textContent = grp.moreLabel;
        rec.more.title = grp.moreTip;
        rec.more.setAttribute('aria-label', grp.moreTip);
        rec.more.setAttribute('aria-expanded', String(!!grp.expanded));
        rec.more.style.display = (grp.hidden || grp.expanded) ? '' : 'none';
      });
      Object.keys(this._groupEls).forEach(function (k) {
        if (!seenG[k]) { self._groupEls[k].box.remove(); delete self._groupEls[k]; }
      });

      /* nodes — keyed by measure name so left/top transitions survive re-layout */
      var seenN = {};
      G.nodes.forEach(function (N) {
        seenN[N.name] = 1;
        var rec = self._nodeEls[N.name];
        if (!rec) {
          var upBtn = el('button', { cls: 'hv-up' });
          var btn = el('button', { cls: 'hv-bright' });
          var dnBtn = el('button', { cls: 'hv-dn' });
          var wrap = el('div', {}, [
            el('span', { style: 'flex:none;width:30px;display:flex;justify-content:flex-end;' }, upBtn),
            btn,
            el('span', { style: 'flex:none;width:30px;display:flex;justify-content:flex-start;' }, dnBtn)
          ]);
          rec = { wrap: wrap, btn: btn, upBtn: upBtn, dnBtn: dnBtn };
          self._nodeEls[N.name] = rec;
          self.gCanvasEl.appendChild(wrap);
          btn.addEventListener('click', function () { rec.h.pick(); });
          btn.addEventListener('dblclick', function () { rec.h.reroot(); });
          btn.addEventListener('mouseenter', function () { rec.h.over(); });
          btn.addEventListener('mouseleave', function () { rec.h.out(); });
          btn.addEventListener('focus', function () { rec.h.over(); });
          btn.addEventListener('blur', function () { rec.h.out(); });
          btn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); rec.h.reroot(); } });
          upBtn.addEventListener('click', function () { rec.h.addUp(); });
          dnBtn.addEventListener('click', function () { rec.h.addDn(); });
        }
        rec.h = N;
        rec.wrap.style.cssText = N.wrapS;
        rec.btn.style.cssText = N.s;
        rec.btn.textContent = N.name;
        rec.btn.title = N.tip;
        rec.btn.setAttribute('aria-label', N.name + '. Click or Space to compare. Enter to analyze.');
        rec.btn.setAttribute('aria-pressed', String(app.state.gPin === N.name));
        rec.btn.setAttribute('aria-current', String(app.state.selMeasure === N.name));
        rec.upBtn.style.cssText = N.upBadgeS; rec.upBtn.textContent = N.upMore; rec.upBtn.title = N.upTip;
        rec.dnBtn.style.cssText = N.dnBadgeS; rec.dnBtn.textContent = N.dnMore; rec.dnBtn.title = N.dnTip;
        rec.upBtn.setAttribute('aria-label', N.upTip + ' for ' + N.name);
        rec.dnBtn.setAttribute('aria-label', N.dnTip + ' for ' + N.name);
      });
      Object.keys(this._nodeEls).forEach(function (k) {
        if (!seenN[k]) { self._nodeEls[k].wrap.remove(); delete self._nodeEls[k]; }
      });

      if (this._gScrolledFor !== this.graphRoot()) {
        this._gScrolledFor = this.graphRoot();
        this._initViewportFor = null;
        this.applyInitialViewport();
      } else if (this._gAutoFit && structureChanged) this.fitGraph();
      else {
        this.gFrame.style.width = Math.ceil(G.w * (this._gZoom || 1)) + 'px';
        this.gFrame.style.height = Math.ceil(G.h * (this._gZoom || 1)) + 'px';
      }
    },

    /* The opening view for a measure: a readable zoom with the analyzed node in the middle.
       It is applied at most once per analyzed measure — called from renderFlow when the pane
       already has a size, and otherwise from the resize observer on the frame it gets one.
       `_initViewportFor` is the record of which measure has had its opening view, so a
       restored snapshot or a scroll the reader made is never overwritten later. */
    applyInitialViewport: function () {
      var pane = this.gScroll, G = this._g, name = this.graphRoot();
      if (!pane || !G || this._initViewportFor === name) return;
      if (this._snapshotViewport) return;         // a restored snapshot owns the viewport
      if (!pane.clientWidth || !pane.clientHeight) return;
      this._initViewportFor = name;
      var init = this.initialViewport(G, pane.clientWidth, pane.clientHeight);
      this.setGraphZoom(init.zoom);
      pane.scrollLeft = init.scrollLeft; pane.scrollTop = init.scrollTop;
    },

    daxBody: function (card) {
      if (card.printed) return this.printedBody(card);
      var code = el('code', { cls: 'mv-dax-code' });
      card.toks.forEach(function (T) {
        if (T.isM) code.appendChild(el('button', { cls: 'mv-dax-ref', style: T.s, title: T.tip, text: T.txt, onClick: T.pick }));
        else code.appendChild(el('span', { style: T.s, text: T.txt }));
      });
      return el('pre', { cls: 'mv-dax-body', tabindex: '0', 'aria-label': 'DAX formula for ' + card.name }, code);
    },
    /* Formatted DAX as rows with a fold arrow in the left margin. Fold state lives in this._folds,
       keyed by measure, layout and inline mode, so it survives a redraw but not a layout switch. */
    printedBody: function (card) {
      var self = this, P = card.printed, STYLE = {
        fn: 'color:var(--smv-olive,#0e7490);font-weight:600;', kw: 'color:var(--smv-ink,#334155);font-weight:700;', str: 'color:var(--smv-gold-ink,#b45309);',
        cmt: 'color:var(--smv-muted,#94a0b0);font-style:italic;', num: 'color:var(--smv-ink,#3a414d);', op: 'color:var(--smv-ink,#3a414d);', txt: 'color:var(--smv-ink,#3a414d);' };
      var plain = !!(card.inlined && this._plainDax);
      var foldKey = [card.name, this._fmt, card.inlined ? 'i' : 'n'].join('|');
      var set = this._folds[foldKey] || (this._folds[foldKey] = {});
      var seen = {}, byFrom = {};
      P.regions.forEach(function (r) {
        var base = r.kind + ':' + r.label; seen[base] = (seen[base] || 0) + 1; r.key = base + '#' + seen[base];
        (byFrom[r.from] = byFrom[r.from] || []).push(r);
      });
      var body = el('pre', { cls: 'mv-dax-body mv-dax-fold' + (plain ? ' mv-dax-plain' : ''), tabindex: '0', 'aria-label': 'DAX formula for ' + card.name });
      var refCache = {};
      var segment = function (p) {
        if (p.k === 'inl') {
          return el('button', { cls: 'mv-dax-ref mv-dax-chip', style: self.depthChipStyle(p.depth || 0), text: p.v,
            title: (p.depth ? 'Inlined measure, level ' + p.depth : 'The analyzed measure') + '. Click to show it on the flow.',
            onClick: function () { var t = refCache[p.v] || (refCache[p.v] = self.daxToks(p.v)[0] || {}); if (t.msr) self.gShow(t.msr); } });
        }
        if (p.k === 'ref') {
          var t = refCache[p.v] || (refCache[p.v] = self.daxToks(p.v)[0] || {});
          if (t.msr) {
            return el('button', { cls: 'mv-dax-ref', style: self.refStyle(t.msr), text: p.v,
              title: 'Show ' + t.msr + ' on the flow', onClick: function () { self.gShow(t.msr); } });
          }
          return el('span', { style: 'color:var(--smv-olive,#0f766e);', text: p.v });
        }
        return el('span', { style: STYLE[p.k] || STYLE.txt, text: p.v });
      };
      var foldButton = function (reg, collapsed) {
        return el('button', { cls: 'mv-dax-fold-btn', text: collapsed ? '▸' : '▾', 'aria-expanded': String(!collapsed),
          title: (collapsed ? 'Expand ' : 'Collapse ') + reg.label, 'aria-label': (collapsed ? 'Expand ' : 'Collapse ') + reg.label,
          onClick: function () { if (set[reg.key]) delete set[reg.key]; else set[reg.key] = true; draw(); } });
      };
      var moreButton = function (reg) {
        return el('button', { cls: 'mv-dax-more', text: '⋯', title: 'Expand ' + reg.label, 'aria-label': 'Expand ' + reg.label,
          onClick: function () { delete set[reg.key]; draw(); } });
      };
      /* The innermost inlined measure that holds each line sets the colour of that line's left edge. */
      var lineDepth = [];
      P.regions.forEach(function (r) {
        if (r.kind !== 'measure') return;
        for (var k = r.from; k <= r.to; k++) if (!lineDepth[k] || lineDepth[k] < r.depth) lineDepth[k] = r.depth;
      });
      var tint = function (row, i) {
        var P2 = self.depthColor(lineDepth[i] || 0);
        row.style.cssText = 'border-left:3px solid ' + P2[2] + ';background:' + P2[1] + '66;';
        row.setAttribute('data-level', String(lineDepth[i] || 0));
      };
      if (plain) {
        DaxFormat.plainLines(P).forEach(function (L) {
          var parts = L.parts;
          var row = el('div', { cls: 'mv-dax-row' });
          var code = el('span', { cls: 'mv-dax-line' });
          if (L.indent) code.appendChild(document.createTextNode(Array(L.indent + 1).join('    ')));
          parts.forEach(function (p) { code.appendChild(segment(p)); });
          row.appendChild(code); body.appendChild(row);
        });
        return body;
      }
      var draw = function () {
        U.clear(body);
        var i = 0;
        while (i < P.lines.length) {
          var L = P.lines[i], opens = byFrom[i] || [];
          var coll = opens.filter(function (r) { return set[r.key]; }).sort(function (x, y) { return y.to - x.to; })[0];
          var row = el('div', { cls: 'mv-dax-row' });
          var gutter = el('span', { cls: 'mv-dax-gutter' });
          var reg = coll || opens[0];
          if (reg) gutter.appendChild(foldButton(reg, !!coll));
          var code = el('span', { cls: 'mv-dax-line' });
          if (L.indent) code.appendChild(document.createTextNode(Array(L.indent + 1).join('    ')));
          /* A collapsed measure shows its label, then "(", then the ⋯ button, then ")". */
          var split = coll && coll.openLine > coll.from;
          var upTo = coll && !split ? coll.openPart + 1 : L.parts.length;
          L.parts.slice(0, upTo).forEach(function (p) { code.appendChild(segment(p)); });
          if (split) {
            code.appendChild(document.createTextNode(' '));
            P.lines[coll.openLine].parts.slice(0, coll.openPart + 1).forEach(function (p) { code.appendChild(segment(p)); });
          }
          if (coll) {
            code.appendChild(moreButton(coll));
            P.lines[coll.to].parts.slice(coll.closePart).forEach(function (p) { code.appendChild(segment(p)); });
          }
          if (card.inlined) tint(row, i);
          row.appendChild(gutter); row.appendChild(code); body.appendChild(row);
          i = coll ? coll.to + 1 : i + 1;
        }
      };
      card.fold = {
        count: P.regions.length,
        measures: P.regions.filter(function (r) { return r.kind === 'measure'; }).length,
        collapse: function (kind) {
          P.regions.forEach(function (r) { if (!kind || r.kind === kind) set[r.key] = true; });
          draw();
        },
        expand: function () { Object.keys(set).forEach(function (k) { delete set[k]; }); draw(); }
      };
      draw();
      return body;
    },
    daxHeader: function (card, label, dotStyle, onClose, canInline) {
      var self = this, m = this.app.msrOf(card.name), raw = card.text || ((m && m.dax) || '').trim();
      var inl = !!card.inlined;
      var copy = el('button', { cls: 'mv-button', text: inl ? 'Copy inlined DAX' : 'Copy DAX', 'aria-label': (inl ? 'Copy inlined DAX for ' : 'Copy DAX for ') + card.name,
        title: inl ? 'Copies plain DAX with every measure replaced by its DAX. No labels, nothing folded. Paste it into Tabular Editor as a measure expression.' : 'Copies the DAX as shown' });
      var status = el('span', { cls: 'mv-copy-status', role: 'status', 'aria-live': 'polite' });
      var copyText = function (text) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          status.textContent = 'Copy unavailable. Select the formula to copy.'; return;
        }
        navigator.clipboard.writeText(text).then(function () { status.textContent = 'Copied'; }, function () { status.textContent = 'Copy unavailable. Select the formula to copy.'; });
      };
      copy.addEventListener('click', function () { copyText(raw); });
      var actions = el('div', { cls: 'mv-dax-actions' }, [status, copy]);
      if (inl) {
        var asQuery = el('button', { cls: 'mv-button', text: 'Copy as query', 'aria-label': 'Copy inlined DAX for ' + card.name + ' as a query',
          title: 'Copies EVALUATE ROW ( "Value", ... ). Paste it into DAX Studio and run it.',
          onClick: function () { copyText('EVALUATE\nROW (\n    "Value",\n' + raw.replace(/^/gm, '    ') + '\n)'); } });
        actions.insertBefore(asQuery, copy.nextSibling);
      }
      if (card.fold && card.fold.count && !(card.inlined && this._plainDax)) {
        var F = card.fold;
        if (F.measures) actions.insertBefore(el('button', { cls: 'mv-button', text: 'Collapse measures', title: 'Fold every inlined measure so only the top-level formula shows', onClick: function () { F.collapse('measure'); } }), copy);
        actions.insertBefore(el('button', { cls: 'mv-button', text: 'Collapse all', onClick: function () { F.collapse(); } }), copy);
        actions.insertBefore(el('button', { cls: 'mv-button', text: 'Expand all', onClick: function () { F.expand(); } }), copy);
      }
      if (canInline && raw) {
        var layout = el('select', { cls: 'mv-layout-select', 'aria-label': 'DAX layout', title: 'DAX layout: original text, or SQLBI-style short or long lines',
          onChange: function () { self._fmt = layout.value; self.savePreferences(); self._daxKey = null; self.renderDax(); } },
          [['original', 'Original'], ['long', 'Long lines'], ['short', 'Short lines']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
        layout.value = this._fmt;
        var inlineBtn = el('button', { cls: 'mv-button', text: 'Inline measures', 'aria-pressed': String(!!this._inlineDax),
          title: 'Replace every measure reference with that measure\'s DAX. A reference used in a row context loses its implicit context transition.',
          onClick: function () { self._inlineDax = !self._inlineDax; self._daxKey = null; self.renderDax(); } });
        actions.insertBefore(layout, actions.firstChild);
        if (this._inlineDax) {
          var plainBtn = el('button', { cls: 'mv-button', text: 'Plain text', 'aria-pressed': String(!!this._plainDax),
            title: 'Show the full inlined DAX as plain text: no labels, no folding. This is what Copy inlined DAX copies.',
            onClick: function () { self._plainDax = !self._plainDax; self._daxKey = null; self.renderDax(); } });
          actions.insertBefore(plainBtn, layout);
        }
        actions.insertBefore(inlineBtn, actions.firstChild);
      }
      if (onClose) {
        actions.appendChild(el('button', { cls: 'mv-button mv-button-primary', text: 'Analyze this measure', onClick: function () { self.pickMeasure(card.name); } }));
        actions.appendChild(el('button', { cls: 'mv-text-button', title: 'Clear comparison', 'aria-label': 'Clear comparison with ' + card.name, text: 'Clear', onClick: onClose }));
      }
      var header = el('div', { cls: 'mv-dax-card-header' }, [
        el('div', { cls: 'mv-dax-card-label' }, [el('span', { style: dotStyle }), el('span', { text: label })]),
        el('h3', { text: card.name }),
        el('div', { cls: 'mv-dax-card-meta' }, [
          el('span', { text: card.table + (m && m.fmt ? ' · Format: ' + m.fmt : '') }),
          card.inlined ? el('span', { cls: 'mv-inline-note', text: ' · Inlined ' + card.inlined.count + (card.inlined.count === 1 ? ' measure' : ' measures') +
            (card.inlined.cycles.length ? ' · Circular, kept as reference: ' + card.inlined.cycles.join(', ') : '') +
            (card.inlined.capped ? ' · Too large, some references kept' : '') }) : null
        ]),
        actions
      ]);
      return header;
    },
    referenceData: function (card) {
      var m = this.app.msrOf(card.name), refs;
      if (card.inlined && this.app.referencesInDax) refs = this.app.referencesInDax(card.text, card.table);
      else refs = { measures: (m._deps || []).slice(), tables: (m._tables || []).slice(),
        columns: (m._cols || []).map(function (g) { return { t: g.t, cs: g.cs.slice() }; }), unresolved: m._unresolved || [] };
      refs.scope = card.inlined ? 'References in expanded DAX' : 'Direct references · original formula';
      refs.partial = !!(card.inlined && (card.inlined.capped || card.inlined.cycles.length));
      return refs;
    },
    referenceSection: function (card) {
      var self = this, refs = this.referenceData(card), nCols = refs.columns.reduce(function (n, g) { return n + g.cs.length; }, 0);
      var section = el('section', { cls: 'mv-card-references', 'aria-label': 'References for ' + card.name,
        data: { referenceScope: card.inlined ? 'expanded' : 'original' } }, el('h4', { text: refs.scope }));
      var group = function (label, count, empty) {
        var row = el('div', { cls: 'mv-reference-group' }, el('strong', { text: label + ' (' + count + ')' }));
        var items = el('div', { cls: 'mv-reference-items' });
        if (!count) items.appendChild(el('span', { cls: 'mv-reference-empty', text: empty }));
        row.appendChild(items); section.appendChild(row); return items;
      };
      var measures = group('Measures', refs.measures.length, card.inlined ? 'No remaining measure references' : 'No direct measure references');
      refs.measures.forEach(function (name) { measures.appendChild(el('button', { cls: 'mv-reference-chip mv-reference-measure', text: name,
        title: 'Inspect ' + name, onClick: function () { self.gShow(name); } })); });
      var columns = group('Columns', nCols, card.inlined ? 'No column references in expanded DAX' : 'No direct column references');
      refs.columns.forEach(function (g) { g.cs.forEach(function (column) {
        var label = self.sourceLabel({ table: g.t, column: column });
        columns.appendChild(el('button', { cls: 'mv-reference-chip mv-reference-source', style: '--mv-reference-color:' + self.app.tableColor(self.app.model.byName[g.t]) + ';', text: label, title: 'Find measures depending on ' + label,
          onClick: function () { self.analyzeSource(g.t, column); } }));
      }); });
      if (refs.tables.length) {
        var tables = group('Whole tables', refs.tables.length, '');
        refs.tables.forEach(function (table) { tables.appendChild(el('button', { cls: 'mv-reference-chip mv-reference-source', style: '--mv-reference-color:' + self.app.tableColor(self.app.model.byName[table]) + ';', text: table + ' · Whole table',
          title: 'Find measures depending on ' + table, onClick: function () { self.analyzeSource(table); } })); });
      }
      if (refs.partial) section.appendChild(el('p', { cls: 'mv-reference-note', text: 'Expansion stopped at a cycle or size limit. Remaining measure references are listed above.' }));
      if (refs.unresolved.length) section.appendChild(el('p', { cls: 'mv-reference-note', text: refs.unresolved.length + ' unresolved reference' + (refs.unresolved.length === 1 ? '' : 's') + ' in this formula.' }));
      return section;
    },
    formulaCard: function (card, label, color, close, canInline, comparing) {
      // Build the body before the header: formatting supplies the folding controls.
      var body = this.daxBody(card);
      return el('article', { cls: 'mv-dax-card' + (comparing ? ' mv-comparison-card' : ''),
        data: { smvKind: 'measure', smvName: card.name, smvTable: card.table } }, [
        this.daxHeader(card, label, 'width:8px;height:8px;border-radius:2px;flex:none;background:' + color + ';', close, canInline),
        body, this.referenceSection(card)
      ]);
    },
    renderSourceDax: function () {
      var self = this, app = this.app, source = app.state.dependencySource;
      var pin = app.state.gPin, key = JSON.stringify([app.modelKey, source, pin, this._inlineDax, this._plainDax, this._fmt]);
      if (this._daxKey === key) return;
      this._daxKey = key; U.clear(this.daxGrid); this.daxGrid.setAttribute('data-comparing', 'false');
      var card = pin ? this.daxCard(pin, this._inlineDax) : null;
      if (card) this.daxGrid.appendChild(this.formulaCard(card, 'Inspecting measure · source remains ' + this.sourceLabel(source), 'var(--smv-down,#2563eb)',
        function () { app.setState({ gPin: null, gHover: null }); }, true, false));
      else this.daxGrid.appendChild(el('div', { cls: 'mv-compare-empty' }, [el('strong', { text: 'Select a dependent measure' }),
        el('p', { text: 'Select a measure in the left library or graph to inspect its DAX while keeping this source.' })]));
    },

    renderDax: function () {
      var self = this, app = this.app;
      if (app.state.dependencySource) { this.renderSourceDax(); return; }
      var sn = app.state.selMeasure;
      var pinName = app.state.gPin && app.state.gPin !== sn ? app.state.gPin : null;
      var key = [app.modelKey, sn, pinName || '', this._inlineDax ? 1 : 0, this._plainDax ? 1 : 0, this._fmt, app._usage ? 1 : 0, JSON.stringify(app.state.gExtra || {})].join('|');
      if (key === this._daxKey) return;
      this._daxKey = key;
      U.clear(this.daxGrid);
      var left = this.daxCard(sn, this._inlineDax);
      if (!left) return;
      this.daxGrid.appendChild(this.formulaCard(left, 'Analyzed measure', 'var(--smv-burgundy,#1f2430)', null, true, false));
      var pinCard = pinName ? this.daxCard(pinName) : null;
      this.daxGrid.setAttribute('data-comparing', String(!!pinCard));
      if (pinCard) {
        var pr = (this._gRel || {})[pinName];
        var pinColor = pr === 'up' ? 'var(--smv-up,#6d28d9)' : (pr === 'dn' ? 'var(--smv-down,#2563eb)' : 'var(--smv-ink,#3a414d)');
        this.daxGrid.appendChild(this.formulaCard(pinCard, 'Comparing · ' + (pr === 'up' ? 'upstream' : pr === 'dn' ? 'downstream' : 'related measure'), pinColor,
          function () { app.setState({ gPin: null, gHover: null }); }, false, true));
      } else {
        this.daxGrid.appendChild(el('div', { cls: 'mv-compare-empty' }, [
          el('strong', { text: 'Compare a related measure' }),
          el('p', { text: 'Select a node in the graph or a highlighted measure in the formula to read both expressions here.' })
        ]));
      }

    },

    update: function () {
      var app = this.app;
      var on = app.state.viewMode === 'measures' && app.state.loaded;
      if (this._matchingDialog && (!on || this._matchingModel !== app.model)) this.closeMatchingResults();
      if (!on) {
        if (this._built) this.rememberGraphViewport();
        if (this._built) { if (this._graphObserver) { this._graphObserver.disconnect(); this._graphObserver = null; } U.clear(this.host); this._built = false; this._railKey = null; this._mainKey = null; this._daxKey = null; this._nodeEls = {}; this._edgeEls = {}; this._edgeLabels = {}; this._groupEls = {}; this._sourceLayer = null; this._gScrolledFor = null; this._initViewportFor = null; }
        return;
      }
      if (this._built && this._shellModel !== app.modelKey) {
        if (this._graphObserver) { this._graphObserver.disconnect(); this._graphObserver = null; }
        this._built = false; this._gScrolledFor = null; this._initViewportFor = null;
      }
      if (!this._built) {
        var last = this._lastGraphViewport;
        if (!this._snapshotViewport && last && this.graphRoot() && last.model === app.model && last.selected === this.graphRoot() && last.context === this.graphViewportContext()) {
          this._snapshotViewport = { model: app.model, selected: this.graphRoot(), graph: Object.assign({}, last.graph) };
        }
        this.buildShell(); this._railKey = null; this._mainKey = null; this._daxKey = null;
      }
      this.pane.style.cssText = this.paneStyle();
      this.renderRail();
      this.renderMain();
      this.restorePendingViewport();
    }
  };

  g.MeasuresView = MeasuresView;
})(window);
