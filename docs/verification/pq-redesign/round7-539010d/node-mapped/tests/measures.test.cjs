/* Run with node --test tests/measures.test.cjs. No browser or network required. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(preferences = {}) {
  const saved = {}, frames = new Map(); let frameId = 0;
  const context = { console, Set, Map, clearTimeout, setTimeout, U: { el() {}, sv() {}, store: { getJSON() { return preferences; }, setJSON(key, value) { saved[key] = JSON.parse(JSON.stringify(value)); } }, clear() {} } };
  context.requestAnimationFrame = callback => { const id = ++frameId; frames.set(id, callback); return id; };
  context.cancelAnimationFrame = id => frames.delete(id);
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js/measures.js'), 'utf8'), context);
  const tables = [
    { name: 'Sales', measures: [
      { name: 'Revenue', dax: 'SUM(Sales[Amount])', folder: 'Finance\\Revenue', _deps: [] },
      { name: 'Margin', dax: 'DIVIDE([Profit], [Revenue])', folder: 'Finance\\Ratios', h: 1, _deps: ['Profit', 'Revenue'] },
    ] },
    { name: 'Metrics', measures: [{ name: 'Profit', dax: '[Revenue] - 10', folder: '', _deps: ['Revenue'] }] },
  ];
  const model = { tables, byName: Object.fromEntries(tables.map(t => [t.name, t])),
    msrHome: { Revenue: 'Sales', Margin: 'Sales', Profit: 'Metrics' },
    msrUsedBy: { Revenue: ['Profit', 'Margin'], Profit: ['Margin'] },
  };
  const app = { model, modelKey: 'fixture', state: { selMeasure: 'Margin', mvOpen: {} },
    msrUse() { return null; }, useTip() { return ''; },
    setState(patch, callback) { Object.assign(this.state, patch); if (callback) callback(); },
    msrOf(name) { return tables.flatMap(t => t.measures).find(m => m.name === name); },
  };
  return { view: new context.MeasuresView(app, {}), app, saved, flushFrame() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); } };
}

const rowNames = rows => Array.from(rows.filter(row => !row.isFolder && !row.isHeader), row => row.name);

test('library search finds names, folders, home tables and DAX, expanding matching folders', () => {
  const { view, app } = harness();
  for (const [query, names] of [
    ['MARGIN', ['Margin']], ['ratios', ['Margin']], ['metrics', ['Profit']], ['divide(', ['Margin']],
  ]) {
    app.state.mvQuery = query;
    assert.deepEqual(rowNames(view.buildRows().rows), names, query);
  }
  app.state.mvQuery = 'does-not-exist';
  const result = view.buildRows();
  assert.equal(result.total, 0); assert.equal(result.modelTotal, 3);
});

test('visibility and home-table filters combine and stale table filters recover after model switching', () => {
  const { view, app } = harness();
  app.state.mvFilter = 'hidden';
  assert.deepEqual(rowNames(view.buildRows().rows), ['Margin']);
  app.state.mvTable = 'Metrics';
  assert.equal(view.buildRows().total, 0);
  app.state.mvFilter = 'visible';
  assert.deepEqual(rowNames(view.buildRows().rows), ['Profit']);
  app.state.mvTable = 'Table from an old model';
  assert.equal(view.buildRows().total, 2);
});

test('folder paths do not inflate the matching-measure count', () => {
  const { view, app } = harness();
  app.model.tables[0].measures[0].folder = 'Finance;Operations';
  app.state.mvQuery = 'Revenue';
  assert.equal(view.buildRows().total, 3); // Revenue appears in every formula.
  assert.equal(rowNames(view.buildRows().rows).filter(name => name === 'Revenue').length, 2);
});

test('DAX highlighting preserves source spelling and resolves qualified references and escaped identifiers', () => {
  const { view, app } = harness();
  app.model.msrHome['Total]Value'] = "Owner's Data";
  const dax = '"https://example.invalid" & "say ""// [Margin]""" & sales[revenue] + \'Owner\'\'s Data\'[Total]]Value] // [Margin]\n[Profit]';
  const tokens = view.daxToks(dax);
  assert.deepEqual(Array.from(tokens.filter(token => token.msr), token => token.msr), ['Revenue', 'Total]Value', 'Profit']);
  const restored = Array.from(tokens, token => token.raw ?? token.txt ?? token.cmt ?? token.str ?? token.col ?? token.fn ?? token.kw).join('');
  assert.equal(restored, dax);
  assert.equal(view.daxToks('Missing[Revenue]').filter(token => token.msr).length, 0);
});

test('DAX render cache is invalidated whenever the selected main panel is rebuilt', () => {
  const { view, app } = harness();
  view.mainEl = {}; view._daxKey = 'stale';
  const observed = [];
  view.buildSelectedMain = () => {};
  view.renderFlow = () => {};
  view.renderDax = () => { observed.push(view._daxKey); view._daxKey = 'cached'; };
  view.renderMain();
  app.modelKey = 'a-different-model-with-the-same-measure';
  view.renderMain();
  assert.deepEqual(observed, [null, null]);
});

test('Fit contains a large graph and Center uses scaled node coordinates', () => {
  const { view, app } = harness();
  view._g = { w: 3000, h: 5000 };
  view.gScroll = { clientWidth: 600, clientHeight: 400, scrollLeft: 0, scrollTop: 0, scrollTo(value) { this.lastScroll = value; } };
  view._gEl = view.gScroll;
  view.gCanvasEl = { style: {} }; view.gFrame = { style: {} }; view.zoomLabel = {};
  view.fitGraph();
  assert.ok(parseInt(view.gFrame.style.width, 10) <= 600);
  assert.ok(parseInt(view.gFrame.style.height, 10) <= 400);
  view._gXY = { Margin: { x: 2000, y: 2500, w: 200 } };
  view.setGraphZoom(.5);
  view.centerGraphNode(app.state.selMeasure);
  assert.equal(view.gScroll.lastScroll.left, 750);
  assert.equal(view.gScroll.lastScroll.top, 1058.5);
  assert.equal(view._gAutoFit, false);
});

test('graph orientation preserves dependencies and reflects vertical layers without rotating labels', () => {
  const { view } = harness();
  const graphs = Object.fromEntries(['lr','tb','bt'].map(direction => [direction, view.gLayout('Margin', {}, 500, direction)]));
  const edges = graph => Array.from(graph.geo, edge => edge.a + ' → ' + edge.b).sort();
  assert.deepEqual(edges(graphs.lr), edges(graphs.tb));
  assert.deepEqual(edges(graphs.tb), edges(graphs.bt));
  for (const direction of ['lr','tb','bt']) {
    const graph = graphs[direction];
    for (const edge of graph.geo) {
      const source = graph.xy[edge.a], target = graph.xy[edge.b];
      assert.equal(edge.back, false, 'Fixture is acyclic');
      if (direction === 'lr') assert.ok(source.x + source.w < target.x);
      else if (direction === 'tb') assert.ok(source.y + 34 < target.y);
      else assert.ok(source.y > target.y + 34);
      const values = edge.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const [x1,y1,,,,,x2,y2] = values;
      if (direction === 'lr') { assert.equal(x1,source.x+source.w); assert.equal(x2,target.x); }
      else {
        assert.ok(x1>=source.x && x1<=source.x+source.w); assert.ok(x2>=target.x && x2<=target.x+target.w);
        assert.equal(y1,source.y+(direction==='tb'?34:0)); assert.equal(y2,target.y+(direction==='tb'?0:34));
      }
    }
  }
  for (const name of graphs.tb.names) {
    const top = graphs.tb.xy[name], bottom = graphs.bt.xy[name];
    assert.equal(top.x,bottom.x); assert.equal(top.w,bottom.w);
    assert.equal(top.y+bottom.y+34,graphs.tb.h);
  }
});

test('branching and cyclic graphs stay inside bounds in every orientation', () => {
  const { view, app } = harness();
  app.model.tables[0].measures[0]._deps = ['Margin'];
  app.model.msrUsedBy.Margin = ['Revenue'];
  for (const direction of ['lr','tb','bt']) {
    const graph = view.gLayout('Margin',{},500,direction);
    assert.ok(graph.geo.some(edge=>edge.back), 'Cycle edge is flagged');
    const positions = Object.values(graph.xy);
    for (const node of positions) {
      assert.ok(node.x>=34 && node.x+node.w+34<=graph.w);
      assert.ok(node.y>=0 && node.y+34<=graph.h);
    }
    for (let i=0;i<positions.length;i++) for(let j=i+1;j<positions.length;j++) {
      const a=positions[i],b=positions[j];
      assert.ok(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+34<=b.y || b.y+34<=a.y,'Node labels do not overlap');
    }
    for(const edge of graph.geo) {
      const values=edge.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      for(let n=0;n<values.length;n+=2) { assert.ok(values[n]>=0 && values[n]<=graph.w); assert.ok(values[n+1]>=0 && values[n+1]<=graph.h); }
    }
  }
});

test('workspace preferences round-trip and invalid stored values receive safe defaults', () => {
  const { view, saved } = harness({mode:'dax',split:'below',orientation:'bt',besideShare:.61,belowShare:.43,wrap:false});
  assert.equal(view._workspaceMode,'dax'); assert.equal(view._splitLayout,'below'); assert.equal(view._graphOrientation,'bt');
  view.savePreferences();
  const { view: restored } = harness(saved['smv-measures-workspace-v1']);
  assert.equal(restored._splitShares.beside,.61); assert.equal(restored._splitShares.below,.43); assert.equal(restored._wrapDax,false);
  const { view: safe } = harness({mode:'invalid',split:'invalid',orientation:'invalid',besideShare:-4,belowShare:Infinity});
  assert.equal(safe._workspaceMode,'split'); assert.equal(safe._splitLayout,'beside'); assert.equal(safe._graphOrientation,'lr');
  assert.equal(safe._splitShares.beside,.2); assert.equal(safe._splitShares.below,.52);
});


test('zoom preserves the viewport center when moving between a fitted stage and scrolling', () => {
  const { view } = harness();
  view._g = { w: 800, h: 100 }; view._gZoom = .5;
  view.gScroll = { clientWidth: 600, clientHeight: 400, scrollLeft: 0, scrollTop: 0 };
  view.gCanvasEl = { style: {} }; view.gFrame = { style: { width: '400px', height: '50px' } }; view.zoomLabel = {};
  assert.deepEqual(JSON.parse(JSON.stringify(view.graphStageOffset())), { x: 100, y: 175 });
  view.setGraphZoom(1);
  assert.equal(view.gScroll.scrollLeft, 100); assert.equal(view.gScroll.scrollTop, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(view.graphStageOffset())), { x: 0, y: 150 });
  view.setGraphZoom(.5);
  assert.equal(view.gScroll.scrollLeft, 0); assert.equal(view.gScroll.scrollTop, 0);
});


test('measure snapshot is JSON-safe and preserves comparison, library state, preferences and viewport', () => {
  const { view, app } = harness({mode:'split',split:'below',orientation:'bt',besideShare:.63,belowShare:.46,wrap:false});
  Object.assign(app.state,{gPin:'Profit',gExtra:{Revenue:1},mvQuery:'DIVIDE',mvFilter:'hidden',mvTable:'Sales',mvOpen:{Finance:true,'Finance\\Ratios':true},mvW:360});
  view._built=true;view._graphModel=app.model;view._graphMeasure='Margin';view._gZoom=.8;view._gAutoFit=false;
  view.gScroll={clientWidth:600,scrollLeft:123,scrollTop:456};
  const snapshot=JSON.parse(JSON.stringify(view.captureSnapshot()));
  assert.equal(snapshot.version,1);assert.equal(snapshot.selectedMeasure,'Margin');assert.equal(snapshot.comparisonMeasure,'Profit');
  assert.deepEqual(snapshot.extraMeasures,['Revenue']);
  assert.deepEqual(snapshot.library,{query:'DIVIDE',visibility:'hidden',homeTable:'Sales',openFolders:['Finance','Finance\\Ratios'],width:360});
  assert.deepEqual(snapshot.preferences,{mode:'split',split:'below',besideShare:.63,belowShare:.46,orientation:'bt',wrap:false});
  assert.deepEqual(snapshot.graph,{zoom:.8,scrollLeft:123,scrollTop:456,autoFit:false});
  view.rememberGraphViewport();view.gScroll.clientWidth=0;
  assert.deepEqual(JSON.parse(JSON.stringify(view.captureSnapshot().graph)),snapshot.graph,'A hidden graph retains its viewport');
});

test('snapshot restore sanitizes model references and numeric values without changing the app view or saved preferences', () => {
  const { view, app, saved } = harness();app.state.viewMode='graph';
  assert.equal(view.restoreSnapshot({version:1,selectedMeasure:'Margin',comparisonMeasure:'Missing',extraMeasures:['Profit','Profit','Missing'],
    library:{query:123,visibility:'invalid',homeTable:'Missing',openFolders:['Finance','Finance\\Ratios','Missing','__proto__'],width:9000},
    preferences:{mode:'invalid',split:'below',orientation:'bt',besideShare:-1,belowShare:99,wrap:false},
    graph:{zoom:Infinity,scrollLeft:-3,scrollTop:NaN,autoFit:'true'}}),true);
  assert.equal(app.state.selMeasure,'Margin');assert.equal(app.state.gPin,null);assert.deepEqual(Object.keys(app.state.gExtra),['Profit']);
  assert.equal(app.state.mvQuery,'');assert.equal(app.state.mvFilter,'all');assert.equal(app.state.mvTable,'');assert.equal(app.state.mvW,480);
  assert.deepEqual(Object.keys(app.state.mvOpen),['Finance','Finance\\Ratios']);assert.equal(Object.getPrototypeOf(app.state.mvOpen),null);
  assert.equal(app.state.viewMode,'graph');assert.deepEqual(saved,{});
  const snapshot=JSON.parse(JSON.stringify(view.captureSnapshot()));
  assert.equal(snapshot.preferences.mode,'split');assert.equal(snapshot.preferences.besideShare,.2);assert.equal(snapshot.preferences.belowShare,.8);
  assert.deepEqual(snapshot.graph,{zoom:1,scrollLeft:0,scrollTop:0,autoFit:false});
  assert.equal(view.restoreSnapshot({version:99}),false);assert.equal(app.state.selMeasure,'Margin');
  app.model=null;assert.equal(view.restoreSnapshot({version:1}),false);
});

test('viewport restoration waits for visible layout and ignores superseded model state', () => {
  const { view, app, flushFrame } = harness();app.state.viewMode='measures';
  view._built=true;view._graphModel=app.model;view._graphMeasure='Margin';
  view.gScroll={clientWidth:0,scrollLeft:0,scrollTop:0,scrollTo({left,top}){this.scrollLeft=left;this.scrollTop=top;}};
  const zooms=[];view.setGraphZoom=value=>{zooms.push(value);view._gZoom=value;};
  view.restoreSnapshot({version:1,selectedMeasure:'Margin',comparisonMeasure:'Profit',graph:{zoom:.75,scrollLeft:120,scrollTop:240}});
  flushFrame();flushFrame();assert.deepEqual(zooms,[],'Hidden graph does not consume its pending viewport');
  view.gScroll.clientWidth=600;view.restorePendingViewport();flushFrame();assert.deepEqual(zooms,[]);
  flushFrame();assert.deepEqual(zooms,[.75]);assert.equal(view.gScroll.scrollLeft,120);assert.equal(view.gScroll.scrollTop,240);assert.equal(view._snapshotViewport,null);
  view.restoreSnapshot({version:1,selectedMeasure:'Margin',graph:{zoom:1.2}});
  app.model={...app.model};flushFrame();flushFrame();assert.deepEqual(zooms,[.75]);assert.equal(view._snapshotViewport,null);
});

test('invalid selections clear comparison and expansions, and auto-fit restores responsively', () => {
  const { view, app, flushFrame } = harness();
  view.restoreSnapshot({version:1,selectedMeasure:'Missing',comparisonMeasure:'Profit',extraMeasures:['Revenue']});
  assert.equal(app.state.selMeasure,null);assert.equal(app.state.gPin,null);assert.deepEqual(Object.keys(app.state.gExtra),[]);
  app.state.viewMode='measures';view._built=true;view._graphModel=app.model;view._graphMeasure='Margin';
  view.gScroll={clientWidth:600,scrollLeft:0,scrollTop:0};
  let fits=0;view.fitGraph=()=>{fits++;view._gAutoFit=true;};
  view.restoreSnapshot({version:1,selectedMeasure:'Margin',graph:{zoom:.25,autoFit:true}});flushFrame();flushFrame();
  assert.equal(fits,1);assert.equal(view._snapshotViewport,null);
});


test('a hidden graph viewport is not reused for a different expansion context', () => {
  const { view, app }=harness();
  view._built=true;view._graphModel=app.model;view._graphMeasure='Margin';view._gZoom=1.2;
  view.gScroll={clientWidth:600,scrollLeft:70,scrollTop:80};view.rememberGraphViewport();view._built=false;
  assert.equal(view.captureSnapshot().graph.zoom,1.2);
  app.state.gExtra={Revenue:1};
  assert.equal(view.captureSnapshot().graph.zoom,1,'Changing graph membership does not import stale viewport coordinates');
});

/* ---------- dependency flow: grouping and the first view ---------- */

