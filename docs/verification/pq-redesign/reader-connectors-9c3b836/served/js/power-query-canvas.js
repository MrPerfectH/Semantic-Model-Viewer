/* pq-workspace/2: geometry and interaction only. The coordinator supplies the
 * complete graph, presentation context, filter projection and generation.
 * No analysis, source loading, shell state, history or persistence here. */
(function (g) {
  'use strict';
  var W = 252, H = 96, GAP_X = 100, GAP_Y = 30, serial = 0;
  function mount(host, options) {
    options = options || {};
    var doc = host.ownerDocument, win = doc.defaultView || g;
    var alive = true, context = null, generation, selected = null, matches = null, visible = null, focusIds = null;
    var positions = new Map(), nodes = new Map(), elements = new Map(), groups = [], layoutGenerations = new WeakMap();
    var view = { x: 0, y: 0, k: 1 }, size = { w: 0, h: 0 }, roving = null;
    var suspended = false, pendingFit = false, frame = 0, drag = null, pinch = null;
    var pointers = new Map(), removers = [], edgeElements = [], miniElements = new Map(), titleSize = 0;
    var markerId = 'pqc-arrow-' + (++serial);
    function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    function svg(tag, attrs) { var e = doc.createElementNS('http://www.w3.org/2000/svg', tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
    function on(target, name, fn, opts) { target.addEventListener(name, fn, opts); removers.push(function () { target.removeEventListener(name, fn, opts); }); }
    var root = el('div', 'pqc'), surface = el('div', 'pqc-surface'), world = el('div', 'pqc-world');
    root.setAttribute('aria-label', 'Power Query input to consumer canvas'); root.setAttribute('role', 'group');
    surface.tabIndex = 0; surface.setAttribute('aria-label', 'Query canvas. Arrow keys pan; F fits; plus and minus zoom.');
    var edgesSvg = svg('svg', { class: 'pqc-edges', 'aria-label': 'Resolved query references' });
    var defs = svg('defs'), marker = svg('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto' });
    marker.appendChild(svg('path', { d: 'M 3 1 L 8 5 L 3 9', fill: 'none', stroke: 'context-stroke', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })); defs.appendChild(marker); edgesSvg.appendChild(defs);
    var edgeLayer = svg('g'), cycleLayer = el('div', 'pqc-cycles'), nodeLayer = el('div', 'pqc-nodes');
    edgesSvg.appendChild(edgeLayer); world.appendChild(cycleLayer); world.appendChild(edgesSvg); world.appendChild(nodeLayer); surface.appendChild(world); root.appendChild(surface);
    var legend = el('div', 'pqc-legend'); legend.appendChild(el('span', 'pqc-solid-key', 'Query input → consumer')); legend.appendChild(el('span', 'pqc-parameter-key', 'Parameter → consumer')); root.appendChild(legend);
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
    // Orthogonal routes use actual input/consumer ports, even after dragging a
    // consumer to the left. No source analysis or change to graph direction.
    function edgePath(edge, obstacles) {
      var a = positions.get(edge.inputId), b = positions.get(edge.consumerId); if (!a || !b) return '';
      function path(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' '); }
      if (edge.inputId === edge.consumerId) return path([[a.x + W / 2, a.y], [a.x + W / 2, a.y - 22], [a.x + W + 22, a.y - 22], [a.x + W + 22, a.y + H / 2], [a.x + W, a.y + H / 2]]);
      var right = b.x >= a.x + W + 32, left = a.x >= b.x + W + 32, vertical = !right && !left;
      var forward = vertical ? b.y >= a.y : right, sign = forward ? 1 : -1;
      // Reverse vertical links use a separate port, so both sides of a cycle
      // remain visible instead of drawing two directions over one segment.
      var start = vertical ? [a.x + W / 2 + sign * 12, a.y + (forward ? H : 0)] : [a.x + (right ? W : 0), a.y + H / 2];
      var end = vertical ? [b.x + W / 2 + sign * 12, b.y + (forward ? 0 : H)] : [b.x + (right ? 0 : W), b.y + H / 2];
      var axis = vertical ? 1 : 0, cross = 1 - axis, channel = (start[axis] + end[axis]) / 2;
      var p = start.slice(), q = end.slice(); p[axis] = q[axis] = channel;
      var direct = [start, p, q, end];
      function blocked(points, rect) {
        for (var i = 1; i < points.length; i++) {
          var u = points[i - 1], v = points[i];
          if (u[0] === v[0] ? u[0] > rect.x && u[0] < rect.x + W && Math.max(u[1], v[1]) > rect.y && Math.min(u[1], v[1]) < rect.y + H
            : u[1] > rect.y && u[1] < rect.y + H && Math.max(u[0], v[0]) > rect.x && Math.min(u[0], v[0]) < rect.x + W) return true;
        }
        return false;
      }
      var blockers = obstacles.filter(function (rect) { return blocked(direct, rect); });
      if (!blockers.length) return path(direct);
      // Detour around intervening visible cards. Hidden registry members cannot
      // distort the visible route. The common adjacent-card case stays O(nodes).
      var rails = [], dimension = vertical ? W : H, key = vertical ? 'x' : 'y';
      blockers.forEach(function (r) { rails.push(r[key] - 18, r[key] + dimension + 18); });
      rails.push(Math.min.apply(null, obstacles.map(function (r) { return r[key]; })) - 18, Math.max.apply(null, obstacles.map(function (r) { return r[key] + dimension; })) + 18);
      rails = Array.from(new Set(rails)).sort(function (x, y) { return Math.abs(start[cross] - x) + Math.abs(end[cross] - x) - Math.abs(start[cross] - y) - Math.abs(end[cross] - y); });
      var sa = start.slice(), sb = end.slice(); sa[axis] += sign * 16; sb[axis] -= sign * 16;
      for (var i = 0; i < rails.length; i++) {
        var ca = sa.slice(), cb = sb.slice(); ca[cross] = cb[cross] = rails[i];
        var detour = [start, sa, ca, cb, sb, end];
        if (!obstacles.some(function (r) { return blocked(detour, r); })) return path(detour);
      }
      // Manually overlapping cards may leave no clear port. Keep their exact
      // positions and semantic endpoints; never silently rearrange the canvas.
      return path(direct);
    }
    function updateGeometry() {
      elements.forEach(function (e, id) { var p = positions.get(id); e.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; });
      var obstacles = ids().map(function (id) { return positions.get(id); });
      edgeElements.forEach(function (entry) { var d = edgePath(entry.edge, obstacles); entry.line.setAttribute('d', d); entry.hit.setAttribute('d', d); });
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
      elements.forEach(function (e, id) { e.hidden = !shown(id); e.tabIndex = shown(id) && id === roving ? 0 : -1; e.classList.toggle('pqc-dim', (!!matches && !matches.has(id)) || (!!focusIds && !focusIds.has(id))); e.classList.toggle('pqc-focus-dim', !!focusIds && !focusIds.has(id)); e.classList.toggle('pqc-selected', id === selected); e.setAttribute('aria-pressed', String(id === selected)); });
      edgeElements.forEach(function (entry) { entry.group.style.display = shown(entry.edge.inputId) && shown(entry.edge.consumerId) ? '' : 'none'; var related = selected === entry.edge.inputId || selected === entry.edge.consumerId; entry.group.classList.toggle('pqc-related', related); entry.group.classList.toggle('pqc-edge-dim', (!!matches && !matches.has(entry.edge.inputId) && !matches.has(entry.edge.consumerId)) || (!!focusIds && (!focusIds.has(entry.edge.inputId) || !focusIds.has(entry.edge.consumerId)))); });
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
      // Compact name chips keep ordinary overviews legible. At very large-model
      // scales the overview is shape-only; search/reveal restores readable detail.
      var font = view.k >= 0.25 ? Math.max(13.5, 11 / view.k) : 13.5;
      if (Math.abs(font - titleSize) > 0.05) { titleSize = font; elements.forEach(function (e) { var title = e.querySelector('.pqc-node-title'); title.style.fontSize = font + 'px'; title.style.lineHeight = (font * 1.3) + 'px'; }); }
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
      var p = positions.get(id), k = config && config.readable ? Math.max(0.85, view.k) : view.k;
      view = { x: size.w / 2 - (p.x + W / 2) * k, y: size.h / 2 - (p.y + H / 2) * k, k: k }; pendingFit = false; transform(true); return true;
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
      context = null; generation = undefined; positions.clear(); nodes.clear(); elements.clear(); miniElements.clear(); groups = []; edgeElements = [];
      selected = roving = matches = visible = focusIds = null; pendingFit = false; view = { x: 0, y: 0, k: 1 };
      nodeLayer.replaceChildren(); edgeLayer.replaceChildren(); cycleLayer.replaceChildren(); mapNodes.replaceChildren(); mapEdges.replaceChildren(); root.hidden = true; transform(false);
    }
    function setContext(next) {
      if (!alive) return; var fresh = !context || !next || next.generation !== generation;
      if (fresh) clear(); if (!next) return;
      context = next; generation = next.generation; root.hidden = suspended;
      nodes = new Map(next.graph.nodes.map(function (n) { return [n.id, n]; }));
      positions.forEach(function (_, id) { if (!nodes.has(id)) positions.delete(id); }); layout();
      if (!nodes.has(selected)) selected = null;
      nodeLayer.replaceChildren(); elements.clear(); titleSize = 0; edgeLayer.replaceChildren(); edgeElements = [];
      nodes.forEach(function (n) {
        var row = next.byNodeId && next.byNodeId.get(n.id), chrome = row && row.chrome || {};
        var parts = g.WorkspaceUI.createCardChrome(doc, Object.assign({ label: n.label, subtitle: n.subtitle, badge: n.kind === 'parameter' ? 'P' : n.kind === 'function' ? 'F' : 'Q', chips: [{ value: (row && row.inputIds || []).length, label: 'inputs' }, { value: (row && row.consumerIds || []).length, label: 'consumers' }] }, chrome));
        var button = parts.card; button.classList.add('pqc-node'); button.classList.add('pqc-kind-' + n.kind); button.setAttribute('role', 'button'); button.dataset.nodeId = n.id; button.title = n.label + ' · ' + n.subtitle;
        button.setAttribute('aria-label', n.label + ' · ' + n.subtitle); parts.title.classList.add('pqc-node-title'); parts.subtitle.classList.add('pqc-node-subtitle');
        var cycle = (row && row.issues || next.graph.issues || []).some(function (i) { return i.kind === 'cycle' && i.consumerId === n.id; });
        if (cycle) parts.meta.appendChild(el('span', 'pqc-node-badge', 'Cycle'));
        else if (n.state !== 'available') parts.meta.appendChild(el('span', 'pqc-node-badge pqc-status-badge', n.state === 'no-partitions' ? 'Metadata unavailable' : n.state === 'non-m' ? 'Non-M' : 'Source unavailable'));
        nodeLayer.appendChild(button); elements.set(n.id, button);
      });
      next.graph.edges.forEach(function (edge) {
        if (!nodes.has(edge.inputId) || !nodes.has(edge.consumerId)) return;
        var group = svg('g', { class: 'pqc-edge' + (nodes.get(edge.inputId).kind === 'parameter' ? ' pqc-parameter-edge' : '') });
        var line = svg('path', { class: 'pqc-edge-line', 'marker-end': 'url(#' + markerId + ')' }), hit = svg('path', { class: 'pqc-edge-hit' }); hit.dataset.edgeId = edge.id;
        var title = svg('title'); title.textContent = nodes.get(edge.inputId).label + ' is referenced by ' + nodes.get(edge.consumerId).label; group.appendChild(title); group.appendChild(line); group.appendChild(hit); edgeLayer.appendChild(group); edgeElements.push({ edge: edge, group: group, line: line, hit: hit });
      });
      applyVisibility(); if (fresh) fit(); else transform(false);
    }
    function setSelection(id) { if (!alive) return; selected = id !== null && nodes.has(id) ? id : null; applyVisibility(); }
    function setMatches(set) { if (!alive) return; matches = set === null ? null : new Set(set); applyVisibility(); }
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
      var dx = p.x - drag.x, dy = p.y - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; if (!drag.moved) return;
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
    on(mapSvg, 'click', function (e) { var id = e.target.dataset && e.target.dataset.mapId; if (id && shown(id)) { select(id, 'node'); reveal(id, { readable: true }); focusNode(id); } });
    on(surface, 'wheel', function (e) { if (!context || suspended) return; e.preventDefault(); zoomBy(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.002)), local(e)); }, { passive: false });
    // The provided host is the coordinator's focus fallback. Surface/node key
    // events bubble here, giving both paths one handler without global shortcuts.
    on(host, 'keydown', function (e) {
      if (!context || suspended || e.altKey || e.metaKey || e.ctrlKey || (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      var id = nodeId(e), list = ids(), key = e.key;
      if (id && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) { e.preventDefault(); var at = list.indexOf(id), next = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : (at + (key === 'ArrowRight' ? 1 : list.length - 1)) % list.length; focusNode(list[next]); }
      else if ((key === 'Enter' || key === ' ') && id) { e.preventDefault(); select(id, 'keyboard'); }
      else if (!id && key.startsWith('Arrow')) { e.preventDefault(); view.x += key === 'ArrowLeft' ? 40 : key === 'ArrowRight' ? -40 : 0; view.y += key === 'ArrowUp' ? 40 : key === 'ArrowDown' ? -40 : 0; pendingFit = false; transform(true); }
      else if (key === '+' || key === '=' || key === '-') { e.preventDefault(); zoomBy(key === '-' ? 1 / 1.2 : 1.2); }
      else if (key.toLowerCase() === 'f') { e.preventDefault(); fit(); }
    });
    function resize() {
      if (!alive || !context || suspended) return; var next = measure(); if (!next.w || !next.h) return;
      if (pendingFit) { size = next; fit(); return; }
      if (next.w === size.w && next.h === size.h) return;
      if (size.w && size.h) { view.x += (next.w - size.w) / 2; view.y += (next.h - size.h) / 2; }
      size = next; transform(true);
    }
    var observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null; if (observer) observer.observe(surface); else on(win, 'resize', resize);
    function suspend(value) { if (!alive) return; suspended = !!value; root.hidden = suspended || !context; pointers.clear(); drag = pinch = null; if (!suspended) resize(); }
    function destroy() { if (!alive) return; clear(); alive = false; if (observer) observer.disconnect(); removers.forEach(function (off) { off(); }); removers = []; options = {}; root.remove(); }
    setContext(options.context || null);
    return { setContext: setContext, setSelection: setSelection, setMatches: setMatches, setFocusIds: setFocusIds, arrange: arrange, placeAdded: placeAdded, setVisibleIds: setVisibleIds, reveal: reveal, center: center, fit: fit, zoomBy: zoomBy, getViewport: getViewport, setViewport: setViewport, focusNode: focusNode, captureLayout: captureLayout, restoreLayout: restoreLayout, suspend: suspend, destroy: destroy };
  }
  g.PowerQueryCanvas = { version: 2, mount: mount };
})(window);
