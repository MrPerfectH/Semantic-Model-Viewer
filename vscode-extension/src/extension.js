/* Semantic Model Viewer — VS Code extension entry point.
   The webview runs the same viewer as the web version (Models/tools/viewer); this side owns the
   file system, settings, persistence and the optional Semantic Model Cleaner run. */
'use strict';
const vscode = require('vscode');
const { findModels, modelFromUri, resolveDefaultModel } = require('./workspace');
const { ViewerPanel } = require('./panel');
const { ModelsTree } = require('./tree');

let panel = null;
let tree = null;

async function openCommand() {
  const def = await resolveDefaultModel();
  if (def) return panel.show(def);
  const models = await findModels();
  if (!models.length) {
    const pick = await vscode.window.showWarningMessage(
      'No *.SemanticModel folder or model.bim found in the open workspace.', 'Open viewer anyway');
    if (pick) await panel.show(null);
    return;
  }
  if (models.length === 1) return panel.show(models[0]);
  const choice = await vscode.window.showQuickPick(
    models.map((m) => ({ label: m.name, description: m.path, model: m })),
    { placeHolder: 'Semantic model to open', matchOnDescription: true });
  if (choice) await panel.show(choice.model);
}

async function openUriCommand(uri) {
  if (!uri) return openCommand();
  const m = await modelFromUri(uri);
  if (!m) { vscode.window.showErrorMessage('Not a *.SemanticModel folder or model.bim: ' + uri.fsPath); return; }
  await panel.show(m);
}

function activate(context) {
  panel = new ViewerPanel(context);
  tree = new ModelsTree();
  context.subscriptions.push(
    vscode.commands.registerCommand('semanticModelViewer.open', openCommand),
    vscode.commands.registerCommand('semanticModelViewer.openFolder', openUriCommand),
    vscode.commands.registerCommand('semanticModelViewer.openEntry', (entry) => (entry && entry.uri ? panel.show(entry) : openCommand())),
    vscode.commands.registerCommand('semanticModelViewer.loadAnalysis', () => panel.loadAnalysisCommand()),
    vscode.commands.registerCommand('semanticModelViewer.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('semanticModelViewer.refreshModels', () => tree.refresh()),
    vscode.window.registerTreeDataProvider('semanticModelViewer.models', tree),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
    { dispose: () => { panel.dispose(); tree.dispose(); } }
  );
  return { panel, tree };
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
