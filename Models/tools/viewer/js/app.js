/* Semantic Model Viewer — application shell: state, model loading, usage data,
   model import (TMDL/BIM) and repo connection. */
(function (g) {
  'use strict';
  var store = U.store;

  /* Read DAX references without mistaking comment markers inside strings for
     comments. Quoted identifiers escape apostrophes as '', brackets as ]]. */
  function daxReferences(text) {
    text = String(text || '');
    var refs = [], i = 0, n = text.length;
    var trivia = function (at) {
      while (at < n) {
        if (/\s/.test(text[at])) { at++; continue; }
        var two = text.slice(at, at + 2);
        if (two === '//' || two === '--') {
          at += 2; while (at < n && text[at] !== '\n' && text[at] !== '\r') at++;
        } else if (two === '/*') {
          var end = text.indexOf('*/', at + 2); at = end < 0 ? n : end + 2;
        } else break;
      }
      return at;
    };
    var quoted = function (at, end, escape) {
      var value = ''; at++;
      while (at < n) {
        if (text[at] === end) {
          if (text[at + 1] === escape) { value += end; at += 2; continue; }
          return { value: value, next: at + 1, closed: true };
        }
        value += text[at++];
      }
      return { value: value, next: at, closed: false };
    };
    while (i < n) {
      i = trivia(i); if (i >= n) break;
      if (text[i] === '"') { i = quoted(i, '"', '"').next; continue; }
      if (text[i] === '[') {
        var bare = quoted(i, ']', ']'); i = bare.next;
        if (bare.closed) refs.push({ table: null, name: bare.value });
        continue;
      }
      var table = null;
      if (text[i] === "'") {
        var q = quoted(i, "'", "'"); i = q.next;
        if (q.closed) table = q.value;
      } else if (/[A-Za-z_\u0080-\uffff]/.test(text[i])) {
        var start = i++;
        while (i < n && /[A-Za-z0-9_.\u0080-\uffff]/.test(text[i])) i++;
        table = text.slice(start, i);
      } else { i++; continue; }
      var next = trivia(i);
      if (table !== null && text[next] === '[') {
        var qualified = quoted(next, ']', ']'); i = qualified.next;
        if (qualified.closed) refs.push({ table: table, name: qualified.value });
      }
    }
    return refs;
  }

  /* Two looks for the same model. `vivid` is the original one hue per domain with solid filled
     fact headers; `muted` keeps the same hue families desaturated, with a dark fact header
     faintly tinted by the hue, plus a solid stripe, badge and outline carrying the colour. */
  var PALETTES = {
    muted: {
      domain: {
        'Finance / Supply': '#4f8ff7', 'Commercial': '#18b9a6', 'Vena': '#9b7bf0',
        'Profit & Loss': '#e8a33d', 'Core Dims': '#6f7f96', 'Scenario / Helper': '#ee5f80',
        'Calc Groups': '#27b5da', 'Field Params': '#42c274', 'Measures': '#d363e3', 'Other': '#8896aa'
      },
      schema: { finance: '#4f8ff7', commercial: '#18b9a6', supply: '#f27f45', whitespaces: '#9b7bf0', dimensions: '#6f7f96' },
      source: {
        databricks: '#4f8ff7', vertica: '#3b9de0', db: '#4a7ae0', oracle: '#e0605c', postgres: '#3f8fc4',
        mysql: '#2fa3b8', snowflake: '#27b5da', synapse: '#7479e0', lakehouse: '#22b88f', ssas: '#7d82e8',
        sap: '#4468b8', odbc: '#6f7f96', dataflow: '#9b7bf0', sharepoint: '#1fa89a', blob: '#18b9a6',
        salesforce: '#38b2ee', folder: '#c9a042', excel: '#42c274', csv: '#38b060', web: '#e8764a',
        odata: '#d99a3e', parameter: '#908a84', manual: '#e8a33d', calculated: '#d363e3', other: '#8896aa'
      },
      list: ['#4f8ff7', '#18b9a6', '#9b7bf0', '#e8a33d', '#ee5f80', '#27b5da', '#42c274', '#d363e3', '#f27f45', '#6f7f96', '#8a6fe0', '#22b88f', '#e0605c', '#8896aa'],
      edge: { out: '#4f8ff7', 'in': '#18b9a6', hop: '#f27f45', pin: '#9b7bf0' },
      fallback: '#8896aa'
    },
    vivid: {
      domain: {
        'Finance / Supply': '#2563eb', 'Commercial': '#0d9488', 'Vena': '#7c3aed',
        'Profit & Loss': '#d97706', 'Core Dims': '#475569', 'Scenario / Helper': '#e11d48',
        'Calc Groups': '#0891b2', 'Field Params': '#16a34a', 'Measures': '#c026d3', 'Other': '#64748b'
      },
      schema: { finance: '#2563eb', commercial: '#0d9488', supply: '#ea580c', whitespaces: '#7c3aed', dimensions: '#475569' },
      source: {
        databricks: '#2563eb', vertica: '#0284c7', db: '#1d4ed8', oracle: '#b91c1c', postgres: '#0369a1',
        mysql: '#0e7490', snowflake: '#0891b2', synapse: '#4338ca', lakehouse: '#059669', ssas: '#4f46e5',
        sap: '#1e3a8a', odbc: '#475569', dataflow: '#7c3aed', sharepoint: '#0f766e', blob: '#0d9488',
        salesforce: '#0ea5e9', folder: '#a16207', excel: '#16a34a', csv: '#15803d', web: '#c2410c',
        odata: '#b45309', parameter: '#78716c', manual: '#d97706', calculated: '#c026d3', other: '#64748b'
      },
      list: ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#16a34a', '#c026d3', '#ea580c', '#475569', '#9333ea', '#059669', '#b91c1c', '#64748b'],
      edge: { out: '#2563eb', 'in': '#0d9488', hop: '#f97316', pin: '#7c3aed' },
      fallback: '#64748b'
    }
  };
  g.PALETTES = PALETTES;

  function App() {
    var self = this;
    this.state = {
      loaded: false,
      modelName: 'Contoso Retail',
      search: '', colorBy: 'domain', showStandalone: false, allExpanded: false,
      legendOpen: true, hintDismissed: false,
      selected: null, zoomPct: '100%', activeFilter: null,
      isolate: false, focusDepth: 1, viewMode: 'graph',
      showModelMenu: false, showPresets: false, presetName: '',
      showImport: false, importError: '', importReady: false, importName: '', importSummary: '',
      msrQuery: '', expandedMeasure: null, pngLabel: 'PNG',
      selMeasure: null, mvQuery: '', mvOpen: {}, gExtra: {}, gHover: null, gPin: null,
      mvW: Math.max(230, Math.min(600, parseInt(store.get('smv-mvw'), 10) || 296)),
      repoScanning: false, repoError: '', showRules: false,
      snapshotSaving: false, snapshotMessage: '', snapshotError: ''
    };
    this.host = g.SMVHost && g.SMVHost.kind === 'vscode' ? g.SMVHost : null;
    if (this.host) this.state.modelName = 'Choose a model';
    this.snapshotMode = !!(g.Snapshots && (g.Snapshots.embedded || g.Snapshots.error));
    this.snapshotInfo = g.Snapshots && g.Snapshots.embedded || null;
    this.modelKey = 'builtin';
    this.colorBy = 'domain';
    this.model = null;
    this._usage = null; this._usageMeta = null; this._usageStatus = null; this._usageCols = null;
    this._importModel = null;
    this.repoHandle = null; this.repoModels = null; this._repoLive = false;
    this._cbs = [];

    /* One row per connector the parser can spot — label and glyph; the legend colour comes from
       the active palette. Kinds the parser does not know still land on 'other'. */
    this.SOURCE_KINDS = {
      databricks: { label: 'Databricks', icon: '⛃' },
      vertica: { label: 'Vertica', icon: '⛁' },
      db: { label: 'SQL Server', icon: '⛁' },
      oracle: { label: 'Oracle', icon: '⛁' },
      postgres: { label: 'PostgreSQL', icon: '⛁' },
      mysql: { label: 'MySQL', icon: '⛁' },
      snowflake: { label: 'Snowflake', icon: '❄' },
      synapse: { label: 'Synapse', icon: '⛃' },
      lakehouse: { label: 'Fabric', icon: '⛃' },
      ssas: { label: 'Analysis Services', icon: '⛃' },
      sap: { label: 'SAP', icon: '⛃' },
      odbc: { label: 'ODBC', icon: '⛁' },
      dataflow: { label: 'Dataflow', icon: '⇄' },
      sharepoint: { label: 'SharePoint', icon: '☁' },
      blob: { label: 'Azure Storage', icon: '☁' },
      salesforce: { label: 'Salesforce', icon: '☁' },
      folder: { label: 'Folder', icon: '▤' },
      excel: { label: 'Excel', icon: '▦' },
      csv: { label: 'CSV / text', icon: '▤' },
      web: { label: 'Web', icon: '⊕' },
      odata: { label: 'OData', icon: '⊕' },
      parameter: { label: 'Parameter', icon: '⚙' },
      manual: { label: 'Manual entry', icon: '✎' },
      calculated: { label: 'DAX calculated', icon: 'ƒ' },
      other: { label: 'Other', icon: '◇' }
    };
    this.paletteName = PALETTES[store.get('smv-palette')] ? store.get('smv-palette') : 'muted';
    this.applyPalette(this.paletteName);
    this._domMap = {}; this._srcMap = {};

    this.canvas = new g.GraphCanvas(this, document.getElementById('canvas'));
    this.topbar = new g.TopBar(this, document.getElementById('topbar'));
    this.legend = new g.Legend(this, document.getElementById('legend'));
    this.hint = new g.Hint(this, document.getElementById('hint'));
    this.matrix = new g.MatrixView(this, document.getElementById('matrix'));
    this.measures = new g.MeasuresView(this, document.getElementById('measures'));
    this.sidebar = new g.Sidebar(this, document.getElementById('drawer'));
    if (g.TableExplorer) this.explorer = new g.TableExplorer(this);
    this.importModal = new g.ImportModal(this, document.getElementById('modal'));
    this.rulesModal = new g.RulesModal(this, document.getElementById('rolesetup'));

    document.getElementById('root').addEventListener('dragover', function (e) { e.preventDefault(); });
    document.getElementById('root').addEventListener('drop', function (e) {
      var dt = e.dataTransfer, types = Array.from((dt && dt.types) || []);
      if (types.indexOf('application/x-smv-table') >= 0) return;
      if (self.snapshotMode || self.host) { e.preventDefault(); return; }
      if (types.indexOf('Files') < 0 && !(dt && dt.files && dt.files.length)) return;
      e.preventDefault();
      if (!self.state.showImport) self.setState({ showImport: true, importError: '', importReady: false });
      self.onDrop(e);
    });
    window.addEventListener('resize', function () { self.canvas.renderLines(); });
  }

  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvent = e;
    if (window.app) window.app.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null;
    if (window.app) window.app.setState({ canInstall: false });
  });

  App.prototype = {
    canInstall: function () { return !!installEvent; },
    installApp: function () {
      var e = installEvent; if (!e) return;
      installEvent = null; this.setState({ canInstall: false });
      e.prompt();
    },
    /* ---------- state ---------- */
    setState: function (patch, cb) {
      var self = this;
      if (patch.viewMode && patch.viewMode !== this.state.viewMode && this.model) {
        if (this.state.viewMode === 'graph') { this._tableWorkspace = this.captureTableView(); this._tableViewport = Object.assign({}, this.canvas.view); }
        if (this.state.viewMode === 'matrix') this._matrixWorkspace = this.captureMatrix();
      }
      Object.assign(this.state, patch);
      if (cb) this._cbs.push(cb);
      if (this._pending) return;
      this._pending = true;
      Promise.resolve().then(function () {
        self._pending = false;
        self.render();
        var cbs = self._cbs; self._cbs = [];
        cbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
      });
    },
    render: function (force) {
      if (force) { this.topbar._key = null; if (this.explorer) this.explorer._key = null; }
      this.topbar.update();
      this.legend.update();
      this.hint.update();
      this.matrix.update();
      this.measures.update();
      if (this.explorer) this.explorer.update();
      this.sidebar.update();
      this.importModal.update();
      this.rulesModal.update();
    },

    /* ---------- color / source helpers ---------- */
    applyPalette: function (name) {
      var self = this, P = PALETTES[name] || PALETTES.muted;
      this.paletteName = PALETTES[name] ? name : 'muted';
      this.DOMAIN_COLORS = P.domain; this.SCHEMA_COLORS = P.schema; this.PALETTE = P.list;
      this.FALLBACK_COLOR = P.fallback;
      this.SOURCE_COLORS = {};
      Object.keys(this.SOURCE_KINDS).forEach(function (k) {
        var c = P.source[k] || P.source.other;
        self.SOURCE_KINDS[k].color = c; self.SOURCE_COLORS[k] = c;
      });
      if (g.GraphCanvas && g.GraphCanvas.EDGE) Object.assign(g.GraphCanvas.EDGE, P.edge);
    },
    /* Switch look without touching the model, selection or layout. */
    setPalette: function (name) {
      if (!PALETTES[name] || name === this.paletteName) return;
      store.set('smv-palette', name);
      this.applyPalette(name);
      this.rebuildColorMaps();
      var cv = this.canvas;
      if (cv && this.model) {
        cv.recolor(); cv.renderLines(); cv.applyHighlight();
        if (cv.clusterOn) cv.buildClusters();
      }
      this.sidebar._key = null;
      this.render(true);
    },
    rebuildColorMaps: function () {
      var self = this, domCounts = this._domCounts || {}, srcCounts = this._srcCounts || {};
      this._domMap = {}; var pi = 0;
      Object.keys(domCounts).sort(function (a, b) { return domCounts[b] - domCounts[a]; })
        .forEach(function (d) { self._domMap[d] = self.DOMAIN_COLORS[d] || self.PALETTE[pi++ % self.PALETTE.length]; });
      this._srcMap = {}; pi = 0;
      Object.keys(srcCounts).sort(function (a, b) { return srcCounts[b] - srcCounts[a]; })
        .forEach(function (k) { self._srcMap[k] = self.SCHEMA_COLORS[k] || self.SOURCE_COLORS[k] || self.PALETTE[pi++ % self.PALETTE.length]; });
    },
    srcKeyOf: function (t) { var k = t.source.kind; if (k === 'databricks' || k === 'db') return t.source.schema || k; return k; },
    tableColor: function (t) {
      if (this.colorBy === 'source') return this._srcMap[this.srcKeyOf(t)] || this.FALLBACK_COLOR;
      return this._domMap[t.domain] || this.FALLBACK_COLOR;
    },
    isFact: function (t) { return t.role === 'fact'; },
    /* ---------- fact/dim role setup ---------- */
    roleRepo: function () {
      var key = this.modelKey;
      return this._repoLive && (this.repoModels || []).find(function (r) { return r.handle && 'repo:' + r.path === key; });
    },
    assignRole: async function (name, role) {
      var t = this.model.byName[name]; if (!t) return;
      if (this._roleSaving) return;
      var rm = this.roleRepo(), key = this.modelKey;
      if (rm) {
        this._roleSaving = true;
        this.setState({ roleSave: {name:name, text:'Saving to repo…'} });
        try {
          // Request access during the button gesture, before reading any files.
          if (await rm.handle.requestPermission({mode:'readwrite'}) !== 'granted') throw new Error('Write access was not granted.');
          var files = await this.readModelDir(rm.handle), candidates = [];
          files.forEach(function (f) {
            if (!/\.tmdl$/i.test(f.path)) return;
            var next = g.Roles.patchTMDL(f.text, name, role);
            if (next !== null) candidates.push({file:f, text:next});
          });
          if (candidates.length !== 1) throw new Error('Could not identify one table TMDL file.');
          var change = candidates[0], file = change.file;
          if (key !== this.modelKey) throw new Error('Model changed before saving. Try again.');
          var writer = await file.handle.createWritable();
          try {
            if (await (await file.handle.getFile()).text() !== file.text) throw new Error('The file changed externally. Try again.');
            await writer.write(change.text);
            await writer.close();
          } catch (error) { await writer.abort().catch(function () {}); throw error; }
          if (key === this.modelKey) {
            t.ann = role === 'auto' ? '' : role;
            this.applyRoles(this.model, key);
            var cached = this.getStore();
            cached.forEach(function (m) { if (m.id === key) { var table = m.model.tables.find(function (v) { return v.name === name; }); if (table) table.ann = t.ann; } });
            this.setStore(cached);
            this.canvas.build();
            this.setState({roleSave:{name:name, text:'Saved to ' + rm.path + '/' + file.path}});
          }
        } catch (error) {
          if (key === this.modelKey) this.setState({roleSave:{name:name, text:'Not saved: ' + (error.message || error)}});
        } finally { this._roleSaving = false; }
        return;
      }
      if ((key || '').indexOf('repo:') === 0) {
        this.setState({roleSave:{name:name, text:'Not saved. Connect or reconnect this repo folder to edit its TMDL files.'}});
        return;
      }
      var all = store.getJSON('smv_role_overrides_v1', {});
      all[this.modelKey] = all[this.modelKey] || {};
      if (role === 'auto') { t.role = t.autoRole || t.role; delete all[this.modelKey][name]; }
      else { t.role = role; all[this.modelKey][name] = role; }
      store.setJSON('smv_role_overrides_v1', all);
      this.canvas.build();
      this.setState({roleSave:{name:name, text:'Saved in this browser only. Connect the repo folder to save TMDL.'}});
    },
    /* ---------- role rules (see js/roles.js) ---------- */
    getRules: function () {
      var saved = store.getJSON('smv_role_rules_v1', null);
      return Array.isArray(saved) && saved.length ? g.Roles.clean(saved) : g.Roles.defaults();
    },
    rulesAreDefault: function () { return JSON.stringify(this.getRules()) === JSON.stringify(g.Roles.defaults()); },
    setRules: function (rules) {
      rules = g.Roles.clean(rules);
      if (JSON.stringify(rules) === JSON.stringify(g.Roles.defaults())) store.del('smv_role_rules_v1');
      else store.setJSON('smv_role_rules_v1', rules);
      if (this.model) { this.applyRoles(this.model, this.modelKey); this.canvas.build(); }
      this.sidebar._key = null;
      this.setState({});
    },
    resetRules: function () { this.setRules(g.Roles.defaults()); },
    /* (re)compute every table's role: structural roles are fixed, the SMV_Role annotation wins,
       then the active rule set, then the user's per-table pick on top */
    applyRoles: function (model, key) {
      var R = g.Roles, rules = this.getRules(), sides = R.sidesOf(model.relationships);
      var overrides = store.getJSON('smv_role_overrides_v1', {})[key] || {};
      model.tables.forEach(function (t) {
        if (t.baseRole == null) t.baseRole = t.role;
        if (R.STRUCTURAL[t.baseRole]) { t.role = t.autoRole = t.baseRole; t.roleVia = 'structural'; return; }
        var c = R.classify(R.sigOf(t, sides), rules, t.ann);
        t.autoRole = c.role; t.roleVia = c.via;
        t.role = key.indexOf('repo:') === 0 ? c.role : (overrides[t.name] || c.role);
      });
    },
    shortType: function (dt) {
      if (!dt) return '';
      var m = { int64: 'int', decimal: 'dec', double: 'dbl', string: 'str', dateTime: 'date', boolean: 'bool' };
      return m[dt] || dt;
    },
    srcMeta: function (t) {
      var s = t.source || { kind: 'other' };
      var reg = this.SOURCE_KINDS[s.kind] || this.SOURCE_KINDS.other;
      var col = this._srcMap[this.srcKeyOf(t)] || reg.color;
      var detail = s.detail;
      if (!detail) {
        /* models parsed before connector detection only carry schema + table */
        if (s.schema || s.table) detail = (s.schema ? s.schema + '.' : '') + (s.table || '?');
        else if (s.kind === 'manual') detail = 'Hand-maintained table';
        else if (s.kind === 'calculated') detail = 'Calculated in model';
        else detail = '—';
      }
      return { icon: reg.icon, kind: s.label || reg.label, detail: detail, color: col, via: s.via || '', server: s.server || '' };
    },

    /* ---------- model store ---------- */
    getStore: function () { return store.getJSON('smv_models_v1', []); },
    setStore: function (a) {
      var saved = true;
      store.setJSON('smv_models_v1', a, function () { saved = false; });
      return saved;
    },

    prepareModel: function (model) {
      var self = this;
      model.byName = {};
      model.tables.forEach(function (t) {
        model.byName[t.name] = t;
        t.columns = t.columns || []; t.measures = t.measures || [];
        if (t.colCount == null) t.colCount = t.columns.length;
        if (t.measureCount == null) t.measureCount = t.measures.length;
      });
      model.relationships = (model.relationships || []).filter(function (r) { return model.byName[r.from] && model.byName[r.to]; });
      var rc = {};
      model.relationships.forEach(function (r) {
        rc[r.from] = (rc[r.from] || 0) + 1; rc[r.to] = (rc[r.to] || 0) + 1;
        var fc = model.byName[r.from].columns.find(function (c) { return c.name === r.fromCol; }); if (fc) fc.rel = true;
        var tc = model.byName[r.to].columns.find(function (c) { return c.name === r.toCol; }); if (tc) tc.rel = true;
      });
      model.tables.forEach(function (t) { t.relCount = rc[t.name] || 0; });
      // DAX identifiers are case-insensitive; resolve qualified measures before columns.
      var msrHome = {}, measureNames = new Map(), tableNames = new Map(), tableMeasures = new Map();
      model.tables.forEach(function (t) {
        tableNames.set(t.name.toLowerCase(), t.name);
        var names = new Map(); tableMeasures.set(t.name, names);
        t.measures.forEach(function (m) {
          names.set(m.name.toLowerCase(), m.name);
          if (!measureNames.has(m.name.toLowerCase())) {
            measureNames.set(m.name.toLowerCase(), m.name); msrHome[m.name] = t.name;
          }
        });
      });
      var usedBy = {};
      model.tables.forEach(function (t) {
        t.measures.forEach(function (m) {
          var cols = {}, deps = new Set();
          daxReferences(m.dax).forEach(function (ref) {
            var nm;
            if (ref.table === null) nm = measureNames.get(ref.name.toLowerCase());
            else {
              var tn = tableNames.get(ref.table.toLowerCase());
              if (!tn) return;
              nm = tableMeasures.get(tn).get(ref.name.toLowerCase());
              if (!nm) {
                var column = model.byName[tn].columns.find(function (c) { return c.name.toLowerCase() === ref.name.toLowerCase(); });
                (cols[tn] = cols[tn] || new Set()).add(column ? column.name : ref.name);
              }
            }
            if (nm && nm !== m.name) deps.add(nm);
          });
          m._deps = Array.from(deps);
          m._cols = Object.keys(cols).map(function (tn) { return { t: tn, cs: Array.from(cols[tn]).sort() }; });
          deps.forEach(function (d) { (usedBy[d] = usedBy[d] || []).push(m.name); });
        });
      });
      model.msrHome = msrHome; model.msrUsedBy = usedBy;
      // dynamic color maps (curated colors first, palette for the rest)
      var domCounts = {}, srcCounts = {};
      model.tables.forEach(function (t) {
        domCounts[t.domain] = (domCounts[t.domain] || 0) + 1;
        var k = self.srcKeyOf(t); srcCounts[k] = (srcCounts[k] || 0) + 1;
      });
      this._domCounts = domCounts; this._srcCounts = srcCounts;
      this.rebuildColorMaps();
    },

    /* Everything it takes to make the app reflect `model` as the current one -
       shared by a real loadModel() and by the "nothing chosen yet" boot state
       in init(), so the empty placeholder gets the exact same wiring (explorer,
       canvas, measures/matrix/sidebar reset, build+fit) as any real model
       instead of a hand-picked subset that quietly leaves half the UI unbuilt. */
    _applyModel: function (model, name, key, opts) {
      opts = opts || {};
      var self = this;
      this.modelKey = key;
      this.canvas.setLayoutKey(key === 'builtin' ? 'lsa_model_layout_v1' : 'smv_layout_' + (key || 'none'));
      this._usage = null; this._usageMeta = null; this._usageStatus = null; this._usageCols = null;
      if (opts.persist !== false) store.set('smv_current_v1', key);
      this.prepareModel(model);
      this.applyRoles(model, key);
      this.model = model;
      this._tableWorkspace = null; this._tableViewport = null; this._domainWorkspace = null; this._matrixWorkspace = null;
      if (this.explorer) this.explorer.loadModel();
      this.canvas.pos = {}; this.canvas.cpos = {}; this.canvas._preExpandPos = null; this.canvas.pinned = new Set(); this.canvas.locked = null; this.canvas.selRel = null;
      this.canvas._activeSel = null; this.canvas._isoSet = null;
      this.canvas.clusterOn = false; this.canvas.groups = null; this.canvas.expandedGroups = new Set();
      this.canvas.computeLayout();
      this.measures._gC = null; this.measures._railKey = null; this.measures._mainKey = null; this.measures._daxKey = null;
      this.matrix._key = null; this.sidebar._key = null;
      var state = {
        loaded: true, allExpanded: false, modelName: name, selected: null, activeFilter: null, search: '',
        isolate: false, showModelMenu: !!opts.showModelMenu, msrQuery: '', expandedMeasure: null,
        selMeasure: null, mvQuery: '', mvOpen: {}, gExtra: {}, gPin: null, gHover: null, viewMode: 'graph',
        showRules: false
      };
      this.setState(state, function () { self.canvas.build(); self.canvas.fitView(); });
    },

    /* An intentionally empty model for "nothing chosen yet" - same wiring as a
       real load (see _applyModel above), so the picker opens over a properly
       built, if empty, canvas instead of a half-initialized screen. Does not
       touch smv_current_v1: only an actual choice (including the built-in
       sample itself) should make this the remembered default from now on. */
    loadEmptyModel: function () {
      this._applyModel({ name: '', tables: [], relationships: [] }, 'Choose a model', null, { persist: false, showModelMenu: true });
    },

    loadModel: function (key) {
      if (this.snapshotMode) return Promise.resolve();
      if (this.host) return this.hostChooseModel(key);
      var self = this;
      var request = this._modelLoadRequest = (this._modelLoadRequest || 0) + 1;
      var model = null, name = '';
      var finish = function () {
        if (request !== self._modelLoadRequest) return;
        if (key === 'builtin') {
          var loadedName = name;
          fetch('report-usage.json').then(function (r) { return r.json(); }).then(function (j) {
            if (request !== self._modelLoadRequest || self.modelKey !== key || self.model !== model) return;
            /* only attach usage when the loaded model matches usage.model */
            if (j.model && loadedName && j.model !== loadedName) return;
            self._usage = j.measures || {}; self._usageMeta = j;
            self.measures._railKey = null; self.measures._mainKey = null; self.measures._daxKey = null;
            self.sidebar._key = null;
            self.render();
          }).catch(function () { });
        }
        self._applyModel(model, name, key, {});
      };

      if (key !== 'builtin') {
        var rec = this.getStore().find(function (m) { return m.id === key; });
        if (rec) { model = JSON.parse(JSON.stringify(rec.model)); name = rec.name; finish(); return Promise.resolve(); }
      }
      key = 'builtin';
      return fetch('model-data.json').then(function (r) { return r.json(); }).then(function (j) {
        model = j; name = 'Contoso Retail'; finish();
      }).catch(function (e) {
        if (request !== self._modelLoadRequest) return;
        console.error('model load failed', e);
        model = { tables: [], relationships: [] }; name = 'No model loaded'; finish();
      });
    },
    switchModel: function (id) {
      if (id === this.modelKey) { this.setState({ showModelMenu: false }); return; }
      this.loadModel(id);
    },
    deleteModel: function (id) {
      if (!this.setStore(this.getStore().filter(function (m) { return m.id !== id; }))) {
        this.setState({ repoError: 'Could not update browser storage. The model was not removed.' }); return;
      }
      store.del('smv_layout_' + id); store.del('smv_presets_' + id); this._idbDel('src:' + id);
      if (id === this.modelKey) this.loadModel('builtin'); else this.render(true);
    },

    /* The VS Code host supplies files; the core parser, canvas and measures stay shared. */
    hostOpenModel: function (record) {
      if (!record || !record.model || !Array.isArray(record.model.tables)) throw new Error('The selected model could not be read.');
      var self = this, same = this.state.loaded && record.id === this.modelKey;
      var saved = same ? { table: this.captureTableView(), measures: this.measures.captureSnapshot(),
        viewMode: this.state.viewMode, domains: this.captureDomains(), matrix: this.captureMatrix() } : null;
      this._hostRequest = (this._hostRequest || 0) + 1; this._modelLoadRequest = (this._modelLoadRequest || 0) + 1;
      var model = record.model;
      model.tables.forEach(function (table) { table.source = table.source || {kind:'other'}; table.domain = table.domain || 'Other'; });
      this.state.viewMode = 'graph';
      this.modelKey = record.id; this.canvas.setLayoutKey('smv_layout_' + record.id);
      this._usage = null; this._usageMeta = null; this._usageStatus = null; this._usageCols = null;
      this.prepareModel(model); this.applyRoles(model, record.id); this.model = model;
      this._tableWorkspace = null; this._tableViewport = null; this._domainWorkspace = null; this._matrixWorkspace = null;
      if (this.explorer) this.explorer.loadModel();
      var cv = this.canvas;
      cv.pos = {}; cv.cpos = {}; cv._preExpandPos = null; cv.pinned = new Set(); cv.locked = null; cv.selRel = null;
      cv._activeSel = null; cv._isoSet = null; cv.clusterOn = false; cv.groups = null; cv.expandedGroups = new Set();
      cv.computeLayout(); this.measures._gC = null; this.measures._railKey = null; this.measures._mainKey = null; this.measures._daxKey = null;
      this.matrix._key = null; this.sidebar._key = null;
      this.setState({ loaded: true, modelName: record.name || model.name || 'Semantic model', viewMode: 'graph',
        allExpanded: false, selected: null, activeFilter: null, search: '', isolate: false, showModelMenu: false,
        selMeasure: null, mvQuery: '', mvOpen: {}, gExtra: {}, gPin: null, gHover: null, showRules: false, repoError: '' }, function () {
        cv.build(); cv.fitView();
        if (saved) {
          cv.applyPreset(saved.table); self._tableWorkspace = self.captureTableView(); self._tableViewport = Object.assign({}, cv.view);
          self.measures.restoreSnapshot(saved.measures); self._domainWorkspace = saved.domains; self._matrixWorkspace = saved.matrix;
          self.setViewMode(saved.viewMode);
        }
      });
      if (record.usage) this.setUsage(record.usage);
    },
    hostChooseModel: async function (id) {
      var request = this._hostRequest = (this._hostRequest || 0) + 1;
      try {
        var record = await this.host.openModel(id);
        if (record && request === this._hostRequest) this.hostOpenModel(record);
      } catch (error) { if (request === this._hostRequest) this.setState({ repoError: error.message, showModelMenu: true }); }
    },
    hostSelectModel: async function () {
      this.setState({ showModelMenu: true, repoError: '' });
      try { await this.host.listModels(); this.render(true); }
      catch (error) { this.setState({ repoError: error.message }); }
    },
    hostLoadAnalysis: async function () {
      var model = this.model;
      try { var data = await this.host.pickAnalysis(); if (data && this.model === model) this.setUsage(data); }
      catch (error) { this.setState({ repoError: error.message, showModelMenu: true }); }
    },
    hostRefreshModel: async function () {
      try { await this.host.refreshModel(); }
      catch (error) { this.setState({ repoError: error.message, showModelMenu: true }); }
    },
    setUsage: function (data) {
      if (!data) { this._usage = null; this._usageMeta = null; this._usageStatus = null; this._usageCols = null; }
      else {
        var usage = g.UsageAdapter.fromCleaner(data);
        if (usage.models.length && !usage.models.includes(this.state.modelName)) throw new Error('This analysis belongs to a different model.');
        this._usage = usage.measures; this._usageMeta = usage; this._usageStatus = usage.status; this._usageCols = usage.columns;
      }
      this.measures._railKey = null; this.measures._mainKey = null; this.measures._daxKey = null; this.sidebar._key = null;
      this.render(true);
    },

    /* ---------- measure helpers shared by views ---------- */
    msrOf: function (name) {
      var M = this.model, h = M && M.msrHome ? M.msrHome[name] : null;
      return h && M.byName[h] ? M.byName[h].measures.find(function (x) { return x.name === name; }) : null;
    },
    msrUse: function (n) { return (this._usage && this._usage[n]) || null; },
    msrStatus: function (n) { return (this._usageStatus && this._usageStatus[n]) || null; },
    colStatus: function (t, c) { return (this._usageCols && this._usageCols[t + '|' + c]) || null; },
    useTip: function (u) {
      if (!u) return '';
      var rep = (this._usageMeta && this._usageMeta.report) || 'report';
      return 'Used in ' + rep + ':\n' + u.map(function (e) {
        var p = [];
        if (e.v) p.push(e.v + ' visual' + (e.v > 1 ? 's' : ''));
        if (e.f) p.push(e.f + ' filter' + (e.f > 1 ? 's' : ''));
        return '• ' + (e.r ? e.r + ' / ' : '') + e.p + ' — ' + p.join(', ');
      }).join('\n');
    },
    statusPill: function (rec, hasPages, small) {
      if (!rec || (rec.status === 'used' && hasPages)) return null;
      var P = {
        unused: ['unused', '#b91c1c', '#fdecec', '#f6c9c9', 'Semantic Model Cleaner: not used in any scanned report'],
        broken: ['broken', '#92400e', '#fef3c7', '#fcd34d', 'Semantic Model Cleaner: broken reference'],
        indirect: ['indirect', '#5b6472', '#f1f3f6', '#d5dae2', 'Semantic Model Cleaner: used indirectly'],
        used: ['used', '#166534', '#f0f7f1', '#cde5d2', 'Semantic Model Cleaner: used by the model']
      }[rec.status] || null;
      if (!P) return null;
      return {
        text: P[0], title: P[4] + (rec.raw ? '\n' + rec.raw : '') + (rec.risk ? '\nremoval risk: ' + rec.risk : ''),
        style: 'flex:none;font:600 ' + (small ? '8.5px' : '9px') + "/1 'IBM Plex Mono',monospace;color:" + P[1] + ';background:' + P[2] + ';border:1px solid ' + P[3] + ';border-radius:4px;padding:2px ' + (small ? '4px' : '5px') + ';cursor:help;'
      };
    },
    tipFlags: function (n) {
      var m = this.msrOf(n), u = this.msrUse(n), s = '';
      if (m && m.h) s += '\nhidden in model';
      if (u) s += '\nused in ' + ((this._usageMeta && this._usageMeta.report) || 'report') + ' · ' + u.length + ' page' + (u.length > 1 ? 's' : '');
      else if (this._usage) s += '\nno report usage';
      return s;
    },
    mvOpenFor: function (name) {
      var M = this.model, o = Object.assign({}, this.state.mvOpen || {});
      var home = M && M.msrHome ? M.msrHome[name] : null;
      var m = home && M.byName[home] ? M.byName[home].measures.find(function (x) { return x.name === name; }) : null;
      String((m && m.folder) || '').split(';').forEach(function (fp) {
        var p = '';
        fp.split('\\').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s) { p = p ? p + '\\' + s : s; o[p] = true; });
      });
      return o;
    },

    /* ---------- search / focus / views ---------- */
    doSearch: function (q) {
      var self = this;
      q = q.trim().toLowerCase(); if (!q) return [];
      var out = [];
      this.model.tables.forEach(function (t) {
        var score = -1, hitCol = null;
        if (t.name.toLowerCase().includes(q)) score = 0;
        else {
          var sm = self.srcMeta(t);
          if (sm.detail.toLowerCase().includes(q)) score = 1;
          else {
            var col = t.columns.find(function (c) { return c.name.toLowerCase().includes(q); });
            if (col) { score = 2; hitCol = col.name; }
          }
        }
        if (score >= 0) out.push({ t: t, score: score, hitCol: hitCol });
      });
      out.sort(function (a, b) { return a.score - b.score || a.t.name.localeCompare(b.t.name); });
      return out.slice(0, 12);
    },
    focusTable: function (name) {
      var self = this;
      if (this.state.viewMode === 'matrix') this._matrixWorkspace = this.captureMatrix();
      if (this.state.viewMode === 'clusters' && this.canvas.clusterOn) this._domainWorkspace = this.captureDomains();
      if (this.explorer) this.explorer.ensureTable(name);
      if (this.state.viewMode !== 'graph') {
        this.setState({ viewMode: 'graph' }, function () {
          var fromDomains = self.canvas.clusterOn; self.canvas.exitClusters();
          if (fromDomains) self.restoreTableView();
          self.canvas.focusGraph(name);
        });
        return;
      }
      this.canvas.focusGraph(name);
    },
    setViewMode: function (m) {
      var self = this, was = this.state.viewMode;
      if (was === 'graph') { this._tableWorkspace = this.captureTableView(); this._tableViewport = Object.assign({}, this.canvas.view); }
      if (was === 'matrix') this._matrixWorkspace = this.captureMatrix();
      if (was === 'clusters' && this.canvas.clusterOn) this._domainWorkspace = this.captureDomains();
      if (m === was) return;
      this.setState({ viewMode: m }, function () {
        if (self.canvas.clusterOn && m !== 'clusters') { self._domainWorkspace = self.captureDomains(); self.canvas.exitClusters(); self.restoreTableView(); }
        if (m === 'clusters') {
          if (self.snapshotMode && self._domainWorkspace) self.restoreDomains(self._domainWorkspace);
          else self.canvas.enterClusters();
        }
        if (m === 'matrix') self.restoreMatrix(self._matrixWorkspace);
        if (m === 'graph') {
          self.canvas.applyHighlight();
          if (self.snapshotMode && self._tableViewport) { self.canvas.view = Object.assign({}, self._tableViewport); self.canvas.updateTransform(); }
          else self.canvas.fitView();
        }
      });
    },

    /* ---------- PNG export ---------- */
    loadHtmlToImage: function () {
      if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
      if (this._h2iP) return this._h2iP;
      this._h2iP = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
        s.onload = function () { res(window.htmlToImage); };
        s.onerror = function () { rej(new Error('load failed')); };
        document.head.appendChild(s);
      });
      return this._h2iP;
    },
    exportPNG: function () {
      if (this.snapshotMode || this.host) { this.setState({ snapshotError: 'PNG export is unavailable in this offline snapshot. Save a snapshot to keep your changes.' }); return; }
      var self = this;
      if (this._exporting) return;
      this._exporting = true; this.setState({ pngLabel: 'Exporting…' });
      var done = function () { self._exporting = false; self.setState({ pngLabel: 'PNG' }); };
      this.loadHtmlToImage().then(function (h2i) {
        var vm = self.state.viewMode;
        var host = vm === 'matrix' ? (self.matrix.el ? (self.matrix.el.firstElementChild || self.matrix.el) : null)
          : (vm === 'measures' ? document.getElementById('measures') : self.canvas.host);
        return h2i.toPng(host, { pixelRatio: 2, backgroundColor: '#f4f5f7', filter: function (n) { return n !== self.canvas.tip; } });
      }).then(function (url) {
        var a = document.createElement('a');
        a.href = url; a.download = (self.state.modelName || 'model') + ' diagram.png';
        document.body.appendChild(a); a.click(); a.remove();
        done();
      }).catch(function (e) {
        console.error(e);
        alert('The image library failed to load — check your connection and reload.');
        done();
      });
    },

    /* ---------- import ---------- */
    onDrop: function (e) {
      var self = this;
      e.preventDefault();
      e.stopPropagation();
      var items = e.dataTransfer && e.dataTransfer.items;
      if (items && items.length && items[0].webkitGetAsEntry) {
        var entries = Array.from(items).map(function (i) { return i.webkitGetAsEntry(); }).filter(Boolean);
        this.walkEntries(entries).then(function (fs) { self.handleFiles(fs); });
      } else {
        this.handleFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []).map(function (f) { return { f: f, p: f.webkitRelativePath || f.name }; }));
      }
    },
    walkEntries: function (entries) {
      var out = [];
      var walk = function (entry) {
        return new Promise(function (res) {
          if (!entry) return res();
          if (entry.isFile) entry.file(function (f) { out.push({ f: f, p: String(entry.fullPath || f.name).replace(/^\//, '') }); res(); }, function () { res(); });
          else if (entry.isDirectory) {
            var rd = entry.createReader();
            var readAll = function () {
              rd.readEntries(async function (ents) {
                if (!ents.length) return res();
                for (var i = 0; i < ents.length; i++) await walk(ents[i]);
                readAll();
              }, function () { res(); });
            };
            readAll();
          } else res();
        });
      };
      return (async function () { for (var i = 0; i < entries.length; i++) await walk(entries[i]); return out; })();
    },
    handleFiles: async function (list) {
      var self = this;
      var files = [];
      for (var i = 0; i < list.length; i++) {
        var f = list[i].f, p = list[i].p || list[i].f.name;
        if (!/\.(tmdl|bim|json)$/i.test(f.name)) continue;
        try { files.push({ name: f.name, path: p, text: await f.text() }); } catch (e) { }
      }
      if (!files.length) { this.setState({ importError: 'No .tmdl / .bim / .json files found in the selection.', importReady: false }); return; }
      // a repo folder was dropped: group files by *.SemanticModel folder
      var byModel = {};
      files.forEach(function (f) {
        var m = String(f.path || '').match(/(^|.*?\/)([^\/]+)\.SemanticModel(\/|$)/i);
        if (m) { var k = (m[1] || '') + m[2]; (byModel[k] = byModel[k] || []).push(f); }
      });
      var keys = Object.keys(byModel);
      if (keys.length > 1) {
        var st = this.getStore(); var opened = null, ok = 0; var bad = [];
        keys.forEach(function (k) {
          var nm = k.split('/').pop();
          try {
            var mod = window.TMDLParser.parseAny(byModel[k]);
            var id = 'repo:' + k + '.SemanticModel';
            var idx = st.findIndex(function (m) { return m.id === id; }); if (idx >= 0) st.splice(idx, 1);
            st.push({ id: id, name: nm, at: Date.now(), repo: true, model: mod });
            ok++; if (!opened) opened = id;
          } catch (err) { bad.push(nm); }
        });
        if (ok && !this.setStore(st)) {
          this.setState({ importError: 'Could not save the imported models in this browser. Free browser storage and try again. Your current model is unchanged.', importReady: false });
          return;
        }
        if (ok) { this.setState({ showImport: false, importReady: false, importError: '' }); this.loadModel(opened); }
        else this.setState({ importError: 'Found ' + keys.length + ' models but none parsed' + (bad.length ? (' (' + bad.join(', ') + ')') : '') + '.', importReady: false });
        return;
      }
      var use = keys.length === 1 ? byModel[keys[0]] : files;
      try {
        var model = window.TMDLParser.parseAny(use);
        var nm2 = model.name;
        if (!nm2 || /^(model|semantic ?model)$/i.test(nm2)) {
          if (keys.length === 1) nm2 = keys[0].split('/').pop();
          else {
            var parts = String(use[0].path).replace(/^\//, '').split('/');
            nm2 = parts.length > 1 ? parts[0] : (use[0].name.replace(/\.(bim|json|tmdl)$/i, '') || 'Imported model');
          }
        }
        this._importModel = model;
        this.setState({
          importReady: true, importError: '', importName: nm2,
          importSummary: model.tables.length + ' tables · ' + model.relationships.length + ' relationships parsed'
        });
      } catch (err) {
        this.setState({ importError: 'Could not parse: ' + (err.message || err), importReady: false });
      }
    },
    /* The stored import a new import of this name would replace: same name, not a repo model.
       The current model wins among duplicates, otherwise the newest — its id carries the layout. */
    importTarget: function (name) {
      var want = String(name || '').trim().toLowerCase(), cur = this.modelKey;
      var same = this.getStore().filter(function (m) { return String(m.id).indexOf('repo:') !== 0 && String(m.name).trim().toLowerCase() === want; });
      return same.find(function (m) { return m.id === cur; }) || same[same.length - 1] || null;
    },
    confirmImport: function () {
      if (!this._importModel) return;
      var name = (this.state.importName || 'Imported model').trim() || 'Imported model';
      var target = this.importTarget(name);
      var id = target ? target.id : 'm' + Date.now().toString(36);
      var st = this.getStore().filter(function (m) { return m.id !== id; });
      st.push({ id: id, name: name, at: Date.now(), model: this._importModel });
      if (!this.setStore(st)) {
        this.setState({ importError: 'Could not save this model in the browser. Free browser storage and try again. Your imported model is still ready to add.', importReady: true });
        return;
      }
      this._importModel = null;
      this.setState({ showImport: false, importReady: false });
      this.loadModel(id);
    },

    /* ---------- repo connection (File System Access API) ---------- */
    _idb: function () {
      return new Promise(function (res, rej) {
        var r = indexedDB.open('smv_fs', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    },
    _idbSet: async function (k, v) { var db = await this._idb(); return new Promise(function (res, rej) { var tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(v, k); tx.oncomplete = res; tx.onerror = function () { rej(tx.error); }; }); },
    _idbGet: async function (k) { var db = await this._idb(); return new Promise(function (res, rej) { var q = db.transaction('handles', 'readonly').objectStore('handles').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); },
    _idbDel: async function (k) { var db = await this._idb(); return new Promise(function (res) { var tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').delete(k); tx.oncomplete = res; tx.onerror = res; }); },
    canFS: function () { return typeof window.showDirectoryPicker === 'function'; },
    connectRepo: async function () {
      if (!this.canFS()) { this.setState({ repoError: 'This browser cannot open folders directly — use Chrome or Edge, or drag the repo folder onto the window.' }); return; }
      var handle = null;
      try { handle = await window.showDirectoryPicker({ mode: 'read' }); } catch (e) { return; }
      this.repoHandle = handle; this._repoLive = true;
      this._idbSet('repo', handle).catch(function () { });
      store.set('smv_repo_name', handle.name);
      await this.scanRepo();
      if (this.repoModels && this.repoModels.length === 1) this.openRepoModel(this.repoModels[0]);
    },
    reconnectRepo: async function () {
      var handle = this.repoHandle || await this._idbGet('repo').catch(function () { return null; });
      if (!handle) { this.connectRepo(); return; }
      try {
        var p = await handle.queryPermission({ mode: 'read' });
        if (p !== 'granted') p = await handle.requestPermission({ mode: 'read' });
        if (p !== 'granted') { this.setState({ repoError: 'Folder access was not granted.' }); return; }
      } catch (e) { this.connectRepo(); return; }
      this.repoHandle = handle; this._repoLive = true;
      await this.scanRepo();
      this.refreshCurrentRepoModel();
    },
    autoReconnect: async function () {
      try {
        var p = await this.repoHandle.queryPermission({ mode: 'read' });
        if (p === 'granted') { this._repoLive = true; await this.scanRepo(); this.refreshCurrentRepoModel(); }
        else this.render(true);
      } catch (e) { this.render(true); }
    },
    forgetRepo: function () {
      this.repoHandle = null; this.repoModels = null; this._repoLive = false;
      this._idbDel('repo');
      store.del('smv_repo_name'); store.del('smv_repo_cache');
      this.render(true);
    },
    /* Every *.SemanticModel folder under a picked folder (or the folder itself). */
    _findModelDirs: async function (handle) {
      var found = [];
      var walk = async function (dir, path, depth) {
        if (depth > 6) return;
        for await (var ent of dir.entries()) {
          var nm = ent[0], h = ent[1];
          if (h.kind !== 'directory') continue;
          if (/\.SemanticModel$/i.test(nm)) found.push({ name: nm.replace(/\.SemanticModel$/i, ''), path: path + nm, handle: h });
          else if (!/^(\.|node_modules$|\$)/.test(nm)) await walk(h, path + nm + '/', depth + 1);
        }
      };
      if (/\.SemanticModel$/i.test(handle.name)) found.push({ name: handle.name.replace(/\.SemanticModel$/i, ''), path: handle.name, handle: handle });
      else await walk(handle, '', 0);
      return found;
    },
    scanRepo: async function () {
      var handle = this.repoHandle; if (!handle) return;
      this.setState({ repoScanning: true, repoError: '' });
      var found;
      try { found = await this._findModelDirs(handle); }
      catch (e) { this.setState({ repoScanning: false, repoError: 'Scan failed: ' + (e.message || e) }); return; }
      found.sort(function (a, b) { return a.name.localeCompare(b.name); });
      this.repoModels = found;
      store.setJSON('smv_repo_cache', found.map(function (f) { return { name: f.name, path: f.path }; }));
      this.setState({ repoScanning: false, repoError: found.length ? '' : ('No *.SemanticModel folders found in “' + handle.name + '”.') });
    },
    readModelDir: async function (h) {
      var files = [];
      var walk = async function (dir, path) {
        for await (var ent of dir.entries()) {
          var nm = ent[0], e = ent[1];
          if (e.kind === 'file') {
            if (/\.(tmdl|bim|json)$/i.test(nm)) { var f = await e.getFile(); files.push({ name: nm, path: path + nm, text: await f.text(), handle: e }); }
          } else if (!/^\./.test(nm)) await walk(e, path + nm + '/');
        }
      };
      await walk(h, '');
      return files;
    },
    /* ---------- refresh the open model from its source folder ---------- */
    canRefreshSource: function () {
      return !this.host && !this.snapshotMode && !!this.state.loaded && !!this.modelKey && this.modelKey !== 'builtin' && this.canFS();
    },
    /* An imported model has no live link to disk, so the first refresh asks for its folder
       once; the handle is remembered (IndexedDB) and later refreshes only re-confirm access. */
    _sourceHandle: async function (key) {
      var h = await this._idbGet('src:' + key).catch(function () { return null; });
      if (h) {
        try {
          var p = await h.queryPermission({ mode: 'read' });
          if (p !== 'granted') p = await h.requestPermission({ mode: 'read' });
          if (p === 'granted') return h;
        } catch (e) { }
      }
      try { h = await window.showDirectoryPicker({ mode: 'read' }); } catch (e) { return null; }
      this._idbSet('src:' + key, h).catch(function () { });
      return h;
    },
    _findModelDir: async function (handle, name) {
      var found = await this._findModelDirs(handle);
      if (!found.length) return handle;
      var exact = found.filter(function (f) { return f.name.toLowerCase() === String(name).toLowerCase(); });
      if (exact.length === 1) return exact[0].handle;
      if (found.length === 1) return found[0].handle;
      throw new Error('Several *.SemanticModel folders found in “' + handle.name + '”. Choose the single folder for this model.');
    },
    refreshSource: async function () {
      var self = this, key = this.modelKey;
      if (!this.canRefreshSource() || this.state.refreshing) return;
      var isRepo = key.indexOf('repo:') === 0;
      var rm = isRepo && (this.repoModels || []).find(function (r) { return r.handle && 'repo:' + r.path === key; });
      if (isRepo && !rm) { this.reconnectRepo(); return; }
      var rec = this.getStore().find(function (m) { return m.id === key; });
      var name = rec ? rec.name : this.state.modelName;
      this.setState({ refreshing: true, repoError: '', snapshotMessage: '', snapshotError: '' });
      var done = function (patch) { self.setState(Object.assign({ refreshing: false }, patch)); };
      try {
        var handle = rm ? rm.handle : await this._sourceHandle(key);
        if (!handle) { done({}); return; }
        var files;
        try { files = await this.readModelDir(rm ? handle : await this._findModelDir(handle, name)); }
        catch (e) { if (!rm) this._idbDel('src:' + key); throw e; }
        if (key !== this.modelKey) { done({}); return; }
        var model = window.TMDLParser.parseAny(files);
        var st = this.getStore(), i = st.findIndex(function (m) { return m.id === key; });
        var old = i >= 0 ? st[i].model : null;
        if (old && JSON.stringify(old) === JSON.stringify(model)) { done({ snapshotMessage: 'Already up to date with the source folder.' }); return; }
        var record = { id: key, name: name, at: Date.now(), model: model };
        if (isRepo) record.repo = true;
        if (i >= 0) st[i] = record; else st.push(record);
        if (!this.setStore(st)) { done({ snapshotError: 'Could not save the refreshed model in this browser. Free browser storage and try again.' }); return; }
        var had = {}; ((old && old.tables) || []).forEach(function (t) { had[t.name] = 1; });
        var has = {}; model.tables.forEach(function (t) { has[t.name] = 1; });
        var added = model.tables.filter(function (t) { return !had[t.name]; }).map(function (t) { return t.name; });
        var removed = Object.keys(had).filter(function (n) { return !has[n]; });
        var view = this.state.viewMode;
        await this.loadModel(key);
        if (view && view !== 'graph') this.setViewMode(view);
        var list = function (a) { return a.slice(0, 3).join(', ') + (a.length > 3 ? ' +' + (a.length - 3) + ' more' : ''); };
        done({ snapshotMessage: 'Refreshed from source · ' + model.tables.length + ' tables' +
          (added.length ? ' · ' + added.length + ' new (' + list(added) + ') — add from the Tables library' : '') +
          (removed.length ? ' · ' + removed.length + ' removed (' + list(removed) + ')' : '') });
      } catch (e) { done({ snapshotError: 'Refresh failed: ' + (e.message || e) }); }
    },
    /* fresh parse on every open; the parse is cached so the model still opens offline */
    openRepoModel: async function (rm) {
      var id = 'repo:' + rm.path;
      var request = this._modelLoadRequest = (this._modelLoadRequest || 0) + 1;
      this.setState({ showModelMenu: false, repoError: '' });
      if (rm.handle) {
        try {
          var files = await this.readModelDir(rm.handle);
          if (request !== this._modelLoadRequest) return;
          var model = window.TMDLParser.parseAny(files);
          var st = this.getStore().filter(function (m) { return m.id !== id; });
          st.push({ id: id, name: rm.name, at: Date.now(), repo: true, model: model });
          if (!this.setStore(st)) {
            this.setState({ repoError: 'Could not save the refreshed model in this browser. Free browser storage and try again. Your current model is unchanged.' });
            return;
          }
          this.loadModel(id);
          return;
        } catch (e) {
          if (request !== this._modelLoadRequest) return;
          this.setState({ repoError: 'Could not parse ' + rm.name + ': ' + (e.message || e) });
        }
      }
      if (this.getStore().find(function (m) { return m.id === id; })) this.loadModel(id);
      else this.setState({ repoError: '“' + rm.name + '” is not cached yet — reconnect the repo folder to load it.' });
    },
    refreshCurrentRepoModel: async function () {
      var key = this.modelKey || '';
      var request = this._modelLoadRequest;
      if (key.indexOf('repo:') !== 0 || !this.repoModels) return;
      var rm = this.repoModels.find(function (r) { return r.handle && 'repo:' + r.path === key; });
      if (!rm) return;
      try {
        var files = await this.readModelDir(rm.handle);
        if (key !== this.modelKey || request !== this._modelLoadRequest) return;
        var model = window.TMDLParser.parseAny(files);
        var st = this.getStore();
        var old = st.find(function (m) { return m.id === key; });
        if (old && JSON.stringify(old.model) === JSON.stringify(model)) return;
        var rest = st.filter(function (m) { return m.id !== key; });
        rest.push({ id: key, name: rm.name, at: Date.now(), repo: true, model: model });
        if (!this.setStore(rest)) {
          this.setState({ repoError: 'Could not save the refreshed model in this browser. Your cached model is unchanged.' });
          return;
        }
        this.loadModel(key);
      } catch (e) { }
    },
    repoRows: function () {
      var self = this;
      var rows = {};
      (this.repoModels || []).forEach(function (rm) { rows['repo:' + rm.path] = { id: 'repo:' + rm.path, name: rm.name, live: !!rm.handle, rm: rm }; });
      this.getStore().forEach(function (m) {
        if (String(m.id).indexOf('repo:') !== 0) return;
        var r = rows[m.id]; if (r) r.cached = true; else rows[m.id] = { id: m.id, name: m.name, cached: true };
      });
      return Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (r) {
        return {
          id: r.id, name: r.name,
          meta: [r.live ? 'in repo' : null, r.cached ? 'cached' : null].filter(Boolean).join(' · ') || 'found',
          canDelete: !!r.cached,
          pick: function () { if (r.rm && r.rm.handle) self.openRepoModel(r.rm); else self.switchModel(r.id); },
          del: function () { self.deleteModel(r.id); }
        };
      });
    },

    /* ---------- portable offline snapshot ---------- */
    saveSnapshot: async function () {
      if (this.state.snapshotSaving || !this.state.loaded) return null;
      this.setState({ snapshotSaving: true, snapshotMessage: '', snapshotError: '' });
      try {
        if (!g.Snapshots || typeof g.Snapshots.exportHTML !== 'function') throw new Error('Snapshot export is unavailable. Reload the app and try again.');
        var filename = await g.Snapshots.exportHTML(this);
        this.setState({ snapshotSaving: false, snapshotMessage: filename ? 'Saved ' + filename : '', snapshotError: '' });
        return filename;
      } catch (error) {
        this.setState({ snapshotSaving: false, snapshotError: error && error.message || 'Could not save the snapshot. Please try again.' });
        return null;
      }
    },
    captureTableView: function () {
      var cv = this.canvas;
      var view = this.state.viewMode !== 'graph' && this._tableWorkspace
        ? JSON.parse(JSON.stringify(this._tableWorkspace))
        : { version: 2, name: 'Snapshot starting view', pos: JSON.parse(JSON.stringify(cv.pos)),
          view: Object.assign({}, cv.view), focus: cv.captureFocus(), display: cv.captureDisplay() };
      // Membership can grow through a table link in another mode.
      view.tables = cv.workspaceNames ? Array.from(cv.workspaceNames) : this.model.tables.map(function (table) { return table.name; });
      return view;
    },
    restoreTableView: function () {
      var view = this._tableWorkspace, cv = this.canvas;
      if (!view) return;
      cv.pos = JSON.parse(JSON.stringify(view.pos)); cv.persist();
      cv.restoreFocus(view.focus); cv.restoreDisplay(view.display);
      Object.keys(cv.cards).forEach(function (name) { cv.layoutCard(name); });
      cv.view = Object.assign({}, view.view); this._tableViewport = Object.assign({}, view.view);
      this.render(true); cv.applyHighlight(); cv.updateTransform(); cv.renderLines();
    },
    captureMatrix: function () {
      var pane = this.matrix && this.matrix.el;
      if (this.state.viewMode !== 'matrix' || !pane) return this._matrixWorkspace || { scrollLeft: 0, scrollTop: 0 };
      return { scrollLeft: Math.max(0, Number(pane.scrollLeft) || 0), scrollTop: Math.max(0, Number(pane.scrollTop) || 0) };
    },
    restoreMatrix: function (data) {
      var d = data || {};
      this._matrixWorkspace = { scrollLeft: Number.isFinite(d.scrollLeft) ? Math.max(0, d.scrollLeft) : 0,
        scrollTop: Number.isFinite(d.scrollTop) ? Math.max(0, d.scrollTop) : 0 };
      var pane = this.matrix && this.matrix.el;
      if (this.state.viewMode === 'matrix' && pane) {
        pane.scrollLeft = this._matrixWorkspace.scrollLeft; pane.scrollTop = this._matrixWorkspace.scrollTop;
      }
    },
    captureDomains: function () {
      var cv = this.canvas;
      if (!cv.clusterOn || !cv.groups) return this._domainWorkspace || null;
      return { expandedGroups: Array.from(cv.expandedGroups),
        positions: Object.keys(cv.groups).map(function (key) { var group = cv.groups[key]; return { key: key, x: group.x, y: group.y }; }),
        tablePositions: JSON.parse(JSON.stringify(cv.cpos)), view: Object.assign({}, cv.view) };
    },
    restoreDomains: function (data) {
      var cv = this.canvas, d = data || {};
      cv.clusterOn = true; cv.buildClusters();
      cv.expandedGroups = new Set((Array.isArray(d.expandedGroups) ? d.expandedGroups : []).filter(function (key) { return !!cv.groups[key]; }));
      cv.reflowClusters();
      (Array.isArray(d.positions) ? d.positions : []).forEach(function (point) {
        var group = cv.groups[point.key];
        if (!group || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        var dx = point.x - group.x, dy = point.y - group.y;
        group.tables.forEach(function (table) { if (cv.cpos[table.name]) { cv.cpos[table.name].x += dx; cv.cpos[table.name].y += dy; } });
        group.x = point.x; group.y = point.y;
        group.el.style.left = group.pill.style.left = point.x + 'px';
        group.el.style.top = group.pill.style.top = point.y + 'px';
      });
      Object.keys(d.tablePositions || {}).forEach(function (name) {
        var point = d.tablePositions[name];
        if (cv.cards[name] && point && Number.isFinite(point.x) && Number.isFinite(point.y)) cv.cpos[name] = { x: point.x, y: point.y };
      });
      Object.keys(cv.cards).forEach(function (name) { cv.layoutCard(name); });
      cv.refreshVisibility();
      var view = d.view;
      if (view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.k) && view.k > 0) cv.view = { x: view.x, y: view.y, k: Math.max(.16, Math.min(2.2, view.k)) };
      cv.updateTransform(); cv.renderLines();
    },
    loadSnapshot: function (payload) {
      this.snapshotMode = true; this.snapshotInfo = payload;
      this.modelKey = 'snapshot'; this.canvas.setLayoutKey('smv_layout_snapshot');
      var model = JSON.parse(JSON.stringify(payload.model)), workspace = payload.workspace || {}, cv = this.canvas, ex = this.explorer;
      model.tables.forEach(function (table) { table.source = table.source || { kind: 'other' }; table.domain = table.domain || 'Other'; });
      // Exported role decisions are part of the snapshot. Do not apply recipient rules.
      this.prepareModel(model); this.model = model;
      this._usage = payload.usage && payload.usage.measures || null;
      this._usageMeta = payload.usage && payload.usage.meta || null;
      this._usageStatus = payload.usage && payload.usage.status || null; this._usageCols = payload.usage && payload.usage.columns || null;
      this.repoHandle = null; this.repoModels = null; this._repoLive = false;
      Object.assign(this.state, { loaded: true, modelName: payload.name || model.name || 'Semantic model snapshot',
        viewMode: 'graph', selected: null, isolate: false, allExpanded: false, showImport: false, showModelMenu: false,
        showPresets: false, showRules: false, search: '', activeFilter: null, snapshotError: '', snapshotMessage: '' });
      if (ex) ex.loadModel();
      cv.pos = {}; cv.cpos = {}; cv.pinned = new Set(); cv.locked = null; cv.selRel = null;
      cv._activeSel = null; cv._isoSet = null; cv._preExpandPos = null;
      cv.clusterOn = false; cv.groups = null; cv.expandedGroups = new Set();
      cv.computeLayout(); this.render(true); cv.build();
      var tableView = workspace.tableView || { name: 'Snapshot', tables: model.tables.map(function (table) { return table.name; }), pos: {} };
      cv.applyPreset(tableView);
      this._tableViewport = Object.assign({}, cv.view);
      this._tableWorkspace = this.captureTableView();
      cv.setPresets(Array.isArray(workspace.presets) ? workspace.presets : []);
      if (ex) {
        var library = workspace.explorer || {};
        ex.query = typeof library.query === 'string' ? library.query : '';
        ex.filter = ['all', 'canvas', 'available'].includes(library.filter) ? library.filter : 'all';
        ex.direction = ['incoming', 'outgoing', 'connected'].includes(library.direction) ? library.direction : 'incoming';
        ex.depth = library.depth === 'direct' ? 'direct' : 'all';
        ex.includeInactive = !!library.includeInactive; ex.mapHidden = !!library.mapHidden;
        ex.history = []; ex.message = 'Offline snapshot. Changes stay in this tab; save a snapshot to keep them.'; ex._key = null;
      }
      if (this.measures.restoreSnapshot) this.measures.restoreSnapshot(payload.measures);
      this._domainWorkspace = workspace.domains || null;
      this._matrixWorkspace = workspace.matrix || null;
      this.state.viewMode = ['graph', 'measures', 'clusters', 'matrix'].includes(workspace.viewMode) ? workspace.viewMode : 'graph';
      this.matrix._key = null; this.sidebar._key = null;
      this.render(true);
      if (this.state.viewMode === 'clusters') this.restoreDomains(this._domainWorkspace);
      else { cv.updateTransform(); cv.renderLines(); }
      if (this.state.viewMode === 'matrix') this.restoreMatrix(this._matrixWorkspace);
    },
    failSnapshot: function (error) {
      this.snapshotMode = true;
      var message = error && error.message || String(error || 'The embedded snapshot is invalid.');
      Object.assign(this.state, { loaded: false, modelName: 'Snapshot unavailable', snapshotError: message });
      this.render(true);
      var host = document.getElementById('main');
      if (host) host.appendChild(U.el('section', { cls: 'ex-snapshot-failure', role: 'alert' }, [
        U.el('h1', { text: 'This snapshot could not be opened.' }), U.el('p', { text: message }),
        U.el('p', { text: 'Ask the sender to create a new snapshot.' })
      ]));
    },

    /* ---------- boot ---------- */
    init: async function () {
      if (g.Snapshots && (g.Snapshots.embedded || g.Snapshots.error)) {
        if (g.Snapshots.error) this.failSnapshot(g.Snapshots.error);
        else { try { this.loadSnapshot(g.Snapshots.embedded); } catch (error) { this.failSnapshot(error); } }
        return;
      }
      if (this.host) {
        this.host.attach(this);
        var initial = await this.host.loadDefault();
        if (initial) this.hostOpenModel(initial);
        else {
          this.model = {name:'',tables:[],relationships:[]}; this.prepareModel(this.model);
          this.setState({modelName:'Choose a model',showModelMenu:true});
        }
        return;
      }
      var self = this;
      /* No stored choice yet (a genuinely first-ever open, or a fresh browser
         profile) -> don't silently load the bundled sample. Same idea as the
         VS Code host's own "nothing open yet" state above (an empty model,
         picker already open), via loadEmptyModel() so the canvas/explorer get
         the same full initialization a real model load gets - not a smaller,
         easy-to-drift-from copy of it. Once the user picks anything -
         including the bundled sample itself - `smv_current_v1` is set and
         every later open goes straight back to that choice, same as before. */
      var cur = store.get('smv_current_v1', null);
      if (cur) {
        await this.loadModel(cur);
        if (!this.model.tables.length) this.setState({ showModelMenu: true });
      } else {
        this.loadEmptyModel();
      }
      var cached = store.getJSON('smv_repo_cache', null);
      if (cached && cached.length) this.repoModels = cached;
      this._idbGet('repo').then(function (h) { if (h) { self.repoHandle = h; self.autoReconnect(); } }).catch(function () { });
    }
  };

  window.addEventListener('DOMContentLoaded', function () {
    function start() { var app = new App(); window.app = app; app.render(); return app.init(); }
    if (g.SMVHost && g.SMVHost.kind === 'vscode') {
      g.SMVHost.boot().then(function () { U.store.useAdapter(g.SMVHost.storage); return start(); }).catch(function (error) {
        var root = document.getElementById('root'); U.clear(root);
        root.appendChild(U.el('p', {role:'alert',text:'The model viewer could not start: ' + error.message}));
      });
    } else {
      start();
      var embedded = g.Snapshots && g.Snapshots.embedded;
      if (!embedded && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      }
    }
  });
})(window);
