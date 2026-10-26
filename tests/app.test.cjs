/* Run: node --test tests/app.test.cjs
   Exercise the shipped browser application methods without a DOM renderer. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '../Models/tools/viewer/js');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function harness() {
  const storage = new Map();
  let failWrites = false;
  const context = {
    console, Set, Map, Promise, Date, JSON,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrites) throw new Error('QuotaExceededError');
        storage.set(key, String(value));
      },
      removeItem: key => storage.delete(key),
    },
    addEventListener() {},
    fetch: () => Promise.reject(new Error('Unexpected fetch')),
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['util.js', 'roles.js', 'tmdl-parser.js', 'canvas.js']) {
    vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), context);
  }
  // The app is an IIFE with a DOMContentLoaded entry point. Expose its constructor
  // only in this test VM; production code and initialization remain unchanged.
  const source = fs.readFileSync(path.join(jsDir, 'app.js'), 'utf8');
  const marker = "  window.addEventListener('DOMContentLoaded'";
  assert.ok(source.includes(marker));
  vm.runInContext(source.replace(marker, '  g.TestApp = App;\n' + marker), context);
  const app = Object.create(context.TestApp.prototype);
  Object.assign(app, {
    state: {}, modelKey: 'builtin',
    DOMAIN_COLORS: {}, SCHEMA_COLORS: {}, SOURCE_COLORS: {}, PALETTE: ['#000'],
    canvas: Object.assign(Object.create(context.GraphCanvas.prototype), { computeLayout() {}, build() {}, fitView() {} }),
    measures: {}, matrix: {}, sidebar: {},
    render() {},
    setState(patch, callback) { Object.assign(this.state, patch); if (callback) callback(); },
  });
  return { app, context, storage, failWrites: value => { failWrites = value; } };
}

function model(tables = []) {
  return { name: 'Fixture', tables: tables.map(t => ({
    columns: [], measures: [], domain: 'Other', source: { kind: 'other' }, ...t,
  })), relationships: [] };
}

function dependencyFixture() {
  return model([
    { name: 'Sales', columns: [{ name: 'Amount' }], measures: [
      { name: 'Base', dax: 'SUM(Sales[Amount])' },
      { name: 'Bare', dax: '[Base] + [base]' },
      { name: 'Qualified', dax: 'Sales[Base] + sales[base] + Sales[Amount]' },
      { name: 'StringThenRef', dax: '"https://example.invalid" & [Base]' },
      { name: 'BlockStringThenRef', dax: '"/*" & [Base] & "*/"' },
      { name: 'Comments', dax: '// [Bare]\n-- [Qualified]\n/* [StringThenRef] */ [Base]' },
      { name: 'EscapedString', dax: '"say ""[Bare] //""" & [Base]' },
      { name: 'UnknownQualifier', dax: 'Missing[Base]' },
      { name: 'Trivia', dax: 'Sales /* context */ [Base]' },
      { name: 'OddIdentifiers', dax: "'Owner''s Data'[Total]]Value] + [Total]]Value]" },
    ] },
    { name: "Owner's Data", measures: [{ name: 'Total]Value', dax: '1' }] },
  ]);
}

test('dependency index resolves qualified measures and preserves real column references', () => {
  const { app } = harness(); const fixture = dependencyFixture(); app.prepareModel(fixture);
  const byName = Object.fromEntries(fixture.tables[0].measures.map(m => [m.name, m]));
  assert.deepEqual(plain(byName.Qualified._deps), ['Base']);
  assert.deepEqual(plain(byName.Qualified._cols), [{ t: 'Sales', cs: ['Amount'] }]);
  assert.deepEqual(plain(byName.Bare._deps), ['Base']);
  assert.equal(fixture.msrUsedBy.Base.filter(n => n === 'Qualified').length, 1);
  assert.deepEqual(plain(byName.UnknownQualifier._deps), []);
});

test('strings, comments, escaped identifiers and case-insensitive names do not lose or invent edges', () => {
  const { app } = harness(); const fixture = dependencyFixture(); app.prepareModel(fixture);
  const byName = Object.fromEntries(fixture.tables[0].measures.map(m => [m.name, m]));
  for (const name of ['StringThenRef', 'BlockStringThenRef', 'Comments', 'EscapedString', 'Trivia']) {
    assert.deepEqual(plain(byName[name]._deps), ['Base'], name);
  }
  assert.deepEqual(plain(byName.OddIdentifiers._deps), ['Total]Value']);
  assert.deepEqual(plain(byName.OddIdentifiers._cols), []);
});

