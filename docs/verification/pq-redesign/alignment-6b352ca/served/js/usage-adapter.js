/* Semantic Model Cleaner JSON -> viewer usage data.
   The viewer shows nothing about report usage on its own; the only accepted source is the
   JSON produced by `semantic-model-cleaner --format json` (https://github.com/MrPerfectH/Semantic-Model-Cleaner).
   Exposes global UsageAdapter. */
(function (g) {
  'use strict';

  var FILTER_CONTEXTS = { 'Filter': 1, 'Filters pane (visual)': 1 };

  /* Recognise the cleaner's JSON output by shape, not by file name. */
  function isCleanerOutput(j) {
    return !!(j && typeof j === 'object' && j.summary && Array.isArray(j.items) &&
      j.items.every(function (it) { return it && typeof it.status === 'string' && typeof it.name === 'string'; }));
  }

  /* "USED", "USED (RLS: …)", "INDIRECT (via: …)", "BROKEN …", "NOT USED" -> used | indirect | unused | broken */
  function classify(status) {
    var s = String(status || '').toUpperCase();
    if (s === 'NOT USED') return 'unused';
    if (s.indexOf('BROKEN') === 0) return 'broken';
    if (s.indexOf('INDIRECT') === 0) return 'indirect';
    return 'used';
  }

  /* Group an item's usages by (report, page) into the viewer's per-page entries
     [{ p: page, v: visuals, f: filters, r: report }]. */
  function pages(usages, multiReport) {
    var byKey = Object.create(null), order = [];
    (usages || []).forEach(function (u) {
      var page = u.page || '(report level)', rep = u.report || '';
      var k = rep + '\u0000' + page;
      if (!byKey[k]) { byKey[k] = { p: page, v: 0, f: 0 }; if (multiReport && rep) byKey[k].r = rep; order.push(k); }
      if (FILTER_CONTEXTS[u.context]) byKey[k].f++; else byKey[k].v++;
    });
    return order.map(function (k) { return byKey[k]; });
  }

  function fromCleaner(j) {
    if (!isCleanerOutput(j)) throw new Error('Not a Semantic Model Cleaner JSON export (expected "summary" and "items" with a status per item).');
    var reports = (j.summary && j.summary.reports) || [];
    var multi = reports.length > 1;
    var measures = Object.create(null), status = Object.create(null), columns = Object.create(null);
    j.items.forEach(function (it) {
      var cls = classify(it.status);
      var rec = { status: cls, raw: it.status, risk: it.removalRisk || null };
      if (it.type === 'Measure') {
        if (it.sourceKind && it.sourceKind !== 'model') return; // report-extension measures are not in the model
        status[it.name] = rec;
        var pg = pages(it.usages, multi);
        if (pg.length) measures[it.name] = pg;
      } else {
        columns[it.table + '|' + it.name] = rec;
      }
    });
    return {
      source: 'semantic-model-cleaner',
      report: multi ? (reports.length + ' reports') : (reports[0] || 'report'),
      reports: reports,
      models: (j.summary && j.summary.models) || [],
      counts: {
        items: j.items.length,
        unused: (j.summary && j.summary.not_used) || 0,
        broken: (j.summary && j.summary.broken) || 0,
        warnings: (j.warnings || []).length,
        reportIssues: (j.reportIssues || []).length
      },
      measures: measures,
      status: status,
      columns: columns
    };
  }

  g.UsageAdapter = { isCleanerOutput: isCleanerOutput, classify: classify, fromCleaner: fromCleaner };
})(typeof window !== 'undefined' ? window : globalThis);
