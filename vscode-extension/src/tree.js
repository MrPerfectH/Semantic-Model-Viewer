/* "Semantic Models" view in the Activity Bar: one row per *.SemanticModel folder or
   model.bim in the workspace, with connected local Reports beneath it. */
'use strict';
const vscode = require('vscode');
const { findModels, findReports, reportsForModel } = require('./workspace');

class ModelsTree {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this.models = [];
  }
  dispose() { this._emitter.dispose(); }
  refresh() { this._emitter.fire(undefined); }

  async getChildren(element) {
    if (element) {
      if (element.kind === 'report' || element.kind === 'empty') return [];
      return element.reports.length ? element.reports : [{
        id: element.id + ':empty', name: 'No connected local Reports', kind: 'empty'
      }];
    }
    const [models, reports] = await Promise.all([findModels(), findReports()]);
    this.models = models.map((model) => ({ ...model, reports: reportsForModel(model, reports) }));
    vscode.commands.executeCommand('setContext', 'semanticModelViewer.hasModels', this.models.length > 0);
    return this.models;
  }

  getTreeItem(m) {
    const isModel = m.kind !== 'report' && m.kind !== 'empty';
    const item = new vscode.TreeItem(m.name, isModel ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = m.id;
    if (m.kind === 'empty') return item;
    item.description = m.path;
    item.tooltip = isModel ? m.path + '\n' + m.reports.length + ' connected local Reports' : m.path;
    item.resourceUri = m.uri;
    item.iconPath = new vscode.ThemeIcon(m.kind === 'report' ? 'graph' : m.kind === 'file' ? 'json' : 'type-hierarchy');
    item.contextValue = isModel ? 'semanticModel' : 'connectedReport';
    item.command = m.kind === 'report' ? { command: 'vscode.open', title: 'Open Report definition', arguments: [m.uri] } : { command: 'semanticModelViewer.openEntry', title: 'Open in Semantic Model Viewer', arguments: [m] };
    return item;
  }
}

module.exports = { ModelsTree };