test('late built-in report usage cannot leak into a subsequently selected imported model', async () => {
  const { app, context } = harness(); const usage = deferred();
  app.setStore([{ id: 'imported', name: 'Imported', model: model([{ name: 'Import table' }]) }]);
  context.fetch = url => Promise.resolve({ json: () => url === 'report-usage.json'
    ? usage.promise : Promise.resolve(model([{ name: 'Built-in table' }])) });
  await app.loadModel('builtin');
  await app.loadModel('imported');
  usage.resolve({ model: 'Contoso Retail', measures: { Base: [{ p: 'Wrong report page' }] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.modelKey, 'imported');
  assert.equal(app._usage, null);
});

test('report usage still loads for the active built-in model', async () => {
  const { app, context } = harness();
  context.fetch = url => Promise.resolve({ json: () => Promise.resolve(url === 'report-usage.json'
    ? { model: 'Contoso Retail', measures: { Base: [{ p: 'Page 1' }] } }
    : model([{ name: 'Built-in table' }])) });
  await app.loadModel('builtin');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(plain(app._usage), { Base: [{ p: 'Page 1' }] });
});

test('a late model fetch cannot replace a newer model selection', async () => {
  const { app, context } = harness(); const data = deferred();
  app.setStore([{ id: 'imported', name: 'Imported', model: model([{ name: 'Import table' }]) }]);
  context.fetch = () => Promise.resolve({ json: () => data.promise });
  const initial = app.loadModel('builtin');
  await app.loadModel('imported');
  data.resolve(model([{ name: 'Built-in table' }]));
  await initial;
  assert.equal(app.modelKey, 'imported');
  assert.equal(app.state.modelName, 'Imported');
});

test('storage failure preserves the import preview and current model, then allows retry', () => {
  const { app, failWrites } = harness();
  app._importModel = model([{ name: 'Imported table' }]);
  app.state = { showImport: true, importReady: true, importName: 'Imported model' };
  app.modelKey = 'previous';
  const loaded = []; app.loadModel = id => { loaded.push(id); };
  failWrites(true); app.confirmImport();
  assert.equal(app.modelKey, 'previous');
  assert.equal(loaded.length, 0);
  assert.equal(app.state.showImport, true);
  assert.equal(app.state.importReady, true);
  assert.match(app.state.importError, /Could not save/);
  assert.ok(app._importModel);
  failWrites(false); app.confirmImport();
  assert.equal(loaded.length, 1);
  assert.equal(app.getStore()[0].name, 'Imported model');
  assert.equal(app._importModel, null);
});

test('multi-model import failure does not close the dialog or open a fallback model', async () => {
  const { app, failWrites } = harness(); const loaded = [];
  app.state.showImport = true; app.loadModel = id => { loaded.push(id); };
  failWrites(true);
  await app.handleFiles(['First', 'Second'].map(name => ({
    p: name + '.SemanticModel/model.bim',
    f: { name: 'model.bim', text: async () => JSON.stringify({ model: { tables: [{ name }] } }) },
  })));
  assert.equal(loaded.length, 0);
  assert.equal(app.state.showImport, true);
  assert.match(app.state.importError, /Could not save/);
});

test('repo cache storage failure does not silently reopen the stale cached model', async () => {
  const { app, failWrites } = harness(); const loaded = [];
  app.setStore([{ id: 'repo:Example.SemanticModel', name: 'Example', model: model([{ name: 'Old' }]) }]);
  app.loadModel = id => { loaded.push(id); };
  app.readModelDir = async () => [{ name: 'model.bim', text: JSON.stringify({ model: { tables: [{ name: 'New' }] } }) }];
  failWrites(true);
  await app.openRepoModel({ name: 'Example', path: 'Example.SemanticModel', handle: {} });
  assert.equal(loaded.length, 0);
  assert.match(app.state.repoError, /Could not save/);
  assert.equal(app.getStore()[0].model.tables[0].name, 'Old');
});

test('repo refresh cannot reopen an old selection after the user switches model', async () => {
  const { app } = harness(); const files = deferred(); const loaded = [];
  app.modelKey = 'repo:Example.SemanticModel';
  app.repoModels = [{ name: 'Example', path: 'Example.SemanticModel', handle: {} }];
  app.readModelDir = () => files.promise; app.loadModel = id => { loaded.push(id); };
  const refreshing = app.refreshCurrentRepoModel();
  app.modelKey = 'new-selection';
  files.resolve([{ name: 'model.bim', text: JSON.stringify({ model: { tables: [{ name: 'New' }] } }) }]);
  await refreshing;
  assert.equal(loaded.length, 0);
});

test('a drop handled by the import modal stops bubbling to the root import listener', () => {
  const { app } = harness(); let stopped = 0, handled = 0;
  app.handleFiles = () => { handled++; };
  app.onDrop({ preventDefault() {}, stopPropagation() { stopped++; }, dataTransfer: { files: [] } });
  assert.equal(stopped, 1);
  assert.equal(handled, 1);
});

test('root import listener ignores internal table drags and text-only drops', () => {
  const { context } = harness(); const rootEvents = {};
  context.document = { getElementById: () => ({ addEventListener: (type, callback) => { rootEvents[type] = callback; } }) };
  for (const name of ['GraphCanvas', 'TopBar', 'Legend', 'Hint', 'MatrixView', 'MeasuresView', 'Sidebar', 'ImportModal', 'RulesModal']) {
    context[name] = function () {};
  }
  const app = new context.TestApp(); let imported = 0;
  app.onDrop = () => { imported++; };
  app.setState = patch => Object.assign(app.state, patch);
  for (const types of [['application/x-smv-table'], ['text/plain']]) {
    rootEvents.drop({ dataTransfer: { types, files: [] }, preventDefault() {} });
    assert.equal(app.state.showImport, false);
    assert.equal(imported, 0);
  }
  rootEvents.drop({ dataTransfer: { types: ['Files'], files: [{}] }, preventDefault() {} });
  assert.equal(app.state.showImport, true);
  assert.equal(imported, 1);
});

test('switching models after expanding cards cannot restore the previous model positions', async () => {
  const { app, context } = harness();
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'canvas.js'), 'utf8'), context);
  const canvasMethods = context.GraphCanvas.prototype;
  Object.assign(app.canvas, {
    app,
    setAllExpanded: canvasMethods.setAllExpanded,
    toggleExpandAll: canvasMethods.toggleExpandAll,
    computeLayout() { this.pos = Object.fromEntries(app.model.tables.map(t => [t.name, { x: 100, y: 200 }])); },
    build() { this.cards = Object.fromEntries(app.model.tables.map(t => [t.name, { table: t, body: { style: {} }, caret: { style: {} } }])); },
    layoutCard(name) { assert.ok(this.pos[name], 'Position must belong to the active model: ' + name); },
    spreadForExpanded() {},
    renderLines() {},
  });
  app.setStore([
    { id: 'model-a', name: 'Model A', model: model([{ name: 'Only in A' }]) },
    { id: 'model-b', name: 'Model B', model: model([{ name: 'Only in B' }]) },
  ]);
  await app.loadModel('model-a');
  app.canvas.toggleExpandAll();
  assert.equal(app.state.allExpanded, true);
  assert.ok(app.canvas._preExpandPos['Only in A']);
  await app.loadModel('model-b');
  assert.equal(app.state.allExpanded, false);
  assert.equal(app.canvas._preExpandPos, null);
  // Domains also collapses cards when entered, independently of the toolbar flag.
  app.canvas.setAllExpanded(false);
  assert.deepEqual(plain(app.canvas.pos), { 'Only in B': { x: 100, y: 200 } });
});

