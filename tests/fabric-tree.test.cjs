'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { makeVscode, install } = require('./vscode-mock');
const vscode = makeVscode({ folders: [], extensionRoot: path.resolve(__dirname, '../vscode-extension') });
const restore = install(vscode);
const { FabricTree } = require('../vscode-extension/src/fabric-tree');
const extension = require('../vscode-extension/src/extension');
restore();
function fixture() {
  let account = { id: 'account', name: 'user@example.test', tenantId: 'tenant' };
  const calls = [];
  const fabric = { request: async p => {
    calls.push(p);
    if (p.action === 'status') return { account };
    if (p.action === 'listWorkspaces') return p.continuationToken ? { items: [{ id: 'a', name: 'Alpha' }] } : { items: [{ id: 'z', name: 'Zulu' }], continuationToken: 'page2' };
    if (p.action === 'listModels') return { items: [{ id: 'shared-id', name: p.workspaceId === 'a' ? 'Sales' : 'Inventory' }] };
  } };
  return { tree: new FabricTree(fabric), fabric, calls, setAccount(value) { account = value; } };
}
test('signed-out Fabric tree offers sign-in without starting authentication automatically', async () => {
  const f = fixture(); f.setAccount(null);
  const rows = await f.tree.getChildren();
  assert.equal(rows[0].command, 'semanticModelViewer.fabricBrowseSignIn');
  assert.deepEqual(f.calls.map(p => p.action), ['status']);
});
async function workspaces(tree) { return tree.getChildren((await tree.getChildren()).find(n => n.kind === 'workspaces')); }

test('tree discovers all workspace pages and lazily loads distinct models per workspace', async () => {
  const f = fixture(); const rows = await workspaces(f.tree);
  assert.deepEqual(rows.map(w => w.name), ['Alpha', 'Zulu']);
  assert.equal(f.calls.some(p => p.action === 'listModels'), false);
  const a = (await f.tree.getChildren(rows[0]))[0], z = (await f.tree.getChildren(rows[1]))[0];
  assert.equal(a.name, 'Sales'); assert.equal(z.name, 'Inventory');
  assert.notEqual(f.tree.getTreeItem(a).id, f.tree.getTreeItem(z).id);
  const item = f.tree.getTreeItem(a);
  assert.equal(item.command.command, 'semanticModelViewer.openFabricTreeModel');
  assert.equal(item.command.arguments[0].workspace.id, 'a');
  await f.tree.getChildren(rows[0]);
  assert.equal(f.calls.filter(p => p.action === 'listModels').length, 2, 'expansion reuses workspace-specific discovery');
  f.tree.refresh(); await f.tree.getChildren(rows[0]);
  assert.equal(f.calls.filter(p => p.action === 'listModels').length, 3);
});
test('changing tenants cannot reuse the former account workspace node', async () => {
  const f = fixture(); const workspace = (await workspaces(f.tree))[0];
  f.setAccount({ id: 'other', tenantId: 'other-tenant' });
  assert.deepEqual(await f.tree.getChildren(workspace), []);
  assert.equal(f.calls.some(p => p.action === 'listModels'), false);
});
test('refresh discards an old in-flight discovery result', async () => {
  const f = fixture(); let finish;
  f.fabric.request = p => p.action === 'status' ? Promise.resolve({ account: { id: 'account', tenantId: 'tenant' } }) : new Promise(r => { finish = r; });
  const pending = f.tree.getChildren({kind:'workspaces', accountId:'account', tenantId:'tenant'}); await new Promise(r => setImmediate(r));
  f.tree.refresh(); finish({ items: [{ id: 'old', name: 'Old workspace' }] });
  assert.deepEqual(await pending, []);
});
test('failed workspace expansion can be retried without reauthenticating', async () => {
  const f = fixture(); const workspace = (await workspaces(f.tree))[0];
  const request = f.fabric.request; let fail = true;
  f.fabric.request = p => p.action === 'listModels' && fail ? Promise.reject(new Error('Network unavailable')) : request(p);
  assert.equal((await f.tree.getChildren(workspace))[0].command, 'semanticModelViewer.refreshFabric');
  fail = false;
  assert.equal((await f.tree.getChildren(workspace))[0].name, 'Sales');
});
test('clicking a native tree model opens the correct model without quick-pick dialogs', async () => {
  const active = extension.activate(vscode.context);
  const f = fixture(), calls = [];
  active.fabricTree.fabric.service = { request: async p => {
    calls.push(p);
    if (p.action === 'openModel') return { tenantId: 'tenant', accountId: 'account', files: [{ path: 'model.bim', text: '{"model":{"tables":[]}}' }] };
    return f.fabric.request(p);
  } };
  const workspace = (await workspaces(active.fabricTree))[1];
  const model = (await active.fabricTree.getChildren(workspace))[0];
  let quickPicks = 0; const pick = vscode.window.showQuickPick;
  vscode.window.showQuickPick = async () => { quickPicks++; throw new Error('Unexpected model picker'); };
  try {
    const command = active.fabricTree.getTreeItem(model).command;
    await vscode.commands.executeCommand(command.command, ...command.arguments);
    assert.equal(quickPicks, 0);
    assert.equal(active.panel.current.workspaceId, 'z');
    assert.equal(active.panel.current.modelId, 'shared-id');
    const request = calls.find(p => p.action === 'openModel');
    assert.equal(request.workspaceId, 'z'); assert.equal(request.tenantId, 'tenant'); assert.equal(request.accountId, 'account');
  } finally { vscode.window.showQuickPick = pick; vscode.context.subscriptions.forEach(d => d.dispose()); }
});

