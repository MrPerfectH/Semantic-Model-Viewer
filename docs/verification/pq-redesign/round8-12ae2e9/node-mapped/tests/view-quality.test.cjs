const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const jsDir = path.join(__dirname, '../Models/tools/viewer/js');
function node(tag, props = {}, kids) {
  const out = { tag, props, style: {}, children: [], events: {},
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.props[key] = value; },
    addEventListener(type, callback) { this.events[type] = callback; },
  };
  const add = child => {
    if (Array.isArray(child)) child.forEach(add);
    else if (child !== undefined && child !== null) out.children.push(child);
  };
  add(kids); return out;
}
function all(root) {
  return [root, ...root.children.flatMap(child => typeof child === 'object' ? all(child) : [])];
}
function runtime() {
  const context = { console, Set, Map, addEventListener() {} }; context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8'), context);
  context.U.el = context.U.sv = node;
  context.U.clear = target => { target.children = []; };
  for (const file of ['canvas.js', 'layouts.js', 'matrix.js']) {
    vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf8'), context);
  }
  return context;
}
function matrixFixture() {
  const tables = ['F1', 'F2', 'D1', 'D2'].map(name => ({ name, role: name[0] === 'F' ? 'fact' : 'dim', relCount: 1 }));
  const relationships = ['1', '2'].map(n => ({ from: 'F' + n, fromCol: 'Key', to: 'D' + n, toCol: 'Id' }));
  return { tables, relationships, byName: Object.fromEntries(tables.map(t => [t.name, t])) };
}
function matrixApp() {
  return { modelKey: 'fixture', colorBy: 'domain', model: matrixFixture(), state: { loaded: true, viewMode: 'matrix' },
    isFact: t => t.role === 'fact', tableColor: () => '#2563eb',
    focusTable(name) { this.focused = name; },
    setViewMode(mode) { this.state.viewMode = mode; },
    setState(patch) { Object.assign(this.state, patch); },
  };
}

test('matrix updates immediately when table roles change without a model or count change', () => {
  const context = runtime(), app = matrixApp(), host = node('host');
  const view = new context.MatrixView(app, host); view.update();
  const before = view._key;
  assert.equal(all(host).filter(n => n.tag === 'th' && n.props.scope === 'col').length, 3);
  app.model.byName.F2.role = 'dim'; view.update();
  assert.notEqual(view._key, before);
  assert.equal(all(host).filter(n => n.tag === 'th' && n.props.scope === 'col').length, 2);
  assert.ok(all(host).some(n => n.props.text && n.props.text.includes('between non-fact tables omitted')));
});

test('a model with no fact tables has a covering empty state and working next actions', () => {
  const context = runtime(), app = matrixApp(), host = node('host');
  app.model.tables.forEach(t => { t.role = 'dim'; });
  const view = new context.MatrixView(app, host); view.update();
  assert.equal(host.children.length, 1);
  assert.match(host.children[0].props.style, /position:absolute;inset:0/);
  assert.ok(all(host).some(n => n.props.text === 'No connected fact tables'));
  assert.equal(view.el, host.children[0]);
  all(host).find(n => n.props.text === 'Review table roles').props.onClick();
  assert.equal(app.state.showRules, true);
  all(host).find(n => n.props.text === 'Explore tables').props.onClick();
  assert.equal(app.state.viewMode, 'graph');
});

test('matrix is a semantic table and empty relationships are not focusable controls', () => {
  const context = runtime(), app = matrixApp(), host = node('host');
  new context.MatrixView(app, host).update();
  assert.equal(all(host).filter(n => n.tag === 'table').length, 1);
  const empty = all(host).filter(n => n.props['aria-label'] === 'No direct relationship');
  assert.equal(empty.length, 2);
  empty.forEach(cell => {
    assert.equal(cell.tag, 'td');
    assert.equal(all(cell).some(n => n.tag === 'button' || n.props.tabindex != null), false);
  });
  const relationButton = all(host).find(n => n.tag === 'button' && (n.props['aria-label'] || '').includes(': 1 relationship'));
  assert.match(relationButton.props.title, /D1 filters F1/);
  relationButton.props.onClick();
  assert.equal(app.focused, 'D1');
});

