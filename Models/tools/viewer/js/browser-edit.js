/* Repository source editing only. Never serialize the viewer projection. */
(function (g, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./measure-edit'), require('./relationship-edit'));
  else g.SMVBrowserEdit = factory(g.SMVMeasureEdit, g.SMVRelationshipEdit);
})(typeof window !== 'undefined' ? window : globalThis, function (patcher, relationships) {
  'use strict';
  async function read(handle) {
    var bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  function create(app) {
    var pending = null, sequence = 0, saving = false, failedRefresh = null;
    function source() {
      if (failedRefresh && failedRefresh.modelId === app.modelKey && failedRefresh.epoch === app._modelLoadRequest) return null;
      if (app.host || app.snapshotMode || !app.state.loaded) return null;
      var imported = app.localEditSource && app.localEditSource();
      if (imported) return imported;
      if (!app._repoLive) return null;
      return (app.repoModels || []).find(function (r) { return ((app.repoHandle && r.handle) || (app.server && app.server.editKey && app.repoPath && r.dir)) && 'repo:' + r.path === app.modelKey; }) || null;
    }
    function current(edit) { return source() === edit.source && app.modelKey === edit.modelId && app._modelLoadRequest === edit.epoch; }
    async function unchanged(edit) {
      var files = await app.readModelDir(edit.source.handle);
      if (files.length !== edit.files.length) return false;
      for (var file of files) {
        var original = edit.files.find(function (f) { return f.path === file.path; });
        if (!original || await read(file.handle) !== original.text) return false;
      }
      return true;
    }
    var adapter = {
      available: function () { return !!source(); },
      cancelEdit: function () { if (pending && pending.localToken) app.editApi('cancel', {token: pending.localToken}).catch(function () {}); pending = null; sequence++; },
      prepareEdit: async function (request, prepare) {
        adapter.cancelEdit(); var reviewId = sequence;
        if (saving) throw new Error('A save is in progress.');
        var rm = source(), epoch = app._modelLoadRequest;
        if (!rm || request.modelId !== app.modelKey) throw new Error('Not saved. Connect this repository model before editing.');
        var local = !!(app.server && rm.dir);
        var directory = local && rm.imported ? (await app._findModelDir({dir: rm.dir, name: rm.name}, rm.name)).dir : rm.dir;
        var files = local ? (await app.editApi('read', {dir: directory})).files : await app.readModelDir(rm.handle);
        for (var file of files) {
          if (local) continue;
          if (!file.handle) throw new Error('Source file handle is unavailable.');
          file.text = await read(file.handle);
        }
        var patch = prepare(files, request);
        var target = files.filter(function (f) { return f.path === patch.path; });
        if (!local && !target.length && patch.path === 'definition/relationships.tmdl') throw new Error('Not saved. Browser editing requires an existing definition/relationships.tmdl file. Create it in your source editor, then refresh; exclusive file creation is unavailable in this browser.');
        if (!local && (target.length !== 1 || !target[0].handle.createWritable)) throw new Error('The source is not writable.');
        var edit = { source: rm, modelId: request.modelId, epoch: epoch, files: files.map(function (f) { return { path: f.path, text: f.text }; }), file: target[0], original: target[0] && target[0].text, next: patch.text, token: String(reviewId) };
        edit.directory = directory;
        if (local) edit.localToken = (await app.editApi('prepare', {dir: directory, path: patch.path, text: patch.text, files: edit.files})).token;
        if (!current(edit) || reviewId !== sequence) { if (edit.localToken) app.editApi('cancel', {token: edit.localToken}).catch(function () {}); throw new Error('The edit is stale. Review it again.'); }
        pending = edit;
        return Object.assign({}, patch, { token: edit.token, text: undefined });
      },
      saveEdit: async function (token) {
        var edit = pending;
        if (saving || !edit || token !== edit.token || !current(edit)) throw new Error('The edit is stale. Review it again.');
        saving = true; pending = null;
        var stream = null, committed = false;
        try {
          if (edit.localToken) {
            await app.editApi('save', {token: edit.localToken}); committed = true;
          } else {
            // Called directly from the Save gesture, before other asynchronous work.
            var permission = await app.repoHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') throw new Error('Not saved. Write permission was not granted.');
            if (!current(edit)) throw new Error('The edit is stale. Review it again.');
            if (!await unchanged(edit)) throw new Error('The source changed externally. Refresh and review again.');
            stream = await edit.file.handle.createWritable({ keepExistingData: false });
            if (!current(edit) || !await unchanged(edit)) throw new Error('The source changed or the review is stale. Review it again.');
            await stream.write(new TextEncoder().encode(edit.next));
            if (!current(edit) || !await unchanged(edit)) throw new Error('The source changed or the review is stale. Review it again.');
            await stream.close(); committed = true;
          }
          var files = await app.readModelDir(edit.source.handle || {dir: edit.directory});
          var message = { modelId: edit.modelId, name: edit.source.name, path: edit.source.path, files: files };
          var model = adapter.parseModelMessage(message).model;
          var records = app.getStore().filter(function (r) { return r.id !== edit.modelId; });
          records.push({ id: edit.modelId, name: edit.source.name, at: Date.now(), repo: !edit.source.imported, model: model });
          if (!app.setStore(records)) throw new Error('Source saved, but browser cache refresh failed. Reopen the repository model.');
          return { saved: true, model: message };
        } catch (error) {
          if (stream && !committed) await stream.abort().catch(function () {});
          if (committed) failedRefresh = { modelId: edit.modelId, epoch: edit.epoch };
          if (committed && !/^Source saved/.test(error.message)) throw new Error('Source saved, but refresh failed: ' + error.message);
          throw error;
        } finally { saving = false; }
      },
      prepareMeasureEdit: function (request) {
        return adapter.prepareEdit(request, function (files, data) {
          var matches = files.filter(function (f) { return /\.tmdl$/i.test(f.path); }).map(function (f) {
            var p = patcher.prepareMeasurePatch(f.text, data.table, data.measure, data.dax, data.metadata);
            return p && { path: f.path, text: p.text, before: p.before === undefined ? p.original : p.before, after: p.after === undefined ? data.dax : p.after };
          }).filter(Boolean);
          if (matches.length !== 1) throw new Error('Could not identify one measure source file.');
          return matches[0];
        });
      },
      prepareRelationshipEdit: function (request) {
        return adapter.prepareEdit(request, function (files, data) {
          return relationships.prepareRelationshipPatch(files, data, data.relationshipId == null ? globalThis.crypto.randomUUID() : undefined);
        });
      },
      saveRelationshipEdit: function (token) { return adapter.saveEdit(token); },
      saveMeasureEdit: function (token) { return adapter.saveEdit(token); },
      parseModelMessage: function (message) {
        return { id: message.modelId, name: message.name, path: message.path, model: app.parseSourceFiles ? app.parseSourceFiles(message.files) : globalThis.TMDLParser.parseAny(message.files) };
      }
    };
    return adapter;
  }
  return { create: create };
});
