'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../tools/fabric/bridge.cjs');
const W = '00000000-0000-0000-0000-000000000001';
const M = '00000000-0000-0000-0000-000000000002';
function fixture(extra = {}) {
  let account = { id: 'user-one', tenantId: 'tenant-one', name: 'test@example.invalid' };
  const auth = { status: async () => ({ configured: true, account }), signIn: async () => account,
    signOut: async () => { account = null; }, cancel() {} };
  const client = { listWorkspaces: async () => [{ id: W, displayName: 'Synthetic workspace' }],
    listModels: async () => [{ id: M, displayName: 'Synthetic model' }],
    getModelDefinition: async () => ({ transport: 'xmla', parts: [{ path: 'model.bim', content: '{"model":{"tables":[]}}' }] }), ...extra };
  return createService({ auth, client });
}
test('default public-client build reports readiness without starting login', async () => {
  const old = process.env.SMV_FABRIC_CLIENT_ID; delete process.env.SMV_FABRIC_CLIENT_ID;
  try {
    const service = createService();
    const state = await service.request({ action: 'status' });
    let hasMsal = false;
    try { require.resolve('@azure/msal-node', { paths: [require('node:path').join(__dirname, '../tools/fabric')] }); hasMsal = true; } catch {}
    assert.equal(state.available, hasMsal);
    assert.equal(state.account, null);
    if (!hasMsal) assert.match(state.message, /dependencies/);
  } finally { if (old === undefined) delete process.env.SMV_FABRIC_CLIENT_ID; else process.env.SMV_FABRIC_CLIENT_ID = old; }
});
test('opening and refreshing resolves names from discovery and returns only metadata identity', async () => {
  const service = fixture();
  const result = await service.request({ action: 'openModel', workspaceId: W, modelId: M, workspaceName: 'untrusted' });
  assert.equal(result.workspaceName, 'Synthetic workspace');
  assert.equal(result.accountId, 'user-one');
  assert.deepEqual(result.files, [{ path: 'model.bim', name: 'model.bim', text: '{"model":{"tables":[]}}' }]);
  assert.ok(result.fetchedAt);
  assert.equal(result.accessToken, undefined);
});
test('wrong tenant or same-tenant account cannot refresh cached metadata', async () => {
  const service = fixture();
  await assert.rejects(service.request({ action: 'openModel', workspaceId: W, modelId: M, tenantId: 'other' }), /different tenant/);
  await assert.rejects(service.request({ action: 'openModel', workspaceId: W, modelId: M, tenantId: 'tenant-one', accountId: 'user-two' }), /different account/);
});
test('sign-out prevents late discovery from populating the new session', async () => {
  let release;
  const service = fixture({ listWorkspaces: () => new Promise(resolve => { release = resolve; }) });
  const pending = service.request({ action: 'listWorkspaces' });
  await new Promise(resolve => setImmediate(resolve));
  await service.request({ action: 'signOut' });
  release([{ id: W, displayName: 'old account' }]);
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(service.request({ action: 'openModel', workspaceId: W, modelId: M }), /Sign in/);
});
test('cancel aborts live retrieval and prevents late success', async () => {
  let release, signal;
  const service = fixture({ getModelDefinition: (w, m, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); } });
  const pending = service.request({ action: 'openModel', workspaceId: W, modelId: M });
  await new Promise(resolve => setImmediate(resolve));
  await service.request({ action: 'cancel' });
  assert.equal(signal.aborted, true);
  release({ parts: [{ path: 'model.bim', content: '{}' }] });
  await assert.rejects(pending, /cancelled/);
});
test('XMLA metadata paths are checked independently of the transport', async () => {
  const service = fixture({ getModelDefinition: async () => ({ transport: 'xmla', parts: [{ path: '../model.bim', content: '{}' }] }) });
  await assert.rejects(service.request({ action: 'openModel', workspaceId: W, modelId: M }), /unsafe/);
});
test('late refresh discovery cannot populate a switched session', async () => {
  let resolveOld; let calls = 0;
  const service = fixture({ listWorkspaces: () => { calls++; return calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve([]); } });
  const pending = service.request({ action: 'openModel', workspaceId: W, modelId: M });
  await new Promise(resolve => setImmediate(resolve));
  await service.request({ action: 'cancel' });
  resolveOld([{ id: W, displayName: 'old' }]);
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(service.request({ action: 'openModel', workspaceId: W, modelId: M }), /no longer accessible/);
  assert.equal(calls, 2);
});