const ROOT = 'Net Revenue (Region) - USD';
/* One dependency and 36 dependents, the shape that used to render as one unreadable column:
   four home-table/folder bundles plus a three-member bundle that stays inline. */
function flowHarness() {
  const bundles = [
    ['_Measures', '1. Sales Actuals (Region)', 12],
    ['_Measures', '2. Sales Budget (Region)', 8],
    ['_Measures', '3. Ratios', 7],
    ['Report Measures', '', 6],
    ['_Measures', '9. Sundry', 3],
  ];
  const byTable = new Map();
  const push = (table, measure) => {
    if (!byTable.has(table)) byTable.set(table, { name: table, measures: [] });
    byTable.get(table).measures.push(measure);
    return measure;
  };
  push('_Measures', { name: 'Base Amount', dax: 'SUM(Fact[Amount])', folder: '0. Base', _deps: [] });
  push('_Measures', { name: ROOT, dax: '[Base Amount]', folder: '0. Base', _deps: ['Base Amount'] });
  const dependents = [];
  bundles.forEach(([table, folder, count], bi) => {
    for (let i = 0; i < count; i += 1) {
      const name = `B${bi} Measure ${String(i).padStart(2, '0')}`;
      dependents.push(name);
      push(table, { name, dax: `[${ROOT}] * 1`, folder, _deps: [ROOT] });
    }
  });
  const tables = [...byTable.values()];
  const all = tables.flatMap(t => t.measures);
  const msrHome = {};
  tables.forEach(t => t.measures.forEach(m => { msrHome[m.name] = t.name; }));
  const model = { tables, byName: Object.fromEntries(tables.map(t => [t.name, t])), msrHome,
    msrUsedBy: { 'Base Amount': [ROOT], [ROOT]: dependents } };
  const app = { model, modelKey: 'flow', state: { selMeasure: ROOT, mvOpen: {}, gExtra: {} },
    msrUse() { return null; }, useTip() { return ''; }, tipFlags() { return ''; },
    setState(patch, callback) { Object.assign(this.state, patch); if (callback) callback(); },
    msrOf(name) { return all.find(m => m.name === name); },
  };
  const context = flowContext();
  return { view: new context.MeasuresView(app, {}), app, dependents, bundles };
}
function flowContext() {
  const context = { console, Set, Map, clearTimeout, setTimeout,
    U: { el() {}, sv() {}, store: { getJSON() { return {}; }, setJSON() {} }, clear() {} } };
  context.requestAnimationFrame = () => 0;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/js/measures.js'), 'utf8'), context);
  return context;
}
const placed = (graph, names) => names.filter(name => graph.xy[name]);