test('forced render refreshes an already-open layout list after saving and deleting a preset', () => {
  const { app, context } = harness();
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'canvas.js'), 'utf8'), context);
  const canvasMethods = context.GraphCanvas.prototype;
  for (const name of ['presetsKey', 'getPresets', 'setPresets', 'savePreset', 'deletePreset', 'captureFocus', 'captureDisplay']) {
    app.canvas[name] = canvasMethods[name];
  }
  Object.assign(app.canvas, { app, cards: {}, pinned: new Set(), pos: { Table: { x: 0, y: 0 } }, view: { x: 0, y: 0, k: 1 } });
  for (const name of ['topbar', 'legend', 'hint', 'matrix', 'measures', 'sidebar', 'importModal', 'rulesModal']) {
    app[name] = { update() {} };
  }
  delete app.render; // Exercise the shipped render method instead of the harness's DOM-free stub.
  app.explorer = {
    _key: null, visiblePresetNames: [],
    update() {
      const key = app.modelKey + '|open-layout-menu';
      if (this._key === key) return;
      this._key = key;
      this.visiblePresetNames = Array.from(app.canvas.getPresets(), p => p.name);
    },
  };
  app.render();
  assert.deepEqual(app.explorer.visiblePresetNames, []);
  app.canvas.savePreset('Investigation');
  app.render(true);
  assert.deepEqual(app.explorer.visiblePresetNames, ['Investigation']);
  app.canvas.deletePreset('Investigation');
  app.render(true);
  assert.deepEqual(app.explorer.visiblePresetNames, []);
});

test('a genuinely fresh browser boots with no model selected, not the bundled sample', async () => {
  const { app } = harness();
  await app.init();
  assert.equal(app.model.tables.length, 0);
  assert.equal(app.state.modelName, 'Choose a model');
  assert.equal(app.state.showModelMenu, false);
  assert.equal(app.modelKey, null, 'nothing should read as "the current model" in the switcher');
});

test('a fresh boot never persists a current-model choice the user did not make', async () => {
  const { app, storage } = harness();
  await app.init();
  assert.equal(storage.has('smv_current_v1'), false);
});

test('a returning user (smv_current_v1 already set) still boots straight into their model', async () => {
  const { app, storage } = harness();
  storage.set('smv_current_v1', 'previous');
  const loaded = [];
  app.loadModel = id => { loaded.push(id); app.model = { tables: [{ name: 'T' }], relationships: [] }; };
  await app.init();
  assert.deepEqual(loaded, ['previous']);
});


test('model switches restore lane zoom with positions and discard the previous model size cache', async () => {
  const { app, storage } = harness();
  app.canvas.app = app;
  storage.set('lsa_model_layout_v1:k', '0.9');
  storage.set('smv_layout_model-a:k', '0.42');
  storage.set('smv_layout_model-b:k', '0.25');
  for (const [key, expected] of [['model-a', 0.42], ['model-b', 0.25], ['builtin', 0.9], ['new', app.canvas.ZOOM_FLOOR], ['model-a', 0.42]]) {
    app.canvas._bandBox = { w: 9999, h: 9999 };
    app.canvas._longWord = 9999;
    app.canvas.computeLayout = function () {
      assert.equal(this.layoutK, expected, 'restore before computing layout for ' + key);
      assert.equal(this._bandBox, null);
      assert.equal(this.longestWord(), key.length);
      assert.equal(this.fitFloor(), expected);
    };
    app._applyModel(model([{ name: key }]), key, key);
  }
});

test('invalid saved lane zoom falls back to a finite supported value', () => {
  const { app, storage } = harness();
  for (const [value, expected] of [['Infinity', app.canvas.ZOOM_FLOOR], ['oops', app.canvas.ZOOM_FLOOR], ['-2', app.canvas.ZOOM_FLOOR], ['99', 1.25]]) {
    storage.set('smv_layout_bad:k', value);
    app.canvas.setLayoutKey('smv_layout_bad');
    assert.equal(app.canvas.layoutK, expected);
  }
});


test('role annotation patch preserves DAX, child annotations, and CRLF; Auto removes only table annotation', () => {
  const {context} = harness();
  const original = "table 'Sales Orders'\r\n\tcolumn ID\r\n\t\tdataType: int64\r\n\t\tannotation SMV_Role = helper\r\n\tmeasure Total =\r\n\t\tSUM([ID])\r\n";
  const updated = context.Roles.patchTMDL(original, 'Sales Orders', 'dim');
  assert.equal(updated, original.replace("table 'Sales Orders'\r\n", "table 'Sales Orders'\r\n\tannotation SMV_Role = dim\r\n"));
  assert.equal(context.Roles.patchTMDL(updated, 'Sales Orders', 'auto'), original);
  assert.match(context.Roles.patchTMDL(updated, 'Sales Orders', 'fact'), /\tannotation SMV_Role = fact\r\n/);
  assert.equal(context.Roles.patchTMDL(original, 'Other', 'dim'), null);
  assert.throws(() => context.Roles.patchTMDL('table Sales\n\tannotation SMV_Role = dim\n\tannotation SMV_Role = fact\n', 'Sales', 'helper'), /Duplicate/);
});

