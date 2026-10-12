/* Run: node --test tests/demo-power-query.test.cjs
   The built-in sample (Models/tools/viewer/model-data.json) carries synthetic Power Query
   metadata so the hosted demo's Power Query tab works. It is built from the demo TMDL by
   tmdl_to_model_data.py + power_query_to_model_data.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const viewer = path.join(root, 'Models/tools/viewer');
const committed = JSON.parse(fs.readFileSync(path.join(viewer, 'model-data.json'), 'utf8'));

test('built-in sample carries the demo Power Query graph', () => {
  const nodes = committed.powerQuery.nodes;
  const names = cls => nodes.filter(n => n.kind === 'expression' && n.classification === cls).map(n => n.name).sort();
  assert.deepEqual(names('parameter'), ['Environment', 'ServerName', 'StartYear']);
  assert.deepEqual(names('function'), ['fnCleanText']);
  assert.deepEqual(names('query'), ['CleanCustomers', 'CleanProducts', 'CleanStores', 'RawCustomers', 'RawProducts', 'RawSales', 'RawStores', 'StageSales']);
  assert.equal(committed.powerQuery.warnings.length, 0);
  assert.equal(nodes.filter(n => n.kind === 'partition').length, committed.tables.length, 'one partition node per table');
});

test('only the four tables that read a shared query gain a `via`; the model shape is unchanged', () => {
  assert.equal(committed.tables.length, 43);
  assert.equal(committed.relationships.length, 68);
  const via = {};
  committed.tables.forEach(t => { if (t.source && t.source.via) via[t.name] = t.source.via; });
  assert.deepEqual(via, { Sales: 'StageSales', Customer: 'CleanCustomers', Product: 'CleanProducts', Store: 'CleanStores' });
  committed.tables.filter(t => via[t.name]).forEach(t => assert.ok(t.source.kind && t.source.table, t.name + ' keeps its own source kind/table'));
});

test('model-data.json is exactly what the committed scripts produce from the demo TMDL', { skip: spawnSync('python3', ['--version']).status !== 0 }, () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'smv-demo-')), 'model-data.json');
  const demo = path.join(root, 'Models/demo/Contoso Retail.SemanticModel');
  let r = spawnSync('python3', [path.join(viewer, 'scripts/tmdl_to_model_data.py'), demo, '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  r = spawnSync(process.execPath, [path.join(viewer, 'scripts/power_query_to_model_data.js'), demo, out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  // The generator lists table files in directory order, which differs between file systems.
  const canon = file => {
    const model = JSON.parse(fs.readFileSync(file, 'utf8'));
    model.tables.sort((a, b) => a.name.localeCompare(b.name));
    model.powerQuery.nodes.sort((a, b) => a.id.localeCompare(b.id));
    return model;
  };
  assert.deepEqual(canon(out), canon(path.join(viewer, 'model-data.json')));
});