test('dependents are grouped by home table then display folder, and the grouping is deterministic', () => {
  const { view, dependents } = flowHarness();
  const first = view.gLayout(ROOT, {}, 500, 'lr');
  view._gC = null;
  const second = view.gLayout(ROOT, {}, 500, 'lr');

  assert.equal(first.grouped, true);
  assert.deepEqual(second.names, first.names, 'the same model yields the same visible set');
  first.names.forEach(name => {
    assert.deepEqual([second.xy[name].x, second.xy[name].y], [first.xy[name].x, first.xy[name].y], name);
  });
  assert.deepEqual(Array.from(second.boxes, b => b.label), Array.from(first.boxes, b => b.label));

  assert.deepEqual(Array.from(first.boxes, b => b.label), [
    '_Measures · 1. Sales Actuals (Region) · 12',
    '_Measures · 2. Sales Budget (Region) · 8',
    '_Measures · 3. Ratios · 7',
    'Report Measures · 6',
  ], 'bundles of four or more become groups; the three-member bundle stays inline');

  first.boxes.forEach(box => assert.equal(box.shown, 6, box.label + ' shows its first six'));
  assert.equal(placed(first, dependents).length, 6 * 4 + 3, 'only the shown members and the inline bundle are placed');
  first.geo.forEach(edge => {
    assert.ok(first.xy[edge.a] && first.xy[edge.b], 'no edge points at a measure the group is hiding');
  });
});

