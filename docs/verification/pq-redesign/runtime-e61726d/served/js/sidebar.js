/* Table detail drawer (right sidebar) — role pill, source, relationships, measures, columns. */
(function (g) {
  'use strict';
  var el = U.el, tint = U.tint;
  var MAXM = 120;

  function Sidebar(app, host) { this.app = app; this.host = host; this._key = null; }

  Sidebar.prototype.build = function () {
    var app = this.app, model = app.model;
    var sel = app.state.selected; if (!sel) return null;
    var t = model.byName[sel]; if (!t) return null;
    var col = app.tableColor(t), sm = app.srcMeta(t);
    var rmap = { fact: 'FACT', dim: 'DIM', helper: 'HLP', calcgroup: 'CG', fieldparam: 'FP', measures: 'M', standalone: 'STD', unknown: 'UNK' };
    var rlabel = { fact: 'Fact table', dim: 'Dimension', helper: 'Helper', calcgroup: 'Calc group', fieldparam: 'Field parameter', measures: 'Measure store', standalone: 'Standalone table', unknown: 'Not classified' };
    var rels = [];
    model.relationships.forEach(function (r) {
      var out = (r.from === sel); if (!out && r.to !== sel) return;
      var other = out ? r.to : r.from;
      var join = out ? (r.fromCol + ' = ' + r.toCol) : (r.toCol + ' = ' + r.fromCol);
      if (r.inactive) join += ' · inactive';
      var fromCard = r.fromCard === 'one' ? '1' : '*', toCard = r.toCard === 'many' ? '*' : '1';
      var card = out ? fromCard + ' : ' + toCard : toCard + ' : ' + fromCard;
      rels.push({
        other: other, dir: r.both ? '⇄' : (out ? '←' : '→'), join: join, card: card,
        rowStyle: 'display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:8px 16px;border:none;background:transparent;cursor:pointer;' + (r.inactive ? 'opacity:.55;' : ''),
        dirStyle: 'width:24px;height:24px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;background:' + (out ? '#2563eb' : '#0d9488') + ';',
        go: function () { app.focusTable(other); },
        pick: function () { if (app.explorer) app.explorer.ensureTable(other); app.canvas.selectRel(app.canvas.selRel === r ? null : r); },
        isSel: app.canvas.selRel === r
      });
    });
    var columns = t.columns.map(function (c) {
      var isRel = c.rel, hid = c.hidden, ty = app.shortType(c.dataType);
      var status = app.colStatus ? app.colStatus(t.name, c.name) : null;
      var ckey = 'col|' + c.name, copen = !!(app.state.calcOpen || {})[ckey];
      return {
        name: c.name, type: ty, isCalc: !!c.isCalc, dax: c.dax || '', open: copen,
        toggle: function () { app.setState({ calcOpen: Object.assign({}, app.state.calcOpen, (function (o) { o[ckey] = !copen; return o; })({})) }); },
        pill: status && status.status !== 'used' && app.statusPill ? app.statusPill(status, false, true) : null,
        rowStyle: 'display:flex;align-items:center;gap:10px;padding:5px 16px;' + (isRel ? ('background:' + tint('#f59e0b', 0.07) + ';') : ''),
        dotStyle: isRel ? 'width:7px;height:7px;border-radius:50%;background:#f59e0b;flex:none;'
          : (hid ? 'width:7px;height:7px;border-radius:50%;border:1.5px solid #cbd0d8;flex:none;box-sizing:border-box;'
            : 'width:4px;height:4px;border-radius:50%;background:#cfd4dc;flex:none;margin:0 1.5px;'),
        nameColor: hid ? '#b3b9c2' : (isRel ? '#b45309' : '#3a414d'),
        typeStyle: ty ? "font:500 9.5px/1 'IBM Plex Mono',monospace;color:#9aa1ad;background:#eef1f4;border-radius:4px;padding:3px 5px;flex:none;" : 'display:none;'
      };
    });
    var q = (app.state.msrQuery || '').trim().toLowerCase();
    var allM = t.measures || [];
    var filtered = q ? allM.filter(function (m) { return m.name.toLowerCase().includes(q) || String(m.folder || '').toLowerCase().includes(q); }) : allM;
    var measures = filtered.slice(0, MAXM).map(function (m) {
      var open = app.state.expandedMeasure === m.name, u = app.msrUse(m.name);
      return {
        name: m.name, folder: m.folder || '', hasFolder: !!m.folder,
        hid: !!m.h, hasUse: !!u, use: u ? u.length : 0, useTip: app.useTip(u),
        pill: app.statusPill ? app.statusPill(app.msrStatus(m.name), !!u, true) : null,
        open: open, dax: (m.dax || '').trim() || '—',
        caretStyle: 'flex:none;display:flex;transition:transform .15s;transform:rotate(' + (open ? '90deg' : '0deg') + ');margin-top:1px;',
        toggle: function () { app.setState({ expandedMeasure: open ? null : m.name }); },
        trace: function () {
          app.canvas.pinned.clear();
          app.setState({ viewMode: 'measures', selMeasure: m.name, mvOpen: app.mvOpenFor(m.name), selected: null });
          app.canvas.applyHighlight(null, null);
        }
      };
    });
    var calcOpen = app.state.calcOpen || {};
    var calcItems = (t.calcItems || []).map(function (ci) {
      var key = 'item|' + ci.name, open = !!calcOpen[key];
      return { name: ci.name, dax: ci.dax || '—', fmt: ci.fmt || '', open: open,
        toggle: function () { app.setState({ calcOpen: Object.assign({}, app.state.calcOpen, (function (o) { o[key] = !open; return o; })({})) }); } };
    });
    return {
      tableDax: t.dax || '', calcItems: calcItems,
      name: t.name, domain: t.domain, role: t.role, roleShort: rmap[t.role] || 'TBL', roleLabel: rlabel[t.role] || 'Table',
      roleGlyphStyle: "font:700 9px/1 'IBM Plex Mono',monospace;letter-spacing:.5px;padding:5px 6px;border-radius:5px;color:#fff;background:" + col + ';flex:none;',
      tintBg: tint(col, 0.08),
      srcIcon: sm.icon, srcIconStyle: 'font-size:15px;color:' + sm.color + ';flex:none;width:20px;text-align:center;',
      srcKindLabel: sm.kind, srcDetail: sm.detail, srcVia: sm.via, srcServer: sm.server,
      colCount: t.colCount, relCount: t.relCount, measureCount: t.measureCount,
      overridden: !!t.autoRole && t.autoRole !== t.role, autoRole: t.autoRole, roleVia: t.roleVia,
      hasRels: rels.length > 0, rels: rels, columns: columns,
      hasMeasures: allM.length > 0, showMsrSearch: allM.length > 12, measures: measures, msrOverflow: filtered.length > MAXM
    };
  };

  Sidebar.prototype.update = function () {
    var self = this, app = this.app;
    /* The drawer belongs to the Tables canvas. Leaving it open over Domains, Measures or
       Matrix covers a canvas it does not describe — hide it and rebuild from the untouched
       selection when the reader comes back to Tables. */
    var key = app.state.loaded && app.state.selected && app.state.viewMode === 'graph'
      ? [app.modelKey, app.state.selected, app.state.msrQuery, app.state.expandedMeasure, app.colorBy, app._usage ? 1 : 0, app.canvas.locked, app.canvas.relIndex(app.canvas.selRel), app.state.isolate, app.state.focusDepth,
        app.model.byName[app.state.selected] ? app.model.byName[app.state.selected].role : '', JSON.stringify(app.state.roleSave), !!app.roleRepo(), JSON.stringify(app.state.calcOpen || {})].join('|')
      : null;
    if (key === this._key && (key || !this.host.firstChild)) return;
    this._key = key;
    U.clear(this.host);
    if (!key) return;
    var sel = this.build();
    if (!sel) return;
    var isLocked = app.canvas.locked === sel.name;

    var stat = function (n, label) {
      return el('div', { style: 'flex:1;text-align:center;background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.05);border-radius:7px;padding:6px 4px;' }, [
        el('div', { style: "font-size:16px;font-weight:600;font-family:'IBM Plex Mono',monospace;line-height:1;", text: String(n) }),
        el('div', { style: 'font-size:9.5px;color:#9aa1ad;margin-top:3px;', text: label })
      ]);
    };

    var head = el('div', { style: 'flex:none;padding:15px 16px 13px;border-bottom:1px solid #edeff2;background:' + sel.tintBg + ';' }, [
      el('div', { style: 'display:flex;align-items:flex-start;gap:10px;' }, [
        el('span', { style: sel.roleGlyphStyle, text: sel.roleShort }),
        el('div', { style: 'flex:1;min-width:0;' }, [
          el('div', { style: 'font-size:15.5px;font-weight:600;letter-spacing:-.2px;word-break:break-word;line-height:1.2;', text: sel.name }),
          el('div', { style: 'font-size:11px;color:#6b7280;margin-top:2px;', text: sel.domain + ' · ' + sel.roleLabel })
        ]),
        el('button', {
          title: isLocked ? 'Unlock — stop keeping this table focused' : 'Lock focus on this table — the highlight stays when you click elsewhere',
          onClick: function () { app.canvas.toggleLock(sel.name); }, html: U.icon('lock', 13),
          style: 'width:26px;height:26px;border:none;border-radius:7px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;' +
            (isLocked ? 'background:#1f2430;color:#fff;' : 'background:#eef0f3;color:#6b7280;')
        }),
        el('button', {
          text: '×', title: 'Close table inspector', onClick: function () { app.canvas.clearSelection(); },
          style: 'width:26px;height:26px;border:none;background:#eef0f3;border-radius:7px;cursor:pointer;color:#6b7280;font-size:16px;flex:none;line-height:1;'
        })
      ]),
      el('div', { style: 'margin-top:11px;display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.05);border-radius:8px;' }, [
        el('span', { style: sel.srcIconStyle, text: sel.srcIcon }),
        el('div', { style: 'min-width:0;' }, [
          el('div', { style: 'font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#9aa1ad;font-weight:600;', text: sel.srcKindLabel }),
          el('div', { style: "font-size:12px;font-family:'IBM Plex Mono',monospace;color:#2b3140;overflow-wrap:anywhere;line-height:1.35;", text: sel.srcDetail }),
          /* the connector is usually reached through a shared query — name it, it is where the M lives */
          sel.srcServer ? el('div', { title: 'Server / host', style: "font-size:10.5px;font-family:'IBM Plex Mono',monospace;color:#8b92a0;overflow-wrap:anywhere;margin-top:2px;", text: sel.srcServer }) : null,
          sel.srcVia ? el('div', { title: 'Reached through this shared query', style: "font-size:10.5px;font-family:'IBM Plex Mono',monospace;color:#8b92a0;overflow-wrap:anywhere;margin-top:2px;", text: 'via ' + sel.srcVia }) : null
        ])
      ]),
      el('div', { style: 'margin-top:9px;display:flex;gap:7px;' }, [stat(sel.colCount, 'columns'), stat(sel.relCount, 'relations'), stat(sel.measureCount, 'measures')])
    ]);
    /* role picker: every table the parser could have called fact/dim can be re-classified here;
       calc groups, field parameters and measure stores are structural and stay as they are */
    var PICKABLE = { fact: 1, dim: 1, helper: 1, standalone: 1, unknown: 1 };
    if (PICKABLE[sel.role]) {
      var roleLabels = { fact: 'Fact', dim: 'Dimension', helper: 'Helper', standalone: 'Standalone' };
      var btn = function (label, active, onClick, title) {
        return el('button', {
          text: label, title: title || '', onClick: onClick,
          style: "height:26px;padding:0 10px;border:1px solid " + (active ? '#1f2430' : '#dce0e6') + ";background:" + (active ? '#1f2430' : '#fff') + ";border-radius:6px;cursor:pointer;font:600 11px/1 'IBM Plex Sans';color:" + (active ? '#fff' : '#2b3140') + ";flex:1;"
        });
      };
      var pick = function (role) { return btn(roleLabels[role], sel.role === role, function () { app.assignRole(sel.name, role); }); };
      /* a table with no relationships isn't dimensioning anything, so 'Dimension' is not offered for it */
      var choices = sel.relCount > 0 ? ['fact', 'dim', 'helper'] : ['fact', 'helper', 'standalone'];
      var rules = app.getRules();
      var hint = sel.overridden ? 'Role set by you (rules said ' + (roleLabels[sel.autoRole] || sel.autoRole) + '):'
        : sel.roleVia === 'annotation' ? 'Role pinned in the model (SMV_Role annotation):'
        : typeof sel.roleVia === 'number' && rules[sel.roleVia] ? 'Rule ' + (sel.roleVia + 1) + ': ' + g.Roles.describe(rules[sel.roleVia]) + ' — change it if wrong:'
        : 'No rule matched — set its role:';
      var rowKids = choices.map(pick);
      if (sel.overridden || sel.roleVia === 'annotation') rowKids.push(btn('Auto', false, function () { app.assignRole(sel.name, 'auto'); }, 'Remove the role annotation and use automatic classification'));
      head.appendChild(el('div', { style: 'margin-top:9px;' }, [
        el('div', { style: 'display:flex;align-items:baseline;gap:6px;margin-bottom:6px;' }, [
          el('div', { style: 'flex:1;min-width:0;font-size:10px;color:#9aa1ad;', text: hint }),
          el('button', { text: 'Rules…', title: 'Edit the rules that decide fact / dim for every table', onClick: function () { app.setState({ showRules: true }); },
            style: "border:none;background:none;padding:0;cursor:pointer;font:600 10px/1 'IBM Plex Sans';color:#2563eb;flex:none;" })
        ]),
        el('div', { style: 'display:flex;gap:6px;' }, rowKids),
        el('div', {style:'margin-top:7px;font-size:11px;overflow-wrap:anywhere;', text:app.state.roleSave && app.state.roleSave.name === sel.name ? app.state.roleSave.text : app.roleRepo() ? 'Changes save automatically to the repo TMDL file.' : 'Connect the repo folder to save changes in TMDL. Browser-only choices are not shared.'}),

      ]));
    }

    var roleSettings = null;
    if (PICKABLE[sel.role]) { roleSettings = head.lastElementChild; roleSettings.remove(); }
    var body = el('div', { style: 'flex:1;overflow:auto;padding:4px 0 20px;' });
    var sectionTitle = function (label, count) {
      return el('div', { style: 'padding:14px 16px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9aa1ad;font-weight:700;display:flex;justify-content:space-between;' },
        count == null ? label : [el('span', { text: label }), el('span', { style: 'color:#c2c7d0;', text: String(count) })]);
    };

    var daxBox = function (text, margin) {
      return el('div', {
        'data-dax-box': true,
        style: 'margin:' + margin + ";padding:9px 11px;background:#232836;color:#d8dee9;border-radius:8px;font:400 10.5px/1.55 'IBM Plex Mono',monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;",
        text: text
      });
    };
    var fxBadge = function (title) {
      return el('span', { title: title, text: 'fx', style: "flex:none;font:700 9px/1 'IBM Plex Mono',monospace;color:#7c2d92;background:#f8f5ff;border:1px solid #e2d8f5;border-radius:4px;padding:2px 4px;" });
    };

    /* calculated table / field parameter: the DAX that builds the table */
    if (sel.tableDax) {
      body.appendChild(sectionTitle(sel.role === 'fieldparam' ? 'Field parameter DAX' : 'Calculated table DAX'));
      body.appendChild(daxBox(sel.tableDax, '2px 16px 8px'));
    }
    if (sel.calcItems.length) {
      body.appendChild(sectionTitle('Calculation items', sel.calcItems.length));
      sel.calcItems.forEach(function (ci) {
        var wrap = el('div', {}, el('button', {
          cls: 'hv-f5f7f9', onClick: ci.toggle,
          style: 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:5px 16px;border:none;background:transparent;cursor:pointer;'
        }, [
          el('span', { style: 'flex:none;display:flex;transition:transform .15s;transform:rotate(' + (ci.open ? '90deg' : '0deg') + ');', html: U.icon('chevRight', 10, '#9aa1ad') }),
          el('span', { style: "flex:1;min-width:0;font:500 11.5px/1.3 'IBM Plex Mono',monospace;color:#7c2d92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;", text: ci.name })
        ]));
        if (ci.open) {
          wrap.appendChild(daxBox(ci.dax, '2px 16px 8px 34px'));
          if (ci.fmt) {
            wrap.appendChild(el('div', { style: 'margin:0 16px 4px 34px;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#9aa1ad;font-weight:700;', text: 'Format string' }));
            wrap.appendChild(daxBox(ci.fmt, '0 16px 8px 34px'));
          }
        }
        body.appendChild(wrap);
      });
    }

    if (app.explorer && app.state.viewMode === 'graph') body.appendChild(app.explorer.relationControls());

    if (roleSettings) body.appendChild(el('details', {open:true,style:'padding:12px 16px;border-bottom:1px solid #e6ebf2;font-size:11px;color:#66758a;'}, [el('summary',{text:'Table role settings',style:'cursor:pointer;'}),roleSettings]));
    if (g.PowerQuery) body.appendChild(el('button',{text:'Open Power Query',cls:'ex-button',style:'margin:12px 16px;',onClick:function(){app.setViewMode('power-query');}}));
    if (sel.hasRels) {
      body.appendChild(sectionTitle('Relationships'));
      sel.rels.forEach(function (rel) {
        body.appendChild(el('button', { cls: 'hv-f5f7f9', title: 'Show this relationship on the graph', style: rel.rowStyle + (rel.isSel ? 'background:#eef0f3;' : ''), onClick: rel.pick }, [
          el('span', { style: rel.dirStyle, text: rel.dir }),
          el('span', { style: 'flex:1;min-width:0;' }, [
            el('span', { style: 'display:block;font-size:12.5px;font-weight:600;color:#1f2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: rel.other }),
            el('span', { style: "display:block;font-size:10px;font-family:'IBM Plex Mono',monospace;color:#8b92a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;", text: rel.join })
          ]),
          el('span', { style: "font:600 9.5px/1 'IBM Plex Mono',monospace;color:#6b7280;background:#eef1f4;border-radius:5px;padding:4px 6px;flex:none;", text: rel.card }),
          el('span', {
            cls: 'hv-blue-bc', title: 'Go to ' + rel.other, html: U.icon('chevRight', 12, 'currentColor'),
            onClick: function (e) { e.stopPropagation(); rel.go(); },
            style: 'flex:none;width:22px;height:22px;border:1px solid #dce0e6;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#7a828f;'
          })
        ]));
      });
    }

    if (sel.hasMeasures) {
      body.appendChild(sectionTitle('Measures', sel.measureCount));
      if (sel.showMsrSearch) {
        var inp = el('input', {
          value: app.state.msrQuery || '', placeholder: 'Filter measures…', spellcheck: 'false',
          style: "width:100%;height:27px;padding:0 9px;border:1px solid #dce0e6;border-radius:7px;font-size:11.5px;font-family:'IBM Plex Sans',sans-serif;outline:none;background:#f7f8fa;color:#1f2430;",
          onInput: function (e) { self._focusMsr = true; app.setState({ msrQuery: e.target.value }); }
        });
        body.appendChild(el('div', { style: 'padding:2px 16px 6px;' }, inp));
        if (this._focusMsr) { setTimeout(function () { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 0); }
      }
      sel.measures.forEach(function (m) {
        var kids = [
          el('span', { style: m.caretStyle, html: U.icon('chevRight', 10, '#9aa1ad') }),
          el('span', { style: 'flex:1;min-width:0;' }, [
            el('span', { style: "display:block;font:500 11.5px/1.3 'IBM Plex Mono',monospace;color:#7c2d92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;", text: m.name })
          ].concat(m.hasFolder ? [el('span', { style: 'display:block;font-size:9.5px;color:#a9afba;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;', text: m.folder })] : []))
        ];
        if (m.hid) kids.push(el('span', { title: 'Hidden in the model (isHidden)', style: 'flex:none;display:flex;color:#9aa1ad;', html: U.icon('eyeOff', 10) }));
        if (m.hasUse) kids.push(el('span', {
          title: m.useTip, text: m.use + ' pg',
          style: "flex:none;font:600 8.5px/1 'IBM Plex Mono',monospace;color:#2563eb;background:#f2f7ff;border:1px solid #d4e3fb;border-radius:4px;padding:2px 4px;cursor:help;"
        }));
        if (m.pill) kids.push(el('span', m.pill));
        var wrap = el('div', {}, el('button', {
          cls: 'hv-f5f7f9', onClick: m.toggle,
          style: 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:5px 16px;border:none;background:transparent;cursor:pointer;'
        }, kids));
        if (m.open) {
          wrap.appendChild(el('div', {
            style: "margin:2px 16px 8px 34px;padding:9px 11px;background:#232836;color:#d8dee9;border-radius:8px;font:400 10.5px/1.55 'IBM Plex Mono',monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;",
            text: m.dax
          }));
          wrap.appendChild(el('button', {
            cls: 'hv-trace', text: 'Trace dependencies →', onClick: m.trace,
            style: "margin:0 16px 10px 34px;display:flex;align-items:center;gap:5px;border:1px solid #e2d8f5;background:#f8f5ff;color:#6d28d9;border-radius:6px;padding:5px 9px;cursor:pointer;font:600 10.5px/1 'IBM Plex Sans',sans-serif;"
          }));
        }
        body.appendChild(wrap);
      });
      if (sel.msrOverflow) body.appendChild(el('div', { style: 'padding:6px 16px;font-size:10.5px;color:#9aa1ad;', text: 'Showing first 120 — refine the filter to see more.' }));
    }

    body.appendChild(sectionTitle('Columns', sel.colCount));
    sel.columns.forEach(function (c) {
      var rowKids = [
        el('span', { style: c.dotStyle }),
        el('span', { style: "flex:1;min-width:0;font-size:12.5px;font-family:'IBM Plex Mono',monospace;color:" + c.nameColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: c.name }),
        c.dax ? fxBadge('Calculated column — click to read the DAX') : null,
        c.pill ? el('span', c.pill) : null,
        el('span', { style: c.typeStyle, text: c.type })
      ];
      if (!c.dax) { body.appendChild(el('div', { cls: 'hv-f0f2f5', style: c.rowStyle }, rowKids)); return; }
      var wrap = el('div', {}, el('button', {
        cls: 'hv-f0f2f5', onClick: c.toggle, title: 'Show / hide the column DAX',
        style: c.rowStyle + 'width:100%;text-align:left;border:none;cursor:pointer;box-sizing:border-box;'
      }, rowKids));
      if (c.open) wrap.appendChild(daxBox(c.dax, '2px 16px 8px 34px'));
      body.appendChild(wrap);
    });

    this.host.appendChild(el('div', {
      'data-canvas-overlay': true,
      style: 'position:absolute;top:0;right:0;bottom:0;width:330px;z-index:50;background:#fff;border-left:1px solid #e3e6ea;box-shadow:-8px 0 24px rgba(20,30,50,.08);display:flex;flex-direction:column;'
    }, [head, body]));
    this._focusMsr = false;
  };

  g.Sidebar = Sidebar;
})(window);