function writableRoleFixture() {
  const h = harness(), {app, context} = h;
  let text = 'table Sales\n\tcolumn ID\n\t\tdataType: int64\n';
  const file = {kind:'file', getFile:async()=>({text:async()=>text}), createWritable:async()=>{
    let pending;
    return {write:async value=>{pending=value;}, close:async()=>{text=pending;}, abort:async()=>{}};
  }};
  const dir = {requestPermission:async()=> 'granted', async *entries(){yield ['Sales.tmdl', file];}};
  app.modelKey='repo:Demo.SemanticModel'; app._repoLive=true;
  app.repoModels=[{path:'Demo.SemanticModel',handle:dir}];
  app.model=context.TMDLParser.parseAny([{name:'Sales.tmdl',text}]);
  app.prepareModel(app.model); app.applyRoles(app.model, app.modelKey);
  return {...h, file, dir, source:()=>text};
}

test('repo role writes TMDL and is visible in a fresh parser without browser overrides', async () => {
  const {app,context,source,storage} = writableRoleFixture();
  storage.set('smv_role_overrides_v1', JSON.stringify({'repo:Demo.SemanticModel':{Sales:'helper'}}));
  await app.assignRole('Sales', 'fact');
  assert.match(source(), /annotation SMV_Role = fact/);
  const reopened=context.TMDLParser.parseAny([{name:'Sales.tmdl',text:source()}]);
  app.applyRoles(reopened, app.modelKey);
  assert.equal(reopened.tables[0].role, 'fact');
  assert.match(app.state.roleSave.text, /^Saved to/);
  await app.assignRole('Sales', 'auto');
  assert.doesNotMatch(source(), /SMV_Role/);
});

test('denied or failed repo writes leave classification and file unchanged', async () => {
  for (const failure of ['permission','write']) {
    const {app,dir,file,source}=writableRoleFixture();
    const before=source(), role=app.model.byName.Sales.role;
    if(failure==='permission') dir.requestPermission=async()=> 'denied';
    else file.createWritable=async()=>{throw new Error('Disk unavailable');};
    await app.assignRole('Sales','fact');
    assert.equal(source(),before); assert.equal(app.model.byName.Sales.role,role);
    assert.match(app.state.roleSave.text,/^Not saved:/);
  }
});

test('cached disconnected repo does not silently save a browser-only override', async () => {
  const {app,storage}=writableRoleFixture(); app._repoLive=false;
  await app.assignRole('Sales','fact');
  assert.match(app.state.roleSave.text,/reconnect/);
  assert.equal(storage.has('smv_role_overrides_v1'),false);
});

