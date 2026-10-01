/* Shared viewer regression tests against the actual VS Code message adapter.
   DOM painting is stubbed; model, workspace, graph, storage, and snapshot logic is real. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const viewerDir = path.join(__dirname, '../Models/tools/viewer');
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function node(tag = 'div') {
  const n = { tag, style: { setProperty(key, value) { this[key] = value; } }, children: [], attrs: {}, dataset: {}, listeners: {}, scrollLeft: 0, scrollTop: 0,
    clientWidth: 1200, clientHeight: 800, classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    insertBefore(child, before) { const i = this.children.indexOf(before); this.children.splice(i < 0 ? 0 : i, 0, child); },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
    get firstChild() { return this.children[0]; },
    get lastElementChild() { return this.children[this.children.length - 1]; },
    remove() { this.parentNode?.removeChild(this); },
    addEventListener(type, action) { this.listeners[type] = action; }, removeEventListener() {},
    setAttribute(key, value) { this.attrs[key] = String(value); }, getAttribute(key) { return this.attrs[key]; },
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; },
    focus() {}, querySelectorAll() { return []; }, querySelector() { return null; }
  };
  return n;
}
function model(name = 'First model') {
  return { name, tables: [
    { name: 'Sales', domain: 'Finance', columns: [{ name: 'Amount', dataType: 'decimal' }, { name: 'Date', dataType: 'dateTime' }], measures: [
      { name: 'Base', dax: 'SUM(Sales[Amount])', folder: 'Revenue' }, { name: 'Derived', dax: '[Base] + 1', folder: 'Revenue' }
    ], source: { kind: 'db' } },
    { name: 'Calendar', domain: 'Core', columns: [{ name: 'Date', dataType: 'dateTime' }], measures: [], source: { kind: 'db' } }
  ], relationships: [{ from: 'Sales', fromCol: 'Date', to: 'Calendar', toCol: 'Date', fromCard: 'many', toCard: 'one' }] };
}
function record(id = 'workspace:first', name = 'First model', usage) {
  return { modelId: id, name, path: '/workspace/' + name + '.SemanticModel',
    files: [{ name: 'model.json', text: JSON.stringify(model(name)) }], usage };
}
function analysis(name = 'First model') {
  return { summary: { models: [name], reports: ['Overview'], not_used: 1 }, items: [
    { type: 'Measure', sourceKind: 'model', name: 'Base', table: 'Sales', status: 'USED', usages: [{ report: 'Overview', page: 'Sales', context: 'Visual' }] },
    { type: 'Measure', sourceKind: 'model', name: 'Derived', table: 'Sales', status: 'NOT USED', usages: [] },
    { type: 'Column', name: 'Amount', table: 'Sales', status: 'INDIRECT', usages: [] }
  ] };
}
function assets() {
  const template = fs.readFileSync(path.join(viewerDir, 'index.html'), 'utf8'), sources = {};
  for (const match of template.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) sources[match[1]] = fs.readFileSync(path.join(viewerDir, match[1]), 'utf8');
  return { template, sources };
}
function harness() {
  const elements = new Map(), events = {}, posted = [], errors = [];
  const calls = { fetch: 0, storage: 0, idb: 0, blob: 0, acquire: 0 };
  const document = { activeElement: null, body: node('body'),
    getElementById(id) { if (id.startsWith('smv-snapshot-')) return null; if (!elements.has(id)) elements.set(id, node()); return elements.get(id); },
    createElement: node, createElementNS: (_, tag) => node(tag), createDocumentFragment: () => node('fragment'),
    createTextNode: text => ({ textContent: String(text) }), querySelectorAll() { return []; }
  };
  const context = { document, Set, Map, Promise, Date, JSON, URL,
    getComputedStyle() { return { paddingTop: '0', paddingBottom: '0', paddingLeft: '0', paddingRight: '0' }; },
    console: { log() {}, warn() {}, error(error) { errors.push(error); } },
    addEventListener(type, fn) { (events[type] ||= []).push(fn); }, removeEventListener() {},
    setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0).unref(); }, cancelAnimationFrame: clearTimeout,
    localStorage: Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(key => [key, () => { calls.storage++; throw new Error('Native localStorage forbidden'); }])),
    indexedDB: { open() { calls.idb++; throw new Error('IndexedDB forbidden'); } },
    fetch() { calls.fetch++; return Promise.reject(new Error('Unexpected fetch')); },
    Blob: function () { calls.blob++; throw new Error('Browser download forbidden'); },
    acquireVsCodeApi() { calls.acquire++; return { postMessage(message) { posted.push(plain(message)); } }; }
  };
  context.window = context; vm.createContext(context);
  const load = file => vm.runInContext(fs.readFileSync(path.join(viewerDir, 'js', file), 'utf8'), context, { filename: file });
  for (const file of ['util.js', 'snapshot.js', 'roles.js', 'usage-adapter.js', 'tmdl-parser.js', 'canvas.js', 'layouts.js', 'matrix.js', 'measures.js', 'sidebar.js', 'topbar.js', 'rules.js', 'relationships.js', 'explorer.js', 'host-vscode.js']) load(file);
  const sidebarUpdate = context.Sidebar.prototype.update;
  for (const name of ['Legend', 'Hint', 'MatrixView', 'MeasuresView', 'Sidebar', 'ImportModal', 'RulesModal', 'TableExplorer']) context[name].prototype.update = function () {};
  const cv = context.GraphCanvas.prototype;
  for (const name of ['renderLines', 'recolor', 'layoutCard', 'updateTransform', 'hideRelPopover']) cv[name] = function () {};
  cv.build = function () { this.cards = {}; this.app.model.tables.forEach(t => { this.cards[t.name] = { table: t, el: node(), body: node(), caret: node(), w: 252, h: 100, expanded: false }; }); };
  cv.fitView = function () { this.view = { x: 0, y: 0, k: 1 }; };
  cv.applyHighlight = function () { this._activeSel = this.app.state.selected; this.refreshVisibility(); };
  load('app.js');
  const receive = message => { for (const fn of events.message || []) fn({ data: message }); };
  const respond = (request, data) => receive({ id: request.id, ...data });
  const next = type => { const found = posted.find(message => message.type === type && !message._handled); assert.ok(found, 'Expected host request ' + type); found._handled = true; return found; };
  async function boot(init = {}) {
    for (const fn of events.DOMContentLoaded) fn();
    assert.equal(context.app, undefined, 'Constructing before init would read unseeded storage');
    assert.equal(next('ready').type, 'ready');
    receive({ type: 'init', storage: {}, models: [], ...init }); await flush();
    assert.deepEqual(errors.map(String), []); assert.ok(context.app, 'Host boot should construct shared App');
    return context.app;
  }
  function isolated() { assert.deepEqual(calls, { fetch: 0, storage: 0, idb: 0, blob: 0, acquire: 1 }); assert.deepEqual(errors.map(String), []); }
  return { context, document, events, posted, errors, calls, boot, receive, respond, next, isolated, sidebarUpdate };
}
const flatten = n => [n, ...(n.children || []).flatMap(flatten)];
const texts = n => flatten(n).map(x => x.textContent).filter(Boolean);

test('VS Code boot seeds shared preferences before constructing and has an actionable empty model picker', async () => {
  const h = harness(), app = await h.boot({ storage: { 'smv-mvw': '410', 'smv-detail': 'cards' } });
  assert.equal(app.state.mvW, 410); assert.equal(app.canvas.detailMode, 'cards');
  assert.equal(app.state.loaded, false); assert.equal(app.model.tables.length, 0);
  const labels = texts(h.document.getElementById('topbar'));
  assert.ok(labels.includes('Choose model')); assert.ok(labels.includes('Workspace models'));
  assert.ok(labels.includes('Refresh model list')); assert.equal(labels.includes('Contoso Retail'), false);
  assert.equal(labels.includes('PNG'), false); assert.equal(labels.includes('Open model'), false);
  app.host.storage.set('new-key', 'value'); app.host.storage.del('new-key');
  assert.equal(h.next('storage').value, 'value'); assert.equal(h.next('storage').value, null); h.isolated();
});

test('host default model retains the shared parser, dependency graph, table canvas and all four views', async () => {
  const h = harness(), app = await h.boot({ open: record(undefined, undefined, analysis()) });
  assert.equal(app.state.loaded, true); assert.equal(app.modelKey, 'workspace:first');
  assert.deepEqual(plain(app.msrOf('Derived')._deps), ['Base']); assert.equal(app.model.byName.Sales.role, 'fact');
  const graph = app.measures.gLayout('Derived', {}, 500);
  assert.ok(graph.names.includes('Base')); assert.ok(graph.names.includes('Derived'));
  app.explorer.add(['Sales'], { x: 45, y: 70 }); await flush();
  assert.deepEqual([...app.explorer.names], ['Sales']); assert.deepEqual(plain(app.canvas.pos.Sales), { x: 45, y: 70 });
  assert.equal(app.msrUse('Base')[0].p, 'Sales');
  for (const label of ['Tables', 'Measures', 'Domains', 'Matrix', 'Save snapshot', 'Choose model']) assert.ok(texts(h.document.getElementById('topbar')).includes(label), label);
  h.isolated();
});

test('choosing models uses host requests and keeps table membership, coordinates and usage isolated', async () => {
  const h = harness(), app = await h.boot({ open: record(undefined, undefined, analysis()) });
  app.explorer.add(['Sales'], { x: 123, y: 456 }); await flush();
  const choosing = app.hostSelectModel(), list = h.next('listModels');
  h.respond(list, { models: [{ id: 'workspace:second', name: 'Second model', path: '/workspace/second' }] }); await choosing; await flush();
  assert.ok(texts(h.document.getElementById('topbar')).includes('Second model'));
  const loading = app.hostChooseModel('workspace:second'), request = h.next('openModel');
  assert.equal(request.modelId, 'workspace:second'); h.respond(request, record('workspace:second', 'Second model')); await loading; await flush();
  assert.equal(app.modelKey, 'workspace:second'); assert.equal(app._usage, null); assert.equal(app.msrUse('Base'), null);
  assert.deepEqual([...app.explorer.names], []);
  h.receive({ type: 'model', ...record() }); await flush();
  assert.deepEqual([...app.explorer.names], ['Sales']); assert.deepEqual(plain(app.canvas.pos.Sales), { x: 123, y: 456 });
  assert.equal(app.canvas.LSKEY, 'smv_layout_workspace:first'); h.isolated();
});

test('late open and analysis responses cannot replace a more recently selected model', async () => {
  const h = harness(), app = await h.boot({ open: record() });
  const oldOpen = app.hostChooseModel('workspace:old'), openRequest = h.next('openModel');
  h.receive({ type: 'model', ...record('workspace:current', 'Current model') }); await flush();
  h.respond(openRequest, record('workspace:old', 'Old model')); await oldOpen;
  assert.equal(app.modelKey, 'workspace:current');
  const oldAnalysis = app.hostLoadAnalysis(), analysisRequest = h.next('loadAnalysis');
  h.receive({ type: 'model', ...record('workspace:next', 'Next model') }); await flush();
  h.respond(analysisRequest, { data: analysis('Current model') }); await oldAnalysis;
  assert.equal(app.modelKey, 'workspace:next'); assert.equal(app._usage, null);
  h.receive({ type: 'usage', modelId: 'workspace:current', data: analysis('Current model') });
  assert.equal(app._usage, null); h.isolated();
});

test('same-model refresh preserves selected measures and the existing table workspace and viewport', async () => {
  const h = harness(), app = await h.boot({ open: record() });
  app.explorer.add(['Sales'], { x: -75, y: 240 }); await flush();
  app.canvas.view = { x: 90, y: -50, k: .72 };
  app.measures.restoreSnapshot({ version: 1, selectedMeasure: 'Derived', comparisonMeasure: 'Base', preferences: { mode: 'dax', orientation: 'bt', split: 'below' } });
  app.setViewMode('measures'); await flush();
  const before = plain(app.captureTableView());
  h.receive({ type: 'model', ...record() }); await flush();
  assert.deepEqual(h.errors.map(error => error.stack || String(error)), []);
  assert.equal(app.state.viewMode, 'measures'); assert.equal(app.state.selMeasure, 'Derived');
  const measureState = plain(app.measures.captureSnapshot());
  assert.equal(measureState.comparisonMeasure, 'Base'); assert.equal(measureState.preferences.orientation, 'bt'); assert.equal(measureState.preferences.mode, 'dax');
  assert.deepEqual(plain(app.captureTableView()), before); h.isolated();
});

test('host request errors remain actionable and file drops do not enter browser import', async () => {
  const h = harness(), app = await h.boot();
  const loading = app.hostChooseModel('missing'); h.respond(h.next('openModel'), { error: 'Model was removed from the workspace' }); await loading; await flush();
  assert.match(app.state.repoError, /removed/); assert.equal(app.state.showModelMenu, true);
  let prevented = false;
  h.document.getElementById('root').listeners.drop({ preventDefault() { prevented = true; }, dataTransfer: { types: ['Files'], files: [{}] } });
  assert.equal(prevented, true); assert.equal(app.state.showImport, false); h.isolated();
});

test('VS Code snapshot save uses host assets and save bridge, yields ordinary offline HTML, and supports cancellation', async () => {
  const h = harness(), app = await h.boot({ open: record() }), bundle = assets();
  app.explorer.add(['Sales'], { x: 50, y: 70 }); await flush();
  const saving = app.saveSnapshot(); h.respond(h.next('snapshotAssets'), bundle); await flush();
  const save = h.next('saveSnapshot'); assert.match(save.filename, /First model snapshot .*\.html$/);
  assert.match(save.html, /id="smv-snapshot-data"/); assert.match(save.html, /connect-src 'none'/);
  assert.doesNotMatch(save.html, /data-smv-asset="js\/host-vscode\.js"|acquireVsCodeApi|<script[^>]+\bsrc=/);
  const payloadText = save.html.match(/<script[^>]+id="smv-snapshot-data"[^>]*>([\s\S]*?)<\/script>/)[1];
  const payload = JSON.parse(payloadText); assert.equal(payload.model.tables.length, 2); assert.deepEqual(payload.workspace.tableView.tables, ['Sales']);
  assert.deepEqual(payload.workspace.tableView.pos.Sales, { x: 50, y: 70 });
  h.respond(save, { filename: 'saved.html' }); assert.equal(await saving, 'saved.html'); assert.match(app.state.snapshotMessage, /saved.html/);
  const cancelled = app.saveSnapshot(); h.respond(h.next('snapshotAssets'), bundle); await flush();
  h.respond(h.next('saveSnapshot'), { cancelled: true }); assert.equal(await cancelled, null); assert.equal(app.state.snapshotSaving, false);
  assert.equal(app.state.snapshotMessage, ''); h.isolated();
});


test('optional Cleaner status pills render in library, selected measure, comparison DAX and table columns', async () => {
  const h = harness(), app = await h.boot({ open: record(undefined, undefined, analysis()) });
  app.state.mvQuery = 'Derived'; app.state.selMeasure = 'Derived';
  const measure = app.measures;
  measure.totalEl = node(); measure.qInput = node(); measure.tableSelect = node(); measure.filterBtns = {}; measure.rowsEl = node();
  measure.renderRail(); assert.ok(texts(measure.rowsEl).includes('unused'));
  measure.mainEl = node(); measure.buildSelectedMain('Derived', app.msrOf('Derived'));
  assert.ok(texts(measure.mainEl).includes('unused'));
  assert.equal(texts(measure.mainEl).includes('No direct report usage'), false);
  const header = measure.daxHeader(measure.daxCard('Derived'), 'Comparison', '', () => {});
  assert.ok(texts(header).includes('unused'));
  app.state.viewMode = 'graph'; app.state.selected = 'Sales';
  h.sidebarUpdate.call(app.sidebar);
  const labels = texts(app.sidebar.host);
  assert.ok(labels.includes('unused')); assert.ok(labels.includes('indirect')); assert.ok(labels.includes('1 pg'));
  app.setUsage(null); measure.renderRail();
  assert.equal(texts(measure.rowsEl).includes('unused'), false);
  h.sidebarUpdate.call(app.sidebar);
  assert.equal(texts(app.sidebar.host).includes('indirect'), false); h.isolated();
});

test('analysis mismatch is rejected and status maps are cleared when selecting a different model', async () => {
  const h = harness(), app = await h.boot({ open: record(undefined, undefined, analysis()) });
  assert.equal(app.msrStatus('Derived').status, 'unused'); assert.equal(app.colStatus('Sales', 'Amount').status, 'indirect');
  assert.throws(() => app.setUsage(analysis('Unrelated model')), /different model/);
  assert.equal(app.msrStatus('Derived').status, 'unused');
  h.receive({ type: 'model', ...record('workspace:second', 'Second model') }); await flush();
  assert.equal(app.msrStatus('Derived'), null); assert.equal(app.colStatus('Sales', 'Amount'), null); h.isolated();
});


test('host initialization errors produce an accessible failure instead of a blank or sample viewer', async () => {
  const h = harness();
  for (const fn of h.events.DOMContentLoaded) fn();
  h.next('ready'); h.receive({ type: 'error', message: 'Workspace access failed' }); await flush();
  assert.equal(h.context.app, undefined);
  const alert = flatten(h.document.getElementById('root')).find(n => n.attrs?.role === 'alert');
  assert.ok(alert); assert.match(alert.textContent, /Workspace access failed/); h.isolated();
});


test('host model switching restores each model lane zoom before layout and fit', async () => {
  const h = harness(), app = await h.boot({ storage: {
    'lsa_model_layout_v1:k': '0.9',
    'smv_layout_workspace:first:k': '0.42',
    'smv_layout_workspace:second:k': '0.25'
  }, open: record() });
  assert.equal(app.canvas.layoutK, 0.42);
  app.canvas._bandBox = { w: 9999, h: 9999 };
  h.receive({ type: 'model', ...record('workspace:second', 'Second model') }); await flush();
  assert.equal(app.canvas.layoutK, 0.25);
  assert.notEqual(app.canvas._bandBox?.w, 9999);
  h.receive({ type: 'model', ...record() }); await flush();
  assert.equal(app.canvas.layoutK, 0.42);
  h.isolated();
});
