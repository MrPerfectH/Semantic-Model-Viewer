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
const { listPowerBiModels } = require('./powerbi');
const { parseLaunchUri, createRegistration, updateRegistration } = require('./external-tool');

let panel = null;
let tree = null;

function isLocalWindows() {
  return process.platform === 'win32' && !(vscode.env && vscode.env.remoteName);
}

async function registrationCommand(context, remove = false) {
  if (!isLocalWindows()) {
    await vscode.window.showInformationMessage('Power BI ribbon registration is available from local VS Code on Windows.');
    return;
  }
  const action = remove ? 'Remove button' : 'Add button';
  const common = process.env['CommonProgramFiles(x86)'];
  const target = common ? require('path').join(common, 'Microsoft Shared', 'Power BI Desktop', 'External Tools', 'Semantic Model Viewer VS Code.pbitool.json') : 'Semantic Model Viewer VS Code.pbitool.json in the machine-wide Common Files / Microsoft Shared / Power BI Desktop / External Tools folder';
  const selected = await vscode.window.showInformationMessage(
    (remove ? 'Remove' : 'Add') + ' the Semantic Model Viewer (VS Code) button ' + (remove ? 'from' : 'to') + ' Power BI Desktop?',
    { modal: true, detail: (remove ? 'This removes ' : 'This writes ') + target + '. Windows may ask you to approve Windows PowerShell to make this change. Normal viewer launches do not require administrator access.' }, action);
  if (selected !== action) return;
  try {
    const registration = remove ? null : createRegistration(vscode.env.appRoot, vscode.env.uriScheme, context.extensionPath);
    await updateRegistration(context.extensionPath, registration, remove);
    await vscode.window.showInformationMessage('Power BI button ' + (remove ? 'removed' : 'added') + '. Restart Power BI Desktop to update its External Tools ribbon.');
  } catch (error) {
    await vscode.window.showErrorMessage('Could not update the Power BI button: ' + error.message);
  }
}

async function handlePowerBiUri(uri) {
  if (!isLocalWindows()) {
    await vscode.window.showInformationMessage('Power BI Desktop launch links require local VS Code on Windows.');
    return;
  }
  try {
    const model = parseLaunchUri(uri);
    await panel.showEmpty();
    if (model) await panel.show(model);
  } catch (error) {
    await vscode.window.showErrorMessage('Could not open the Power BI model: ' + error.message);
  }
}

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

async function connectPowerBiCommand(context) {
  if (!isLocalWindows()) {
    vscode.window.showInformationMessage('Power BI Desktop connection is available from local VS Code on Windows.');
    return;
  }
  try {
    const models = await listPowerBiModels(context.extensionPath);
    if (!models.length) {
      await panel.showEmpty();
      vscode.window.showInformationMessage('No open Power BI Desktop model found. Open a model in Desktop, then connect again.');
      return;
    }
    const choice = models.length === 1 ? models[0] : await vscode.window.showQuickPick(
      models.map((model) => ({ label: model.name, description: model.server, model })),
      { placeHolder: 'Choose an open Power BI Desktop model', matchOnDescription: true }
    );
    if (choice) await panel.show(choice.model || choice);
  } catch (error) {
    vscode.window.showErrorMessage('Could not connect to Power BI Desktop: ' + ((error && error.message) || error));
  }
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
    vscode.commands.registerCommand('semanticModelViewer.connectPowerBI', () => connectPowerBiCommand(context)),
    vscode.commands.registerCommand('semanticModelViewer.registerPowerBI', () => registrationCommand(context)),
    vscode.commands.registerCommand('semanticModelViewer.unregisterPowerBI', () => registrationCommand(context, true)),
    vscode.window.registerUriHandler({ handleUri: handlePowerBiUri }),
    vscode.window.registerTreeDataProvider('semanticModelViewer.models', tree),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('semanticModelViewer.exclude')) tree.refresh(); }),
    { dispose: () => { panel.dispose(); tree.dispose(); fabricTree.dispose(); fabric.dispose(); } }
  );
  const agentTools = vscode.lm && typeof vscode.lm.registerTool === 'function' ? require('./agent-tools').register(context) : null;
  if (agentTools) context.subscriptions.push(agentTools);
  return { panel, tree, fabricTree, agentTools };
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
