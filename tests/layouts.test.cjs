/* Layout quality without a browser: the algorithms are pure geometry over model metadata,
   so they run in a vm with the DOM calls stubbed and the resulting positions measured. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '../Models/tools/viewer/js');
const CARD_W = 252, MARGIN = 12;   // collapsed card plus the gutter a reader needs

function stub(tag, props = {}) {
  return { tag, props, style: {}, children: [],
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {}, addEventListener() {} };
}
function runtime() {
  const context = { console, Set, Map, Math, Number, addEventListener() {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8'), context);
  context.U.el = context.U.sv = stub;
  context.U.clear = target => { target.children = []; };
  context.U.store = { get: (key, fallback) => fallback, set() {}, getJSON: (key, fallback) => fallback, setJSON() {} };
  for (const file of ['canvas.js', 'layouts.js', 'relationships.js', 'explorer.js']) {
    vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), context);
  }
  return context;
}
function canvasFor(context, model, algo, zoom) {
  const canvas = Object.create(context.GraphCanvas.prototype);
  const app = { model, isFact: table => table.role === 'fact', colorBy: 'domain', state: {} };
  Object.assign(canvas, { app, pos: {}, cpos: {}, cards: {}, CARD_W, view: { x: 0, y: 0, k: 1 },
    layoutAlgo: algo, persist() {}, layoutCard() {}, renderLines() {}, fitView() {} });
  app.canvas = canvas;
  canvas.setLayoutK(zoom == null ? canvas.ZOOM_FLOOR : zoom);
  return canvas;
}
function withRelCount(model) {
  const counts = {};
  model.relationships.forEach(r => { counts[r.from] = (counts[r.from] || 0) + 1; counts[r.to] = (counts[r.to] || 0) + 1; });
  model.tables.forEach(t => { t.relCount = counts[t.name] || 0; });
  model.byName = Object.fromEntries(model.tables.map(t => [t.name, t]));
  return model;
}
function bundled() {
  return withRelCount(JSON.parse(fs.readFileSync(path.join(jsDir, '../model-data.json'), 'utf8')));
}
/* 2 facts, 5 dims (2 conformed, 3 private), a dictionary behind a dim and two tray tables. */
function synthetic() {
  const roles = { Sales: 'fact', Orders: 'fact', Date: 'dim', Product: 'dim', Store: 'dim',
    Channel: 'dim', Supplier: 'dim', 'Product Dictionary': 'dim', 'Time Intelligence': 'calcgroup', Notes: 'standalone' };
  const link = (from, to) => ({ from, to, fromCol: 'Key', toCol: 'Id', fromCard: 'many', toCard: 'one', inactive: false, both: false });
  return withRelCount({
    name: 'Synthetic',
    tables: Object.keys(roles).map(name => ({ name, role: roles[name], domain: 'Test', columns: [], measures: [] })),
    relationships: [link('Sales', 'Date'), link('Sales', 'Product'), link('Sales', 'Store'),
      link('Orders', 'Date'), link('Orders', 'Product'), link('Orders', 'Channel'),
      link('Sales', 'Supplier'), link('Product Dictionary', 'Product')],
  });
}
/* A card is not 252x105 on the screen the reader is looking at. The renderer scales a chip
   by 1/zoom, so the box a layout has to keep clear is the chip box AT THE ZOOM THE PICTURE IS
   SHOWN AT — cellFor(k), the same function the arrange lanes are cut from. Asking at any
   other k is the step-4 mistake in test form. */
function laneHeight(canvas, zoom) { return canvas.chipBoxAt(zoom == null ? canvas.layoutK : zoom).h; }
function laneWidth(canvas, zoom) { return canvas.chipBoxAt(zoom == null ? canvas.layoutK : zoom).w; }
function overlapping(canvas, names, zoom) {
  /* positions are the CARD top-left; a chip wider than a card hangs over both sides of it,
     which is exactly how the renderer draws it (see _placeCard) */
  const pos = canvas.pos, w = laneWidth(canvas, zoom), h = laneHeight(canvas, zoom), hits = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = pos[names[i]], b = pos[names[j]];
      if (!a || !b) continue;
      if (Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h) hits.push(names[i] + ' / ' + names[j]);
    }
  }
  return hits;
}
/* Relationship lines are drawn card centre to card centre; count the pairs that properly
   cross. Edges sharing a table always meet at that card and are not crossings. */
