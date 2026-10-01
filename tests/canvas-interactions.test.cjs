const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the shipped handlers with real selection/visibility behavior and
// event bubbling. Only rendering, persistence and geometry measurement are stubbed.
class Surface {
  constructor(tag = 'div', parent = null, dataName = null) {
    Object.assign(this, { tag, parent, dataName, style: {}, listeners: new Map() });
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  appendChild() {}
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  closest(selector) {
    const selectors = selector.split(',');
    for (let node = this; node; node = node.parent) {
      if (selectors.some(s => s === '[data-name]' ? node.dataName !== null : s === node.tag)) return node;
    }
    return null;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 700 }; }
  fire(type, detail = {}) {
    const event = { button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 100, clientY: 100,
      target: this, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; }, ...detail };
    for (let node = this; node; node = node.parent) {
      for (const listener of Array.from(node.listeners.get(type) || [])) {
        if (node.listeners.get(type)?.has(listener)) listener(event);
      }
      if (event.stopped) break;
    }
    return event;
  }
}
function fixture({ isolated = false, pins = [], locked = null, zoom = 1 } = {}) {
  const win = new Surface('window'), host = new Surface();
  const stored = new Map();
  const context = { console, Set, Map, Math, Number, window: win,
    U: { el: () => new Surface(), store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v), del: k => stored.delete(k),
      getJSON: (k, d) => (stored.has(k) ? stored.get(k) : d), setJSON: (k, v) => stored.set(k, v) } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js/canvas.js'), 'utf8'), context);
  const canvas = Object.create(win.GraphCanvas.prototype);
  const tables = ['A', 'B', 'C', 'P', 'L'].map(name => ({ name, domain: 'Test', relCount: ['A', 'B'].includes(name) ? 1 : 0 }));
  const relationship = { from: 'B', to: 'A', fromCol: 'Key', toCol: 'Id' };
  const app = {
    model: { tables, relationships: [relationship], byName: Object.fromEntries(tables.map(t => [t.name, t])) },
    state: { selected: 'A', activeFilter: null, isolate: isolated, focusDepth: 1 },
    isFact: () => false,
    setState(patch, callback) { Object.assign(this.state, patch); if (callback) callback(); },
  };
  Object.assign(canvas, {
    app, host, cards: {}, pos: {}, cpos: {}, view: { x: 15, y: 20, k: zoom },
    pinned: new Set(pins), marked: new Set(), locked, _activeSel: 'A', selRel: null,
    workspaceNames: new Set(tables.map(t => t.name)), showSA: true, clusterOn: false,
    transformCount: 0, persisted: 0, fitCount: 0,
    updateTransform() { this.transformCount++; }, renderLines() {}, hideRelPopover() {},
    persist() { this.persisted++; }, fitView() { this.fitCount++; },
  });
  app.canvas = canvas;
  tables.forEach((table, i) => {
    const el = new Surface('div', host, table.name), head = new Surface('div', el);
    canvas.cards[table.name] = { table, el, head, lock: { style: {} } };
    canvas.pos[table.name] = { x: i * 300, y: i * 100 };
    canvas.bindCardDrag(table.name);
  });
  canvas.bindPanZoom(host); canvas.applyHighlight();
  return { canvas, app, win, host, relationship };
}
function focusState(canvas) {
  return { selected: canvas.app.state.selected, active: canvas._activeSel,
    filter: canvas.app.state.activeFilter, isolate: canvas.app.state.isolate,
    pins: Array.from(canvas.pinned), locked: canvas.locked, relationship: canvas.selRel,
    roots: Array.from(canvas.rootsSet()) };
}
const viewport = canvas => ({ ...canvas.view });

/* selectTable defers its fit until the inspector has opened, which means the fit lands after
   whatever the caller did next. A caller that has already aimed the viewport — Center
   selected, a click on a chip — says so, and keeps the aim it just made. */
test('an explicit focus keeps the viewport it aimed at; an ordinary selection still refits', () => {
  const { canvas } = fixture({ isolated: true });
  canvas.fitCount = 0;
  canvas.selectTable('B');
  assert.equal(canvas.fitCount, 1, 'selecting a table in isolate mode refits the canvas');
  canvas.selectTable('C', { keepView: true });
  assert.equal(canvas.fitCount, 1, 'an explicit focus is not undone by a deferred fit');
  assert.equal(canvas.app.state.selected, 'C', 'it still selects the table');
});

test('panning preserves selected table, pins, lock, relationship and isolate visibility', () => {
  const { canvas, win, host, relationship } = fixture({ isolated: true, pins: ['P'], locked: 'L' });
  canvas.selRel = relationship;
  const before = focusState(canvas), membership = Array.from(canvas.workspaceNames);
  assert.equal(canvas.cards.C.el.style.display, 'none');
  host.fire('mousedown');
  assert.deepEqual(focusState(canvas), before, 'Selection must not clear on pointer down');
  win.fire('mousemove', { clientX: 155, clientY: 125 });
  assert.deepEqual(viewport(canvas), { x: 70, y: 45, k: 1 });
  assert.deepEqual(focusState(canvas), before);
  assert.equal(canvas.cards.C.el.style.display, 'none');
  win.fire('mouseup', { clientX: 155, clientY: 125 });
  assert.deepEqual(focusState(canvas), before);
  assert.deepEqual(Array.from(canvas.workspaceNames), membership);
  assert.equal(canvas.persisted, 0);
  assert.equal(host.style.cursor, 'grab');
});