test('the group expander reveals every member and collapsing puts them back', () => {
  const { view, dependents } = flowHarness();
  const collapsed = view.gLayout(ROOT, {}, 500, 'lr');
  const big = collapsed.boxes[0];
  assert.equal(big.hidden, 6);

  view.toggleGraphGroup(big.key);
  const open = view.gLayout(ROOT, {}, 500, 'lr');
  const opened = open.boxes.find(b => b.key === big.key);
  assert.equal(opened.hidden, 0);
  assert.equal(opened.shown, 12);
  assert.equal(placed(open, dependents).length, 12 + 6 + 6 + 6 + 3, 'the opened group shows all twelve');
  assert.ok(opened.h > big.h, 'the frame grows with the members it reveals');

  view.toggleGraphGroup(big.key);
  const again = view.gLayout(ROOT, {}, 500, 'lr');
  assert.equal(again.boxes.find(b => b.key === big.key).shown, 6);
});

test('group expansion is remembered per analyzed measure and never leaks between them', () => {
  const { view } = flowHarness();
  const box = view.gLayout(ROOT, {}, 500, 'lr').boxes[0];
  view.toggleGraphGroup(box.key);
  assert.equal(view.gLayout(ROOT, {}, 500, 'lr').boxes[0].shown, 12);
  Array.from(view.gLayout('Base Amount', {}, 500, 'lr').boxes).forEach(other => {
    assert.ok(other.shown <= 6, 'another root starts with every group collapsed');
  });
  assert.equal(view.gLayout(ROOT, {}, 500, 'lr').boxes[0].shown, 12, 'and the first root keeps its open group');
});