function properCross(p, q, r, s) {
  const side = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const d1 = side(p, q, r), d2 = side(p, q, s), d3 = side(r, s, p), d4 = side(r, s, q);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}
function countCrossings(canvas, model) {
  const pos = canvas.pos, h = laneHeight(canvas);
  const centre = name => ({ x: pos[name].x + CARD_W / 2, y: pos[name].y + h / 2 });
  const segments = model.relationships
    .filter(r => pos[r.from] && pos[r.to] && r.from !== r.to)
    .map(r => ({ from: r.from, to: r.to, a: centre(r.from), b: centre(r.to) }));
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const x = segments[i], y = segments[j];
      if (x.from === y.from || x.from === y.to || x.to === y.from || x.to === y.to) continue;
      if (properCross(x.a, x.b, y.a, y.b)) total++;
    }
  }
  return total;
}
function arranged(context, model, algo, opts, zoom) {
  const canvas = canvasFor(context, model, algo, zoom);
  canvas.untangle(opts);
  return canvas;
}
/* The zooms a whole-model picture realistically lands on: the shared floor, and the two rungs
   above it the browser test reports for 1280x720 and 1440x900. */
const FIT_ZOOMS = [0.25, 0.30, 0.40];
const MODELS = [['bundled model', bundled], ['synthetic star', synthetic]];

