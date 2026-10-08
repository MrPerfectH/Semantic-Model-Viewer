'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RelationshipGraph = require('../js/relationships.js');

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function node() {
  const classes = new Set();
  return {
    style: {}, children: [], listeners: {}, hidden: false,
    clientWidth: 800, clientHeight: 500,
    classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, toggle() {}, contains(name) { return classes.has(name); } },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    addEventListener(name, action) { this.listeners[name] = action; },
    dispatch(type, event) {
      if (!event.target) event.target = this;
      event.currentTarget = this;
      if (this.listeners[type]) this.listeners[type](event);
      if (!event.propagationStopped && this.parentNode) this.parentNode.dispatch(type, event);
    },
    getBoundingClientRect() { return { left: 30, top: 60, right: 230, bottom: 172, width: 200, height: 112 }; },
    setPointerCapture() {}
  };
}

function tableDragEvent(name = 'A', clientX = 400, clientY = 300) {
  return {
    dataTransfer: {
      types: ['application/x-smv-table'],
      getData(type) { return type === 'application/x-smv-table' ? name : ''; }
    },
    clientX, clientY, defaultPrevented: false, propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  };
}

function fixture(storage = new Map(), modelKey = 'first') {
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); } };
  const window = { addEventListener() {}, RelationshipGraph };
  const U = {
    el() { return node(); },
    store: {
      get(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
      set(key, value) { storage.set(key, value); },
      del(key) { storage.delete(key); },
      getJSON(key, fallback) { return storage.has(key) ? copy(storage.get(key)) : fallback; },
      setJSON(key, value, onFail) { try { storage.set(key, copy(value)); } catch (error) { if (onFail) onFail(error); } }
    }
  };
  const context = vm.createContext({ window, document, U, requestAnimationFrame() {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/explorer.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/canvas.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/layouts.js'), 'utf8'), context); // Arrange runs the chosen layout
  const tables = ['A', 'B', 'C'].map(name => ({ name, role: 'dim', columns: [], colCount: 0, measures: [] }));
  const app = {
    modelKey, colorBy: 'domain', state: { selected: null, isolate: false, focusDepth: 1, viewMode: 'graph' }, sidebar: {},
    model: { tables, byName: Object.fromEntries(tables.map(t => [t.name, t])), relationships: [] },
    isFact(t) { return t.role === 'fact'; },
    setState(patch) { Object.assign(this.state, patch); }
  };
  const cv = app.canvas = {
    app, host: node(), CARD_W: 252,
    pos: { A: { x: 20, y: 30 }, B: { x: 500, y: 50 }, C: { x: 30, y: 500 } },
    view: { x: 0, y: 0, k: 1 }, pinned: new Set(), marked: new Set(), locked: null, detailMode: 'auto', lineStyle: 'ortho',
    relPop: node(),
    cards: Object.fromEntries(tables.map(t => [t.name, { table: t, h: 100, el: node(), body: node(), caret: node(), expanded: false }])),
    persist() { storage.set('positions_' + app.modelKey, copy(this.pos)); },
    applyHighlight() { this._activeSel = app.state.selected; this.refreshVisibility(); }, renderLines() {}, layoutCard() {}, updateTransform() {}, fitView() {}, recolor() {},
    hideRelPopover() { this.relPop.style.display = 'none'; },
    selectTable(name) { app.state.selected = name; this._activeSel = name; this.refreshVisibility(); }
  };
  // the real prototype (canvas.js + the layout engine mixed into it), with the handful of
  // DOM-bound members above overriding it — no list of method names to keep in step
  const canvasMethods = window.GraphCanvas.prototype;
  Object.setPrototypeOf(cv, canvasMethods);
  cv.LSKEY = 'lsa_model_layout_v1';
  const explorer = new window.TableExplorer(app);
  const main = document.getElementById('main');
  main.appendChild(cv.host);
  main.appendChild(explorer.empty); // Empty-state greeting is a canvas sibling in the real app.
  cv.host.getBoundingClientRect = () => ({ left: 30, top: 60, right: 830, bottom: 560, width: 800, height: 500 });
  app.explorer = explorer;
  explorer.update = function () {};
  explorer.loadModel();
  return { app, cv, explorer, storage, main, canvasMethods: window.GraphCanvas.prototype };
}

test('blank canvas and table membership persist separately for each model', () => {
  const { explorer, storage } = fixture();
  assert.equal(explorer.names.size, 0);
  explorer.add(['A']);
  assert.deepEqual([...fixture(storage).explorer.names], ['A']);
  assert.equal(fixture(storage, 'second').explorer.names.size, 0);
  explorer.blank();
  assert.equal(fixture(storage).explorer.names.size, 0);
});

/* persist() writes the whole position map on every add and every automatic layout, so the
   map is no answer to "has the reader arranged this model?" — only a drag, an Arrange or a
   restored saved view is. Until one of those happens, Explore all runs the chosen layout. */
test('Explore all keeps laying the model out until the reader actually arranges it', () => {
  const { explorer, cv } = fixture();
  /* One Explore all may run the layout more than once — the arrange loop re-cuts the lanes
     for the zoom Fit lands on — so count whether it ran at all, not how many passes it took. */
  const runs = [];
  cv.untangle = opts => { runs.push(opts); };
  let before = 0;
  const ran = () => { const yes = runs.length > before; before = runs.length; return yes; };

  explorer.add(['A']);                       // adding a table persists positions...
  explorer.showAll();
  assert.ok(ran(), '...but that is not an arrangement, so the layout still runs');

  explorer.blank();
  explorer.showAll();
  assert.ok(ran());

  cv.markArranged();                         // a drag, Arrange, or a restored view
  explorer.blank();
  explorer.showAll();
  assert.equal(ran(), false, 'an arranged model keeps the positions the reader gave it');

  cv.clearArranged();                        // Reset layout puts it back
  explorer.blank();
  explorer.showAll();
  assert.ok(ran());
});

test('saved membership ignores deleted table names', () => {
  const storage = new Map([['smv_workspace_v1_first', { tables: ['A', 'Gone'] }]]);
  assert.deepEqual([...fixture(storage).explorer.names], ['A']);
});

test('remove clears focus and membership and undo restores the table', () => {
  const { explorer, cv, app } = fixture();
  explorer.add(['A']); cv.pinned.add('A'); cv.locked = 'A';
  explorer.remove('A');
  assert.equal(explorer.names.has('A'), false);
  assert.equal(cv.pinned.has('A'), false);
  assert.equal(cv.locked, null);
  assert.equal(app.state.selected, null);
  explorer.undo();
  assert.equal(explorer.names.has('A'), true);
});

test('removeMany drops several tables, their marks and focus in one undoable step', () => {
  const { explorer, cv, app } = fixture();
  explorer.add(['A', 'B', 'C']);
  cv.marked = new Set(['A', 'B']); cv.pinned.add('B'); cv.locked = 'A'; app.state.selected = 'B';
  const history = explorer.history.length;
  explorer.removeMany(['A', 'B', 'Z']);
  assert.deepEqual(Array.from(explorer.names), ['C']);
  assert.equal(cv.marked.size, 0);
  assert.equal(cv.pinned.size, 0);
  assert.equal(cv.locked, null);
  assert.equal(app.state.selected, null);
  assert.equal(explorer.history.length, history + 1, 'one snapshot for the whole batch');
  explorer.undo();
  assert.deepEqual(Array.from(explorer.names).sort(), ['A', 'B', 'C']);
});

test('removeMany with nothing on the canvas is a no-op that leaves undo untouched', () => {
  const { explorer } = fixture();
  const history = explorer.history.length;
  explorer.removeMany(['A']);
  assert.equal(explorer.history.length, history);
});

test('blank layout can be undone with positions and viewport restored', () => {
  const { explorer, cv } = fixture();
  explorer.add(['A']);
  cv.pos.A = { x: 160, y: 210 }; cv.view = { x: 120, y: -200, k: 1.5 };
  explorer.blank();
  assert.equal(explorer.names.size, 0);
  assert.deepEqual(copy(cv.view), { x: 0, y: 0, k: 1 });
  explorer.undo();
  assert.deepEqual([...explorer.names], ['A']);
  assert.deepEqual(copy(cv.pos.A), { x: 160, y: 210 });
  assert.deepEqual(copy(cv.view), { x: 120, y: -200, k: 1.5 });
});

test('dragging a table converts screen coordinates and persists the placement', () => {
  const { explorer, cv, storage } = fixture();
  cv.view = { x: -100, y: 20, k: 2 };
  const event = tableDragEvent();
  cv.host.dispatch('drop', event);
  assert.equal(explorer.names.has('A'), true);
  assert.deepEqual(copy(cv.pos.A), { x: 109, y: 80 });
  assert.deepEqual(storage.get('positions_first').A, { x: 109, y: 80 });
});

test('dragging over the empty-state sibling bubbles to main and adds the first table', () => {
  const { explorer, cv, main, storage } = fixture();
  assert.equal(explorer.names.size, 0);
  assert.equal(explorer.empty.parentNode, main);
  assert.notEqual(explorer.empty.parentNode, cv.host);
  const over = tableDragEvent();
  explorer.empty.dispatch('dragover', over);
  assert.equal(over.defaultPrevented, true);
  assert.equal(over.propagationStopped, true);
  assert.equal(over.dataTransfer.dropEffect, 'copy');
  assert.equal(cv.host.classList.contains('ex-drop'), true);
  const drop = tableDragEvent();
  explorer.empty.dispatch('drop', drop);
  assert.deepEqual([...explorer.names], ['A']);
  assert.equal(drop.defaultPrevented, true);
  assert.equal(drop.propagationStopped, true);
  assert.equal(cv.host.classList.contains('ex-drop'), false);
  assert.deepEqual(storage.get('positions_first').A, { x: 244, y: 210 });
});

test('table drops outside every edge of the canvas are rejected', () => {
  const points = [[29, 300], [831, 300], [400, 59], [400, 561]];
  for (const [x, y] of points) {
    const { explorer, main, storage } = fixture();
    const before = copy(explorer.app.canvas.pos);
    const over = tableDragEvent('A', x, y);
    main.dispatch('dragover', over);
    assert.equal(over.defaultPrevented, false);
    const drop = tableDragEvent('A', x, y);
    main.dispatch('drop', drop);
    assert.equal(explorer.names.size, 0);
    assert.equal(explorer.history.length, 0);
    assert.equal(drop.defaultPrevented, false);
    assert.deepEqual(copy(explorer.app.canvas.pos), before);
    assert.equal(storage.has('positions_first'), false);
  }
});

test('table drops in other views are rejected even inside the canvas rectangle', () => {
  for (const mode of ['measures', 'matrix', 'clusters']) {
    const { explorer, app, main, storage } = fixture();
    app.state.viewMode = mode;
    const over = tableDragEvent();
    main.dispatch('dragover', over);
    assert.equal(over.defaultPrevented, false);
    const drop = tableDragEvent();
    main.dispatch('drop', drop);
    assert.equal(explorer.names.size, 0);
    assert.equal(explorer.history.length, 0);
    assert.equal(drop.defaultPrevented, false);
    assert.equal(storage.has('positions_first'), false);
  }
});

test('file drags remain available to model import without changing canvas membership', () => {
  const { explorer, main } = fixture();
  const over = tableDragEvent();
  over.dataTransfer.types = ['Files'];
  over.dataTransfer.getData = () => '';
  main.dispatch('dragover', over);
  assert.equal(over.defaultPrevented, false);
  main.dispatch('drop', over);
  assert.equal(explorer.names.size, 0);
  assert.equal(over.propagationStopped, false);
});

test('undo persists restored positions so reload cannot resurrect an undone arrangement', () => {
  const { explorer, cv, storage } = fixture();
  explorer.add(['A', 'B']);
  cv.pos.A = { x: 913, y: 472 }; cv.pos.B = { x: -255, y: 730 }; cv.persist();
  const before = copy(cv.pos);
  explorer.arrangeSubset(true);
  assert.notDeepEqual(copy(cv.pos), before);
  explorer.undo();
  assert.deepEqual(copy(cv.pos), before);
  assert.deepEqual(storage.get('positions_first'), before);
});

test('adding another table preserves positions already arranged by the user', () => {
  const { explorer, cv } = fixture();
  explorer.add(['A']);
  cv.pos.A = { x: 850, y: -120 };
  explorer.add(['B']);
  assert.deepEqual(copy(cv.pos.A), { x: 850, y: -120 });
});

test('a no-op add leaves undo history unchanged', () => {
  const { explorer } = fixture();
  explorer.add(['A']); const count = explorer.history.length;
  explorer.add(['A']);
  assert.equal(explorer.history.length, count);
});

test('restoring membership clears selected, locked and pinned tables outside that layout', () => {
  const { explorer, cv, app } = fixture();
  explorer.add(['A']); cv.pinned.add('A'); cv.locked = 'A'; cv._activeSel = 'A';
  explorer.setNames(['C']);
  assert.equal(app.state.selected, null);
  assert.equal(cv._activeSel, null);
  assert.equal(cv.locked, null);
  assert.equal(cv.pinned.has('A'), false);
});

test('blank layout closes a previously selected relationship popover', () => {
  const { explorer, cv } = fixture();
  explorer.add(['A', 'B']);
  cv.selRel = { from: 'B', to: 'A' }; cv.relPop.style.display = 'block';
  explorer.blank();
  assert.equal(cv.selRel, null);
  assert.equal(cv.relPop.style.display, 'none');
});

test('removing a relationship endpoint closes its popover', () => {
  const { explorer, cv } = fixture();
  explorer.add(['A', 'B']);
  cv.selRel = { from: 'B', to: 'A' }; cv.relPop.style.display = 'block';
  explorer.remove('B');
  assert.equal(cv.selRel, null);
  assert.equal(cv.relPop.style.display, 'none');
});

test('relationship expansion respects direct/incoming/all settings', () => {
  const { explorer, app } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A' }, { from: 'C', to: 'B' }];
  app.state.selected = 'C'; explorer.direction = 'incoming'; explorer.depth = 'direct';
  assert.deepEqual([...explorer.related().names].sort(), ['B', 'C']);
  explorer.depth = 'all';
  assert.deepEqual([...explorer.related().names].sort(), ['A', 'B', 'C']);
});

test('minimap navigation centers its chosen world point without changing zoom', () => {
  const { explorer, cv } = fixture();
  explorer.mapBounds = { x: -100, y: -200, scale: 0.1, ox: 10, oy: 6 };
  cv.view = { x: 0, y: 0, k: 2 };
  explorer.navigateMap({ clientX: 140, clientY: 116 });
  assert.deepEqual(copy(cv.view), { x: -1400, y: -350, k: 2 });
});

test('canvas visibility honors blank and partial membership even for connected tables', () => {
  const { explorer, cv, canvasMethods } = fixture();
  cv.rootsSet = () => new Set();
  canvasMethods.refreshVisibility.call(cv);
  assert.equal(cv.cards.A.el.style.display, 'none');
  assert.equal(cv.cards.B.el.style.display, 'none');
  explorer.add(['A']);
  canvasMethods.refreshVisibility.call(cv);
  assert.equal(cv.cards.A.el.style.display, '');
  assert.equal(cv.cards.B.el.style.display, 'none');
});

test('named presets restore membership, positions and viewport, including an empty canvas', () => {
  const { explorer, cv, canvasMethods } = fixture();
  for (const name of ['presetsKey', 'getPresets', 'setPresets', 'savePreset', 'applyPreset']) cv[name] = canvasMethods[name];
  cv.app = explorer.app;
  cv.savePreset('Blank');
  explorer.add(['A']); cv.pos.A = { x: 670, y: 800 }; cv.view = { x: 400, y: 200, k: 0.75 };
  cv.savePreset('One table');
  explorer.showAll();
  const saved = cv.getPresets();
  cv.applyPreset(saved.find(preset => preset.name === 'One table'));
  assert.deepEqual([...explorer.names], ['A']);
  assert.deepEqual(copy(cv.pos.A), { x: 670, y: 800 });
  assert.deepEqual(copy(cv.view), { x: 400, y: 200, k: 0.75 });
  cv.applyPreset(saved.find(preset => preset.name === 'Blank'));
  assert.equal(explorer.names.size, 0);
  explorer.undo();
  assert.deepEqual([...explorer.names], ['A']);
});

test('named views restore focus and hide unrelated without losing hidden table membership', () => {
  const { app, explorer, cv, storage } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A' }];
  explorer.showAll();
  cv.selectTable('A'); cv.pinned.add('B'); cv.locked = 'B';
  explorer.setFocus(true, 2);
  cv.pos.A = { x: -315, y: 450 }; cv.view = { x: 400, y: -260, k: 0.65 };
  const originalFocus = copy(cv.captureFocus());
  assert.equal(cv.cards.C.el.style.display, 'none');
  assert.equal(cv.savePreset('Supply analysis'), 'Supply analysis');
  const saved = fixture(storage).cv.getPresets()[0];
  assert.deepEqual(copy(saved.tables).sort(), ['A', 'B', 'C']);
  explorer.blank();
  cv.applyPreset(saved);
  assert.deepEqual(copy(cv.captureFocus()), originalFocus);
  assert.deepEqual([...explorer.names].sort(), ['A', 'B', 'C']);
  assert.deepEqual(copy(cv.pos.A), { x: -315, y: 450 });
  assert.deepEqual(copy(cv.view), { x: 400, y: -260, k: 0.65 });
  assert.equal(cv.cards.A.el.style.display, '');
  assert.equal(cv.cards.B.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, 'none');
  assert.deepEqual(copy(storage.get('smv_workspace_v1_first').tables).sort(), ['A', 'B', 'C']);
});

test('hide unrelated follows distance but never adds related tables outside membership', () => {
  const { app, explorer, cv } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A' }, { from: 'C', to: 'B' }];
  explorer.showAll(); cv.selectTable('A');
  explorer.setFocus(true, 1);
  assert.equal(cv.cards.B.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, 'none');
  explorer.setFocus(true, 2);
  assert.equal(cv.cards.C.el.style.display, '');
  explorer.remove('C');
  explorer.setFocus(true, 1000000);
  assert.equal(cv.cards.C.el.style.display, 'none');
  assert.deepEqual([...explorer.names].sort(), ['A', 'B']);
  explorer.setFocus(false, 1);
  assert.equal(app.state.isolate, false);
  assert.equal(cv.cards.B.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, 'none');
});

test('legacy presets clear prior focus even if the formerly selected table remains a member', () => {
  const { explorer, app, cv } = fixture();
  explorer.showAll(); cv.selectTable('A'); cv.pinned.add('B'); cv.locked = 'B';
  explorer.setFocus(true, 2); app.state.activeFilter = 'Old domain';
  cv.applyPreset({ name: 'Legacy', tables: ['A', 'B'], pos: { A: { x: 2, y: 3 } } });
  assert.deepEqual(copy(cv.captureFocus()), { selected: null, isolate: false, depth: 1, pinned: [], locked: null });
  assert.equal(app.state.activeFilter, null);
  assert.equal(cv._activeSel, null);
  assert.deepEqual([...explorer.names], ['A', 'B']);
  assert.equal(cv.cards.A.el.style.display, '');
  assert.equal(cv.cards.B.el.style.display, '');
});

test('undo after restoring a named view restores the prior focus, hidden state and viewport', () => {
  const { explorer, cv } = fixture();
  explorer.showAll(); cv.selectTable('A'); explorer.setFocus(true, 1);
  cv.savePreset('A focus'); const saved = cv.getPresets()[0];
  cv.selectTable('C'); cv.pinned = new Set(['B']); cv.locked = 'C'; explorer.setFocus(true, 2);
  cv.view = { x: -510, y: 140, k: 0.44 }; cv.pos.C = { x: -30, y: 620 };
  const previous = { focus: copy(cv.captureFocus()), view: copy(cv.view), pos: copy(cv.pos) };
  cv.applyPreset(saved);
  assert.equal(cv.app.state.selected, 'A');
  explorer.undo();
  assert.deepEqual(copy(cv.captureFocus()), previous.focus);
  assert.deepEqual(copy(cv.view), previous.view);
  assert.deepEqual(copy(cv.pos), previous.pos);
  assert.deepEqual([...explorer.names].sort(), ['A', 'B', 'C']);
});

test('restoring an empty named view clears focus and leaves every card hidden', () => {
  const { explorer, cv } = fixture();
  cv.savePreset('Empty'); const empty = cv.getPresets()[0];
  explorer.showAll(); cv.selectTable('B'); cv.pinned.add('B'); cv.locked = 'A'; explorer.setFocus(true, 2);
  cv.applyPreset(empty);
  assert.equal(explorer.names.size, 0);
  assert.deepEqual(copy(cv.captureFocus()), { selected: null, isolate: false, depth: 1, pinned: [], locked: null });
  for (const card of Object.values(cv.cards)) assert.equal(card.el.style.display, 'none');
});

test('restore ignores removed tables and malformed geometry while keeping valid positions', () => {
  const { explorer, cv } = fixture();
  explorer.showAll(); const previousView = copy(cv.view), previousA = copy(cv.pos.A);
  cv.applyPreset({
    name: 'Refreshed model', tables: ['A', 'B', 'Gone'],
    pos: { A: { x: Infinity, y: 0 }, B: { x: 180, y: -45 }, Gone: { x: 10, y: 10 } },
    view: { x: 100, y: NaN, k: 0 },
    focus: { selected: 'Gone', pinned: ['C', 'Gone', 'B'], locked: 'C', isolate: true, depth: -5 }
  });
  assert.deepEqual([...explorer.names], ['A', 'B']);
  assert.deepEqual(copy(cv.pos.A), previousA);
  assert.deepEqual(copy(cv.pos.B), { x: 180, y: -45 });
  assert.equal(Object.hasOwn(cv.pos, 'Gone'), false);
  assert.deepEqual(copy(cv.view), previousView);
  assert.deepEqual(copy(cv.captureFocus()), { selected: null, isolate: true, depth: 1, pinned: ['B'], locked: null });
});

test('saved views preserve the minimum zoom produced by fitView for large diagrams', () => {
  const { explorer, cv } = fixture();
  explorer.showAll(); cv.view = { x: -222, y: 410, k: 0.16 };
  cv.savePreset('Large model'); const saved = cv.getPresets()[0];
  cv.view = { x: 0, y: 0, k: 1 };
  cv.applyPreset(saved);
  assert.deepEqual(copy(cv.view), { x: -222, y: 410, k: 0.16 });
});

test('save and delete report storage failure without replacing previously saved views', () => {
  const { cv, storage } = fixture();
  assert.equal(cv.savePreset('Keep me'), 'Keep me');
  const before = copy(cv.getPresets()), originalSet = storage.set.bind(storage);
  storage.set = (key, value) => { if (key === 'smv_presets_first') throw new Error('Quota exceeded'); return originalSet(key, value); };
  assert.equal(cv.savePreset('New view'), null);
  assert.equal(cv.deletePreset('Keep me'), false);
  assert.deepEqual(copy(cv.getPresets()), before);
});

test('generated default view names fill gaps without overwriting another saved view', () => {
  const { cv } = fixture();
  assert.equal(cv.savePreset(''), 'View 1');
  assert.equal(cv.savePreset(''), 'View 2');
  assert.equal(cv.savePreset(''), 'View 3');
  assert.equal(cv.deletePreset('View 2'), true);
  assert.equal(cv.savePreset('  '), 'View 2');
  assert.deepEqual(copy(cv.getPresets()).map(preset => preset.name).sort(), ['View 1', 'View 2', 'View 3']);
  assert.equal(cv.savePreset(' View 1 '), 'View 1');
  assert.equal(cv.getPresets().length, 3);
});

test('dropping a library table preserves selection and pins the new table to keep it visible in focus', () => {
  const { explorer, cv, app } = fixture();
  explorer.add(['A']); cv.selectTable('A'); explorer.setFocus(true, 2);
  const beforeFocus = copy(cv.captureFocus());
  explorer.empty.dispatch('drop', tableDragEvent('B'));
  assert.deepEqual([...explorer.names].sort(), ['A', 'B']);
  assert.equal(app.state.selected, 'A');
  assert.equal(cv._activeSel, 'A');
  assert.deepEqual(copy(cv.captureFocus()), { ...beforeFocus, pinned: ['B'] });
  assert.equal(cv.cards.B.el.style.display, '');
  assert.deepEqual(copy(cv.pos.B), { x: 244, y: 210 });
  explorer.undo();
  assert.deepEqual(copy(cv.captureFocus()), beforeFocus);
  assert.deepEqual([...explorer.names], ['A']);
});


test('restoring and undoing a named view restores display settings and expansion controls', () => {
  const { explorer, cv, app } = fixture();
  explorer.showAll();
  cv.detailMode = 'names'; cv.lineStyle = 'curve'; app.colorBy = 'source';
  for (const card of Object.values(cv.cards)) card.expanded = true;
  cv.savePreset('Expanded source view');
  const saved = cv.getPresets()[0];
  cv.detailMode = 'cards'; cv.lineStyle = 'ortho'; app.colorBy = 'domain';
  for (const [name, card] of Object.entries(cv.cards)) card.expanded = name === 'B';
  app.state.allExpanded = false;
  const originalDisplay = copy(cv.captureDisplay());
  cv._preExpandPos = { A: { x: -999, y: -999 } };
  cv.applyPreset(saved);
  assert.deepEqual(copy(cv.captureDisplay()), copy(saved.display));
  assert.equal(app.state.allExpanded, true);
  assert.equal(app.state.colorBy, 'source');
  assert.equal(cv._preExpandPos, null);
  for (const card of Object.values(cv.cards)) assert.equal(card.body.style.display, 'block');
  explorer.undo();
  assert.deepEqual(copy(cv.captureDisplay()), originalDisplay);
  assert.equal(app.state.allExpanded, false);
  assert.equal(app.state.colorBy, 'domain');
  assert.equal(cv._preExpandPos, null);
  assert.equal(cv.cards.A.body.style.display, 'none');
  assert.equal(cv.cards.B.body.style.display, 'block');
});

test('dropping a connected table does not expand direct focus through an unnecessary pin', () => {
  const { explorer, cv, app } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A' }, { from: 'C', to: 'B' }];
  explorer.add(['A', 'C']); cv.selectTable('A'); explorer.setFocus(true, 1);
  assert.equal(cv.cards.B.el.style.display, 'none');
  assert.equal(cv.cards.C.el.style.display, 'none');
  explorer.empty.dispatch('drop', tableDragEvent('B'));
  assert.deepEqual([...explorer.names].sort(), ['A', 'B', 'C']);
  assert.equal(app.state.selected, 'A');
  assert.equal(cv.pinned.has('B'), false);
  assert.equal(cv.cards.B.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, 'none');
});

test('arranging focused tables leaves hidden table positions and membership unchanged', () => {
  const { explorer, cv, app, storage } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A' }];
  explorer.showAll(); cv.selectTable('A'); explorer.setFocus(true, 1);
  cv.pos.A = { x: -700, y: 360 }; cv.pos.B = { x: 915, y: 800 }; cv.pos.C = { x: 1420, y: -225 };
  const hiddenPosition = copy(cv.pos.C), membership = [...explorer.names].sort();
  assert.equal(cv.cards.C.el.style.display, 'none');
  explorer.arrangeSubset(true);
  assert.notDeepEqual(copy(cv.pos.A), { x: -700, y: 360 });
  assert.notDeepEqual(copy(cv.pos.B), { x: 915, y: 800 });
  assert.deepEqual(copy(cv.pos.C), hiddenPosition);
  assert.deepEqual(storage.get('positions_first').C, hiddenPosition);
  assert.deepEqual([...explorer.names].sort(), membership);
  assert.equal(cv.cards.C.el.style.display, 'none');
});

test('filter paths drive canvas highlighting and hiding in the selected direction', () => {
  const { explorer, app, cv, canvasMethods } = fixture();
  // A (lookup) filters B (bridge), which filters C (fact).
  const upstream = { from: 'B', to: 'A' }, downstream = { from: 'C', to: 'B' };
  app.model.relationships = [upstream, downstream];
  explorer.showAll(); cv.selectTable('B');
  cv.styleLock = () => {};
  cv.applyHighlight = canvasMethods.applyHighlight;
  explorer.direction = 'outgoing'; explorer.refreshPaths();
  assert.deepEqual([...cv.distMap(['B'], 1).keys()].sort(), ['B', 'C']);
  assert.equal(cv.cards.A.el.style.opacity, '0.2');
  assert.equal(cv.cards.C.el.style.opacity, '1');
  assert.equal(cv.edgeKind(upstream, cv.distMap(['B'], 1)), 'dim');
  explorer.setFocus(true, 1);
  assert.equal(cv.cards.A.el.style.display, 'none');
  assert.equal(cv.cards.C.el.style.display, '');
  explorer.direction = 'incoming'; explorer.refreshPaths();
  assert.equal(cv.cards.A.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, 'none');
  assert.deepEqual([...cv.distMap(['B'], 1).keys()].sort(), [...explorer.related().names].sort());
  explorer.direction = 'connected'; explorer.refreshPaths();
  assert.equal(cv.cards.A.el.style.display, '');
  assert.equal(cv.cards.C.el.style.display, '');
});

test('canvas paths honor indirect, inactive and bidirectional relationships', () => {
  const { explorer, app, cv } = fixture();
  app.model.relationships = [{ from: 'B', to: 'A', both: true }, { from: 'C', to: 'B', inactive: true }];
  explorer.showAll(); cv.selectTable('A'); explorer.direction = 'outgoing';
  explorer.depth = 'all'; explorer.includeInactive = false; explorer.refreshPaths();
  assert.deepEqual([...cv.distMap(['A'], 1).keys()], ['A', 'B']);
  explorer.includeInactive = true; explorer.refreshPaths();
  assert.deepEqual([...cv.distMap(['A'], 1).keys()], ['A', 'B', 'C']);
  explorer.depth = 'direct'; explorer.refreshPaths();
  assert.deepEqual([...cv.distMap(['A'], 1000000).keys()], ['A', 'B']);
  cv.selectTable('B');
  assert.deepEqual([...cv.distMap(['B'], 1).keys()].sort(), ['A', 'B', 'C']);
  explorer.includeInactive = false; explorer.refreshPaths();
  assert.equal(cv.edgeKind(app.model.relationships[1], new Map([['B', 0], ['C', 0]])), 'dim');
});

test('saved views restore filter path direction, distance and inactive setting', () => {
  const { explorer, cv } = fixture();
  explorer.showAll(); cv.selectTable('B');
  explorer.direction = 'outgoing'; explorer.depth = 'all'; explorer.includeInactive = false; explorer.refreshPaths();
  cv.savePreset('Downstream'); const saved = cv.getPresets()[0];
  explorer.direction = 'incoming'; explorer.depth = 'direct'; explorer.includeInactive = true; explorer.refreshPaths();
  cv.applyPreset(saved);
  assert.equal(explorer.direction, 'outgoing');
  assert.equal(explorer.depth, 'all');
  assert.equal(explorer.includeInactive, false);
  explorer.undo();
  assert.equal(explorer.direction, 'incoming');
  assert.equal(explorer.depth, 'direct');
  assert.equal(explorer.includeInactive, true);
});

test('the table library filters by domain and by source, alongside search and the canvas filter', () => {
  const { explorer, app } = fixture();
  const [a, b, c] = app.model.tables;
  Object.assign(a, { domain: 'Sales', source: { kind: 'databricks', schema: 'gold' } });
  Object.assign(b, { domain: 'Sales', source: { kind: 'excel' } });
  Object.assign(c, { domain: 'Finance', source: { kind: 'databricks', schema: 'gold' } });
  app.srcKeyOf = t => (t.source.kind === 'databricks' ? t.source.schema : t.source.kind);
  app.SOURCE_KINDS = { excel: { label: 'Excel' } };
  const shown = () => app.model.tables.filter(t => explorer.matchesLibrary(t)).map(t => t.name);
  assert.deepEqual(shown(), ['A', 'B', 'C']);
  explorer.domain = 'Sales';
  assert.deepEqual(shown(), ['A', 'B']);
  explorer.source = 'gold';
  assert.deepEqual(shown(), ['A']);
  explorer.domain = '';
  assert.deepEqual(shown(), ['A', 'C']);
  explorer.add(['C']); explorer.filter = 'available';
  assert.deepEqual(shown(), ['A'], 'facets combine with the On canvas / Available switch');
  explorer.filter = 'all'; explorer.query = 'finance';
  assert.deepEqual(shown(), ['C'], 'facets combine with search');
  assert.deepEqual(copy(explorer.facetOptions('domain').map(o => [o.key, o.count])), [['Sales', 2], ['Finance', 1]]);
  assert.deepEqual(copy(explorer.facetOptions('source').map(o => [o.label, o.count])), [['gold', 2], ['Excel', 1]]);
  explorer.loadModel();
  assert.equal(explorer.domain + explorer.source, '', 'opening another model clears the facets');
});
