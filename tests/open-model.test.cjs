'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
// Production checks the cached upstream ref; fixtures must not depend on the
// developer's branch topology (for example a main-only hotfix during a PR).
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-renderer-fixture-'));
after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
const viewerRoot = path.join(fixtureDir, 'viewer');
for (const args of [
  // This checkout includes archived verification files with deeply nested paths.
  // Set only the fixture's Git option; do not depend on global Windows settings.
  ['clone', '--config', 'core.longpaths=true', '--shared', '--quiet', root, viewerRoot],
  ['-C', viewerRoot, 'update-ref', 'refs/remotes/origin/main', 'HEAD']
]) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('fresh launches reread relationship columns and reject broken metadata without opening stale output', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-launch-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const model = path.join(dir, 'Sales model');
  fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.tmdl'), 'model Model');
  fs.writeFileSync(path.join(model, 'Sales.tmdl'), 'table Sales\n\tcolumn Key\n\t\tdataType: int64\n\tcolumn Other\n\t\tdataType: int64');
  fs.writeFileSync(path.join(model, 'Date.tmdl'), 'table Date\n\tcolumn Key\n\t\tdataType: int64');
  const relationship = path.join(model, 'relationships.tmdl');
  const writeRel = column => fs.writeFileSync(relationship, 'relationship a\n\tfromColumn: Sales.' + column + '\n\ttoColumn: Date.Key');
  const launch = () => spawnSync(process.execPath, [path.join(root, 'scripts/open-model.cjs'), model, '--viewer-root', viewerRoot, '--no-open', '--output-dir', path.join(dir, 'output with spaces')], { encoding: 'utf8' });
  writeRel('Key');
  const first = launch();
  assert.equal(first.status, 0, first.stderr);
  const a = JSON.parse(first.stdout);
  writeRel('Other');
  const second = launch();
  assert.equal(second.status, 0, second.stderr);
  const b = JSON.parse(second.stdout);
  assert.notEqual(a.html, b.html);
  assert.notEqual(a.htmlSha256, b.htmlSha256);
  assert.equal(b.relationships, 1);
  const payload = JSON.parse(fs.readFileSync(b.html, 'utf8').match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(payload.model.relationships[0].fromCol, 'Other');
  assert.equal(payload.model.relationships[0].toCol, 'Key');
  writeRel('Missing');
  const bad = launch();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Relationship/);
  assert.equal(fs.existsSync(b.html), true);
});
test('known outdated renderer fails before generation', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-old-renderer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin/smv.cjs'), 'throw new Error("must not run")');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'old');
  const old = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'new'), 'new');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'new');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--detach', old);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/open-model.cjs'), dir, '--viewer-root', dir, '--no-open'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /behind known origin\/main/);
  assert.doesNotMatch(result.stderr, /must not run/);
});
const snapshotPattern = /<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/;
function writeReportFixture(dir, { binding = '../Sales model.SemanticModel', pageName = 'Overview' } = {}) {
  const model = path.join(dir, 'Sales model');
  fs.mkdirSync(model);
  fs.writeFileSync(path.join(model, 'model.tmdl'), 'model Model');
  fs.writeFileSync(path.join(model, 'Sales.tmdl'), "table Sales\n\tcolumn Key\n\t\tdataType: int64\n\tmeasure 'Net Sales' = SUM(Sales[Key])");
  const report = path.join(dir, 'Sales.Report');
  const page = path.join(report, 'definition', 'pages', 'page1');
  const visual = path.join(page, 'visuals', 'visual1');
  fs.mkdirSync(visual, { recursive: true });
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  write(path.join(report, 'definition.pbir'), { version: '4.0', datasetReference: { byPath: { path: binding } } });
  write(path.join(report, 'definition', 'pages', 'pages.json'), { pageOrder: ['page1'] });
  const measureFilter = property => ({ field: { Measure: { Expression: { SourceRef: { Entity: 'Sales' } }, Property: property } } });
  write(path.join(page, 'page.json'), { displayName: pageName, filterConfig: { filters: [measureFilter('Missing Measure')] } });
  write(path.join(visual, 'visual.json'), {
    visual: { query: { queryState: { Values: { projections: [{ queryRef: 'Sales.Net Sales' }] } } } },
    filterConfig: { filters: [measureFilter('Net Sales')] }
  });
  return { model, report };
}
const launchWithReport = (model, report, output) => spawnSync(process.execPath,
  [path.join(root, 'scripts/open-model.cjs'), model, '--viewer-root', viewerRoot, '--report', report, '--no-open', '--output-dir', output], { encoding: 'utf8' });
test('--report embeds fresh measure usage and keeps the report-health sidecar', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-report-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { model, report } = writeReportFixture(dir);
  const result = launchWithReport(model, report, path.join(dir, 'output'));
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.report, fs.realpathSync(report));
  const payload = JSON.parse(fs.readFileSync(receipt.html, 'utf8').match(snapshotPattern)[1]);
  assert.deepEqual(payload.usage.measures['Net Sales'], [{ p: 'Overview', v: 1, f: 1 }]);
  assert.equal(payload.usage.meta.report, 'Sales');
  assert.equal(payload.usage.meta.pageCount, 1);
  assert.match(payload.usage.meta.scanned, /^\d{4}-\d{2}-\d{2}$/);
  const health = JSON.parse(fs.readFileSync(path.join(path.dirname(receipt.html), 'report-health.json'), 'utf8'));
  assert.deepEqual(health.reports, ['Sales']);
  assert.deepEqual(health.brokenReferences, ['Missing Measure']);
});
test('--report bound to another model fails without a receipt or opened output', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-report-mismatch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { model, report } = writeReportFixture(dir, { binding: '../Other.SemanticModel' });
  const output = path.join(dir, 'output');
  const result = launchWithReport(model, report, output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is bound to/);
  assert.equal(result.stdout, '');
  const launches = fs.readdirSync(output);
  assert.equal(launches.length, 1);
  assert.equal(fs.existsSync(path.join(output, launches[0], 'launch.json')), false);
});
test('--report text containing a closing script tag stays JSON data', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-report-script-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pageName = '</script><script>globalThis.smvInjected=1</script>';
  const { model, report } = writeReportFixture(dir, { pageName });
  const result = launchWithReport(model, report, path.join(dir, 'output'));
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(JSON.parse(result.stdout).html, 'utf8');
  const match = html.match(snapshotPattern);
  assert.equal(JSON.parse(match[1]).usage.measures['Net Sales'][0].p, pageName);
  assert.doesNotMatch(match[1], /</);
  assert.doesNotMatch(html.replace(match[0], ''), /smvInjected/);
});
