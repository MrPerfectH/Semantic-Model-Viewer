/* Fabric credentials remain in the extension host; webviews receive metadata only. */
'use strict';
const vscode = require('vscode');
const path = require('path');
const CACHE_KEY = 'fabric:models:v1';
const TOKEN_KEY = 'fabric:tokens:v1';
const MAX_BYTES = 100 * 1024 * 1024;

class FabricConnection {
  constructor(context, service) { this.context = context; this.service = service; }
  async request(payload) {
    if (!this.service) {
      const location = path.join(this.context.extensionUri.fsPath, 'fabric', 'bridge.cjs');
      const { createService } = require(location);
      this.service = createService({
        openBrowser: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
        loadTokens: async () => { return await this.context.secrets.get(TOKEN_KEY) || null; },
        saveTokens: async (tokens) => tokens ? this.context.secrets.store(TOKEN_KEY, tokens) : this.context.secrets.delete(TOKEN_KEY)
      });
    }
    return this.service.request(payload);
  }
  entries() { return (this.context.globalState || this.context.workspaceState).get(CACHE_KEY, []) || []; }
  async save(entries) { await (this.context.globalState || this.context.workspaceState).update(CACHE_KEY, entries); if (this.onChange) this.onChange(); }
  async open(workspace, model, accountId, transport, tenantId) {
    const result = await this.request({ action: 'openModel', workspaceId: workspace.id, modelId: model.id, workspaceName: workspace.name, modelName: model.name, accountId, transport, ...(tenantId ? { tenantId } : {}) });
    const entry = this.fromResult(result, workspace, model);
    await this.save(this.entries().filter(e => e.id !== entry.id).concat(entry));
    return entry;
  }
  fromResult(result, workspace, model) {
    if (!result || !result.tenantId || !Array.isArray(result.files) || !result.files.length) throw new Error('Fabric returned no model definition.');
    const files = result.files.map(f => {
      if (typeof f.path !== 'string' || typeof f.text !== 'string' || !/\.(tmdl|bim|json)$/i.test(f.path)) throw new Error('Fabric returned an unsupported model definition.');
      return { path: f.path, name: path.posix.basename(f.path), text: f.text };
    });
    if (Buffer.byteLength(JSON.stringify(files)) > MAX_BYTES) throw new Error('Fabric model metadata exceeds the 100 MB cache limit.');
    return { id: `fabric:${result.tenantId}:${workspace.id}:${model.id}`, kind: 'fabric', name: result.name || model.name,
      path: `Fabric / ${workspace.name} / ${model.name}`, tenantId: result.tenantId, accountId: result.accountId,
      workspaceId: workspace.id, workspaceName: workspace.name, modelId: model.id,
      fetchedAt: result.fetchedAt || new Date().toISOString(), method: result.method,
      coverage: typeof result.coverage === 'string' ? result.coverage.slice(0, 512) : '',
      warnings: Array.isArray(result.warnings) ? result.warnings.filter(value => typeof value === 'string').slice(0, 20).map(value => value.slice(0, 4096)) : [], files };
  }
  async refresh(entry) {
    const status = await this.request({ action: 'status' });
    if (!status.account) await this.request({ action: 'signIn' });
    const signed = await this.request({ action: 'status' });
    if (!signed.account || signed.account.tenantId !== entry.tenantId || (entry.accountId && signed.account.id !== entry.accountId)) throw new Error('Sign in to the account and tenant that own this saved Fabric model.');
    return this.open({ id: entry.workspaceId, name: entry.workspaceName }, { id: entry.modelId, name: entry.name }, entry.accountId, entry.method === 'rest' ? 'rest' : 'xmla');
  }
  async remove(id) {
    const entry = this.entries().find(e => e.id === id);
    await this.save(this.entries().filter(e => e.id !== id));
    if (entry) await this.removeViewerRecord(entry);
  }
  async removeViewerRecord(source) {
    const key = 'smv:smv_models_v1';
    const raw = this.context.workspaceState && this.context.workspaceState.get(key);
    if (!raw) return;
    let records;
    try { records = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(records)) return;
    const matches = record => record.source && record.source.kind === 'fabric' && record.source.tenantId === source.tenantId && record.source.workspaceId === source.workspaceId && record.source.modelId === source.modelId;
    const removed = records.filter(matches);
    await this.context.workspaceState.update(key, JSON.stringify(records.filter(record => !matches(record))));
    for (const record of removed) {
      for (const prefix of ['smv:smv_layout_', 'smv:smv_presets_', 'smv:smv_src_']) await this.context.workspaceState.update(prefix + record.id, undefined);
    }
  }
  async removeSource(source) {
    const matches = e => e.tenantId === source.tenantId && e.workspaceId === source.workspaceId && e.modelId === source.modelId;
    await this.save(this.entries().filter(e => !matches(e)));
    await this.removeViewerRecord(source);
  }
  dispose() { if (this.service && this.service.dispose) this.service.dispose(); this.service = null; }
  async signOut() { await this.request({ action: 'signOut' }); }
  async choose(action, args, placeholder) {
    const response = await this.request(Object.assign({ action }, args));
    const items = response.items || [];
    let continuationToken = response.continuationToken;
    const seen = new Set();
    while (continuationToken) {
      if (seen.has(continuationToken)) throw new Error('Fabric returned repeated pagination data.');
      seen.add(continuationToken);
      const next = await this.request(Object.assign({ action, continuationToken }, args));
      items.push(...(next.items || []));
      continuationToken = next.continuationToken;
    }
    if (!items.length) { await vscode.window.showInformationMessage('No accessible Fabric items were found.'); return null; }
    const pick = await vscode.window.showQuickPick(items.map(item => ({ label: item.name, description: item.id, item })), { placeHolder: placeholder, matchOnDescription: true });
    return pick && pick.item;
  }
  async connect() {
    const status = await this.request({ action: 'status' });
    if (!status.account) await this.request({ action: 'signIn' });
    const workspace = await this.choose('listWorkspaces', {}, 'Choose a Fabric workspace');
    if (!workspace) return null;
    const model = await this.choose('listModels', { workspaceId: workspace.id }, 'Choose a semantic model');
    if (!model) return null;
    const choice = await vscode.window.showQuickPick([
      { label: 'Standard XMLA', description: 'Read + Build access; XMLA endpoint must be enabled', transport: 'xmla' },
      { label: 'Fabric definition API', description: 'Requires edit access to the model', transport: 'rest' }
    ], { placeHolder: 'Choose how to read the model metadata' });
    return choice ? this.open(workspace, model, undefined, choice.transport) : null;
  }
}
module.exports = { FabricConnection, CACHE_KEY, TOKEN_KEY };