test('an out-and-back pan remains a drag when released at its starting point', () => {
  const { canvas, win, host } = fixture();
  const before = focusState(canvas), initial = viewport(canvas);
  host.fire('mousedown');
  win.fire('mousemove', { clientX: 145, clientY: 135 });
  win.fire('mousemove');
  win.fire('mouseup');
  assert.deepEqual(viewport(canvas), initial);
  assert.deepEqual(focusState(canvas), before);
  assert.equal(canvas.transformCount, 2);
});

test('a background click clears selection and pins only after release while retaining its lock', () => {
  const { canvas, win, host, relationship } = fixture({ pins: ['P'], locked: 'L' });
  canvas.selRel = relationship;
  host.fire('mousedown');
  assert.equal(canvas.app.state.selected, 'A');
  win.fire('mouseup');
  assert.equal(canvas.app.state.selected, null);
  assert.equal(canvas._activeSel, null);
  assert.equal(canvas.pinned.size, 0);
  assert.equal(canvas.selRel, null);
  assert.equal(canvas.locked, 'L');
  assert.deepEqual(Array.from(canvas.rootsSet()), ['L']);
  assert.equal(canvas.transformCount, 0);
});

test('pointer jitter stays a click and never moves the viewport', () => {
  const { canvas, win, host } = fixture(), initial = viewport(canvas);
  host.fire('mousedown');
  win.fire('mousemove', { clientX: 102, clientY: 102 });
  assert.equal(canvas.app.state.selected, 'A');
  assert.deepEqual(viewport(canvas), initial);
  win.fire('mouseup', { clientX: 102, clientY: 102 });
  assert.equal(canvas.app.state.selected, null);
  assert.deepEqual(viewport(canvas), initial);
  assert.equal(canvas.transformCount, 0);
});

test('pan threshold uses screen pixels at every zoom', () => {
  for (const zoom of [0.2, 1, 2.2]) {
    const { canvas, win, host } = fixture({ zoom });
    host.fire('mousedown');
    win.fire('mousemove', { clientX: 104 });
    assert.equal(canvas.transformCount, 0);
    win.fire('mousemove', { clientX: 105 });
    win.fire('mouseup', { clientX: 105 });
    assert.equal(canvas.app.state.selected, 'A');
    assert.deepEqual(viewport(canvas), { x: 20, y: 20, k: zoom });
  }
});

test('right and middle gestures cannot pan or clear selection', () => {
  for (const button of [1, 2]) {
    const { canvas, win, host } = fixture({ pins: ['P'], locked: 'L' });
    const before = focusState(canvas), initial = viewport(canvas);
    host.fire('mousedown', { button });
    win.fire('mousemove', { clientX: 180, clientY: 180 });
    win.fire('mouseup', { button, clientX: 180, clientY: 180 });
    assert.deepEqual(focusState(canvas), before);
    assert.deepEqual(viewport(canvas), initial);
    assert.equal(canvas.transformCount, 0);
  }
});

test('moving another card preserves existing selection, pins and locked roots', () => {
  const { canvas, win } = fixture({ isolated: true, pins: ['P'], locked: 'L', zoom: 2 });
  const before = focusState(canvas), initial = viewport(canvas), oldPosition = { ...canvas.pos.B };
  canvas.cards.B.head.fire('mousedown');
  win.fire('mousemove', { clientX: 160, clientY: 130 });
  win.fire('mouseup', { clientX: 160, clientY: 130 });
  assert.deepEqual({ ...canvas.pos.B }, { x: oldPosition.x + 30, y: oldPosition.y + 15 });
  assert.deepEqual(focusState(canvas), before);
  assert.deepEqual(viewport(canvas), initial);
  assert.equal(canvas.persisted, 1);
  assert.equal(canvas.cards.C.el.style.display, 'none');
  assert.equal(canvas.cards.B.head.style.cursor, 'grab');
});

test('a card click selects that card without becoming a background click', () => {
  const { canvas, win } = fixture();
  canvas.cards.B.head.fire('mousedown'); win.fire('mouseup');
  assert.equal(canvas.app.state.selected, 'B');
  assert.equal(canvas._activeSel, 'B');
  assert.equal(canvas.persisted, 0);
});

