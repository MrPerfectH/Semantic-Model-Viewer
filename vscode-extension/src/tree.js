/* "Semantic Models" view in the Activity Bar: one row per *.SemanticModel folder or
   model.bim in the workspace; click to open it in the viewer. */
'use strict';
const vscode = require('vscode');
const { findModels } = require('./workspace');

class ModelsTree {
  constructor(fabric, fabricTree) {
    this.fabric = fabric;
    this.fabricTree = fabricTree;
    this.fabricRoot = { kind: "fabricRoot", name: "Fabric", id: "fabricRoot" };
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.models = [];
    this.fabricListener = fabricTree && fabricTree.onDidChangeTreeData(() => this.refresh());
  }
  dispose() { if (this.fabricListener) this.fabricListener.dispose(); this._emitter.dispose(); }
  refresh() { this._emitter.fire(undefined); }

  async getChildren(element) {
    if (element && this.fabricTree) return this.fabricTree.getChildren(element.kind === 'fabricRoot' ? undefined : element);
    if (element) return [];
    this.models = (await findModels()).concat(this.fabric ? this.fabric.entries() : []);
    vscode.commands.executeCommand('setContext', 'semanticModelViewer.hasModels', this.models.length > 0);
    return this.fabricTree ? [this.fabricRoot, ...this.models, ...(!this.models.length ? [{ kind: 'action', name: 'Open local model folder…', command: 'vscode.openFolder', icon: 'folder-opened' }] : [])] : this.models;
  }

  getTreeItem(m) {
    if (m.kind === 'fabricRoot') {
      const item = new vscode.TreeItem('Fabric', vscode.TreeItemCollapsibleState.Expanded);
      item.id = m.id;
      item.iconPath = new vscode.ThemeIcon('cloud');
      item.contextValue = 'fabricRoot';
      return item;
    }
    if (this.fabricTree && ['workspace', 'workspaces', 'model', 'action', 'message'].includes(m.kind)) return this.fabricTree.getTreeItem(m);
    const item = new vscode.TreeItem(m.name, vscode.TreeItemCollapsibleState.None);
    item.id = m.id;
    item.description = m.path;
    item.tooltip = m.kind === 'fabric' ? m.path + '\nLast fetched: ' + m.fetchedAt : m.path;
    item.resourceUri = m.uri;
    item.iconPath = new vscode.ThemeIcon(m.kind === 'fabric' ? 'cloud' : m.kind === 'file' ? 'json' : 'type-hierarchy');
    item.contextValue = 'semanticModel';
    item.command = { command: 'semanticModelViewer.openEntry', title: 'Open in Semantic Model Viewer', arguments: [m] };
    return item;
  }
}

module.exports = { ModelsTree };
