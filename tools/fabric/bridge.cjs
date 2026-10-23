'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createFabricClient, FabricError } = require('./client.cjs');
const ACTIONS = new Set(['status', 'beginDeviceSignIn', 'signIn', 'signOut', 'cancel', 'listWorkspaces', 'listModels', 'openModel']);
const MAX_BYTES = 48 * 1024 * 1024;
function openBrowser(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com') throw new Error('Invalid Microsoft sign-in URL.');
  const command = process.platform === 'win32' ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', () => reject(new Error('Could not open Microsoft sign-in in your browser.')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Could not open Microsoft sign-in in your browser.')));
  });
}
function createService(options = {}) {
  const clientId = options.clientId || process.env.SMV_FABRIC_CLIENT_ID || require('./auth.cjs').POWER_BI_DESKTOP_CLIENT_ID;
  let auth = options.auth;
  let initializationError;
  if (!auth && clientId) {
    try { require.resolve('@azure/msal-node'); auth = require('./auth.cjs').createAuth({ ...options, clientId, openBrowser: options.openBrowser || openBrowser }); }
    catch { initializationError = 'Fabric sign-in dependencies are not installed in this build.'; }
  }
  let epoch = 0;
  const active = new Set(), workspaces = new Map(), models = new Map();
  let xmlaReader = options.xmlaReader;
  if (!xmlaReader) {
    try { xmlaReader = require('./xmla.cjs').createXmlaReader(options); } catch { /* Status remains useful while helper is being packaged. */ }
  }
  const client = options.client || (auth && createFabricClient({ getAccessToken: (audience, purpose) => auth.getAccessToken(audience, purpose), fetch: options.fetch, xmlaReader }));
  function cancel() {
    epoch++;
    for (const controller of active) controller.abort();
    active.clear();
    auth?.cancel?.();
  }
  async function status() {
    const state = auth ? await auth.status() : {};
    return { available: !!auth && !!client, account: state.account || null, deviceLogin: state.deviceLogin || null, deviceError: state.deviceError || null,
      message: initializationError || (!auth ? 'Fabric sign-in has not been configured in this build. The viewer publisher must provision its Microsoft application registration.' : '') };
  }
  async function request(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !ACTIONS.has(payload.action)) throw new FabricError('InvalidRequest', 'Invalid Fabric request.');
    if (JSON.stringify(payload).length > 16384) throw new FabricError('InvalidRequest', 'Fabric request is too large.');
    if (payload.transport && !['auto', 'xmla', 'rest'].includes(payload.transport)) throw new FabricError('InvalidRequest', 'Invalid Fabric connection method.');
    if (payload.action === 'status') return status();
    if (payload.action === 'cancel') { cancel(); return { cancelled: true }; }
    if (payload.action === 'signOut') {
      cancel(); workspaces.clear(); models.clear();
      await auth?.signOut();
      return status();
    }
    if (!auth || !client) throw new FabricError('NotConfigured', (await status()).message);
    if (payload.action === 'beginDeviceSignIn') {
      cancel(); workspaces.clear(); models.clear();
      return { deviceLogin: await auth.beginDeviceSignIn() };
    }
    if (payload.action === 'signIn') {
      cancel(); workspaces.clear(); models.clear();
      const before = epoch;
      await auth.signIn();
      if (before !== epoch) throw new FabricError('Cancelled', 'Fabric sign-in was cancelled.');
      return status();
    }
    const before = epoch;
    const account = (await auth.status()).account;
    if (before !== epoch) throw new FabricError('Cancelled', 'Fabric request was cancelled.');
    if (!account) throw new FabricError('NotSignedIn', 'Sign in with your Microsoft work account first.');
    if (payload.tenantId && payload.tenantId !== account.tenantId) throw new FabricError('WrongAccount', 'This cached model belongs to a different tenant. Sign in to its tenant before refreshing.');
    if (payload.accountId && payload.accountId !== account.id) throw new FabricError('WrongAccount', 'This cached model belongs to a different account. Sign in with its original account before refreshing.');
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(() => controller.abort(), 180000);
    const opts = { signal: controller.signal, search: typeof payload.search === 'string' ? payload.search.slice(0, 512) : '' };
    const checkCurrent = () => { if (before !== epoch || controller.signal.aborted) throw new FabricError('Cancelled', 'Fabric request was cancelled.'); };
    try {
      let result;
      if (payload.action === 'listWorkspaces') {
        const rows = await client.listWorkspaces(opts);
        if (before !== epoch) throw new FabricError('Cancelled', 'Fabric request was cancelled.');
        rows.forEach(row => workspaces.set(row.id, row));
        result = { items: rows.map(row => ({ id: row.id, name: row.displayName })) };
      } else if (payload.action === 'listModels') {
        const rows = await client.listModels(payload.workspaceId, opts);
        if (before !== epoch) throw new FabricError('Cancelled', 'Fabric request was cancelled.');
        rows.forEach(row => models.set(`${payload.workspaceId}:${row.id}`, row));
        result = { items: rows.map(row => ({ id: row.id, name: row.displayName })) };
      } else {
        // Refresh after restart must resolve current names through discovery, never caller-controlled endpoints.
        if (!workspaces.has(payload.workspaceId)) {
          const rows = await client.listWorkspaces(opts); checkCurrent();
          rows.forEach(row => workspaces.set(row.id, row));
        }
        if (!models.has(`${payload.workspaceId}:${payload.modelId}`)) {
          const rows = await client.listModels(payload.workspaceId, opts); checkCurrent();
          rows.forEach(row => models.set(`${payload.workspaceId}:${row.id}`, row));
        }
        const workspace = workspaces.get(payload.workspaceId), model = models.get(`${payload.workspaceId}:${payload.modelId}`);
        if (!workspace || !model) throw new FabricError('NotAccessible', 'This workspace or semantic model is no longer accessible to your account.');
        const definition = await client.getModelDefinition(payload.workspaceId, payload.modelId, { ...opts, transport: payload.transport || 'auto', workspaceName: workspace.displayName, modelName: model.displayName });
        const parts = definition.parts || definition.files;
        if (!Array.isArray(parts) || !parts.length) throw new FabricError('InvalidDefinition', 'Fabric returned no model metadata.');
        const seen = new Set();
        for (const part of parts) {
          if (!part || typeof part.path !== 'string' || part.path.startsWith('/') || /[\\:\x00-\x1f]/.test(part.path) || part.path.split('/').some(piece => !piece || piece === '.' || piece === '..') || seen.has(part.path)) throw new FabricError('InvalidDefinition', 'Fabric returned unsafe or duplicate model metadata paths.');
          seen.add(part.path);
        }
        const files = parts.filter(part => /\.(?:tmdl|bim|json)$/i.test(part.path)).map(part => ({ path: part.path, name: path.posix.basename(part.path), text: part.content === undefined ? part.text : part.content }));
        if (!files.length || files.some(file => typeof file.text !== 'string')) throw new FabricError('InvalidDefinition', 'Fabric returned no supported model metadata.');
        result = { files, accountId: account.id, tenantId: account.tenantId, workspaceId: payload.workspaceId, modelId: payload.modelId,
          name: model.displayName, workspaceName: workspace.displayName, fetchedAt: new Date().toISOString(), method: definition.transport,
          coverage: definition.coverage || 'definition', warnings: Array.isArray(definition.warnings) ? definition.warnings.filter(value => typeof value === 'string').slice(0, 20) : [] };
      }
      if (before !== epoch || controller.signal.aborted) throw new FabricError('Cancelled', 'Fabric request was cancelled.');
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new FabricError('DefinitionTooLarge', 'Fabric metadata exceeds the supported size.');
      return result;
    } finally { clearTimeout(timer); active.delete(controller); }
  }
  return { request, dispose: async () => { cancel(); }, cancel };
}
module.exports = { createService, openBrowser };
if (require.main === module) {
  const readline = require('node:readline');
  const service = createService();
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', async line => {
    let id;
    try {
      if (Buffer.byteLength(line) > 16384) throw new Error('Invalid Fabric request.');
      const message = JSON.parse(line); id = message.id;
      if (typeof id !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(id)) throw new Error('Invalid request ID.');
      const result = await service.request(message.payload);
      process.stdout.write(JSON.stringify({ id, result }) + '\n');
    } catch (error) {
      const message = error instanceof FabricError ? error.message : 'Fabric connection failed. Reconnect and try again.';
      process.stdout.write(JSON.stringify({ id, error: message }) + '\n');
    }
  });
  lines.on('close', () => { service.dispose().finally(() => process.exit(0)); });
}