for (const [label, build] of MODELS) {
  test(`star, constellation and layered place every card clear of the others (${label})`, () => {
    const context = runtime(), model = build();
    for (const algo of ['star', 'constellation', 'layered']) {
      for (const k of FIT_ZOOMS) {
        const canvas = arranged(context, model, algo, undefined, k);
        const names = model.tables.map(t => t.name).filter(name => canvas.pos[name]);
        assert.equal(names.length, model.tables.length, algo + ' must place every table');
        assert.deepEqual(overlapping(canvas, names, k), [], `${algo} overlaps on the ${label} at ${k}`);
      }
    }
  });

  /* One fact plus the tables it touches — the focused picture the Arrange button produces
     after "Hide unrelated". A single hub keeps the per-hub ring from step 1. */
  function soloHub(model) {
    const facts = model.tables.filter(t => t.role === 'fact' && t.relCount >= 3);
    const hub = facts.sort((a, b) => b.relCount - a.relCount || a.name.localeCompare(b.name))[0];
    const names = new Set([hub.name]);
    model.relationships.forEach(r => {
      if (r.from === hub.name) names.add(r.to);
      if (r.to === hub.name) names.add(r.from);
    });
    // drop the other facts so the subset really has one hub
    for (const name of [...names]) if (name !== hub.name && model.byName[name].role === 'fact') names.delete(name);
    return { hub: hub.name, names };
  }

  test(`a single-hub subset keeps the per-hub ring (${label})`, () => {
    const context = runtime(), model = build();
    const { hub, names } = soloHub(model);
    const canvas = arranged(context, model, 'star', { names, center: hub });
    assert.equal(canvas.lastLayout.mode, 'rings', 'one hub must keep the step-1 star');
    const seated = new Set();
    for (const ring of canvas.lastLayout.rings) {
      /* The ring is an ellipse shaped like the lane, so "on the ring" is an elliptical radius
         of 1 — and it is never tighter than one lane box in either direction. */
      const G = canvas._gapBox();
      assert.ok(ring.rx >= G.x - 1e-9 && ring.ry >= G.y - 1e-9, 'the ring clears the hub in the middle');
      assert.ok(Math.abs(ring.rx / ring.ry - G.x / G.y) < 1e-6, 'the ring is shaped like the lane');
      for (const member of ring.members) {
        const dx = (canvas.pos[member].x - canvas.pos[ring.hub].x) / ring.rx;
        const dy = (canvas.pos[member].y - canvas.pos[ring.hub].y) / ring.ry;
        assert.ok(Math.abs(Math.hypot(dx, dy) - 1) <= 0.01, member + ' is off the ring of ' + ring.hub);
        seated.add(member);
      }
    }
    // every table in the subset other than the hub itself sits on that hub's ring
    for (const name of names) if (name !== hub) assert.ok(seated.has(name), name + ' should be on the ring of ' + hub);
    assert.deepEqual(overlapping(canvas, [...names]), []);
  });

  test(`the whole model star puts the conformed dims inside the ring of facts (${label})`, () => {
    const context = runtime(), model = build();
    const canvas = arranged(context, model, 'star');
    const L = canvas.lastLayout;
    assert.equal(L.mode, 'core', 'two or more hubs get the dims-in-the-middle picture');
    // positions are card top-left, the layout works in card centres — and the ring is an
    // ellipse, so "inside" means an elliptical radius below 1, not a plain distance
    const centre = name => ({ x: canvas.pos[name].x + CARD_W / 2, y: canvas.pos[name].y + laneHeight(canvas) / 2 });
    const radius = name => Math.hypot(centre(name).x / L.rx, centre(name).y / L.ry);
    // the final collision pass may nudge a fact whose private dims crowd a neighbour
    for (const f of L.facts) assert.ok(Math.abs(radius(f) - 1) < 0.12, f + ' should ride the ring');
    for (const d of L.dims) assert.ok(radius(d) < 0.9, d + ' should sit inside the ring of facts');
    // and the block is a grid, so it spans at most ceil(sqrt(n)) columns
    assert.ok(L.cols <= Math.ceil(Math.sqrt(L.dims.length)), 'centre block columns');
  });

  test(`the tray of relationship-free tables sits under the picture (${label})`, () => {
    const context = runtime(), model = build();
    const canvas = arranged(context, model, 'star');
    const loose = model.tables.filter(t => !t.relCount).map(t => t.name);
    if (!loose.length) return;
    const connected = model.tables.filter(t => t.relCount).map(t => t.name);
    const lowest = Math.max(...connected.map(name => canvas.pos[name].y + laneHeight(canvas)));
    for (const name of loose) assert.ok(canvas.pos[name].y >= lowest, name + ' should be on the tray below the star');
  });

  test(`layered puts every fact below every dimension (${label})`, () => {
    const context = runtime(), model = build();
    const canvas = arranged(context, model, 'layered');
    const { dims, facts } = canvas.lastLayout;
    assert.ok(dims.length && facts.length);
    const lowestDim = Math.max(...dims.map(name => canvas.pos[name].y));
    const highestFact = Math.min(...facts.map(name => canvas.pos[name].y));
    assert.ok(lowestDim + laneHeight(canvas) < highestFact, 'dim row must clear the fact row');
  });

  test(`layouts are deterministic (${label})`, () => {
    const context = runtime(), model = build();
    for (const algo of ['star', 'constellation', 'layered', 'grid']) {
      const first = arranged(context, model, algo).pos;
      const second = arranged(context, model, algo).pos;
      assert.deepEqual(second, first, algo + ' must produce identical positions on a second run');
    }
  });
}

test('star beats the galaxy rows on edge crossings for the bundled model', () => {
  const context = runtime(), model = bundled();
  const counts = {};
  for (const algo of ['star', 'constellation', 'layered', 'galaxy', 'columns', 'waterfall', 'grid']) {
    counts[algo] = countCrossings(arranged(context, model, algo), model);
  }
  assert.ok(counts.star <= counts.galaxy, `star ${counts.star} vs galaxy ${counts.galaxy}`);
  // a force layout has no guaranteed edge on a graph where every fact shares one date dimension
  assert.ok(counts.constellation <= counts.grid, `constellation ${counts.constellation} vs grid ${counts.grid}`);
  // Dims-on-top is a two-layer drawing: with 15 facts sharing 18 conformed dims its crossing
  // number is structurally above galaxy's two fact bands. It still beats the plain grid, and
  // it is the most compact picture of the three (measured 2026-09-11 on chip-height lanes:
  // columns 541, constellation 568, star 583, galaxy 591, waterfall 1049, layered 1136,
  // grid 1905).
  assert.ok(counts.layered <= counts.grid, `layered ${counts.layered} vs grid ${counts.grid}`);
});

/* What fitView actually has to aim at with the library rail open: 1440x900 leaves a
   1172x752 host, 24px of padding goes on each side and the overview map takes 153px off the
   bottom; 1280x720 leaves proportionally less (measured in the browser — see
   tests/star-layout.browser.cjs). */