test('the graph opens on the analyzed measure at a readable zoom, in every orientation', () => {
  const { view } = flowHarness();
  for (const orientation of ['lr', 'tb', 'bt']) {
    const graph = view.gLayout(ROOT, {}, 500, orientation);
    for (const [w, h] of [[900, 520], [1180, 700], [420, 300]]) {
      const open = view.initialViewport(graph, w, h);
      assert.ok(open.zoom >= 0.6, orientation + ' opens at ' + open.zoom);
      assert.ok(open.zoom <= 1, orientation + ' never opens zoomed in');
      const root = graph.xy[ROOT];
      const left = open.zoom * root.x + Math.max(0, (w - Math.ceil(graph.w * open.zoom)) / 2) - open.scrollLeft;
      const top = open.zoom * root.y + Math.max(0, (h - Math.ceil(graph.h * open.zoom)) / 2) - open.scrollTop;
      assert.ok(left >= 0 && left + root.w * open.zoom <= w + 1, orientation + ' keeps the root in view horizontally');
      assert.ok(top >= 0 && top + 34 * open.zoom <= h + 1, orientation + ' keeps the root in view vertically');
    }
  }
});

test('a small dependency graph is not grouped', () => {
  const { view } = harness();
  const graph = view.gLayout('Margin', {}, 500, 'lr');
  assert.ok(graph.names.length <= 8);
  assert.equal(graph.grouped, false);
  assert.equal(graph.boxes.length, 0);
  graph.names.forEach(name => assert.ok(graph.xy[name], name + ' is placed'));
});