test('signed-in sidebar shows account, tenant and sign-out even when discovery fails', async () => {
  const f = fixture();
  const request = f.fabric.request;
  f.fabric.request = p => p.action === 'listWorkspaces' ? Promise.reject(new Error('Network unavailable')) : request(p);
  const rows = await f.tree.getChildren();
  assert.ok(rows.some(n => n.name === 'user@example.test'));
  assert.ok(rows.some(n => n.name === 'Tenant: tenant'));
  assert.ok(rows.some(n => n.command === 'semanticModelViewer.fabricSwitchAccount'));
  assert.ok(rows.some(n => n.command === 'semanticModelViewer.fabricSignOut'));
  assert.deepEqual(f.calls.map(p => p.action), ['status'], 'account controls do not wait for discovery');
  const failed = await f.tree.getChildren(rows.find(n => n.kind === 'workspaces'));
  assert.equal(failed[0].command, 'semanticModelViewer.refreshFabric');
  f.setAccount(null); f.tree.refresh();
  assert.deepEqual((await f.tree.getChildren()).map(n => n.command), ['semanticModelViewer.fabricBrowseSignIn']);
});

test('unified sidebar routes sign-in and sign-out and refreshes identity without a separate view', async () => {
  const active = extension.activate(vscode.context);
  let account = null, refreshed = 0;
  const sub = active.tree.onDidChangeTreeData(() => refreshed++);
  active.fabricTree.fabric.service = { request: async p => {
    if (p.action === 'signIn') account = { id: 'new', name: 'new@example.test', tenantId: 'new-tenant' };
    if (p.action === 'signOut') account = null;
    return { account };
  }};
  try {
    const root = (await active.tree.getChildren())[0];
    assert.equal(root.kind, 'fabricRoot');
    assert.equal(active.tree.getTreeItem(root).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    let rows = await active.tree.getChildren(root);
    await vscode.commands.executeCommand(active.tree.getTreeItem(rows[0]).command.command);
    rows = await active.tree.getChildren(root);
    assert.ok(rows.some(n => n.name === 'new@example.test'));
    assert.ok(rows.some(n => n.name === 'Tenant: new-tenant'));
    const signOut = rows.find(n => n.command === 'semanticModelViewer.fabricSignOut');
    await vscode.commands.executeCommand(active.tree.getTreeItem(signOut).command.command);
    assert.equal((await active.tree.getChildren(root))[0].command, 'semanticModelViewer.fabricBrowseSignIn');
    assert.ok(refreshed >= 2);
    const manifest = require('../vscode-extension/package.json');
    assert.deepEqual(manifest.contributes.views.semanticModelViewer.map(v => v.id), ['semanticModelViewer.models']);
  } finally { sub.dispose(); vscode.context.subscriptions.forEach(d => d.dispose()); }
});

test('offline Fabric metadata is grouped separately from workspace files and exclusions open workspace settings',async()=>{
 const active=extension.activate(vscode.context);
 const cached={id:'fabric:synthetic',kind:'fabric',name:'Synthetic cached model',path:'Workspace / Synthetic',fetchedAt:'2026-10-27'};
 active.tree.fabric.entries=()=>[cached];
 try{
  const local=(await active.tree.getChildren()).find(n=>n.kind==='localRoot');
  assert.equal(active.tree.getTreeItem(local).label,'On this device');
  const rows=await active.tree.getChildren(local);
  assert.equal(rows.includes(cached),false);
  const group=rows.find(n=>n.kind==='cachedRoot');assert.ok(group);
  assert.match(active.tree.getTreeItem(group).tooltip,/not workspace files/);
  assert.deepEqual(await active.tree.getChildren(group),[cached]);
  const item=active.tree.getTreeItem(cached);assert.match(item.description,/Cached/);assert.equal(item.command.arguments[0],cached);
  const action=rows.find(n=>n.command==='semanticModelViewer.configureExclusions');assert.ok(action);
  let opened;const sub=vscode.commands.registerCommand('workbench.action.openWorkspaceSettings',setting=>{opened=setting;});
  await vscode.commands.executeCommand(action.command);assert.equal(opened,'semanticModelViewer.exclude');sub.dispose();
  let fired=0;const listener=active.tree.onDidChangeTreeData(()=>fired++);
  for(const change of vscode._configurationListeners)change({affectsConfiguration:key=>key==='semanticModelViewer.exclude'});
  assert.ok(fired>0);listener.dispose();
 }finally{vscode.context.subscriptions.forEach(d=>d.dispose());}
});
