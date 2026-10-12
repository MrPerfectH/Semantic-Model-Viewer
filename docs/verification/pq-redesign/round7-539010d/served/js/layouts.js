/* Arrange algorithms (star / constellation / layered / galaxy / columns / waterfall / grid)
   and cluster mode. Mixed into GraphCanvas.prototype. */
(function (g) {
  'use strict';
  var el = U.el, sv = U.sv, tint = U.tint, store = U.store;
  var P = g.GraphCanvas.prototype;

  /* ---------- arrange layouts ---------- */
  /* Every algorithm works over the same skeleton: facts (hubs), conformed dims shared by
     2+ facts (spine), each fact's own dims (priv), dictionaries hanging off a dim (orphan).
     Barycentre sweeps settle ordering so relationship lines cross as little as possible.
     Calculation groups, field parameters, measure tables and standalone tables have no
     relationships, so they always land on the tray shelf below the picture. */
  var ALGOS = {
    star: 'layoutStar', constellation: 'layoutConstellation', layered: 'layoutLayered',
    galaxy: 'layoutGalaxy', columns: 'layoutColumns', waterfall: 'layoutWaterfall', grid: 'layoutGrid'
  };
  P.LAYOUT_ALGOS = ALGOS;
  P.DEFAULT_ALGO = 'star';
  var byName = function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };
  /* Width-to-height a free-form picture is pushed towards. A canvas is about 2.1:1 once the
     library rail, the zoom rail and the overview map have taken their share of a 16:9 window,
     and the relax pass gives some of the squash back, so the ask is set above what is wanted:
     measured on the bundled model, asking 2.5 lands at 1.9. */
  var RESHAPE_TARGET = 2.5;
  /* Both crossing-refinement passes — the star's seat swaps and the layered transpose — cost
     about (nodes they move) x (edges)^2. Gating on that product rather than on a raw edge
     count keeps Arrange interactive on any shape of model: the bundled one (110 edges, 33
     movable nodes) spends ~30 ms and refines; a 400-edge, 80-table model would spend over a
     second, so it keeps the seeded order instead. */
  var REFINE_BUDGET = 1.5e6;
  var refineFits = function (nodes, edges) { return nodes * edges * edges <= REFINE_BUDGET; };
  var len = function (x, y) { return Math.sqrt(x * x + y * y) || 1; };

  /* opts.names  — only these tables are arranged, every other position is left alone
     opts.center — the table the picture is built around (usually the selected one)
     opts.quiet  — the caller commits: write positions only, no persist / re-render / fit,
                   so one Arrange costs one SVG rebuild, one fit and one store.
     Normalised once here, so no algorithm has to repeat `opts = opts || {}`. */
  P.untangle = function (opts) {
    var algo = ALGOS[this.layoutAlgo] ? this.layoutAlgo : P.DEFAULT_ALGO;
    opts = opts || {};
    this._quiet = !!opts.quiet;
    try { this[ALGOS[algo]](opts); } finally { this._quiet = false; }
  };
  /* Only remembers the choice. Applying it is the explorer's call, because only the explorer
     knows which tables are on the canvas, which one is selected and how to take the snapshot
     that makes the change undoable — running it from here rewrote every position in the
     model with no way back. */
  P.setLayoutAlgo = function (m) { this.layoutAlgo = m; store.set('smv-layout', m); };

  /* names (optional Set) limits the classification to a subset of the model: degree,
     hub detection and the loose tray are all recomputed inside that subset. */
  P._classify = function (names) {
    var self = this, model = this.app.model;
    var scope = model.tables.filter(function (t) { return !names || names.has(t.name); });
    if (!scope.length) return null;
    this._preExpandPos = null;
    var adj = {}; scope.forEach(function (t) { adj[t.name] = new Set(); });
    model.relationships.forEach(function (r) {
      if (r.from === r.to || !adj[r.from] || !adj[r.to]) return;
      adj[r.from].add(r.to); adj[r.to].add(r.from);
    });
    var conn = scope.filter(function (t) { return adj[t.name].size > 0; });
    /* Loose means loose in the MODEL — a calculation group, a field parameter, a measure
       table, a genuinely standalone table. A dimension whose only fact happens to be off
       this canvas still has relationships, so it is not tray material: it keeps a row of its
       own beside the picture (see _placeAside) instead of being filed with the leftovers. */
    var loose = scope.filter(function (t) { return !t.relCount; });
    var aside = scope.filter(function (t) { return t.relCount > 0 && adj[t.name].size === 0; });
    if (!conn.length) return null;
    var hubs = conn.filter(function (t) { return self.app.isFact(t); });
    if (!hubs.length) hubs = conn.filter(function (t) { return adj[t.name].size >= 4; });
    if (!hubs.length) hubs = [conn.reduce(function (a, b) { return adj[a.name].size >= adj[b.name].size ? a : b; })];
    var isHub = {}; hubs.forEach(function (h) { isHub[h.name] = true; });
    var priv = {}, spine = [], orphan = [];
    hubs.forEach(function (h) { priv[h.name] = []; });
    conn.filter(function (t) { return !isHub[t.name]; }).forEach(function (t) {
      var hs = Array.from(adj[t.name]).filter(function (n) { return isHub[n]; });
      if (hs.length === 1) priv[hs[0]].push(t.name);
      else if (hs.length > 1) spine.push(t.name);
      else orphan.push(t.name);
    });
    var factsOf = {}; spine.forEach(function (s) { factsOf[s] = Array.from(adj[s]).filter(function (n) { return isHub[n]; }); });
    var spineOf = {}; hubs.forEach(function (h) { spineOf[h.name] = Array.from(adj[h.name]).filter(function (n) { return spine.indexOf(n) >= 0; }); });
    return { conn: conn, loose: loose, aside: aside, scope: scope, adj: adj, hubs: hubs, isHub: isHub, priv: priv, spine: spine, orphan: orphan, factsOf: factsOf, spineOf: spineOf };
  };
  P._seatOrphans = function (placed, adj, orphan, fn) {
    var pend = orphan.slice().sort(byName), guard = 0;
    while (pend.length && guard++ < 30) {
      var rest = [];
      pend.forEach(function (n) {
        var par = Array.from(adj[n]).sort(byName).find(function (x) { return placed[x]; });
        if (!par) { rest.push(n); return; }
        placed[n] = fn(placed[par], n, par);
      });
      if (rest.length === pend.length) break;
      pend = rest;
    }
  };
  P._deoverlapLanes = function (conn, placed, axis, laneStep, gap) {
    var lanes = {};
    conn.forEach(function (t) { var p = placed[t.name]; if (!p) return; var k = Math.round((axis === 'x' ? p.y : p.x) / laneStep); (lanes[k] = lanes[k] || []).push(p); });
    Object.keys(lanes).forEach(function (k) {
      var row = lanes[k].sort(function (a, b) { return a[axis] - b[axis]; });
      for (var it = 0; it < 60; it++) {
        var moved = false;
        for (var i = 1; i < row.length; i++) {
          var d = row[i][axis] - row[i - 1][axis];
          if (d < gap) { var p = (gap - d) / 2; row[i - 1][axis] -= p; row[i][axis] += p; moved = true; }
        }
        if (!moved) break;
      }
    });
  };
  /* Centre points in, top-left card positions out. Only the classified scope is written,
     so a subset arrange never disturbs the tables that are not on the canvas. */
  P._applyPlaced = function (C, placed, CW, CH) {
    var self = this, conn = C.conn;
    var maxY = 0; conn.forEach(function (t) { if (placed[t.name]) maxY = Math.max(maxY, placed[t.name].y); });
    var fb = 0;
    conn.forEach(function (t) { if (!placed[t.name]) placed[t.name] = { x: (fb++) * CW * 1.05, y: maxY + CH * 1.6 }; });
    /* Last word on collisions, for every algorithm at once. The stair, the bands and the
       columns each de-overlap along the one axis they build on, which leaves the odd pair
       that drifted into a neighbouring lane. Relaxing here — name order in, so the picture
       is still reproducible — is what makes "no card is drawn on another" true of all seven
       layouts rather than of the three that happened to end on a relax pass. */
    this._separatePlaced(placed, conn.map(function (t) { return t.name; }), CW, CH, 80);
    conn.forEach(function (t) { self.pos[t.name] = { x: placed[t.name].x - CW / 2, y: placed[t.name].y - CH / 2 }; });
    this._placeAside(conn, C.aside || []);
    this.placeStandaloneShelf(conn, C.loose, {});
    if (this._quiet) return;                 // the caller persists, re-renders and fits once
    this.persist();
    Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
    this.renderLines();
    this.fitView();
  };
  /* Tables that are related in the model but to nothing on this canvas. They belong to the
     picture, not to the standalone tray, so they get a column of their own just to the right
     of it — close enough to read together with the rest, separate enough to say "the tables
     these connect to are not here". */
  P._placeAside = function (conn, aside) {
    if (!aside.length) return;
    var self = this, G = this._gapBox(), CW = G.x, CH = G.y;
    var minY = 1e9, maxX = -1e9, maxY = -1e9;
    conn.forEach(function (t) {
      var p = self.pos[t.name]; if (!p) return;
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); maxX = Math.max(maxX, p.x);
    });
    if (maxX === -1e9) { minY = 0; maxY = 0; maxX = 0; }
    var rows = Math.max(1, Math.round((maxY - minY) / CH) + 1);
    var x0 = maxX + CW * 1.15;
    aside.slice().sort(function (a, b) { return byName(a.name, b.name); }).forEach(function (t, i) {
      self.pos[t.name] = { x: x0 + Math.floor(i / rows) * CW, y: minY + (i % rows) * CH };
    });
  };
  /* Diagonal of the gap box — the shortest centre-to-centre distance that is safe at any
     angle, which is what a ring of dims has to be built on. */
  P._minChord = function () { var b = this._gapBox(); return len(b.x, b.y); };
  /* Safety net: relax any remaining card-box collision. Same relaxer the force layout uses,
     visited in name order so the result is deterministic. */
  P._separatePlaced = function (placed, keys, gapX, gapY, iters) {
    var pts = keys.slice().sort(byName).map(function (n) { return placed[n]; });
    this._relaxPoints(pts, gapX, gapY, 1, iters || 60);
  };
  /* A drawing taller than the screen wastes the zoom twice over: Fit is driven by the worse
     of the two axes, so height nobody asked for costs width everybody wanted. Trade one for
     the other in place — squash towards the target aspect, then relax the collisions that
     created *along x only*, which is where the squash just freed the room. A final ordinary
     relax puts back any gap the x-only pass could not close. Bounded rounds, sorted order:
     same input, same picture. */
  P._reshape = function (placed, keys, gapX, gapY, target) {
    var pts = keys.slice().sort(byName).map(function (n) { return placed[n]; }).filter(Boolean);
    var spreadX = function (iters) {
      for (var it = 0; it < iters; it++) {
        var moved = false;
        for (var i = 0; i < pts.length; i++) {
          for (var j = i + 1; j < pts.length; j++) {
            var a = pts[i], b = pts[j];
            var ox = gapX - Math.abs(a.x - b.x);
            if (ox <= 0 || gapY - Math.abs(a.y - b.y) <= 0) continue;
            var push = (ox / 2 + 0.5) * (a.x < b.x ? -1 : 1);
            a.x += push; b.x -= push; moved = true;
          }
        }
        if (!moved) return;
      }
    };
    for (var round = 0; round < 8; round++) {
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      var w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
      if (w / h >= target) break;
      var t = Math.min(1.25, Math.sqrt(target * h / w));
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      pts.forEach(function (p) { p.x = cx + (p.x - cx) * t; p.y = cy + (p.y - cy) / t; });
      spreadX(90);
    }
    this._relaxPoints(pts, gapX, gapY, 1, 200);
  };
  /* Ring radius for n dims around one hub: wide enough that a seat clears the hub in the
     middle (the widest the gap box gets on either axis) and that neighbouring seats are one
     chord apart — a distance of one box diagonal cannot leave both axes short. The chord term
     already grows with the crowd (1/sin(pi/n) approaches n/pi), so both bounds are lane-
     derived: a magic per-dim constant on top of them was pure air, and air in a ring is paid
     for twice over by the zoom the picture then has to fit at. */
  /* Seats on a ring, measured in LANE units instead of in pixels. A lane is far wider than it
     is tall, so a circle wide enough to keep two names apart where the ring runs horizontally
     is about three times taller than it needs to be where the ring runs vertically — and that
     wasted height is paid for twice, once by the extent and again by the zoom Fit then has to
     use. Stretching the ring by the lane's own aspect and solving for the exact seat angles
     (each seat clears the hub in the middle, each neighbouring pair clears on the axis that
     separates them) gives the smallest ring that still has nothing touching. */
  P._ringRadii = function (seats) {
    var G = this._gapBox(), rho = 1, i, a, b;
    for (i = 0; i < seats.length; i++) {
      a = seats[i];
      rho = Math.max(rho, 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)), 1e-6));
    }
    for (i = 0; seats.length > 1 && i < seats.length; i++) {
      a = seats[i]; b = seats[(i + 1) % seats.length];
      rho = Math.max(rho, 1 / Math.max(Math.abs(Math.cos(b) - Math.cos(a)), Math.abs(Math.sin(b) - Math.sin(a)), 1e-6));
    }
    return { rx: rho * G.x, ry: rho * G.y, rho: rho };
  };
  P._ringRadius = function (n, chord) {
    var G = this._gapBox(), floor = Math.max(G.x, G.y);
    if (n < 2) return floor;
    return Math.max(floor, (chord / 2) / Math.sin(Math.PI / n));
  };
  /* Every hub-and-spoke algorithm opens the same way: classify the scope, take the lane box,
     and work out which fact the picture is built around. Returns null when there is nothing
     to hang a picture on, which is the caller's cue to fall back to the grid. */
  P._prologue = function (opts) {
    var C = this._classify(opts.names);
    if (!C) return null;
    var G = this._gapBox();
    C.CW = G.x; C.CH = G.y;
    C.center = this._starCenter(C, opts.center);
    return C;
  };
  /* The selected table anchors the picture: whichever fact it belongs to takes the first
     seat of the ordering the algorithm starts from, so Arrange with a table selected builds
     around that table instead of around whatever happens to have the most relationships. */
  P._anchorFirst = function (list, center) {
    var at = center ? list.indexOf(center) : -1;
    if (at > 0) { list.splice(at, 1); list.unshift(center); }
    return list;
  };
  P.layoutGalaxy = function (opts) {
    var C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    var adj = C.adj, hubs = C.hubs, priv = C.priv, spine = C.spine, orphan = C.orphan, factsOf = C.factsOf, spineOf = C.spineOf, conn = C.conn;
    // split the facts into two bands, heaviest first, alternating so both sides stay even
    var byDeg = this._anchorFirst(hubs.map(function (h) { return h.name; }).sort(function (a, b) { return adj[b].size - adj[a].size; }), C.center);
    var side = {}; byDeg.forEach(function (h, i) { side[h] = i % 2 ? 1 : -1; });
    var bandOf = { '-1': byDeg.filter(function (h) { return side[h] < 0; }), '1': byDeg.filter(function (h) { return side[h] > 0; }) };

    var CW = C.CW, CH = C.CH;
    var FSLOT = CW * 1.1, SSLOT = CW * 0.66;
    var ord = {};
    spine.forEach(function (s, i) { ord[s] = (i - (spine.length - 1) / 2) * SSLOT; });
    var seat = function (list, slot) { list.forEach(function (n, i) { ord[n] = (i - (list.length - 1) / 2) * slot; }); };
    seat(bandOf['-1'], FSLOT); seat(bandOf['1'], FSLOT);
    var bary = function (n, nbrs) { var v = nbrs.filter(function (m) { return ord[m] !== undefined; }); return v.length ? v.reduce(function (s, m) { return s + ord[m]; }, 0) / v.length : ord[n]; };
    for (var sweep = 0; sweep < 10; sweep++) {
      [bandOf['-1'], bandOf['1']].forEach(function (band) {
        band.sort(function (a, b) { return bary(a, spineOf[a]) - bary(b, spineOf[b]); }); seat(band, FSLOT);
      });
      spine.sort(function (a, b) { return bary(a, factsOf[a]) - bary(b, factsOf[b]); });
      spine.forEach(function (s, i) { ord[s] = (i - (spine.length - 1) / 2) * SSLOT; });
    }

    var placed = {};
    // spine: two staggered rows so the conformed dims do not stretch the canvas sideways
    spine.forEach(function (s, i) { placed[s] = { x: ord[s], y: (i % 2 ? 1 : -1) * CH * 0.62 }; });
    var FY = CH * 2.35, PY = CH * 4.0, PSTEP = CH * 1.2;
    [-1, 1].forEach(function (sg) {
      bandOf[String(sg)].forEach(function (h) {
        placed[h] = { x: ord[h], y: sg * FY };
        var list = priv[h].slice().sort(function (a, b) { return adj[b].size - adj[a].size; });
        list.forEach(function (d, i) {
          var row = Math.floor(i / 2), m = Math.min(2, list.length - row * 2), j = i - row * 2;
          placed[d] = { x: ord[h] + (j - (m - 1) / 2) * CW * 1.08, y: sg * (PY + row * PSTEP) };
        });
      });
    });
    // dictionaries and mapping tables hang off their parent dim, further from the spine
    this._seatOrphans(placed, adj, orphan, function (p) { return { x: p.x, y: p.y + (p.y >= 0 ? 1 : -1) * PSTEP }; });
    this._deoverlapLanes(conn, placed, 'x', CH * 0.5, CW * 1.02);
    this.lastLayout = { algo: 'galaxy', center: C.center || null };
    this._applyPlaced(C, placed, CW, CH);
  };
  /* star columns: facts stacked in one column down the middle; shared dims in the inner
     columns either side at the average height of their facts; own dims in the outer
     columns beside their fact; dictionaries one column further out */
  P.layoutColumns = function (opts) {
    var C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    var adj = C.adj, hubs = C.hubs, priv = C.priv, spine = C.spine, orphan = C.orphan, factsOf = C.factsOf, spineOf = C.spineOf, conn = C.conn;
    var CW = C.CW, CH = C.CH;
    // order the fact column so facts sharing dims sit near each other, selection first
    var facts = this._anchorFirst(hubs.map(function (h) { return h.name; }).sort(function (a, b) { return adj[b].size - adj[a].size; }), C.center);
    var fi = {}; facts.forEach(function (f, i) { fi[f] = i; });
    var so = {};
    for (var sweep = 0; sweep < 8; sweep++) {
      spine.forEach(function (s) { so[s] = factsOf[s].reduce(function (a, f) { return a + fi[f]; }, 0) / factsOf[s].length; });
      facts.sort(function (a, b) {
        var av = spineOf[a].length ? spineOf[a].reduce(function (x, s) { return x + so[s]; }, 0) / spineOf[a].length : fi[a];
        var bv = spineOf[b].length ? spineOf[b].reduce(function (x, s) { return x + so[s]; }, 0) / spineOf[b].length : fi[b];
        return av - bv;
      });
      facts.forEach(function (f, i) { fi[f] = i; });
    }
    // stack facts down the middle; each slot is tall enough for that fact's own dims
    var placed = {}, rows = {};
    facts.forEach(function (f) { rows[f] = Math.max(1, Math.ceil(priv[f].length / 2)); });
    var y = 0;
    facts.forEach(function (f) { var h = rows[f] * CH; placed[f] = { x: 0, y: y + h / 2 - CH / 2 }; y += h + CH * 0.4; });
    var off = (y - CH * 0.4) / 2;
    facts.forEach(function (f) { placed[f].y -= off; });
    var SX = CW * 1.5, PX = CW * 2.85;
    facts.forEach(function (f) {
      var list = priv[f].slice().sort(function (a, b) { return adj[b].size - adj[a].size; });
      [[-1, list.filter(function (d, i) { return i % 2 === 0; })], [1, list.filter(function (d, i) { return i % 2 === 1; })]].forEach(function (pair) {
        pair[1].forEach(function (d, i) { placed[d] = { x: pair[0] * PX, y: placed[f].y + (i - (pair[1].length - 1) / 2) * CH }; });
      });
    });
    spine.slice().sort(function (a, b) { return adj[b].size - adj[a].size; }).forEach(function (s, i) {
      var ys = factsOf[s].map(function (f) { return placed[f].y; });
      placed[s] = { x: (i % 2 ? 1 : -1) * SX, y: ys.reduce(function (a, b) { return a + b; }, 0) / ys.length };
    });
    this._seatOrphans(placed, adj, orphan, function (p) { return { x: p.x + (p.x >= 0 ? 1 : -1) * CW * 1.05, y: p.y }; });
    this._deoverlapLanes(conn, placed, 'y', CW * 0.5, CH * 1.08);
    this.lastLayout = { algo: 'columns', center: C.center || null };
    this._applyPlaced(C, placed, CW, CH);
  };
  /* waterfall: facts step down like stairs (neighbours share the most dims), own dims
     trail right in the fact's lane, shared dims sit in a row on top at the average x
     of the facts they serve */
  P.layoutWaterfall = function (opts) {
    var C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    var adj = C.adj, hubs = C.hubs, priv = C.priv, spine = C.spine, orphan = C.orphan, factsOf = C.factsOf, spineOf = C.spineOf, conn = C.conn;
    var CW = C.CW, CH = C.CH;
    // the stair starts at the selected table's fact, otherwise at the busiest one
    var all = this._anchorFirst(hubs.map(function (h) { return h.name; }).sort(function (a, b) { return adj[b].size - adj[a].size; }), C.center);
    var chain = [], used = {};
    var cur = all[0];
    while (cur) {
      chain.push(cur); used[cur] = true;
      var best = null, bs = -1;
      all.forEach(function (f) {
        if (used[f]) return;
        var ov = spineOf[f].filter(function (s) { return spineOf[cur].indexOf(s) >= 0; }).length;
        if (ov > bs) { bs = ov; best = f; }
      });
      cur = best;
    }
    var placed = {}, STEPX = CW * 0.7, STEPY = CH * 1.45;
    chain.forEach(function (f, i) { placed[f] = { x: i * STEPX, y: i * STEPY }; });
    chain.forEach(function (f) {
      priv[f].slice().sort(function (a, b) { return adj[b].size - adj[a].size; }).forEach(function (d, k) {
        placed[d] = { x: placed[f].x + (k + 1) * CW * 1.04, y: placed[f].y };
      });
    });
    spine.forEach(function (s) {
      var xs = factsOf[s].map(function (f) { return placed[f].x; });
      placed[s] = { x: xs.reduce(function (a, b) { return a + b; }, 0) / xs.length, y: -CH * 1.9 };
    });
    this._seatOrphans(placed, adj, orphan, function (p) { return p.y < 0 ? { x: p.x, y: p.y - CH * 1.05 } : { x: p.x + CW * 1.04, y: p.y }; });
    this._deoverlapLanes(conn, placed, 'x', CH * 0.5, CW * 1.04);
    this.lastLayout = { algo: 'waterfall', center: C.center || null };
    this._applyPlaced(C, placed, CW, CH);
  };

  /* ---------- star (per hub) ---------- */
  /* Which fact the star is built around: a fact centres its own ring, a dimension hands
     the centre to the fact it shares the most relationships with. */
  P._starCenter = function (C, name) {
    if (!name || !C.adj[name]) return null;
    if (C.isHub[name]) return name;
    var model = this.app.model, best = null, top = 0;
    C.hubs.map(function (h) { return h.name; }).sort(byName).forEach(function (h) {
      var n = model.relationships.filter(function (r) {
        return (r.from === name && r.to === h) || (r.to === name && r.from === h);
      }).length;
      if (n > top) { top = n; best = h; }
    });
    return best;
  };
  /* Hub seats on a square lattice, spiralling out from the centre cell so the first hub
     keeps the middle of the canvas. cell must clear a whole ring, so rings never meet. */
  P._latticeSlots = function (count, cell) {
    var out = [{ x: 0, y: 0 }];
    for (var r = 1; out.length < count; r++) {
      var ring = [], i, j;
      for (i = -r; i <= r; i++) ring.push([i, -r]);          // top edge, left to right
      for (j = -r + 1; j <= r; j++) ring.push([r, j]);       // right edge, down
      for (i = r - 1; i >= -r; i--) ring.push([i, r]);       // bottom edge, right to left
      for (j = r - 1; j >= -r + 1; j--) ring.push([-r, j]);  // left edge, up
      ring.forEach(function (c) { out.push({ x: c[0] * cell, y: c[1] * cell }); });
    }
    return out.slice(0, count);
  };
  /* Whole-model star: the conformed dimensions sit in one compact block in the middle and
     the facts ride an ellipse around it, so every relationship is a short spoke instead of
     a line across the canvas. A subset with a single hub keeps the per-hub ring below. */
  P.layoutStar = function (opts) {
    var C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    return C.hubs.length > 1 ? this._starCore(C, opts) : this._starRings(C, opts);
  };
  /* One centre per fact with its dimensions on a ring around it. A conformed dim joins
     the least crowded fact it serves and takes the seat facing the other facts it feeds,
     so the lines that leave the ring stay short. */
  P._starRings = function (C) {
    var self = this;
    var adj = C.adj, priv = C.priv, factsOf = C.factsOf;
    var CW = C.CW, CH = C.CH, chord = this._minChord();
    var hubNames = C.hubs.map(function (h) { return h.name; });

    var members = {};
    hubNames.forEach(function (h) {
      members[h] = priv[h].slice().sort(function (a, b) { return adj[b].size - adj[a].size || byName(a, b); });
    });
    C.spine.slice().sort(byName).forEach(function (s) {
      var owner = factsOf[s].slice().sort(byName).reduce(function (a, b) { return members[a].length <= members[b].length ? a : b; });
      members[owner].push(s);
    });

    // the selected star takes the middle cell, then the biggest stars fill the ring around it
    var center = C.center;
    var order = hubNames.slice().sort(function (a, b) {
      if (a === center) return -1;
      if (b === center) return 1;
      return members[b].length - members[a].length || adj[b].size - adj[a].size || byName(a, b);
    });
    var radius = {}, outer = 0, seatsOf = {};
    order.forEach(function (h) {
      var n = members[h].length, k;
      seatsOf[h] = [];
      for (k = 0; k < n; k++) seatsOf[h].push(-Math.PI / 2 + 2 * Math.PI * k / n);   // first seat on top
      radius[h] = self._ringRadii(seatsOf[h]);
      outer = Math.max(outer, radius[h].rx + (C.orphan.length ? chord : 0));
    });
    var slots = this._latticeSlots(order.length, 2 * outer + CW);
    var placed = {}, rings = [];
    order.forEach(function (h, i) { placed[h] = { x: slots[i].x, y: slots[i].y }; });

    order.forEach(function (h) {
      var list = members[h], n = list.length, R = radius[h];
      if (!n) { rings.push({ hub: h, rx: R.rx, ry: R.ry, members: [] }); return; }
      var seats = seatsOf[h];                            // seat angles, first one at the top
      // a conformed dim wants the seat pointing at the other hubs it serves
      var want = [], shared = {};
      list.forEach(function (d) {
        var others = (factsOf[d] || []).filter(function (f) { return f !== h && placed[f]; });
        if (!others.length) return;
        var mx = 0, my = 0;
        others.forEach(function (f) { mx += placed[f].x; my += placed[f].y; });
        shared[d] = true;
        want.push({ name: d, a: Math.atan2(my / others.length - placed[h].y, mx / others.length - placed[h].x) });
      });
      want.sort(function (a, b) { return a.a - b.a || byName(a.name, b.name); });
      var taken = {};
      want.forEach(function (w) {
        var best = -1, bd = 9;
        seats.forEach(function (a, ix) {
          if (taken[ix]) return;
          var d = Math.abs(((w.a - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
          if (d < bd) { bd = d; best = ix; }
        });
        if (best >= 0) taken[best] = w.name;
      });
      var rest = list.filter(function (d) { return !shared[d]; });   // private dims fill the gaps
      seats.forEach(function (a, ix) { if (!taken[ix] && rest.length) taken[ix] = rest.shift(); });
      var seated = [];
      seats.forEach(function (a, ix) {
        var d = taken[ix]; if (!d) return;
        placed[d] = { x: placed[h].x + Math.cos(a) * R.rx, y: placed[h].y + Math.sin(a) * R.ry };
        seated.push(d);
      });
      rings.push({ hub: h, rx: R.rx, ry: R.ry, members: seated });
    });

    // dictionaries hang off their dimension, one chord further out than the ring
    this._seatOrphans(placed, adj, C.orphan, function (p) {
      var near = placed[order[0]], nd = Infinity;
      order.forEach(function (h) {
        var d = len(placed[h].x - p.x, placed[h].y - p.y);
        if (d < nd) { nd = d; near = placed[h]; }
      });
      var dx = p.x - near.x, dy = p.y - near.y, L = len(dx, dy);
      return { x: p.x + dx / L * chord, y: p.y + dy / L * chord };
    });
    this._separatePlaced(placed, C.conn.map(function (t) { return t.name; }), CW, CH, 80);
    this.lastLayout = { algo: 'star', mode: 'rings', center: center, rings: rings };
    this._applyPlaced(C, placed, CW, CH);
  };

  /* ---------- star core: dims in the middle, facts on the ring ---------- */
  var TWO_PI = Math.PI * 2;
  var wrapPi = function (a) { var x = (a + Math.PI) % TWO_PI; if (x < 0) x += TWO_PI; return x - Math.PI; };
  var angDist = function (a, b) { return Math.abs(wrapPi(a - b)); };
  var circMean = function (list) {
    var sx = 0, sy = 0;
    list.forEach(function (a) { sx += Math.cos(a); sy += Math.sin(a); });
    return Math.atan2(sy, sx);
  };
  /* Lane the core star packs against: the chip box at layoutK — the zoom this arrangement is
     going to be SHOWN at — plus the gutter a reader needs between two names. Not a worst case
     over a band of zooms: that made every lane as big as the most zoomed-out chip, which grew
     the picture, which dropped the fit below the band, which grew the chips past the lanes.
     cw/ch are the card box those lanes hold, which turns a placed centre back into the
     stored top-left position. */
  P._cell = function () { return this.cellFor(this.layoutK); };
  /* How far each dimension has to reach around the ring of facts. Circular: the widest gap
     between two consecutive facts that use the dimension is the arc it does NOT have to
     span, so minimising the rest is the same as asking facts that share dims to sit together. */
  P._ringArcCost = function (order, factsOfDim) {
    var n = order.length, seat = {}, total = 0;
    order.forEach(function (f, i) { seat[f] = i; });
    Object.keys(factsOfDim).forEach(function (d) {
      var ix = factsOfDim[d].map(function (f) { return seat[f]; })
        .filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
      if (ix.length < 2) return;
      var gap = n - ix[ix.length - 1] + ix[0];
      for (var i = 1; i < ix.length; i++) gap = Math.max(gap, ix[i] - ix[i - 1]);
      total += n - gap;
    });
    return total;
  };
  /* Relationship lines run card centre to card centre, so two of them cross exactly when the
     segments properly intersect. Edges that meet at a shared table are not crossings. */
  var side = function (a, b, c) {
    var v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return v > 0 ? 1 : (v < 0 ? -1 : 0);
  };
  var crosses = function (p, q, r, s) {
    var d1 = side(p, q, r), d2 = side(p, q, s);
    if (d1 === d2 || !d1 || !d2) return false;
    var d3 = side(r, s, p), d4 = side(r, s, q);
    return d3 !== d4 && !!d3 && !!d4;
  };
  /* Edge list hoisted once: names, not point objects, because the seating functions replace
     the point a table is placed at rather than moving it. */
  P._segments = function (placed, rels) {
    var segs = [];
    for (var i = 0; i < rels.length; i++) {
      var rr = rels[i];
      if (rr.from === rr.to || !placed[rr.from] || !placed[rr.to]) continue;
      segs.push({ a: rr.from, b: rr.to });
    }
    return segs;
  };
  /* Crossings that involve at least one of `ids` — the edges hanging off the tables a trial
     swap moves. Nothing else moved, so the delta on this subset is the delta on the whole
     drawing, which is what turns an O(E^2) rescore per trial into O(|E(v)| * E). A pair with
     both edges inside the subset is counted once, from the lower index. */
  P._crossTouching = function (placed, segs, ids) {
    var inSet = ids.inSet, list = ids.list, total = 0, i, j;
    for (i = 0; i < list.length; i++) {
      var si = list[i], s = segs[si];
      var ps = placed[s.a], qs = placed[s.b];
      if (!ps || !qs) continue;
      for (j = 0; j < segs.length; j++) {
        if (j === si || (inSet[j] && j < si)) continue;
        var t = segs[j];
        if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;
        var pt = placed[t.a], qt = placed[t.b];
        if (!pt || !qt) continue;
        if (crosses(ps, qs, pt, qt)) total++;
      }
    }
    return total;
  };
  /* Seed order for the ring: walk from the busiest fact to whichever unplaced fact shares
     the most conformed dimensions with it. Sorted input, so ties always break the same way. */
  P._factChain = function (hubNames, adj, spineOf) {
    var all = hubNames.slice().sort(function (a, b) { return adj[b].size - adj[a].size || byName(a, b); });
    var chain = [], used = {}, cur = all[0];
    while (cur) {
      chain.push(cur); used[cur] = true;
      var here = spineOf[cur] || [], best = null, bs = -1;
      all.forEach(function (f) {
        if (used[f]) return;
        var ov = (spineOf[f] || []).filter(function (s) { return here.indexOf(s) >= 0; }).length;
        if (ov > bs) { bs = ov; best = f; }
      });
      cur = best;
    }
    return chain;
  };
  P._starCore = function (C) {
    var self = this, adj = C.adj, priv = C.priv, factsOf = C.factsOf, spineOf = C.spineOf;
    var K = this._cell(), CELLW = K.w, CELLH = K.h;
    var hubNames = C.hubs.map(function (h) { return h.name; });

    // ring order: chain of facts that share dims, then adjacent swaps while they help
    var order = this._factChain(hubNames, adj, spineOf);
    var cost = this._ringArcCost(order, factsOf), i, j, tmp;
    for (var pass = 0; pass < 8; pass++) {
      var improved = false;
      for (i = 0; i < order.length; i++) {
        j = (i + 1) % order.length;
        tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        var c2 = this._ringArcCost(order, factsOf);
        if (c2 < cost) { cost = c2; improved = true; }
        else { tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
      }
      if (!improved) break;
    }
    // the selected fact opens the ring at the top; otherwise the busiest fact does
    var center = C.center;
    var at = center ? order.indexOf(center) : -1;
    if (at > 0) order = order.slice(at).concat(order.slice(0, at));
    var N = order.length, A0 = -Math.PI / 2;
    var seatAngle = {};
    order.forEach(function (f, k) { seatAngle[f] = A0 + TWO_PI * k / N; });

    // centre block: one cell per conformed dim, rows balanced so the block stays square-ish
    var dims = C.spine.slice().sort(byName), n = dims.length;
    var cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    var rows = Math.max(1, Math.ceil(n / cols));
    var cells = [], rowCount = [], r, c;
    for (r = 0; r < rows; r++) rowCount.push(Math.floor(n / rows) + (r < n % rows ? 1 : 0));
    for (r = 0; r < rows; r++) {
      for (c = 0; c < rowCount[r]; c++) {
        cells.push({ x: (c - (rowCount[r] - 1) / 2) * CELLW, y: (r - (rows - 1) / 2) * CELLH });
      }
    }
    var widest = rowCount.length ? Math.max.apply(null, rowCount) : 1;
    var rx = (widest - 1) / 2 * CELLW + CELLW;
    /* A canvas is about twice as wide as it is tall once the library rail, the zoom rail and
       the overview map have taken their share, and Fit is driven by the worse axis — so a
       round picture throws away half the zoom. Each fact's own dims hang outside the ring and
       round the outline back out, so the ring itself is cut flatter than the picture it draws:
       measured on the bundled model, a 2.3:1 ring draws a 1.65:1 one. Flatter than that keeps
       buying zoom, but it also pulls the facts at the ends away from the block in the middle
       and the crossing count starts to climb (2.6 -> 594, 3.0 -> 611 against galaxy's 591),
       so this is where the two curves meet. */
    var RING_ASPECT = 2.3, ryFloor = (rows - 1) / 2 * CELLH + CELLH;
    var ry = Math.max(ryFloor, rx / RING_ASPECT);
    var clash = function () {                      // facts clear of each other and of the block
      var pts = order.map(function (f) { var a = seatAngle[f]; return { x: Math.cos(a) * rx, y: Math.sin(a) * ry }; });
      var all = pts.concat(cells);
      for (var p = 0; p < pts.length; p++) {
        for (var q = 0; q < all.length; q++) {
          if (all[q] === pts[p]) continue;
          if (Math.abs(pts[p].x - all[q].x) < CELLW - 0.5 && Math.abs(pts[p].y - all[q].y) < CELLH - 0.5) return true;
        }
      }
      return false;
    };
    // growing keeps that shape rather than inflating a circle
    for (var grow = 0; grow < 40 && clash(); grow++) { rx *= 1.05; ry = Math.max(ryFloor, rx / RING_ASPECT); }

    var placed = {}, seatOf = {};
    order.forEach(function (f, k) { seatOf[f] = k; });

    /* Each conformed dim wants the cell that points at the arc of facts it feeds; the dims
       that feed the most facts want the middle of the block, where every arc is close. */
    var want = {}, load = {}, maxR = 1;
    dims.forEach(function (d) {
      var fs = (factsOf[d] || []).filter(function (f) { return seatAngle[f] != null; });
      load[d] = fs.length;
      want[d] = fs.length ? circMean(fs.map(function (f) { return seatAngle[f]; })) : 0;
    });
    cells.forEach(function (cl) { cl.r = len(cl.x, cl.y); cl.a = Math.atan2(cl.y, cl.x); maxR = Math.max(maxR, cl.r); });
    cells.slice().sort(function (p, q) { return p.r - q.r; })
      .forEach(function (cl, k) { cl.rank = n > 1 ? k / (n - 1) : 0; });
    var cellOf = {}, taken = [];
    dims.slice().sort(function (p, q) { return load[q] - load[p] || byName(p, q); }).forEach(function (d, k) {
      var rank = n > 1 ? k / (n - 1) : 0, best = -1, bc = Infinity;
      cells.forEach(function (cl, ci) {
        if (taken[ci]) return;
        var cc = Math.abs(cl.rank - rank) + angDist(want[d], cl.a) / Math.PI * 1.0 * (cl.r / maxR);
        if (cc < bc) { bc = cc; best = ci; }
      });
      if (best < 0) return;
      taken[best] = d;
      cellOf[d] = best;
    });

    /* A fact's own dims sit just outside it, on the far side from the block. */
    var stepFor = function (ux, uy) {
      var t = Math.min(Math.abs(ux) > 1e-6 ? CELLW / Math.abs(ux) : Infinity,
        Math.abs(uy) > 1e-6 ? CELLH / Math.abs(uy) : Infinity);
      return isFinite(t) ? t : CELLW;
    };
    var seatFact = function (f) {
      var a = A0 + TWO_PI * seatOf[f] / N;
      var p = { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
      placed[f] = p;
      var list = (priv[f] || []).slice().sort(function (x, y) { return adj[y].size - adj[x].size || byName(x, y); });
      if (!list.length) return;
      var L = len(p.x, p.y), ux = p.x / L, uy = p.y / L;
      var out = stepFor(ux, uy), across = stepFor(-uy, ux);
      list.forEach(function (d, k) {
        var off = (k - (list.length - 1) / 2) * across;
        placed[d] = { x: p.x + ux * out - uy * off, y: p.y + uy * out + ux * off };
      });
    };
    var seatDim = function (d) { var cl = cells[cellOf[d]]; if (cl) placed[d] = { x: cl.x, y: cl.y }; };
    order.forEach(seatFact);
    dims.forEach(seatDim);

    /* Two free choices are left — which cell each dim takes and which seat each fact takes.
       A bounded round of swaps that actually remove crossings settles both. Each trial is
       scored on the edges the two moved tables own, not on the whole drawing, and the whole
       refinement is gated on the edge count exactly as the layered transpose step is: past
       that size the pass is both too slow and too marginal to be worth the wait. */
    var rels = this.app.model.relationships;
    var segs = this._segments(placed, rels);
    var owns = {};                                 // table -> indices of the edges it touches
    segs.forEach(function (s, i) {
      (owns[s.a] = owns[s.a] || []).push(i);
      (owns[s.b] = owns[s.b] || []).push(i);
    });
    /* Re-seating a fact also re-seats its own dims, so a fact swap moves more than the two
       tables named in it — the scored edge set has to cover everything that moved. */
    var movesWith = function (n) { return [n].concat(priv[n] || []); };
    var idsFor = function (u, v, expand) {
      var inSet = {}, list = [];
      (expand ? movesWith(u).concat(movesWith(v)) : [u, v]).forEach(function (n) {
        (owns[n] || []).forEach(function (i) { if (!inSet[i]) { inSet[i] = 1; list.push(i); } });
      });
      list.sort(function (a, b) { return a - b; });
      return { inSet: inSet, list: list };
    };
    var swap = function (list, key, apply, expand) {
      for (var round = 0; round < 4; round++) {
        var gained = false;
        for (var a = 0; a < list.length; a++) {
          for (var b = a + 1; b < list.length; b++) {
            var u = list[a], v = list[b], ids = idsFor(u, v, expand);
            if (!ids.list.length) continue;
            var before = self._crossTouching(placed, segs, ids);
            var t = key[u]; key[u] = key[v]; key[v] = t;
            apply(u); apply(v);
            if (self._crossTouching(placed, segs, ids) < before) { gained = true; continue; }
            t = key[u]; key[u] = key[v]; key[v] = t; apply(u); apply(v);
          }
        }
        if (!gained) break;
      }
    };
    if (refineFits(dims.length + order.length, segs.length)) {
      swap(dims, cellOf, seatDim, false);
      swap(order, seatOf, seatFact, true);
    }
    order.sort(function (a, b) { return seatOf[a] - seatOf[b]; });

    // dictionaries hang off their dimension, one cell further from the middle
    this._seatOrphans(placed, adj, C.orphan, function (p) {
      var L = len(p.x, p.y);
      return { x: p.x + p.x / L * CELLW, y: p.y + p.y / L * CELLH };
    });
    this._separatePlaced(placed, C.conn.map(function (t) { return t.name; }), CELLW, CELLH, 90);
    this.lastLayout = { algo: 'star', mode: 'core', center: center, rx: rx, ry: ry,
      facts: order.slice(), dims: dims.slice(), rows: rows, cols: widest };
    this._applyPlaced(C, placed, K.cw, K.ch);
  };

  /* ---------- constellation (whole model) ---------- */
  /* A small force simulation over the whole model: hubs push each other apart, a conformed
     dim is pulled to the midpoint of the hubs it serves, a private dim stays on its hub's
     ring, and a final collision pass separates the cards. Seeded from the sorted table
     names and bounded to ITER steps, so the same model always lands the same way.
     A hub only has to clear its OWN dims — the shared ones live between the hubs — and a
     gravity term pulls the whole picture back to the middle, which is what keeps the
     drawing inside a screen instead of drifting out to a 6000px field. */
  P.layoutConstellation = function (opts) {
    var self = this, C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    var adj = C.adj, isHub = C.isHub;
    var CW = C.CW, CH = C.CH;
    /* The simulation runs in a space where a card is SQUARE — every distance below is
       isotropic, so a round blob is what a free-floating force layout wants to settle into.
       Squashing y by the card's real aspect on the way out turns that blob into a picture
       roughly 1.7 times wider than it is tall, which is the shape a screen actually has, and
       does it with one affine map: relative order, and therefore the crossing count, is
       exactly what the simulation produced. */
    var ys = CH / CW, chord = CW * Math.SQRT2;
    // the anchor hub opens the ring of seeds, so the selection lands where the reader expects
    var hubNames = this._anchorFirst(C.hubs.map(function (h) { return h.name; }).sort(byName), C.center);
    var names = C.conn.map(function (t) { return t.name; }).sort(byName);
    var node = {}, HR = {}, GRAV = 0.04, GRAVY = 0.04;
    hubNames.forEach(function (h) { HR[h] = self._ringRadius((C.priv[h] || []).length + 1, chord); });
    var spread = Math.max(700, hubNames.length * 110);
    hubNames.forEach(function (h, i) {
      var a = 2 * Math.PI * i / hubNames.length;
      node[h] = { x: Math.cos(a) * spread, y: Math.sin(a) * spread, hub: true, anchors: [], ring: 0 };
    });
    names.forEach(function (n, i) {
      if (node[n]) return;
      var all = Array.from(adj[n]).sort(byName);
      var anchors = all.filter(function (m) { return isHub[m]; });
      if (!anchors.length) anchors = all;
      // seed just outside the first anchor, fanned by index so the start is never degenerate
      var seed = node[anchors[0]] || { x: 0, y: 0 };
      var a2 = 2 * Math.PI * ((i * 5) % Math.max(1, names.length)) / Math.max(1, names.length);
      node[n] = { x: seed.x + Math.cos(a2) * 380, y: seed.y + Math.sin(a2) * 380, hub: false,
        anchors: anchors, ring: anchors.length === 1 && HR[anchors[0]] ? HR[anchors[0]] : 0 };
    });

    var ITER = 300;
    for (var it = 0; it < ITER; it++) {
      var cool = 1 - it / ITER;
      var i2, j2, a3, b3, dx, dy, d;
      for (i2 = 0; i2 < hubNames.length; i2++) {
        for (j2 = i2 + 1; j2 < hubNames.length; j2++) {
          a3 = node[hubNames[i2]]; b3 = node[hubNames[j2]];
          dx = a3.x - b3.x; dy = a3.y - b3.y; d = len(dx, dy);
          var want = (HR[hubNames[i2]] + HR[hubNames[j2]]) * 0.35 + CW;
          if (d >= want) continue;
          var push = (want - d) / 2 * 0.35;
          a3.x += dx / d * push; a3.y += dy / d * push; b3.x -= dx / d * push; b3.y -= dy / d * push;
        }
      }
      /* gravity: every card drifts back towards the middle, so the repulsion settles at a
         finite size instead of pushing the picture apart for as long as the loop runs */
      names.forEach(function (n) { var nd = node[n]; nd.x -= nd.x * GRAV * cool; nd.y -= nd.y * GRAVY * cool; });
      names.forEach(function (n) {
        var nd = node[n];
        if (nd.hub || !nd.anchors.length) return;
        var tx = 0, ty = 0;
        nd.anchors.forEach(function (h) { tx += node[h].x; ty += node[h].y; });
        tx /= nd.anchors.length; ty /= nd.anchors.length;
        if (nd.ring) {                                   // one anchor: sit on its ring, not on it
          var ox = nd.x - tx, oy = nd.y - ty, L = len(ox, oy);
          tx += ox / L * nd.ring; ty += oy / L * nd.ring;
        }
        nd.x += (tx - nd.x) * 0.14 * cool; nd.y += (ty - nd.y) * 0.14 * cool;
      });
      for (i2 = 0; i2 < names.length; i2++) {            // light all-pairs repulsion
        for (j2 = i2 + 1; j2 < names.length; j2++) {
          a3 = node[names[i2]]; b3 = node[names[j2]];
          dx = a3.x - b3.x; dy = a3.y - b3.y; d = len(dx, dy);
          if (d >= chord) continue;
          var sep = (chord - d) / 2 * 0.25;
          a3.x += dx / d * sep; a3.y += dy / d * sep; b3.x -= dx / d * sep; b3.y -= dy / d * sep;
        }
      }
    }
    /* Separate while the space is still square, then squash: a pair pushed CW apart in the
       simulation's space is CW by CH apart once y is scaled, which is exactly the gap box —
       so the squash needs no second separation pass to undo it, and the picture keeps the
       wide shape the scale was for. The final pass is the safety net, not the workhorse. */
    var placed = {};
    names.forEach(function (n) { placed[n] = { x: node[n].x, y: node[n].y }; });
    this._separatePlaced(placed, names, CW, CW, 200);
    names.forEach(function (n) { placed[n].y *= ys; });
    this._separatePlaced(placed, names, CW, CH, 60);
    this._reshape(placed, names, CW, CH, RESHAPE_TARGET);
    this.lastLayout = { algo: 'constellation', center: C.center || null };
    this._applyPlaced(C, placed, CW, CH);
  };

  /* ---------- layered (dims on top) ---------- */
  /* Two rows of nodes on parallel lines cross exactly where their endpoints are out of
     order, so the ordering is the whole game: barycentre sweeps to get close, then
     adjacent swaps that actually remove a crossing (the Sugiyama transpose step). */
  /* edges are [dim, fact] pairs; di / fi map a name to its seat in its own row */
  P._layerCrossings = function (edges, di, fi) {
    var n = 0;
    for (var i = 0; i < edges.length; i++) {
      for (var j = i + 1; j < edges.length; j++) {
        if ((di[edges[i][0]] - di[edges[j][0]]) * (fi[edges[i][1]] - fi[edges[j][1]]) < 0) n++;
      }
    }
    return n;
  };
  /* Swap neighbours in one row while that removes crossings. own is di or fi — the same
     object the row indexes into, so the trial swap is visible to the counter. */
  P._transposeLayer = function (row, edges, di, fi, own) {
    var best = this._layerCrossings(edges, di, fi), moved = true, guard = 0;
    while (moved && guard++ < 12) {
      moved = false;
      for (var i = 0; i + 1 < row.length; i++) {
        var a = row[i], b = row[i + 1];
        own[a] = i + 1; own[b] = i;
        var now = this._layerCrossings(edges, di, fi);
        if (now < best) { best = now; row[i] = b; row[i + 1] = a; moved = true; }
        else { own[a] = i; own[b] = i + 1; }
      }
    }
    return best;
  };
  /* The Kimball picture people draw by hand: dimensions on top, facts in a row underneath,
     each fact under the middle of the dims it uses so its own dims sit directly above it. */
  P.layoutLayered = function (opts) {
    var C = this._prologue(opts = opts || {}); if (!C) return this.layoutGrid(opts);
    var adj = C.adj, priv = C.priv, factsOf = C.factsOf;
    var CW = C.CW, CH = C.CH;
    // the anchor seeds the fact row, so the barycentre sweeps settle around the selection
    var facts = this._anchorFirst(C.hubs.map(function (h) { return h.name; })
      .sort(function (a, b) { return adj[b].size - adj[a].size || byName(a, b); }), C.center);
    var dims = [], hubOf = {};
    facts.forEach(function (f) { priv[f].forEach(function (d) { hubOf[d] = f; dims.push(d); }); });
    C.spine.forEach(function (s) { dims.push(s); });
    dims.sort(byName);
    var hubsOfDim = function (d) { return (factsOf[d] && factsOf[d].length) ? factsOf[d] : (hubOf[d] ? [hubOf[d]] : []); };
    var edges = [];
    dims.forEach(function (d) { hubsOfDim(d).forEach(function (f) { edges.push([d, f]); }); });

    var di = {}, fi = {}, reindex = function () {
      dims.forEach(function (d, i) { di[d] = i; });
      facts.forEach(function (f, i) { fi[f] = i; });
    };
    var bary = function (list, own, other, nbrs) {
      var key = {};
      list.forEach(function (n) {
        var ns = nbrs(n).filter(function (m) { return other[m] != null; });
        key[n] = ns.length ? ns.reduce(function (s, m) { return s + other[m]; }, 0) / ns.length : own[n];
      });
      list.sort(function (a, b) { return key[a] - key[b] || byName(a, b); });
    };
    var dimsOfFact = function (f) { return dims.filter(function (d) { return adj[f].has(d); }); };
    reindex();
    var best = { d: dims.slice(), f: facts.slice(), c: this._layerCrossings(edges, di, fi) };
    var refine = refineFits(dims.length + facts.length, edges.length);   // O(E^2) per try
    for (var round = 0; round < 8; round++) {
      bary(dims, di, fi, hubsOfDim); reindex();
      bary(facts, fi, di, dimsOfFact); reindex();
      var c = this._layerCrossings(edges, di, fi);
      if (refine) {
        c = this._transposeLayer(dims, edges, di, fi, di);
        c = this._transposeLayer(facts, edges, di, fi, fi);
        reindex();
      }
      if (c < best.c) best = { d: dims.slice(), f: facts.slice(), c: c };
    }
    dims = best.d; facts = best.f; reindex();

    // dims take evenly spaced seats; each fact sits under the middle of the dims it uses
    var DSLOT = CW, ROW = CH * 1.15, placed = {};
    dims.forEach(function (d, i) { placed[d] = { x: i * DSLOT, y: 0 }; });
    var factY = CH * 2.2;
    facts.forEach(function (f) {
      var own = dimsOfFact(f);
      var x = own.length ? own.reduce(function (s, d) { return s + placed[d].x; }, 0) / own.length : fi[f] * DSLOT;
      placed[f] = { x: x, y: factY };
    });
    // dictionaries sit in their own row above the dimensions
    this._seatOrphans(placed, adj, C.orphan, function (p) { return { x: p.x, y: Math.min(-ROW, p.y - ROW) }; });
    this._deoverlapLanes(C.conn, placed, 'x', CH * 0.5, CW);
    this._separatePlaced(placed, C.conn.map(function (t) { return t.name; }), CW, CH, 40);
    this.lastLayout = { algo: 'layered', center: C.center || null, factY: factY, dims: dims.slice(), facts: facts.slice() };
    this._applyPlaced(C, placed, CW, CH);
  };

  /* ---------- grid ---------- */
  /* The plain grid the Arrange button used to hard-code: facts first, or the tables
     nearest the selection first, in rows as tall as the tallest card in the row. */
  P.layoutGrid = function (opts) {
    opts = opts || {};
    var self = this, app = this.app, model = app.model, RG = g.RelationshipGraph;
    var ns = model.tables.map(function (t) { return t.name; })
      .filter(function (n) { return !opts.names || opts.names.has(n); });
    if (!ns.length) return;
    var root = opts.center && ns.indexOf(opts.center) >= 0 ? opts.center : null;
    var dist = root && RG ? RG.traverse(model, [root], { direction: 'connected', includeInactive: true }).distances : null;
    ns.sort(function (a, b) {
      return (dist ? (dist.get(a) || 0) - (dist.get(b) || 0)
        : Number(app.isFact(model.byName[b])) - Number(app.isFact(model.byName[a]))) || byName(a, b);
    });
    /* Rows and columns are cut for the chip the reader sees at the zoom a grid of this size
       fits at, never smaller than whatever an expanded card currently measures. */
    var G = this._gapBox();
    var cols = Math.max(1, Math.ceil(Math.sqrt(ns.length * 1.55))), rows = Math.ceil(ns.length / cols), rowHeights = [];
    for (var r = 0; r < rows; r++) {
      rowHeights[r] = Math.max.apply(null, ns.slice(r * cols, (r + 1) * cols)
        .map(function (n) { return Math.max(G.y, (self.cards[n] && self.cards[n].h) || 0); }));
    }
    var y = 0;
    ns.forEach(function (n, i) {
      if (i && i % cols === 0) y += rowHeights[Math.floor(i / cols) - 1];
      self.pos[n] = { x: (i % cols) * G.x, y: y };
    });
    this.lastLayout = { algo: 'grid', center: root };
    if (this._quiet) return;                 // the caller persists, re-renders and fits once
    ns.forEach(function (n) { if (self.cards[n]) self.layoutCard(n); });
    this.persist();
    this.renderLines();
    this.fitView();
  };

  /* ---------- cluster mode ---------- */
  P.groupKeyOf = function (t) { return this.app.colorBy === 'source' ? this.app.srcKeyOf(t) : t.domain; };
  P.groupLabelOf = function (k) {
    if (this.app.colorBy !== 'source') return k;
    var map = { manual: 'Manual', calculated: 'Calculated', other: 'Other' };
    return map[k] || k;
  };
  P.enterClusters = function () {
    this.clusterOn = true; this.cpos = {}; this.expandedGroups = new Set();
    this.pinned.clear();
    this.setAllExpanded(false);
    this.app.setState({ allExpanded: false, isolate: false, activeFilter: null });
    this.buildClusters();
    this.fitView();
  };
  P.exitClusters = function () {
    var self = this;
    if (!this.clusterOn) return;
    this.clusterOn = false;
    this.destroyClusters();
    this.cpos = {};
    Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
    this.refreshVisibility();
  };
  P.destroyClusters = function () {
    var self = this;
    if (this.groups) Object.keys(this.groups).forEach(function (k) { self.groups[k].el.remove(); self.groups[k].pill.remove(); });
    this.groups = null;
  };
  P.buildClusters = function () {
    var self = this, app = this.app, model = this.app.model;
    this.destroyClusters();
    if (!this.world) return;
    this.expandedGroups = new Set(); this.cpos = {};
    var byKey = {};
    model.tables.forEach(function (t) { var k = self.groupKeyOf(t); (byKey[k] = byKey[k] || []).push(t); });
    var internal = {}, external = {};
    model.relationships.forEach(function (r) {
      var ga = self.groupKeyOf(model.byName[r.from]), gb = self.groupKeyOf(model.byName[r.to]);
      if (ga === gb) internal[ga] = (internal[ga] || 0) + 1;
      else { external[ga] = (external[ga] || 0) + 1; external[gb] = (external[gb] || 0) + 1; }
    });
    this.groups = {};
    this.groupOrder = Object.keys(byKey).sort(function (a, b) { return byKey[b].length - byKey[a].length; });
    this.groupOrder.forEach(function (k) {
      var tables = byKey[k];
      var col = app.colorBy === 'source' ? (app._srcMap[k] || '#64748b') : (app._domMap[k] || '#64748b');
      var label = self.groupLabelOf(k);
      var facts = tables.filter(function (t) { return app.isFact(t); }).length;
      var dims = tables.filter(function (t) { return t.role === 'dim'; }).length;
      var other = tables.length - facts - dims;
      var elx = el('div', {
        style: 'position:absolute;width:252px;background:#fff;border:1px solid ' + tint(col, 0.4) + ';border-radius:13px;box-shadow:0 1px 3px rgba(20,30,50,.06),0 8px 22px rgba(20,30,50,.08);overflow:hidden;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;transition:box-shadow .15s;',
        html: '<div style="height:7px;background:' + col + ';"></div>' +
          '<div style="padding:12px 14px 12px;">' +
          '<div style="display:flex;align-items:baseline;gap:8px;">' +
          '<div style="flex:1;min-width:0;font:600 14px/1.25 \'IBM Plex Sans\',sans-serif;color:#1f2430;overflow-wrap:anywhere;">' + U.esc(label) + '</div>' +
          '<div style="font:700 21px/1 \'IBM Plex Mono\',monospace;color:' + col + ';">' + tables.length + '</div>' +
          '</div>' +
          '<div style="margin-top:7px;font:500 10.5px/1.6 \'IBM Plex Mono\',monospace;color:#8b92a0;">' + facts + ' fact · ' + dims + ' dim' + (other ? (' · ' + other + ' other') : '') + '<br>' + (internal[k] || 0) + ' internal · ' + (external[k] || 0) + ' external rels</div>' +
          '<div style="margin-top:8px;font:600 10px/1 \'IBM Plex Sans\',sans-serif;color:' + col + ';">Click to expand ▾</div>' +
          '</div>'
      });
      elx.addEventListener('mouseenter', function () { elx.style.boxShadow = '0 2px 6px rgba(20,30,50,.1),0 14px 30px rgba(20,30,50,.14)'; });
      elx.addEventListener('mouseleave', function () { elx.style.boxShadow = '0 1px 3px rgba(20,30,50,.06),0 8px 22px rgba(20,30,50,.08)'; });
      var pill = el('div', {
        style: 'position:absolute;display:none;height:36px;align-items:center;gap:9px;padding:0 12px;background:' + tint(col, 0.12) + ';border:1.5px solid ' + tint(col, 0.5) + ';border-radius:9px;cursor:pointer;font-family:\'IBM Plex Sans\',sans-serif;box-sizing:border-box;',
        html: '<span style="width:10px;height:10px;border-radius:3px;background:' + col + ';flex:none;"></span>' +
          '<span style="flex:1;min-width:0;font:600 12.5px/1 \'IBM Plex Sans\',sans-serif;color:#1f2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + U.esc(label) + ' · ' + tables.length + ' tables</span>' +
          '<span style="font:600 10px/1 \'IBM Plex Sans\',sans-serif;color:#6b7280;flex:none;">collapse ✕</span>'
      });
      self.world.appendChild(elx); self.world.appendChild(pill);
      var gg = { key: k, tables: tables, col: col, label: label, el: elx, pill: pill, x: 0, y: 0, w: 252, h: 150, cols: 1 };
      self.groups[k] = gg;
      self.bindGroupDrag(gg);
    });
    this.refreshVisibility();
    this.reflowClusters();
  };
  P.bindGroupDrag = function (gg) {
    var self = this;
    var bind = function (handle, movesMembers) {
      handle.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        var sx = e.clientX, sy = e.clientY, x0 = gg.x, y0 = gg.y;
        var snap = {};
        if (movesMembers) gg.tables.forEach(function (t) { if (self.cpos[t.name]) snap[t.name] = { x: self.cpos[t.name].x, y: self.cpos[t.name].y }; });
        var moved = false;
        var mm = function (ev) {
          var dx = (ev.clientX - sx) / self.view.k, dy = (ev.clientY - sy) / self.view.k;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
          gg.x = x0 + dx; gg.y = y0 + dy;
          handle.style.left = gg.x + 'px'; handle.style.top = gg.y + 'px';
          if (movesMembers) gg.tables.forEach(function (t) { if (snap[t.name]) { self.cpos[t.name] = { x: snap[t.name].x + dx, y: snap[t.name].y + dy }; self.layoutCard(t.name); } });
          self.clusterLines();
        };
        var mu = function () {
          window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu);
          if (!moved) self.toggleGroup(gg.key);
        };
        window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
      });
    };
    bind(gg.el, false); bind(gg.pill, true);
  };
  /* Everything that follows a change to which domain groups are open: what is visible, how
     the groups pack, where the view sits and what the toolbar says. */
  P._afterGroupChange = function () {
    this.refreshVisibility();
    this.reflowClusters();
    this.fitView();
    this.refreshClusterChrome();
  };
  P.toggleGroup = function (key) {
    if (this.expandedGroups.has(key)) this.expandedGroups.delete(key); else this.expandedGroups.add(key);
    this._afterGroupChange();
  };
  /* Expand all / Collapse all from the Domains toolbar — one reflow and one fit for the
     whole set instead of a toggle per group. */
  P.setAllGroups = function (on) {
    if (!this.groups) return;
    this.expandedGroups = on ? new Set(this.groupOrder) : new Set();
    this._afterGroupChange();
  };
  P.refreshClusterChrome = function () {
    var ex = this.app.explorer;
    if (!ex) return;
    ex._clusterKey = null;
    ex.update();
  };
  P.reflowClusters = function () {
    var self = this;
    if (!this.groups) return;
    var GAP = 90, CW = this.CARD_W;
    var boxes = this.groupOrder.map(function (k) {
      var gg = self.groups[k], n = gg.tables.length;
      if (self.expandedGroups.has(k)) {
        var cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
        gg.cols = cols;
        var rows = Math.ceil(n / cols);
        return { k: k, exp: true, w: Math.max(300, cols * (CW + 22) - 22), h: 46 + rows * 152 - 20 };
      }
      return { k: k, exp: false, w: 252, h: 150 };
    });
    var area = boxes.reduce(function (s, b) { return s + (b.w + GAP) * (b.h + GAP); }, 0);
    var limit = Math.max(1500, Math.sqrt(area) * 1.5);
    var x = 0, y = 0, rowH = 0;
    boxes.forEach(function (b) {
      if (x > 0 && x + b.w > limit) { x = 0; y += rowH + GAP; rowH = 0; }
      b.x = x; b.y = y; x += b.w + GAP; rowH = Math.max(rowH, b.h);
    });
    boxes.forEach(function (b) {
      var gg = self.groups[b.k];
      gg.x = b.x; gg.y = b.y; gg.w = b.w; gg.h = b.h;
      if (b.exp) {
        gg.el.style.display = 'none';
        gg.pill.style.display = 'flex';
        gg.pill.style.left = b.x + 'px'; gg.pill.style.top = b.y + 'px'; gg.pill.style.width = b.w + 'px';
        gg.tables.forEach(function (t, i) {
          var c = i % gg.cols, r = Math.floor(i / gg.cols);
          self.cpos[t.name] = { x: b.x + c * (CW + 22), y: b.y + 46 + r * 152 };
          self.layoutCard(t.name);
        });
      } else {
        gg.pill.style.display = 'none';
        gg.el.style.display = 'block';
        gg.el.style.left = b.x + 'px'; gg.el.style.top = b.y + 'px';
      }
    });
    this.clusterLines();
  };
  P._edgePath = function (x1, y1, x2, y2) {
    var dx = x2 - x1, s = dx >= 0 ? 1 : -1;
    var c = Math.max(40, Math.min(190, Math.abs(dx) * 0.4));
    return 'M ' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' C ' + (x1 + s * c).toFixed(1) + ',' + y1.toFixed(1) + ' ' + (x2 - s * c).toFixed(1) + ',' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ',' + y2.toFixed(1);
  };
  P.clusterLines = function () {
    var self = this, model = this.app.model;
    if (!this.svg || !this.groups) return;
    U.clear(this.svg);
    var gOf = function (n) { return self.groupKeyOf(model.byName[n]); };
    var isExp = function (k) { return self.expandedGroups.has(k); };
    var center = function (k) { var gg = self.groups[k]; return isExp(k) ? { x: gg.x + gg.w / 2, y: gg.y + 18 } : { x: gg.x + gg.w / 2, y: gg.y + gg.h / 2 }; };
    var agg = {}, t2g = {}, direct = [];
    model.relationships.forEach(function (r) {
      if (!self.cards[r.from] || !self.cards[r.to]) return;
      var ga = gOf(r.from), gb = gOf(r.to);
      if (!self.groups[ga] || !self.groups[gb]) return;
      var ea = isExp(ga), eb = isExp(gb);
      if (ea && eb) { direct.push(r); return; }
      if (!ea && !eb) {
        if (ga === gb) return;
        var k = ga < gb ? ga + '\u0001' + gb : gb + '\u0001' + ga;
        (agg[k] = agg[k] || { a: ga, b: gb, rels: [] }).rels.push(r);
        return;
      }
      var tbl = ea ? r.from : r.to, grp = ea ? gb : ga;
      var k2 = tbl + '\u0001' + grp;
      (t2g[k2] = t2g[k2] || { tbl: tbl, grp: grp, rels: [] }).rels.push(r);
    });
    var mk = function (d, w, col, op) {
      var p = sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', opacity: op });
      p.style.pointerEvents = 'stroke'; p.style.cursor = 'pointer';
      self.svg.appendChild(p); return p;
    };
    var tipFor = function (rels) {
      var lines = rels.slice(0, 6).map(function (x) { return U.esc(x.from) + '.' + U.esc(x.fromCol) + ' → ' + U.esc(x.to) + '.' + U.esc(x.toCol) + (x.inactive ? ' · inactive' : ''); });
      if (rels.length > 6) lines.push('+ ' + (rels.length - 6) + ' more');
      return lines.join('<br>');
    };
    var hover = function (p, rels) {
      p.addEventListener('mouseenter', function (e) { p.setAttribute('stroke', '#2563eb'); p.setAttribute('opacity', '1'); self.showTip(tipFor(rels), e); });
      p.addEventListener('mousemove', function (e) { self.moveTip(e); });
      p.addEventListener('mouseleave', function () { p.setAttribute('stroke', '#8f9bb3'); p.setAttribute('opacity', '0.55'); self.hideTip(); });
    };
    var badge = function (x, y, n) {
      if (n < 2) return;
      self.svg.appendChild(sv('circle', { cx: x, cy: y, r: 10, fill: '#fff', stroke: '#c3cbd8', 'stroke-width': '1.2' }));
      self.svg.appendChild(sv('text', { x: x, y: y + 3.5, 'text-anchor': 'middle', style: "font:600 10px 'IBM Plex Mono',monospace;fill:#4b5563;", text: String(n) }));
    };
    Object.keys(agg).forEach(function (k) {
      var a = agg[k];
      var A = center(a.a), B = center(a.b);
      var w = 1.6 + Math.min(5, a.rels.length * 0.55);
      var p = mk(self._edgePath(A.x, A.y, B.x, B.y), w, '#8f9bb3', 0.55);
      hover(p, a.rels);
      badge((A.x + B.x) / 2, (A.y + B.y) / 2, a.rels.length);
    });
    Object.keys(t2g).forEach(function (k) {
      var m = t2g[k];
      var c = self.cards[m.tbl]; if (!c) return;
      var p0 = self.gp(m.tbl), B = center(m.grp);
      var ax = B.x > p0.x + c.w / 2 ? p0.x + c.w : p0.x;
      var ay = p0.y + (c.headH ? c.headH / 2 : 24);
      var w = 1.5 + Math.min(4, m.rels.length * 0.5);
      var p = mk(self._edgePath(ax, ay, B.x, B.y), w, '#8f9bb3', 0.55);
      hover(p, m.rels);
      badge((ax + B.x) / 2, (ay + B.y) / 2, m.rels.length);
    });
    direct.forEach(function (r) {
      var g0 = self.routeOf(r);
      var p = mk(self.edgeGeom(g0, 0).d, 1.5, '#8f9bb3', 0.55);
      if (r.inactive) p.setAttribute('stroke-dasharray', '6 5');
      hover(p, [r]);
    });
  };
})(window);
