'use strict';
// Expectations consume observations; they never manufacture production observations.
const assert = require('node:assert/strict');
const sorted = xs => xs.map(x => JSON.stringify(x)).sort();
const BASELINE = 'f45f69605b8620d39495d96b8d04a7ed4cdf70ae';
function candidateSha(sha) {
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'Exact integration SHA is required');
  assert.notEqual(sha, BASELINE, 'Rejected baseline cannot receive a redesigned verdict');
}
function graphOracle(graph, expected) {
  assert.ok(Array.isArray(graph.nodes) && Array.isArray(graph.edges), 'Complete graph registry required');
  assert.equal(new Set(graph.nodes.map(n => n.id)).size, graph.nodes.length, 'UI IDs must be unique even when metadata IDs collide');
  assert.deepEqual(sorted(graph.nodes.filter(n => n.metadataId !== null).map(n => n.metadataId)), sorted(expected.metadataIds), 'No metadata record dropped, merged or invented');
  const status = graph.nodes.filter(n => n.metadataId === null);
  assert.deepEqual(sorted(status.map(n => n.table)), sorted(expected.statusTables), 'Status-only tables must remain represented');
  for (const node of status) assert.equal(node.kind, 'table-status');
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const edges = graph.edges.map(e => {
    assert.ok(byId.has(e.inputId) && byId.has(e.consumerId), 'Every edge endpoint exists');
    assert.notEqual(byId.get(e.inputId).metadataId, null, 'Status node cannot be an M input');
    assert.notEqual(byId.get(e.consumerId).metadataId, null, 'Status node cannot be an M consumer');
    return {inputId: byId.get(e.inputId).metadataId, consumerId: byId.get(e.consumerId).metadataId};
  });
  assert.deepEqual(sorted(edges), sorted(expected.edges), 'Exact inputs→results; no guessed/reversed/extra edges');
  assert.equal(new Set(graph.edges.map(e => e.id)).size, graph.edges.length, 'Stable edge identity must be unique');
  for (const [id, state] of Object.entries(expected.states || {})) assert.equal(graph.nodes.find(n => n.metadataId === id)?.state, state);
}
function occurrenceOracle(actual, expected, source) {
  assert.ok(Array.isArray(actual), 'Resolved occurrence array is mandatory');
  const projection = actual.map(r => {
    assert.ok(Number.isInteger(r.at) && Number.isInteger(r.end) && r.at >= 0 && r.at < r.end && r.end <= source.length, 'Valid UTF-16 end-exclusive span');
    return {id: r.id, name: r.name, at: r.at, end: r.end, text: source.slice(r.at, r.end)};
  });
  assert.deepEqual(sorted(projection), sorted(expected), 'Every resolved occurrence, exact spelling, no local/string/comment links');
}
function navigationOracle(before, after, restored) {
  assert.equal(after.selectedId, before.linkTargetId);
  assert.equal(after.inspectorId, before.linkTargetId);
  assert.equal(after.targetVisible, true);
  assert.equal(after.readableZoom, true);
  assert.deepEqual(restored, {selectedId: before.selectedId, viewport: before.viewport, codeScroll: before.codeScroll});
}
function keyboardOracle(observed) {
  for (const name of ['pan', 'zoom', 'fit', 'search', 'lastResult', 'select', 'linkEnter', 'escapeFocusReturn', 'back', 'noStolenInputKeys', 'visibleFocus', 'tabExit']) {
    assert.equal(observed[name], true, 'Keyboard/mouse evidence required: ' + name);
  }
  for (const width of [1280, 1440]) for (const zoomPercent of [100, 200]) {
    const row = observed.layouts?.find(r => r.width === width && r.zoomPercent === zoomPercent);
    assert.ok(row, 'Missing layout capture: ' + width + ' at ' + zoomPercent + '%');
    assert.equal(row.labelsAndControlsAccessible, true);
    assert.equal(row.canvasVisible, true);
    assert.equal(row.libraryReachable, true);
    assert.ok(row.codeFontCssPx >= 12, 'Code must meet 12–13px minimum contract');
  }
}
function progressOracle(observed, total, lastId) {
  assert.equal(observed.inventoryCount, total);
  assert.equal(observed.minimapCount, total);
  assert.equal(observed.initialOverviewAllComponents, true);
  assert.equal(observed.lastSelectedId, lastId);
  assert.equal(observed.lastVisibleAtReadableZoom, true);
  assert.equal(observed.mandatoryExpandToDiscover, false);
  assert.ok(observed.progress.length, 'Progress evidence required, including synchronous completion');
  let prior = -1;
  for (const p of observed.progress) {
    assert.equal(p.total, total); assert.ok(p.analyzed >= prior && p.analyzed <= total); prior = p.analyzed;
    if (p.analyzed < total) { assert.equal(p.partialEdgesLabeled, true); assert.equal(p.unanalyzedClaimedIndependent, false); }
  }
  assert.equal(prior, total);
  for (const k of ['entryMs', 'fitMs', 'searchMs']) assert.ok(Number.isFinite(observed[k]) && observed[k] >= 0, 'Record measured ' + k);
}
function resetOracle(observed) {
  for (const k of ['oldCodeInDom', 'oldHistoryEntries', 'oldCacheEntries', 'oldLabels', 'oldAsyncPaints']) assert.equal(observed[k], 0, 'Reset leaked ' + k);
  for (const k of ['sameIdsNewMetadataReset', 'newModelSameMetadataReset', 'pendingWorkCancelled', 'tablesStatePreserved', 'unavailableExplanation']) assert.equal(observed[k], true, 'Reset proof missing: ' + k);
}
function privacyOracle(observed, forbidden) {
  assert.equal(typeof observed.snapshotText, 'string');
  for (const token of forbidden) assert.equal(observed.snapshotText.includes(token), false, 'Default sharing leaked ' + token);
  assert.equal(observed.rawCopy, observed.rawSource, 'Copy M must preserve CRLF/trailing bytes');
  assert.ok(Array.isArray(observed.requests), 'Complete capture window required');
  assert.equal(observed.requests.filter(r => r.sourceRequest).length, 0, 'No source requests');
  for (const k of ['mEvaluations', 'credentialReads', 'sourceWrites', 'xssExecutions']) assert.equal(observed[k], 0);
  assert.equal(observed.captureStartedBeforeImport, true);
}
module.exports = {BASELINE, candidateSha, graphOracle, occurrenceOracle, navigationOracle, keyboardOracle, progressOracle, resetOracle, privacyOracle};