test('table relationship tooltip escapes all model-supplied names', () => {
  const context = runtime();
  const injected = '<img src=x onerror="window.__smvInjected=1">';
  const html = context.GraphCanvas.prototype.relTip({ from: injected, fromCol: '<svg onload="bad()">', to: 'A&B', toCol: '<script>bad()</script>' });
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;svg'));
  assert.ok(html.includes('A&amp;B'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.doesNotMatch(html, /<(?:img|svg|script)\b/i);
});

test('aggregated domain relationship tooltip escapes model-supplied names on hover', () => {
  const context = runtime();
  const from = '<img src=x onerror="bad()">', to = 'A&B';
  const graph = Object.create(context.GraphCanvas.prototype);
  graph.app = { colorBy: 'domain', model: { byName: { [from]: { domain: 'G1' }, [to]: { domain: 'G2' } },
    relationships: [{ from, fromCol: '<svg onload="bad()">', to, toCol: '<script>bad()</script>' }] } };
  graph.svg = node('svg'); graph.cards = { [from]: {}, [to]: {} }; graph.expandedGroups = new Set();
  graph.groups = { G1: { x: 0, y: 0, w: 252, h: 150 }, G2: { x: 400, y: 0, w: 252, h: 150 } };
  graph.showTip = html => { graph.lastTip = html; };
  graph.clusterLines();
  graph.svg.children.find(n => n.tag === 'path').events.mouseenter({});
  assert.ok(graph.lastTip.includes('&lt;img'));
  assert.ok(graph.lastTip.includes('A&amp;B'));
  assert.doesNotMatch(graph.lastTip, /<(?:img|svg|script)\b/i);
});

/* ---------- the inspector belongs to the Tables canvas ---------- */

function sidebarRuntime() {
  const context = { console, Set, Map, addEventListener() {} }; context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'util.js'), 'utf8'), context);
  context.U.el = context.U.sv = node;
  context.U.clear = target => { target.children = []; target.firstChild = null; };
  vm.runInContext(fs.readFileSync(path.join(jsDir, 'sidebar.js'), 'utf8'), context);
  return context;
}

test('switching away from Tables closes the inspector, and coming back reopens it on the same table', () => {
  const context = sidebarRuntime(), host = node('drawer');
  const app = { modelKey: 'fixture', colorBy: 'domain', roleRepo: () => null,
    state: { loaded: true, selected: 'Sales', viewMode: 'graph', isolate: false, focusDepth: 1 },
    model: { byName: { Sales: { role: 'fact' } } },
    canvas: { locked: null, relIndex: () => -1 },
  };
  const sidebar = new context.Sidebar(app, host);
  let built = 0;
  sidebar.build = () => { built += 1; host.children.push(node('drawer-body')); host.firstChild = host.children[0]; return null; };

  sidebar.update();
  assert.equal(built, 1, 'Tables builds the drawer');
  assert.equal(host.children.length, 1);

  for (const mode of ['clusters', 'measures', 'matrix']) {
    app.state.viewMode = mode;
    sidebar.update();
    assert.equal(host.children.length, 0, mode + ' leaves no drawer over its canvas');
    assert.equal(sidebar._key, null, mode + ' clears the drawer key');
  }

  app.state.viewMode = 'graph';
  sidebar.update();
  assert.equal(built, 2, 'returning to Tables rebuilds the drawer');
  assert.equal(app.state.selected, 'Sales', 'the selection survives the round trip');
  assert.equal(host.children.length, 1);
});


function routingCanvas(boxes, expanded = []) {
  const context = runtime(), canvas = Object.create(context.GraphCanvas.prototype);
  Object.assign(canvas, { cards: Object.fromEntries(Object.keys(boxes).map(n => [n, { expanded: expanded.includes(n) }])),
    cardBox: n => boxes[n], anchorY: n => boxes[n].y + 24, lineStyle: 'ortho', view: { k: 1 } });
  return canvas;
}
function routingRects(boxes) {
  return Object.entries(boxes).map(([name, b]) => ({ name, x0: b.x - 6, x1: b.x + b.w + 6, y0: b.y - 6, y1: b.y + b.h + 6 }));
}