test('collapsed measures retain semantic roles and Expand all draws every included path', () => {
  const { view, app } = flowHarness();
  let graph = view.buildGraph();
  const hidden = [...view._gC.g.hiddenByGroup];
  assert.ok(hidden.length);
  hidden.forEach(n => assert.equal(view._gRel[n], 'dn'));
  assert.equal(graph.canExpand, true, 'collapsed groups alone enable expansion');
  view.expandGraphAll();
  graph = view.buildGraph();
  assert.equal(view._gC.g.hiddenByGroup.size, 0);
  assert.equal(graph.nodes.length, view._gC.g.inc.size);
  assert.equal(Object.keys(app.state.gExtra).length, 0, 'baseline members never become extras');
  assert.equal(graph.canExpand, false);
});

test('plus six reveals six downstream neighbours and minus removes exactly those six', () => {
  const { view, app } = flowHarness();
  const table = app.model.tables[0];
  for (let i = 0; i < 6; i++) {
    const name = 'Sibling ' + i;
    table.measures.push({ name, folder: 'Siblings', dax: '[Base Amount]', _deps: ['Base Amount'] });
    app.model.msrHome[name] = table.name;
    app.model.msrUsedBy['Base Amount'].push(name);
  }
  // The original helper captured its measure array before these additions.
  app.msrOf = name => app.model.tables.flatMap(t => t.measures).find(m => m.name === name);
  let graph = view.buildGraph();
  const before = view._gC.g.inc.size;
  let base = graph.nodes.find(n => n.name === 'Base Amount');
  assert.equal(base.dnMore, '+6');
  base.addDn();
  graph = view.buildGraph();
  assert.equal(view._gC.g.inc.size, before + 6);
  for (let i = 0; i < 6; i++) assert.ok(graph.nodes.some(n => n.name === 'Sibling ' + i));
  assert.equal(app.state.selMeasure, ROOT);
  base = graph.nodes.find(n => n.name === 'Base Amount');
  assert.equal(base.dnMore, '−6');
  base.addDn();
  view.buildGraph();
  assert.equal(view._gC.g.inc.size, before);
});

