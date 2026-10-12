/* Rules editor — the ordered rule list that decides fact / dim / helper / standalone for every
   table (engine in js/roles.js). Edits apply live and persist in localStorage; 'Reset' returns
   to the built-in defaults, which are the same ones the Python build script uses. */
(function (g) {
  'use strict';
  var el = U.el;
  var ROLE_LABEL = { fact: 'Fact', dim: 'Dimension', helper: 'Helper', standalone: 'Standalone' };
  var SEL = "height:26px;padding:0 6px;border:1px solid #dce0e6;background:#fff;border-radius:6px;font:500 11px/1 'IBM Plex Sans';color:#2b3140;";
  var BTN = "height:26px;padding:0 9px;border:1px solid #dce0e6;background:#fff;border-radius:6px;cursor:pointer;font:600 11px/1 'IBM Plex Sans';color:#2b3140;flex:none;";

  function RulesModal(app, host) { this.app = app; this.host = host; }

  RulesModal.prototype.update = function () {
    var app = this.app, st = app.state, R = g.Roles, self = this;
    U.clear(this.host);
    if (!st.showRules) return;
    var rules = app.getRules();
    var close = function () { app.setState({ showRules: false }); };
    var commit = function () { app.setRules(rules); };

    /* how many tables each rule decides right now — the quickest way to see a rule is dead or too greedy */
    var hits = {}, unmatched = 0, annotated = 0;
    if (app.model) app.model.tables.forEach(function (t) {
      if (t.roleVia === 'annotation') annotated++;
      else if (t.roleVia === 'none') unmatched++;
      else if (typeof t.roleVia === 'number') hits[t.roleVia] = (hits[t.roleVia] || 0) + 1;
    });

    var select = function (value, options, onChange, width) {
      var s = el('select', { style: SEL + (width ? 'width:' + width + ';' : ''), onChange: function (e) { onChange(e.target.value); } });
      Object.keys(options).forEach(function (k) {
        var o = el('option', { value: k, text: typeof options[k] === 'string' ? options[k] : options[k].label });
        if (k === value) o.selected = true;
        s.appendChild(o);
      });
      return s;
    };

    var rows = rules.map(function (r, i) {
      var isLast = i === rules.length - 1;
      var nameOk = !r.name || (function () { try { new RegExp(r.name, 'i'); return true; } catch (e) { return false; } })();
      var row = el('div', { style: 'display:grid;grid-template-columns:22px 108px 1fr auto;gap:6px 8px;align-items:center;padding:7px 4px;border-bottom:1px solid #eef0f3;' });
      row.appendChild(el('div', { style: "font:600 11px/1 'IBM Plex Mono',monospace;color:#9aa1ad;text-align:right;", text: String(i + 1) }));
      row.appendChild(select(r.role, ROLE_LABEL, function (v) { r.role = v; commit(); }));
      var when = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;' }, [
        el('span', { style: 'font-size:10.5px;color:#9aa1ad;', text: 'when' }),
        el('input', {
          value: r.name, placeholder: 'name matches (regex)', title: 'Regular expression tested against the source table name and the table name, case-insensitive',
          style: SEL + 'width:170px;font-family:"IBM Plex Mono",monospace;' + (nameOk ? '' : 'border-color:#dc2626;color:#dc2626;'),
          onChange: function (e) { r.name = e.target.value.trim(); commit(); }
        }),
        select(r.sides, R.SIDES, function (v) { r.sides = v; commit(); }),
        select(r.measures, R.MEASURES, function (v) { r.measures = v; commit(); }),
        select(r.kind, R.KINDS, function (v) { r.kind = v; commit(); })
      ]);
      row.appendChild(when);
      var n = hits[i] || 0;
      row.appendChild(el('div', { style: 'display:flex;gap:4px;align-items:center;' }, [
        el('span', { style: "font:500 10.5px/1 'IBM Plex Mono',monospace;color:" + (n ? '#2b3140' : '#c0c5ce') + ";width:52px;text-align:right;", text: n + ' tbl' }),
        el('button', { text: '↑', title: 'Move up', onClick: function () { if (i > 0) { rules.splice(i - 1, 0, rules.splice(i, 1)[0]); commit(); } }, style: BTN + 'padding:0 7px;' + (i === 0 ? 'opacity:.35;' : '') }),
        el('button', { text: '↓', title: 'Move down', onClick: function () { if (!isLast) { rules.splice(i + 1, 0, rules.splice(i, 1)[0]); commit(); } }, style: BTN + 'padding:0 7px;' + (isLast ? 'opacity:.35;' : '') }),
        el('button', { text: '×', title: 'Remove rule', onClick: function () { rules.splice(i, 1); commit(); }, style: BTN + 'padding:0 8px;color:#dc2626;' })
      ]));
      return row;
    });

    var exportBtn = el('button', {
      text: 'Copy JSON', title: 'Copy the rule set as JSON — pass it to tmdl_to_model_data.py --rules so CI snapshots use the same rules',
      onClick: function () {
        var txt = JSON.stringify(rules, null, 2);
        var done = function () { exportBtn.textContent = 'Copied ✓'; setTimeout(function () { exportBtn.textContent = 'Copy JSON'; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done);
        else { window.prompt('Rule set as JSON:', txt); done(); }
      }, style: BTN
    });

    var panel = el('div', {
      onClick: function (e) { e.stopPropagation(); },
      style: 'width:960px;max-width:calc(100vw - 40px);max-height:calc(100vh - 80px);display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 30px 70px rgba(10,16,30,.35);padding:20px 22px;'
    }, [
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex:none;' }, [
        el('div', { style: 'font-size:16px;font-weight:600;letter-spacing:-.2px;', text: 'Table role rules' }),
        el('button', { text: '×', onClick: close, style: 'width:26px;height:26px;border:none;background:#eef0f3;border-radius:7px;cursor:pointer;color:#6b7280;font-size:16px;line-height:1;' })
      ]),
      el('div', { style: 'font-size:12px;color:#7a828f;line-height:1.5;margin-bottom:8px;flex:none;', html:
        'Rules run top to bottom; the first one that matches decides the table\'s role. A rule with no conditions catches everything left. ' +
        'An <code>SMV_Role</code> annotation in the model always wins' + (annotated ? ' (' + annotated + ' table' + (annotated === 1 ? '' : 's') + ' here)' : '') + '. ' +
        'Changes apply at once and stay in this browser.' + (unmatched ? ' <b style="color:#dc2626;">' + unmatched + ' table' + (unmatched === 1 ? '' : 's') + ' match no rule.</b>' : '')
      })
    ]);
    var list = el('div', { style: 'flex:1;overflow:auto;margin:0 -4px;' });
    rows.forEach(function (r) { list.appendChild(r); });
    panel.appendChild(list);
    panel.appendChild(el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex:none;align-items:center;' }, [
      el('button', { text: '+ Add rule', onClick: function () { rules.splice(rules.length - 1, 0, { role: 'fact', name: '', sides: '', measures: '', kind: '' }); commit(); }, style: BTN }),
      el('button', { text: 'Reset to defaults', onClick: function () { app.resetRules(); }, style: BTN + (app.rulesAreDefault() ? 'opacity:.45;' : '') }),
      exportBtn,
      el('div', { style: 'flex:1;' }),
      el('button', { text: 'Done', onClick: close, style: "height:31px;padding:0 16px;border:none;background:#16a34a;color:#fff;border-radius:7px;cursor:pointer;font:600 12px/1 'IBM Plex Sans';" })
    ]));

    this.host.appendChild(el('div', {
      onClick: close,
      style: 'position:fixed;inset:0;z-index:100;background:rgba(22,27,38,.46);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);'
    }, panel));
  };

  g.RulesModal = RulesModal;
})(window);
