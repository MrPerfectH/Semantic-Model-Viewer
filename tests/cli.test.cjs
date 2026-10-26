'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin/smv.cjs');
const demo = path.join(root, 'Models/demo/Contoso Retail.SemanticModel');
function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-cli-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function run(directory, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: directory, encoding: 'utf8', timeout: 10000 });
}
function successful(result) { assert.equal(result.status, 0, result.stderr || String(result.error)); }
function payload(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}
test('snapshot command works outside the repo and keeps the whole model behind a focused canvas', t => {
  const dir = workspace(t), output = path.join(dir, 'nested/review.html');
  successful(run(dir, 'snapshot', demo, '--tables', 'sales,Customer,Date', '--out', output));
  const data = payload(output), html = fs.readFileSync(output, 'utf8');
  assert.equal(data.model.tables.length, 43);
  assert.equal(data.model.relationships.length, 68);
  assert.equal(data.model.tables.flatMap(t => t.measures).length, 88);
  assert.deepEqual(data.workspace.tableView.tables, ['Sales', 'Customer', 'Date']);
  assert.equal(data.workspace.tableView.autoFit, true);
  assert.equal(data.workspace.viewMode, 'graph');
  for (const p of Object.values(data.workspace.tableView.pos)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), /<link\b/i);
  assert.match(html, /connect-src 'none'/);
  assert.ok(data.model.tables.some(t => t.name === 'Product'), 'Off-canvas metadata is retained');
});
test('measure snapshots preserve DAX, select the measure and fit its graph', t => {
  const dir = workspace(t), output = path.join(dir, 'review.html');
  successful(run(dir, 'snapshot', demo, '--measure', 'sales ly', '-o', output));
  const data = payload(output);
  assert.equal(data.workspace.viewMode, 'measures');
  assert.equal(data.measures.selectedMeasure, 'Sales LY');
  assert.equal(data.measures.graph.autoFit, true);
  assert.match(data.model.tables.flatMap(t => t.measures).find(m => m.name === 'Sales LY').dax, /SAMEPERIODLASTYEAR/);
});
test('TMDL special characters remain data and exact M is included', t => {
  const dir = workspace(t), model = path.join(dir, 'Sample.SemanticModel'), output = path.join(dir, 'review.html');
  fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.tmdl'), 'model Model');
  const name = 'Revenue </script> & <script>alert(1)</script>';
  const dax = '"literal </script> & $&"';
  const source = "table 'Sales, Europe'\n\tmeasure '" + name + "' = " + dax + "\n\tcolumn 'A&B'\n\t\tdataType: int64\n\tpartition p = m\n\t\tmode: import\n\t\tsource = Sql.Database(\"private-host\", \"private-db\")\n";
  const file = path.join(model, 'table.tmdl');
  fs.writeFileSync(file, source);
  successful(run(dir, 'snapshot', model, '--measure', name, '-o', output));
  const data = payload(output);
  assert.equal(data.measures.selectedMeasure, name);
  assert.equal(data.model.tables[0].measures[0].dax, dax);
  assert.equal(data.model.powerQuery.nodes[0].code, 'Sql.Database("private-host", "private-db")');
  assert.equal(data.model.tables[0].source.server, undefined);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
});
test('invalid input and removed commands fail without writing or overwriting files', t => {
  const dir = workspace(t), output = path.join(dir, 'out.html');
  for (const args of [
    ['snapshot', demo, '--tables', 'Missing', '-o', output],
    ['snapshot', demo, '--measure', 'Missing', '-o', output],
    ['snapshot', demo, '--tables', 'Sales', '--measure', 'Total Sales', '-o', output],
    ['snapshot', demo, '--tables', 'Sales,', '-o', output],
    ['snapshot', demo, '--table', '', '-o', output],
    ['snapshot', demo, '--width', '1000', '-o', output],
    ['snapshot', path.dirname(demo), '-o', output],
    ['snapshot', demo, '-o', path.join(dir, 'out.svg')],
    ['diagram', demo, '-o', output],
    ['diff', demo, demo, '-o', output]
  ]) {
    const result = run(dir, ...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /smv:/);
    assert.equal(fs.existsSync(output), false);
  }
  fs.writeFileSync(output, 'keep me');
  const result = run(dir, 'snapshot', demo, '-o', output);
  assert.equal(result.status, 1); assert.match(result.stderr, /--force/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'keep me');
  successful(run(dir, 'snapshot', path.join(demo, 'definition'), '-o', output, '--force'));
  assert.equal(payload(output).model.tables.length, 43);
});
test('TMDL relationship validation preserves parallel edges and rejects incomplete endpoints', t => {
  const dir = workspace(t), model = path.join(dir, 'model'), output = path.join(dir, 'out.html');
  fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.tmdl'), 'model Model');
  fs.writeFileSync(path.join(model, 'Sales.tmdl'), 'table Sales\n\tcolumn Key\n\t\tdataType: int64');
  fs.writeFileSync(path.join(model, 'Date.tmdl'), 'table Date\n\tcolumn Key\n\t\tdataType: int64');
  const rel = path.join(model, 'relationships.tmdl');
  fs.writeFileSync(rel, 'relationship a\n\tfromColumn: Sales.Key\n\ttoColumn: Date.Key\nrelationship b\n\tfromColumn: Sales.Key\n\ttoColumn: Date.Key\n\tisActive: false');
  successful(run(dir, 'snapshot', model, '-o', output));
  assert.equal(payload(output).model.relationships.length, 2);
  for (const text of ['relationship a\n\ttoColumn: Date.Key', 'relationship a\n\tfromColumn: Missing.Key\n\ttoColumn: Date.Key']) {
    fs.writeFileSync(rel, text);
    const result = run(dir, 'snapshot', model, '-o', output, '--force');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Relationship/);
    assert.equal(payload(output).model.relationships.length, 2);
  }
});

