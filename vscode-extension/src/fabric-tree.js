/* Native, lazy Fabric workspace/model browsing. No credentials enter tree nodes. */
'use strict';
const vscode = require('vscode');

class FabricTree {
  constructor(fabric) {
    this.fabric = fabric;
    this.generation = 0;
    this.pending = new Map();
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }
  refresh() { this.generation++; this.pending.clear(); this._emitter.fire(undefined); }
  dispose() { this.generation++; this.pending.clear(); this._emitter.dispose(); }
  async list(action, args, generation) {
    const items = [], seen = new Set();
    let continuationToken;
    do {
      const result = await this.fabric.request({ action, ...args, ...(continuationToken ? { continuationToken } : {}) });
      if (generation !== this.generation) return [];
      items.push(...(result.items || []));
      continuationToken = result.continuationToken;
      if (continuationToken && seen.has(continuationToken)) throw new Error('Fabric returned repeated pagination data.');
      seen.add(continuationToken);
    } while (continuationToken);
    return [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }
  async getChildren(element) {
    if (element && !['workspace', 'workspaces'].includes(element.kind)) return [];
    const generation = this.generation;
    try {
      const { account } = await this.fabric.request({ action: 'status' });
      if (generation !== this.generation) return [];
      if (!account) return [{ kind: 'action', name: 'Sign in to Fabric…', command: 'semanticModelViewer.fabricBrowseSignIn', icon: 'sign-in' }];
      if (element && (element.accountId !== account.id || element.tenantId !== account.tenantId)) return [];
      const identity = { accountId: account.id, tenantId: account.tenantId };
      if (!element) return [
        { kind: 'message', name: account.name || 'Signed in to Fabric', detail: `Account: ${account.name || account.id}\nTenant: ${account.tenantId}`, icon: 'account', ...identity },
        { kind: 'message', name: `Tenant: ${account.tenantId}`, icon: 'organization', ...identity },
        { kind: 'action', name: 'Switch account…', command: 'semanticModelViewer.fabricSwitchAccount', icon: 'account' },
        { kind: 'action', name: 'Sign out of Fabric', command: 'semanticModelViewer.fabricSignOut', icon: 'sign-out' },
        { kind: 'workspaces', name: 'Workspaces', ...identity }
      ];
      const isWorkspace = element.kind === 'workspace';
      const cacheKey = JSON.stringify([account.id, account.tenantId, element && element.id]);
      if (!this.pending.has(cacheKey)) {
        const promise = (async () => {
          const items = await this.list(isWorkspace ? 'listModels' : 'listWorkspaces', { ...identity, ...(isWorkspace ? { workspaceId: element.id } : {}) }, generation);
          return items.map(item => ({ ...item, ...identity, kind: isWorkspace ? 'model' : 'workspace', ...(isWorkspace ? { workspace: { id: element.id, name: element.name } } : {}) }));
        })();
        this.pending.set(cacheKey, promise);
        promise.catch(() => { if (this.pending.get(cacheKey) === promise) this.pending.delete(cacheKey); });
      }
      const items = await this.pending.get(cacheKey);
      if (generation !== this.generation) return [];
      return items.length ? items : [{ kind: 'message', name: isWorkspace ? 'No accessible semantic models' : 'No accessible workspaces', scope: element && element.id }];
    } catch (error) {
      if (generation !== this.generation) return [];
      return [{ kind: 'action', name: 'Could not load Fabric. Click to retry.', detail: error.message, scope: element && element.id, command: 'semanticModelViewer.refreshFabric', icon: 'warning' }];
    }
  }
  getTreeItem(node) {
    const item = new vscode.TreeItem(node.name, node.kind === 'workspaces' ? vscode.TreeItemCollapsibleState.Expanded : node.kind === 'workspace' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = JSON.stringify([node.kind, node.tenantId, node.accountId, node.workspace && node.workspace.id, node.scope, node.id || node.name]);
    item.iconPath = new vscode.ThemeIcon(node.kind === 'workspaces' ? 'folder-library' : node.kind === 'workspace' ? 'organization' : node.kind === 'model' ? 'database' : node.icon || 'info');
    item.tooltip = node.detail || (node.workspace ? `${node.name}\n${node.workspace.name}\n${node.id}` : node.name);
    item.contextValue = node.kind === 'workspace' ? 'fabricWorkspace' : node.kind === 'model' ? 'fabricSemanticModel' : 'fabricAction';
    if (node.kind === 'model') item.command = { command: 'semanticModelViewer.openFabricTreeModel', title: 'Open semantic model', arguments: [node] };
    else if (node.command) item.command = { command: node.command, title: node.name };
    return item;
  }
}
module.exports = { FabricTree };
