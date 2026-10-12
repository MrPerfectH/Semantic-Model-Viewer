'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {harness, plain} = require('./power-query-ui-harness.cjs');

// Synthetic metadata only; real projection, shell, canvas and history methods.
// This deterministic DOM does not certify browser geometry or trusted input.
function setup() {
  const h = harness('power-query-canvas.js'), g = h.win;
  g.U = {el(tag, attrs = {}, children = []) {
    const e = h.doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'text') e.textContent = value;
      else if (key === 'cls') e.className = value;
      else if (key.startsWith('on')) e.addEventListener(key.slice(2).toLowerCase(), value);
      else e.setAttribute(key, value);
    }
    children.forEach(child => e.appendChild(child));
    return e;
  }};
  for (const file of ['power-query-dependencies.js', 'power-query-graph-model.js', 'power-query-workspace.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js', file), 'utf8'), g);
  }
  const rows = [['Input', '1'], ['Clean', 'Input'], ['FinalOutput', 'Clean'], ['Standalone', '42']]
    .map(([name, code]) => ({id:name, name, code, kind:'expression', type:'m', state:'available', groupPath:name === 'Standalone' ? 'Other' : 'Flow'}));
  const model = {tables:[], byName:{}, powerQuery:{nodes:rows, warnings:[]}};
  const i = g.PowerQueryWorkspaceInternals;
  const context = i.contextFor(g.PowerQueryGraphModel.build(model, {generation:1}), rows, 1);
  const w = Object.create(g.PowerQueryWorkspace.prototype);
  Object.assign(w, {app:{model}, alive:true, viewMode:'canvas', generation:1, navigationEpoch:0, capture:i.capture(model),
    context, sets:i.categories(context), category:'all', query:'', history:[], layoutHistory:[],
    selectedId:null, flowRootId:null, inspectorOpen:false, phase:'ready',
    dock(){}, exposeTitle(){}, inspector:{select(){}, setContext(){}, captureViewState(){return {focus:null};},
      async restoreViewState(state, claim){if (claim) claim();}, setFocusControls(state){this.controls=state;}}
  });
  for (const name of ['body','banner','filter','search','list','count','inventory','memberCount','segments',
    'note','backButton','undoButton','centerButton','openTableButton','popover','message','globalDetails','cancelButton','retryButton']) {
    w[name] = h.doc.createElement('div');
  }
  w.filter.options = ['all','connected','disconnected'].map(value => ({value}));
  w.canvasHost = h.host;
  w.canvas = g.PowerQueryCanvas.mount(h.host, {context});
  w.applyFilters();
  w.navigate('FinalOutput', false, {preserveView:true});
  w.toggleFocusLock();
  w.navigate('Standalone', false, {preserveView:true});
  w.canvas.setViewport({x:123, y:87, k:1.3});
  w.body.scrollLeft = 7; w.body.scrollTop = 123;
  h.flush();
  return {w, h};
}
function stable(w) {
  return {root:w.flowRootId, selected:w.selectedId, viewport:plain(w.canvas.getViewport()),
    body:[w.body.scrollLeft,w.body.scrollTop], layout:plain([...w.canvas.captureLayout()]),
    membership:[...w.membership], mode:w.focusMode, direction:w.direction, depth:w.depth};
}
function button(w, text) {
  const b = w.banner.querySelectorAll('button').find(b => b.textContent === text);
  assert.ok(b, 'discoverable banner action: '+text);
  return b;
}
function hidden(w) {
  assert.equal(w.visible.has('FinalOutput'), false);
  assert.equal(w.visible.has('Standalone'), true);
  assert.match(w.banner.textContent, /Locked focus.*FinalOutput.*hidden/i);
}

for (const mode of ['dim','hide']) for (const filter of ['category','group','both']) {
  test(`hidden locked root: ${filter}, ${mode}; reset retains navigation and layout`, () => {
    const {w,h} = setup(); w.focusMode = mode;
    const before = stable(w);
    if (filter !== 'group') w.category = 'disconnected';
    if (filter !== 'category') w.groupFilter = 'group:Other';
    w.applyFilters(); h.flush(); hidden(w);
    if (filter !== 'group') assert.match(w.banner.textContent, /Disconnected.*connectivity filter/);
    if (filter !== 'category') assert.match(w.banner.textContent, /group filter/);
    assert.deepEqual(stable(w), before);
    button(w, 'Reset filters').fire('click'); h.flush();
    assert.equal(w.visible.has('FinalOutput'), true);
    assert.equal(w.banner.textContent, '');
    assert.deepEqual(stable(w), before);
  });
}