test('layered date-to-fact connection uses facing row edges and clears the item card', () => {
  const boxes = { Customer: { x: 0, y: 0, w: 252, h: 100 }, Date: { x: 310, y: 0, w: 252, h: 100 },
    Item: { x: 620, y: 0, w: 252, h: 100 }, Region: { x: 930, y: 0, w: 252, h: 100 },
    Fact: { x: 465, y: 300, w: 252, h: 100 } };
  const canvas = routingCanvas(boxes), rects = routingRects(boxes);
  for (const name of ['Customer', 'Date', 'Item', 'Region']) {
    const route = canvas.routeOf({ from: 'Fact', to: name });
    assert.equal(route.axis, 'v');
    assert.equal(route.ay, boxes.Fact.y);
    assert.equal(route.by, boxes[name].y + boxes[name].h);
    const geom = canvas.edgeGeom(route, 0, 0, rects);
    assert.ok(canvas.routeClear(geom.points, rects.filter(r => r.name !== name && r.name !== 'Fact')));
    assert.ok(geom.spots.length);
    assert.doesNotMatch(geom.d, /NaN|Infinity/);
  }
});

test('expanded cards preserve column anchors while horizontal approaches avoid obstacles', () => {
  const boxes = { A: { x: 0, y: 0, w: 252, h: 100 }, B: { x: 700, y: 220, w: 252, h: 100 },
    Block: { x: 290, y: 0, w: 252, h: 100 } };
  const canvas = routingCanvas(boxes, ['A']), route = canvas.routeOf({ from: 'A', to: 'B', fromCol: 'Key' });
  assert.equal(route.axis, undefined);
  assert.equal(route.ay, 24);
  const geom = canvas.edgeGeom(route, 0, 0, routingRects(boxes));
  assert.ok(canvas.routeClear(geom.points, routingRects({ Block: boxes.Block })));
  assert.ok(geom.points.length > 4, 'blocked horizontal leg requires a detour');
});

test('vertical obstacle detours retain endpoints and labels follow the routed segments', () => {
  const boxes = { A: { x: 0, y: 0, w: 252, h: 100 }, B: { x: 0, y: 500, w: 252, h: 100 },
    Block: { x: -40, y: 200, w: 330, h: 180 } };
  const canvas = routingCanvas(boxes), route = canvas.routeOf({ from: 'A', to: 'B' });
  const geom = canvas.edgeGeom(route, 0, 0, routingRects(boxes));
  assert.ok(canvas.routeClear(geom.points, routingRects({ Block: boxes.Block })));
  assert.equal(geom.points[0].x, route.ax);
  assert.equal(geom.points.at(-1).y, route.by);
  for (const spot of geom.spots) {
    assert.ok(geom.points.some((b, i) => {
      if (!i) return false;
      const a = geom.points[i - 1];
      return spot.x >= Math.min(a.x, b.x) && spot.x <= Math.max(a.x, b.x) &&
        spot.y >= Math.min(a.y, b.y) && spot.y <= Math.max(a.y, b.y) &&
        (a.x === b.x ? spot.orient === 'v' : spot.orient === 'h');
    }));
  }
});

test('fact ports are distinct and ordered by the other endpoint, regardless of metadata order', () => {
  const boxes = { Left: { x: 0, y: 0, w: 252, h: 100 }, Middle: { x: 310, y: 0, w: 252, h: 100 },
    Right: { x: 620, y: 0, w: 252, h: 100 }, Fact: { x: 310, y: 300, w: 252, h: 100 } };
  const canvas = routingCanvas(boxes);
  const vis = ['Right', 'Left', 'Middle'].map(to => ({ g0: canvas.routeOf({ from: 'Fact', to }) }));
  canvas.assignRelationshipPorts(vis);
  const ports = Object.fromEntries(vis.map(item => [item.g0.b, item.g0.ax]));
  assert.ok(ports.Left < ports.Middle && ports.Middle < ports.Right);
  assert.equal(new Set(Object.values(ports)).size, 3);
  assert.ok(Object.values(ports).every(x => x > boxes.Fact.x && x < boxes.Fact.x + boxes.Fact.w));
  assert.ok(vis.every(item => item.g0.adegree === 3 && item.g0.bdegree === 1));
});

