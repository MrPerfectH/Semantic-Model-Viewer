/* viewer/js/usage-adapter.js: Semantic Model Cleaner JSON -> viewer usage data. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('../Models/tools/viewer/js/usage-adapter.js');
const UA = globalThis.UsageAdapter;

const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'cleaner-analysis.json'), 'utf8'));

assert.strictEqual(UA.isCleanerOutput(j), true);
assert.strictEqual(UA.isCleanerOutput({ tables: [], relationships: [] }), false, 'a viewer model is not an analysis');
assert.strictEqual(UA.isCleanerOutput({ summary: {}, items: [{ name: 'x' }] }), false, 'items need a status');
assert.throws(() => UA.fromCleaner({ foo: 1 }), /Not a Semantic Model Cleaner JSON/);

const u = UA.fromCleaner(j);
assert.strictEqual(u.report, '2 reports');
assert.deepStrictEqual(u.reports, ['Sales Overview', 'Exec Summary']);
assert.deepStrictEqual(u.counts, { items: 10, unused: 2, broken: 1, warnings: 0, reportIssues: 1 });

/* per-page grouping with visual / filter split and report tag when several reports */
assert.deepStrictEqual(u.measures['Total Sales'], [
  { p: 'Overview', v: 2, f: 0, r: 'Sales Overview' },
  { p: 'Summary', v: 0, f: 1, r: 'Exec Summary' }
]);
assert.deepStrictEqual(u.measures['Sales per Product'], [{ p: 'Detail', v: 1, f: 1, r: 'Sales Overview' }]);
assert.strictEqual(u.measures['Sales YoY'], undefined, 'no pages for an unused measure');
assert.strictEqual(u.measures['Report Only Measure'], undefined, 'report-extension measures are skipped');
assert.strictEqual(u.status['Report Only Measure'], undefined);

/* status classification */
assert.strictEqual(u.status['Total Sales'].status, 'used');
assert.strictEqual(u.status['Sales YoY'].status, 'unused');
assert.strictEqual(u.status['Sales YoY'].risk, 'low');
assert.strictEqual(u.status['Broken Measure'].status, 'broken');
assert.strictEqual(u.status['Margin%'].status, 'indirect');
assert.strictEqual(u.status['Margin%'].raw, 'INDIRECT (via: Sales per Product)');
assert.strictEqual(u.status['Product Count'].status, 'used', 'USED (RLS: …) counts as used');

/* columns keyed by table|name */
assert.strictEqual(u.columns['Fact Sales|Margin'].status, 'unused');
assert.strictEqual(u.columns['Fact Sales|Amount'].status, 'used');
assert.strictEqual(u.columns['Dim Date|Date'].status, 'used');

/* single report: no r tag, report name used as-is */
const single = JSON.parse(JSON.stringify(j));
single.summary.reports = ['Sales Overview'];
const s1 = UA.fromCleaner(single);
assert.strictEqual(s1.report, 'Sales Overview');
assert.deepStrictEqual(s1.measures['Sales per Product'], [{ p: 'Detail', v: 1, f: 1 }]);

console.log('usage-adapter.test.js: ok');
