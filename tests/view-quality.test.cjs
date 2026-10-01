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