const SCREENS = { '1440x900': [1124, 538], '1280x720': [964, 410] };
function fitZoom(extent, screen) {
  const [w, h] = SCREENS[screen];
  return Math.min(1.25, Math.min(w / extent.w, h / extent.h));
}
function extentOf(canvas, names, zoom) {
  const pos = canvas.pos, w = laneWidth(canvas, zoom), h = laneHeight(canvas, zoom), over = (w - CARD_W) / 2;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const name of names) {
    const p = pos[name]; if (!p) continue;
    x0 = Math.min(x0, p.x - over); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x - over + w); y1 = Math.max(y1, p.y + h);
  }
  return { w: x1 - x0, h: y1 - y0 };
}
/* The convergence the arrange path runs, replayed without a DOM: lay the picture out for a
   zoom, ask what it would fit at, lay it out again for THAT, at most three times. */
function converge(context, model, algo, screen) {
  let k = 0.5, canvas = null, want = 0;
  for (let pass = 0; pass < 3; pass++) {
    canvas = arranged(context, model, algo, undefined, k);
    want = Math.max(canvas.ZOOM_FLOOR, fitZoom(extentOf(canvas, model.tables.map(t => t.name), k), screen));
    if (!(want < k - 0.02)) break;
    k = want;
  }
  return { canvas, k: canvas.layoutK, want };
}

/* The zoom a whole model fits at is a DENSITY number, not a readability one: the chip title
   is clamped to 11-13 css px at every zoom down to the floor, so a picture that fits at 25%
   reads exactly as well as one that fits at 40% — it simply spends more of the canvas on the
   space between cards. What matters is that the lanes were cut for the zoom the picture ends
   up at, so no card is drawn on top of another. Measured 2026-09-12 after the converging
   arrange: star settles at 31% on 1440x900 (3065x1832) and at the 25% floor on 1280x720
   (3388x2047); constellation at 40% and 25%. */
test('the converging arrange lands the whole model at or above the floor with nothing stacked', () => {
  const context = runtime(), model = bundled();
  const names = model.tables.map(t => t.name);
  for (const screen of Object.keys(SCREENS)) {
    for (const algo of ['star', 'constellation', 'layered', 'galaxy', 'columns', 'waterfall', 'grid']) {
      const { canvas, k } = converge(context, model, algo, screen);
      assert.ok(k >= canvas.ZOOM_FLOOR - 1e-9, `${algo} on ${screen} settled below the floor at ${k}`);
      assert.deepEqual(overlapping(canvas, names, k), [], `${algo} overlaps on ${screen} at ${k}`);
    }
    // star has to clear the floor outright on the bigger screen
    const star = converge(context, model, 'star', screen);
    assert.ok(star.k >= (screen === '1440x900' ? 0.30 : 0.25) - 1e-9,
      `star on ${screen} settled at ${(star.k * 100).toFixed(0)}%`);
    const size = extentOf(star.canvas, names, star.k);
    // and the picture is shaped roughly like the canvas it has to land in, not like a circle
    assert.ok(size.w / size.h >= 1.5, `star aspect ${(size.w / size.h).toFixed(2)}`);
  }
});

test('chip titles scale with the zoom so a table name is never smaller than 11px on screen', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  let previous = Infinity;
  for (const k of [0.25, 0.3, 0.42, 0.5, 0.6, 0.7, 1, 1.6, 2.2]) {
    const m = canvas.chipMetrics(k, 8);
    assert.ok(Math.abs(m.font * k - m.screen) < 1e-9, 'font x zoom is the on-screen size');
    assert.ok(m.screen >= 11 - 1e-9 && m.screen <= 13 + 1e-9, `on-screen font at ${k} was ${m.screen}`);
    assert.ok(m.font <= previous + 1e-9, 'the model-space font never grows as the zoom grows');
    previous = m.font;
  }
  // 0.5 is where the unscaled 22px chip lands exactly on the 11px floor
  assert.equal(canvas.chipMetrics(0.5, 8).font, 22);
  assert.equal(canvas.chipMetrics(0.5, 8).width, 252);
  assert.ok(canvas.chipMetrics(0.25, 8).font > 22);
  /* Below the floor the chip stops growing: the lane it has to sit in was cut for the floor,
     and a chip that kept scaling up would be the one that outgrows it. The reader zooming
     out past the floor is looking at shape, not at names. */
  const floor = canvas.chipMetrics(canvas.ZOOM_FLOOR, 22);
  for (const k of [0.2, 0.16, 0.1]) {
    const m = canvas.chipMetrics(k, 22);
    assert.equal(m.font, floor.font, `the chip font moved below the floor at ${k}`);
    assert.equal(m.width, floor.width);
    assert.equal(m.height, floor.height);
  }
  // a long single word cannot wrap, so the box grows around the anchor — but never past the lane
  assert.ok(canvas.chipMetrics(0.25, 22).width > 252);
  assert.ok(canvas.chipMetrics(0.16, 40).width <= Math.round(252 * canvas.CHIP_MAX_W));
  assert.ok(canvas.CHIP_MAX_W <= 1.3);
});

