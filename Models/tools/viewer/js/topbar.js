/* Top bar (model switcher, search, view toggle, arrange + presets, zoom, PNG),
   canvas legend, hint chip and the import modal. */
(function (g) {
  'use strict';
  var el = U.el, tint = U.tint;

  var segBase = 'height:26px;padding:0 11px;border:none;border-radius:5px;font:600 11.5px/1 "IBM Plex Sans";cursor:pointer;transition:all .12s;';
  var segOn = segBase + 'background:#fff;color:#1f2430;box-shadow:0 1px 2px rgba(20,30,50,.12);';
  var segOff = segBase + 'background:transparent;color:#7a828f;';
  var miniOn = segOn.replace('height:26px', 'height:24px').replace('padding:0 11px', 'padding:0 9px');
  var miniOff = segOff.replace('height:26px', 'height:24px').replace('padding:0 11px', 'padding:0 9px');
  var tglBase = 'height:28px;padding:0 11px;border:1px solid #dce0e6;border-radius:7px;font:500 11.5px/1 "IBM Plex Sans";cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;flex:none;transition:all .12s;';
  var tglOn = tglBase + 'background:#eef4ff;border-color:#bcd2f7;color:#2563eb;';
  var tglOff = tglBase + 'background:#fff;color:#5b6472;';

  function seg(label, on, fn, mini) {
    return el('button', { text: label, style: mini ? (on ? miniOn : miniOff) : (on ? segOn : segOff), onClick: fn });
  }
  function segGroup(kids, title) {
    return el('div', { title: title || null, style: 'display:flex;background:#eef0f3;border-radius:7px;padding:2px;' }, kids);
  }
  function labelled(label, node) {
    return el('div', { style: 'display:flex;align-items:center;gap:7px;flex:none;' }, [
      el('span', { style: 'font-size:10.5px;color:#8b92a0;text-transform:uppercase;letter-spacing:.5px;font-weight:600;', text: label }),
      node
    ]);
  }

  /* ================= top bar ================= */
  function TopBar(app, host) { this.app = app; this.host = host; }

  TopBar.prototype.update = function () {
    var self=this,app=this.app,st=app.state,cv=app.canvas,offline=!!app.snapshotMode,info=app.snapshotInfo||{};
    var key=[app.modelKey,st.modelName,st.loaded,st.viewMode,st.showModelMenu,st.pngLabel,st.repoScanning,st.repoError,app._repoLive,offline,st.snapshotSaving,st.refreshing,st.snapshotMessage,st.snapshotError,!!app.server].join('|');
    if(key===this._key)return;this._key=key;U.clear(this.host);
    var count=(app.model?app.model.tables.length:0)+' tables · '+(app.model?app.model.relationships.length:0)+' relationships';
    var created=Number.isFinite(Date.parse(info.createdAt))?new Date(info.createdAt).toLocaleString():'';
    var identity=el(offline?'div':'button',{cls:'ex-model-button'+(offline?' ex-snapshot-identity':''),title:offline?count:'Switch or import a model',
      'aria-expanded':offline?null:String(!!st.showModelMenu),onClick:offline?null:function(){if(app.host&&!st.showModelMenu)app.hostSelectModel();else app.setState({showModelMenu:!st.showModelMenu,showPresets:false});}},[
        el('strong',{text:st.loaded?st.modelName:(offline?info.name||st.modelName:st.modelName)}),
        el('small',{text:offline?'Snapshot'+(created?' · '+created:''):count})]);
    var model=el('div',{cls:'ex-brand'},[el('span',{cls:'ex-logo',html:U.ICON.logo}),identity]);
    if(st.showModelMenu&&!offline)model.appendChild(this.modelMenu());this.host.appendChild(model);
    var nav=el('nav',{cls:'ex-main-nav','aria-label':'Analysis views'});
    [['graph','Tables'],['measures','Measures'],['clusters','Domains'],['matrix','Matrix']].forEach(function(p){nav.appendChild(el('button',{text:p[1],disabled:!st.loaded,'aria-current':st.viewMode===p[0]?'page':null,onClick:function(){app.setViewMode(p[0]);}}));});
    this.host.appendChild(nav);
    var actions=el('div',{cls:'ex-header-actions'});
    if(!offline && st.loaded && (app.editHost ? app.editHost() : app.host) && (app.editHost ? app.editHost() : app.host).prepareRelationshipEdit) actions.appendChild(el('button',{cls:'ex-button',text:'Edit relationships',onClick:function(){g.SMVRelationshipEditor.open(app);}}));
    actions.appendChild(el('span',{cls:offline?'ex-snapshot-badge':'ex-local-badge',text:offline?'Offline snapshot':app.host?'VS Code workspace':'Local analysis',
      title:offline?'Includes model metadata and DAX. Changes stay in this tab; save a snapshot to keep them.':app.host?'Model parsing and analysis run locally in VS Code.':'Model parsing and analysis run in your browser.'}));
    actions.appendChild(el('button',{cls:'ex-button ex-snapshot-export',text:st.snapshotSaving?'Saving snapshot…':'Save snapshot',disabled:!st.loaded||!!st.snapshotSaving,
      title:'Download an offline copy of the app, including this model, DAX, and your current views',onClick:function(){app.saveSnapshot();}}));
    if(!offline&&app.host){
      actions.appendChild(el('button',{cls:'ex-button ex-primary',text:'Choose model',onClick:function(){app.hostSelectModel();}}));
    }
    if(!offline&&!app.host){
      if(app.canRefreshSource())actions.appendChild(el('button',{cls:'ex-button',text:st.refreshing?'Refreshing…':'Refresh',disabled:!!st.refreshing,
        title:'Re-read this model from its source folder. Your layout and saved views are kept.',onClick:function(){app.refreshSource();}}));
      actions.appendChild(el('button',{cls:'ex-button',text:st.pngLabel,title:'Export current view as PNG',onClick:function(){app.exportPNG();}}));
      if(!app.server)actions.appendChild(el('a',{cls:'ex-button',text:'Get the app',href:'https://github.com/MrPerfectH/Semantic-Model-Viewer#install-2-minutes',target:'_blank',rel:'noopener',
        title:'Download the desktop app: it opens your model folders directly, with no browser permission prompt',style:'text-decoration:none;display:inline-flex;align-items:center;'}));
      actions.appendChild(el('button',{cls:'ex-button ex-primary',text:'Open model',onClick:function(){app.setState({showImport:true,importError:'',importReady:false});}}));
    }
    this.host.appendChild(actions);
    /* Domains keeps Fit in its own toolbar row (see TableExplorer.renderClusterToolbar),
       next to Expand all / Collapse all, so both canvases carry the same controls. */
    if(st.snapshotMessage||st.snapshotError){
      this.host.appendChild(el('div',{cls:'ex-snapshot-status'+(st.snapshotError?' is-error':''),role:st.snapshotError?'alert':'status','aria-live':'polite'},[
        el('span',{text:st.snapshotError||st.snapshotMessage}),
        el('button',{type:'button',text:'×','aria-label':'Dismiss message',onClick:function(){app.setState({snapshotMessage:'',snapshotError:''});}})
      ]));
    }
  };

  TopBar.prototype.overlay = function () {
    var app = this.app;
    return el('div', { style: 'position:fixed;inset:0;z-index:58;', onClick: function () { app.setState({ showModelMenu: false, showPresets: false }); } });
  };

  TopBar.prototype.workspaceMenu = function () {
    var app = this.app, wrap = el('div',{}), menu = el('div',{cls:'ex-workspace-menu',role:'menu','aria-label':'Workspace models',style:'position:absolute;top:50px;left:18px;width:340px;max-width:calc(100vw - 36px);max-height:70vh;overflow:auto;background:#fff;border:1px solid #dfe5ee;border-radius:10px;box-shadow:0 14px 34px rgba(20,30,50,.18);padding:8px;z-index:60;'});
    wrap.appendChild(this.overlay()); wrap.appendChild(menu);
    menu.appendChild(el('div',{text:'Workspace models',style:'padding:8px;font-size:11px;color:#64748b;font-weight:600;'}));
    (app.host.models||[]).forEach(function (model) {
      menu.appendChild(el('button',{cls:'ex-button',role:'menuitem',text:model.name,title:model.path,style:'display:block;width:100%;text-align:left;margin-bottom:4px;',onClick:function(){app.hostChooseModel(model.id);}}));
    });
    if (!(app.host.models||[]).length) menu.appendChild(el('p',{text:'Open a workspace containing a .SemanticModel folder or model.bim, then refresh this list.',style:'padding:0 8px;font-size:12px;line-height:1.6;color:#64748b;'}));
    if(app.state.repoError)menu.appendChild(el('p',{role:'alert',text:app.state.repoError,style:'padding:8px;color:#b91c1c;font-size:12px;'}));
    menu.appendChild(el('button',{cls:'ex-button',role:'menuitem',text:'Refresh model list',onClick:function(){app.hostSelectModel();}}));
    if (app.state.loaded) {
      menu.appendChild(el('button',{cls:'ex-button',role:'menuitem',text:'Refresh model',onClick:function(){app.hostRefreshModel();}}));
      menu.appendChild(el('button',{cls:'ex-button',role:'menuitem',text:'Load Cleaner analysis',onClick:function(){app.hostLoadAnalysis();}}));
    }
    return wrap;
  };

  TopBar.prototype.modelMenu = function () {
    var self = this, app = this.app, st = app.state;
    if (app.host) return this.workspaceMenu();
    var wrap = el('div', {});
    wrap.appendChild(this.overlay());
    var menu = el('div', { style: 'position:absolute;top:44px;left:34px;width:290px;background:#fff;border:1px solid #e3e6ea;border-radius:11px;box-shadow:0 14px 34px rgba(20,30,50,.18);padding:6px;z-index:60;' });
    menu.appendChild(el('div', { style: 'padding:7px 9px 5px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9aa1ad;font-weight:700;', text: 'Models' }));

    var store = app.getStore();
    var items = [{ id: 'builtin', name: 'Contoso Retail', meta: 'built-in' }]
      .concat(store.filter(function (m) { return String(m.id).indexOf('repo:') !== 0; })
        .map(function (m) { return { id: m.id, name: m.name, meta: m.model.tables.length + ' tables · imported' }; }));
    var row = function (item, canDelete, onPick, onDel) {
      var active = app.modelKey === item.id;
      var r = el('div', { style: 'display:flex;align-items:center;border-radius:7px;' + (active ? 'background:#eef4ff;' : '') });
      r.appendChild(el('button', {
        onClick: onPick,
        style: "flex:1;min-width:0;display:flex;align-items:center;gap:9px;border:none;background:transparent;cursor:pointer;padding:7px 8px;text-align:left;font-family:'IBM Plex Sans',sans-serif;"
      }, [
        el('span', { style: 'width:15px;flex:none;display:flex;align-items:center;justify-content:center;color:' + (active ? '#2563eb' : 'transparent') + ';', html: U.ICON.check }),
        el('span', { style: 'flex:1;min-width:0;' }, [
          el('span', { style: 'display:block;font-size:12.5px;font-weight:600;color:#1f2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: item.name }),
          el('span', { style: "display:block;font-size:10px;color:#8b92a0;font-family:'IBM Plex Mono',monospace;margin-top:1px;", text: item.meta })
        ])
      ]));
      if (canDelete) r.appendChild(el('button', {
        cls: 'hv-del', title: 'Remove this imported model', text: '×', onClick: function (e) { e.stopPropagation(); onDel(); },
        style: 'width:22px;height:22px;flex:none;border:none;background:transparent;border-radius:5px;cursor:pointer;color:#9aa1ad;font-size:14px;line-height:1;margin-right:4px;'
      }));
      return r;
    };
    items.forEach(function (m) {
      menu.appendChild(row(m, m.id !== 'builtin', function () { app.switchModel(m.id); }, function () { app.deleteModel(m.id); }));
    });

    var sep = function () { return el('div', { style: 'height:1px;background:#edeff2;margin:5px 4px;' }); };
    menu.appendChild(sep());
    var repoName = U.store.get('smv_repo_name', '') || '';
    menu.appendChild(el('div', { style: 'padding:7px 9px 4px;display:flex;align-items:center;gap:6px;' }, [
      el('span', { style: 'font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#9aa1ad;font-weight:700;', text: 'Repo' }),
      el('span', { title: 'Connected repo folder', style: "flex:1;min-width:0;font:500 10px/1 'IBM Plex Mono',monospace;color:#b3b9c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;", text: repoName })
    ]));
    if (repoName && !app._repoLive) {
      menu.appendChild(el('button', {
        cls: 'hv-warn', onClick: function () { app.reconnectRepo(); },
        style: "display:flex;align-items:center;gap:8px;width:calc(100% - 8px);margin:0 4px 4px;border:1px solid #f0dfb4;background:#fdf8ec;cursor:pointer;padding:8px 9px;border-radius:7px;font:600 11.5px/1.35 'IBM Plex Sans',sans-serif;color:#92600a;text-align:left;",
        html: U.icon('refresh', 12) + '<span style="flex:1;min-width:0;">' + (app.server ? 'Reconnect &amp; rescan' : 'Reconnect &amp; rescan — the browser asks once per session') + '</span>'
      }));
    }
    if (st.repoScanning) menu.appendChild(el('div', { style: 'padding:5px 9px 7px;font-size:11px;color:#9aa1ad;', text: 'Scanning for *.SemanticModel folders…' }));
    app.repoRows().forEach(function (r) {
      menu.appendChild(row({ id: r.id, name: r.name, meta: r.meta }, r.canDelete, r.pick, r.del));
    });
    if (st.repoError) menu.appendChild(el('div', { style: 'margin:4px;padding:7px 9px;background:#fdecec;border:1px solid #f6c9c9;border-radius:7px;font-size:11px;color:#b91c1c;line-height:1.45;', text: st.repoError }));
    menu.appendChild(el('button', {
      cls: 'hv-eef4ff', onClick: function () { app.connectRepo(); },
      style: "display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;cursor:pointer;padding:8px 9px;border-radius:7px;font:600 12px/1 'IBM Plex Sans';color:#2563eb;",
      html: U.ICON.folder + (repoName ? 'Switch repo folder…' : 'Connect repo folder…')
    }));
    if (app._repoLive) {
      menu.appendChild(el('div', { style: 'display:flex;gap:2px;padding:0 4px 2px;' }, [
        el('button', { cls: 'hv-f5f7f9', text: 'Rescan', onClick: function () { app.scanRepo(); }, style: "flex:1;border:none;background:transparent;cursor:pointer;padding:5px;border-radius:6px;font:500 10.5px/1 'IBM Plex Sans';color:#7a828f;" }),
        el('button', { cls: 'hv-del', text: 'Disconnect', onClick: function () { app.forgetRepo(); }, style: "flex:1;border:none;background:transparent;cursor:pointer;padding:5px;border-radius:6px;font:500 10.5px/1 'IBM Plex Sans';color:#7a828f;" })
      ]));
    }
    menu.appendChild(sep());
    menu.appendChild(el('button', {
      cls: 'hv-eef4ff',
      onClick: function () { app.setState({ showImport: true, showModelMenu: false, importError: '', importReady: false, importName: '', importSummary: '' }); },
      style: "display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;cursor:pointer;padding:8px 9px;border-radius:7px;font:600 12px/1 'IBM Plex Sans';color:#2563eb;",
      html: U.ICON.plus + 'Import model (TMDL / BIM)'
    }));
    wrap.appendChild(menu);
    return wrap;
  };

  TopBar.prototype.presetsMenu = function () {
    var app=this.app,cv=app.canvas,ex=app.explorer,wrap=el('div',{});
    wrap.appendChild(this.overlay());
    var menu=el('section',{cls:'ex-saved-menu','aria-label':'Saved table views'});
    menu.appendChild(el('h3',{text:'Save this view'}));
    menu.appendChild(el('p',{cls:'ex-muted',text:app.snapshotMode?'Keep tables, positions, zoom, selection, and focus in this tab. Save a snapshot to keep these views in a file.':app.host?'Keep tables, positions, zoom, selection, and focus. Saved in this VS Code workspace for this model.':'Keep tables, positions, zoom, selection, and focus. Saved in this browser for this model.'}));
    var message=el('p',{cls:'ex-save-message',role:'status','aria-live':'polite'});
    var save=function(){
      var saved=cv.savePreset(app.state.presetName);
      if(!saved){message.textContent='Could not save. Browser storage may be full or unavailable.';return;}
      app.state.presetName='';ex.message='Saved “'+saved+'” '+(app.snapshotMode?'in this tab. Save a snapshot to keep it.':app.host?'in this VS Code workspace.':'in this browser.');
      app.setState({showPresets:false});ex._key=null;
    };
    var inp=el('input',{id:'saved-view-name',value:app.state.presetName||'',placeholder:'Name this view…','aria-label':'View name',spellcheck:'false',
      onInput:function(e){app.state.presetName=e.target.value;}});
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();save();}});
    menu.appendChild(el('div',{cls:'ex-save-form'},[inp,el('button',{cls:'ex-button ex-primary',text:'Save',onClick:save})]));
    menu.appendChild(message);
    menu.appendChild(el('h3',{text:'Saved views'}));
    var presets=cv.getPresets().slice().sort(function(a,b){return b.at-a.at;});
    if(!presets.length)menu.appendChild(el('p',{cls:'ex-muted',text:'No saved views yet. Name your current view above.'}));
    presets.forEach(function(p){
      var load=el('button',{cls:'ex-saved-load',onClick:function(){cv.applyPreset(p);app.setState({showPresets:false});}},[
        el('strong',{text:p.name}),el('small',{text:(Array.isArray(p.tables)?p.tables.length:Object.keys(p.pos||{}).length)+' tables'+(p.focus&&p.focus.isolate?' · Focused':'')})]);
      menu.appendChild(el('div',{cls:'ex-saved-row'},[load,el('button',{cls:'ex-button',text:'×','aria-label':'Delete saved view '+p.name,onClick:function(){
        if(!cv.deletePreset(p.name)){message.textContent='Could not delete the saved view. Browser storage is unavailable.';return;}
        ex._key=null;app.render(true);
      }})]));
    });
    menu.addEventListener('keydown',function(e){if(e.key==='Escape'){app.setState({showPresets:false});}});
    wrap.appendChild(menu);return wrap;
  };

  /* ================= legend ================= */
  function Legend(app, host) { this.app = app; this.host = host; }
  Legend.prototype.build = function () {
    // count what is actually on the canvas — standalone tables are hidden by default,
    // so quoting the raw totals here used to make Manual / supply look wrong
    var app = this.app;
    var showSA = app.state.showStandalone;
    var keyOf = app.colorBy === 'source' ? function (t) { return app.srcKeyOf(t); } : function (t) { return t.domain; };
    var labelMap = {};
    Object.keys(app.SOURCE_KINDS).forEach(function (k) { labelMap[k] = app.SOURCE_KINDS[k].label; });
    labelMap.manual = 'Manual'; labelMap.calculated = 'Calculated';
    var tot = {}, vis = {}, hid = {};
    app.model.tables.forEach(function (t) {
      var k = keyOf(t); tot[k] = (tot[k] || 0) + 1;
      if (showSA || t.relCount > 0) vis[k] = (vis[k] || 0) + 1; else hid[k] = (hid[k] || 0) + 1;
    });
    var map = app.colorBy === 'source' ? app._srcMap : app._domMap;
    return Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a]; }).map(function (k) {
      return {
        key: k, label: app.colorBy === 'source' ? (labelMap[k] || k) : k, color: map[k] || app.FALLBACK_COLOR,
        count: vis[k] || 0, plus: hid[k] ? ('+' + hid[k]) : '',
        tip: hid[k] ? ((vis[k] || 0) + ' on canvas · ' + hid[k] + ' standalone hidden — use the Standalone toggle to show ' + (hid[k] === 1 ? 'it' : 'them')) : (tot[k] + ' tables')
      };
    });
  };
  Legend.prototype.update = function () {
    var app = this.app, st = app.state;
    U.clear(this.host);
    /* The floating panel is gone from both canvases: Tables hides it in CSS and Domains now
       shows the same rows inside its toolbar Legend popover. build() stays the single source
       of the colour key for that popover. */
    if (!st.loaded || st.viewMode !== 'graph') return;
    var box = el('div', { 'data-canvas-overlay': true, style: 'position:absolute;left:14px;bottom:14px;z-index:30;background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border:1px solid #e3e6ea;border-radius:10px;padding:8px 10px 10px;box-shadow:0 6px 18px rgba(20,30,50,.08);max-width:210px;' });
    box.appendChild(el('button', {
      onClick: function () { app.setState({ legendOpen: !st.legendOpen }); },
      style: "display:flex;align-items:center;gap:6px;width:100%;border:none;background:transparent;cursor:pointer;padding:2px 2px 6px;font-family:'IBM Plex Sans',sans-serif;"
    }, [
      el('span', { style: 'flex:1;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#8b92a0;font-weight:700;', text: app.colorBy === 'source' ? 'Source' : 'Domain' }),
      el('span', { style: 'flex:none;display:flex;transition:transform .15s;transform:rotate(' + (st.legendOpen ? '0deg' : '180deg') + ');', html: U.icon('chevDown', 12, '#a8aeb9') })
    ]));
    if (st.legendOpen) {
      var list = el('div', { style: 'display:flex;flex-direction:column;gap:5px;' });
      this.build().forEach(function (L) {
        var active = st.activeFilter === L.key;
        list.appendChild(el('button', {
          title: L.tip, onClick: function () { app.canvas.setFilter(active ? null : L.key); },
          style: 'display:flex;align-items:center;gap:7px;width:100%;border:none;background:' + (active ? tint(L.color, 0.12) : 'transparent') + ';border-radius:6px;padding:3px 6px;cursor:pointer;'
        }, [
          el('span', { style: 'width:11px;height:11px;border-radius:3px;flex:none;background:' + L.color + ';' }),
          el('span', { style: 'flex:1;text-align:left;font-size:11.5px;color:#3a414d;white-space:nowrap;', text: L.label }),
          el('span', { style: "font-size:10.5px;color:#9aa1ad;font-family:'IBM Plex Mono',monospace;", text: String(L.count) }),
          el('span', { style: "font-size:9px;color:#c9ced6;font-family:'IBM Plex Mono',monospace;", text: L.plus })
        ]));
      });
      box.appendChild(list);
      box.appendChild(el('div', {
        style: 'margin-top:9px;padding-top:8px;border-top:1px solid #edeff2;display:flex;gap:12px;font-size:10px;color:#8b92a0;',
        html: '<span style="display:flex;align-items:center;gap:4px;"><span style="width:13px;height:11px;background:#5b6472;border:1.5px solid #5b6472;border-radius:1px;flex:none;"></span>Fact</span>' +
          '<span style="display:flex;align-items:center;gap:4px;"><span style="width:13px;height:11px;border:1.5px solid #5b6472;border-radius:6px;flex:none;"></span>Dim</span>'
      }));
      if (st.viewMode === 'graph') {
        var E = app.canvas.EDGE;
        var line = function (col, dash) { return '<span style="width:16px;height:0;border-top:2px ' + (dash ? 'dashed' : 'solid') + ' ' + col + ';flex:none;"></span>'; };
        var row = function (html) { return '<span style="display:flex;align-items:center;gap:6px;white-space:nowrap;">' + html + '</span>'; };
        box.appendChild(el('div', {
          title: 'Line markers: 1 / * = cardinality at each end · arrow = filter direction (one side filters the many side)',
          style: "margin-top:8px;padding-top:7px;border-top:1px solid #edeff2;display:flex;flex-direction:column;gap:4px;font-size:10px;color:#8b92a0;font-family:'IBM Plex Mono',monospace;",
          html: row('<span style="display:inline-flex;align-items:center;justify-content:center;height:15px;padding:0 6px;border:1.3px solid #5b6472;border-radius:8px;font-weight:700;color:#5b6472;font-size:9.5px;letter-spacing:.5px;">1 → *</span><span style="color:#9aa1ad;">1 / * ends · arrow = filter flow</span>') +
            row(line(E.out) + 'focused is <b>from</b> (*) side') +
            row(line(E.in) + 'focused is <b>to</b> (1) side') +
            row(line(E.hop) + '2nd hop link') +
            row(line('#8b92a0', true) + 'inactive')
        }));
      }
    }
    this.host.appendChild(box);
  };

  /* ================= hint chip ================= */
  function Hint(app, host) { this.app = app; this.host = host; }
  Hint.prototype.update = function () {
    var app = this.app, st = app.state;
    U.clear(this.host);
    /* The dark floating chip is retired. Tables and Domains both carry their guidance in the
       status line under the canvas; this stays only for views without that status row. */
    if (st.hintDismissed || st.viewMode !== 'graph') return;
    var text = 'click a table to select · click a line for relationship details · ▾ shows columns · lock keeps the focus · shift+click pins · scroll to zoom';
    this.host.appendChild(el('div', {
      style: "position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:25;background:rgba(31,36,48,.82);color:#fff;font-size:11px;padding:5px 8px 5px 13px;border-radius:20px;backdrop-filter:blur(4px);font-family:'IBM Plex Mono',monospace;letter-spacing:.2px;display:flex;align-items:center;gap:9px;max-width:calc(100% - 60px);"
    }, [
      el('span', { style: 'min-width:0;', text: text }),
      el('button', {
        title: 'Dismiss', text: '×', onClick: function () { app.setState({ hintDismissed: true }); },
        style: 'width:18px;height:18px;flex:none;border:none;background:rgba(255,255,255,.14);color:#fff;border-radius:50%;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center;'
      })
    ]));
  };

  /* ================= import modal ================= */
  function ImportModal(app, host) { this.app = app; this.host = host; }
  ImportModal.prototype.update = function () {
    var self = this, app = this.app, st = app.state;
    U.clear(this.host);
    if (st.showImport) this.renderImport();
    if (st.folderPick) this.host.appendChild(folderChooser(app, st.folderPick));
  };
  ImportModal.prototype.renderImport = function () {
    var self = this, app = this.app, st = app.state;
    var mono = "font-family:'IBM Plex Mono',monospace;";
    var fileInput = el('input', { type: 'file', multiple: '', accept: '.tmdl,.bim,.json', style: 'display:none;', onChange: function (e) { app.handleFiles(Array.from(e.target.files || []).map(function (f) { return { f: f, p: f.webkitRelativePath || f.name }; })); e.target.value = ''; } });
    var folderInput = el('input', { type: 'file', style: 'display:none;', onChange: function (e) { app.handleFiles(Array.from(e.target.files || []).map(function (f) { return { f: f, p: f.webkitRelativePath || f.name }; })); e.target.value = ''; } });
    folderInput.setAttribute('webkitdirectory', '');
    var drop = el('div', {
      onDragOver: function (e) { e.preventDefault(); },
      onDrop: function (e) { app.onDrop(e); },
      style: 'border:1.6px dashed #c3cbd6;border-radius:11px;padding:22px 16px;text-align:center;background:#f8f9fb;'
    }, [
      el('div', { style: 'font-size:12.5px;color:#4b5563;font-weight:500;', html: 'Drop a repo folder — every <span style="' + mono + '">*.SemanticModel</span> inside is found —<br>or a TMDL folder / <span style="' + mono + '">model.bim</span> file' }),
      el('div', { style: 'display:flex;gap:8px;justify-content:center;margin-top:13px;' }, [
        app.server
          ? el('button', { text: 'Browse folder…', onClick: function () { app.importFromFolder(); }, style: "height:29px;padding:0 13px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:7px;cursor:pointer;font:600 11.5px/1 'IBM Plex Sans';" })
          : el('button', { text: 'Choose folder', onClick: function () { app.chooseImportFolder(function () { folderInput.click(); }); }, style: "height:29px;padding:0 13px;border:1px solid #dce0e6;background:#fff;border-radius:7px;cursor:pointer;font:600 11.5px/1 'IBM Plex Sans';color:#2b3140;" }),
        el('button', { text: 'Choose files', onClick: function () { fileInput.click(); }, style: "height:29px;padding:0 13px;border:1px solid #dce0e6;background:#fff;border-radius:7px;cursor:pointer;font:600 11.5px/1 'IBM Plex Sans';color:#2b3140;" })
      ]),
      app.server
        ? el('div', { style: 'font-size:11px;line-height:1.45;color:#6b7280;margin-top:11px;', text: 'Browse folder: the local app reads the folder for you — no browser permission prompt — and Refresh re-reads it later.' })
        : (app.canFS() ? el('div', { style: 'font-size:11px;line-height:1.45;color:#6b7280;margin-top:11px;', text: 'Choose folder: your browser asks for permission to view the folder — click Allow so Refresh can re-read it later.' }) : null),
      fileInput, folderInput
    ]);

    var panel = el('div', {
      onClick: function (e) { e.stopPropagation(); },
      style: 'width:470px;max-width:calc(100vw - 40px);background:#fff;border-radius:14px;box-shadow:0 30px 70px rgba(10,16,30,.35);padding:20px 22px;'
    }, [
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;' }, [
        el('div', { style: 'flex:1;min-width:0;font-size:16px;font-weight:600;letter-spacing:-.2px;white-space:nowrap;', text: 'Import model' }),
        el('button', { text: '×', onClick: function () { app.setState({ showImport: false }); }, style: 'width:26px;height:26px;border:none;background:#eef0f3;border-radius:7px;cursor:pointer;color:#6b7280;font-size:16px;line-height:1;' })
      ]),
      el('div', { style: 'font-size:12px;color:#7a828f;line-height:1.5;margin-bottom:14px;', text: 'Parsed locally in your browser — nothing is uploaded.' }),
      drop
    ]);
    if (st.importError) panel.appendChild(el('div', { style: 'margin-top:11px;padding:9px 12px;background:#fdecec;border:1px solid #f6c9c9;border-radius:8px;font-size:12px;color:#b91c1c;line-height:1.45;', text: st.importError }));
    if (st.importReady) {
      var nameInput = el('input', {
        value: st.importName, placeholder: 'Model name', spellcheck: 'false',
        style: "flex:1;min-width:0;height:31px;padding:0 10px;border:1px solid #cbd5cd;border-radius:7px;font-size:12.5px;font-family:'IBM Plex Sans',sans-serif;outline:none;background:#fff;color:#1f2430;",
        onInput: function (e) { app.state.importName = e.target.value; }
      });
      var note = el('div', { style: 'font-size:11px;color:#5b6b60;line-height:1.45;margin-top:8px;' });
      var addBtn;
      var sync = function () {
        var hit = app.importTarget(app.state.importName);
        addBtn.textContent = hit ? 'Update model' : 'Add model';
        note.textContent = hit ? '“' + hit.name + '” is already imported — it will be updated in place. Its layout and saved views are kept.' : '';
        note.style.display = hit ? 'block' : 'none';
      };
      nameInput.addEventListener('input', sync);
      addBtn = el('button', { text: 'Add model', onClick: function () { app.confirmImport(); }, style: "height:31px;padding:0 15px;border:none;background:#16a34a;color:#fff;border-radius:7px;cursor:pointer;font:600 12px/1 'IBM Plex Sans';flex:none;" });
      panel.appendChild(el('div', { style: 'margin-top:11px;padding:12px;background:#f0f7f1;border:1px solid #cde5d2;border-radius:9px;' }, [
        el('div', { style: 'font-size:12px;color:#166534;font-weight:600;margin-bottom:9px;', text: '✓ ' + st.importSummary }),
        el('div', { style: 'display:flex;gap:8px;' }, [nameInput, addBtn]),
        note
      ]));
      sync();
    }
    panel.appendChild(el('div', {
      style: 'margin-top:13px;font-size:10.5px;color:#9aa1ad;line-height:1.55;',
      html: 'From Power BI Desktop: save as <span style="' + mono + '">.pbip</span> — the <span style="' + mono + '">*.SemanticModel/definition</span> folder holds the TMDL files. From Tabular Editor: File → Save As → <span style="' + mono + '">model.bim</span>.'
    }));

    this.host.appendChild(el('div', {
      onClick: function () { app.setState({ showImport: false }); },
      style: 'position:fixed;inset:0;z-index:100;background:rgba(22,27,38,.46);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);'
    }, panel));
  };

  /* ================= folder chooser (local app) ================= */
  /* Lists folders through scripts/serve.py so the browser's own picker - and its permission
     prompt - is never involved. Driven by app.state.folderPick (see app.pickFolder). */
  function folderChooser(app, fp) {
    var mono = "font-family:'IBM Plex Mono',monospace;";
    var btn = function (text, onClick, primary) {
      return el('button', { text: text, onClick: onClick, style: "height:29px;padding:0 13px;border:1px solid " + (primary ? '#2563eb;background:#2563eb;color:#fff' : '#dce0e6;background:#fff;color:#2b3140') + ";border-radius:7px;cursor:pointer;font:600 11.5px/1 'IBM Plex Sans';flex:none;" });
    };
    var cancel = function () { app.finishFolderPick(null); };
    var row = function (label, meta, onClick, strong) {
      return el('div', {
        role: 'button', tabindex: '0', onClick: onClick,
        onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
        style: 'display:flex;align-items:center;gap:9px;padding:7px 11px;cursor:pointer;border-bottom:1px solid #eef0f3;font-size:12.5px;color:#1f2430;' + (strong ? 'font-weight:600;background:#f3f7ff;' : '')
      }, [
        el('span', { style: 'color:' + (strong ? '#2563eb' : '#9aa1ad') + ';flex:none;display:flex;', html: U.ICON.folder }),
        el('span', { style: 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: label }),
        meta ? el('span', { style: 'font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#2563eb;font-weight:700;flex:none;', text: meta }) : null
      ]);
    };
    var pathInput = el('input', {
      value: fp.path || '', spellcheck: 'false', placeholder: 'Folder path',
      style: "flex:1;min-width:0;height:31px;padding:0 10px;border:1px solid #cbd5cd;border-radius:7px;font-size:12px;" + mono + "outline:none;background:#fff;color:#1f2430;",
      onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); app.browseTo(e.target.value); } }
    });
    var list = el('div', { style: 'margin-top:10px;max-height:320px;overflow:auto;border:1px solid #e6e9ee;border-radius:9px;background:#fff;' });
    if (fp.loading) list.appendChild(el('div', { style: 'padding:14px;font-size:12px;color:#9aa1ad;', text: 'Loading…' }));
    else {
      if (fp.parent) list.appendChild(row('..', '', function () { app.browseTo(fp.parent); }));
      (fp.dirs || []).forEach(function (d) { list.appendChild(row(d.name, d.model ? 'Semantic model' : '', function () { app.browseTo(d.path); }, d.model)); });
      if (!(fp.dirs || []).length) list.appendChild(el('div', { style: 'padding:12px 14px;font-size:12px;color:#9aa1ad;', text: 'No subfolders here.' }));
    }
    var roots = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;' }, (fp.roots || []).map(function (r) {
      return el('button', { text: r.name, title: r.path, onClick: function () { app.browseTo(r.path); }, style: "height:24px;padding:0 9px;border:1px solid #dce0e6;background:#fff;border-radius:6px;cursor:pointer;font:500 11px/1 'IBM Plex Sans';color:#4b5563;" });
    }));
    var panel = el('div', {
      onClick: function (e) { e.stopPropagation(); },
      style: 'width:560px;max-width:calc(100vw - 40px);background:#fff;border-radius:14px;box-shadow:0 30px 70px rgba(10,16,30,.35);padding:20px 22px;'
    }, [
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;' }, [
        el('div', { style: 'flex:1;min-width:0;font-size:16px;font-weight:600;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', text: fp.title }),
        el('button', { text: '×', onClick: cancel, style: 'width:26px;height:26px;border:none;background:#eef0f3;border-radius:7px;cursor:pointer;color:#6b7280;font-size:16px;line-height:1;' })
      ]),
      fp.hint ? el('div', { style: 'font-size:12px;color:#7a828f;line-height:1.5;margin-bottom:12px;', text: fp.hint }) : null,
      el('div', { style: 'display:flex;gap:8px;' }, [pathInput, btn('Go', function () { app.browseTo(pathInput.value); })]),
      roots,
      list,
      fp.error ? el('div', { style: 'margin-top:9px;padding:8px 11px;background:#fdecec;border:1px solid #f6c9c9;border-radius:8px;font-size:12px;color:#b91c1c;line-height:1.45;', text: fp.error }) : null,
      el('div', { style: 'display:flex;justify-content:flex-end;gap:8px;margin-top:13px;' }, [
        btn('Cancel', cancel),
        btn(fp.model ? 'Use this model folder' : 'Use this folder', function () { app.finishFolderPick(fp.path); }, true)
      ])
    ]);
    return el('div', {
      onClick: cancel,
      style: 'position:fixed;inset:0;z-index:101;background:rgba(22,27,38,.46);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);'
    }, panel);
  }

  g.TopBar = TopBar; g.Legend = Legend; g.Hint = Hint; g.ImportModal = ImportModal;
})(window);
