'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('../js/relationships.js');

function model(names, relationships) {
  return { tables: names.map(name => ({ name })), relationships };
}
// Arguments are ordinary filter flow, deliberately opposite to TOM from/to.
function rel(source, target, options) {
  return Object.assign({ from: target, to: source, fromCard: 'many', toCard: 'one', both: false, inactive: false }, options);
}
function names(result) { return [...result.names].sort(); }
const chain = model(['Category', 'Product', 'Sales'], [rel('Category', 'Product'), rel('Product', 'Sales')]);

test('incoming and outgoing preserve TOM direction and direct/transitive distances', () => {
  assert.deepEqual(names(graph.traverse(chain, ['Sales'], { direction: 'incoming', maxDepth: 1 })), ['Product', 'Sales']);
  const incoming = graph.traverse(chain, ['Sales'], { direction: 'incoming' });
  assert.equal(incoming.distances.get('Category'), 2);
  assert.deepEqual(names(graph.traverse(chain, ['Category'], { direction: 'outgoing' })), ['Category', 'Product', 'Sales']);
  assert.deepEqual(names(graph.traverse(chain, ['Category'], { direction: 'incoming' })), ['Category']);
  assert.deepEqual(names(graph.traverse(chain, ['Sales'], { direction: 'outgoing' })), ['Sales']);
});

test('a common fact table does not make one dimension filter another', () => {
  const fork = model(['Product', 'Sales', 'Date'], [rel('Product', 'Sales'), rel('Date', 'Sales')]);
  assert.deepEqual(names(graph.traverse(fork, 'Product', { direction: 'outgoing' })), ['Product', 'Sales']);
  const connected = graph.traverse(fork, 'Product');
  assert.deepEqual(names(connected), ['Date', 'Product', 'Sales']);
  assert.equal(connected.distances.get('Date'), 2);
});

test('bidirectional relationships add the reverse filter arc only on that edge', () => {
  const bridge = model(['Bridge', 'Customer', 'Sales'], [rel('Bridge', 'Customer', { both: true }), rel('Customer', 'Sales')]);
  assert.deepEqual(names(graph.traverse(bridge, 'Customer', { direction: 'incoming' })), ['Bridge', 'Customer']);
  assert.deepEqual(names(graph.traverse(bridge, 'Customer', { direction: 'outgoing' })), ['Bridge', 'Customer', 'Sales']);
  assert.deepEqual(names(graph.traverse(bridge, 'Sales', { direction: 'outgoing' })), ['Sales']);
});

test('inactive relationships are opt-in for every traversal direction', () => {
  const dates = model(['ShipDate', 'Sales'], [rel('ShipDate', 'Sales', { inactive: true })]);
  for (const direction of ['incoming', 'outgoing', 'connected']) {
    const root = direction === 'incoming' ? 'Sales' : 'ShipDate';
    assert.deepEqual(names(graph.traverse(dates, root, { direction })), [root]);
    assert.deepEqual(names(graph.traverse(dates, root, { direction, includeInactive: true })), ['Sales', 'ShipDate']);
  }
});

test('single-direction many-to-many is still to -> from', () => {
  const many = model(['A', 'B'], [rel('A', 'B', { fromCard: 'many', toCard: 'many' })]);
  many.tables[0].role = 'fact'; many.tables[1].role = 'dimension';
  assert.deepEqual(names(graph.traverse(many, 'A', { direction: 'outgoing' })), ['A', 'B']);
  assert.deepEqual(names(graph.traverse(many, 'B', { direction: 'outgoing' })), ['B']);
});

test('cycles and parallel relationships terminate with unique shortest distances', () => {
  const cycle = model(['A', 'B', 'C', 'D'], [rel('A', 'B'), rel('B', 'C'), rel('C', 'A'), rel('A', 'D'), rel('D', 'C'), rel('A', 'B')]);
  const result = graph.traverse(cycle, 'A', { direction: 'outgoing' });
  assert.deepEqual(names(result), ['A', 'B', 'C', 'D']);
  assert.equal(result.distances.get('A'), 0);
  assert.equal(result.distances.get('C'), 2);
  assert.equal(result.predecessors.size, 3);
});

test('disconnected, absent and dangling tables are safe', () => {
  const isolated = model(['A', 'B'], [rel('A', 'Missing')]);
  assert.deepEqual(names(graph.traverse(isolated, 'A')), ['A']);
  assert.deepEqual(names(graph.traverse(isolated, 'Missing')), []);
  assert.deepEqual(names(graph.traverse(isolated, [])), []);
  assert.deepEqual(names(graph.traverse(null, 'A')), []);
});

test('multiple roots keep zero distance and find the nearest root', () => {
  const result = graph.traverse(chain, new Set(['Category', 'Product']), { direction: 'outgoing' });
  assert.equal(result.distances.get('Category'), 0);
  assert.equal(result.distances.get('Product'), 0);
  assert.equal(result.distances.get('Sales'), 1);
  assert.equal(result.predecessors.has('Product'), false);
});

test('zero depth returns roots and rejects invalid depth or direction', () => {
  assert.deepEqual(names(graph.traverse(chain, ['Product', 'Product'], { maxDepth: 0 })), ['Product']);
  for (const maxDepth of [-1, 1.5, NaN]) assert.throws(() => graph.traverse(chain, [], { maxDepth }), RangeError);
  assert.throws(() => graph.traverse(chain, [], { direction: 'sideways' }), RangeError);
});

test('prototype names, Unicode and apostrophes are ordinary identifiers', () => {
  const unusual = model(['__proto__', 'constructor', "O'Brien", 'Łódź'], [rel('__proto__', 'constructor'), rel('constructor', "O'Brien"), rel("O'Brien", 'Łódź')]);
  const result = graph.traverse(unusual, '__proto__', { direction: 'outgoing' });
  assert.equal(result.names.size, 4);
  assert.equal(result.distances.get('Łódź'), 3);
});

test('path evidence references original edges without mutating model data', () => {
  const before = JSON.stringify(chain);
  const result = graph.traverse(chain, 'Sales', { direction: 'incoming' });
  const path = graph.pathTo(result, 'Category');
  assert.deepEqual(path.map(step => [step.from, step.to]), [['Sales', 'Product'], ['Product', 'Category']]);
  assert.equal(path[0].relationship, chain.relationships[1]);
  assert.deepEqual(graph.pathTo(result, 'Sales'), []);
  assert.equal(graph.pathTo(result, 'Missing'), null);
  assert.equal(JSON.stringify(chain), before);
});

test('raw crossFilteringBehavior is honored and automatic direction stays unresolved', () => {
  const automatic = rel('A', 'B', { crossFilteringBehavior: 'automatic' });
  const raw = model(['A', 'B', 'C'], [automatic, rel('B', 'C', { crossFilteringBehavior: 'bothDirections' })]);
  const outgoing = graph.traverse(raw, 'A', { direction: 'outgoing' });
  assert.deepEqual(names(outgoing), ['A']);
  assert.deepEqual(outgoing.unresolved, [automatic]);
  assert.deepEqual(names(graph.traverse(raw, 'C', { direction: 'outgoing' })), ['B', 'C']);
  assert.deepEqual(names(graph.traverse(raw, 'A', { direction: 'connected' })), ['A', 'B', 'C']);
});
