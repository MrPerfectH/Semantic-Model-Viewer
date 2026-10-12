/* pq-workspace/2: geometry and interaction only. The coordinator supplies the
 * complete graph, presentation context, filter projection and generation.
 * No analysis, source loading, shell state, history or persistence here. */
(function (g) {
  'use strict';
  var W = 252, H = 96, GAP_X = 100, GAP_Y = 30;
  function mount(host, options) {
    options = options || {};
    var doc = host.ownerDocument, win = doc.defaultView || g;
    var alive = true, context = null, generation, selected = null, matches = null, visible = null, focusIds = null, flowRoot = null, branchIds = new Set();
    var positions = new Map(), nodes = new Map(), elements = new Map(), groups = [], layoutGenerations = new WeakMap();
    var view = { x: 0, y: 0, k: 1 }, size = { w: 0, h: 0 }, roving = null;
    var suspended = false, pendingFit = false, frame = 0, drag = null, pinch = null;
    var pointers = new Map(), removers = [], edgeElements = [], miniElements = new Map(), titleSize = 0, detailSize = 0, edgeZoom = null;
    // Tables loads before PQ in the viewer and snapshot. Reuse its drawing
    // methods without constructing a Tables canvas or adopting relationship state.
    var drawing = g.GraphCanvas.prototype;
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    function svg(tag, attrs) { var e = doc.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
    function on(target, name, fn, opts) { target.addEventListener(name, fn, opts); removers.push(function () { target.removeEventListener(name, fn, opts); }); }
    var root = el('div', 'pqc'), surface = el('div', 'pqc-surface'), world = el('div', 'pqc-world');
    root.setAttribute('aria-label', 'Power Query input to consumer canvas'); root.setAttribute('role', 'group');
    surface.tabIndex = 0; surface.setAttribute('aria-label', 'Query canvas. Arrow keys pan; F fits the overview; plus and minus zoom.');
    var edgesSvg = svg('svg', { class: 'pqc-edges', 'aria-label': 'Resolved query references' });
    var edgeLayer = svg('g'), cycleLayer = el('div', 'pqc-cycles'), nodeLayer = el('div', 'pqc-nodes');
    edgesSvg.appendChild(edgeLayer); world.appendChild(cycleLayer); world.appendChild(edgesSvg); world.appendChild(nodeLayer); surface.appendChild(world); root.appendChild(surface);
    var legend = el('div', 'pqc-legend'); legend.appendChild(el('span', 'pqc-solid-key', 'Query input → consumer')); legend.appendChild(el('span', 'pqc-parameter-key', 'Parameter → consumer')); root.appendChild(legend);
    var routeStatus = el('div', 'pqc-route-status'); routeStatus.setAttribute('role', 'status'); routeStatus.hidden = true; root.appendChild(routeStatus);
    var map = el('div', 'pqc-minimap'), mapLabel = el('div', 'pqc-map-label'), mapSvg = svg('svg', { role: 'img', 'aria-label': 'Visible query canvas overview' });
    var mapEdges = svg('g'), mapNodes = svg('g'), mapViewport = svg('rect', { class: 'pqc-map-viewport', 'pointer-events': 'none' });
    mapSvg.appendChild(mapEdges); mapSvg.appendChild(mapNodes); mapSvg.appendChild(mapViewport); map.appendChild(mapLabel); map.appendChild(mapSvg); root.appendChild(map); host.appendChild(root);
    function current(gen) { return alive && context && generation === gen && !suspended; }
    function emit(name, payload) { if (current(payload.generation) && typeof options[name] === 'function') options[name](payload); }
    function shown(id) { return nodes.has(id) && (!visible || visible.has(id)); }
    function ids() { return Array.from(nodes.keys()).filter(shown); }
    function bounds(filter) {
      var b = { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity };
      positions.forEach(function (p, id) { if (filter && !shown(id)) return; b.x = Math.min(b.x, p.x); b.y = Math.min(b.y, p.y); b.right = Math.max(b.right, p.x + W); b.bottom = Math.max(b.bottom, p.y + H); });
      return b.x === Infinity ? null : { x: b.x, y: b.y, w: b.right - b.x, h: b.bottom - b.y };
    }
    // Layout consumes supplied cycle components. It does not analyze M or infer
    // new edges. Collapsed component ranks put inputs left of their consumers.
    function layout(subset) {
      var layoutNodes = subset ? new Map(Array.from(nodes).filter(function (entry) { return subset.has(entry[0]); })) : nodes;
      var units = [], byNode = new Map(), cycleKeys = new Set();
      (context.graph.issues || []).forEach(function (issue) {
        if (issue.kind !== 'cycle' || !issue.componentIds) return;
        var members = issue.componentIds.filter(function (id) { return layoutNodes.has(id); }).slice().sort(), key = JSON.stringify(members);
        if (!members.length || cycleKeys.has(key)) return; cycleKeys.add(key);
        var unit = { members: members, cycle: true, incoming: new Set(), outgoing: new Set(), rank: 0 };
        units.push(unit); members.forEach(function (id) { byNode.set(id, unit); });
      });
      layoutNodes.forEach(function (_, id) { if (!byNode.has(id)) { var unit = { members: [id], cycle: false, incoming: new Set(), outgoing: new Set(), rank: 0 }; units.push(unit); byNode.set(id, unit); } });
      var incident = new Set();
      context.graph.edges.forEach(function (edge) { var a = byNode.get(edge.inputId), b = byNode.get(edge.consumerId); if (!a || !b) return; incident.add(a); incident.add(b); if (a !== b) { a.outgoing.add(b); b.incoming.add(a); } });
      var sourceOrder = new Map(Array.from(nodes.keys()).map(function (id, index) { return [id, index]; }));
      units.sort(function (a, b) { return Math.min.apply(null, a.members.map(function (id) { return sourceOrder.get(id); })) - Math.min.apply(null, b.members.map(function (id) { return sourceOrder.get(id); })); });
      var degree = new Map(), todo = []; units.forEach(function (u) { degree.set(u, u.incoming.size); if (!u.incoming.size) todo.push(u); });
      for (var at = 0; at < todo.length; at++) { var u = todo[at]; u.outgoing.forEach(function (v) { v.rank = Math.max(v.rank, u.rank + 1); degree.set(v, degree.get(v) - 1); if (!degree.get(v)) todo.push(v); }); }
      var lanes = new Map(), bottom = 0, maxRank = 0; groups = [];
      units.filter(function (u) { return incident.has(u); }).forEach(function (u) {
        var y = lanes.get(u.rank) || 0, x = u.rank * (W + GAP_X);
        u.members.forEach(function (id, i) { if (!positions.has(id)) positions.set(id, { x: x, y: y + i * (H + GAP_Y) }); });
        var height = u.members.length * (H + GAP_Y) + (u.cycle ? 28 : 0); lanes.set(u.rank, y + height + (u.cycle ? 24 : 0)); bottom = Math.max(bottom, y + height); maxRank = Math.max(maxRank, u.rank);
        if (u.cycle) groups.push(u.members);
      });
      var standalone = units.filter(function (u) { return !incident.has(u); }), cols = Math.max(1, Math.min(8, Math.max(Math.ceil(Math.sqrt(standalone.length)), incident.size ? maxRank + 1 : 1)));
      var y0 = incident.size ? bottom + 48 : 0;
      standalone.forEach(function (u, i) { var id = u.members[0]; if (!positions.has(id)) positions.set(id, { x: (i % cols) * (W + 42), y: y0 + Math.floor(i / cols) * (H + GAP_Y) }); });
    }
    // Bounding-volume trees keep ordinary routes local. A long segment occupies
    // one box, not thousands of grid cells, including at extreme Fit scales.
    function intersects(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
    function spatialTree(items) {
      if (!items.length) return null;
      var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      items.forEach(function (p) { box.x0 = Math.min(box.x0, p.x0); box.y0 = Math.min(box.y0, p.y0); box.x1 = Math.max(box.x1, p.x1); box.y1 = Math.max(box.y1, p.y1); });
      if (items.length <= 8) { box.items = items; return box; }
      var horizontal = box.x1 - box.x0 >= box.y1 - box.y0;
      items.sort(function (a, b) { return horizontal ? a.x0 + a.x1 - b.x0 - b.x1 : a.y0 + a.y1 - b.y0 - b.y1; });
      var middle = Math.floor(items.length / 2); box.left = spatialTree(items.slice(0, middle)); box.right = spatialTree(items.slice(middle)); return box;
    }
    function spatialQuery(tree, box, out) {
      out = out || []; if (!tree || !intersects(tree, box)) return out;
      if (tree.items) tree.items.forEach(function (item) { if (intersects(item, box)) out.push(item.value); });
      else { spatialQuery(tree.left, box, out); spatialQuery(tree.right, box, out); } return out;
    }
    var cardIndex = null, routeKey = null;
    // Tables' conventions: ordered side ports, outward stubs, then orthogonal
    // channels. PQ owns the reservations because its edges flow input -> consumer.
    function routeEdges(obstacles) {
      var pitch = Math.max(24, 8 / view.k), clearance = Math.max(18, pitch), buckets = new Map(), reserved = [], checks = 0, work = 0, edgeWork = 0, edgeChecks = 0, maxEdgeWork = 0;
      cardIndex = spatialTree(obstacles.map(function (r) { return { x0: r.x, y0: r.y, x1: r.x + W, y1: r.y + H, value: r }; }));
      var visibleEdges = edgeElements.filter(function (e) { return shown(e.edge.inputId) && shown(e.edge.consumerId); }).slice().sort(function (a, b) { return a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0; });
      function port(entry, id, side, other) {
        var p = { entry: entry, id: id, side: side, other: other, box: positions.get(id), gap: pitch };
        var key = JSON.stringify([id, side]); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(p); return p;
      }
      edgeElements.forEach(function (entry) { entry.points = []; entry.routeIssue = null; entry.group.setAttribute('data-route-status', 'hidden'); });
      visibleEdges.forEach(function (entry) {
        var edge = entry.edge, a = positions.get(edge.inputId), b = positions.get(edge.consumerId);
        if (edge.inputId === edge.consumerId) return;
        var right = b.x >= a.x + W + 32, left = a.x >= b.x + W + 32;
        var side = right ? 'right' : left ? 'left' : b.y >= a.y ? 'bottom' : 'top';
        var opposite = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };
        entry.a = port(entry, edge.inputId, side, b);
        entry.b = port(entry, edge.consumerId, opposite[side], a);
      });
      visibleEdges.forEach(function (entry) {
        var edge = entry.edge; if (edge.inputId !== edge.consumerId) return;
        var box = positions.get(edge.inputId), pairs = [['top', 'right'], ['right', 'bottom'], ['bottom', 'left'], ['left', 'top']];
        function degree(side) { return (buckets.get(JSON.stringify([edge.inputId, side])) || []).length; }
        pairs.sort(function (a, b) { return degree(a[0]) + degree(a[1]) - degree(b[0]) - degree(b[1]); });
        entry.a = port(entry, edge.inputId, pairs[0][0], box); entry.b = port(entry, edge.consumerId, pairs[0][1], box);
      });
      buckets.forEach(function (ports) {
        var vertical = ports[0].side === 'top' || ports[0].side === 'bottom', length = vertical ? W : H;
        ports.sort(function (a, b) { return (vertical ? a.other.x - b.other.x : a.other.y - b.other.y) || (a.entry.edge.id < b.entry.edge.id ? -1 : a.entry.edge.id > b.entry.edge.id ? 1 : 0); });
        var step = ports.length > 1 ? Math.min(pitch, (length - 16) / (ports.length - 1)) : pitch;
        ports.forEach(function (p, i) {
          var offset = length / 2 + (i - (ports.length - 1) / 2) * step, box = p.box;
          p.point = { x: box.x + (vertical ? offset : p.side === 'right' ? W : 0), y: box.y + (vertical ? p.side === 'bottom' ? H : 0 : offset) };
          p.dx = vertical ? 0 : p.side === 'right' ? 1 : -1; p.dy = vertical ? p.side === 'bottom' ? 1 : -1 : 0;
          p.gap = step; p.slot = i - (ports.length - 1) / 2; p.degree = ports.length; if (step * view.k < 7.9) p.entry.routeIssue = 'crowded-ports';
          var stub = 22;
          spatialQuery(cardIndex, { x0: p.point.x - 66, y0: p.point.y - 66, x1: p.point.x + 66, y1: p.point.y + 66 }).forEach(function (r) {
            if (r === box) return;
            var cross = vertical ? p.point.x > r.x && p.point.x < r.x + W : p.point.y > r.y && p.point.y < r.y + H;
            var distance = vertical ? (p.dy > 0 ? r.y - p.point.y : p.point.y - r.y - H) : (p.dx > 0 ? r.x - p.point.x : p.point.x - r.x - W);
            if (cross && distance >= 0) stub = Math.min(stub, distance / 3);
          });
          p.stub = { x: p.point.x + p.dx * stub, y: p.point.y + p.dy * stub };
          reserved.push({ a: p.point, b: p.stub, entry: p.entry, gap: step });
        });
      });
      function segmentBox(s) { return { x0: Math.min(s.a.x, s.b.x), y0: Math.min(s.a.y, s.b.y), x1: Math.max(s.a.x, s.b.x), y1: Math.max(s.a.y, s.b.y), value: s }; }
      var stubIndex = spatialTree(reserved.map(segmentBox)), completed = [], pending = [], completedIndex = null;
      function reserve(segment) {
        reserved.push(segment); pending.push(segmentBox(segment));
        if (pending.length === 64) {
          var tree = spatialTree(pending); completed.push({ x0: tree.x0, y0: tree.y0, x1: tree.x1, y1: tree.y1, value: tree });
          completedIndex = spatialTree(completed.slice()); pending = [];
        }
      }
      function nearbySegments(box) {
        var result = spatialQuery(stubIndex, box);
        spatialQuery(completedIndex, box).forEach(function (tree) { spatialQuery(tree, box, result); });
        pending.forEach(function (item) { if (intersects(item, box)) result.push(item.value); }); return result;
      }
      function spend() { work++; return ++edgeWork <= 50000; }
      function clean(points) {
        var out = [];
        points.forEach(function (p) {
          var last = out[out.length - 1]; if (last && last.x === p.x && last.y === p.y) return;
          while (out.length > 1) {
            var before = out[out.length - 2]; last = out[out.length - 1];
            if (!((before.x === last.x && last.x === p.x && (last.y - before.y) * (p.y - last.y) >= 0) || (before.y === last.y && last.y === p.y && (last.x - before.x) * (p.x - last.x) >= 0))) break;
            out.pop();
          }
          out.push(p);
        }); return out;
      }
      function clearSegment(a, b, entry) {
        checks++; if (++edgeChecks > 8000 || edgeWork > 50000) return false; // Only this edge can exhaust its search.
        if (a.x === b.x && a.y === b.y) return true;
        var vertical = a.x === b.x, lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        var bounds = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
        var nearbyCards = spatialQuery(cardIndex, bounds);
        for (var i = 0; i < nearbyCards.length; i++) {
          if (!spend()) return false;
          var r = nearbyCards[i];
          if (vertical ? a.x > r.x && a.x < r.x + W && hi > r.y && lo < r.y + H : a.y > r.y && a.y < r.y + H && hi > r.x && lo < r.x + W) return false;
        }
        var nearby = nearbySegments({ x0: bounds.x0 - pitch, y0: bounds.y0 - pitch, x1: bounds.x1 + pitch, y1: bounds.y1 + pitch });
        for (var j = 0; j < nearby.length; j++) {
          if (!spend()) return false;
          var s = nearby[j]; if (s.entry === entry || vertical !== (s.a.x === s.b.x)) continue;
          var overlap = Math.min(hi, vertical ? Math.max(s.a.y, s.b.y) : Math.max(s.a.x, s.b.x)) - Math.max(lo, vertical ? Math.min(s.a.y, s.b.y) : Math.min(s.a.x, s.b.x));
          var separation = vertical ? Math.abs(a.x - s.a.x) : Math.abs(a.y - s.a.y);
          if (overlap > 0.01 && separation < Math.min(entry.laneGap, s.gap) - 0.11) return false;
          // Even crowded ports never permit a coincident positive-length run.
          if (overlap > 0.01 && separation < 0.11) return false;
        }
        return true;
      }
      function acceptable(points, entry) {
        points = clean(points);
        for (var i = 1; i < points.length; i++) {
          if (!clearSegment(points[i - 1], points[i], entry)) return null;
          if (i > 1) { var a = points[i - 2], b = points[i - 1], c = points[i]; if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return null; }
        }
        // Rounded corners must also clear cards: their entire control triangle
        // fits inside this box, so checking it is conservative and deterministic.
        for (var corner = 1; corner < points.length - 1; corner++) {
          var p0 = points[corner - 1], p1 = points[corner], p2 = points[corner + 1];
          var l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y), radius = Math.min(9, l1 / 2, l2 / 2);
          var x0 = p1.x - (p1.x - p0.x) / l1 * radius, y0 = p1.y - (p1.y - p0.y) / l1 * radius;
          var x2 = p1.x + (p2.x - p1.x) / l2 * radius, y2 = p1.y + (p2.y - p1.y) / l2 * radius;
          var cornerCards = spatialQuery(cardIndex, { x0: Math.min(x0, p1.x, x2), y0: Math.min(y0, p1.y, y2), x1: Math.max(x0, p1.x, x2), y1: Math.max(y0, p1.y, y2) });
          for (var j = 0; j < cornerCards.length; j++) {
            if (!spend()) return null;
            var box = cornerCards[j];
            if (Math.max(x0, p1.x, x2) > box.x && Math.min(x0, p1.x, x2) < box.x + W && Math.max(y0, p1.y, y2) > box.y && Math.min(y0, p1.y, y2) < box.y + H) return null;
          }
        }
        return points;
      }
      // Bounded visibility grid only after the short channel/detour candidates fail.
      // Obstacles are never dropped from collision checks, even when rails are capped.
      function search(entry) {
        var a = entry.a.stub, b = entry.b.stub, xs = [a.x, b.x], ys = [a.y, b.y];
        function proximity(r) { return Math.max(0, Math.min(a.x, b.x) - r.x - W, r.x - Math.max(a.x, b.x)) + Math.max(0, Math.min(a.y, b.y) - r.y - H, r.y - Math.max(a.y, b.y)); }
        obstacles.slice().sort(function (u, v) { return proximity(u) - proximity(v) || u.x - v.x || u.y - v.y; }).slice(0, 18).forEach(function (r) { xs.push(r.x - clearance, r.x + W + clearance); ys.push(r.y - clearance, r.y + H + clearance); });
        reserved.forEach(function (s) { if (s.entry === entry) return; if (s.a.x === s.b.x) xs.push(s.a.x - Math.min(entry.laneGap, s.gap), s.a.x + Math.min(entry.laneGap, s.gap)); else ys.push(s.a.y - Math.min(entry.laneGap, s.gap), s.a.y + Math.min(entry.laneGap, s.gap)); });
        function rails(values, start, end) {
          var others = Array.from(new Set(values)).filter(function (v) { return v !== start && v !== end; });
          others.sort(function (u, v) { return Math.abs(u - start) + Math.abs(u - end) - Math.abs(v - start) - Math.abs(v - end) || u - v; });
          return Array.from(new Set([start, end].concat(others.slice(0, 46)))).sort(function (u, v) { return u - v; });
        }
        xs = rails(xs, a.x, b.x); ys = rails(ys, a.y, b.y);
        var width = xs.length, start = ys.indexOf(a.y) * width + xs.indexOf(a.x), goal = ys.indexOf(b.y) * width + xs.indexOf(b.x), heap = [], dist = new Map(), prev = new Map();
        function point(id) { var cell = Math.floor(id / 2); return { x: xs[cell % width], y: ys[Math.floor(cell / width)] }; }
        function push(id, cost) { var p = point(id), item = { id: id, cost: cost, score: cost + Math.abs(p.x - b.x) + Math.abs(p.y - b.y) }, i = heap.length; heap.push(item); while (i) { var parent = (i - 1) >> 1; if (heap[parent].score <= item.score) break; heap[i] = heap[parent]; i = parent; } heap[i] = item; }
        function pop() { var first = heap[0], last = heap.pop(); if (heap.length) { var i = 0; while (i * 2 + 1 < heap.length) { var child = i * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++; if (heap[child].score >= last.score) break; heap[i] = heap[child]; i = child; } heap[i] = last; } return first; }
        var initial = start * 2 + (entry.a.dx ? 0 : 1); dist.set(initial, 0); push(initial, 0);
        while (heap.length && edgeChecks < 8000 && edgeWork <= 50000) {
          var current = pop(), id = current.id, cell = Math.floor(id / 2); if (dist.get(id) !== current.cost) continue;
          if (cell === goal) { var result = [point(id)]; while (prev.has(id)) { id = prev.get(id); result.push(point(id)); } return acceptable([entry.a.point].concat(result.reverse(), [entry.b.point]), entry); }
          var x = cell % width, y = Math.floor(cell / width), next = [];
          if (x) next.push((cell - 1) * 2); if (x + 1 < width) next.push((cell + 1) * 2); if (y) next.push((cell - width) * 2 + 1); if (y + 1 < ys.length) next.push((cell + width) * 2 + 1);
          for (var n = 0; n < next.length; n++) {
            var target = next[n], p = point(current.id), q = point(target), dx = q.x - p.x, dy = q.y - p.y;
            if (cell === start && dx * entry.a.dx + dy * entry.a.dy < 0) continue;
            if (Math.floor(target / 2) === goal && dx * entry.b.dx + dy * entry.b.dy > 0) continue;
            if (!clearSegment(p, q, entry)) continue;
            var cost = current.cost + Math.abs(dx) + Math.abs(dy) + (id % 2 !== target % 2 ? 12 : 0);
            if (dist.has(target) && dist.get(target) <= cost) continue;
            dist.set(target, cost); prev.set(target, current.id); push(target, cost);
          }
        }
        return null;
      }
      // Long links can cross several occupied columns. Escape through a free
      // row/column gutter using independent departure and arrival channels.
      function bridge(entry) {
        var vertical = !!entry.a.dy, a = entry.a.point, b = entry.b.point, sa = entry.a.stub, sb = entry.b.stub;
        function coord(p) { return vertical ? { x: p.y, y: p.x } : p; }
        function point(x, y) { return vertical ? { x: y, y: x } : { x: x, y: y }; }
        var u = coord(sa), v = coord(sb), rails = [], launches = [u.x, v.x];
        obstacles.forEach(function (r) {
          var x = vertical ? r.y : r.x, y = vertical ? r.x : r.y, width = vertical ? H : W, height = vertical ? W : H;
          rails.push(y - 12, y + height + 12);
          launches.push(x - 12, x + width + 12);
        });
        reserved.forEach(function (s) {
          if (s.entry === entry) return;
          var p = coord(s.a), q = coord(s.b), gap = Math.min(entry.laneGap, s.gap);
          if (p.x === q.x) launches.push(p.x - gap, p.x + gap);
          else rails.push(p.y - gap, p.y + gap);
        });
        function nearest(values, start, end) { return Array.from(new Set(values)).sort(function (a, b) { return Math.abs(a - start) + Math.abs(a - end) - Math.abs(b - start) - Math.abs(b - end) || a - b; }); }
        rails = nearest(rails, u.y, v.y);
        var ax = nearest(launches, u.x, u.x).filter(function (x) { return Math.abs(x - u.x) <= 100; });
        var bx = nearest(launches, v.x, v.x).filter(function (x) { return Math.abs(x - v.x) <= 100; });
        for (var i = 0; i < rails.length && edgeChecks < 7000 && edgeWork < 40000; i++) {
          var rail = rails[i], departures = [], arrivals = [];
          for (var j = 0; j < ax.length && departures.length < 3 && edgeChecks < 7000 && edgeWork < 40000; j++) {
            var p = point(ax[j], u.y), q = point(ax[j], rail);
            if (acceptable([a, sa, p, q], entry)) departures.push([p, q]);
          }
          if (!departures.length) continue;
          for (var j = 0; j < bx.length && arrivals.length < 3 && edgeChecks < 7000 && edgeWork < 40000; j++) {
            var p = point(bx[j], v.y), q = point(bx[j], rail);
            if (acceptable([q, p, sb, b], entry)) arrivals.push([q, p]);
          }
          for (var j = 0; j < departures.length; j++) for (var k = 0; k < arrivals.length; k++) {
            var result = acceptable([a, sa].concat(departures[j], arrivals[k], [sb, b]), entry);
            if (result) return result;
          }
        }
        return null;
      }
      var missing = 0, crowded = 0;
      visibleEdges.forEach(function (entry) {
        edgeChecks = edgeWork = 0;
        var a = entry.a.point, b = entry.b.point, sa = entry.a.stub, sb = entry.b.stub, points = null;
        // When a side is crowded, divide its available gutter deterministically.
        // Keep every possible link; report reduced spacing instead of capping edges.
        var port = entry.a.degree >= entry.b.degree ? entry.a : entry.b;
        var gap = entry.a.dx ? Math.abs(sb.x - sa.x) : Math.abs(sb.y - sa.y);
        entry.laneGap = Math.min(pitch, entry.a.gap, entry.b.gap, entry.routeIssue === 'crowded-ports' ? Math.max(0.2, gap / port.degree) : pitch);
        if (entry.laneGap * view.k < 7.9) entry.routeIssue = 'crowded-ports';
        if (clearSegment(a, sa, entry) && clearSegment(sb, b, entry)) {
          var vertical = !!entry.a.dy, mid = (vertical ? (sa.y + sb.y) / 2 : (sa.x + sb.x) / 2) + (entry.routeIssue === 'crowded-ports' ? port.slot * entry.laneGap : 0);
          // If the endpoint rows face different cards in an intervening
          // column, no single middle channel can join them. Skip that family
          // before spending the edge's budget on repeated blocked candidates.
          function reach(p) {
            var at = vertical ? p.y : p.x, cross = vertical ? p.x : p.y, low = -Infinity, high = Infinity;
            var row = vertical ? { x0: p.x, x1: p.x, y0: Math.min(sa.y, sb.y), y1: Math.max(sa.y, sb.y) } : { x0: Math.min(sa.x, sb.x), x1: Math.max(sa.x, sb.x), y0: p.y, y1: p.y };
            spatialQuery(cardIndex, row).forEach(function (r) {
              var x = vertical ? r.y : r.x, y = vertical ? r.x : r.y, width = vertical ? H : W, height = vertical ? W : H;
              if (cross <= y || cross >= y + height) return;
              if (x + width <= at) low = Math.max(low, x + width);
              if (x >= at) high = Math.min(high, x);
            });
            return [low, high];
          }
          var ar = reach(sa), br = reach(sb), directPossible = Math.max(ar[0], br[0]) <= Math.min(ar[1], br[1]);
          for (var compact = 0; compact < 7 && !points; compact++) {
            // Compact lanes still exceed Tables' 0.1-unit SVG precision;
            // clearSegment continues rejecting every coincident run.
            if (!directPossible) { entry.laneGap = Math.min(entry.laneGap, 1); break; }
            if (compact) entry.laneGap = Math.max(0.5, entry.laneGap / 2);
            var channels = [mid];
            for (var offsetIndex = 1; offsetIndex < 17; offsetIndex++) channels.push(mid + Math.ceil(offsetIndex / 2) * (offsetIndex % 2 ? -entry.laneGap : entry.laneGap));
            nearbySegments({ x0: Math.min(sa.x, sb.x) - pitch, y0: Math.min(sa.y, sb.y) - pitch, x1: Math.max(sa.x, sb.x) + pitch, y1: Math.max(sa.y, sb.y) + pitch }).forEach(function (s) {
              if (s.entry === entry || (s.a.x === s.b.x) === vertical) return;
              var coordinate = vertical ? s.a.y : s.a.x, gap = Math.min(entry.laneGap, s.gap);
              channels.push(coordinate - gap, coordinate + gap);
            });
            channels = Array.from(new Set(channels)).sort(function (u, v) { return Math.abs(u - mid) - Math.abs(v - mid) || u - v; });
            for (var attempt = 0; attempt < channels.length && !points && edgeChecks < 8000 && edgeWork <= 50000; attempt++) {
              var channel = channels[attempt];
              var middle = vertical ? [{ x: sa.x, y: channel }, { x: sb.x, y: channel }] : [{ x: channel, y: sa.y }, { x: channel, y: sb.y }];
              points = acceptable([a, sa].concat(middle, [sb, b]), entry);
            }
          }
          if (entry.laneGap * view.k < 7.9) entry.routeIssue = 'crowded-ports';
          if (!points) {
            var rails = [];
            obstacles.forEach(function (r) { rails.push(vertical ? r.x - clearance : r.y - clearance, vertical ? r.x + W + clearance : r.y + H + clearance); });
            rails = Array.from(new Set(rails)); rails.sort(function (u, v) { var av = vertical ? sa.x : sa.y, bv = vertical ? sb.x : sb.y; return Math.abs(av - u) + Math.abs(bv - u) - Math.abs(av - v) - Math.abs(bv - v) || u - v; });
            for (var j = 0; j < Math.min(24, rails.length) && !points && edgeChecks < 8000 && edgeWork <= 50000; j++) {
              var rail = rails[j], detour = vertical ? [{ x: rail, y: sa.y }, { x: rail, y: sb.y }] : [{ x: sa.x, y: rail }, { x: sb.x, y: rail }];
              points = acceptable([a, sa].concat(detour, [sb, b]), entry);
            }
          }
          if (!points && edgeChecks < 8000 && edgeWork <= 50000) points = bridge(entry);
          if (!points && edgeChecks < 8000 && edgeWork <= 50000) points = search(entry);
        }
        if (!points) { entry.routeIssue = edgeChecks >= 8000 || edgeWork > 50000 ? 'routing-limit' : 'no-clear-route'; missing++; }
        else {
          entry.points = points; if (entry.routeIssue === 'crowded-ports') crowded++;
          for (var i = 1; i < points.length; i++) reserve({ a: points[i - 1], b: points[i], entry: entry, gap: entry.laneGap });
        }
        maxEdgeWork = Math.max(maxEdgeWork, edgeWork);
        entry.group.setAttribute('data-route-status', entry.routeIssue || 'routed');
      });
      routeStatus.hidden = !missing && !crowded;
      routeStatus.textContent = (missing ? missing + ' connections could not be separated. Move cards apart or show fewer objects. ' : '') + (crowded ? crowded + ' connections have crowded ports or channels. Zoom in or move cards apart for more space.' : '');
      routeStatus.dataset.unrouted = String(missing); routeStatus.dataset.crowded = String(crowded); routeStatus.dataset.checks = String(checks); routeStatus.dataset.work = String(work); routeStatus.dataset.maxEdgeWork = String(maxEdgeWork);
    }
    function renderRoutes(obstacles) {
      // Selection/search/focus change ink, not routing inputs. Invalidate on any
      // context replacement; visible positions and zoom cover the remaining inputs.
      var key = JSON.stringify([view.k, ids().map(function (id) { var p = positions.get(id); return [id, p.x, p.y]; })]);
      if (key !== routeKey) { routeEdges(obstacles); routeKey = key; }
      edgeElements.forEach(function (entry) {
        var d = entry.points.length > 1 ? drawing.orthoPath(entry.points, 9) : '';
        entry.line.setAttribute('d', d); entry.hit.setAttribute('d', d); entry.underlay.setAttribute('d', d);
        drawEdge(entry, obstacles);
      });
    }
    // Seats are on straight runs, away from rounded corners and visible cards.
    // The sign is always input -> consumer, never Tables' filter direction.
    function arrowSeat(points, obstacles, boost) {
      var extent = drawing.ARROW_PX / Math.max(0.05, view.k) * boost * 0.64;
      var segments = points.slice(1).map(function (b, i) { var a = points[i]; return { a: a, b: b, length: Math.hypot(b.x - a.x, b.y - a.y), index: i }; });
      segments.sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i], a = seg.a, b = seg.b, vertical = a.x === b.x;
        var start = extent + (seg.index ? Math.min(9, seg.length / 2) : 0);
        var end = seg.length - extent - (seg.index < points.length - 2 ? Math.min(9, seg.length / 2) : 0);
        if (start > end) continue;
        for (var j = 0; j < 3; j++) {
          var t = Math.max(start, Math.min(end, seg.length * [0.5, 0.3, 0.7][j])) / seg.length;
          var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          if (spatialQuery(cardIndex, { x0: x - extent, y0: y - extent, x1: x + extent, y1: y + extent }).some(function (r) { return x + extent > r.x && x - extent < r.x + W && y + extent > r.y && y - extent < r.y + H; })) continue;
          return { x: x, y: y, orient: vertical ? 'v' : 'h', toA: vertical ? (b.y > a.y ? 1 : -1) : (b.x > a.x ? 1 : -1) };
        }
      }
      return null; // Overlapping cards can leave no visible run; never put a head under a card.
    }
    function drawEdge(entry, obstacles) {
      var active = entry.group.classList.contains('pqc-related') || entry.group.classList.contains('pqc-branch-edge');
      var width = drawing.edgeStrokeWidth(view.k, false, active, false, false);
      entry.line.setAttribute('stroke-width', width);
      if (entry.group.classList.contains('pqc-parameter-edge')) entry.line.setAttribute('stroke-dasharray', (6 / view.k) + ' ' + (4 / view.k));
      entry.underlay.setAttribute('stroke-width', width * 2.1);
      entry.underlay.style.display = active || entry.hovered ? '' : 'none';
      entry.line.style.strokeWidth = entry.hovered ? width + 1 : width;
      // Keep the existing 14 screen-pixel hit corridor and its edge identity.
      entry.hit.setAttribute('stroke-width', 14 / view.k);
      entry.arrow.replaceChildren();
      if (!shown(entry.edge.inputId) || !shown(entry.edge.consumerId) || !entry.points || !entry.points.length) return;
      var boost = active ? 1.15 : 1, spot = arrowSeat(entry.points, obstacles, boost);
      if (spot) entry.arrow.appendChild(drawing.edgeArrow.call({ ARROW_PX: drawing.ARROW_PX, view: view }, { both: false }, spot, 'currentColor', 1, boost));
    }
    function updateEdgeZoom() {
      if (edgeZoom === view.k) return; edgeZoom = view.k;
      var obstacles = ids().map(function (id) { return positions.get(id); });
      renderRoutes(obstacles);
    }
    function updateGeometry() {
      elements.forEach(function (e, id) { var p = positions.get(id); e.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; });
      var obstacles = ids().map(function (id) { return positions.get(id); });
      renderRoutes(obstacles);
      cycleLayer.replaceChildren(); groups.forEach(function (members) {
        var pts = members.filter(shown).map(function (id) { return positions.get(id); }); if (!pts.length) return;
        var x = Math.min.apply(null, pts.map(function (p) { return p.x; })), y = Math.min.apply(null, pts.map(function (p) { return p.y; }));
        var right = Math.max.apply(null, pts.map(function (p) { return p.x + W; })), bottom = Math.max.apply(null, pts.map(function (p) { return p.y + H; }));
        var box = el('div', 'pqc-cycle-group'); box.style.cssText = 'left:' + (x - 14) + 'px;top:' + (y - 30) + 'px;width:' + (right - x + 28) + 'px;height:' + (bottom - y + 44) + 'px;'; box.appendChild(el('span', '', 'Cycle · ' + members.length)); cycleLayer.appendChild(box);
      });
      drawMap();
    }
    function scheduleGeometry() {
      if (frame || !alive) return; var gen = generation, ticket = win.requestAnimationFrame(function () { if (frame === ticket) frame = 0; if (alive && context && generation === gen) updateGeometry(); }); frame = ticket;
    }
    function applyVisibility() {
      var shownIds = ids(); if (!shown(roving)) roving = shownIds[0] || null;
      elements.forEach(function (e, id) { e.hidden = !shown(id); e.tabIndex = shown(id) && id === roving ? 0 : -1; e.classList.toggle('pqc-dim', (!!matches && !matches.has(id)) || (!!focusIds && !focusIds.has(id))); e.classList.toggle('pqc-focus-dim', !!focusIds && !focusIds.has(id)); e.classList.toggle('pqc-selected', id === selected); e.classList.toggle('pqc-flow-root', id === flowRoot); e.classList.toggle('pqc-branch', branchIds.has(id)); e.setAttribute('aria-pressed', String(id === selected)); });
      edgeElements.forEach(function (entry) { entry.group.style.display = shown(entry.edge.inputId) && shown(entry.edge.consumerId) ? '' : 'none'; var related = selected === entry.edge.inputId || selected === entry.edge.consumerId; entry.group.classList.toggle('pqc-related', related); entry.group.classList.toggle('pqc-branch-edge', branchIds.has(entry.edge.inputId) && branchIds.has(entry.edge.consumerId)); entry.group.classList.toggle('pqc-edge-dim', (!!matches && !matches.has(entry.edge.inputId) && !matches.has(entry.edge.consumerId)) || (!!focusIds && (!focusIds.has(entry.edge.inputId) || !focusIds.has(entry.edge.consumerId)))); });
      updateGeometry();
    }
    function drawMap() {
      mapNodes.replaceChildren(); mapEdges.replaceChildren(); miniElements.clear(); var b = bounds(true);
      map.hidden = !context; mapSvg.style.display = b ? '' : 'none'; legend.hidden = !b;
      mapLabel.textContent = ids().length + ' visible objects'; if (!b) return;
      mapSvg.setAttribute('viewBox', [b.x - 28, b.y - 28, b.w + 56, b.h + 56].join(' '));
      context.graph.edges.forEach(function (edge) { if (!shown(edge.inputId) || !shown(edge.consumerId)) return; var a = positions.get(edge.inputId), z = positions.get(edge.consumerId); mapEdges.appendChild(svg('line', { x1: a.x + W / 2, y1: a.y + H / 2, x2: z.x + W / 2, y2: z.y + H / 2, class: 'pqc-map-edge', 'data-map-edge-id': edge.id })); });
      positions.forEach(function (p, id) { if (!shown(id)) return; var rect = svg('rect', { x: p.x, y: p.y, width: W, height: H, rx: 12, class: 'pqc-map-node' + (id === selected ? ' pqc-map-selected' : '') }); rect.dataset.mapId = id; mapNodes.appendChild(rect); miniElements.set(id, rect); });
      updateMapViewport();
    }
    function updateMapViewport() { mapViewport.setAttribute('x', -view.x / view.k); mapViewport.setAttribute('y', -view.y / view.k); mapViewport.setAttribute('width', size.w / view.k); mapViewport.setAttribute('height', size.h / view.k); }
    function transform(notify) {
      world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
      root.classList.toggle('pqc-names-only', view.k < 0.65);
      updateEdgeZoom();
      // Compact name chips keep ordinary overviews legible. At very large-model
      // scales the overview is shape-only; search/reveal restores readable detail.
      var font = view.k >= 0.25 ? Math.max(13.5, 11 / view.k) : 13.5, detailFont = view.k >= 0.25 ? Math.max(11, 8.5 / view.k) : 11;
      if (Math.abs(font - titleSize) > 0.05 || Math.abs(detailFont - detailSize) > 0.05) { titleSize = font;detailSize = detailFont; elements.forEach(function (e) { var title = e.querySelector('.pqc-node-title'); title.style.fontSize = font + 'px'; title.style.lineHeight = (font * 1.3) + 'px';var detail=e.querySelector('.pqc-node-subtitle');detail.style.fontSize=detailFont+'px';var source=e.querySelector('.pqc-source');if(source)source.style.fontSize=(view.k>=0.25?Math.max(11,8/view.k):11)+'px'; }); }
      surface.style.backgroundPosition = view.x + 'px ' + view.y + 'px'; updateMapViewport();
      if (notify && context) emit('onViewport', { generation: generation, viewport: getViewport() });
    }
    function getViewport() { return { x: view.x, y: view.y, k: view.k }; }
    function validViewport(v) { return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.k) && v.k > 0; }
    function setViewport(v) {
      if (!alive || !validViewport(v)) return false; pendingFit = false;
      // Back can change docking/host size before the observer's queued callback.
      // Adopt that measurement now so the callback cannot center an old size over
      // the explicitly restored translation. Zero size also suppresses that delta.
      size = measure(); view = { x: v.x, y: v.y, k: v.k }; transform(false); return true;
    }
    function measure() { var r = surface.getBoundingClientRect(); return { w: r.width || 0, h: r.height || 0 }; }
    function fit() {
      if (!alive || !context) return false; size = measure(); var b = bounds(true);
      if (suspended || !size.w || !size.h || !surface.getClientRects().length) { pendingFit = true; return false; }
      pendingFit = false; if (!b) return false;
      var pad = 36, bottom = size.h > 320 ? 126 : 32, usableW = Math.max(1, size.w - pad * 2), usableH = Math.max(1, size.h - pad - bottom);
      var k = Math.min(1.25, usableW / (b.w + 28), usableH / (b.h + 40));
      view = { x: pad + usableW / 2 - (b.x + b.w / 2) * k, y: pad + usableH / 2 - (b.y + b.h / 2) * k, k: Math.max(0.00001, k) }; transform(true); return true;
    }
    function zoomBy(factor, anchor) {
      if (!alive || !context || suspended || !(factor > 0) || !Number.isFinite(factor)) return false;
      size = measure(); anchor = anchor || { x: size.w / 2, y: size.h / 2 }; if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
      var k = Math.max(0.00001, Math.min(4, view.k * factor)), ratio = k / view.k;
      view = { x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, k: k }; pendingFit = false; transform(true); return true;
    }
    function reveal(id, config) {
      if (!alive || !context || suspended || !shown(id)) return false;
      size = measure(); if (!size.w || !size.h) return false; var p = positions.get(id), k = config && config.readable ? Math.max(0.85, view.k) : view.k;
      var x = p.x * k + view.x, y = p.y * k + view.y;
      if (k === view.k && x >= 24 && y >= 24 && x + W * k <= size.w - 24 && y + H * k <= size.h - 24) return true;
      view = { x: size.w / 2 - (p.x + W / 2) * k, y: size.h / 2 - (p.y + H / 2) * k, k: k }; pendingFit = false; transform(true); return true;
    }
    function center(id, config) {
      if (!alive || !context || suspended || !shown(id)) return false;
      size = measure(); if (!size.w || !size.h) return false;
      var p = positions.get(id), k = config && config.readable ? Math.max(0.85, view.k) : view.k, frame = config && config.frame;
      var x = size.w / 2, y = size.h / 2;
      if (frame && [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) && frame.width > 0 && frame.height > 0) { x = frame.x + frame.width / 2; y = frame.y + frame.height / 2; }
      view = { x: x - (p.x + W / 2) * k, y: y - (p.y + H / 2) * k, k: k }; pendingFit = false; transform(true); return true;
    }
    function placeAdded(id, config) {
      if (!alive || !context || suspended || !nodes.has(id)) return false; config = config || {};
      var point = config.position;
      if (point !== undefined && (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
      if (!point) {
        size = measure(); if (!size.w || !size.h) return false;
        var occupied = Array.from(config.visibleIds || ids()).filter(function (key) { return key !== id && nodes.has(key); }), anchor = occupied.includes(config.anchorId) && positions.get(config.anchorId);
        var base = anchor ? { x: anchor.x + W + 48, y: anchor.y } : { x: (size.w / 2 - view.x) / view.k - W / 2, y: (size.h / 2 - view.y) / view.k - H / 2 };
        function free(p) { return occupied.every(function (key) { var o = positions.get(key); return p.x + W + 24 <= o.x || o.x + W + 24 <= p.x || p.y + H + 24 <= o.y || o.y + H + 24 <= p.y; }); }
        function fits(p) { return p.x * view.k + view.x >= 16 && p.y * view.k + view.y >= 16 && (p.x + W) * view.k + view.x <= size.w - 16 && (p.y + H) * view.k + view.y <= size.h - 16; }
        var nearby = anchor ? [base, { x: anchor.x, y: anchor.y + H + 30 }, { x: anchor.x, y: anchor.y - H - 30 }, { x: anchor.x - W - 48, y: anchor.y }] : [base];
        point = nearby.find(function (p) { return free(p) && fits(p); });
        var fallback = nearby.find(free), maxVisibleRing = Math.min(32, Math.ceil(Math.max(size.w / view.k / (W + 48), size.h / view.k / (H + 30))) + 1);
        // Search nearby grid rings. A finite occupied registry guarantees a
        // free location; only this newly-added member is ever relocated.
        for (var ring = 1; !point; ring++) {
          var candidates = [];
          for (var offset = -ring; offset <= ring; offset++) { candidates.push({ x: base.x + offset * (W + 48), y: base.y - ring * (H + 30) }, { x: base.x + offset * (W + 48), y: base.y + ring * (H + 30) }); }
          for (var vertical = -ring + 1; vertical < ring; vertical++) { candidates.push({ x: base.x - ring * (W + 48), y: base.y + vertical * (H + 30) }, { x: base.x + ring * (W + 48), y: base.y + vertical * (H + 30) }); }
          if (!fallback) fallback = candidates.find(free);
          point = candidates.find(function (p) { return free(p) && fits(p); });
          if (!point && ring >= maxVisibleRing && fallback) point = fallback;
        }
      }
      positions.set(id, { x: point.x, y: point.y }); updateGeometry(); return { x: point.x, y: point.y };
    }
    function focusNode(id) {
      if (!alive || suspended || !shown(id)) return false; roving = id;
      elements.forEach(function (e, key) { e.tabIndex = shown(key) && key === roving ? 0 : -1; }); elements.get(id).focus({ preventScroll: true }); return true;
    }
    function select(id, origin) { if (!shown(id) && id !== null) return; selected = id; applyVisibility(); emit('onSelect', { generation: generation, nodeId: id, origin: origin }); }
    function clear() {
      if (frame) win.cancelAnimationFrame(frame); frame = 0; drag = null; pinch = null; pointers.clear();
      routeStatus.hidden = true; routeStatus.textContent = ''; cardIndex = null; routeKey = null;
      context = null; generation = undefined; positions.clear(); nodes.clear(); elements.clear(); miniElements.clear(); groups = []; edgeElements = [];
      selected = roving = matches = visible = focusIds = flowRoot = null; branchIds = new Set(); pendingFit = false; view = { x: 0, y: 0, k: 1 };
      nodeLayer.replaceChildren(); edgeLayer.replaceChildren(); cycleLayer.replaceChildren(); mapNodes.replaceChildren(); mapEdges.replaceChildren(); root.hidden = true; transform(false);
    }
    function setContext(next) {
      if (!alive) return; var fresh = !context || !next || next.generation !== generation;
      if (fresh) clear(); if (!next) return;
      context = next; generation = next.generation; root.hidden = suspended; routeKey = null;
      nodes = new Map(next.graph.nodes.map(function (n) { return [n.id, n]; }));
      positions.forEach(function (_, id) { if (!nodes.has(id)) positions.delete(id); }); layout();
      if (!nodes.has(selected)) selected = null;
      nodeLayer.replaceChildren(); elements.clear(); titleSize = detailSize = 0; edgeLayer.replaceChildren(); edgeElements = [];
      nodes.forEach(function (n) {
        var row = next.byNodeId && next.byNodeId.get(n.id), chrome = row && row.chrome || {};
        var parts = g.WorkspaceUI.createCardChrome(doc, Object.assign({ label: n.label, subtitle: n.subtitle, badge: n.kind === 'parameter' ? 'P' : n.kind === 'function' ? 'F' : 'Q', chips: [{ value: (row && row.inputIds || []).length, label: 'inputs' }, { value: (row && row.consumerIds || []).length, label: 'consumers' }] }, chrome));
        var button = parts.card; button.classList.add('pqc-node');if(chrome.fact)button.classList.add('pqc-fact'); button.classList.add('pqc-kind-' + n.kind); button.setAttribute('role', 'button'); button.dataset.nodeId = n.id; button.title = n.label + ' · ' + (chrome.subtitle || n.subtitle) + (row && row.presentation ? ' · Source: ' + row.presentation.provider + '. ' + row.presentation.sourceBasis : '');
        button.setAttribute('aria-label', button.title + '. Click or Space to inspect. Double-click or Enter to analyze.'); parts.title.classList.add('pqc-node-title'); parts.subtitle.classList.add('pqc-node-subtitle');
        if (row && row.presentation) {
          var source = el('span', 'pqc-source', row.presentation.providerIcon + ' ' + row.presentation.provider);
          source.title = row.presentation.sourceBasis; source.style.color = row.presentation.providerColor; parts.meta.replaceChildren(source);
        }
        var cycle = (row && row.issues || next.graph.issues || []).some(function (i) { return i.kind === 'cycle' && i.consumerId === n.id; });
        if (cycle) parts.meta.appendChild(el('span', 'pqc-node-badge', 'Cycle'));
        else if (n.state !== 'available') parts.meta.appendChild(el('span', 'pqc-node-badge pqc-status-badge', n.state === 'no-partitions' ? 'Metadata unavailable' : n.state === 'non-m' ? 'Non-M' : 'Source unavailable'));
        nodeLayer.appendChild(button); elements.set(n.id, button);
      });
      next.graph.edges.forEach(function (edge) {
        if (!nodes.has(edge.inputId) || !nodes.has(edge.consumerId)) return;
        var group = svg('g', { class: 'pqc-edge' + (nodes.get(edge.inputId).kind === 'parameter' ? ' pqc-parameter-edge' : '') });
        var underlay = svg('path', { class: 'pqc-edge-underlay' }), line = svg('path', { class: 'pqc-edge-line' }), hit = svg('path', { class: 'pqc-edge-hit' }), arrow = svg('g', { class: 'pqc-edge-arrow' }); hit.dataset.edgeId = edge.id;
        var title = svg('title'); title.textContent = nodes.get(edge.inputId).label + ' is referenced by ' + nodes.get(edge.consumerId).label;
        hit.setAttribute('role', 'button'); hit.setAttribute('tabindex', '0'); hit.setAttribute('aria-label', title.textContent);
        group.appendChild(title); group.appendChild(underlay); group.appendChild(line); group.appendChild(arrow); group.appendChild(hit); edgeLayer.appendChild(group);
        var entry = { edge: edge, group: group, underlay: underlay, line: line, hit: hit, arrow: arrow, hovered: false }; edgeElements.push(entry);
        function hover(value) { entry.hovered = value; group.classList.toggle('pqc-edge-hover', value); drawEdge(entry, ids().map(function (id) { return positions.get(id); })); }
        // These listeners die with their edge DOM on context replacement.
        hit.addEventListener('mouseenter', function () { hover(true); });
        hit.addEventListener('mouseleave', function () { hover(false); });
        hit.addEventListener('focus', function () { hover(true); });
        hit.addEventListener('blur', function () { hover(false); });
        hit.addEventListener('keydown', function (e) {
          if ((e.key !== 'Enter' && e.key !== ' ') || e.altKey || e.metaKey || e.ctrlKey) return;
          e.preventDefault(); e.stopPropagation();
          var p = entry.points[Math.floor(entry.points.length / 2)] || positions.get(edge.consumerId);
          emit('onEdge', { generation: generation, edgeId: edge.id, anchor: { x: p.x * view.k + view.x, y: p.y * view.k + view.y } });
        });
      });
      applyVisibility(); if (fresh) fit(); else transform(false);
    }
    function setSelection(id) { if (!alive) return; selected = id !== null && nodes.has(id) ? id : null; applyVisibility(); }
    function setMatches(set) { if (!alive) return; matches = set === null ? null : new Set(set); applyVisibility(); }
    function setFlow(rootId,branch) { if (!alive) return; flowRoot = nodes.has(rootId) ? rootId : null; branchIds = new Set(Array.from(branch || []).filter(function(id){return nodes.has(id);})); applyVisibility(); }
    function setFocusIds(set) { if (!alive) return; focusIds = set === null ? null : new Set(set); applyVisibility(); }
    function arrange(set) {
      if (!alive || !context) return false; var subset = new Set(Array.from(set || ids()).filter(shown)); if (!subset.size) return false;
      subset.forEach(function (id) { positions.delete(id); }); layout(subset); groups = []; var keys = new Set(); (context.graph.issues || []).forEach(function (i) { if (i.kind === 'cycle' && i.componentIds) { var key = JSON.stringify(i.componentIds); if (!keys.has(key)) { keys.add(key); groups.push(i.componentIds.filter(function (id) { return nodes.has(id); })); } } }); updateGeometry(); return true;
    }
    function setVisibleIds(set) { if (!alive) return; visible = set === null ? null : new Set(set); applyVisibility(); }
    function captureLayout() { var copy = new Map(); positions.forEach(function (p, id) { copy.set(id, { x: p.x, y: p.y }); }); layoutGenerations.set(copy, generation); return copy; }
    function restoreLayout(layoutMap) { if (!alive || !context || !layoutMap || (layoutGenerations.has(layoutMap) && layoutGenerations.get(layoutMap) !== generation)) return; layoutMap.forEach(function (p, id) { if (nodes.has(id) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) positions.set(id, { x: p.x, y: p.y }); }); updateGeometry(); }
    function local(e) { var rect = surface.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
    function nodeId(e) { var button = e.target.closest && e.target.closest('[data-node-id]'); return button && button.dataset.nodeId; }
    on(surface, 'pointerdown', function (e) {
      if (!context || suspended || (e.button !== 0 && e.pointerType !== 'touch') || (e.target.closest && e.target.closest('[data-edge-id]'))) return;
      var p = local(e); pointers.set(e.pointerId, p); surface.setPointerCapture(e.pointerId);
      if (pointers.size === 2) { var pair = Array.from(pointers.values()), mid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 }; pinch = { generation: generation, distance: Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y), world: { x: (mid.x - view.x) / view.k, y: (mid.y - view.y) / view.k }, k: view.k }; drag = null; e.preventDefault(); return; }
      if (pointers.size > 1) return; var id = nodeId(e); drag = { generation: generation, pointerId: e.pointerId, id: id || null, x: p.x, y: p.y, view: getViewport(), position: id && Object.assign({}, positions.get(id)), moved: false }; e.preventDefault();
    });
    on(surface, 'pointermove', function (e) {
      if (!pointers.has(e.pointerId) || !context || suspended) return; var p = local(e); pointers.set(e.pointerId, p);
      if (pinch && pinch.generation === generation && pointers.size >= 2) { var pair = Array.from(pointers.values()), k = Math.max(0.00001, Math.min(4, pinch.k * Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) / Math.max(1, pinch.distance))); view = { x: (pair[0].x + pair[1].x) / 2 - pinch.world.x * k, y: (pair[0].y + pair[1].y) / 2 - pinch.world.y * k, k: k }; pendingFit = false; transform(true); return; }
      if (!drag || drag.pointerId !== e.pointerId || drag.generation !== generation) return;
      var dx = p.x - drag.x, dy = p.y - drag.y; if (!drag.moved && Math.hypot(dx, dy) > 4) { if(drag.id)emit('onLayoutStart',{generation:generation,nodeId:drag.id});drag.moved = true; } if (!drag.moved) return;
      if (drag.id) { positions.set(drag.id, { x: drag.position.x + dx / view.k, y: drag.position.y + dy / view.k }); scheduleGeometry(); }
      else { view.x = drag.view.x + dx; view.y = drag.view.y + dy; pendingFit = false; transform(true); }
      surface.classList.add('pqc-dragging');
    });
    on(surface, 'pointerup', function (e) {
      pointers.delete(e.pointerId); surface.classList.remove('pqc-dragging');
      if (pinch) { if (!pointers.size) pinch = null; drag = null; return; }
      var d = drag; drag = null; if (!d || d.generation !== generation || d.pointerId !== e.pointerId || suspended) return;
      if (!d.moved) { select(d.id, d.id ? 'node' : 'blank'); if (d.id) focusNode(d.id); else surface.focus({ preventScroll: true }); }
    });
    on(surface, 'pointercancel', function () { pointers.clear(); pinch = drag = null; surface.classList.remove('pqc-dragging'); });
    on(surface, 'click', function (e) { var hit = e.target.closest && e.target.closest('[data-edge-id]'); if (!hit || !context || suspended) return; emit('onEdge', { generation: generation, edgeId: hit.dataset.edgeId, anchor: local(e) }); });
    on(surface, 'dblclick', function (e) { var id=nodeId(e);if(!context||suspended||!shown(id))return;e.preventDefault();emit('onAnalyze',{generation:generation,nodeId:id}); });
    on(mapSvg, 'click', function (e) { var id = e.target.dataset && e.target.dataset.mapId; if (id && shown(id)) { select(id, 'node'); reveal(id, { readable: true }); focusNode(id); } });
    on(surface, 'wheel', function (e) { if (!context || suspended) return; e.preventDefault(); zoomBy(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.002)), local(e)); }, { passive: false });
    // The provided host is the coordinator's focus fallback. Surface/node key
    // events bubble here, giving both paths one handler without global shortcuts.
    on(host, 'keydown', function (e) {
      if (!context || suspended || e.altKey || e.metaKey || e.ctrlKey || (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      var id = nodeId(e), list = ids(), key = e.key;
      if (id && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) { e.preventDefault(); var at = list.indexOf(id), next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : (at + (key === 'ArrowRight' ? 1 : list.length - 1)) % list.length; focusNode(list[next]); }
      else if (key === 'Enter' && id) { e.preventDefault(); emit('onAnalyze', {generation:generation,nodeId:id}); }
      else if (key === ' ' && id) { e.preventDefault(); select(id, 'keyboard'); }
      else if (!id && key.startsWith('Arrow')) { e.preventDefault(); view.x += key === 'ArrowLeft' ? 40 : key === 'ArrowRight' ? -40 : 0; view.y += key === 'ArrowUp' ? 40 : key === 'ArrowDown' ? -40 : 0; pendingFit = false; transform(true); }
      else if (key === '+' || key === '=' || key === '-') { e.preventDefault(); zoomBy(key === '-' ? 1 / 1.2 : 1.2); }
      else if (key.toLowerCase() === 'f') { e.preventDefault(); fit(); }
    });
    function resize() {
      if (!alive || !context || suspended) return; var next = measure(); if (!next.w || !next.h) return;
      if (pendingFit) { size = next; fit(); return; }
      if (next.w === size.w && next.h === size.h) return;
      // Inspector docking/resizing must not pan an inspected diagram.
      // Framing belongs to explicit Center/Fit/reveal actions only.
      size = next; transform(true);
    }
    var observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null; if (observer) observer.observe(surface); else on(win, 'resize', resize);
    function suspend(value) { if (!alive) return; suspended = !!value; root.hidden = suspended || !context; pointers.clear(); drag = pinch = null; if (!suspended) resize(); }
    function destroy() { if (!alive) return; clear(); alive = false; if (observer) observer.disconnect(); removers.forEach(function (off) { off(); }); removers = []; options = {}; root.remove(); }
    setContext(options.context || null);
    return { setContext: setContext, setSelection: setSelection, setMatches: setMatches, setFocusIds: setFocusIds, setFlow: setFlow, arrange: arrange, placeAdded: placeAdded, setVisibleIds: setVisibleIds, reveal: reveal, center: center, fit: fit, zoomBy: zoomBy, getViewport: getViewport, setViewport: setViewport, focusNode: focusNode, captureLayout: captureLayout, restoreLayout: restoreLayout, suspend: suspend, destroy: destroy };
  }
  g.PowerQueryCanvas = { version: 2, mount: mount };
})(window);