test('curved row connections leave and enter vertically with the correct label direction', () => {
  const boxes = { A: { x: 0, y: 0, w: 252, h: 100 }, B: { x: 0, y: 300, w: 252, h: 100 } };
  const canvas = routingCanvas(boxes); canvas.lineStyle = 'curve';
  const geom = canvas.edgeGeom(canvas.routeOf({ from: 'A', to: 'B' }), 0, 0, []);
  assert.match(geom.d, /^M 126 100 C 126 200, 126 200, 126 300$/);
  assert.ok(geom.spots.every(spot => spot.orient === 'v' && spot.toA === -1));
});

test('each endpoint chooses its side independently for a diagonal layout', () => {
  const boxes = { Wide: { x: 0, y: 0, w: 252, h: 100 }, Tall: { x: 350, y: 250, w: 120, h: 300 } };
  const canvas = routingCanvas(boxes), route = canvas.routeOf({ from: 'Wide', to: 'Tall' });
  assert.equal(route.axis, 'mixed');
  assert.equal(route.aaxis, 'v');
  assert.equal(route.baxis, 'h');
  assert.equal(route.ay, boxes.Wide.h);
  assert.equal(route.bx, boxes.Tall.x);
  const points = canvas.edgeGeom(route, 0, 0, routingRects(boxes)).points;
  assert.equal(points[0].x, points[1].x, 'leave the bottom vertically');
  assert.equal(points.at(-1).y, points.at(-2).y, 'enter the left side horizontally');
  const reversed = canvas.routeOf({ from: 'Tall', to: 'Wide' });
  assert.equal(reversed.aaxis, 'h');
  assert.equal(reversed.baxis, 'v');
  canvas.lineStyle = 'curve';
  assert.doesNotMatch(canvas.edgeGeom(route, 0, 0, []).d, /NaN|Infinity/);
});

test('one table uses different sides for neighbors above, below, left and right', () => {
  const boxes = { Center: { x: 400, y: 300, w: 252, h: 100 }, Above: { x: 400, y: 0, w: 252, h: 100 },
    Below: { x: 400, y: 600, w: 252, h: 100 }, Left: { x: 0, y: 300, w: 252, h: 100 },
    Right: { x: 800, y: 300, w: 252, h: 100 }, FarDiagonal: { x: 2000, y: 500, w: 252, h: 100 } };
  const canvas = routingCanvas(boxes);
  const vis = ['Above', 'Below', 'Left', 'Right', 'FarDiagonal'].map(to => ({ g0: canvas.routeOf({ from: 'Center', to }) }));
  canvas.assignRelationshipPorts(vis);
  const routes = Object.fromEntries(vis.map(item => [item.g0.b, item.g0]));
  assert.equal(routes.Above.aaxis, 'v'); assert.equal(routes.Above.adir, -1);
  assert.equal(routes.Below.aaxis, 'v'); assert.equal(routes.Below.adir, 1);
  assert.equal(routes.Left.aaxis, 'h'); assert.equal(routes.Left.adir, -1);
  assert.equal(routes.Right.aaxis, 'h'); assert.equal(routes.Right.adir, 1);
  assert.equal(routes.FarDiagonal.aaxis, 'h', 'vertical separation alone must not force a bottom connection');
  assert.notEqual(routes.Right.ay, routes.FarDiagonal.ay, 'separate ports on the right edge');
});


test('a tiny relationship still provides a fallback arrow seat at the zoom floor', () => {
  const canvas = routingCanvas({}); canvas.view.k = 0.25;
  const g0 = { ax: 0, ay: 0, bx: 8, by: 8, adir: 1, bdir: -1, aaxis: 'v', baxis: 'h', axis: 'mixed' };
  for (const bare of [true, false]) {
    const geom = canvas.edgeGeom(g0, 0, 0, [], bare);
    assert.ok(geom.spots.length);
    assert.doesNotThrow(() => canvas.pillBox(canvas.pickSpot(geom.spots, [])));
  }
});
