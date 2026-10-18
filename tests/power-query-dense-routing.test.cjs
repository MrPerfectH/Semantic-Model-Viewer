const {test} = require('node:test');
const assert = require('node:assert/strict');
const {harness, context, plain} = require('./power-query-ui-harness.cjs');
const fixture = require('./fixtures/power-query-dense-routing.json');

function setup() {
  const c = context(1, fixture.positions.length);
  c.graph.nodes.forEach((node, i) => { node.kind = fixture.kinds[i]; node.label = 'Node ' + i; });
  c.graph.edges = fixture.edges.map(([a, b], i) => ({
    id: 'edge-' + String(i).padStart(3, '0'), inputId: 'id-' + a, consumerId: 'id-' + b
  }));
  const h = harness('power-query-canvas.js'), events = [];
  const canvas = h.win.PowerQueryCanvas.mount(h.host, {context: c, onEdge: e => events.push(e)});
  canvas.restoreLayout(new Map(fixture.positions.map(([x, y], i) => ['id-' + i, {x, y}])));
  return {...h, c, canvas, events};
}

// Inspect the serialized Tables path, including rounded corners, so quantized
// SVG coordinates cannot silently turn separate internal lanes into one trunk.
function geometry(d) {
  const segments = [], samples = [];
  let at;
  for (const m of d.matchAll(/([MLQ])\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g)) {
    const p = [+m[2], +m[3]];
    if (m[1] === 'M') { at = p; samples.push(p); }
    else if (m[1] === 'L') {
      assert.ok(at[0] === p[0] || at[1] === p[1], 'orthogonal straight run');
      if (at[0] !== p[0] || at[1] !== p[1]) segments.push([at, p]);
      at = p; samples.push(p);
    } else {
      const end = [+m[4], +m[5]];
      for (let j = 1; j <= 16; j++) {
        const t = j / 16, u = 1 - t;
        samples.push([u*u*at[0] + 2*u*t*p[0] + t*t*end[0], u*u*at[1] + 2*u*t*p[1] + t*t*end[1]]);
      }
      at = end;
    }
  }
  return {segments, samples};
}
function overlaps([a, b], [c, d]) {
  const vertical = a[0] === b[0], axis = vertical ? 0 : 1, along = 1 - axis;
  return vertical === (c[0] === d[0]) && Math.abs(a[axis] - c[axis]) < .01 &&
    Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along])) -
    Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along])) > .1;
}
function cutsCard([a, b], [x, y]) {
  return a[0] === b[0] ?
    a[0] > x+.11 && a[0] < x+252-.11 && Math.max(a[1], b[1]) > y+.11 && Math.min(a[1], b[1]) < y+96-.11 :
    a[1] > y+.11 && a[1] < y+96-.11 && Math.max(a[0], b[0]) > x+.11 && Math.min(a[0], b[0]) < x+252-.11;
}

test('captured dense topology retains all 77 distinct, card-clear routes and exact edge interactions', t => {
  const s = setup(), graph = JSON.stringify(s.c.graph), layout = plain([...s.canvas.captureLayout()]);
  assert.equal(fixture.positions.length, 84);
  assert.equal(fixture.edges.length, 77);
  for (const k of [.36, .47, .85, 1]) {
    const start = performance.now();
    s.canvas.setViewport({x: 0, y: 0, k});
    const elapsedMs = performance.now() - start;
    const groups = s.host.querySelectorAll('.pqc-edge'), status = s.host.querySelector('.pqc-route-status');
    assert.equal(groups.length, 77);
    assert.equal(+status.dataset.unrouted, 0, status.textContent);
    assert.ok(+status.dataset.maxEdgeWork <= 50001, 'existing per-edge work bound');
    const paths = groups.map(group => group.querySelector('.pqc-edge-line').getAttribute('d'));
    assert.ok(paths.every(Boolean), 'all 77 visible edges have geometry');
    assert.equal(new Set(paths).size, 77, 'separate serialized paths');
    const routes = paths.map(geometry);
    for (let i = 0; i < routes.length; i++) {
      const group = groups[i], hit = group.querySelector('.pqc-edge-hit'), edge = s.c.graph.edges[i];
      assert.ok(['routed', 'crowded-ports'].includes(group.getAttribute('data-route-status')));
      assert.equal(hit.getAttribute('d'), paths[i]);
      assert.equal(hit.dataset.edgeId, edge.id);
      assert.equal(hit.getAttribute('role'), 'button');
      assert.equal(hit.getAttribute('tabindex'), '0');
      assert.equal(hit.getAttribute('aria-label'), 'Node ' + fixture.edges[i][0] + ' is referenced by Node ' + fixture.edges[i][1]);
      assert.equal(group.querySelectorAll('polyline').length, 1, 'one input-to-consumer arrow');
      hit.fire('click');
      assert.equal(s.events.at(-1).edgeId, edge.id);
      for (const key of ['Enter', ' ']) {
        hit.fire('keydown', {key});
        assert.equal(s.events.at(-1).edgeId, edge.id, 'keyboard activates its exact edge');
      }
      for (const segment of routes[i].segments) {
        for (const card of fixture.positions) assert.equal(cutsCard(segment, card), false, 'straight run clears cards');
        for (let j = i + 1; j < routes.length; j++) {
          for (const other of routes[j].segments) assert.equal(overlaps(segment, other), false, 'no shared positive-length lane');
        }
      }
      for (const [x, y] of routes[i].samples) {
        for (const [cx, cy] of fixture.positions) {
          assert.ok(!(x > cx+.11 && x < cx+252-.11 && y > cy+.11 && y < cy+96-.11), 'rounded geometry clears cards');
        }
      }
    }
    assert.deepEqual(plain([...s.canvas.captureLayout()]), layout);
    assert.equal(JSON.stringify(s.c.graph), graph);
    const parameterIndex = fixture.edges.findIndex(([a, b]) => a === fixture.regressionEdge[0] && b === fixture.regressionEdge[1]);
    assert.ok(paths[parameterIndex], 'original missing parameter-to-query connection');
    t.diagnostic(JSON.stringify({nodes: 84, edges: 77, k, elapsedMs, work: +status.dataset.work, maxEdgeWork: +status.dataset.maxEdgeWork}));
  }
});

test('dense route allocation survives pan, selection, filtering and reversed graph order without moving cards', () => {
  const s = setup();
  s.canvas.setViewport({x: 0, y: 0, k: .85});
  const layout = plain([...s.canvas.captureLayout()]);
  const paths = () => Object.fromEntries(s.host.querySelectorAll('.pqc-edge-hit').map(hit => [hit.dataset.edgeId, hit.getAttribute('d')]));
  const before = paths();
  s.canvas.setViewport({x: 123, y: -321, k: .85});
  s.canvas.setSelection('id-' + fixture.regressionEdge[0]);
  assert.deepEqual(paths(), before);
  s.canvas.setVisibleIds(new Set(fixture.regressionEdge.map(i => 'id-' + i)));
  assert.equal(s.host.querySelectorAll('.pqc-edge').filter(group => group.style.display !== 'none').length, 1);
  s.canvas.setVisibleIds(null);
  assert.deepEqual(paths(), before);
  s.canvas.setContext({...s.c, graph: {...s.c.graph, edges: s.c.graph.edges.slice().reverse()}});
  assert.deepEqual(paths(), before);
  assert.deepEqual(plain([...s.canvas.captureLayout()]), layout);
});