function refreshFixture(files) {
  const h = harness(); const { app, context } = h;
  const idb = new Map();
  app._idbGet = async k => idb.get(k); app._idbSet = async (k, v) => { idb.set(k, v); }; app._idbDel = async k => { idb.delete(k); };
  context.showDirectoryPicker = async () => { h.picked = (h.picked || 0) + 1; return { name: 'Demo.SemanticModel' }; };
  app.readModelDir = async () => h.files;
  h.files = files; h.idb = idb;
  app.setStore([{ id: 'm1', name: 'Demo', at: 1, model: context.TMDLParser.parseAny([{ name: 'Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }]) }]);
  app.state.loaded = true; app.modelKey = 'm1';
  app.loadModel = async key => { app.modelKey = key; };
  return h;
}

test('importing a model with an existing name updates it in place and keeps its id', () => {
  const { app } = harness();
  app.setStore([
    { id: 'm1', name: 'Demo', model: model([{ name: 'Old' }]) },
    { id: 'repo:x', name: 'Demo', model: model() },
    { id: 'm2', name: 'Other', model: model() },
  ]);
  assert.equal(app.importTarget(' demo ').id, 'm1');
  assert.equal(app.importTarget('Brand new'), null);
  app.loadModel = () => {};
  app._importModel = model([{ name: 'New' }]); app.state = { importName: 'Demo' };
  app.confirmImport();
  const store = app.getStore();
  assert.equal(store.length, 3);
  assert.deepEqual(plain(store.find(m => m.id === 'm1').model.tables.map(t => t.name)), ['New']);
});

test('refresh re-reads the open model, reports new tables, and remembers the folder', async () => {
  const h = refreshFixture([{ name: 'Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }, { name: 'Brand.tmdl', text: 'table Brand\n\tcolumn B\n' }]);
  const { app } = h;
  await app.refreshSource();
  assert.equal(app.state.refreshing, false);
  assert.match(app.state.snapshotMessage, /Refreshed from source · 2 tables · 1 new \(Brand\)/);
  assert.equal(app.getStore().length, 1);
  assert.equal(app.getStore()[0].model.tables.length, 2);
  assert.equal(h.picked, 1);
  assert.ok(h.idb.has('src:m1'));
});

test('a folder import remembers its folder, so refresh never shows the picker', async () => {
  const h = refreshFixture([{ name: 'Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }, { name: 'Brand.tmdl', text: 'table Brand\n\tcolumn B\n' }]);
  const { app, context } = h; const folder = { name: 'Demo.SemanticModel', kind: 'directory', queryPermission: async () => 'granted' };
  context.showDirectoryPicker = async () => folder;
  app.readModelDir = async () => [{ name: 'Sales.tmdl', path: 'Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }];
  await app.chooseImportFolder(() => assert.fail('fallback input used'));
  assert.equal(app.state.importReady, true);
  app.state.importName = 'Demo'; app.confirmImport();
  await new Promise(r => setImmediate(r));
  assert.equal(h.idb.get('src:m1'), folder);
  context.showDirectoryPicker = async () => assert.fail('picker shown on refresh');
  app.readModelDir = async () => h.files;
  await app.refreshSource();
  assert.match(app.state.snapshotMessage, /Refreshed from source · 2 tables/);
});

test('refresh with an unchanged source makes no change', async () => {
  const h = refreshFixture([{ name: 'Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }]);
  const before = JSON.stringify(h.app.getStore());
  await h.app.refreshSource();
  assert.equal(h.app.state.snapshotMessage, 'Already up to date with the source folder.');
  assert.equal(JSON.stringify(h.app.getStore()), before);
});

test('refresh cancelled at the folder picker or failing to read changes nothing', async () => {
  const h = refreshFixture([]);
  h.context.showDirectoryPicker = async () => { throw new Error('AbortError'); };
  await h.app.refreshSource();
  assert.equal(h.app.state.refreshing, false);
  assert.equal(h.app.state.snapshotError || '', '');
  h.context.showDirectoryPicker = async () => ({ name: 'Demo.SemanticModel' });
  h.app.readModelDir = async () => { throw new Error('boom'); };
  await h.app.refreshSource();
  assert.match(h.app.state.snapshotError, /Refresh failed: boom/);
  assert.equal(h.app.state.refreshing, false);
  assert.equal(h.idb.has('src:m1'), false);
  assert.equal(h.app.getStore()[0].model.tables.length, 1);
});

test('refresh is unavailable for the built-in model, hosts, and browsers without folder access', () => {
  const { app, context } = refreshFixture([]);
  assert.equal(app.canRefreshSource(), true);
  app.modelKey = 'builtin'; assert.equal(app.canRefreshSource(), false);
  app.modelKey = 'm1'; app.host = {}; assert.equal(app.canRefreshSource(), false);
  app.host = null; delete context.showDirectoryPicker; assert.equal(app.canRefreshSource(), false);
});

/* ---------- local app server (scripts/serve.py) ---------- */
function directory(name, children) {
  return { name, kind: 'directory', async *entries() { yield* Object.entries(children); } };
}
function sourceFile(name, text, reads) {
  return { name, kind: 'file', getFile: async () => ({ text: async () => { reads.push(name); return text; } }) };
}

test('repo import discovers first, reads only models, and keeps nested paths and multiple model names', async () => {
  const { app, context } = harness();
  const calls = [], reads = [], raw = 'table Sales\r\n\tcolumn A\r\n';
  const directFiles = [{ name: 'Sales.tmdl', path: 'definition/tables/Sales.tmdl', text: raw }];
  context.fetch = async url => {
    calls.push(url);
    if (url === 'api/find?path=%2Frepo') return { ok: true, json: async () => ({ models: [
      { name: 'Demo', path: 'Sub/Demo.SemanticModel', dir: '/repo/Sub/Demo.SemanticModel' },
      { name: 'Perf', path: 'Perf.SemanticModel', dir: '/repo/Perf.SemanticModel' },
    ] }) };
    assert.ok(['api/model?path=%2Frepo%2FSub%2FDemo.SemanticModel', 'api/model?path=%2Frepo%2FPerf.SemanticModel'].includes(url));
    return { ok: true, json: async () => ({ files: directFiles }) };
  };
  const serverFiles = await app.readModelDir({ dir: '/repo' });
  assert.deepEqual(calls, ['api/find?path=%2Frepo', 'api/model?path=%2Frepo%2FSub%2FDemo.SemanticModel', 'api/model?path=%2Frepo%2FPerf.SemanticModel']);
  const nativeModel = name => directory(name, { definition: directory('definition', {
    tables: directory('tables', { 'Sales.tmdl': sourceFile('Sales.tmdl', raw, reads) }),
  }) });
  const outside = { kind: 'file', getFile: async () => assert.fail('outside model content must not be read') };
  const nativeFiles = await app.readModelDir(directory('repo', {
    analysis: directory('analysis', { 'unrelated.json': outside }), 'outside.tmdl': outside,
    Sub: directory('Sub', { 'Demo.SemanticModel': nativeModel('Demo.SemanticModel') }),
    'Perf.SemanticModel': nativeModel('Perf.SemanticModel'),
    node_modules: directory('node_modules', { 'Skipped.SemanticModel': directory('Skipped.SemanticModel', { 'model.bim': outside }) }),
    '.hidden': directory('.hidden', { 'Skipped.SemanticModel': directory('Skipped.SemanticModel', { 'model.bim': outside }) }),
  }));
  assert.deepEqual(reads, ['Sales.tmdl', 'Sales.tmdl']);
  assert.deepEqual(plain(nativeFiles.map(({ handle, ...file }) => file)), plain(serverFiles));
  assert.deepEqual(plain(serverFiles.map(f => f.path)), ['Sub/Demo.SemanticModel/definition/tables/Sales.tmdl', 'Perf.SemanticModel/definition/tables/Sales.tmdl']);
  await app.handleFiles(serverFiles.map(f => ({ name: f.name, p: f.path, text: f.text })));
  assert.deepEqual(plain(app.getStore().map(m => ({ id: m.id, name: m.name, tables: m.model.tables.map(t => t.name) }))), [
    { id: 'repo:Sub/Demo.SemanticModel', name: 'Demo', tables: ['Sales'] },
    { id: 'repo:Perf.SemanticModel', name: 'Perf', tables: ['Sales'] },
  ]);
});

test('direct model readers skip discovery and flat TMDL/BIM folders fall back after discovery', async () => {
  const { app, context } = harness(); const calls = [], reads = [];
  const files = [{ name: 'Sales.tmdl', path: 'Sales.tmdl', text: 'table Sales\r\n' },
    { name: 'model.bim', path: 'model.bim', text: '{"model":{"tables":[]}}' }];
  context.fetch = async url => {
    calls.push(url);
    return { ok: true, json: async () => url.startsWith('api/find?') ? { models: [] } : { files } };
  };
  assert.deepEqual(plain(await app.readModelDir({ dir: '/Demo.SemanticModel', name: 'Demo' })), files);
  assert.deepEqual(calls, ['api/model?path=%2FDemo.SemanticModel']);
  calls.length = 0;
  assert.deepEqual(plain(await app.readModelDir({ dir: '/flat', name: 'flat' })), files);
  assert.deepEqual(calls, ['api/find?path=%2Fflat', 'api/model?path=%2Fflat']);
  const children = Object.fromEntries(files.map(f => [f.name, sourceFile(f.name, f.text, reads)]));
  app._findModelDirs = async () => assert.fail('direct model must not discover itself');
  const direct = await app.readModelDir(directory('Demo.SemanticModel', children));
  app._findModelDirs = context.TestApp.prototype._findModelDirs;
  const flat = await app.readModelDir(directory('flat', children));
  assert.deepEqual(plain(direct.map(({ handle, ...file }) => file)), files);
  assert.deepEqual(plain(flat.map(({ handle, ...file }) => file)), files);
});

test('successful unreadable JSON and invalid model responses report actionable transport errors', async () => {
  const { app, context } = harness();
  context.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('terminated'); } });
  await assert.rejects(app.readModelDir({ dir: '/Demo.SemanticModel' }), /The local app response could not be read completely\. Try opening the folder again\./i);
  for (const response of [null, {}, { files: null }, { files: {} }, { files: [null] }, { files: [{ name: 'Sales.tmdl' }] }]) {
    context.fetch = async () => ({ ok: true, json: async () => response });
    await assert.rejects(app.readModelDir({ dir: '/Demo.SemanticModel' }), /The local app did not return a readable model\. Try opening the folder again\./i);
  }
  context.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Not a folder' }) });
  await assert.rejects(app.api('model', {}), /Not a folder/);
  context.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('bad JSON'); } });
  await assert.rejects(app.api('model', {}), /local app returned 502/);
  context.fetch = async () => ({ ok: true, json: async () => ({ ok: true, home: '/home' }) });
  assert.deepEqual(plain(await app.api('ping')), { ok: true, home: '/home' });
});

function serverFixture() {
  const h = harness(); const { app, context } = h;
  app.server = { ok: true, home: '/home/u', sep: '/' };
  app._idbGet = async () => null; app._idbSet = async () => {}; app._idbDel = async () => {};
  context.showDirectoryPicker = async () => assert.fail('the browser folder picker must not open in local-app mode');
  const model = path => (path === '/repo/Sub/Demo.SemanticModel' || path === '/repo') ? h.files : [];
  h.files = [{ name: 'Sales.tmdl', path: 'definition/tables/Sales.tmdl', text: 'table Sales\n\tcolumn A\n' }];
  h.calls = [];
  app.api = async (route, params) => {
    h.calls.push([route, params.path]);
    if (route === 'browse') return { path: params.path || '/home/u', name: 'u', parent: '/home', model: false, roots: [{ name: 'Home', path: '/home/u' }], dirs: [{ name: 'repo', path: '/home/u/repo', model: false }] };
    if (route === 'find') return { models: params.path === '/repo' || params.path === '/home/u/repo' ? [{ name: 'Demo', path: 'Sub/Demo.SemanticModel', dir: '/repo/Sub/Demo.SemanticModel' }] : [] };
    if (route === 'model') return { files: model(params.path) };
    throw new Error('unexpected ' + route);
  };
  app.state.loaded = true;
  app.loadModel = async key => { app.modelKey = key; };
  return h;
}

test('local app: the folder chooser resolves to the chosen folder and remembers it', async () => {
  const { app, storage } = serverFixture();
  const picked = app.pickFolder({ title: 'Choose' });
  await new Promise(r => setImmediate(r));
  assert.equal(app.state.folderPick.loading, false);
  assert.deepEqual(app.state.folderPick.dirs.map(d => d.name), ['repo']);
  app.finishFolderPick('/home/u/repo/');
  assert.deepEqual(plain(await picked), { dir: '/home/u/repo/', name: 'repo' });
  assert.equal(app.state.folderPick, null);
  assert.equal(storage.get('smv_last_dir'), '/home/u/repo/');
  const cancelled = app.pickFolder({});
  await new Promise(r => setImmediate(r));
  app.finishFolderPick(null);
  assert.equal(await cancelled, null);
});

test('local app: connecting a repo scans through the server and opens its single model, no browser picker', async () => {
  const h = serverFixture(); const { app, storage } = h;
  app.pickFolder = async () => ({ dir: '/repo', name: 'repo' });
  await app.connectRepo();
  assert.equal(app._repoLive, true);
  assert.equal(storage.get('smv_repo_path'), '/repo');
  assert.equal(storage.get('smv_repo_name'), 'repo');
  assert.deepEqual(app.repoModels.map(m => m.path), ['Sub/Demo.SemanticModel']);
  await new Promise(r => setImmediate(r));
  assert.equal(app.modelKey, 'repo:Sub/Demo.SemanticModel');
  assert.equal(app.getStore()[0].model.tables[0].name, 'Sales');
  assert.equal(app.repoRows()[0].meta, 'in repo · cached');
  // a later session reconnects from the stored path without asking anything
  const again = serverFixture(); again.storage.set('smv_repo_path', '/repo');
  await again.app.reconnectRepo();
  assert.equal(again.app._repoLive, true);
  assert.deepEqual(again.app.repoModels.map(m => m.name), ['Demo']);
  again.app.forgetRepo();
  assert.equal(again.storage.has('smv_repo_path'), false);
});

test('local app: Refresh re-reads a repo model and an imported model without any prompt', async () => {
  const h = serverFixture(); const { app, storage, context } = h;
  app.repoPath = '/repo'; app._repoLive = true;
  app.repoModels = [{ name: 'Demo', path: 'Sub/Demo.SemanticModel', dir: '/repo/Sub/Demo.SemanticModel' }];
  app.setStore([{ id: 'repo:Sub/Demo.SemanticModel', name: 'Demo', at: 1, repo: true, model: context.TMDLParser.parseAny(h.files) }]);
  app.modelKey = 'repo:Sub/Demo.SemanticModel';
  h.files = h.files.concat([{ name: 'Brand.tmdl', path: 'definition/tables/Brand.tmdl', text: 'table Brand\n\tcolumn B\n' }]);
  await app.refreshSource();
  assert.match(app.state.snapshotMessage, /Refreshed from source · 2 tables · 1 new \(Brand\)/);

  // imported through "Browse folder": the path is remembered with the model
  app.pickFolder = async () => ({ dir: '/repo/Sub/Demo.SemanticModel', name: 'Demo.SemanticModel' });
  await app.importFromFolder();
  assert.equal(app.state.importReady, true);
  assert.equal(app.state.importName, 'Demo');
  app.state.importName = 'Imported'; app.confirmImport();
  const id = app.modelKey;
  assert.match(id, /^m/);
  assert.equal(storage.get('smv_src_' + id), '/repo/Sub/Demo.SemanticModel');
  app.pickFolder = async () => assert.fail('a remembered folder must not be asked for again');
  h.files = h.files.slice(0, 1);
  await app.refreshSource();
  assert.match(app.state.snapshotMessage, /1 removed \(Brand\)/);
  app.deleteModel(id);
  assert.equal(storage.has('smv_src_' + id), false);
});

test('local app: the hosted page is the demo and opens the sample; the local app does not', () => {
  const { app, context } = harness();
  context.location = { protocol: 'https:', hostname: 'mrperfecth.github.io' };
  assert.equal(app.isDemoSite(), true);
  context.location = { protocol: 'http:', hostname: 'localhost' };
  assert.equal(app.isDemoSite(), false);
  context.location = { protocol: 'https:', hostname: 'mrperfecth.github.io' };
  app.server = { ok: true };
  assert.equal(app.isDemoSite(), false);
  app.server = null; context.location = { protocol: 'file:', hostname: '' };
  assert.equal(app.isDemoSite(), false);
});

test('source impact distinguishes whole tables, columns, home tables and indirect measures', () => {
  const { app } = harness();
  const fixture = model([
    { name: 'Sales', columns: [{name:'Amount'}, {name:'Quantity'}, {name:'LineAmount',isCalc:true}, {name:'Unused'}] },
    { name: 'Measures', measures: [
      {name:'Revenue',dax:'SUM(sales[amount])'}, {name:'Rows',dax:'COUNTROWS(Sales)'},
      {name:'Average',dax:'DIVIDE([Revenue], [Rows])'},
      {name:'Calculated input',dax:'SUM(Sales[LineAmount])'},
      {name:'Duplicate refs',dax:'SUM(Sales[Amount]) + SUM(Sales[Amount]) + COUNTROWS(Sales)'},
      {name:'Unknown',dax:'SUM(Sales[Missing]) + Missing[Amount]'},
    ] },
  ]);
  app.prepareModel(fixture); app.model = fixture;
  assert.deepEqual(plain(app.measureImpact({table:'Sales',column:'Amount'})), {direct:['Duplicate refs','Revenue'],all:['Average','Duplicate refs','Revenue']});
  assert.deepEqual(plain(app.measureImpact({table:'Sales'})), {direct:['Calculated input','Duplicate refs','Revenue','Rows'],all:['Average','Calculated input','Duplicate refs','Revenue','Rows']});
  assert.deepEqual(plain(app.measureImpact({table:'Measures'})), {direct:[],all:[]}, 'Home table does not create source references');
  assert.deepEqual(plain(app.measureImpact({table:'Sales',column:'Unused'})), {direct:[],all:[]});
  assert.deepEqual(plain(app.measureImpact({table:'Sales',column:'LineAmount'})), {direct:['Calculated input'],all:['Calculated input']});
  assert.deepEqual(plain(app.measureImpact({table:'Sales',column:'Missing'})), {direct:[],all:[]});
  assert.equal(fixture.tables[1].measures.find(m=>m.name==='Unknown')._unresolved.length,2);
});

test('table reference scanning skips strings, comments, functions and variable names', () => {
  const { app } = harness();
  const fixture = model([
    {name:'Sales',columns:[{name:'Amount'}]},
    {name:"Owner's Data",columns:[{name:'Amount'}]},
    {name:'SUM'}, {name:'LocalRows'},
    {name:'Measures',measures:[
      {name:'Quoted',dax:"COUNTROWS('Owner''s Data') + COUNTROWS(sales)"},
      {name:'Not references',dax:'VAR LocalRows = 1 RETURN SUM({LocalRows}) & "Sales /*" /* Sales */ // Sales\n'},
      {name:'Variable table',dax:'VAR LocalRows = FILTER(Sales, Sales[Amount] > 0) RETURN COUNTROWS(LocalRows)'},
      {name:'Qualified measure',dax:'Measures[Quoted]'},
    ]},
  ]);
  app.prepareModel(fixture); app.model = fixture;
  assert.deepEqual(plain(fixture.tables[4].measures[0]._tables), ["Owner's Data",'Sales']);
  assert.deepEqual(plain(fixture.tables[4].measures[1]._tables), []);
  assert.deepEqual(plain(fixture.tables[4].measures[2]._tables), ['Sales']);
  assert.deepEqual(plain(fixture.tables[4].measures[3]._tables), []);
  assert.deepEqual(plain(fixture.tables[4].measures[3]._deps), ['Quoted']);
});

test('source impact terminates on measure cycles and is rebuilt for a new model', () => {
  const { app } = harness();
  const first = model([{name:'Sales',columns:[{name:'Amount'}],measures:[
    {name:'A',dax:'SUM(Sales[Amount]) + [B]'}, {name:'B',dax:'[A]'},
  ]}]);
  app.prepareModel(first); app.model=first;
  assert.deepEqual(plain(app.measureImpact({table:'Sales'})), {direct:['A'],all:['A','B']});
  const second=model([{name:'Sales',columns:[{name:'Amount'}],measures:[{name:'A',dax:'1'}]}]);
  app.prepareModel(second);app.model=second;
  assert.deepEqual(plain(app.measureImpact({table:'Sales'})), {direct:[],all:[]});
});

test('Tables to Power Query and back preserves viewport; other normal return routes still fit',()=>{const {app}=harness();let fits=0,transforms=0;app.state.viewMode='graph';app.canvas.view={x:137,y:93,k:.9};app.captureTableView=()=>({selected:'Sales'});app.canvas.applyHighlight=()=>{};app.canvas.fitView=()=>{fits++;app.canvas.view={x:0,y:0,k:1};};app.canvas.updateTransform=()=>{transforms++;};app.setViewMode('power-query');app.setViewMode('graph');assert.deepEqual(plain(app.canvas.view),{x:137,y:93,k:.9});assert.equal(fits,0);assert.equal(transforms,1);app.setViewMode('measures');app.setViewMode('graph');assert.equal(fits,1);assert.deepEqual(plain(app.canvas.view),{x:0,y:0,k:1});});

test('displayed DAX references use the same resolution rules as dependency indexing', () => {
  const {app}=harness();app.model=dependencyFixture();app.prepareModel(app.model);
  for(const table of app.model.tables) for(const measure of table.measures) {
    const refs=app.referencesInDax(measure.dax,table.name);
    assert.deepEqual(plain(refs.columns),plain(measure._cols),measure.name);
    assert.deepEqual(plain(refs.tables),plain(measure._tables),measure.name);
    assert.deepEqual(plain(refs.measures.filter(name=>name!==measure.name)),plain(measure._deps),measure.name);
  }
});

test('snapshot without saved explorer settings explores both active filter directions, so a dimension shows its facts', () => {
  const { app } = harness();
  const explorer = { loadModel() {}, direction: 'incoming', depth: 'all', includeInactive: false };
  Object.assign(app.canvas, { setLayoutKey() {}, applyPreset() {}, setPresets() {}, updateTransform() {}, renderLines() {}, view: { x: 0, y: 0, k: 1 } });
  Object.assign(app, { explorer, prepareModel() {}, captureTableView: () => ({}), measures: {}, matrix: {}, sidebar: {} });
  const payload = overrides => ({ model: model([{ name: 'Date' }, { name: 'Sales' }]), workspace: overrides });
  app.loadSnapshot(payload({}));
  assert.deepEqual(plain({ d: explorer.direction, depth: explorer.depth, inactive: explorer.includeInactive, focus: app.state.focusDepth }),
    { d: 'both', depth: 'all', inactive: false, focus: 1000000 });
  app.loadSnapshot(payload({ explorer: { direction: 'outgoing', depth: 'two', includeInactive: false } }));
  assert.deepEqual(plain({ d: explorer.direction, depth: explorer.depth, inactive: explorer.includeInactive, focus: app.state.focusDepth }),
    { d: 'outgoing', depth: 'two', inactive: false, focus: 2 });
});

test('table folders override special categories and ordinary ungrouped tables remain neutral', () => {
  const {app}=harness();app.SOURCE_KINDS={};app.FALLBACK_COLOR='#8896aa';app.PALETTE=['#112233','#445566'];
  const fixture=model([{name:'Explicit',tableGroup:'Manual tables',source:{kind:'manual'}},
    {name:'Reserved',source:{kind:'manual'}},{name:'Ordinary',source:{kind:'db',schema:'finance'}}]);
  app.prepareModel(fixture);
  assert.equal(fixture.tables[0].domain,'group:Manual tables');
  assert.equal(fixture.tables[1].domain,'@smv:manual');
  assert.equal(fixture.tables[2].domain,'@smv:ungrouped');
  assert.equal(app._domMap['@smv:ungrouped'],'#8896aa');
  assert.equal(app._domMap['group:Manual tables'],'#112233');
  assert.equal(app.srcKeyOf(fixture.tables[0]),'@smv:manual');
});

test('automatic group palette ranks once, keeps slots across added groups and isolates models', () => {
  const {app}=harness();app.PALETTE=['#112233','#445566','#778899'];
  let fixture=model([{name:'a',tableGroup:'B'},{name:'b',tableGroup:'B'},{name:'c',tableGroup:'A'}]);
  app.prepareModel(fixture);assert.equal(app._domMap['group:B'],'#112233');assert.equal(app._domMap['group:A'],'#445566');
  app._groupColours.domain['group:A'].colour='#abcdef';app.saveGroupColours();
  fixture=model([{name:'a',tableGroup:'B'},...Array.from({length:5},(_,i)=>({name:'new'+i,tableGroup:'C'})),{name:'c',tableGroup:'A'}]);
  app.prepareModel(fixture);assert.equal(app._domMap['group:B'],'#112233');assert.equal(app._domMap['group:C'],'#778899');assert.equal(app._domMap['group:A'],'#abcdef');
  app._groupColours=null;app.prepareModel(fixture);assert.equal(app._domMap['group:A'],'#abcdef','survives reload');
  app.modelKey='another';app.prepareModel(fixture);assert.equal(app._domMap['group:C'],'#112233');assert.notEqual(app._domMap['group:A'],'#abcdef');
});

test('source identities distinguish connections and schemas but ignore table names', () => {
  const {app}=harness();const source={kind:'db',server:'server1',database:'warehouse',schema:'dbo'};
  const key=app.srcKeyOf({source});
  assert.equal(app.srcKeyOf({source:{...source,table:'Sales'}}),key);
  for(const field of ['server','database','schema','workspace','lakehouse','dataflow'])assert.notEqual(app.srcKeyOf({source:{...source,[field]:'other'}}),key,field);
  assert.equal(app.srcKeyOf({role:'calcgroup',source}),'@smv:calcgroup');
});

test('portable colour preferences validate values and retain independent modes', () => {
  const {app}=harness();app.restoreGroupColours({source:{x:{slot:2,colour:'#abcdef'},bad:{slot:-3,colour:'red;position:fixed'}},domain:{x:{slot:1,colour:'#123456'}}});
  const copy=app.captureGroupColours();assert.deepEqual(copy.source.bad,{});assert.equal(copy.source.x.colour,'#abcdef');assert.equal(copy.domain.x.colour,'#123456');
  copy.source.x.colour='#ffffff';assert.equal(app.captureGroupColours().source.x.colour,'#abcdef');
});