/* The whole point of step 5 in one assertion: a lane is the chip box at the zoom the picture
   is shown at, so the chip can never be wider or taller than the lane cut for it. */
test('cellFor(k) always clears the chip drawn at k', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  for (const k of [0.1, 0.16, 0.25, 0.3, 0.4, 0.5, 0.69]) {
    const cell = canvas.cellFor(Math.max(canvas.ZOOM_FLOOR, k));
    const box = canvas.chipBoxAt(k);
    assert.ok(box.w <= cell.w && box.h <= cell.h, `chip ${box.w}x${box.h} does not fit lane ${cell.w}x${cell.h} at ${k}`);
  }
  // and a lane cut for a LOWER zoom is never smaller than one cut for a higher one
  assert.ok(canvas.cellFor(0.25).h >= canvas.cellFor(0.5).h);
  assert.ok(canvas.cellFor(0.25).w >= canvas.cellFor(0.5).w);
});

test('detail mode decides the chip treatment, zoom only decides it on Auto', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  canvas.detailMode = 'auto';
  assert.equal(canvas.chipOn(0.3), true);
  assert.equal(canvas.chipOn(0.9), false);
  canvas.detailMode = 'names';
  assert.equal(canvas.chipOn(2.2), true, 'Names is always a chip');
  assert.ok(canvas.chipMetrics(2.2, 8).screen >= 11);
  canvas.detailMode = 'cards';
  assert.equal(canvas.chipOn(0.2), false, 'Cards is never a chip');
  assert.equal(canvas.cardWidthAt({ longWord: 30 }, 0.2), 252, 'a card keeps the card width');
});

test('the filter arrow is a fixed size on screen and doubles up for bidirectional edges', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  const spot = { x: 0, y: 0, orient: 'h', toA: 1 };
  const measure = (k, both) => {
    canvas.view = { x: 0, y: 0, k };
    const heads = canvas.edgeArrow({ both }, spot, '#000', 1).children[0].children;
    const xs = heads.flatMap(p => p.props.points.split(' ').map(pt => Number(pt.split(',')[0])));
    return { heads: heads.length, screenSpan: (Math.max(...xs) - Math.min(...xs)) * k };
  };
  const wide = measure(1, false), tiny = measure(0.16, false);
  assert.equal(wide.heads, 1);
  assert.ok(Math.abs(wide.screenSpan - tiny.screenSpan) < 0.06, 'the arrow keeps its on-screen size at any zoom');
  assert.ok(tiny.screenSpan > 3 && tiny.screenSpan <= 6, 'roughly 6 screen px of arrowhead');
  assert.equal(measure(1, true).heads, 2, 'a both-directions relationship gets a head each way');
});

