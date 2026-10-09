/* Graph canvas: table cards, relationship edges, pan/zoom, LOD, clusters.
   Ported from the prototype's Component class (imperative DOM, unchanged algorithms). */
(function (g) {
  'use strict';
  var el = U.el, sv = U.sv, tint = U.tint, store = U.store;
  function mixHex(base, accent, a) {
    var b = base.replace('#', ''), c = accent.replace('#', ''), out = '#';
    for (var i = 0; i < 6; i += 2) {
      var v = Math.round(parseInt(b.slice(i, i + 2), 16) * (1 - a) + parseInt(c.slice(i, i + 2), 16) * a);
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
  }

  function GraphCanvas(app, host) {
    this.app = app;
    this.host = host;
    this.pos = {};
    this.cpos = {};
    this.cards = {};
    this.groups = null;
    this.groupOrder = [];
    this.clusterOn = false;
    this.expandedGroups = new Set();
    this.pinned = new Set();
    this.locked = null;
    this.marked = new Set();
    this.view = { x: 0, y: 0, k: 1 };
    this.CARD_W = 252;
    this.setLayoutKey('lsa_model_layout_v1');
    this.showSA = false;
    this._activeSel = null;
    this._isoSet = null;
    this._chip = null;
    this.detailMode = store.get('smv-detail', 'auto') || 'auto';
    this.layoutAlgo = store.get('smv-layout', 'star') || 'star';
    this.lineStyle = store.get('smv-lines', 'ortho') || 'ortho';
    this.selRel = null;
    this._relSpots = {};
    this._panBound = false;
  }

  /* Edge / ring colours relative to the focused (selected, locked or pinned) tables:
     OUT  = focused table is the `from` (many) side, it looks up to the other table
     IN   = focused table is the `to` (one) side, it filters the other table
     HOP  = link between two neighbours that does not touch a focused table (2nd hop) */
  /* base is the darkest grey that still reads as "not focused" — a lighter line disappears
     once the whole model is on screen at 30-40% zoom, which is the normal first view */
  /* The one zoom floor. Fit never goes below it, and a chip never grows past the size it has
     there — the same number in both places is what keeps a lane and the chip inside it the
     same size. Below the floor the picture is panned, not shrunk further. */
  var ZOOM_FLOOR = 0.25;
  g.ZOOM_FLOOR = ZOOM_FLOOR;
  var EDGE = { base: '#9aa3b2', out: '#5b7ca8', in: '#4d8f85', hop: '#c08a5a', lock: '#1f2430', pin: '#8b7cb0', marked: '#b4584f' };
  var SHADOW_BASE = '0 1px 2px rgba(20,30,50,.05),0 3px 10px rgba(20,30,50,.06)';
  var SHADOW_HOVER = '0 2px 5px rgba(20,30,50,.08),0 10px 24px rgba(20,30,50,.12)';

  /* Fit has to aim at the part of the canvas nobody is standing on. The inspector drawer,
     the overview map, the zoom rail and the legend float *over* the host element, so the raw
     host rect fits cards straight underneath them. Each obstruction is trimmed off the side
     it costs least to give up, which keeps the usable box rectangular and stable.
     Pure geometry, exported for the headless fit test. */
  function fitRect(host, obstructions, pad) {
    pad = typeof pad === 'number' ? pad : 24;
    var r = { x: 0, y: 0, w: Math.max(0, (host && host.w) || 0), h: Math.max(0, (host && host.h) || 0) };
    (obstructions || []).forEach(function (o) {
      if (!o || !(o.w > 0) || !(o.h > 0)) return;
      var x0 = Math.max(r.x, o.x), y0 = Math.max(r.y, o.y);
      var x1 = Math.min(r.x + r.w, o.x + o.w), y1 = Math.min(r.y + r.h, o.y + o.h);
      if (x1 <= x0 || y1 <= y0) return;
      /* Which side to give up is decided on what is LEFT, not on what is cut: a narrow panel
         down the right of the canvas costs fewer pixels to trim off the bottom, and doing so
         throws away the height a tall drawing needed. Ties keep the old order. */
      var cutL = x1 - r.x, cutR = r.x + r.w - x0, cutT = y1 - r.y, cutB = r.y + r.h - y0;
      var areaR = (r.w - cutR) * r.h, areaB = r.w * (r.h - cutB);
      var areaL = (r.w - cutL) * r.h, areaT = r.w * (r.h - cutT);
      var best = Math.max(areaR, areaB, areaL, areaT);
      if (best === areaR) r.w -= cutR;
      else if (best === areaB) r.h -= cutB;
      else if (best === areaL) { r.x += cutL; r.w -= cutL; }
      else { r.y += cutT; r.h -= cutT; }
    });
    r.x += pad; r.y += pad; r.w -= pad * 2; r.h -= pad * 2;
    /* Overlays that swallow the whole canvas (a narrow window) would leave nothing to fit
       into — fall back to the padded host so the view stays usable instead of collapsing. */
    if (r.w < 160) { r.x = pad; r.w = Math.max(160, r.w, ((host && host.w) || 0) - pad * 2); }
    if (r.h < 160) { r.y = pad; r.h = Math.max(160, r.h, ((host && host.h) || 0) - pad * 2); }
    return r;
  }
  g.fitRect = fitRect;

  GraphCanvas.prototype = {
    EDGE: EDGE,
    layoutK: ZOOM_FLOOR,

    /* ---------- layout ---------- */
    _box: function () { return { w: this.CARD_W, h: 88, gx: 52, gy: 34 }; },
    /* The one collision relaxer, shared by the force layout and every arrange algorithm:
       a pair whose boxes overlap is pushed apart along the axis that owes the least travel
       relative to the gap that axis has to make. `strength` scales the push (the force pass
       ramps it up over the run; an arrange pass uses 1 plus half a pixel so a pair sitting
       exactly on the gap still separates) and `iters` repeats until a sweep moves nothing.
       Points are visited in the order the caller hands over, so the result is deterministic. */
    _relaxPoints: function (pts, gapX, gapY, strength, iters) {
      var s = strength == null ? 1 : strength, bias = s >= 1 ? 0.5 : 0;
      for (var it = 0; it < (iters || 1); it++) {
        var moved = false;
        for (var i = 0; i < pts.length; i++) {
          for (var j = i + 1; j < pts.length; j++) {
            var a = pts[i], b = pts[j];
            if (!a || !b) continue;
            var dx = a.x - b.x, dy = a.y - b.y;
            var ox = gapX - Math.abs(dx), oy = gapY - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            moved = true;
            if (ox / gapX < oy / gapY) { var sx = (ox / 2 * s + bias) * (dx < 0 ? -1 : 1); a.x += sx; b.x -= sx; }
            else { var sy = (oy / 2 * s + bias) * (dy < 0 ? -1 : 1); a.y += sy; b.y -= sy; }
          }
        }
        if (!moved) return;
      }
    },
    /* Smallest centre-to-centre gap that keeps two cards apart on each axis. The height is
       the tallest chip the card becomes inside the band the fitted picture is read at, not
       the collapsed card: the renderer scales a chip by 1/zoom, so a lane cut to the card
       height is around 40% too short at the zoom a whole model actually lands on. */
    _gapBox: function () { var K = this.chipBandBox(); return { x: K.w + this.laneGutterX(this.layoutK), y: K.h + 12 }; },
    /* Force-layout flavour: collapsed card boxes, one sweep, the caller's strength. */
    _separate: function (nodes, strength) {
      var B = this._box();
      this._relaxPoints(nodes.map(function (nd) { return nd.p; }), B.w + B.gx, B.h + B.gy, strength, 1);
    },
    computeLayout: function () {
      var self = this, model = this.app.model;
      var saved = this.loadSaved();
      var tables = model.tables;
      var connected = tables.filter(function (t) { return t.relCount > 0; });
      var standalone = tables.filter(function (t) { return t.relCount === 0; });
      var deg = {}; tables.forEach(function (t) { deg[t.name] = 0; });
      model.relationships.forEach(function (r) { deg[r.from] = (deg[r.from] || 0) + 1; deg[r.to] = (deg[r.to] || 0) + 1; });
      var GA = Math.PI * (3 - Math.sqrt(5));
      connected.forEach(function (t, i) {
        if (saved[t.name]) { self.pos[t.name] = { x: saved[t.name].x, y: saved[t.name].y }; return; }
        var ang = i * GA;
        var rad = (self.app.isFact(t) ? 180 : 430) + i * 6;
        self.pos[t.name] = { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
      });
      if (!this.allSaved(connected, saved)) {
        var nodes = connected.map(function (t) { return { n: t.name, fact: self.app.isFact(t), deg: deg[t.name], p: self.pos[t.name], vx: 0, vy: 0 }; });
        var idx = {}; nodes.forEach(function (nd) { idx[nd.n] = nd; });
        var edges = model.relationships.filter(function (r) { return idx[r.from] && idx[r.to]; }).map(function (r) { return { a: idx[r.from], b: idx[r.to] }; });
        var ITER = 620;
        for (var iter = 0; iter < ITER; iter++) {
          var t0 = iter / ITER;
          for (var i = 0; i < nodes.length; i++) {
            for (var j = i + 1; j < nodes.length; j++) {
              var a = nodes[i], b = nodes[j];
              var dx = a.p.x - b.p.x, dy = a.p.y - b.p.y; var d2 = dx * dx + dy * dy || 1; var d = Math.sqrt(d2);
              var rep = (82000 + (a.deg + b.deg) * 5000) / d2; var fx = dx / d * rep, fy = dy / d * rep;
              a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
            }
          }
          var L = 300;
          edges.forEach(function (e) {
            var dx = e.b.p.x - e.a.p.x, dy = e.b.p.y - e.a.p.y; var d = Math.sqrt(dx * dx + dy * dy) || 1;
            var f = (d - L) * 0.02; var fx = dx / d * f, fy = dy / d * f;
            e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
          });
          nodes.forEach(function (nd) { var gg = nd.fact ? 0.02 : 0.006; nd.vx -= nd.p.x * gg; nd.vy -= nd.p.y * gg; });
          var damp = 0.85, cap = 36;
          nodes.forEach(function (nd) { nd.vx *= damp; nd.vy *= damp; nd.p.x += Math.max(-cap, Math.min(cap, nd.vx)); nd.p.y += Math.max(-cap, Math.min(cap, nd.vy)); });
          this._separate(nodes, 0.25 + 0.55 * t0);
        }
        for (var k = 0; k < 60; k++) this._separate(nodes, 1.0);
        var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
        nodes.forEach(function (nd) { bx0 = Math.min(bx0, nd.p.x); bx1 = Math.max(bx1, nd.p.x); by0 = Math.min(by0, nd.p.y); by1 = Math.max(by1, nd.p.y); });
        var bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
        var target = 1.55;
        if (bw / bh < target) {
          var sx = Math.min(1.9, (target * bh) / bw);
          var cx = (bx0 + bx1) / 2;
          nodes.forEach(function (nd) { nd.p.x = cx + (nd.p.x - cx) * sx; });
          for (var q = 0; q < 40; q++) this._separate(nodes, 1.0);
        }
      }
      this.placeStandaloneShelf(connected, standalone, saved);
    },
    placeStandaloneShelf: function (connected, standalone, saved) {
      var self = this;
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      connected.forEach(function (t) { var p = self.pos[t.name]; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      if (connected.length === 0) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
      var B = this._box(), G = this._gapBox();
      var clusterW = (maxX - minX) + B.w;
      var colW = G.x;
      var cols = Math.max(2, Math.round(clusterW / colW));
      var totalW = cols * colW - B.gx;
      var shelfX = (minX + maxX) / 2 - totalW / 2 + B.w / 2;
      /* the tray rides the same lane height as the picture: a chip is three times the
         collapsed card at the zoom a whole model is read at, and a 122px row buried the
         tray inside itself */
      var shelfY = maxY + G.y + 40;
      standalone.forEach(function (t, i) {
        if (saved[t.name]) { self.pos[t.name] = { x: saved[t.name].x, y: saved[t.name].y }; return; }
        var c = i % cols, r = Math.floor(i / cols);
        self.pos[t.name] = { x: shelfX + c * colW, y: shelfY + r * G.y };
      });
    },
    allSaved: function (list, saved) { return list.length > 0 && list.every(function (t) { return saved[t.name]; }); },
    /* Has the *reader* arranged this model? persist() writes the whole position map on
       every add, drop and automatic layout, so the map's existence says nothing. Only a
       drag, the Arrange button or a restored saved view counts, and the flag is per model,
       which is what lets "Explore all" run the chosen layout on a model nobody has
       arranged yet while leaving a hand-made picture exactly as it was. */
    arrangedKey: function () { return 'smv_arranged_' + (this.app && this.app.modelKey); },
    hasSavedLayout: function () { return store.get(this.arrangedKey(), '') === '1'; },
    markArranged: function () { store.set(this.arrangedKey(), '1'); },
    clearArranged: function () { store.del(this.arrangedKey()); },
    /* A model's positions and their lane zoom must be restored together. Clear the
       size cache even at the same zoom: another model can have longer names. */
    setLayoutKey: function (key) {
      this.LSKEY = key;
      var k = Number(store.get(key + ':k', ZOOM_FLOOR));
      this.setLayoutK(Number.isFinite(k) ? k : ZOOM_FLOOR);
      this._bandBox = null; this._longWord = null;
    },
    loadSaved: function () { return store.getJSON(this.LSKEY, {}); },
    /* Positions and the zoom their lanes were cut for travel together: restoring one without
       the other is a layout whose chips no longer fit the gaps between them. */
    persist: function () { store.setJSON(this.LSKEY, this.pos); store.set(this.LSKEY + ':k', String(this.layoutK)); },

    /* ---------- build DOM ---------- */
    build: function () {
      var self = this, host = this.host; if (!host) return;
      U.clear(host);
      this._chip = null;
      this._bandBox = null;            // lane size follows this model's longest table name
      var world = el('div', { style: 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;' });
      host.appendChild(world); this.world = world;
      var svg = sv('svg', { width: '1', height: '1', style: 'position:absolute;overflow:visible;pointer-events:none;left:0;top:0;' });
      world.appendChild(svg); this.svg = svg;
      var tip = el('div', { style: 'position:absolute;z-index:99;pointer-events:none;background:#1f2430;color:#fff;font:500 11px/1.5 "IBM Plex Mono",monospace;padding:7px 10px;border-radius:7px;box-shadow:0 6px 18px rgba(0,0,0,.25);display:none;white-space:nowrap;' });
      host.appendChild(tip); this.tip = tip;
      var pop = el('div', { style: 'position:absolute;z-index:60;display:none;width:330px;background:#fff;border:1px solid #dfe3e9;border-radius:11px;box-shadow:0 14px 34px rgba(20,30,50,.18);font-family:"IBM Plex Sans",sans-serif;overflow:hidden;' });
      pop.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      pop.addEventListener('wheel', function (e) { e.stopPropagation(); });
      host.appendChild(pop); this.relPop = pop;
      if (!this._escBound) {
        this._escBound = true;
        window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && self.selRel && ['graph', 'clusters'].includes(self.app.state.viewMode)) self.selectRel(null); });
      }
      this.cards = {};
      this.app.model.tables.forEach(function (t) { self.makeCard(world, t); });
      if (!this._panBound) { this.bindPanZoom(host); this._panBound = true; }
      this.recolor();
      this.applyVisibility();
      this.renderLines();
      this.updateTransform();
    },

    makeCard: function (world, t) {
      var self = this, app = this.app;
      var fact = app.isFact(t);
      var card = el('div', {
        data: { name: t.name },
        style: 'position:absolute;width:' + this.CARD_W + 'px;background:#fff;border:1px solid #e4e7ec;border-radius:' + (fact ? '7px' : '13px') +
          ';box-shadow:0 1px 2px rgba(20,30,50,.05),0 4px 12px rgba(20,30,50,.07);font-family:\'IBM Plex Sans\',sans-serif;overflow:hidden;transition:box-shadow .15s,opacity .15s,border-color .15s;'
      });
      var sm = app.srcMeta(t);
      var head = el('div', { data: { head: '1' }, style: 'display:flex;align-items:flex-start;gap:9px;padding:10px 11px 10px 12px;cursor:grab;border-left:4px solid transparent;' });
      var rmap = { fact: 'FACT', dim: 'DIM', helper: 'HLP', calcgroup: 'CG', fieldparam: 'FP', measures: 'M', standalone: 'STD', unknown: 'UNK' };
      var role = el('span', { text: rmap[t.role] || 'TBL', style: 'font:700 8.5px/1 "IBM Plex Mono",monospace;letter-spacing:.4px;padding:4px 5px;border-radius:4px;flex:none;color:#fff;margin-top:1px;' });
      var titleWrap = el('div', { style: 'flex:1;min-width:0;' });
      var nm = el('div', { text: t.name, title: t.name, style: 'font:600 13.5px/1.2 "IBM Plex Sans",sans-serif;letter-spacing:-.2px;color:#1f2430;word-break:break-word;' });
      var src = el('div', {
        title: sm.kind + (sm.detail && sm.detail !== '—' ? ' · ' + sm.detail : '') + (sm.via ? '\nvia ' + sm.via : '') + (sm.server ? '\n' + sm.server : ''),
        html: '<span style="margin-right:4px;opacity:.85;">' + sm.icon + '</span>' + U.esc(sm.detail && sm.detail !== '—' ? sm.detail : sm.kind),
        style: 'font:500 10px/1.4 "IBM Plex Mono",monospace;color:' + sm.color + ';overflow-wrap:anywhere;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'
      });
      titleWrap.appendChild(nm); titleWrap.appendChild(src);
      var caret = el('button', {
        title: 'Show / hide columns and measures', html: U.icon('chevDown', 13, '#b0b6c0'),
        style: 'flex:none;transition:transform .18s;display:flex;align-items:center;justify-content:center;margin-top:0;width:22px;height:22px;border:none;background:transparent;border-radius:5px;cursor:pointer;padding:0;'
      });
      caret.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      caret.addEventListener('click', function (e) { e.stopPropagation(); self.toggleCard(t.name); });
      var lock = el('button', {
        title: 'Lock focus on this table — the highlight stays when you click elsewhere', html: U.icon('lock', 11),
        style: 'flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;'
      });
      lock.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      lock.addEventListener('click', function (e) { e.stopPropagation(); self.toggleLock(t.name); });
      var rm = el('button', {
        title: 'Remove ' + t.name + ' from this layout (Delete)', 'aria-label': 'Remove ' + t.name + ' from layout', html: '&times;',
        style: 'flex:none;width:20px;height:20px;border:none;border-radius:5px;background:transparent;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;font:400 17px/1 "IBM Plex Sans",sans-serif;'
      });
      rm.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      rm.addEventListener('click', function (e) { e.stopPropagation(); if (app.explorer) app.explorer.removeMany([t.name]); });
      head.appendChild(role); head.appendChild(titleWrap); head.appendChild(lock); head.appendChild(rm); head.appendChild(caret);
      card.appendChild(head);
      var meta = el('div', { data: { meta: '1' }, style: 'display:flex;align-items:center;gap:6px;padding:9px 11px 10px 16px;border-top:1px solid #eef0f3;' });
      var chip = function (num, label) {
        return el('span', {
          html: '<b style="font-weight:600;color:#5b6472;">' + num + '</b> <span style="color:#9aa1ad;">' + label + '</span>',
          style: 'font:500 10px/1 "IBM Plex Mono",monospace;background:#f3f5f8;border-radius:5px;padding:4px 7px;'
        });
      };
      meta.appendChild(chip(t.colCount, 'cols'));
      meta.appendChild(chip(t.relCount, 'rel'));
      if (t.measureCount > 0) meta.appendChild(chip(t.measureCount, 'msr'));
      var hiddenMsrCount = (t.measures || []).filter(function (m) { return !!m.h; }).length;
      if (hiddenMsrCount > 0) {
        meta.appendChild(el('span', {
          title: hiddenMsrCount + ' hidden measure' + (hiddenMsrCount === 1 ? '' : 's') + ' (isHidden) out of ' + t.measureCount,
          html: '<span style="display:flex;align-items:center;">' + U.icon('eyeOff', 10, '#8b93a2') + '</span><b style="font-weight:600;color:#8b93a2;">' + hiddenMsrCount + '</b>',
          style: 'display:flex;align-items:center;gap:4px;font:500 10px/1 "IBM Plex Mono",monospace;background:#f4f5f7;border:1px solid #e6e8ec;border-radius:5px;padding:4px 7px;cursor:help;'
        }));
      }
      card.appendChild(meta);
      var body = el('div', { data: { body: '1' }, style: 'display:none;border-top:1px solid #eef0f3;background:#fcfcfd;' });
      var colRows = {};
      t.columns.forEach(function (c) {
        var row = el('div', {
          data: { col: c.name },
          style: 'display:flex;align-items:center;gap:8px;height:25px;padding:0 11px 0 14px;' + (c.rel ? ('background:' + tint('#f59e0b', 0.08) + ';') : '')
        });
        var ic = el('span', {
          html: c.rel ? U.icon('key', 11) : (c.hidden ? U.ICON.eyeSlashCol : '<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:#cfd4dc;"></span>'),
          style: 'flex:none;width:12px;display:flex;align-items:center;justify-content:center;'
        });
        var cn = el('span', {
          text: c.name, title: c.name,
          style: 'flex:1;min-width:0;font:500 11px/1.3 "IBM Plex Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (c.hidden ? '#b3b9c2' : (c.rel ? '#b45309' : '#3a414d')) + ';'
        });
        var tyTxt = app.shortType(c.dataType);
        row.appendChild(ic); row.appendChild(cn);
        if (tyTxt) row.appendChild(el('span', { text: tyTxt, style: 'font:500 9px/1 "IBM Plex Mono",monospace;color:#a9afba;flex:none;background:#eef1f4;border-radius:4px;padding:2px 4px;' }));
        colRows[c.name] = row;
        body.appendChild(row);
      });
      if (t.measures && t.measures.length) {
        body.appendChild(el('div', {
          text: 'Measures', style: 'padding:7px 14px 4px;font:700 9px/1 "IBM Plex Sans",sans-serif;letter-spacing:.5px;text-transform:uppercase;color:#b3b9c2;border-top:1px solid #eef0f3;margin-top:2px;'
        }));
        t.measures.forEach(function (m) {
          var u = app.msrUse(m.name);
          var row = el('button', {
            cls: 'hv-f5f7f9', title: (m.dax || '').trim(),
            style: 'display:flex;align-items:center;gap:7px;width:100%;text-align:left;height:24px;padding:0 11px 0 14px;border:none;background:transparent;cursor:pointer;'
          });
          row.appendChild(el('span', {
            html: '<span style="display:inline-block;width:4px;height:4px;border-radius:50%;background:#c9a3d6;"></span>',
            style: 'flex:none;width:12px;display:flex;align-items:center;justify-content:center;'
          }));
          row.appendChild(el('span', {
            text: m.name, style: 'flex:1;min-width:0;font:500 11px/1.3 "IBM Plex Mono",monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (m.h ? '#b3b9c2' : '#7c2d92') + ';'
          }));
          if (m.h) row.appendChild(el('span', {
            title: 'Hidden in the model (isHidden)', style: 'flex:none;display:flex;color:#9aa1ad;', html: U.icon('eyeOff', 10)
          }));
          if (u) row.appendChild(el('span', {
            title: app.useTip(u), text: u.length + ' pg',
            style: "flex:none;font:600 8.5px/1 'IBM Plex Mono',monospace;color:#2563eb;background:#f2f7ff;border:1px solid #d4e3fb;border-radius:4px;padding:2px 4px;cursor:help;"
          }));
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            self.pinned.clear();
            app.setState({ viewMode: 'measures', selMeasure: m.name, mvOpen: app.mvOpenFor(m.name), selected: null });
            self.applyHighlight(null, null);
          });
          body.appendChild(row);
        });
      }
      card.appendChild(body);
      card.addEventListener('mouseenter', function () {
        if (!self.isRoot(t.name)) card.style.boxShadow = SHADOW_HOVER;
        lock.style.display = 'flex'; rm.style.display = 'flex';
      });
      card.addEventListener('mouseleave', function () {
        var c = self.cards[t.name];
        if (!self.isRoot(t.name)) card.style.boxShadow = (c && c.ring) || SHADOW_BASE;
        if (self.locked !== t.name) lock.style.display = 'none';
        rm.style.display = 'none';
      });
      world.appendChild(card);
      /* longest unbreakable run in the name — the chip box has to clear it once it scales up */
      var longWord = String(t.name).split(/\s+/).reduce(function (a, w) { return Math.max(a, w.length); }, 0);
      this.cards[t.name] = { el: card, head: head, meta: meta, body: body, caret: caret, lock: lock, rm: rm, nm: nm, src: src, roleEl: role, table: t, expanded: false, colRows: colRows, ring: null, longWord: longWord, dx: 0 };
      this.layoutCard(t.name);
      this.bindCardDrag(t.name);
      head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0'); head.setAttribute('aria-label', 'Select table ' + t.name);
      head.addEventListener('keydown', function (e) { if (e.target !== head) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.focusGraph(t.name); } });
    },

    gp: function (name) { return (this.clusterOn && this.cpos[name]) || this.pos[name]; },
    /* Placing writes styles, measuring reads layout back. They are separate so a pass over
       every card can do all the writes first and all the reads after — one reflow for the
       canvas instead of one per card. */
    _placeCard: function (name) {
      var c = this.cards[name], p = this.gp(name); if (!c || !p) return false;
      var w = this.cardWidthAt(c, this.view.k);
      var dx = (w - this.CARD_W) / 2;                 // a wide chip grows around its anchor
      c.el.style.width = w + 'px';
      c.el.style.left = (p.x - dx) + 'px'; c.el.style.top = p.y + 'px';
      c.w = w; c.dx = dx;
      return true;
    },
    _measureCard: function (name) {
      var c = this.cards[name]; if (!c) return;
      c.h = c.el.offsetHeight; c.headH = c.head.offsetHeight;
    },
    layoutCard: function (name) { if (this._placeCard(name)) this._measureCard(name); },
    /* World-space box of a card. The stored position is the *card* top-left; a chip that had
       to grow for a long name hangs over both sides of it, so edges, hit tests, the overview
       map and Fit all measure through here instead of assuming CARD_W. */
    cardBox: function (name) {
      var c = this.cards[name], p = this.gp(name);
      if (!c || !p) return { x: 0, y: 0, w: this.CARD_W, h: 105 };
      return { x: p.x - (c.dx || 0), y: p.y, w: c.w || this.CARD_W, h: c.h || 105 };
    },
    anchorY: function (name, col) {
      var c = this.cards[name];
      if (c.expanded && col && c.colRows[col]) {
        return this.gp(name).y + c.colRows[col].offsetTop + c.colRows[col].offsetHeight / 2;
      }
      return this.gp(name).y + (c.headH ? c.headH / 2 : 24);
    },

    /* ---------- pan / zoom ---------- */
    bindPanZoom: function (host) {
      var self = this;
      var panning = false, moved = false, sx, sy, ox, oy;
      host.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || e.target.closest('[data-name],button,input,select,a')) return;
        if (e.shiftKey && !self.clusterOn) { self.startMarquee(e); e.preventDefault(); return; }
        panning = true; moved = false; sx = e.clientX; sy = e.clientY; ox = self.view.x; oy = self.view.y;
        host.style.cursor = 'grabbing';
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!panning) return;
        if (Math.hypot(e.clientX - sx, e.clientY - sy) > 4) moved = true;
        if (!moved) return;
        self.view.x = ox + (e.clientX - sx); self.view.y = oy + (e.clientY - sy); self.updateTransform();
      });
      window.addEventListener('mouseup', function (e) {
        if (!panning) return;
        panning = false; host.style.cursor = 'grab';
        if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) <= 4) self.clearSelection();
      });
      window.addEventListener('blur', function () { panning = false; host.style.cursor = 'grab'; });
      host.addEventListener('wheel', function (e) {
        e.preventDefault();
        var rect = host.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var old = self.view.k;
        /* the wheel may go under the floor — that view is for shape, not for reading, and the
           chip metrics stop growing there so nothing outgrows its lane on the way down */
        var k = Math.max(0.1, Math.min(2.2, old * (e.deltaY < 0 ? 1.12 : 0.893)));
        self.view.x = mx - (mx - self.view.x) * (k / old);
        self.view.y = my - (my - self.view.y) * (k / old);
        self.view.k = k; self.updateTransform();
      }, { passive: false });
    },
    updateTransform: function () {
      if (this.world) this.world.style.transform = 'translate(' + this.view.x + 'px,' + this.view.y + 'px) scale(' + this.view.k + ')';
      this.applyLOD();
      this.positionRelPopover();
      if (this.app.explorer) this.app.explorer.drawMap();
      var pct = Math.round(this.view.k * 100) + '%';
      if (pct !== this.app.state.zoomPct) this.app.setState({ zoomPct: pct });
    },
    /* ---------- chips ---------- */
    CHIP_FONT: 22,           /* model-space title size a chip uses at the LOD threshold */
    CHIP_MIN_PX: 11,         /* nothing smaller than this is readable on a screen */
    CHIP_MAX_PX: 13,
    /* The reader's window is 11-13 px, an 18% band, so the model-space font does not have to
       follow the zoom continuously — it only has to land inside that window. Quantising it
       onto a ladder whose ratio is under 13/11 guarantees exactly one rung always fits, and
       turns "every wheel notch restyles every card" into "a restyle only when the rung
       changes". The ladder is anchored on CHIP_FONT, so 22px at the LOD threshold is exact. */
    CHIP_STEP: 1.17,
    /* The floor is shared by Fit and by the chip metrics on purpose. Below it a chip would
       have to keep growing in model space to hold its 11px on screen, which is what made a
       lane cut for zoom A too short for the chip drawn at zoom B. Stopping the growth at one
       agreed zoom makes "the lane and the chip were computed at the same k" true by
       construction for every k under the floor as well. */
    chipFontAt: function (k) {
      var want = this.CHIP_MIN_PX / Math.max(ZOOM_FLOOR, k);     // the smallest legible font here
      var n = Math.ceil(Math.log(want / this.CHIP_FONT) / Math.log(this.CHIP_STEP) - 1e-9);
      /* 1/100 of a px, rounded up: the written value can only ever be larger than the rung,
         never smaller, so the 11px floor survives the string conversion */
      return Math.ceil(this.CHIP_FONT * Math.pow(this.CHIP_STEP, n) * 100) / 100;
    },
    CHIP_LINES: 3,           /* a name wraps over at most this many lines, then it ellipsises */
    CHIP_LEAD: 1.12,         /* line box / font size for the wrapped title */
    CHIP_PAD_Y: 8,           /* head padding above and below the title, at scale 1 */
    CHIP_PAD_X: 11,
    CHIP_MAX_W: 1.3,         /* a chip may be this much wider than a card, never more */
    /* Zoomed-out cards drop to a name-only chip, and the chip is sized for the *reader*, not
       for the model: the title is scaled by 1/zoom so it always lands between 11 and 13 CSS
       pixels once the world transform has been applied. The role badge is dropped once the
       chip has to scale past ~1.25x, because its own text would be well under 9px on screen
       by then and the room it takes is room the name needs to show its first two words.
       Pure arithmetic, no DOM, so the rule can be checked on its own. */
    chipMetrics: function (zoom, longestWord) {
      var raw = Math.max(0.05, Math.min(4, zoom || 1));
      var font = this.chipFontAt(raw);
      var scale = font / this.CHIP_FONT;
      var pad = this.CHIP_PAD_X * scale;
      var badge = scale > 1.25 ? 0 : 32 * scale;
      /* a word cannot be hyphenated, so the box grows when the longest one no longer fits */
      var need = Math.ceil((longestWord || 0) * font * 0.62 + badge + pad * (badge ? 3 : 2.2));
      return { screen: font * raw, font: font, scale: scale, pad: pad, badge: badge,
        lines: this.CHIP_LINES, lead: this.CHIP_LEAD,
        width: Math.max(this.CARD_W, Math.min(Math.round(this.CARD_W * this.CHIP_MAX_W), need)),
        /* the box the renderer actually produces: head padding above and below (at scale)
           plus the fully wrapped title. This is the single card-metric the arrange lanes are
           measured against, so a lane can never be shorter than the chip it has to hold. */
        height: Math.ceil(this.CHIP_PAD_Y * 2 * scale + this.CHIP_LINES * font * this.CHIP_LEAD) };
    },
    ZOOM_FLOOR: ZOOM_FLOOR,
    CHIP_BAND_MIN: ZOOM_FLOOR,
    CHIP_BAND_MAX: 0.7,
    ARRANGE_K0: 0.5,         /* the zoom the first arrange pass sizes its lanes for */
    /* Longest unbreakable run of characters anywhere in the model. A model of short names
       keeps tight lanes; only a model of long ones pays for them. */
    longestWord: function () {
      if (this._longWord != null) return this._longWord;
      var longest = 0;
      ((this.app && this.app.model && this.app.model.tables) || []).forEach(function (t) {
        String(t.name).split(/\s+/).forEach(function (w) { longest = Math.max(longest, w.length); });
      });
      this._longWord = longest;
      return longest;
    },
    /* The model-space box a chip occupies AT ONE ZOOM — not across a band. Sizing a lane for
       the worst case of a whole band is what blew the picture up in step 4: the lanes grew,
       the extent grew, Fit fell below the band, and the chips then drawn were bigger than the
       lanes cut for them. One zoom in, one box out, and the arrange loop feeds it the zoom
       the picture is actually going to be shown at. */
    chipBoxAt: function (k) {
      var m = this.chipMetrics(k, this.longestWord());
      return { w: Math.max(this.CARD_W, m.width), h: Math.max(105, m.height) };
    },
    /* The lane: the chip box at zoom k plus the gutter a reader needs between two names. */
    cellFor: function (k) {
      var b = this.chipBoxAt(k);
      return { w: b.w + this.laneGutterX(k), h: b.h + 12, cw: this.CARD_W, ch: b.h };
    },
    /* Is a picture shown at zoom k one of full cards carrying relationship pills? Chips get the
       12px gutter a reader needs between two names; full cards need room between them for the
       `[ * ◂ 1 ]` pill on the stub that joins them, or every focused star packs its cards a
       gutter apart and the pill has nowhere to sit. Below PILL_ZOOM there is no pill to make
       room for, whatever the detail mode says. */
    cardLanes: function (k) { return !this.chipOn(k) && k >= this.PILL_ZOOM; },
    PILL_ROOM: 14,           /* screen px of clear line the pill wants on each side of it */
    /* Horizontal gutter between two lanes, in world units at zoom k: the pill is a screen-pixel
       size, so the room it needs in the model grows as the zoom drops. */
    laneGutterX: function (k) {
      if (!this.cardLanes(k)) return 12;
      return Math.max(12, Math.ceil((this.PILL_W + 2 * this.PILL_ROOM) / Math.max(this.PILL_ZOOM, k)));
    },
    /* The zoom the positions on the canvas right now were laid out for. Every lane metric
       reads through it, and Fit never zooms out past it — showing a layout smaller than the
       zoom its lanes were cut for is exactly the overlap that was being chased. */
    setLayoutK: function (k) {
      k = Math.max(ZOOM_FLOOR, Math.min(1.25, k || ZOOM_FLOOR));
      if (Math.abs(k - this.layoutK) < 1e-9) return this.layoutK;
      this.layoutK = k; this._bandBox = null;
      return k;
    },
    chipBandBox: function () {
      if (!this._bandBox) this._bandBox = this.chipBoxAt(this.layoutK);
      return this._bandBox;
    },
    chipBandHeight: function () { return this.chipBandBox().h; },
    /* Auto follows the zoom; Names is always a chip, Cards never one. */
    chipOn: function (k) {
      var mode = this.detailMode || 'auto';
      return mode === 'names' ? true : (mode === 'cards' ? false : k < 0.7);
    },
    cardWidthAt: function (c, k) {
      return this.chipOn(k) ? this.chipMetrics(k, c && c.longWord).width : this.CARD_W;
    },
    /* The height the same card would have at zoom k. In chip mode that is arithmetic, not a
       measurement — which is what lets Fit ask about a zoom the cards are not drawn at yet. */
    cardHeightAt: function (c, k) {
      return this.chipOn(k) ? this.chipMetrics(k, c && c.longWord).height : ((c && c.h) || 105);
    },
    /* Re-styles the cards whenever the treatment or the chip's rung changes. The guard is
       the (mode, quantised font) pair, and the font only moves when the ladder rung does, so
       a wheel notch inside one rung costs nothing at all. When it does fire, every style is
       written first and every measurement taken after, so the pass forces one reflow for the
       whole canvas instead of one per card. */
    applyLOD: function () {
      var self = this;
      if (!this.cards) return;
      var chip = this.chipOn(this.view.k);
      var font = chip ? this.chipFontAt(Math.max(0.05, Math.min(4, this.view.k))) : 0;
      if (chip === this._chip && font === this._chipFont) { this.syncEdgeScale(); return; }
      this._chip = chip; this._chipFont = font;
      var names = Object.keys(this.cards);
      names.forEach(function (n) {                     // write pass — no layout reads here
        var c = self.cards[n]; if (!c) return;
        if (chip) {
          var m = self.chipMetrics(self.view.k, c.longWord), s = m.scale;
          var py = (self.CHIP_PAD_Y * s).toFixed(1), px = (self.CHIP_PAD_X * s).toFixed(1);
          c.head.style.padding = py + 'px ' + px + 'px';
          c.head.style.gap = (7 * s).toFixed(1) + 'px';
          c.src.style.display = 'none';
          c.caret.style.display = 'none';
          c.meta.style.display = 'none';
          c.body.style.display = 'none';
          /* -webkit-box + line-clamp is the one wrap that ellipsises the LAST line instead of
             cutting it: the name breaks over up to three lines and only what still does not
             fit is replaced by the ellipsis, so a reader always keeps the opening words. */
          c.nm.style.font = '600 ' + m.font.toFixed(2) + 'px/' + m.lead + ' "IBM Plex Sans",sans-serif';
          c.nm.style.display = '-webkit-box';
          c.nm.style.webkitLineClamp = String(m.lines);
          c.nm.style.webkitBoxOrient = 'vertical';
          c.nm.style.overflow = 'hidden';
          c.nm.style.textOverflow = 'ellipsis';
          c.nm.style.overflowWrap = 'anywhere';
          /* Past 1.25x the badge's own letters are under 9px on screen — unreadable, and the
             room they cost is the room the name needs for its first two words. The role is
             still on the card: a fact carries the colour as a filled head, a dim as a bar. */
          c.roleEl.style.display = m.badge ? '' : 'none';
          c.roleEl.style.font = '700 ' + (13 * s).toFixed(2) + 'px/1 "IBM Plex Mono",monospace';
          c.roleEl.style.padding = (6 * s).toFixed(1) + 'px ' + (7 * s).toFixed(1) + 'px';
          c.roleEl.style.marginTop = (3 * s).toFixed(1) + 'px';
          c.roleEl.style.borderRadius = (4 * s).toFixed(1) + 'px';
        } else {
          c.head.style.padding = '10px 11px 10px 12px';
          c.head.style.gap = '9px';
          c.src.style.display = '-webkit-box';
          c.caret.style.display = 'flex';
          c.meta.style.display = 'flex';
          c.body.style.display = c.expanded ? 'block' : 'none';
          c.nm.style.font = '600 13.5px/1.2 "IBM Plex Sans",sans-serif';
          c.nm.style.display = '';
          c.nm.style.webkitLineClamp = '';
          c.nm.style.overflow = '';
          c.nm.style.textOverflow = '';
          c.nm.style.overflowWrap = '';
          c.roleEl.style.display = '';
          c.roleEl.style.font = '700 8.5px/1 "IBM Plex Mono",monospace';
          c.roleEl.style.padding = '4px 5px';
          c.roleEl.style.marginTop = '1px';
          c.roleEl.style.borderRadius = '4px';
        }
        self._placeCard(n);
      });
      names.forEach(function (n) { self._measureCard(n); });   // read pass — one reflow
      this.queueLines();
    },
    /* Edge widths, arrowheads and pills are sized against the zoom, so a zoom that did not
       change the chip rung still has to redraw them — but only once per wheel notch, and
       however many notches land in one frame, only once per frame. */
    syncEdgeScale: function () {
      if (this._lineK && Math.abs(this.view.k / this._lineK - 1) < 0.11) return;
      this.queueLines();
    },
    /* Edge rebuilds are coalesced onto the next frame: a wheel gesture is a burst of events,
       and only the last zoom of the burst is the one the reader sees. */
    queueLines: function () {
      var self = this;
      if (typeof requestAnimationFrame !== 'function') { this.renderLines(); return; }
      if (this._lineFrame) return;
      this._lineFrame = requestAnimationFrame(function () { self._lineFrame = 0; self.renderLines(); });
    },
    /* Detail level is the user's call, not the zoom's: 'auto' keeps the old
       zoom-driven switch, 'names' and 'cards' pin one treatment at any zoom. */
    setDetailMode: function (m) {
      if ((this.detailMode || 'auto') === m) return;
      this.detailMode = m;
      this._chip = null; this._chipFont = null;
      this.applyLOD();
      store.set('smv-detail', m);
      this.app.render();
    },

    /* Shift + drag on the background draws a box; every table it touches joins the marked set. */
    startMarquee: function (e) {
      var self = this, host = this.host, r = host.getBoundingClientRect();
      var sx = e.clientX, sy = e.clientY, box = el('div', { style: 'position:absolute;z-index:40;pointer-events:none;border:1px dashed ' + EDGE.marked + ';background:rgba(180,88,79,.08);border-radius:3px;display:none;' });
      host.appendChild(box);
      var world = function (cx, cy) { return { x: (cx - r.left - self.view.x) / self.view.k, y: (cy - r.top - self.view.y) / self.view.k }; };
      var mm = function (ev) {
        box.style.display = 'block';
        box.style.left = Math.min(sx, ev.clientX) - r.left + 'px'; box.style.top = Math.min(sy, ev.clientY) - r.top + 'px';
        box.style.width = Math.abs(ev.clientX - sx) + 'px'; box.style.height = Math.abs(ev.clientY - sy) + 'px';
      };
      var done = function () { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); window.removeEventListener('blur', done); if (box.parentNode) box.parentNode.removeChild(box); };
      var mu = function (ev) {
        done();
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) <= 4) return;
        var a = world(sx, sy), b = world(ev.clientX, ev.clientY);
        self.setMarked(Array.from(self.marked).concat(self.tablesInRect(a.x, a.y, b.x, b.y)));
      };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); window.addEventListener('blur', done);
    },

    /* ---------- card drag ---------- */
    bindCardDrag: function (name) {
      var self = this;
      var c = this.cards[name];
      c.head.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        var startX = e.clientX, startY = e.clientY;
        var tgt = self.clusterOn ? self.cpos : self.pos;
        var p0 = { x: self.gp(name).x, y: self.gp(name).y };
        var moved = false;
        c.head.style.cursor = 'grabbing';
        var mm = function (ev) {
          var dx = (ev.clientX - startX) / self.view.k, dy = (ev.clientY - startY) / self.view.k;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
          tgt[name] = { x: p0.x + dx, y: p0.y + dy };
          c.el.style.left = tgt[name].x + 'px'; c.el.style.top = tgt[name].y + 'px';
          self.renderLines();
        };
        var mu = function (ev) {
          window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); window.removeEventListener('blur', cancel);
          c.head.style.cursor = 'grab';
          if (moved) { if (!self.clusterOn) { self.persist(); self.markArranged(); } }
          else if (self.clusterOn) { self.selectTable(name); }
          else if (ev.altKey) { self.toggleMark(name); }
          else if (ev.shiftKey || ev.metaKey || ev.ctrlKey) { self.togglePin(name); }
          /* focusGraph selects on its own, with the viewport it just aimed left alone —
             selecting first would queue a deferred fit that lands on top of that aim */
          else if (self._chip) { self.focusGraph(name); }
          else { self.selectTable(name); }
        };
        var cancel = function () {
          window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); window.removeEventListener('blur', cancel);
          c.head.style.cursor = 'grab';
          if (moved && !self.clusterOn) { self.persist(); self.markArranged(); }
        };
        window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); window.addEventListener('blur', cancel);
      });
      c.head.addEventListener('click', function (e) { e.stopPropagation(); });
    },

    toggleCard: function (name) {
      var c = this.cards[name];
      if (!c.expanded && this._chip) {
        if ((this.detailMode || 'auto') === 'names') this.setDetailMode('cards');
        this.zoomTo(0.75);
      }
      c.expanded = !c.expanded;
      c.body.style.display = (c.expanded && !this._chip) ? 'block' : 'none';
      c.caret.style.transform = c.expanded ? 'rotate(180deg)' : '';
      this.layoutCard(name);
      this.selectTable(name);
      this.renderLines();
    },
    setAllExpanded: function (on) {
      var self = this;
      // expanding while chipped would render 3px column text — zoom to a readable scale first
      if (on && this._chip) {
        if ((this.detailMode || 'auto') === 'names') this.setDetailMode('cards');
        this.zoomTo(0.75);
      }
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n]; c.expanded = on;
        c.body.style.display = (on && !self._chip) ? 'block' : 'none';
        c.caret.style.transform = on ? 'rotate(180deg)' : ''; self.layoutCard(n);
      });
      if (on) {
        if (!this._preExpandPos) this._preExpandPos = JSON.parse(JSON.stringify(this.pos));
        this.spreadForExpanded();
        this.renderLines();
        // no fitView here: fitting the expanded bounds would clamp zoom below the
        // LOD threshold and chip mode would hide the bodies we just opened
      } else {
        if (this._preExpandPos) {
          this.pos = this._preExpandPos; this._preExpandPos = null;
          Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
        }
        this.renderLines();
        this.fitView();
      }
    },
    /* Expanded cards are up to 10x taller than chips, so the star layout has to
       open up around them — collapsing puts every table back where it was. */
    spreadForExpanded: function () {
      var self = this;
      var nodes = Object.keys(this.cards)
        .filter(function (n) { return self.cards[n].el.style.display !== 'none' && self.pos[n]; })
        .map(function (n) { return { p: self.pos[n], h: self.cards[n].h || 128 }; });
      if (nodes.length < 2) return;
      var W = this.CARD_W, GX = 52, GY = 34;
      for (var it = 0; it < 90; it++) {
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            var a = nodes[i], b = nodes[j];
            var dx = a.p.x - b.p.x, dy = (a.p.y + a.h / 2) - (b.p.y + b.h / 2);
            var px = (W + GX) - Math.abs(dx), py = ((a.h + b.h) / 2 + GY) - Math.abs(dy);
            if (px > 0 && py > 0) {
              if (px < py) { var s = (px / 2) * 0.6 * (dx < 0 ? -1 : 1); a.p.x += s; b.p.x -= s; }
              else { var s2 = (py / 2) * 0.6 * (dy < 0 ? -1 : 1); a.p.y += s2; b.p.y -= s2; }
            }
          }
        }
      }
      Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
    },

    /* ---------- focus roots / neighborhood ---------- */
    rootsSet: function () {
      var s = new Set(this.pinned);
      if (this._activeSel) s.add(this._activeSel);
      if (this.locked && this.cards[this.locked]) s.add(this.locked);
      return s;
    },
    isRoot: function (name) { return this._activeSel === name || this.locked === name || this.pinned.has(name); },
    /* BFS from the roots: Map name -> hop distance (0 = root), capped at depth. */
    distMap: function (rootsArr, depth) {
      var ex = this.app.explorer;
      if (ex && window.RelationshipGraph) return window.RelationshipGraph.traverse(this.app.model, rootsArr, {
        direction: ex.direction, maxDepth: ex.depth === 'direct' ? 1 : ex.depth === 'two' ? 2 : Infinity, includeInactive: ex.includeInactive
      }).distances;
      var d = new Map(); rootsArr.forEach(function (n) { d.set(n, 0); });
      var rels = this.app.model.relationships;
      for (var k = 1; k <= depth; k++) {
        var grew = false;
        rels.forEach(function (r) {
          if (d.get(r.from) === k - 1 && !d.has(r.to)) { d.set(r.to, k); grew = true; }
          if (d.get(r.to) === k - 1 && !d.has(r.from)) { d.set(r.from, k); grew = true; }
        });
        if (!grew) break;
      }
      return d;
    },
    neighborhood: function (rootsArr, depth) { return new Set(this.distMap(rootsArr, depth).keys()); },
    /* Edge kind relative to the roots: out / in (touches a root), hop (both ends inside the
       neighbourhood), dim (outside it) or base (nothing focused). */
    edgeKind: function (r, dist) {
      if (!dist) return 'base';
      var dA = dist.get(r.from), dB = dist.get(r.to);
      if (dA == null || dB == null) return 'dim';
      var ex = this.app.explorer;
      if (ex && window.RelationshipGraph) {
        if (!ex.includeInactive && (r.inactive || r.isActive === false)) return 'dim';
        if (ex.direction !== 'connected') {
          // Unknown filter direction cannot establish a path, even between reached tables.
          var raw = r.crossFilteringBehavior;
          if (raw != null && raw !== '' && !['onedirection','bothdirections','1','2'].includes(String(raw).toLowerCase())) return 'dim';
        }
      }
      if (dA === 0) return 'out';
      if (dB === 0) return 'in';
      if (dA != null && dB != null) return 'hop';
      return 'dim';
    },
    /* Lock = a focus that survives clicks on the background and on other tables. One at a time. */
    toggleLock: function (name) {
      var self = this;
      if (this.locked === name) {
        this.locked = null;
        this.app.setState({}, function () { self.applyHighlight(); if (self.app.state.isolate) self.fitView(); });
        return;
      }
      var prev = this.locked; this.locked = name;
      if (prev && this.cards[prev]) this.cards[prev].lock.style.display = 'none';
      this.app.setState({ selected: name, activeFilter: null, msrQuery: '', expandedMeasure: null }, function () {
        self.applyHighlight(name, null);
        if (self.app.state.isolate) self.fitView();
      });
    },
    unlock: function () { if (this.locked) this.toggleLock(this.locked); },
    togglePin: function (name) {
      if (this.pinned.has(name)) this.pinned.delete(name); else this.pinned.add(name);
      this.applyHighlight();
      if (this.app.state.isolate) this.fitView();
    },

    /* ---------- relationship lines ---------- */
    /* Which sides the edge leaves / enters. adir = side of A (+1 right, -1 left),
       bdir = side of B. Z-shape when the cards sit apart horizontally, C-shape (both
       on the same side) when they overlap in x. */
    routeOf: function (r) {
      var a = r.from, b = r.to;
      var ca = this.cardBox(a);
      var cb = this.cardBox(b);
      var ay = this.anchorY(a, r.fromCol);
      var by = this.anchorY(b, r.toCol);
      var gapRight = cb.x - (ca.x + ca.w);
      var gapLeft = ca.x - (cb.x + cb.w);
      var MIN = 36;
      var ax, bx, adir, bdir;
      if (gapRight >= MIN || (gapRight >= gapLeft && gapRight >= 0)) { ax = ca.x + ca.w; bx = cb.x; adir = 1; bdir = -1; }
      else if (gapLeft >= 0) { ax = ca.x; bx = cb.x + cb.w; adir = -1; bdir = 1; }
      else {
        /* overlapping columns: hook around on the side with more room */
        var midA = ca.x + ca.w / 2, midB = cb.x + cb.w / 2;
        if (midA + midB >= 2 * ((ca.x + cb.x) / 2)) { ax = ca.x + ca.w; bx = cb.x + cb.w; adir = 1; bdir = 1; }
        else { ax = ca.x; bx = cb.x; adir = -1; bdir = -1; }
        if (Math.abs(ay - by) < 30) { ax = ca.x + ca.w; bx = cb.x + cb.w; adir = 1; bdir = 1; }
      }
      return { ax: ax, ay: ay, bx: bx, by: by, dir: adir, adir: adir, bdir: bdir, a: a, b: b };
    },
    bezierPath: function (ax, ay, bx, by, adir, bdir) {
      if (bdir == null) bdir = -adir;
      var dx = Math.abs(bx - ax);
      var cp = adir === bdir ? 70 : Math.max(46, Math.min(190, dx * 0.5));
      return 'M ' + ax.toFixed(1) + ' ' + ay.toFixed(1) + ' C ' + (ax + adir * cp).toFixed(1) + ' ' + ay.toFixed(1) + ', ' +
        (bx + bdir * cp).toFixed(1) + ' ' + by.toFixed(1) + ', ' + bx.toFixed(1) + ' ' + by.toFixed(1);
    },
    /* Orthogonal polyline with rounded corners: out of A, along a vertical channel, into B. */
    orthoPath: function (pts, rad) {
      var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        var l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        var r = Math.min(rad, l1 / 2, l2 / 2);
        if (r < 0.5) { d += ' L ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1); continue; }
        var ux = (p1.x - p0.x) / l1, uy = (p1.y - p0.y) / l1, vx = (p2.x - p1.x) / l2, vy = (p2.y - p1.y) / l2;
        d += ' L ' + (p1.x - ux * r).toFixed(1) + ' ' + (p1.y - uy * r).toFixed(1) +
          ' Q ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + ' ' + (p1.x + vx * r).toFixed(1) + ' ' + (p1.y + vy * r).toFixed(1);
      }
      var e = pts[pts.length - 1];
      return d + ' L ' + e.x.toFixed(1) + ' ' + e.y.toFixed(1);
    },
    /* Channel x for the vertical run; `spread` nudges parallel edges apart. */
    channelX: function (g0, spread, rects) {
      var STUB = 22;
      var lo, hi, base;
      if (g0.adir !== g0.bdir) {
        lo = Math.min(g0.ax, g0.bx) + STUB; hi = Math.max(g0.ax, g0.bx) - STUB;
        base = (g0.ax + g0.bx) / 2 + (spread || 0);
      } else {
        base = g0.adir > 0 ? Math.max(g0.ax, g0.bx) + 40 + (spread || 0) : Math.min(g0.ax, g0.bx) - 40 - (spread || 0);
        lo = base - 60; hi = base + 60;
      }
      if (lo > hi) { var m = (lo + hi) / 2; lo = m; hi = m; }
      var clamp = function (x) { return Math.max(lo, Math.min(hi, x)); };
      if (!rects) return clamp(base);
      var y0 = Math.min(g0.ay, g0.by), y1 = Math.max(g0.ay, g0.by);
      var cuts = function (x) {
        for (var i = 0; i < rects.length; i++) {
          var R = rects[i];
          if (R.name === g0.a || R.name === g0.b) continue;
          if (x > R.x0 && x < R.x1 && y1 > R.y0 && y0 < R.y1) return true;
        }
        return false;
      };
      var offs = [0, -26, 26, -52, 52, -78, 78, -104, 104];
      for (var k = 0; k < offs.length; k++) {
        var x = clamp(base + offs[k]);
        if (!cuts(x)) return x;
      }
      return clamp(base);
    },
    /* Path + candidate label spots for one edge in the current line style. `bare` picks the
       label the seats are cut for — the combined pill, or the bare arrow it falls back to —
       and is stamped on every seat so the box reserved later is the box that gets drawn. */
    edgeGeom: function (g0, spread, slot, rects, bare) {
      bare = bare == null ? this.view.k < this.PILL_ZOOM : !!bare;
      if (this.lineStyle === 'curve') {
        var cp = g0.adir === g0.bdir ? 70 : Math.max(46, Math.min(190, Math.abs(g0.bx - g0.ax) * 0.5));
        var p1x = g0.ax + g0.adir * cp, p2x = g0.bx + g0.bdir * cp;
        var B = function (t) {
          var u = 1 - t;
          /* tangent points towards B; table A lies the other way */
          var tx = 3 * u * u * (p1x - g0.ax) + 6 * u * t * (p2x - p1x) + 3 * t * t * (g0.bx - p2x);
          var ty = 6 * u * t * (g0.by - g0.ay);
          var vert = Math.abs(ty) > Math.abs(tx);
          return { x: u * u * u * g0.ax + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * g0.bx,
                   y: u * u * u * g0.ay + 3 * u * u * t * g0.ay + 3 * u * t * t * g0.by + t * t * t * g0.by,
                   orient: vert ? 'v' : 'h', toA: vert ? (ty > 0 ? -1 : 1) : (tx > 0 ? -1 : 1), bare: bare };
        };
        return { d: this.bezierPath(g0.ax, g0.ay, g0.bx, g0.by, g0.adir, g0.bdir), spots: [B(0.5), B(0.35), B(0.65), B(0.2), B(0.8)] };
      }
      var cx = this.channelX(g0, spread, rects);
      var pts = [{ x: g0.ax, y: g0.ay }, { x: cx, y: g0.by === g0.ay ? g0.ay : g0.ay }, { x: cx, y: g0.by }, { x: g0.bx, y: g0.by }];
      /* Seats are measured against the label actually drawn: its length along the line plus
         a reader's margin either side. Both are screen-pixel sizes (hence world units through
         labelDims), so a run that can carry the pill at one zoom carries it at every zoom. */
      var L = this.labelDims(bare), Lw = L.w, M = L.m, need = Lw + 2 * M;
      var spots = [];
      var seat = function (x, y, orient, toA) { return { x: x, y: y, orient: orient, toA: toA, bare: bare }; };
      var vlen = Math.abs(g0.by - g0.ay);
      /* on the vertical run the pill stands upright; toA says which way table A lies */
      var vToA = g0.ay > g0.by ? 1 : -1;
      if (vlen >= need) {
        /* stagger labels that share a channel along the vertical run so they never stack */
        var lo = Math.min(g0.ay, g0.by) + Lw / 2 + M, hi = Math.max(g0.ay, g0.by) - Lw / 2 - M;
        var y0 = (g0.ay + g0.by) / 2 + (slot || 0) * (Lw + 1.7 * M);
        spots.push(seat(cx, Math.max(lo, Math.min(hi, y0)), 'v', vToA));
        /* then walk the run both ways from the middle: a long channel in a dense picture
           brushes several cards, and the gap between two of them is where the pill fits */
        [0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.22, 0.78].forEach(function (t) { spots.push(seat(cx, Math.max(lo, Math.min(hi, Math.min(g0.ay, g0.by) + vlen * t)), 'v', vToA)); });
      }
      /* Horizontal runs only when the line actually crosses from one side to the other.
         On a C-shaped hook both cards sit on the same side of the channel, so a left/right
         arrow there points at the bend, not at a table — which reads as the wrong direction. */
      var zShape = g0.adir !== g0.bdir;
      if (zShape) {
        var hA = Math.abs(cx - g0.ax), hB = Math.abs(g0.bx - cx);
        [0.5, 0.35, 0.65].forEach(function (t) {
          if (hA >= need) spots.push(seat(g0.ax + (cx - g0.ax) * t, g0.ay, 'h', g0.ax > cx ? 1 : -1));
          if (hB >= need) spots.push(seat(cx + (g0.bx - cx) * t, g0.by, 'h', cx > g0.bx ? 1 : -1));
        });
      }
      /* a short vertical run still beats the fallback: the label overhangs the bends a little */
      if (vlen >= Lw * 0.6 && vlen < need) spots.push(seat(cx, (g0.ay + g0.by) / 2, 'v', vToA));
      if (!spots.length) spots.push(zShape
        ? seat(cx, (g0.ay + g0.by) / 2, 'h', g0.ax > g0.bx ? 1 : -1)
        : seat(cx, (g0.ay + g0.by) / 2, 'v', vToA));
      return { d: this.orthoPath(pts, 9), spots: spots };
    },
    /* Visible card rectangles in world space, slightly inflated. */
    cardRects: function () {
      var self = this, out = [];
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n]; if (c.el.style.display === 'none') return;
        var b = self.cardBox(n); out.push({ name: n, x0: b.x - 6, y0: b.y - 6, x1: b.x + b.w + 6, y1: b.y + b.h + 6 });
      });
      return out;
    },
    /* World units per screen pixel of label. Labels are sized for the reader, not the model:
       like the bare arrow they are drawn in screen pixels and scaled by 1/zoom, so the pill is
       the same size on screen whether the picture is at 50% or 200%. The chip view thickens
       its lines and the label follows a little — not the full 1.6x the chip strokes take,
       because the label already holds its on-screen size and a 30px pill beside an 11px
       table name would be the loudest thing on the canvas. */
    labelUnit: function () { return (this._chip ? 1.12 : 1) / Math.max(0.05, this.view.k); },
    /* The label an edge carries, horizontal, in world units: the combined cardinality pill,
       or (`bare`) the arrowhead on its own — below PILL_ZOOM always, above it when no run of
       the line has room for the pill. `m` is the margin a seat has to leave on each side.
       Seat eligibility, the stagger along a shared channel and the collision ledger all read
       through here, so the box that is reserved is always the box that is drawn. */
    labelDims: function (bare) {
      var u = this.labelUnit();
      if (bare == null) bare = this.view.k < this.PILL_ZOOM;
      if (!bare) return { w: this.PILL_W * u, h: this.PILL_H * u, m: 10 * u };
      return { w: 16 * u, h: 12 * u, m: 6 * u };
    },
    /* Collision box of the label at a seat: the pill reads along the line, so on a vertical
       run it stands tall and narrow. The seat says which label it was cut for. */
    pillBox: function (sp) {
      var d = this.labelDims(sp.bare);
      return sp.orient === 'v' ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
    },
    /* First seat whose box clears every rect. When none does, the seat that overlaps least is
       used anyway — unless `strict`, which lets the caller try a smaller label instead. */
    pickSpot: function (spots, rects, strict) {
      var best = null, bestArea = Infinity;
      for (var i = 0; i < spots.length; i++) {
        var sp = spots[i], bx = this.pillBox(sp), area = 0;
        for (var j = 0; j < rects.length; j++) {
          var R = rects[j];
          var ox = Math.min(sp.x + bx.w / 2, R.x1) - Math.max(sp.x - bx.w / 2, R.x0);
          var oy = Math.min(sp.y + bx.h / 2, R.y1) - Math.max(sp.y - bx.h / 2, R.y0);
          if (ox > 0 && oy > 0) area += ox * oy;
        }
        if (area === 0) return sp;
        if (area < bestArea) { bestArea = area; best = sp; }
      }
      return strict ? null : best;
    },
    /* Screen-pixel size of the pill: `[ * ◂ 1 ]` — a cardinality glyph, the filter arrowhead,
       the other glyph. PILL_SIDE is how far from the centre each glyph sits. */
    PILL_W: 50, PILL_H: 20, PILL_SIDE: 16,
    PILL_ZOOM: 0.5,          /* below this the cardinality glyphs are noise, the arrow is not */
    /* Filter direction is the one thing an edge must say at every zoom, so the arrowhead is
       drawn on the line itself and sized in screen pixels: 6px wherever the zoom sits. The
       filter flows to -> from, i.e. towards table A; a bidirectional edge gets both heads. */
    ARROW_PX: 6,
    edgeArrow: function (r, spot, col, op, boost) {
      var L = this.ARROW_PX / Math.max(0.05, this.view.k) * (boost || 1);
      var vert = spot.orient === 'v', toA = spot.toA || 1;
      var ux = vert ? 0 : 1, uy = vert ? 1 : 0;     /* axis along the line */
      var px = vert ? 1 : 0, py = vert ? 0 : 1;     /* across the line */
      var g = sv('g', { transform: 'translate(' + spot.x.toFixed(1) + ',' + spot.y.toFixed(1) + ')', opacity: op, style: 'pointer-events:none;' });
      var arrow = sv('g', { stroke: col, 'stroke-width': (L * 0.28).toFixed(2), 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' });
      var head = function (sign) {
        var tx = ux * L * 0.5 * sign, ty = uy * L * 0.5 * sign;
        var bx = tx - ux * L * 0.62 * sign, by = ty - uy * L * 0.62 * sign;
        var hw = L * 0.42;
        return sv('polyline', { points: (bx + px * hw).toFixed(1) + ',' + (by + py * hw).toFixed(1) + ' ' + tx.toFixed(1) + ',' + ty.toFixed(1) + ' ' + (bx - px * hw).toFixed(1) + ',' + (by - py * hw).toFixed(1) });
      };
      arrow.appendChild(head(toA));
      if (r.both) arrow.appendChild(head(-toA));
      g.appendChild(arrow);
      return g;
    },
    /* The one label an edge carries once the zoom can hold it: `[ * ◂ 1 ]`. Each end's
       cardinality sits on the side of the pill its table lies on, and the filter arrowhead
       between them points the way the filter flows — to -> from, i.e. towards table A, exactly
       as the bare arrow does; a bidirectional edge gets a head each way. Putting both glyphs
       and the arrow in one pill is what fixes the stacking: four edges leaving one table used
       to want the same seats for their end pills and ended up on top of each other, reading as
       two asterisks instead of four. One label per edge means one seat per edge.
       Built in screen pixels and scaled by 1/zoom like the arrow. On a vertical run the pill
       stands upright — the glyphs stack and the head points up or down; text never rotates. */
    edgeGlyph: function (r, spot, col, op, filled, heavy) {
      var u = this.labelUnit();
      var vert = spot.orient === 'v', toA = spot.toA || 1;
      var W = this.PILL_W, H = this.PILL_H, SIDE = this.PILL_SIDE;
      var g = sv('g', { transform: 'translate(' + spot.x.toFixed(1) + ',' + spot.y.toFixed(1) + ') scale(' + u.toFixed(4) + ')', opacity: op, style: 'pointer-events:none;' });
      g.appendChild(sv('rect', {
        x: -(vert ? H : W) / 2, y: -(vert ? W : H) / 2, width: vert ? H : W, height: vert ? W : H, rx: H / 2,
        fill: filled ? col : '#fff', stroke: col, 'stroke-width': heavy ? 1.7 : 1.3,
        'stroke-dasharray': r.inactive ? '3 2.5' : null
      }));
      var ink = filled ? '#fff' : col;
      /* `s` is a distance along the line, positive towards table A */
      var along = function (s) { return 'translate(' + (vert ? 0 : s).toFixed(1) + ',' + (vert ? s : 0).toFixed(1) + ')'; };
      var glyph = function (ch, s) {
        var holder = sv('g', { transform: along(s) });
        if (ch === '1') {
          var t = sv('text', {
            x: 0, y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: ink,
            style: 'font:700 11.5px "IBM Plex Sans",sans-serif;'
          });
          t.textContent = '1'; holder.appendChild(t);
        } else {
          var star = sv('g', { stroke: ink, 'stroke-width': 1.7, 'stroke-linecap': 'round' });
          [90, 30, 150].forEach(function (deg) {
            var a = deg * Math.PI / 180, dx = Math.cos(a) * 4, dy = Math.sin(a) * 4;
            star.appendChild(sv('line', { x1: -dx, y1: -dy, x2: dx, y2: dy }));
          });
          holder.appendChild(star);
        }
        return holder;
      };
      g.appendChild(glyph(r.fromCard === 'one' ? '1' : '*', toA * SIDE));
      g.appendChild(glyph(r.toCard === 'many' ? '*' : '1', -toA * SIDE));
      /* a filled head, as long as the bare arrow; `off` shifts it off centre for the pair */
      var L = this.ARROW_PX;
      var head = function (sign, off) {
        var hw = 3.6, tip = off + sign * L / 2, base = off - sign * L / 2;
        var pts = vert ? [[hw, base], [0, tip], [-hw, base]] : [[base, hw], [tip, 0], [base, -hw]];
        return sv('polyline', {
          points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
          fill: ink, stroke: ink, 'stroke-width': 1, 'stroke-linejoin': 'round'
        });
      };
      if (r.both) { g.appendChild(head(toA, toA * 3.6)); g.appendChild(head(-toA, -toA * 3.6)); }
      else g.appendChild(head(toA, 0));
      return g;
    },
    relTip: function (r) {
      var cd = (r.fromCard === 'one' ? '1' : '*') + ' : ' + (r.toCard === 'many' ? '*' : '1');
      var dirTxt = r.both ? '⇄ both directions' : ('filter: ' + U.esc(r.to) + ' → ' + U.esc(r.from));
      var flags = r.inactive ? ' · <span style="color:#fca5a5">inactive</span>' : '';
      return '<b>' + U.esc(r.from) + '</b>.' + U.esc(r.fromCol) + ' → <b>' + U.esc(r.to) + '</b>.' + U.esc(r.toCol) + '<br><span style="color:#aeb6c4">' + cd + ' · ' + dirTxt + flags + '</span>';
    },
    setLineStyle: function (m) {
      if (this.lineStyle === m) return;
      this.lineStyle = m; store.set('smv-lines', m);
      this.renderLines(); this.app.render(true);
    },
    renderLines: function () {
      var self = this;
      if (!this.svg) return;
      if (this.clusterOn) { this.clusterLines(); return; }
      U.clear(this.svg);
      var roots = this.rootsSet(); var showSA = this.showSA; var isoSet = this._isoSet;
      var model = this.app.model;
      var dist = roots.size ? this.distMap(Array.from(roots), this.app.state.focusDepth || 1) : null;
      var order = { dim: 0, base: 0, hop: 1, in: 2, out: 3 };
      var list = model.relationships.map(function (r, i) { return { r: r, i: i, k: self.edgeKind(r, dist) }; });
      this._relSpots = {};
      list.sort(function (A, B) { return order[A.k] - order[B.k]; });
      var chip = this._chip;
      /* visible edges only; then nudge edges that share a vertical channel apart */
      var vis = [];
      list.forEach(function (item) {
        var r = item.r;
        var ta = model.byName[r.from], tb = model.byName[r.to];
        if (!self.cards[r.from] || !self.cards[r.to]) return;
        if (self.workspaceNames && (!self.workspaceNames.has(r.from) || !self.workspaceNames.has(r.to))) return;
        if (isoSet && (!isoSet.has(r.from) || !isoSet.has(r.to))) return;
        if (!showSA && (ta.relCount === 0 || tb.relCount === 0)) return;
        item.g0 = self.routeOf(r); item.spread = 0; item.slot = 0;
        vis.push(item);
      });
      if (this.lineStyle !== 'curve') {
        var buckets = {};
        vis.forEach(function (item) {
          var key = Math.round(self.channelX(item.g0, 0) / 28);
          (buckets[key] = buckets[key] || []).push(item);
        });
        Object.keys(buckets).forEach(function (k) {
          var arr = buckets[k]; if (arr.length < 2) return;
          arr.sort(function (A, B) { return (A.g0.ay + A.g0.by) - (B.g0.ay + B.g0.by); });
          arr.forEach(function (item, i) { item.spread = (i - (arr.length - 1) / 2) * 14; item.slot = i - (arr.length - 1) / 2; });
        });
      }
      var rects = this.cardRects();
      var placed = [];
      vis.forEach(function (item) {
        var r = item.r, kind = item.k;
        var g0 = item.g0;
        var geom = self.edgeGeom(g0, item.spread, item.slot, rects);
        var d = geom.d;
        var isSel = self.selRel === r;
        var active = kind === 'out' || kind === 'in';
        var hop = kind === 'hop', dim = kind === 'dim' && !isSel;
        var col = isSel ? EDGE.lock : (EDGE[kind] || EDGE.base);
        /* every line has to stay at least a pixel wide on screen, whatever the zoom is;
           the focused ones are drawn heavier so the selection reads at a glance */
        var thin = Math.max(1.15, isSel ? 2.6 : (active ? 2.1 : (hop ? 1.8 : 1.15))) / self.view.k;
        var baseW = Math.max(thin, isSel ? (chip ? 4.4 : 3.4) : (active ? (chip ? 3.4 : 2.6) : (hop ? (chip ? 2.8 : 2) : (chip ? 2.2 : 1.4))));
        if (active || hop || isSel) {
          self.svg.appendChild(sv('path', { d: d, fill: 'none', stroke: '#fff', 'stroke-width': baseW * 2.1, 'stroke-linecap': 'round', opacity: 0.95 }));
        }
        var path = sv('path', { d: d, fill: 'none', stroke: col, 'stroke-width': baseW, 'stroke-linecap': 'round', style: 'pointer-events:none;' });
        if (r.inactive) path.setAttribute('stroke-dasharray', (baseW * 1.9).toFixed(1) + ' ' + (baseW * 1.6).toFixed(1));
        var baseOp = dim ? 0.12 : ((active || isSel) ? 1 : (hop ? 0.9 : (r.inactive ? (chip ? 0.68 : 0.6) : (chip ? 0.82 : 0.72))));
        path.setAttribute('opacity', baseOp);
        self.svg.appendChild(path);
        var op = dim ? 0.12 : 1;
        var dot = Math.max(2.6 / self.view.k, active || isSel ? 3.4 : 2.6);
        self.svg.appendChild(sv('circle', { cx: g0.ax, cy: g0.ay, r: dot, fill: col, opacity: op }));
        self.svg.appendChild(sv('circle', { cx: g0.bx, cy: g0.by, r: dot * 1.18, fill: '#fff', stroke: col, 'stroke-width': Math.max(1.6 / self.view.k, active || isSel ? 2 : 1.6), opacity: op }));
        /* a wide invisible stroke is the click / hover target — the visible line is thin */
        var hit = sv('path', { d: d, fill: 'none', stroke: 'rgba(0,0,0,0)', 'stroke-width': Math.max(chip ? 22 : 16, 16 / self.view.k), 'stroke-linecap': 'round', style: 'pointer-events:stroke;cursor:pointer;' });
        var hoverOn = function (e) {
          if (!isSel) { path.setAttribute('stroke-width', baseW + 1); path.setAttribute('stroke', active || hop ? col : EDGE.out); path.setAttribute('opacity', 1); }
          if (self.selRel !== r) self.showTip(self.relTip(r) + '<br><span style="color:#8b93a2">click for details</span>', e);
        };
        var hoverOff = function () {
          if (!isSel) { path.setAttribute('stroke-width', baseW); path.setAttribute('stroke', col); path.setAttribute('opacity', baseOp); }
          self.hideTip();
        };
        var bind = function (node) {
          node.addEventListener('mouseenter', hoverOn);
          node.addEventListener('mousemove', function (e) { self.moveTip(e); });
          node.addEventListener('mouseleave', hoverOff);
          node.addEventListener('mousedown', function (e) { e.stopPropagation(); });
          node.addEventListener('click', function (e) { e.stopPropagation(); self.hideTip(); self.selectRel(self.selRel === r ? null : r); });
        };
        bind(hit);
        item.hit = hit;
        if (!dim) {
          var ink = kind === 'base' && !isSel ? '#7d8593' : col;
          var op2 = active || hop || isSel ? 1 : (chip ? 0.95 : 0.85);
          /* One label per edge, through one seat picker and one `placed` ledger, so it can
             never land on a card or on another edge's label. Above PILL_ZOOM it is the
             combined cardinality pill — where the line has a run long enough to carry it;
             a line boxed in by its cards (the focused star packs them a gutter apart) drops
             to the bare filter arrow rather than hide a pill under a card. Below PILL_ZOOM
             the arrow is all there is, and it is never dropped: it is what tells the reader
             which way the relationship points, and at 30% zoom it is the only label left. */
          var taken = rects.concat(placed);
          var spot = self.pickSpot(geom.spots, taken, true);
          if (!spot) {
            /* the arrow's seats; if even those are boxed in, keeping clear of the other labels
               matters more than the card inflation — an arrow drawn over a pill reads as a
               second head on it, an arrow a few pixels into a chip's margin is still an arrow */
            var bareSpots = self.edgeGeom(g0, item.spread, item.slot, rects, true).spots;
            spot = self.pickSpot(bareSpots, taken, true) || self.pickSpot(bareSpots, placed);
          }
          var bx = self.pillBox(spot), pad = 4 * self.labelUnit();
          placed.push({ x0: spot.x - bx.w / 2 - pad, y0: spot.y - bx.h / 2 - pad, x1: spot.x + bx.w / 2 + pad, y1: spot.y + bx.h / 2 + pad });
          self._relSpots[item.i] = spot;
          item.arrow = spot.bare
            ? self.edgeArrow(r, spot, ink, op2, isSel || active ? 1.15 : 1)
            : self.edgeGlyph(r, spot, ink, op2, isSel, active);
          item.arrow.style.pointerEvents = 'auto'; item.arrow.style.cursor = 'pointer';
          bind(item.arrow);
        }
      });
      /* hit strokes above the lines, labels on top so a crossing line never cuts one */
      vis.forEach(function (item) { if (item.hit) self.svg.appendChild(item.hit); });
      vis.forEach(function (item) { if (item.arrow) self.svg.appendChild(item.arrow); });
      this._lineK = this.view.k;
      this.positionRelPopover();
      if (this.app.explorer) this.app.explorer.drawMap();
    },
    applyVisibility: function (show) {
      if (show !== undefined) this.showSA = show;
      this.refreshVisibility();
    },
    refreshVisibility: function () {
      var self = this;
      if (this.clusterOn) {
        Object.keys(this.cards).forEach(function (n) {
          var c = self.cards[n];
          c.el.style.display = self.expandedGroups.has(self.groupKeyOf(c.table)) ? '' : 'none';
        });
        return;
      }
      var roots = this.rootsSet();
      var iso = this.app.state.isolate && roots.size > 0;
      var visSet = iso ? this.neighborhood([].concat(Array.from(roots)), this.app.state.focusDepth || 1) : null;
      this._isoSet = visSet;
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n];
        var vis = true;
        if (iso) vis = visSet.has(c.table.name);
        else if (c.table.relCount === 0) vis = self.showSA;
        if (self.workspaceNames && !self.workspaceNames.has(n)) vis = false;
        c.el.style.display = vis ? '' : 'none';
      });
    },
    showTip: function (html, e) { this.tip.innerHTML = html; this.tip.style.display = 'block'; this.moveTip(e); },
    moveTip: function (e) { var r = this.host.getBoundingClientRect(); this.tip.style.left = (e.clientX - r.left + 14) + 'px'; this.tip.style.top = (e.clientY - r.top + 14) + 'px'; },
    hideTip: function () { this.tip.style.display = 'none'; },

    /* ---------- color / selection ---------- */
    /* Facts read as the heavy nodes: solid color header, inverted badge. Dims stay light. */
    recolor: function () {
      var self = this, app = this.app, vivid = app.paletteName === 'vivid';
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n];
        var t = c.table; var col = app.tableColor(t); var fact = app.isFact(t);
        var head = c.head, role = c.roleEl, caretSvg = c.caret.firstChild;
        if (c.rm) c.rm.style.color = fact ? 'rgba(255,255,255,.85)' : '#6b7280';
        head.style.boxShadow = 'none';
        if (fact && vivid) {
          head.style.borderLeftColor = 'transparent';
          head.style.background = col;
          c.nm.style.color = '#fff';
          role.style.background = 'rgba(255,255,255,.94)'; role.style.color = col;
          c.el.style.borderColor = tint(col, 0.55);
          if (caretSvg) caretSvg.setAttribute('stroke', 'rgba(255,255,255,.78)');
          if (c.src) c.src.style.color = 'rgba(255,255,255,.85)';
        } else if (fact) {
          head.style.borderLeftColor = col;
          head.style.background = mixHex('#1d2330', col, 0.26);
          c.nm.style.color = '#fff';
          role.style.background = col; role.style.color = '#fff';
          c.el.style.borderColor = tint(col, 0.6);
          if (caretSvg) caretSvg.setAttribute('stroke', 'rgba(255,255,255,.78)');
          if (c.src) c.src.style.color = 'rgba(255,255,255,.85)';
        } else {
          head.style.borderLeftColor = col;
          head.style.background = tint(col, vivid ? 0.07 : 0.1);
          c.nm.style.color = '#1f2430';
          role.style.background = col; role.style.color = '#fff';
          c.el.style.borderColor = vivid ? '#e4e7ec' : tint(col, 0.35);
          if (caretSvg) caretSvg.setAttribute('stroke', '#b0b6c0');
          if (c.src) c.src.style.color = app.srcMeta(t).color;
        }
      });
    },
    /* ---------- relationship selection + sticky info card ---------- */
    relIndex: function (r) { return this.app.model.relationships.indexOf(r); },
    cardText: function (r) {
      var a = r.fromCard === 'one' ? 'One' : 'Many', b = r.toCard === 'many' ? 'many' : 'one';
      return a + ' to ' + b + ' (' + (r.fromCard === 'one' ? '1' : '*') + ' : ' + (r.toCard === 'many' ? '*' : '1') + ')';
    },
    selectRel: function (r) {
      this.selRel = r || null;
      this.renderLines();
      if (r) this.showRelPopover(r); else this.hideRelPopover();
      this.app.render();
    },
    showRelPopover: function (r) {
      var self = this, app = this.app, pop = this.relPop; if (!pop) return;
      U.clear(pop);
      var tf = app.model.byName[r.from], tt = app.model.byName[r.to];
      var rmap = { fact: 'FACT', dim: 'DIM', helper: 'HLP', calcgroup: 'CG', fieldparam: 'FP', measures: 'M' };
      var tableRow = function (t, colName, card, label) {
        var col = app.tableColor(t);
        var row = el('button', {
          cls: 'hv-f5f7f9', title: 'Focus ' + t.name,
          onClick: function () { app.focusTable(t.name); },
          style: 'display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;cursor:pointer;'
        });
        row.appendChild(el('span', { text: rmap[t.role] || 'TBL', style: 'font:700 8.5px/1 "IBM Plex Mono",monospace;letter-spacing:.4px;padding:4px 5px;border-radius:4px;color:#fff;background:' + col + ';flex:none;' }));
        row.appendChild(el('span', { style: 'flex:1;min-width:0;' }, [
          el('span', { style: 'display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#9aa1ad;font-weight:600;', text: label }),
          el('span', { style: 'display:block;font-size:12.5px;font-weight:600;color:#1f2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: t.name }),
          el('span', { style: 'display:block;font:500 10.5px/1.3 "IBM Plex Mono",monospace;color:#5b6472;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;', text: colName })
        ]));
        row.appendChild(el('span', { text: card, style: 'flex:none;width:24px;height:24px;border-radius:7px;background:#eef0f3;color:#1f2430;font:700 13px/24px "IBM Plex Sans",sans-serif;text-align:center;' }));
        return row;
      };
      var head = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:9px 10px 8px 12px;background:#1f2430;color:#fff;' }, [
        el('span', { style: 'font-size:10px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;color:#c9ced8;flex:1;', text: 'Relationship' }),
        r.inactive ? el('span', { text: 'inactive', style: 'font:600 9.5px/1 "IBM Plex Sans",sans-serif;padding:4px 6px;border-radius:5px;background:#fca5a5;color:#7f1d1d;' }) : null,
        el('button', {
          text: '×', title: 'Close (Esc)', onClick: function () { self.selectRel(null); },
          style: 'width:22px;height:22px;border:none;background:rgba(255,255,255,.14);color:#fff;border-radius:6px;cursor:pointer;font-size:14px;line-height:1;flex:none;'
        })
      ]);
      pop.appendChild(head);
      pop.appendChild(tableRow(tf, r.fromCol, r.fromCard === 'one' ? '1' : '*', 'from'));
      var dirTxt = r.both ? 'Both directions — each table filters the other' : (r.to + ' filters ' + r.from);
      pop.appendChild(el('div', { style: 'margin:0 12px;padding:7px 10px;background:#f4f6f9;border-radius:8px;display:flex;flex-direction:column;gap:3px;' }, [
        el('div', { style: 'display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#1f2430;white-space:nowrap;' }, [
          el('span', { text: self.cardText(r), style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;' }),
          el('span', { style: 'flex:1;' }),
          el('span', { text: r.both ? '⇄' : '→', style: 'font-size:14px;color:#5b6472;' })
        ]),
        el('div', { style: 'font-size:11px;color:#5b6472;line-height:1.4;', text: dirTxt })
      ]));
      pop.appendChild(tableRow(tt, r.toCol, r.toCard === 'many' ? '*' : '1', 'to'));
      pop.appendChild(el('div', { style: 'padding:6px 12px 9px;font-size:10px;color:#9aa1ad;', text: 'Click a table to focus it · Esc closes' }));
      pop.style.display = 'block';
      this.positionRelPopover();
    },
    hideRelPopover: function () { if (this.relPop) this.relPop.style.display = 'none'; },
    positionRelPopover: function () {
      var pop = this.relPop; if (!pop || pop.style.display === 'none' || !this.selRel) return;
      var idx = this.relIndex(this.selRel); var spot = this._relSpots[idx];
      var host = this.host, W = host.clientWidth, H = host.clientHeight;
      if (!spot) { pop.style.left = '20px'; pop.style.top = '20px'; return; }
      var sx = this.view.x + spot.x * this.view.k, sy = this.view.y + spot.y * this.view.k;
      var pw = pop.offsetWidth || 330, ph = pop.offsetHeight || 220;
      var off = (this.pillBox(spot).h / 2 + 8) * this.view.k;
      var left = sx - pw / 2, top = sy + off;
      if (top + ph > H - 10) top = sy - ph - off;
      left = Math.max(190, Math.min(W - pw - 10, left)); top = Math.max(10, Math.min(H - ph - 10, top));
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    },
    /* opts.keepView — the caller has already aimed the viewport (Center selected, a chip
       click) and that aim wins. Without it the deferred fit would run after the caller's
       synchronous centring and throw it away. */
    selectTable: function (name, opts) {
      var self = this, t = this.app.model.byName[name];
      if (!t) return;
      var keepView = !!(opts && opts.keepView);
      if (this.selRel) { this.selRel = null; this.hideRelPopover(); }
      /* Fit only once the inspector has actually opened: fitting first measures a canvas
         that is about to lose ~330px on the right and leaves cards under the drawer. */
      this.app.setState({ selected: name, activeFilter: null, msrQuery: '', expandedMeasure: null },
        function () { if (!keepView && self.app.state.isolate) self.fitView(); });
      this.applyHighlight(name, null);
    },
    /* Background click: drops selection, filter and pins — a locked table stays focused. */
    clearSelection: function () {
      var had = this.app.state.selected || this.app.state.activeFilter || this.pinned.size || this.selRel || this.marked.size;
      this.pinned.clear(); this.marked.clear();
      if (this.selRel) { this.selRel = null; this.hideRelPopover(); }
      if (had) { this.app.setState({ selected: null, activeFilter: null }); this.applyHighlight(null, null); }
    },
    /* Marked tables are a multi-selection for bulk actions (remove). It is separate from the
       single selected table that drives the inspector and the focus highlight. */
    setMarked: function (names) {
      this.marked = new Set(names);
      this.applyHighlight();
      if (this.app.explorer) this.app.explorer.renderSelection();
    },
    toggleMark: function (name) {
      var next = new Set(this.marked);
      if (next.has(name)) next.delete(name); else next.add(name);
      this.setMarked(Array.from(next));
    },
    tablesInRect: function (x0, y0, x1, y1) {
      var self = this, lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) }, hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
      return Object.keys(this.cards).filter(function (n) {
        var c = self.cards[n]; if (c.el.style.display === 'none' || !self.workspaceNames.has(n)) return false;
        var b = self.cardBox(n);
        return b.x < hi.x && b.x + b.w > lo.x && b.y < hi.y && b.y + b.h > lo.y;
      });
    },
    setColorMode: function (mode) {
      this.app.colorBy = mode;
      this.app.setState({ colorBy: mode, activeFilter: null, selected: null });
      this.pinned.clear(); this.recolor(); this.applyHighlight(null, null);
      if (this.clusterOn) { this.buildClusters(); this.fitView(); }
    },
    applyHighlight: function (sel, filter) {
      var self = this, app = this.app;
      if (sel === undefined) sel = app.state.selected;
      if (filter === undefined) filter = app.state.activeFilter;
      this._activeSel = sel;
      if (this.clusterOn) {
        Object.keys(this.cards).forEach(function (n) {
          var c = self.cards[n];
          var isSel = sel === c.table.name;
          c.el.style.opacity = '1';
          c.el.style.boxShadow = isSel ? '0 0 0 2px #2563eb,0 10px 26px rgba(37,99,235,.24)' : '0 1px 2px rgba(20,30,50,.05),0 3px 10px rgba(20,30,50,.06)';
          c.el.style.zIndex = isSel ? '6' : '';
        });
        this.refreshVisibility(); this.renderLines(); return;
      }
      var roots = this.rootsSet();
      var dist = roots.size ? this.distMap(Array.from(roots), app.state.focusDepth || 1) : null;
      /* direct neighbours take the colour of the edge that reaches them (out beats in) */
      var side = {};
      if (dist) app.model.relationships.forEach(function (r) {
        var k = self.edgeKind(r, dist);
        if (k === 'out' && dist.get(r.to) === 1) side[r.to] = 'out';
        else if (k === 'in' && dist.get(r.from) === 1 && side[r.from] !== 'out') side[r.from] = 'in';
      });
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n];
        var name = c.table.name;
        var on = true;
        if (dist) on = dist.has(name);
        else if (filter) on = (c.table.domain === filter || (app.colorBy === 'source' && app.srcKeyOf(c.table) === filter));
        c.el.style.opacity = on ? '1' : '0.2';
        var isSel = sel === name, isPin = self.pinned.has(name), isLock = self.locked === name;
        var ring = SHADOW_BASE;
        if (isLock) ring = '0 0 0 2.5px ' + EDGE.lock + ',0 10px 26px rgba(31,36,48,.28)';
        else if (isSel) ring = '0 0 0 2px ' + EDGE.out + ',0 10px 26px rgba(37,99,235,.24)';
        else if (isPin) ring = '0 0 0 2px ' + EDGE.pin + ',0 8px 22px rgba(124,58,237,.2)';
        else if (dist && dist.get(name) === 1) ring = '0 0 0 1.5px ' + EDGE[side[name] || 'out'] + ',0 3px 10px rgba(20,30,50,.06)';
        else if (dist && dist.get(name) >= 2) ring = '0 0 0 1.5px ' + EDGE.hop + ',0 3px 10px rgba(20,30,50,.06)';
        c.ring = ring;
        c.el.style.boxShadow = ring;
        c.el.style.zIndex = (isSel || isPin || isLock || self.marked.has(name)) ? '6' : '';
        c.el.style.outline = self.marked.has(name) ? '2px dashed ' + EDGE.marked : '';
        c.el.style.outlineOffset = self.marked.has(name) ? '4px' : '';
        self.styleLock(c, isLock);
      });
      this.refreshVisibility();
      this.renderLines();
    },
    styleLock: function (c, isLock) {
      var fact = this.app.isFact(c.table);
      var b = c.lock;
      if (isLock) {
        b.style.display = 'flex'; b.style.background = EDGE.lock; b.style.color = '#fff';
        b.title = 'Unlock — stop keeping this table focused';
      } else {
        b.style.display = 'none'; b.style.background = 'transparent';
        b.style.color = fact ? 'rgba(255,255,255,.85)' : '#6b7280';
        b.title = 'Lock focus on this table — the highlight stays when you click elsewhere';
      }
    },
    setFilter: function (key) { this.pinned.clear(); this.app.setState({ activeFilter: key, selected: null }); this.applyHighlight(null, key); },
    toggleStandalone: function () { var v = !this.app.state.showStandalone; this.app.setState({ showStandalone: v }); this.applyVisibility(v); this.renderLines(); },
    toggleExpandAll: function () { var v = !this.app.state.allExpanded; this.app.setState({ allExpanded: v }); this.setAllExpanded(v); },
    toggleIsolate: function () {
      var self = this, v = !this.app.state.isolate;
      this.app.setState({ isolate: v }, function () { self.refreshVisibility(); self.renderLines(); self.fitView(); });
    },
    setDepth: function (d) {
      var self = this;
      if (this.app.explorer) this.app.explorer.depth = d === 1 ? 'direct' : d === 2 ? 'two' : 'all';
      this.app.setState({ focusDepth: d }, function () { self.applyHighlight(); if (self.app.state.isolate) self.fitView(); });
    },

    /* ---------- fit ---------- */
    /* The drawer, overview map, zoom rail, legend and the Domains chrome are siblings of the
       canvas host and paint over it. Each of them carries data-canvas-overlay, so a panel
       added later is trimmed off the fit box by declaring itself rather than by being added
       to a list here. Measured in host coordinates, so Fit and Center aim at the part the
       reader can actually see. */
    viewportRect: function () {
      var host = this.host;
      var size = { w: host.clientWidth || 0, h: host.clientHeight || 0 };
      if (!host.getBoundingClientRect || typeof document === 'undefined' || !document.querySelectorAll) return fitRect(size, [], 24);
      var base = host.getBoundingClientRect(), boxes = [];
      Array.prototype.forEach.call(document.querySelectorAll('[data-canvas-overlay]'), function (node) {
        if (!node || node.hidden || !node.getBoundingClientRect) return;
        var b = node.getBoundingClientRect();
        if (!b.width || !b.height) return;
        boxes.push({ x: b.left - base.left, y: b.top - base.top, w: b.width, h: b.height });
      });
      return fitRect(size, boxes, 24);
    },
    fitView: function () {
      var f = this.fitSolve();
      if (!f) return;
      this.view = f;
      this.updateTransform();
    },
    /* The arithmetic behind Fit, with nothing applied: the view it WOULD land on. The arrange
       loop needs the answer before it commits, because the zoom the picture ends up shown at
       is the zoom its lanes have to have been cut for. Returns null when the host has no size
       yet (Fit defers) or there is nothing to fit. */
    fitSolve: function (startK, floorK) {
      var self = this, host = this.host; if (!host) return null;
      var floor = floorK == null ? this.fitFloor() : Math.max(0.05, floorK);
      /* A hidden or not-yet-laid-out host has no size — fitting against it would lock the
         canvas at the minimum zoom, so defer until the host has real dimensions. */
      if (!host.clientWidth || !host.clientHeight) { this._pendingFit = true; this.watchSize(); return null; }
      this._pendingFit = false;
      var cards = [], extra = [];
      Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n];
        if (c.el.style.display === 'none') return;
        cards.push(c);
      });
      if (this.clusterOn && this.groups) Object.keys(this.groups).forEach(function (k) {
        var gg = self.groups[k]; extra.push({ x: gg.x || 0, y: gg.y || 0, w: gg.w || 252, h: gg.h || 150 });
      });
      if (!cards.length && !extra.length) return { x: 0, y: 0, k: 1 };
      var rect = this.viewportRect();
      var availW = Math.max(200, rect.w), availH = Math.max(200, rect.h);
      /* A chip widens *and* grows taller as the zoom drops, so the bounds depend on the
         answer. One refinement pass settles it: measure at the current zoom, then re-measure
         at the zoom that came out of it — which is the zoom the cards will be drawn at. The
         candidate size has to be the size at that candidate zoom, never the stale measured
         one, or the second pass floors on the first and Fit never converges. */
      var k = startK || this.view.k, minX = 0, minY = 0, maxX = 0, maxY = 0, pass;
      for (pass = 0; pass < 2; pass++) {
        minX = 1e9; minY = 1e9; maxX = -1e9; maxY = -1e9;
        cards.forEach(function (c) {
          var p = self.gp(c.table.name); if (!p) return;
          var w = self.cardWidthAt(c, k);
          var x = p.x - (w - self.CARD_W) / 2;
          minX = Math.min(minX, x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, p.y + self.cardHeightAt(c, k));
        });
        extra.forEach(function (r) {
          minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
        });
        if (minX > maxX) return { x: 0, y: 0, k: 1 };
        var bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
        /* Fit stops at the floor — and at the zoom the current positions were laid out for,
           which is never below it. Zooming out past that is what makes the chips outgrow the
           gaps between them; a picture that still does not fit is panned instead. */
        k = Math.max(floor, Math.min(1.25, Math.min(availW / bw, availH / bh)));
      }
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      return { k: k, x: rect.x + availW / 2 - cx * k, y: rect.y + availH / 2 - cy * k };
    },
    fitFloor: function () { return Math.max(ZOOM_FLOOR, this.layoutK || ZOOM_FLOOR); },
    /* The zoom Fit would land on, without touching the view. */
    fitZoom: function (startK, floorK) { var f = this.fitSolve(startK, floorK); return f ? f.k : null; },
    /* Lanes and chips have to be computed at the SAME zoom — the zoom the picture is actually
       shown at. Laying out at a guess and then fitting below it is what made step 4 worse
       than step 3: bigger lanes made a bigger picture, a bigger picture fitted smaller, and
       the chips drawn at that smaller zoom were bigger again than the lanes cut for them.
       So: lay out for k0, ask Fit what it would give, and if the answer is meaningfully
       smaller lay out again for THAT. Three passes at most; the chip metrics stop growing at
       the floor, so the loop is bounded whatever the model. `run` writes positions only —
       persisting, re-rendering and fitting stay with the caller, once. */
    arrangeAtFitZoom: function (run) {
      var k = this.ARRANGE_K0, next;
      for (var pass = 0; pass < 3; pass++) {
        this.setLayoutK(k);
        run();
        /* asked with the hard floor, not with fitFloor(): the question is what the picture
           WANTS, and fitFloor() would hand back the very k that was just laid out for */
        next = this.fitZoom(this.layoutK, ZOOM_FLOOR);
        /* Nothing to fit against — a hidden view, a headless run. Fall back to the floor,
           which is the widest lane a chip can ever need, rather than to the optimistic
           first guess: a layout cut for 0.5 and then shown at 0.3 is the old overlap. */
        if (next == null) { if (this.setLayoutK(ZOOM_FLOOR) !== k) run(); break; }
        if (next < this.layoutK - 0.02) { k = next; continue; }
        /* Fit landed ABOVE the guess, at a zoom that draws full cards: the lanes were cut for
           chips at k0, a gutter that leaves no room for the pill between two cards. Lay out
           once more for the zoom the cards will actually be read at, so the card gutter
           applies; if that wider picture then fits a little smaller, the next pass follows
           it down as usual. Going up is safe only here — the picture is shown no smaller
           than the lanes it gets. */
        if (pass === 0 && next > this.layoutK + 0.02 && this.cardLanes(next)) { k = next; continue; }
        break;
      }
      return this.layoutK;
    },
    watchSize: function () {
      var self = this;
      if (this._sizeWatch || typeof ResizeObserver !== 'function') return;
      this._sizeWatch = new ResizeObserver(function () {
        if (self._pendingFit && self.host.clientWidth && self.host.clientHeight) self.fitView();
      });
      this._sizeWatch.observe(this.host);
    },
    /* Zoom about the viewport centre so content stays where the user is looking. */
    zoomTo: function (k) {
      var host = this.host; var k0 = this.view.k;
      k = Math.max(0.1, Math.min(2.2, k));
      if (host) {
        var cx = host.clientWidth / 2, cy = host.clientHeight / 2;
        this.view.x = cx - (cx - this.view.x) * (k / k0);
        this.view.y = cy - (cy - this.view.y) * (k / k0);
      }
      this.view.k = k; this.updateTransform();
    },
    zoomIn: function () { this.zoomTo(this.view.k * 1.18); },
    zoomOut: function () { this.zoomTo(this.view.k * 0.85); },
    resetLayout: function () {
      var self = this;
      store.del(this.LSKEY);
      this.clearArranged();
      this.setLayoutK(ZOOM_FLOOR);
      this._preExpandPos = null; this.pos = {}; this.computeLayout();
      Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
      this.renderLines(); this.fitView();
    },
    focusGraph: function (name) {
      if (this.app.explorer) this.app.explorer.ensureTable(name);
      var host = this.host; var c = this.cards[name]; if (!c) return;
      // Reserve the inspector before centering the selected table.
      this.app.state.selected = name;
      if (this.app.explorer) this.app.explorer.update();
      if (c.table.relCount === 0 && !this.showSA) { this.app.setState({ showStandalone: true }); this.applyVisibility(true); this.renderLines(); }
      /* Raise the zoom first, then re-measure: the card is a different box at 85% than it
         was at 30%, and centring on a stale chip width lands the table off to one side. */
      this.view.k = Math.max(this.view.k, 0.85);
      if (this.applyLOD) this.applyLOD();
      var b = this.cardBox(name), rect = this.viewportRect();
      this.view.x = rect.x + rect.w / 2 - (b.x + b.w / 2) * this.view.k;
      this.view.y = rect.y + rect.h / 2 - (b.y + b.h / 2) * this.view.k;
      this.updateTransform();
      this.selectTable(name, { keepView: true });
    },

    /* ---------- layout presets ---------- */
    presetsKey: function () { return 'smv_presets_' + this.app.modelKey; },
    getPresets: function () { return store.getJSON(this.presetsKey(), []); },
    setPresets: function (ps) {
      var saved = true;
      store.setJSON(this.presetsKey(), ps, function () { saved = false; });
      return saved;
    },
    captureDisplay: function () {
      return { detail: this.detailMode, lines: this.lineStyle, color: this.app.colorBy,
        expanded: Object.keys(this.cards).filter(function (n) { return this.cards[n].expanded; }, this) };
    },
    restoreDisplay: function (display) {
      var self = this, d = display || {};
      if (['auto', 'names', 'cards'].includes(d.detail)) this.detailMode = d.detail;
      if (['ortho', 'curve'].includes(d.lines)) this.lineStyle = d.lines;
      if (['domain', 'source'].includes(d.color)) { this.app.colorBy = d.color; this.app.state.colorBy = d.color; this.recolor(); }
      if (Array.isArray(d.expanded)) Object.keys(this.cards).forEach(function (n) {
        var c = self.cards[n]; c.expanded = d.expanded.includes(n);
        if (c.body) c.body.style.display = c.expanded ? 'block' : 'none';
        if (c.caret) c.caret.style.transform = c.expanded ? 'rotate(180deg)' : '';
      });
      this._preExpandPos = null;
      this.app.state.allExpanded = Object.keys(this.cards).length > 0 && Object.keys(this.cards).every(function (n) { return self.cards[n].expanded; });
      this._chip = null;
    },
    captureFocus: function () {
      var focus = { selected: this.app.state.selected || null, isolate: !!this.app.state.isolate,
        depth: this.app.state.focusDepth || 1, pinned: Array.from(this.pinned), locked: this.locked || null };
      var ex = this.app.explorer;
      if (ex && (ex.direction !== 'connected' || !ex.includeInactive)) focus.paths = {direction:ex.direction, includeInactive:ex.includeInactive};
      return focus;
    },
    restoreFocus: function (focus) {
      var self = this, f = focus || {};
      function valid(n) { return !!self.cards[n] && (!self.workspaceNames || self.workspaceNames.has(n)); }
      this.pinned = new Set((Array.isArray(f.pinned) ? f.pinned : []).filter(valid));
      this.locked = valid(f.locked) ? f.locked : null;
      this.app.state.selected = valid(f.selected) ? f.selected : null;
      this._activeSel = this.app.state.selected;
      this.app.state.activeFilter = null;
      this.app.state.focusDepth = Number.isFinite(f.depth) && f.depth > 0 ? Math.floor(f.depth) : 1;
      var ex = this.app.explorer;
      if (ex) {
        ex.direction = f.paths && ['incoming','outgoing','connected'].includes(f.paths.direction) ? f.paths.direction : 'connected';
        ex.includeInactive = !f.paths || f.paths.includeInactive !== false;
        ex.depth = this.app.state.focusDepth === 1 ? 'direct' : this.app.state.focusDepth === 2 ? 'two' : 'all';
      }
      this.app.state.isolate = !!f.isolate && !!(this._activeSel || this.locked || this.pinned.size);
      this.selRel = null; this.hideRelPopover();
    },
    savePreset: function (rawName) {
      var name = (rawName || '').trim(), existing = this.getPresets(), i = 1;
      if (!name) { while (existing.some(function (p) { return p.name === 'View ' + i; })) i++; name = 'View ' + i; }
      var ps = existing.filter(function (p) { return p.name !== name; });
      ps.push({ version: 2, name: name, at: Date.now(), tables: this.workspaceNames ? Array.from(this.workspaceNames) : null,
        pos: JSON.parse(JSON.stringify(this.pos)), view: { x: this.view.x, y: this.view.y, k: this.view.k }, focus: this.captureFocus(),
        display: this.captureDisplay() });
      return this.setPresets(ps) ? name : null;
    },
    applyPreset: function (p) {
      var self = this, ex = this.app.explorer;
      if (ex) {
        ex.snapshot();
        ex.names = new Set((Array.isArray(p.tables) ? p.tables : Object.keys(p.pos || {})).filter(function (n) { return !!self.cards[n]; }));
        this.workspaceNames = ex.names;
      }
      this.restoreFocus(p.focus);
      Object.keys(p.pos || {}).forEach(function (n) {
        var pt = p.pos[n];
        if (self.cards[n] && pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) self.pos[n] = { x: pt.x, y: pt.y };
      });
      this.restoreDisplay(p.display);
      this._chip = null;
      Object.keys(this.cards).forEach(function (n) { self.layoutCard(n); });
      this.persist();
      this.markArranged();                 // a restored view is an arrangement the reader made
      if (ex) ex.commit('Restored “' + p.name + '”.', false);
      else this.applyHighlight();
      if (p.view && Number.isFinite(p.view.x) && Number.isFinite(p.view.y) && Number.isFinite(p.view.k) && p.view.k > 0) {
        this.view = { x: p.view.x, y: p.view.y, k: Math.max(.16, Math.min(2.2, p.view.k)) };
      }
      this.updateTransform(); this.renderLines();
    },
    deletePreset: function (name) { return this.setPresets(this.getPresets().filter(function (p) { return p.name !== name; })); }
  };

  g.GraphCanvas = GraphCanvas;
})(window);