test('focused inspection and filter paths use metadata direction and DAX dependencies', t => {
  const dir = workspace(t), file = path.join(dir, 'Model with spaces.bim');
  const tables = ['IFLO', 'Child', 'Bridge', 'Inactive', 'Unknown', 'Measures'].map(name => ({ name, columns: [{ name: 'Key', dataType: 'int64' }], measures: [] }));
  tables[0].measures.push({ name: 'Home only', expression: '1' });
  tables[5].measures.push({ name: 'Direct', expression: 'SUM(IFLO[Key])' }, { name: 'Indirect', expression: '[Direct] + 1' }, { name: 'Unrelated', expression: 'COUNTROWS(Child)' });
  const edge = (name, fromTable, toTable, extra = {}) => ({ name, fromTable, toTable, fromColumn: 'Key', toColumn: 'Key', fromCardinality: 'many', toCardinality: 'one', ...extra });
  fs.writeFileSync(file, JSON.stringify({ name: 'Queries', model: { tables, relationships: [
    edge('normal', 'Child', 'IFLO'), edge('parallel', 'Child', 'IFLO'),
    edge('bridge', 'Bridge', 'Child', { toCardinality: 'many', crossFilteringBehavior: 'bothDirections' }),
    edge('inactive', 'Inactive', 'IFLO', { isActive: false }), edge('unknown', 'Unknown', 'IFLO', { crossFilteringBehavior: 'automatic' })
  ] } }));
  const inspect = run(dir, 'inspect', file, '--table', 'iflo'); successful(inspect);
  const focused = JSON.parse(inspect.stdout);
  assert.equal(focused.table.name, 'IFLO'); assert.equal(focused.tables, undefined);
  assert.deepEqual(focused.measuresUsingTable.map(m => [m.table, m.name, m.direct]), [['Measures', 'Direct', true], ['Measures', 'Indirect', false]]);
  assert.equal(focused.table.measures[0].name, 'Home only'); assert.equal(focused.relationships.length, 4);
  const filters = run(dir, 'filters-by', file, 'iflo'); successful(filters);
  const result = JSON.parse(filters.stdout);
  assert.deepEqual(result.tables.map(t => [t.name, t.distance]), [['Child', 1], ['Bridge', 2]]);
  assert.equal(result.tables[0].path[0].relationship.filterDirection, 'to -> from');
  assert.deepEqual(result.tables[0].path[0].relationship.filters, [{ from: 'IFLO', to: 'Child' }]);
  const bridge = result.tables[1].path[1].relationship;
  assert.equal(bridge.manyToMany, true); assert.equal(bridge.filterDirection, 'both'); assert.equal(bridge.filters.length, 2);
  assert.equal(result.relationships.filter(r => r.name === 'parallel').length, 1);
  assert.deepEqual(result.unresolved.map(r => r.name), ['unknown']);
  const direct = run(dir, 'filters-by', 'IFLO', '--model', file, '--direct', '--include-inactive'); successful(direct);
  assert.deepEqual(JSON.parse(direct.stdout).tables.map(t => t.name), ['Child', 'Inactive']);
  const incoming = run(dir, 'filters-by', file, 'IFLO', '--direction', 'incoming'); successful(incoming);
  assert.deepEqual(JSON.parse(incoming.stdout).tables, []);
  for (const args of [['inspect', file, '--table', 'Missing'], ['filters-by', file, 'Missing'], ['filters-by', file, 'IFLO', '--direction', 'sideways']]) assert.equal(run(dir, ...args).status, 1);
});
test('--where resolves the current executable without cache version assumptions', t => {
  const dir = workspace(t), result = run(dir, '--where'); successful(result);
  assert.equal(result.stdout.trim(), fs.realpathSync(cli));
});

test('TMDL filter paths retain unresolved directions and parallel edge evidence', t => {
  const dir = workspace(t), model = path.join(dir, 'TMDL'); fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.tmdl'), 'model Model');
  for (const name of ['Root', 'Child', 'Unknown']) fs.writeFileSync(path.join(model, name + '.tmdl'), 'table ' + name + '\n\tcolumn Key\n\t\tdataType: int64');
  fs.writeFileSync(path.join(model, 'relationships.tmdl'), 'relationship first\n\tfromColumn: Child.Key\n\ttoColumn: Root.Key\nrelationship parallel\n\tfromColumn: Child.Key\n\ttoColumn: Root.Key\nrelationship automatic\n\tfromColumn: Unknown.Key\n\ttoColumn: Root.Key\n\tcrossFilteringBehavior: automatic');
  const result = run(dir, 'filters-by', model, 'Root'); successful(result);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.tables.map(t => t.name), ['Child']);
  assert.equal(data.relationships.length, 3);
  assert.equal(data.unresolved[0].name, 'automatic');
});
