/* VS Code webview host adapter. The extension host owns the file system, settings and
   persistence; this file talks to it over postMessage and presents the same interface as
   js/host-web.js to the rest of the app.

   webview -> extension:  ready | storage {key,value} | listModels | openModel {modelId} |
                          loadAnalysis | notify {level,message} | openFile {path}
   extension -> webview:  init {storage,models,caps,open?} | model {modelId,name,path,files} |
                          models {models} | usage {data} | error {message} */
(function (g) {
  'use strict';

  var vscode = g.acquireVsCodeApi ? g.acquireVsCodeApi() : { postMessage: function () { }, getState: function () { }, setState: function () { } };
  var mem = Object.create(null);            // storage mirror, seeded by the init message
  var pending = Object.create(null);        // request id -> resolver
  var seq = 0;
  var app = null;
  var initResolve = null, initReject = null, bootTimer = null, initialized = false;
  var initP = new Promise(function (resolve, reject) { initResolve = resolve; initReject = reject; });

  function post(msg) { vscode.postMessage(msg); }
  function request(type, payload) {
    var id = ++seq;
    return new Promise(function (res, rej) {
      var timer = g.setTimeout(function () { delete pending[id]; rej(new Error('VS Code did not respond. Close and reopen the viewer to retry.')); }, 120000);
      pending[id] = { res: res, rej: rej, timer: timer };
      post(Object.assign({ type: type, id: id }, payload || {}));
    });
  }

  var host = {
    kind: 'vscode',
    caps: { drop: false, pickFiles: false, connectRepo: false, workspace: true, png: false, pickAnalysis: true },
    storage: {
      get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      set: function (k, v) { mem[k] = String(v); post({ type: 'storage', key: k, value: String(v) }); },
      del: function (k) { delete mem[k]; post({ type: 'storage', key: k, value: null }); }
    },
    config: {},
    models: [],
    _open: null,

    boot: function () {
      bootTimer = g.setTimeout(function () { initReject(new Error('VS Code did not initialize the viewer. Close and reopen it to retry.')); }, 120000);
      post({ type: 'ready' });
      return initP.then(function () { return host; });
    },
    attach: function (a) { app = a; },

    /* The model the extension asked us to open (command, context menu or default setting). */
    loadDefault: function () {
      var o = host._open; host._open = null;
      return Promise.resolve(o ? host.parseModelMessage(o) : null);
    },
    listModels: function () { return request('listModels').then(function (r) { host.models = r.models || []; return host.models; }); },
    openModel: function (id) { return request('openModel', { modelId: id }).then(function (m) { return m.cancelled ? null : host.parseModelMessage(m); }); },
    pickAnalysis: function () { return request('loadAnalysis').then(function (r) { return r && r.data ? r.data : null; }); },
    snapshotAssets: function () { return request('snapshotAssets'); },
    saveSnapshot: function (data) { return request('saveSnapshot', data); },
    refreshModel: function () { return request('refreshModel'); },
    openFile: function (path) { post({ type: 'openFile', path: path }); },
    notify: function (level, message) { post({ type: 'notify', level: level, message: message }); },

    parseModelMessage: function (m) {
      if (!m || !m.files) return null;
      var model = g.TMDLParser.parseAny(m.files);
      var name = m.name || model.name || 'Model';
      return { id: m.modelId, name: name, path: m.path, model: model, usage: m.usage || null };
    }
  };

  g.addEventListener('message', function (ev) {
    var msg = ev.data || {};
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id]; delete pending[msg.id]; g.clearTimeout(p.timer);
      if (msg.error) p.rej(new Error(msg.error)); else p.res(msg);
      return;
    }
    switch (msg.type) {
      case 'init':
        mem = Object.assign(Object.create(null), msg.storage || {});
        host.models = msg.models || [];
        if (msg.caps) Object.assign(host.caps, msg.caps);
        host._open = msg.open || null;
        initialized = true; g.clearTimeout(bootTimer); initResolve();
        break;
      case 'model':      // pushed by the extension: open / refresh a model
        if (app) { try { app.hostOpenModel(host.parseModelMessage(msg)); } catch (error) { app.setState({ repoError: error.message }); } }
        break;
      case 'models':
        host.models = msg.models || [];
        if (app) app.render(true);
        break;
      case 'usage':
        if (app && (!msg.modelId || msg.modelId === app.modelKey)) { try { app.setUsage(msg.data); } catch (error) { app.setState({ repoError: error.message }); } }
        break;
      case 'error':
        if (app) app.setState({ repoError: msg.message || 'Unknown error', showModelMenu: true });
        else if (!initialized) { g.clearTimeout(bootTimer); initReject(new Error(msg.message || 'VS Code could not initialize the viewer.')); }
        break;
    }
  });

  g.SMVHost = host;
})(window);