test('right and middle gestures cannot move or select a card', () => {
  for (const button of [1, 2]) {
    const { canvas, win } = fixture();
    const before = focusState(canvas), initial = { ...canvas.pos.B };
    canvas.cards.B.head.fire('mousedown', { button });
    win.fire('mousemove', { clientX: 170, clientY: 125 });
    win.fire('mouseup', { button, clientX: 170, clientY: 125 });
    assert.deepEqual({ ...canvas.pos.B }, initial);
    assert.deepEqual(focusState(canvas), before);
    assert.equal(canvas.persisted, 0);
  }
});

test('canvas controls and their descendants cannot initiate a pan', () => {
  for (const tag of ['button', 'input', 'select', 'a']) {
    const { canvas, win, host } = fixture();
    const icon = new Surface('span', new Surface(tag, host));
    const before = focusState(canvas), initial = viewport(canvas);
    icon.fire('mousedown');
    win.fire('mousemove', { clientX: 160, clientY: 140 });
    win.fire('mouseup', { clientX: 160, clientY: 140 });
    assert.deepEqual(focusState(canvas), before, tag);
    assert.deepEqual(viewport(canvas), initial, tag);
    assert.equal(canvas.transformCount, 0, tag);
  }
});

test('blur cancels a pending background click without clearing selection', () => {
  const { canvas, win, host } = fixture({ pins: ['P'] });
  const before = focusState(canvas), initial = viewport(canvas);
  host.fire('mousedown'); win.fire('blur'); win.fire('mouseup');
  win.fire('mousemove', { clientX: 175, clientY: 175 });
  assert.deepEqual(focusState(canvas), before);
  assert.deepEqual(viewport(canvas), initial);
  assert.equal(canvas.transformCount, 0);
  assert.equal(host.style.cursor, 'grab');
});

test('blur ends a pan until a fresh gesture starts', () => {
  const { canvas, win, host } = fixture(), before = focusState(canvas);
  host.fire('mousedown');
  win.fire('mousemove', { clientX: 150, clientY: 130 });
  const stopped = viewport(canvas);
  win.fire('blur');
  win.fire('mousemove', { clientX: 190, clientY: 170 });
  win.fire('mouseup', { clientX: 190, clientY: 170 });
  assert.deepEqual(viewport(canvas), stopped);
  assert.deepEqual(focusState(canvas), before);
  assert.equal(canvas.transformCount, 1);
  host.fire('mousedown', { clientX: 200, clientY: 200 });
  win.fire('mousemove', { clientX: 210, clientY: 215 });
  win.fire('mouseup', { clientX: 210, clientY: 215 });
  assert.deepEqual(viewport(canvas), { x: stopped.x + 10, y: stopped.y + 15, k: stopped.k });
  assert.deepEqual(focusState(canvas), before);
});

test('blur ends a card drag, persists its position once and ignores later pointer movement', () => {
  const { canvas, win } = fixture({ pins: ['P'], locked: 'L' }), before = focusState(canvas);
  canvas.cards.B.head.fire('mousedown');
  win.fire('mousemove', { clientX: 140, clientY: 125 });
  const stopped = { ...canvas.pos.B };
  win.fire('blur');
  assert.equal(canvas.persisted, 1);
  assert.equal(canvas.cards.B.head.style.cursor, 'grab');
  win.fire('mousemove', { clientX: 190, clientY: 175 });
  win.fire('mouseup', { clientX: 190, clientY: 175 });
  assert.deepEqual({ ...canvas.pos.B }, stopped);
  assert.deepEqual(focusState(canvas), before);
  assert.equal(canvas.persisted, 1);
});

test('shift+drag on the background marks the tables the box touches without panning or clearing focus', () => {
  const { canvas, win, host, app } = fixture();
  Object.assign(canvas, { cardBox: n => ({ x: canvas.pos[n].x, y: canvas.pos[n].y, w: 252, h: 105 }) });
  canvas.cards.C.el.style.display = 'none';
  host.fire('mousedown', { shiftKey: true, clientX: 0, clientY: 0 });
  win.fire('mousemove', { clientX: 620, clientY: 160 });
  win.fire('mouseup', { clientX: 620, clientY: 160 });
  assert.deepEqual(Array.from(canvas.marked).sort(), ['A', 'B']);
  assert.ok(!canvas.marked.has('C'), 'hidden cards are never marked');
  assert.deepEqual(viewport(canvas), { x: 15, y: 20, k: 1 }, 'a marquee does not pan');
  assert.equal(app.state.selected, 'A', 'marking leaves the inspector selection alone');
  assert.equal(canvas.cards.A.el.style.outline.includes('dashed'), true);
});

test('alt+click toggles a table in the marked set and a background click clears it', () => {
  const { canvas, win, host } = fixture();
  canvas.cards.B.head.fire('mousedown');
  canvas.cards.B.head.fire('mouseup', { altKey: true });
  win.fire('mouseup', { altKey: true });
  assert.deepEqual(Array.from(canvas.marked), ['B']);
  host.fire('mousedown');
  win.fire('mouseup');
  assert.equal(canvas.marked.size, 0);
  assert.equal(canvas.cards.B.el.style.outline, '');
});