test('cardinality pills read both ends when both ends say the same thing', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  canvas.view = { x: 0, y: 0, k: 1 };
  const g0 = { ax: 100, ay: 40, bx: 700, by: 240, adir: 1, bdir: -1, a: 'A', b: 'B' };
  const seat = (r, end) => canvas.pickSpot(canvas.pillSpots(g0, end.end, end.glyph), []);

  // an ordinary star spoke: one pill, on the many end, riding the stub that leaves it
  const star = canvas.manyEnds({ fromCard: 'many', toCard: 'one' });
  assert.equal(star.map(e => e.glyph).join(''), '*');   // arrays cross a vm boundary
  assert.equal(star[0].end, 'a');
  const spot = seat(null, star[0]);
  assert.ok(spot.x > g0.ax && spot.x < g0.bx, 'the pill rides the stub leaving the many table');
  assert.equal(spot.y, g0.ay);

  const flipped = canvas.manyEnds({ fromCard: 'one', toCard: 'many' });
  assert.equal(flipped.map(e => e.glyph).join(''), '*');
  assert.equal(seat(null, flipped[0]).y, g0.by, 'when `to` carries the many side the pill moves to that end');

  // many-to-many and one-to-one are the cases a single glyph cannot describe
  assert.equal(canvas.manyEnds({ fromCard: 'many', toCard: 'many' }).map(e => e.glyph).join(''), '**');
  assert.equal(canvas.manyEnds({ fromCard: 'one', toCard: 'one' }).map(e => e.glyph).join(''), '11');
  assert.equal(canvas.PILL_ZOOM, 0.5);
});

test('a pill that would land on a card steps further out along the same stub', () => {
  const context = runtime();
  const canvas = canvasFor(context, bundled(), 'star');
  canvas.view = { x: 0, y: 0, k: 1 };
  const g0 = { ax: 100, ay: 40, bx: 700, by: 240, adir: 1, bdir: -1, a: 'A', b: 'B' };
  const spots = canvas.pillSpots(g0, 'a', '*');
  assert.ok(spots.length > 1 && spots.every(s => s.y === g0.ay && s.glyph === '*'));
  const blocked = { x0: spots[0].x - 40, y0: g0.ay - 40, x1: spots[0].x + 40, y1: g0.ay + 40 };
  const picked = canvas.pickSpot(spots, [blocked]);
  assert.notEqual(picked.x, spots[0].x, 'the first seat is taken, so another one is used');
  assert.ok(picked.x - canvas.PILL_W / 2 >= blocked.x1 || picked.x + canvas.PILL_W / 2 <= blocked.x0);
});

test('a subset arrange never moves a table that is not on the canvas', () => {
  const context = runtime(), model = bundled();
  const canvas = canvasFor(context, model, 'star');
  const off = model.tables.slice(0, 4).map(t => t.name);
  const on = model.tables.slice(4).map(t => t.name);
  off.forEach((name, i) => { canvas.pos[name] = { x: -9000 - i, y: 4200 + i }; });
  canvas.untangle({ names: new Set(on) });
  off.forEach((name, i) => assert.deepEqual(canvas.pos[name], { x: -9000 - i, y: 4200 + i }, name));
  on.forEach(name => assert.ok(canvas.pos[name], name + ' should have been arranged'));
});

test('Arrange applies the layout chosen in Display, not a hard-coded grid', () => {
  const context = runtime(), model = bundled();
  const names = model.tables.slice(0, 20).map(t => t.name);
  const run = algo => {
    const canvas = canvasFor(context, model, algo);
    const app = canvas.app;
    app.state = { selected: names[1], isolate: false };
    const explorer = { app, names: new Set(names), snapshot() {}, commit() {} };
    context.TableExplorer.prototype.arrangeSubset.call(explorer, false);
    return canvas;
  };
  for (const algo of ['star', 'constellation', 'layered', 'grid']) {
    const viaArrange = run(algo);
    const direct = arranged(context, model, algo, { names: new Set(names), center: names[1] });
    assert.deepEqual(viaArrange.pos, direct.pos, 'Arrange must run the ' + algo + ' layout');
  }
  assert.notDeepEqual(run('star').pos, run('grid').pos);
});

test('Arrange leaves the tables that are hidden by focus where they were', () => {
  const context = runtime(), model = bundled();
  const canvas = canvasFor(context, model, 'layered');
  const app = canvas.app;
  const all = model.tables.map(t => t.name);
  const hidden = all.slice(0, 3);
  all.forEach((name, i) => { canvas.pos[name] = { x: i * 11, y: i * 13 }; });
  canvas.cards = Object.fromEntries(all.map(name => [name, { el: { style: { display: hidden.includes(name) ? 'none' : '' } } }]));
  app.state = { selected: null, isolate: true };
  const explorer = { app, names: new Set(all), snapshot() {}, commit() {} };
  context.TableExplorer.prototype.arrangeSubset.call(explorer, false);
  hidden.forEach(name => assert.deepEqual(canvas.pos[name], { x: all.indexOf(name) * 11, y: all.indexOf(name) * 13 }, name));
});