test('legacy extras cannot offer to remove mandatory upstream or downstream measures', () => {
  const { view, app } = flowHarness();
  app.state.gExtra = { 'Base Amount': 1 };
  const root = view.buildGraph().nodes.find(n => n.name === ROOT);
  assert.equal(root.upMore, '');
});

test('Expand all reports the display limit and does not hide additional groups at the cap', () => {
  const { view, app } = flowHarness();
  const table = app.model.tables[0];
  for (let i = 0; i < 520; i++) {
    const name = 'Extra consumer ' + i;
    table.measures.push({ name, folder: 'Extra', dax: '[Base Amount]', _deps: ['Base Amount'] });
    app.model.msrHome[name] = table.name;
    app.model.msrUsedBy['Base Amount'].push(name);
  }
  app.msrOf = name => app.model.tables.flatMap(t => t.measures).find(m => m.name === name);
  view.expandGraphAll();
  const graph = view.buildGraph();
  assert.equal(graph.nodes.length, 500);
  assert.equal(view._gC.g.hiddenByGroup.size, 0);
  assert.equal(graph.capped, true);
  assert.equal(graph.canExpand, false);
  assert.equal(graph.nodes.find(n => n.name === 'Base Amount').dnMore[0], '−', 'does not offer an impossible expansion at the cap');
});

test('library search lists name matches before measures that only mention the text in DAX', () => {
  const { view, app } = harness();
  app.state.mvQuery = 'revenue';
  const rows = view.buildRows().rows;
  assert.deepEqual(Array.from(rows.filter(row => row.isHeader), row => row.name), ['Name matches', 'Found in DAX']);
  assert.deepEqual(rowNames(rows), ['Revenue', 'Margin', 'Profit']);
  app.state.mvQuery = 'profit';
  assert.deepEqual(Array.from(view.buildRows().rows.filter(row => row.isHeader), row => row.name), ['Name matches', 'Found in DAX']);
  app.state.mvQuery = 'divide(';
  assert.equal(view.buildRows().rows.some(row => row.isHeader), false);
});

test('DAX code block resets the host <code> styling so tokens stay readable in VS Code themes', () => {
  const css = fs.readFileSync(path.join(__dirname, '../Models/tools/viewer/measures.css'), 'utf8');
  const rule = css.match(/\.mv-dax-code\{([^}]*)\}/);
  assert.ok(rule, '.mv-dax-code rule exists');
  assert.match(rule[1], /background:none/);
  assert.match(rule[1], /color:inherit/);
});
