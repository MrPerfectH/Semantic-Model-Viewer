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

for (const vertical of [false, true]) {
  test(`compact relationship badges reserve their smaller ${vertical ? 'vertical' : 'horizontal'} bounds`, () => {
    const c = canvas(vertical, 0.51), spot = { orient: vertical ? 'v' : 'h', bare: false };
    const full = c.pillBox(spot);
    c._chip = true;
    const compact = c.pillBox(spot);
    assert.ok(Math.abs(compact.w / full.w - 0.78) < 1e-9);
    assert.ok(Math.abs(compact.h / full.h - 0.78) < 1e-9);
    assert.ok(Math.abs((vertical ? compact.w : compact.h) * c.view.k - 15.6) < 1e-9);
    const arrow = c.labelDims(true);
    c._chip = false;
    assert.deepEqual(c.labelDims(true), arrow, 'arrow-only geometry retains its readable floor');
  });
}

test('obstacle refinement honors shared budget without dropping relationship endpoints', () => {
  const c=canvas();
  delete c.relationshipPoints;
  c._routeSearchRemaining=0;
  // Start enclosed in an obstacle: no simple detour can leave it.
  const obstacles=[{x0:-10,y0:-10,x1:50,y1:50}];
  assert.equal(c.obstacleRoute({x:0,y:0},{x:150,y:150},obstacles),null);
  assert.equal(c._routingLimited,true);
  const g={ax:0,ay:0,bx:150,by:150,axis:'h',adir:1,bdir:-1};
  const points=c.relationshipPoints(g,0,obstacles);
  assert.deepEqual(JSON.parse(JSON.stringify(points[0])),{x:0,y:0});
  assert.deepEqual(JSON.parse(JSON.stringify(points.at(-1))),{x:150,y:150});
  assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});

test('simple clear channels avoid an obstacle without spending search budget', () => {
  const c=canvas();c._routeSearchRemaining=0;
  const obstacles=[{x0:40,y0:-10,x1:60,y1:10}];
  const points=c.obstacleRoute({x:0,y:0},{x:100,y:0},obstacles);
  assert.ok(points);assert.equal(c.routeClear(points,obstacles),true);assert.equal(c._routeSearchRemaining,0);
});