test('the grid option lays tables out in plain rows, on the same lanes as every other layout', () => {
  const context = runtime(), model = bundled();
  const canvas = arranged(context, model, 'grid');
  const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);   // the comparator every layout uses
  const expected = model.tables.map(t => t.name).sort((a, b) => {
    const fact = name => Number(model.byName[name].role === 'fact');
    return (fact(b) - fact(a)) || byName(a, b);
  });
  const cols = Math.max(1, Math.ceil(Math.sqrt(expected.length * 1.55)));
  const lane = canvas._gapBox();               // numbers cross a vm boundary, objects do not
  expected.forEach((name, i) => {
    assert.equal(canvas.pos[name].x, (i % cols) * lane.x, name + ' x');
    assert.equal(canvas.pos[name].y, Math.floor(i / cols) * lane.y, name + ' y');
  });
  assert.deepEqual(overlapping(canvas, expected), []);
});

test('the grid option seats the selected table ahead of the tables it connects to', () => {
  const context = runtime(), model = bundled();
  const root = model.tables.find(t => t.relCount > 3).name;
  const canvas = arranged(context, model, 'grid', { center: root });
  const reading = name => canvas.pos[name].y * 1e6 + canvas.pos[name].x;
  model.relationships.filter(r => r.from === root || r.to === root).forEach(r => {
    const other = r.from === root ? r.to : r.from;
    assert.ok(reading(root) < reading(other), root + ' should come before ' + other);
  });
});

/* The crossing-refinement passes are quadratic in the edge count. They are gated on a work
   budget, so a model big enough to make them expensive keeps the seeded order instead of
   hanging the Arrange button. Measured 2026-09-11: 40t/100r 30ms, 80t/400r 6ms,
   120t/900r 17ms for star. */
function syntheticAt(tableCount, relCount) {
  const tables = [], relationships = [];
  const facts = Math.max(2, Math.round(tableCount * 0.25));
  for (let i = 0; i < tableCount; i++) {
    tables.push({ name: 'T' + String(i).padStart(3, '0') + ' Table', role: i < facts ? 'fact' : 'dim', domain: 'D' + (i % 5), columns: [], measures: [] });
  }
  let seed = 12345;
  const next = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let r = 0; r < relCount; r++) {
    const f = Math.floor(next() * facts), d = facts + Math.floor(next() * (tableCount - facts));
    relationships.push({ from: tables[f].name, to: tables[d].name, fromCol: 'K', toCol: 'I', fromCard: 'many', toCard: 'one', inactive: false, both: false });
  }
  return withRelCount({ name: 'Synthetic', tables, relationships });
}

test('a big model arranges in well under a second instead of grinding on the refinement pass', () => {
  const context = runtime();
  for (const [tableCount, relCount] of [[40, 100], [80, 400], [120, 900]]) {
    const model = syntheticAt(tableCount, relCount);
    const started = Date.now();
    const canvas = arranged(context, model, 'star');
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 300, `star on ${tableCount} tables / ${relCount} relationships took ${elapsed}ms`);
    assert.deepEqual(overlapping(canvas, model.tables.map(t => t.name)), [], `${tableCount}t/${relCount}r overlaps`);
  }
});

/* A dimension whose only fact is not on this canvas is not a standalone table: it has model
   relationships, so it belongs beside the picture rather than filed on the tray underneath. */
test('a table related only to something off the canvas keeps its place beside the picture', () => {
  const context = runtime(), model = synthetic();
  // Channel's only relationship is to Orders; arrange Sales' star without Orders
  const names = new Set(['Sales', 'Date', 'Product', 'Store', 'Supplier', 'Channel', 'Time Intelligence']);
  const canvas = arranged(context, model, 'star', { names });
  const inPicture = ['Sales', 'Date', 'Product', 'Store', 'Supplier'];
  const lowest = Math.max(...inPicture.map(name => canvas.pos[name].y));
  const rightmost = Math.max(...inPicture.map(name => canvas.pos[name].x));
  assert.ok(canvas.pos.Channel.x > rightmost, 'the unconnected dimension sits beside the picture');
  assert.ok(canvas.pos.Channel.y <= lowest, 'and level with it, not on the tray below');
  // the calculation group has no model relationships at all, so it does go on the tray
  assert.ok(canvas.pos['Time Intelligence'].y > lowest, 'a table with no relationships at all stays on the tray');
  assert.deepEqual(overlapping(canvas, [...names]), []);
});

