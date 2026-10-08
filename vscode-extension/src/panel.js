/* The webview uses the canonical viewer copied into media by scripts/sync-viewer.js.
   Only this host reads workspace files, persists settings or writes exported snapshots. */
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findModels, readModelFiles } = require('./workspace');
const { runCleaner, loadAnalysisInteractive } = require('./cleaner');

const STORAGE_PREFIX = 'smv:';
const VIEW_TYPE = 'semanticModelViewer';
const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const REQUESTS = new Set(['listModels', 'openModel', 'loadAnalysis', 'refreshModel', 'snapshotAssets', 'saveSnapshot', 'prepareMeasureEdit', 'saveMeasureEdit', 'prepareRelationshipEdit', 'saveRelationshipEdit']);
const EVENTS = new Set(['ready', 'storage', 'notify', 'openFile']);
const storageKey = (key) => typeof key === 'string' && key.length <= 1024 && /^(?:smv[_-].+|lsa_model_layout_v1)$/.test(key) && !/[\u0000-\u001f]/.test(key);
const requestId = (id) => (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0) || (typeof id === 'string' && id.length > 0 && id.length <= 128);
const escapeAttribute = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function assetUri(webview, mediaUri, url) {
  const match = /^(?:\.\/)?(js\/[a-z0-9-]+\.js|[a-z0-9-]+\.css)(\?[^#\s]*)?$/i.exec(url);
  if (!match) throw new Error('Unsupported viewer asset: ' + url);
  return escapeAttribute(String(webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, ...match[1].split('/')))) + (match[2] || ''));
}

function buildHtml(webview, mediaUri) {
  const nonce = crypto.randomBytes(16).toString('hex');
  let html = fs.readFileSync(path.join(mediaUri.fsPath, 'index.html'), 'utf8');
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!href || !/\brel\s*=\s*["']stylesheet["']/i.test(tag)) return '';
    if (/^(?:https?:)?\/\//i.test(href[1])) return '';
    return tag.replace(href[0], 'href="' + assetUri(webview, mediaUri, href[1]) + '"');
  });
  let injected = false;
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi, (tag, url) => {
    if (/\/(?:host-web|host-vscode)\.js(?:\?|$)/.test(url)) return '';
    const script = `<script nonce="${nonce}" src="${assetUri(webview, mediaUri, url)}"></script>`;
    if (injected) return script;
    injected = true;
    return `<script nonce="${nonce}" src="${assetUri(webview, mediaUri, './js/host-vscode.js')}"></script>\n` + script;
  });
  if (!injected) throw new Error('The packaged viewer scripts are missing.');
  const csp = `default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';`;
  return html.replace(/<head>/i, '<head>\n<meta http-equiv="Content-Security-Policy" content="' + escapeAttribute(csp) + '">');
}

function snapshotAssets(mediaUri) {
  const template = fs.readFileSync(path.join(mediaUri.fsPath, 'index.html'), 'utf8');
  const { files } = require(path.join(mediaUri.fsPath, 'js', 'snapshot.js'));
  if (!Array.isArray(files) || !files.length) throw new Error('The packaged snapshot assets are unavailable.');
  const sources = {};
  for (const file of files) {
    if (typeof file !== 'string' || !/^(?:js\/[a-z0-9-]+\.js|[a-z0-9-]+\.css)$/i.test(file) || /host-/.test(file)) throw new Error('Invalid packaged snapshot asset.');
    sources[file] = fs.readFileSync(path.join(mediaUri.fsPath, file), 'utf8');
  }
  return { template, sources };
}

function snapshotFilename(value) {
  const name = String(value || 'Semantic model snapshot.html').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 180);
  const base = name.replace(/\.html?$/i, '').replace(/[. ]+$/g, '') || 'Semantic model snapshot';
  return base + '.html';
}

/* Check both lexical and resolved paths: a symlink in a model must not open a file
   elsewhere in the workspace (or elsewhere on the machine). */
function modelFileUri(entry, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.length > 4096 || /[\u0000-\u001f]/.test(relativePath)) throw new Error('Invalid model file path.');
  const rel = relativePath.replace(/\\/g, '/');
  if (path.posix.isAbsolute(rel) || /^[a-z]:/i.test(rel) || rel.split('/').includes('..') || !/\.(tmdl|bim|json)$/i.test(rel)) throw new Error('The file must be inside the current semantic model.');
  const root = entry.kind === 'file' ? path.dirname(entry.uri.fsPath) : entry.uri.fsPath;
  const target = path.resolve(root, rel);
  const inside = (base, file) => { const delta = path.relative(base, file); return delta !== '' && delta !== '..' && !delta.startsWith('..' + path.sep) && !path.isAbsolute(delta); };
  if (!inside(root, target) || (entry.kind === 'file' && target !== path.resolve(entry.uri.fsPath))) throw new Error('The file must be inside the current semantic model.');
  if (!inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('The file must be inside the current semantic model.');
  if (!fs.statSync(target).isFile()) throw new Error('Choose a model source file.');
  return vscode.Uri.file(target);
}

