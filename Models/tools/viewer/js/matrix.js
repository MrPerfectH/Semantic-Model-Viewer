/* Fact relationship matrix: fact tables as columns, related tables as rows. */
(function (g) {
  'use strict';
  var el = U.el;

  function MatrixView(app, host) { this.app = app; this.host = host; this._key = null; }

  MatrixView.prototype.build = function () {
    var app = this.app, model = app.model;
    var facts = model.tables.filter(function (t) { return app.isFact(t) && t.relCount > 0; })
      .sort(function (a, b) { return b.relCount - a.relCount || a.name.localeCompare(b.name); });
    if (!facts.length) return null;
    var fIdx = Object.create(null); facts.forEach(function (f, i) { fIdx[f.name] = i; });
    var cellMap = Object.create(null), hidden = 0, shown = 0;
    model.relationships.forEach(function (r) {
      var fF = fIdx[r.from] !== undefined, fT = fIdx[r.to] !== undefined;
      var fact, row;
      if (fT && !fF) { fact = r.to; row = r.from; }
      else if (fF && !fT) { fact = r.from; row = r.to; }
      else if (fF && fT) { fact = r.to; row = r.from; }
      else { hidden++; return; }
      shown++;
      var m = (cellMap[row] = cellMap[row] || {});
      (m[fIdx[fact]] = m[fIdx[fact]] || []).push(r);
    });
    var rowTables = Object.keys(cellMap).map(function (n) { return model.byName[n]; }).filter(Boolean)
      .sort(function (a, b) { return Object.keys(cellMap[b.name]).length - Object.keys(cellMap[a.name]).length || a.name.localeCompare(b.name); });
    return { facts: facts, rowTables: rowTables, cellMap: cellMap, hidden: hidden, shown: shown };
  };

  MatrixView.prototype.update = function () {
    var app = this.app;
    var on = app.state.viewMode === 'matrix' && app.state.loaded;
    if (!on) {
      if (this._key !== null) { U.clear(this.host); this._key = null; this.el = null; }
      return;
    }
    // Role edits can change fact columns without changing table count or model ID.
    var key = JSON.stringify([app.modelKey, app.colorBy, app.paletteName,
      app.model.tables.map(function (t) { return [t.name, t.role, t.relCount]; }),
      app.model.relationships.map(function (r) { return [r.from, r.fromCol, r.to, r.toCol, r.fromCard, r.toCard, !!r.inactive, !!r.both]; })]);
    if (key === this._key) return;
    this._key = key;
    U.clear(this.host);
    var mx = this.build();
    var openT = function (n) { return function () { app.focusTable(n); }; };
    var wrap = el('section', { 'aria-label': 'Fact relationship matrix', style: 'position:absolute;inset:0;z-index:20;background:#f6f8fc;overflow:auto;' });
    var inner = el('div', { style: 'padding:28px 30px 36px;width:max-content;min-width:100%;' });
    wrap.appendChild(inner); this.host.appendChild(wrap); this.el = wrap;

    inner.appendChild(el('div', { text: 'MODEL STRUCTURE', style: 'font-size:10px;font-weight:700;letter-spacing:1.3px;color:#687991;' }));
    inner.appendChild(el('h1', { text: 'Fact relationship matrix', style: 'margin:7px 0 8px;font-size:25px;font-weight:600;letter-spacing:-.7px;color:#182943;' }));
    inner.appendChild(el('p', { text: 'Fact tables × related tables across the full model. This view is independent of your diagram layout.', style: 'margin:0 0 20px;font-size:12px;line-height:1.6;color:#65748a;max-width:720px;' }));
    if (!mx) {
      inner.appendChild(el('div', { style: 'max-width:620px;padding:26px;border:1px solid #dfe6f0;border-radius:14px;background:#fff;' }, [
        el('h2', { text: 'No connected fact tables', style: 'margin:0 0 10px;font-size:17px;color:#263951;' }),
        el('p', { text: 'This matrix uses tables classified as Fact that have at least one relationship. Explore every table in the table workspace, or review the rules used to classify your model.', style: 'margin:0 0 18px;font-size:13px;line-height:1.7;color:#65748a;' }),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;' }, [
          el('button', { cls: 'ex-button ex-primary', text: 'Explore tables', onClick: function () { app.setViewMode('graph'); } }),
          el('button', { cls: 'ex-button', text: 'Review table roles', onClick: function () { app.setState({ showRules: true }); } })
        ])
      ]));
      return;
    }

    inner.appendChild(el('div', {
      style: "font:500 11.5px/1.6 'IBM Plex Mono',monospace;color:#52647d;",
      text: mx.facts.length + ' fact tables × ' + mx.rowTables.length + ' related tables · ' + mx.shown + ' relationships'
    }));
    var note = mx.hidden
      ? mx.hidden + ' relationship' + (mx.hidden === 1 ? '' : 's') + ' between non-fact tables omitted. Explore the Tables view for those connections. '
      : '';
    note += 'Filled = an active relationship · ring = a bidirectional relationship · dashed = all inactive · number = multiple. Select a table or cell to open its table in the diagram.';
    inner.appendChild(el('p', { style: "margin:7px 0 20px;font:400 11.5px/1.7 'IBM Plex Sans',sans-serif;color:#65748a;max-width:760px;", text: note }));

    var table = el('table', { 'aria-label': 'Fact tables and their related tables', style: 'border-collapse:separate;border-spacing:0;table-layout:fixed;background:#fff;border:1px solid #dfe6ef;border-radius:10px;width:' + (240 + mx.facts.length * 52) + 'px;' });
    var thead = el('thead', {}), head = el('tr', {});
    head.appendChild(el('th', { scope: 'col', text: 'Related table', style: 'position:sticky;top:0;left:0;z-index:6;background:#eef2f8;height:158px;width:240px;padding:0 12px 12px;text-align:left;vertical-align:bottom;border-bottom:1px solid #dbe3ee;font-size:11px;font-weight:600;color:#65748a;' }));
    mx.facts.forEach(function (f) {
      head.appendChild(el('th', { scope: 'col', style: 'position:sticky;top:0;z-index:5;background:#eef2f8;border-bottom:1px solid #dbe3ee;padding:0;width:52px;' }, el('button', {
        title: 'Open ' + f.name + ' in the table diagram', 'aria-label': 'Open fact table ' + f.name + ' in the diagram', onClick: openT(f.name),
        style: 'height:158px;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:9px;border:none;background:transparent;cursor:pointer;padding:0 0 12px;'
      }, [
        el('span', { text: f.name, style: "writing-mode:vertical-rl;transform:rotate(180deg);font:600 11px/1.2 'IBM Plex Sans',sans-serif;color:#3a4d67;max-height:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" }),
        el('span', { style: 'width:9px;height:9px;border-radius:2.5px;background:' + app.tableColor(f) + ';flex:none;' })
      ])));
    });
    thead.appendChild(head); table.appendChild(thead); inner.appendChild(table);
    var tbody = el('tbody', {}); table.appendChild(tbody);

    mx.rowTables.forEach(function (t) {
      var rc = mx.cellMap[t.name];
      var row = el('tr', { cls: 'hv-eef2f7' });
      row.appendChild(el('th', { scope: 'row', style: 'position:sticky;left:0;z-index:2;background:#fff;border-bottom:1px solid #edf1f6;padding:0;' }, el('button', {
        title: 'Open ' + t.name + ' in the table diagram', 'aria-label': 'Open related table ' + t.name + ' in the diagram', onClick: openT(t.name),
        style: 'display:flex;align-items:center;gap:8px;height:40px;width:100%;padding:0 12px;border:none;background:transparent;cursor:pointer;text-align:left;'
      }, [
        el('span', { style: 'width:9px;height:9px;border-radius:50%;background:' + app.tableColor(t) + ';flex:none;' }),
        el('span', { text: t.name, style: "flex:1;min-width:0;font:500 11.5px/1 'IBM Plex Sans',sans-serif;color:#2b3140;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" }),
        el('span', { text: String(Object.keys(rc).length), title: 'Connected fact tables', style: "font:500 10px/1 'IBM Plex Mono',monospace;color:#72829a;flex:none;" })
      ])));
      mx.facts.forEach(function (f, i) {
        var rels = rc[i];
        if (!rels) {
          row.appendChild(el('td', { 'aria-label': 'No direct relationship', style: 'border-bottom:1px solid #edf1f6;text-align:center;padding:0;' },
            el('span', { 'aria-hidden': 'true', text: '·', style: 'color:#c9d3e1;' })));
          return;
        }
        var dot = "width:16px;height:16px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;font:700 9px/1 'IBM Plex Mono',monospace;color:#fff;";
        if (rels.every(function (x) { return x.inactive; })) dot = 'width:16px;height:16px;border-radius:50%;background:transparent;border:2px dashed #94a3b8;display:flex;align-items:center;justify-content:center;color:#52647d;font-size:9px;';
        else if (rels.some(function (x) { return x.both; })) dot += 'box-shadow:0 0 0 3px rgba(37,99,235,.22);';
        var title = rels.map(function (x) { return x.from + '[' + x.fromCol + '] = ' + x.to + '[' + x.toCol + '] · ' + (x.inactive ? 'inactive' : 'active') + ' · ' + (x.both ? 'bidirectional filtering' : x.to + ' filters ' + x.from); }).join('\n');
        row.appendChild(el('td', { style: 'border-bottom:1px solid #edf1f6;padding:0;' }, el('button', {
          title: title, 'aria-label': t.name + ' and ' + f.name + ': ' + rels.length + ' relationship' + (rels.length === 1 ? '' : 's') + '. ' + title + '. Open ' + t.name + ' in the diagram.', onClick: openT(t.name),
          style: 'border:none;background:transparent;height:40px;width:100%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;'
        }, el('span', { 'aria-hidden': 'true', style: dot, text: rels.length > 1 ? String(rels.length) : '' }))));
      });
      tbody.appendChild(row);
    });
  };

  g.MatrixView = MatrixView;
})(window);
