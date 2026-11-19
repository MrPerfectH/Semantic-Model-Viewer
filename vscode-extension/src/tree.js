/* "Semantic Model Viewer" view in the Activity Bar: one row per *.SemanticModel folder or
   model.bim in the workspace; click to open it in the viewer. */
'use strict';
const vscode = require('vscode');
const { findModels } = require('./workspace');

class ModelsTree {
  constructor(fabric, fabricTree) {
    this.fabric = fabric;
    this.fabricTree = fabricTree;
    this.fabricRoot = { kind: "fabricRoot", name: "Fabric", id: "fabricRoot" };
    this.localRoot = { kind: "localRoot", name: "On this device", id: "localRoot" };
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.models = [];
    this.fabricListener = fabricTree && fabricTree.onDidChangeTreeData(() => this.refresh());
  }
  dispose() { if (this.fabricListener) this.fabricListener.dispose(); this._emitter.dispose(); }
  refresh() { this._emitter.fire(undefined); }

  async getChildren(element) {
    if (element && element.kind === 'localRoot') return this.localChildren();
    if (element && element.kind === 'repo') return element.models;
    if (element && element.kind === 'cachedRoot') return this.fabric ? this.fabric.entries() : [];
    if (element && this.fabricTree) return this.fabricTree.getChildren(element.kind === 'fabricRoot' ? undefined : element);
    if (element) return [];
    if (!this.fabricTree) return this.localChildren();
    return [this.fabricRoot, this.localRoot];
  }

  /* Local models from the open workspace, plus saved Fabric models that are available offline. */
  async localChildren() {
    this.models = (await findModels()).concat(this.fabric ? this.fabric.entries() : []);
    vscode.commands.executeCommand('setContext', 'semanticModelViewer.hasModels', this.models.length > 0);
    if (!this.fabricTree) return this.models;
    const local = this.models.filter(m => m.kind !== 'fabric');
    /* With several workspace folders (repos), one sub-folder per repo; a single folder stays flat. */
    const repos = new Map();
    for (const m of local) if (m.repoId) { if (!repos.has(m.repoId)) repos.set(m.repoId, { kind: 'repo', id: 'repo:' + m.repoId, name: m.repo, models: [] }); repos.get(m.repoId).models.push(m); }
    this.grouped = (vscode.workspace.workspaceFolders || []).length > 1 && repos.size > 0;
    const rows = this.grouped ? Array.from(repos.values()).sort((a, b) => a.name.localeCompare(b.name)) : local;
    if (this.fabric && this.fabric.entries().length) rows.push({ kind: 'cachedRoot', id: 'cachedFabric', name: 'Cached Fabric models' });
    if (!rows.length) rows.push({ kind: 'action', name: 'Open workspace folder…', command: 'vscode.openFolder', icon: 'folder-opened' });
    rows.push({ kind: 'action', name: 'Exclude workspace folders…', command: 'semanticModelViewer.configureExclusions', icon: 'filter' });
    return rows;
  }

  getTreeItem(m) {
    if (m.kind === 'repo') {
      const item = new vscode.TreeItem(m.name, vscode.TreeItemCollapsibleState.Expanded);
      item.id = m.id; item.iconPath = new vscode.ThemeIcon('repo');
      item.description = m.models.length + (m.models.length === 1 ? ' model' : ' models');
      item.tooltip = 'Workspace folder: ' + m.name;
      item.contextValue = 'repoFolder';
      return item;
    }
    if (m.kind === 'cachedRoot') {
      const item = new vscode.TreeItem(m.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = m.id; item.iconPath = new vscode.ThemeIcon('cloud-download');
      item.description = 'saved copies';
      item.tooltip = 'Fabric models you opened before. The extension saved their metadata (tables, columns, measures, relationships, no data) in VS Code storage on this computer, so they open offline. These are not workspace files. Remove one with "Remove Saved Fabric Model…".';
      return item;
    }
    if (m.kind === 'fabricRoot') {
      const item = new vscode.TreeItem('Fabric', vscode.TreeItemCollapsibleState.Expanded);
      item.id = m.id;
      item.iconPath = new vscode.ThemeIcon('cloud');
      item.contextValue = 'fabricRoot';
      return item;
    }
    if (m.kind === 'localRoot') {
      const item = new vscode.TreeItem('On this device', vscode.TreeItemCollapsibleState.Expanded);
      item.id = m.id;
      item.iconPath = new vscode.ThemeIcon('folder-library');
      item.contextValue = 'localRoot';
      item.tooltip = 'Workspace model files and cached Fabric metadata. Use Exclude workspace folders to hide fixtures or archives.';
      return item;
    }
    if (this.fabricTree && ['workspace', 'workspaces', 'model', 'action', 'message'].includes(m.kind)) return this.fabricTree.getTreeItem(m);
    const item = new vscode.TreeItem(m.name, vscode.TreeItemCollapsibleState.None);
    item.id = m.id;
    item.description = m.kind === 'fabric' ? 'Cached · ' + m.path : (this.grouped && m.repoPath ? m.repoPath : m.path);
    item.tooltip = m.kind === 'fabric' ? m.path + '\nLast fetched: ' + m.fetchedAt : m.path;
    item.resourceUri = m.uri;
    item.iconPath = new vscode.ThemeIcon(m.kind === 'fabric' ? 'cloud' : m.kind === 'file' ? 'json' : 'type-hierarchy');
    item.contextValue = 'semanticModel';
    item.command = { command: 'semanticModelViewer.openEntry', title: 'Open in Semantic Model Viewer', arguments: [m] };
    return item;
  }
}

module.exports = { ModelsTree };