class ViewerPanel {
  constructor(context) {
    this.context = context;
    this.panel = null;
    this.current = null;
    this.pendingOpen = null;
    this.ready = false;
    this.watcher = null;
    this.watchTimer = null;
    this.epoch = 0;
    this.initializing = null;
    this.measureEdit = null;
    this.output = vscode.window.createOutputChannel ? vscode.window.createOutputChannel('Semantic Model Viewer') : null;
  }

  get mediaUri() { return vscode.Uri.joinPath(this.context.extensionUri, 'media'); }
  isCurrent(panel, epoch) { return this.panel === panel && this.epoch === epoch; }

  async show(entry) {
    if (!this.panel) {
      const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'Semantic Model Viewer', vscode.ViewColumn.Active, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.mediaUri]
      });
      this.panel = panel;
      this.ready = false;
      panel.webview.html = buildHtml(panel.webview, this.mediaUri);
      panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg, panel));
      panel.onDidDispose(() => {
        if (this.panel !== panel) return;
        this.epoch++; this.panel = null; this.ready = false; this.current = null;
        this.pendingOpen = null; this.initializing = null; this.disposeWatcher();
      });
    } else this.panel.reveal();
    if (!entry) return;
    const panel = this.panel, epoch = ++this.epoch;
    this.current = entry; this.pendingOpen = entry; this.disposeWatcher();
    panel.title = entry.name + ' — Semantic Model Viewer';
    if (this.ready) {
      try {
        const message = await this.modelMessage(entry);
        if (!this.isCurrent(panel, epoch)) return;
        this.pendingOpen = null;
        await this.post(message, panel);
        this.afterOpen(entry, panel, epoch);
      } catch (error) { if (this.isCurrent(panel, epoch)) this.fail(error, panel); }
    }
  }

  post(msg, panel = this.panel) { return panel && this.panel === panel ? panel.webview.postMessage(msg) : Promise.resolve(false); }
  fail(error, panel = this.panel) {
    const message = (error && error.message) || String(error);
    if (this.output) this.output.appendLine('error: ' + message);
    return this.post({ type: 'error', message }, panel);
  }

  async modelMessage(entry) {
    const files = await readModelFiles(entry);
    return { type: 'model', modelId: entry.id, name: entry.name, path: entry.path, files };
  }

  afterOpen(entry, panel, epoch) {
    if (!this.isCurrent(panel, epoch)) return;
    this.setupWatcher(entry);
    if (vscode.workspace.isTrusted === true && vscode.workspace.getConfiguration('semanticModelViewer').get('cleaner.autoRun')) {
      runCleaner(entry, this.output).then((data) => {
        if (data && this.isCurrent(panel, epoch)) this.post({ type: 'usage', modelId: entry.id, data }, panel);
      }).catch((error) => { if (this.isCurrent(panel, epoch)) this.fail(error, panel); });
    }
  }

  async onMessage(msg, panel = this.panel) {
    if (!panel || panel !== this.panel || !msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return;
    if (!REQUESTS.has(msg.type) && !EVENTS.has(msg.type)) return;
    if (REQUESTS.has(msg.type) && !requestId(msg.id)) return;
    const reply = (payload) => this.post(Object.assign({}, payload, { id: msg.id, type: msg.type }), panel);
    try { return await this.handleMessage(msg, panel, reply); }
    catch (error) { return REQUESTS.has(msg.type) ? reply({ error: (error && error.message) || String(error) }) : this.fail(error, panel); }
  }

  async handleMessage(msg, panel, reply) {
    switch (msg.type) {
      case 'ready': {
        if (this.ready || this.initializing === panel) return;
        this.initializing = panel;
        try {
          const models = await findModels();
          while (this.panel === panel) {
            const epoch = this.epoch, entry = this.pendingOpen || this.current;
            let open = null;
            if (entry) {
              try { open = await this.modelMessage(entry); }
              catch (error) { if (this.isCurrent(panel, epoch)) await this.fail(error, panel); }
            }
            if (!this.isCurrent(panel, epoch)) continue;
            this.pendingOpen = null; this.ready = true;
            await this.post({ type: 'init', storage: this.storageDump(), models: models.map(pub), caps: {}, open }, panel);
            if (open) this.afterOpen(entry, panel, epoch);
            return;
          }
        } finally { if (this.initializing === panel) this.initializing = null; }
        return;
      }
      case 'storage':
        if (!storageKey(msg.key) || (msg.value !== null && typeof msg.value !== 'string') || (typeof msg.value === 'string' && msg.value.length > MAX_SNAPSHOT_BYTES)) throw new Error('Invalid viewer storage value.');
        await this.context.workspaceState.update(STORAGE_PREFIX + msg.key, msg.value === null ? undefined : msg.value);
        return;
      case 'listModels': return reply({ models: (await findModels()).map(pub) });
      case 'openModel': {
        if (typeof msg.modelId !== 'string' || !msg.modelId || msg.modelId.length > 8192) throw new Error('Invalid model identifier.');
        const epoch = ++this.epoch;
        const models = await findModels();
        if (!this.isCurrent(panel, epoch)) return reply({ cancelled: true });
        const entry = models.find((m) => m.id === msg.modelId);
        if (!entry) throw new Error('Model not found in the workspace: ' + msg.modelId);
        this.current = entry; this.pendingOpen = null; this.disposeWatcher();
        panel.title = entry.name + ' — Semantic Model Viewer';
        const message = await this.modelMessage(entry);
        if (!this.isCurrent(panel, epoch)) return reply({ cancelled: true });
        await reply(message);
        this.afterOpen(entry, panel, epoch);
        return;
      }
      case 'prepareRelationshipEdit':
      case 'saveRelationshipEdit': {
        if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before editing model source.');
        const editor = require('./relationship-save');
        return reply(msg.type === 'prepareRelationshipEdit' ? await editor.prepare(this, msg, panel, readModelFiles) : await editor.save(this, msg, panel, readModelFiles, vscode));
      }
      case 'prepareMeasureEdit': {
        if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before editing model source.');
        if (!this.current || msg.modelId !== this.current.id || this.current.kind === 'file') throw new Error('Open the same TMDL model before editing.');
        const entry = this.current, epoch = this.epoch;
        const files = await readModelFiles(entry);
        if (!this.isCurrent(panel, epoch)) throw new Error('The model changed.');
        const { prepareMeasurePatch } = require('./measure-edit');
        const candidates = files.filter(f => /\.tmdl$/i.test(f.path)).map(f => ({ file: f, patch: prepareMeasurePatch(f.text, msg.table, msg.measure, msg.dax, msg.metadata) })).filter(c => c.patch);
        if (candidates.length !== 1) throw new Error('Could not identify one measure source file.');
        const { file, patch } = candidates[0];
        const uri = modelFileUri(entry, file.path);
        const bytes = fs.readFileSync(uri.fsPath);
        if (bytes.toString('utf8').replace(/^\uFEFF/, '') !== file.text.replace(/^\uFEFF/, '') || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) throw new Error('Source changed or is not UTF-8. Refresh the model.');
        const original = bytes.toString('utf8');
        const exact = prepareMeasurePatch(original, msg.table, msg.measure, msg.dax, msg.metadata);
        const token = crypto.randomBytes(24).toString('hex');
        this.measureEdit = { token, entry, epoch, uri, original, next: exact.text };
        return reply({ token, path: file.path, before: msg.metadata ? exact.before : patch.original, after: msg.metadata ? exact.after : msg.dax });
      }
      case 'saveMeasureEdit': {
        if (!vscode.workspace.isTrusted) throw new Error('Trust the workspace before editing model source.');
        const edit = this.measureEdit;
        if (!edit || msg.token !== edit.token || this.current !== edit.entry || !this.isCurrent(panel, edit.epoch)) throw new Error('The edit is stale. Review it again.');
        modelFileUri(edit.entry, path.relative(edit.entry.uri.fsPath, edit.uri.fsPath));
        if ((vscode.workspace.textDocuments || []).some(d => d.uri.toString() === edit.uri.toString() && d.isDirty)) throw new Error('The source has unsaved editor changes. Save or discard them before reviewing again.');
        if (fs.readFileSync(edit.uri.fsPath, 'utf8') !== edit.original) throw new Error('The source changed externally. Refresh and review again.');
        const temp = edit.uri.fsPath + '.smv-' + edit.token;
        try {
          fs.writeFileSync(temp, edit.next, { encoding: 'utf8', flag: 'wx', mode: fs.statSync(edit.uri.fsPath).mode });
          fs.renameSync(temp, edit.uri.fsPath);
        } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
        this.measureEdit = null;
        return reply({ saved: true, model: await this.modelMessage(edit.entry) });
      }
      case 'refreshModel': return reply(await this.refresh());
      case 'loadAnalysis': {
        if (!this.current) throw new Error('Open a model first.');
        const entry = this.current, epoch = this.epoch;
        const data = await loadAnalysisInteractive(entry, this.output);
        return reply(this.isCurrent(panel, epoch) ? { data, modelId: entry.id } : { cancelled: true });
      }
      case 'snapshotAssets': return reply(snapshotAssets(this.mediaUri));
      case 'saveSnapshot': {
        if (typeof msg.html !== 'string' || !msg.html.trim() || Buffer.byteLength(msg.html, 'utf8') > MAX_SNAPSHOT_BYTES || (msg.filename !== undefined && typeof msg.filename !== 'string')) throw new Error('Invalid HTML snapshot.');
        const filename = snapshotFilename(msg.filename);
        const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        const chosen = await vscode.window.showSaveDialog({
          defaultUri: folder ? vscode.Uri.joinPath(folder.uri, filename) : vscode.Uri.file(path.join(require('os').homedir(), filename)),
          saveLabel: 'Save snapshot', filters: { 'HTML snapshot': ['html'] }
        });
        if (!chosen) return reply({ cancelled: true });
        await vscode.workspace.fs.writeFile(chosen, Buffer.from(msg.html, 'utf8'));
        return reply({ filename: path.basename(chosen.fsPath || chosen.path) });
      }
      case 'notify': {
        if (typeof msg.message !== 'string' || msg.message.length > 10000 || !['error', 'info'].includes(msg.level)) throw new Error('Invalid viewer notification.');
        const fn = msg.level === 'error' ? vscode.window.showErrorMessage : vscode.window.showInformationMessage;
        await fn(msg.message);
        return;
      }
      case 'openFile': {
        if (!this.current) throw new Error('Open a model first.');
        const epoch = this.epoch, uri = modelFileUri(this.current, msg.path);
        const doc = await vscode.workspace.openTextDocument(uri);
        if (this.isCurrent(panel, epoch)) await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        return;
      }
    }
  }

  storageDump() {
    const out = {};
    for (const key of this.context.workspaceState.keys()) {
      if (key.startsWith(STORAGE_PREFIX) && storageKey(key.slice(STORAGE_PREFIX.length))) out[key.slice(STORAGE_PREFIX.length)] = this.context.workspaceState.get(key);
    }
    return out;
  }

  async refresh() {
    if (!this.panel || !this.current) { vscode.window.showInformationMessage('Semantic Model Viewer: no model is open.'); return { cancelled: true }; }
    const panel = this.panel, entry = this.current, epoch = ++this.epoch;
    try {
      const message = await this.modelMessage(entry);
      if (!this.isCurrent(panel, epoch)) return { cancelled: true };
      await this.post(message, panel);
      this.afterOpen(entry, panel, epoch);
      return { refreshed: true, modelId: entry.id };
    } catch (error) {
      if (!this.isCurrent(panel, epoch)) return { cancelled: true };
      await this.fail(error, panel);
      return { error: (error && error.message) || String(error) };
    }
  }

  async loadAnalysisCommand() {
    if (!this.panel || !this.current) { vscode.window.showInformationMessage('Semantic Model Viewer: open a model first.'); return; }
    const panel = this.panel, entry = this.current, epoch = this.epoch;
    try {
      const data = await loadAnalysisInteractive(entry, this.output);
      if (data && this.isCurrent(panel, epoch)) await this.post({ type: 'usage', modelId: entry.id, data }, panel);
    } catch (error) { if (this.isCurrent(panel, epoch)) this.fail(error, panel); }
  }

  setupWatcher(entry) {
    this.disposeWatcher();
    const panel = this.panel;
    const bump = () => {
      clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => { this.watchTimer = null; if (this.panel === panel && this.current === entry) this.refresh(); }, 400);
    };
    const pattern = entry.kind === 'file'
      ? new vscode.RelativePattern(vscode.Uri.file(path.dirname(entry.uri.fsPath)), path.basename(entry.uri.fsPath))
      : new vscode.RelativePattern(entry.uri, '**/*.{tmdl,bim}');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange(bump); this.watcher.onDidCreate(bump); this.watcher.onDidDelete(bump);
  }
  disposeWatcher() { clearTimeout(this.watchTimer); this.watchTimer = null; if (this.watcher) { this.watcher.dispose(); this.watcher = null; } }
  dispose() { this.disposeWatcher(); if (this.panel) this.panel.dispose(); if (this.output && this.output.dispose) this.output.dispose(); this.output = null; }
}

function pub(m) { return { id: m.id, name: m.name, path: m.path }; }
module.exports = { ViewerPanel, buildHtml, snapshotAssets, snapshotFilename, modelFileUri };
