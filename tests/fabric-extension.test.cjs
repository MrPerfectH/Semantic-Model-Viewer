'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeVscode, install } = require('./vscode-mock');
const vscode = makeVscode({ folders: [] });
const restore = install(vscode);
const { FabricConnection } = require('../vscode-extension/src/fabric');
restore();
function fixture(tenant = 'tenant-one') {
  const state = new Map();
  const context = { globalState: { get: (key, fallback) => state.get(key) || fallback, update: async (key, value) => state.set(key, value) } };
  const calls = [];
  const service = { request: async payload => { calls.push(payload); if (payload.action === 'status') return { account: { tenantId: tenant, name: 'Work account' } }; return { tenantId: 'tenant-one', files: [{ path: 'model.bim', text: '{"model":{"tables":[]}}', accessToken: 'secret' }], accessToken: 'secret', name: 'Model', fetchedAt: '2026-10-13T12:00:00Z' }; } };
  return { connection: new FabricConnection(context, service), calls, state };
}
test('cache contains allowlisted metadata, stable tenant identity, and refresh replaces it', async () => {
  const { connection, calls } = fixture();
  const entry = await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' });
  assert.equal(entry.id, 'fabric:tenant-one:workspace:model');
  assert.equal(JSON.stringify(connection.entries()).includes('secret'), false);
  await connection.refresh(entry);
  assert.equal(connection.entries().length, 1);
  assert.equal(calls.at(-1).action, 'openModel');
  await connection.remove(entry.id);
  assert.equal(connection.entries().length, 0);
});
test('refresh rejects another tenant without fetching metadata or replacing cache', async () => {
  const { connection, calls } = fixture('tenant-two');
  const entry = await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' });
  await assert.rejects(connection.refresh(entry), /account and tenant that own/);
  assert.equal(calls.filter(c => c.action === 'openModel').length, 1);
  assert.equal(connection.entries()[0], entry);
});
test('invalid definitions cannot replace an existing cached model', async () => {
  const { connection } = fixture();
  const entry = await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' });
  connection.service = { request: async () => ({ tenantId: 'tenant-one', files: [{ path: 'bad.exe', text: 'data' }] }) };
  await assert.rejects(connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' }), /unsupported/);
  assert.equal(connection.entries()[0], entry);
});
test('sign-out retains explicitly saved offline metadata', async () => {
  const { connection, calls } = fixture();
  await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' });
  await connection.signOut();
  assert.equal(calls.at(-1).action, 'signOut');
  assert.equal(connection.entries().length, 1);
});
test('refresh rejects another work account in the same tenant', async () => {
  const { connection, calls } = fixture();
  const entry = await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' });
  entry.accountId = 'original-account';
  await assert.rejects(connection.refresh(entry), /account and tenant/);
  assert.equal(calls.filter(call => call.action === 'openModel').length, 1);
});
test('removal clears matching viewer metadata and layouts without touching other models', async () => {
  const { connection } = fixture();
  const state = new Map();
  connection.context.workspaceState = { get: key => state.get(key), update: async (key, value) => value === undefined ? state.delete(key) : state.set(key, value) };
  const source = { kind: 'fabric', tenantId: 'tenant-one', workspaceId: 'workspace', modelId: 'model' };
  state.set('smv:smv_models_v1', JSON.stringify([{ id: 'remote', source }, { id: 'local', source: { kind: 'local' } }]));
  state.set('smv:smv_layout_remote', '{"position":1}');
  state.set('smv:smv_layout_local', '{"position":2}');
  await connection.removeSource(source);
  assert.deepEqual(JSON.parse(state.get('smv:smv_models_v1')).map(record => record.id), ['local']);
  assert.equal(state.has('smv:smv_layout_remote'), false);
  assert.equal(state.has('smv:smv_layout_local'), true);
});
test('refresh preserves the explicitly selected REST metadata method', async () => {
  const { connection, calls } = fixture();
  const entry = await connection.open({ id: 'workspace', name: 'Workspace' }, { id: 'model', name: 'Model' }, undefined, 'rest');
  entry.method = 'rest';
  await connection.refresh(entry);
  assert.equal(calls.at(-1).transport, 'rest');
});
