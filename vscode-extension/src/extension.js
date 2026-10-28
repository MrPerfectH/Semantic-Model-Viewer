/* Semantic Model Viewer — VS Code extension entry point.
   The webview runs the same viewer as the web version (Models/tools/viewer); this side owns the
   file system, settings and persistence. */
'use strict';
const vscode = require('vscode');
const { findModels, modelFromUri, resolveDefaultModel } = require('./workspace');
const { ViewerPanel } = require('./panel');
const { ModelsTree } = require('./tree');
const { FabricTree } = require('./fabric-tree');
const { FabricConnection } = require('./fabric');

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
  const fabric = new FabricConnection(context);
  panel = new ViewerPanel(context, fabric);
  const fabricTree = new FabricTree(fabric);
  tree = new ModelsTree(fabric, fabricTree);
  fabric.onChange = () => { tree.refresh(); fabricTree.refresh(); };
  const run = fn => async (...args) => {
    try { return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fabric', cancellable: true }, async (_progress, token) => {
      const cancellation = token && token.onCancellationRequested(() => fabric.request({ action: 'cancel' }).catch(() => {}));
      try { return await fn(...args); } finally { if (cancellation) cancellation.dispose(); }
    }); } catch (error) { if (error.code !== 'Cancelled') return vscode.window.showErrorMessage('Fabric: ' + error.message); }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('semanticModelViewer.fabricBrowseSignIn', run(async () => {
      const status = await fabric.request({ action: 'status' });
      if (!status.account) await fabric.request({ action: 'signIn' });
      fabricTree.refresh();
    })),
    vscode.commands.registerCommand('semanticModelViewer.refreshFabric', () => fabricTree.refresh()),
    vscode.commands.registerCommand('semanticModelViewer.openFabricTreeModel', run(async node => {
      if (!node || node.kind !== 'model' || !node.workspace) return;
      const { account } = await fabric.request({ action: 'status' });
      if (!account || account.id !== node.accountId || account.tenantId !== node.tenantId) throw new Error('The Fabric account changed. Refresh the Fabric sidebar and select the model again.');
      const entry = await fabric.open(node.workspace, node, node.accountId, 'xmla', node.tenantId);
      await panel.show(entry);
    })),
    vscode.commands.registerCommand('semanticModelViewer.connectFabric', run(async () => { const entry = await fabric.connect(); fabricTree.refresh(); if (entry) { tree.refresh(); await panel.show(entry); } })),
    vscode.commands.registerCommand('semanticModelViewer.fabricSwitchAccount', run(async () => { await fabric.signOut(); fabricTree.refresh(); await fabric.request({ action: 'signIn' }); fabricTree.refresh(); })),
    vscode.commands.registerCommand('semanticModelViewer.fabricSignOut', run(async () => { await fabric.signOut(); fabricTree.refresh(); await vscode.window.showInformationMessage('Signed out of Fabric. Saved metadata remains available offline.'); })),
    vscode.commands.registerCommand('semanticModelViewer.removeFabricModel', run(async () => { const chosen = await vscode.window.showQuickPick(fabric.entries().map(e => ({ label: e.name, description: e.path, entry: e })), { placeHolder: 'Remove a saved Fabric model and its metadata' }); if (chosen) { await fabric.remove(chosen.entry.id); if (panel.current && panel.current.id === chosen.entry.id) panel.dispose(); tree.refresh(); } })),
    vscode.commands.registerCommand('semanticModelViewer.open', openCommand),
    vscode.commands.registerCommand('semanticModelViewer.openFolder', openUriCommand),
    vscode.commands.registerCommand('semanticModelViewer.openEntry', (entry) => (entry && (entry.uri || entry.kind === 'fabric') ? panel.show(entry) : openCommand())),
    vscode.commands.registerCommand('semanticModelViewer.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('semanticModelViewer.configureExclusions', () => vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', 'semanticModelViewer.exclude')),
    vscode.commands.registerCommand('semanticModelViewer.refreshModels', () => tree.refresh()),
    vscode.window.registerTreeDataProvider('semanticModelViewer.models', tree),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('semanticModelViewer.exclude')) tree.refresh(); }),
    { dispose: () => { panel.dispose(); tree.dispose(); fabricTree.dispose(); fabric.dispose(); } }
  );
  const agentTools = vscode.lm && typeof vscode.lm.registerTool === 'function' ? require('./agent-tools').register(context) : null;
  if (agentTools) context.subscriptions.push(agentTools);
  const cli = require('./cli').register(context);
  context.subscriptions.push(cli);
  return { panel, tree, fabricTree, agentTools, cli };
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