test('an arrange over tables with no relationships between them falls back to the grid', () => {
  const context = runtime(), model = synthetic();
  const loose = ['Time Intelligence', 'Notes'];
  const canvas = canvasFor(context, model, 'star');
  canvas.untangle({ names: new Set(loose) });
  assert.deepEqual(overlapping(canvas, loose), []);
  assert.equal(canvas.lastLayout.algo, 'grid');
});

/* ---------- fit against the overlays that sit on top of the canvas ---------- */

const HOST = { w: 1440 - 268, h: 900 - 62 - 30 };     // canvas host at 1440x900 with the library rail
const DRAWER = { x: HOST.w - 330, y: 0, w: 330, h: HOST.h };
const MAP = { x: HOST.w - 330 - 240, y: HOST.h - 151, w: 224, h: 134 };   // left of the drawer, above the status row

test('fit aims at the unobstructed canvas: the drawer and the overview map are cut away, with 24px of padding', () => {
  const { fitRect } = runtime();
  const box = rect => [rect.x, rect.y, rect.w, rect.h];   // rects cross a vm boundary
  assert.deepEqual(box(fitRect(HOST, [], 24)), [24, 24, HOST.w - 48, HOST.h - 48]);

  const withDrawer = fitRect(HOST, [DRAWER], 24);
  assert.equal(withDrawer.x, 24);
  assert.equal(withDrawer.w, HOST.w - 330 - 48, 'the drawer width leaves the usable box');
  assert.equal(withDrawer.h, HOST.h - 48, 'a full-height drawer costs no height');

  const both = fitRect(HOST, [DRAWER, MAP], 24);
  assert.ok(both.x + both.w <= DRAWER.x, 'nothing is fitted under the drawer');
  assert.ok(both.y + both.h <= MAP.y, 'nothing is fitted under the overview map');
  assert.equal(both.w, withDrawer.w, 'the map is cheaper to cut off the bottom than the right');
});

test('an obstruction that misses the canvas costs nothing, and one that swallows it falls back to the padded host', () => {
  const { fitRect } = runtime();
  const box = rect => [rect.x, rect.y, rect.w, rect.h];
  const outside = { x: HOST.w + 40, y: 0, w: 300, h: HOST.h };
  assert.deepEqual(box(fitRect(HOST, [outside], 24)), box(fitRect(HOST, [], 24)));
  assert.deepEqual(box(fitRect(HOST, [{ x: 0, y: 0, w: 0, h: 200 }], 24)), box(fitRect(HOST, [], 24)));
  const everything = fitRect(HOST, [{ x: 0, y: 0, w: HOST.w, h: HOST.h }], 24);
  assert.ok(everything.w >= 160 && everything.h >= 160, 'the fit box never collapses');
});

test('Escape closes the Display popover first, then Saved views, and returns focus to the button', () => {
  const context = runtime();
  const focused = [];
  const explorer = Object.create(context.TableExplorer.prototype);
  const app = { state: { showPresets: false }, setState(patch, cb) { Object.assign(this.state, patch); if (cb) cb(); } };
  Object.assign(explorer, { app, optionsOpen: true, update() {},
    displayBtn: { focus: () => focused.push('Display') },
    presetsBtn: { focus: () => focused.push('Saved views') } });

  assert.equal(explorer.closeMenus(), true);
  assert.equal(explorer.optionsOpen, false);
  assert.deepEqual(focused, ['Display']);

  app.state.showPresets = true;
  assert.equal(explorer.closeMenus(), true);
  assert.equal(app.state.showPresets, false);
  assert.deepEqual(focused, ['Display', 'Saved views']);

  assert.equal(explorer.closeMenus(), false, 'Escape with nothing open is left to other handlers');
});
