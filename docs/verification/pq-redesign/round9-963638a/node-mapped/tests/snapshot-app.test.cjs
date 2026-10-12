/* Snapshot boot must use the embedded model without network or recipient repositories. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
const jsDir = path.join(__dirname, '../Models/tools/viewer/js');
function node(tag = 'div') {
  return { tag, style: {}, children: [], attrs: {}, listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child, before) { const index = this.children.indexOf(before); this.children.splice(index < 0 ? 0 : index, 0, child); },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
    get firstChild() { return this.children[0]; },
    addEventListener(type, action) { this.listeners[type] = action; },
    setAttribute(key, value) { this.attrs[key] = value; },
  };
}
function payload(mode = 'graph', tables = ['A', 'B']) {
  return {
    format: 'semantic-model-viewer', version: 1, name: 'Shared model', createdAt: '2026-09-08T11:00:00.000Z',
    model: { tables: [
      { name: 'A', columns: [{ name: 'Key' }], measures: [{ name: 'Base', dax: '1' }], domain: 'Finance', source: { kind: 'other' }, role: 'fact', autoRole: 'dim', ann: 'fact', roleVia: 'annotation' },
      { name: 'B', columns: [{ name: 'Key' }], measures: [{ name: 'Derived', dax: '[Base] + 1' }], domain: 'Finance', source: { kind: 'other' }, role: 'dim' }
    ], relationships: [{ from: 'B', fromCol: 'Key', to: 'A', toCol: 'Key' }] },
    usage: { measures: { Derived: [{ p: 'Overview' }] }, meta: { model: 'Shared model', reports: 1 } },
    workspace: { viewMode: mode,
      tableView: { version: 2, name: 'Snapshot', tables, pos: { A: { x: -30, y: 70 }, B: { x: 470, y: 120 } },
        view: { x: -210, y: 450, k: 0.16 }, focus: { selected: 'A', pinned: [], locked: null, isolate: true, depth: 1 },
        display: { detail: 'cards', lines: 'curve', color: 'domain', expanded: ['A'] } },
      presets: [{ name: 'Review', tables: ['A'], pos: {} }],
      explorer: { query: 'Key', filter: 'canvas', direction: 'outgoing', depth: 'direct', includeInactive: true, mapHidden: true },
      domains: { expandedGroups: ['Finance'], positions: [{ key: 'Finance', x: 800, y: -300 }],
        tablePositions: { A: { x: 830, y: -245 }, B: { x: 1200, y: -240 } }, view: { x: 450, y: -135, k: 0.75 } }
      , matrix: { scrollLeft: 170, scrollTop: 425 }
    },
    measures: { version: 1, selectedMeasure: 'Derived', preferences: { mode: 'split', orientation: 'horizontal' } }
  };
}
function harness(embedded) {
  const storage = new Map(), elements = new Map(), calls = { fetch: 0, idb: 0, applyRoles: 0, renders: 0 };
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    createElement: tag => node(tag), createTextNode: text => ({ textContent: String(text) })
  };
  const context = { console, document, Set, Map, Promise, Date, JSON, addEventListener() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch() { calls.fetch++; return Promise.reject(new Error('Unexpected network request')); },
    Snapshots: { embedded, error: null }
  };
  context.window = context; vm.createContext(context);
  for (const file of ['util.js', 'canvas.js', 'topbar.js']) vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), context);
  const source = fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8');
  vm.runInContext(source.replace("  window.addEventListener('DOMContentLoaded'", "  g.TestApp = App;\n  window.addEventListener('DOMContentLoaded'"), context);
  const app = Object.create(context.TestApp.prototype);
  Object.assign(app, { state: { loaded: false, snapshotSaving: false }, modelKey: 'builtin',
    DOMAIN_COLORS: {}, SCHEMA_COLORS: {}, SOURCE_COLORS: {}, PALETTE: ['#123456'], colorBy: 'domain',
    measures: { restoreSnapshot(data) { calls.measures = plain(data); app.state.selMeasure = data?.selectedMeasure || null; return true; } },
    matrix: {}, sidebar: {},
    render() { calls.renders++; if (this.state.viewMode === 'matrix') { this.matrix.el ||= { scrollLeft: 0, scrollTop: 0 }; } else this.matrix.el = null; },
    setState(patch, cb) { Object.assign(this.state, patch); this.render(); if (cb) cb(); },
    applyRoles() { calls.applyRoles++; },
    _idbGet() { calls.idb++; return Promise.resolve(null); }
  });
  const cv = app.canvas = Object.create(context.GraphCanvas.prototype);
  Object.assign(cv, { app, pos: {}, view: { x: 0, y: 0, k: 1 }, pinned: new Set(), cpos: {}, cards: {}, detailMode: 'auto', lineStyle: 'ortho',
    computeLayout() { app.model.tables.forEach(t => { this.pos[t.name] = { x: 0, y: 0 }; }); },
    build() { app.model.tables.forEach(t => { this.cards[t.name] = { table: t, el: node(), body: node(), caret: node(), w: 252, h: 100, expanded: false }; }); },
    recolor() {}, layoutCard() {}, updateTransform() {}, renderLines() {},
    applyHighlight() { this._activeSel = app.state.selected; this.refreshVisibility(); },
    hideRelPopover() {}, groupKeyOf(table) { return table.domain; },
    buildClusters() { this.groups = {}; this.cpos = {}; this.expandedGroups = new Set(); app.model.tables.forEach(t => { const group = this.groups[t.domain] ||= { tables: [], x: 0, y: 0, el: node(), pill: node() }; group.tables.push(t); }); },
    reflowClusters() { Object.values(this.groups).forEach(group => { group.tables.forEach((t, i) => { this.cpos[t.name] = { x: i * 300, y: 50 }; }); }); },
    enterClusters() { this.clusterOn = true; this.pinned.clear(); app.state.isolate = false; app.state.allExpanded = false; for (const card of Object.values(this.cards)) card.expanded = false; if (this._preExpandPos) this.pos = plain(this._preExpandPos); this._preExpandPos = null; this.buildClusters(); this.reflowClusters(); this.view = { x: 123, y: 456, k: 0.5 }; },
    exitClusters() { this.clusterOn = false; this.groups = null; this.cpos = {}; this.refreshVisibility(); },
    fitView() { throw new Error('Snapshot restoration must not fit over the saved viewport'); }
  });
  app.explorer = {
    names: new Set(), history: [],
    loadModel() { this.names = new Set(); cv.workspaceNames = this.names; cv.showSA = true; },
    snapshot() { this.history.push({}); },
    commit(message) { this.message = message; cv.workspaceNames = this.names; cv.applyHighlight(); },
  };
  return { app, context, cv, calls, storage, document };
}

for (const mode of ['graph', 'measures', 'clusters', 'matrix']) {
  test('offline startup restores ' + mode + ' without normal model, usage, repo or IDB access', async () => {
    const data = payload(mode), { app, cv, calls } = harness(data);
    await app.init();
    assert.equal(app.snapshotMode, true);
    assert.equal(app.modelKey, 'snapshot');
    assert.equal(app.state.loaded, true);
    assert.equal(app.state.viewMode, mode);
    assert.equal(calls.fetch, 0); assert.equal(calls.idb, 0); assert.equal(calls.applyRoles, 0);
    assert.equal(app.model.byName.A.role, 'fact'); assert.equal(app.model.byName.A.autoRole, 'dim'); assert.equal(app.model.byName.A.ann, 'fact');
    assert.deepEqual(plain(app.model.byName.B.measures[0]._deps), ['Base']);
    assert.deepEqual(plain(app._usage), data.usage.measures);
    assert.deepEqual(plain(calls.measures), data.measures);
    assert.deepEqual([...app.explorer.names], ['A', 'B']);
    assert.equal(app.explorer.query, 'Key'); assert.equal(app.explorer.mapHidden, true);
    assert.equal(app.explorer.history.length, 0);
    assert.deepEqual(plain(cv.pos), data.workspace.tableView.pos);
    assert.deepEqual(plain(cv.getPresets()), data.workspace.presets);
    assert.deepEqual(plain(cv.view), mode === 'clusters' ? data.workspace.domains.view : data.workspace.tableView.view);
    if (mode === 'clusters') {
      assert.deepEqual([...cv.expandedGroups], ['Finance']);
      assert.deepEqual(plain(cv.cpos), data.workspace.domains.tablePositions);
      assert.equal(cv.groups.Finance.x, 800); assert.equal(cv.groups.Finance.y, -300);
    }
  });
}

test('offline startup preserves intentionally empty canvas membership and discards invalid focus', async () => {
  const { app, cv } = harness(payload('graph', []));
  await app.init();
  assert.equal(app.explorer.names.size, 0);
  assert.equal(app.state.selected, null); assert.equal(app.state.isolate, false);
  for (const card of Object.values(cv.cards)) assert.equal(card.el.style.display, 'none');
});

test('switching snapshot Domains and Tables retains each viewport and domain expansion positions', async () => {
  const data = payload('clusters'), { app, cv } = harness(data);
  await app.init();
  app.setViewMode('graph');
  assert.deepEqual(plain(cv.view), data.workspace.tableView.view);
  assert.deepEqual(plain(cv.pos), data.workspace.tableView.pos);
  app.setViewMode('clusters');
  assert.deepEqual(plain(cv.view), data.workspace.domains.view);
  assert.deepEqual([...cv.expandedGroups], ['Finance']);
  assert.deepEqual(plain(cv.cpos), data.workspace.domains.tablePositions);
});

test('an invalid embedded snapshot reports failure instead of falling back to fetch or repositories', async () => {
  const { app, context, calls, document } = harness(null);
  context.Snapshots.error = new Error('Unsupported snapshot version');
  await app.init();
  assert.equal(app.snapshotMode, true); assert.equal(app.state.loaded, false);
  assert.match(app.state.snapshotError, /Unsupported snapshot/);
  assert.equal(calls.fetch, 0); assert.equal(calls.idb, 0);
  assert.equal(document.getElementById('main').children.length, 1);
});

test('snapshot export reports progress, prevents duplicate saves and permits retry after failure', async () => {
  const { app, context } = harness(payload()); app.state.loaded = true;
  let complete, exports = 0;
  context.Snapshots.exportHTML = () => { exports++; return new Promise(resolve => { complete = resolve; }); };
  const first = app.saveSnapshot();
  assert.equal(app.state.snapshotSaving, true);
  assert.equal(await app.saveSnapshot(), null); assert.equal(exports, 1);
  complete('shared-model.html');
  assert.equal(await first, 'shared-model.html'); assert.equal(app.state.snapshotSaving, false);
  assert.match(app.state.snapshotMessage, /shared-model\.html/);
  context.Snapshots.exportHTML = async () => { throw new Error('Export failed'); };
  assert.equal(await app.saveSnapshot(), null); assert.equal(app.state.snapshotSaving, false);
  assert.equal(app.state.snapshotError, 'Export failed');
  context.Snapshots.exportHTML = async () => 'retry.html';
  assert.equal(await app.saveSnapshot(), 'retry.html'); assert.equal(app.state.snapshotError, '');
});

test('recipient UI keeps four analysis modes and Save snapshot but has no model switcher, import or PNG', async () => {
  const { app, cv, context } = harness(payload()); await app.init();
  const host = node(); new context.TopBar(app, host).update();
  const flatten = n => [n, ...(n.children || []).flatMap(flatten)];
  const all = flatten(host), buttons = all.filter(n => n.tag === 'button').map(n => n.textContent);
  for (const label of ['Tables', 'Measures', 'Domains', 'Matrix', 'Save snapshot']) assert.ok(buttons.includes(label), label);
  for (const label of ['Open model', 'PNG']) assert.equal(buttons.includes(label), false);
  assert.ok(all.some(n => n.textContent === 'Offline snapshot'));
  assert.equal(all.some(n => n.attrs?.title === 'Switch or import a model'), false);
  await app.loadModel('builtin'); assert.equal(app.modelKey, 'snapshot');
  app.exportPNG(); assert.match(app.state.snapshotError, /unavailable/);
});


test('Domains then Measures preserves table focus, expanded display, positions and camera for export', async () => {
  const data = payload(), { app, cv } = harness(data);
  await app.init(); app.snapshotMode = false;
  cv.pinned.add('B'); cv.locked = 'A';
  cv._preExpandPos = { A: { x: -999, y: -999 }, B: { x: -888, y: -888 } };
  const table = plain(app.captureTableView());
  app.setViewMode('clusters');
  assert.equal(app.state.isolate, false);
  assert.equal(cv.cards.A.expanded, false);
  assert.deepEqual(plain(app.captureTableView()), table);
  app.setViewMode('measures');
  assert.deepEqual(plain(app.captureTableView()), table);
  assert.deepEqual(plain(cv.pos), table.pos);
  assert.deepEqual(plain(cv.captureFocus()), table.focus);
  assert.deepEqual(plain(cv.captureDisplay()), table.display);
  assert.ok(app.captureDomains());
});

test('new table changes after returning from Domains replace the previously cached table view', async () => {
  const { app, cv } = harness(payload()); await app.init();
  app.setViewMode('clusters'); app.setViewMode('graph');
  cv.pos.A = { x: 890, y: -480 }; cv.view = { x: 333, y: -222, k: 1.4 };
  app.state.selected = 'B'; app.state.isolate = false; cv._activeSel = 'B';
  cv.detailMode = 'names';
  const latest = plain(app.captureTableView());
  app.setViewMode('measures');
  assert.deepEqual(plain(app.captureTableView()), latest);
});

test('Matrix snapshot restores both scroll axes and caches them before leaving the view', async () => {
  const { app } = harness(payload('matrix')); await app.init();
  assert.deepEqual(plain(app.captureMatrix()), { scrollLeft: 170, scrollTop: 425 });
  assert.equal(app.matrix.el.scrollLeft, 170); assert.equal(app.matrix.el.scrollTop, 425);
  app.matrix.el.scrollLeft = 310; app.matrix.el.scrollTop = 920;
  app.setViewMode('measures');
  app.render();
  assert.equal(app.matrix.el, null);
  assert.deepEqual(plain(app.captureMatrix()), { scrollLeft: 310, scrollTop: 920 });
  app.setViewMode('matrix');
  assert.equal(app.matrix.el.scrollLeft, 310); assert.equal(app.matrix.el.scrollTop, 920);
});

test('malformed Matrix scroll values are sanitized without affecting table state', async () => {
  const { app, cv } = harness(payload('matrix')); await app.init();
  const table = plain(app.captureTableView());
  app.restoreMatrix({ scrollLeft: Infinity, scrollTop: -30 });
  assert.equal(app.matrix.el.scrollLeft, 0); assert.equal(app.matrix.el.scrollTop, 0);
  assert.deepEqual(plain(app.captureTableView()), table);
});


test('direct measure navigation captures the latest table changes before changing modes', async () => {
  const { app, cv, context } = harness(payload()); await app.init();
  cv.pos.A = { x: 730, y: 410 }; cv.view = { x: -10, y: 95, k: 1.1 };
  const latest = plain(app.captureTableView());
  app._cbs = []; app.setState = context.TestApp.prototype.setState;
  app.setState({ viewMode: 'measures', selected: null });
  await Promise.resolve();
  assert.deepEqual(plain(app.captureTableView()), latest);
});
