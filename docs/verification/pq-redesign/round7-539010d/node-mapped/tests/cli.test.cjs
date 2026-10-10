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
test('TMDL special characters remain data and source queries are excluded', t => {
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
  assert.doesNotMatch(JSON.stringify(data), /private-host|private-db|Sql.Database/);
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
