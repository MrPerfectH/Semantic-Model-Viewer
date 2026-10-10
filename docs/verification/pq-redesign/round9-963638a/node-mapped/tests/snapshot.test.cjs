/* Run: node --test tests/snapshot.test.cjs. Browser artifact checks run separately. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const viewerDir = path.join(__dirname, '../Models/tools/viewer');
const jsDir = path.join(viewerDir, 'js');
const Snapshots = require(path.join(jsDir, 'snapshot.js'));
const plain = value => JSON.parse(JSON.stringify(value));
const hostile = '</ScRiPt><script>globalThis.snapshotInjection = true</script><!-- " \' & 😀 \u2028 \u2029';

function model() {
  return { name: 'Model ' + hostile, credentials: 'secret-model', partitions: [{ query: 'secret-partition' }],
    tables: [
      { name: 'Sales ' + hostile, domain: 'Finance', role: 'fact', baseRole: 'fact', autoRole: 'fact', roleVia: 0,
        columns: [{ name: 'Amount', dataType: 'decimal', isKey: false, hidden: true, isCalc: true, rawQuery: 'secret-column' }],
        measures: [{ name: 'Total', dax: 'VAR text = "' + hostile + '"\nRETURN SUM(\'Sales\'[Amount])', folder: 'KPIs\\Sales', fmt: '$#,0', h: true, credentials: 'secret-measure' }],
        source: { kind: 'db', schema: 'finance', table: 'fact_sales', via: 'Shared query', server: 'Driver=X;UID=owner;PWD=secret-odbc', detail: 'secret-parameter-value', credentials: 'secret-source' },
        partitions: [{ expression: 'secret-table-query' }], repoHandle: { token: 'secret-repo' }, _flags: { partSrc: 'secret-flags' } },
      { name: 'Calendar', domain: 'Core', role: 'dim', columns: [{ name: 'Date', dataType: 'dateTime' }], measures: [], source: { kind: 'web', server: 'user:secret-password@example.invalid', detail: 'https://example.invalid?token=secret-web' } },
    ], relationships: [{ from: 'Sales ' + hostile, fromCol: 'Amount', to: 'Calendar', toCol: 'Date', fromCard: 'many', toCard: 'one', both: true, inactive: true, connectionString: 'secret-relationship' }] };
}

function appFixture() {
  const value = model();
  const app = { model: value, state: { modelName: value.name, viewMode: 'graph' },
    canvas: { workspaceNames: new Set(), pos: { Calendar: { x: 240, y: 80 } }, view: { x: -15, y: 22, k: .7 }, cpos: {}, expandedGroups: new Set(), groups: null,
      captureFocus: () => ({ selected: null, isolate: false, depth: 2, pinned: [], locked: null }),
      captureDisplay: () => ({ detail: 'cards', lines: 'curve', color: 'source', expanded: ['Calendar'] }),
      getPresets: () => [{ version: 2, name: 'Manager view', tables: ['Calendar'], pos: { Calendar: { x: 14, y: 25 } }, view: { x: 0, y: 0, k: 1 } }] },
    explorer: { query: 'Calendar', filter: 'available', direction: 'incoming', depth: 'all', includeInactive: true, mapHidden: false },
    getRules: () => [{ role: 'fact', name: '^Sales', sides: '', measures: '', kind: '', _re: /Sales/, extra: 'secret-rule' }],
    measures: { captureSnapshot: () => ({ preferences: { mode: 'split', orientation: 'vertical' }, library: { width: 320 } }) },
    _usage: { Total: [{ p: 'Overview', v: 'Card', f: 'measure', rawPath: 'secret-report-path' }] },
    _usageMeta: { report: 'Report', model: value.name, pageCount: 1, scanned: '2026-09-08', rawPath: 'secret-report-meta' },
  };
  return app;
}

function assets() {
  const template = fs.readFileSync(path.join(viewerDir, 'index.html'), 'utf8');
  const sources = {};
  for (const match of template.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) {
    sources[match[1]] = fs.readFileSync(path.join(viewerDir, match[1]), 'utf8');
  }
  return { template, sources };
}
function scripts(html) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi), match => ({ attrs: match[1], text: match[2] }));
}
function embedded(html, id) {
  const node = scripts(html).find(script => script.attrs.includes('id="' + id + '"'));
  assert.ok(node, 'Expected embedded ' + id);
  return JSON.parse(node.text);
}
function inlineDocument(html) {
  const template = scripts(html).find(script => script.attrs.includes('id="smv-snapshot-template"'));
  const nodes = Array.from(html.matchAll(/<(script|style)\b[^>]*data-smv-asset="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g), match => ({
    textContent: match[3], getAttribute: name => name === 'data-smv-asset' ? match[2] : null,
  }));
  return { getElementById: id => id === 'smv-snapshot-template' ? { textContent: template.text } : null,
    querySelectorAll: selector => { assert.equal(selector, '[data-smv-asset]'); return nodes; } };
}

function memoryRuntime(payload, counters = { reads: 0, writes: 0, deletes: 0 }) {
  const context = { console, Map, Set, JSON, Date,
    localStorage: {
      getItem() { counters.reads++; throw new Error('Native storage is unavailable'); },
      setItem() { counters.writes++; throw new Error('Native storage is unavailable'); },
      removeItem() { counters.deletes++; throw new Error('Native storage is unavailable'); },
    },
  };
  context.window = context;
  if (payload !== undefined) context.document = { getElementById: id => id === 'smv-snapshot-data' ? { textContent: JSON.stringify(payload) } : null };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8'), context);
  if (payload !== undefined) vm.runInContext(fs.readFileSync(path.join(jsDir, 'snapshot.js'), 'utf8'), context);
  return { context, counters, store: context.U.store };
}

test('model serialization preserves analytical schema and exact DAX while excluding source secrets and unknown fields', () => {
  const original = model(), result = Snapshots.modelData(original);
  assert.equal(result.tables.length, original.tables.length);
  assert.equal(result.relationships.length, original.relationships.length);
  assert.equal(result.tables[0].measures[0].dax, original.tables[0].measures[0].dax);
  assert.deepEqual(result.tables[0].source, { kind: 'db', schema: 'finance', table: 'fact_sales', via: 'Shared query' });
  assert.deepEqual(result.tables[1].source, { kind: 'web' });
  assert.equal(result.tables[0].columns[0].hidden, true);
  assert.equal(result.tables[0].measures[0].h, true);
  assert.equal(result.relationships[0].both, true);
  assert.equal(result.relationships[0].inactive, true);
  assert.doesNotMatch(JSON.stringify(result), /secret-/);
  result.tables[0].columns[0].name = 'Changed';
  assert.equal(original.tables[0].columns[0].name, 'Amount');
});

test('blank workspace exports every table and measure, independent of visible membership and search', () => {
  const app = appFixture(), result = Snapshots.capture(app);
  assert.deepEqual(result.workspace.tableView.tables, []);
  assert.equal(result.model.tables.length, 2);
  assert.equal(result.model.tables[0].measures[0].dax, app.model.tables[0].measures[0].dax);
  assert.equal(result.workspace.explorer.query, 'Calendar');
  assert.deepEqual(result.workspace.tableView.view, { x: -15, y: 22, k: .7 });
  assert.equal(result.workspace.presets[0].name, 'Manager view');
  assert.deepEqual(result.usage.measures.Total, [{ p: 'Overview', v: 'Card', f: 'measure' }]);
  assert.doesNotMatch(JSON.stringify(result), /secret-/);
  app.canvas.pos.Calendar.x = 999;
  assert.equal(result.workspace.tableView.pos.Calendar.x, 240);
});

test('HTML embeds hostile DAX and Unicode losslessly without creating executable data scripts', () => {
  const bundle = assets(), payload = Snapshots.capture(appFixture());
  const html = Snapshots.buildHTML(bundle.template, bundle.sources, payload);
  assert.deepEqual(embedded(html, 'smv-snapshot-data'), payload);
  assert.equal(embedded(html, 'smv-snapshot-template'), bundle.template);
  const allScripts = scripts(html);
  const assetScripts = allScripts.filter(script => script.attrs.includes('data-smv-asset='));
  assert.equal(allScripts.length, assetScripts.length + 2, 'Model text must not create additional script elements');
  for (const script of assetScripts) assert.doesNotThrow(() => new vm.Script(script.text), 'Bundled JavaScript must still parse');
  const data = allScripts.find(script => script.attrs.includes('id="smv-snapshot-data"')).text;
  assert.doesNotMatch(data, /[<\u2028\u2029]/);
  assert.match(html, /<title>Model &lt;\/ScRiPt&gt;/);
});

test('dollar replacement sequences remain literal in names, DAX, and the saved template', () => {
  const bundle = assets(), payload = Snapshots.capture(appFixture());
  const dollars = "$& $` $' $$";
  payload.name = 'Dollar ' + dollars;
  payload.model.name = payload.name;
  payload.model.tables[0].measures[0].dax = 'RETURN "' + dollars + '"';
  const template = bundle.template.replace('<body>', () => '<!-- Literal ' + dollars + ' -->\n<body>');
  const html = Snapshots.buildHTML(template, bundle.sources, payload);
  assert.deepEqual(embedded(html, 'smv-snapshot-data'), payload);
  assert.equal(embedded(html, 'smv-snapshot-template'), template);
  assert.equal(html.match(/<title>([\s\S]*?)<\/title>/i)[1],
    'Dollar $&amp; $` $&#39; $$ — interactive snapshot');
  const allScripts = scripts(html);
  assert.equal(allScripts.length, allScripts.filter(script => script.attrs.includes('data-smv-asset=')).length + 2);
});

test('HTML is self-contained and denies network requests through its content security policy', () => {
  const bundle = assets(), html = Snapshots.buildHTML(bundle.template, bundle.sources, Snapshots.capture(appFixture()));
  // Only markup triggers resource loads; bundled runtime contains literal HTML patterns.
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, '$1</script>');
  assert.doesNotMatch(markup, /<link\b/i);
  assert.doesNotMatch(markup, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(markup, /<(?:img|iframe|audio|video|source)\b[^>]*\bsrc\s*=\s*["'](?:https?:|\.\/)/i);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src 'none'/);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*default-src 'none'/);
  assert.ok(html.indexOf('smv-snapshot-data') < html.indexOf('data-smv-asset="js/util.js"'));
  assert.ok(html.indexOf('data-smv-asset="js/snapshot.js"') < html.indexOf('data-smv-asset="js/app.js"'));
});

test('an exported snapshot can package its inline assets again without fetch or local asset paths', async () => {
  const bundle = assets(), payload = Snapshots.capture(appFixture());
  const first = Snapshots.buildHTML(bundle.template, bundle.sources, payload);
  let fetches = 0;
  const context = { fetch: () => { fetches++; throw new Error('An offline snapshot must not fetch'); } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'snapshot.js'), 'utf8'), context);
  const repack = await context.Snapshots.loadAssets(inlineDocument(first));
  assert.equal(fetches, 0);
  assert.equal(repack.template, bundle.template);
  assert.equal(Object.keys(repack.sources).length, Object.keys(bundle.sources).length);
  const second = context.Snapshots.buildHTML(repack.template, repack.sources, payload);
  assert.deepEqual(embedded(second, 'smv-snapshot-data'), payload);
  for (const script of scripts(second).filter(script => script.attrs.includes('data-smv-asset='))) assert.doesNotThrow(() => new vm.Script(script.text));
});

test('unsupported versions and malformed embedded model data are rejected explicitly', () => {
  const valid = Snapshots.capture(appFixture());
  const mutations = [
    value => { value.version = 100; }, value => { value.format = 'other'; },
    value => { value.createdAt = 'not-a-date'; }, value => { value.model.tables = {}; },
    value => { value.model.tables[0].columns = null; }, value => { value.model.tables[0].columns[0].name = 12; },
    value => { delete value.model.tables[0].measures[0].dax; }, value => { value.model.relationships[0].from = null; },
  ];
  assert.throws(() => Snapshots.validate(null), /snapshot format/i);
  for (const mutate of mutations) { const value = plain(valid); mutate(value); assert.throws(() => Snapshots.validate(value), /snapshot/i); }
});

test('missing runtime assets abort export rather than creating an incomplete HTML file', () => {
  const bundle = assets(); delete bundle.sources['js/canvas.js'];
  assert.throws(() => Snapshots.buildHTML(bundle.template, bundle.sources, Snapshots.capture(appFixture())), /Missing viewer script/);
});

test('memory storage never touches native storage and replaces all preferences between snapshots', () => {
  const { store, counters } = memoryRuntime();
  const first = Snapshots.seedStorage(Snapshots.capture(appFixture()));
  store.useMemory(first);
  assert.deepEqual(plain(store.getJSON('smv_workspace_v1_snapshot')), { tables: [] });
  assert.equal(store.getJSON('smv_presets_snapshot')[0].name, 'Manager view');
  assert.equal(store.get('smv-mvw'), '320');
  assert.equal(store.get('unseeded', 'fallback'), 'fallback');
  store.set('smv-detail', 'names'); store.setJSON('custom', { setting: true });
  assert.equal(store.get('smv-detail'), 'names');
  assert.deepEqual(plain(store.getJSON('custom')), { setting: true });
  store.del('smv-lines'); assert.equal(store.get('smv-lines', 'none'), 'none');
  store.useMemory({ 'smv-detail': 'cards' });
  assert.equal(store.get('smv-detail'), 'cards');
  assert.deepEqual(plain(store.getJSON('smv_presets_snapshot', [])), []);
  assert.equal(store.get('custom', null), null);
  assert.deepEqual(counters, { reads: 0, writes: 0, deletes: 0 });
});

test('embedded payload switches to memory before application constructors read preferences', () => {
  const payload = Snapshots.capture(appFixture()), { context, counters, store } = memoryRuntime(payload);
  assert.equal(context.Snapshots.error, null);
  assert.equal(context.Snapshots.embedded.model.tables.length, 2);
  assert.equal(store.get('smv-detail'), 'cards');
  assert.equal(store.get('smv-mvw'), '320');
  store.set('app-constructor-preference', 'value'); store.del('smv-detail');
  assert.deepEqual(counters, { reads: 0, writes: 0, deletes: 0 });
});

test('invalid embedded payload remains isolated instead of falling back to recipient storage', () => {
  const { context, counters, store } = memoryRuntime({ format: 'semantic-model-viewer', version: 999 });
  assert.ok(context.Snapshots.error);
  assert.equal(context.Snapshots.embedded, null);
  assert.equal(store.get('smv_current_v1', 'none'), 'none');
  store.setJSON('failure-ui-state', { shown: true }); store.del('smv_repo_cache');
  assert.deepEqual(counters, { reads: 0, writes: 0, deletes: 0 });
});
