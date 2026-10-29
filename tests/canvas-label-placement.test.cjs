const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function canvas(vertical = false, zoom = 1) {
  const context = { window: {}, U: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js/canvas.js'), 'utf8'), context);
  const c = Object.create(context.window.GraphCanvas.prototype);
  Object.assign(c, { view: { k: zoom }, lineStyle: 'ortho', _chip: false,
    relationshipPoints: () => vertical ? [{ x: 0, y: 0 }, { x: 0, y: 200 }] : [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    orthoPath: () => '' });
  return c;
}

for (const vertical of [false, true]) {
  test(`parallel relationship retains cardinality on a free ${vertical ? 'vertical' : 'horizontal'} run`, () => {
    const c = canvas(vertical);
    // A neighbouring label occupies the preferred seats. There is room near
    // the other end, but a shared-channel slot shifts all old candidates away.
    const obstacle = vertical ? { x0: -14, x1: 14, y0: 120, y1: 180 }
      : { x0: 120, x1: 180, y0: -14, y1: 14 };
    const geometry = c.edgeGeom({}, 0, 2, []);
    const spot = c.pickSpot(geometry.spots, [obstacle], true);
    assert.ok(spot, 'a clear full-label seat must be found before falling back to an arrow');
    assert.equal(spot.bare, false);
    const coordinate = vertical ? spot.y : spot.x;
    assert.ok(coordinate >= 35 && coordinate + 25 <= 120);
    assert.equal(spot.toA, -1);
  });
}

test('crowded runs still reject overlapping full labels', () => {
  const c = canvas();
  assert.equal(c.pickSpot(c.edgeGeom({}, 0, 2, []).spots,
    [{ x0: -100, x1: 300, y0: -100, y1: 100 }], true), null);
});

test('low zoom keeps the existing arrow-only representation', () => {
  const c = canvas(false, 0.3);
  assert.ok(c.edgeGeom({}, 0, 0, []).spots.every(s => s.bare));
});