test('search and library facets do not falsely describe a visible locked root as hidden', () => {
  const {w} = setup();
  for (const mode of ['dim','hide']) for (const facet of ['all','canvas','available']) {
    w.focusMode=mode; w.listFacet=facet; w.query='Standalone'; w.applyFilters();
    assert.equal(w.visible.has('FinalOutput'), true);
    assert.equal(w.banner.textContent, '');
    assert.equal(w.flowRootId, 'FinalOutput');
  }
  w.category='disconnected'; w.applyFilters(); hidden(w);
  assert.doesNotMatch(w.banner.textContent, /search.*hidden|hidden.*search/i);
  button(w, 'Reset filters').fire('click');
  assert.equal(w.query, ''); assert.equal(w.listFacet, 'all');
});

test('a membership-excluded locked root offers Show all with its existing unlock contract', async () => {
  const {w} = setup();
  // Defensive restored-state case; ordinary remove(root) releases the lock.
  w.membership.delete('FinalOutput'); w.applyFilters(); hidden(w);
  assert.match(w.banner.textContent, /not on the canvas/);
  assert.equal(w.banner.querySelectorAll('button').some(b=>b.textContent==='Reset filters'), false);
  assert.match(w.banner.textContent, /Show all.*release.*lock/i);
  const before=stable(w);
  button(w, 'Show all').fire('click');
  assert.equal(w.flowRootId, null); assert.equal(w.visible.has('FinalOutput'), true);
  await w.undo(); hidden(w); assert.deepEqual(stable(w), before);
});

test('selected-hidden explanation coexists with lock explanation and disappears on reset', () => {
  const {w} = setup(); w.groupFilter='group:Absent'; w.applyFilters();
  assert.match(w.banner.textContent, /Locked focus.*FinalOutput.*hidden/);
  assert.match(w.banner.textContent, /Selected object hidden/);
  button(w, 'Reset filters').fire('click'); assert.equal(w.banner.textContent, '');
  w.toggleFocusLock(); w.category='connected'; w.applyFilters();
  assert.match(w.banner.textContent, /Selected object hidden/);
  assert.doesNotMatch(w.banner.textContent, /Locked focus/);
  button(w, 'Show all');
});

test('selected locked root gets one lock explanation and reset does not unlock it', () => {
  const {w} = setup(); w.navigate('FinalOutput', false, {preserveView:true});
  w.category='disconnected'; w.applyFilters();
  assert.match(w.banner.textContent, /Locked focus.*FinalOutput.*hidden/);
  button(w, 'Reset filters').fire('click');
  assert.equal(w.selectedId, 'FinalOutput'); assert.equal(w.flowRootId, 'FinalOutput');
  assert.equal(w.banner.textContent, '');
});

test('Back and Undo recompute the explanation from restored lock and filters', async () => {
  const {w} = setup(); w.category='disconnected'; w.applyFilters(); const before=stable(w);
  w.navigate('Clean', false); assert.equal(w.banner.textContent, '');
  await w.back(); hidden(w); assert.deepEqual(stable(w), before);
  w.blank(); assert.equal(w.banner.textContent, ''); assert.equal(w.flowRootId, null);
  await w.undo(); hidden(w); assert.deepEqual(stable(w), before);
  w.remove('FinalOutput'); assert.equal(w.flowRootId, null); assert.equal(w.banner.textContent, '');
  await w.undo(); hidden(w); assert.deepEqual(stable(w), before);
});

for (const action of ['Reset filters','Show all']) for (const change of ['navigation','reset','replacement']) {
  test(`detached ${action} cannot affect ${change}`, () => {
    const {w} = setup(); w.category='disconnected';
    if (action==='Show all') w.membership.delete('FinalOutput');
    w.applyFilters(); const old=button(w, action);
    if (change==='navigation') w.navigate('Clean', false, {preserveView:true});
    else if (change==='reset') w.reset();
    else w.app.model={tables:[],powerQuery:{nodes:[]}};
    old.fire('click');
    if (change==='navigation') {assert.equal(w.selectedId, 'Clean'); assert.equal(w.flowRootId, 'FinalOutput');}
    else {assert.equal(w.flowRootId, null); assert.equal(w.context, null); assert.equal(w.banner.textContent, '');}
  });
}

test('a markup-shaped locked label is rendered as text', () => {
  const {w} = setup(); w.context.byNodeId.get('FinalOutput').node.label='<img src=x onerror=bad()>';
  w.category='disconnected'; w.applyFilters();
  assert.match(w.banner.textContent, /<img src=x onerror=bad\(\)>/);
  assert.equal(w.banner.querySelectorAll('img').length, 0);
});
