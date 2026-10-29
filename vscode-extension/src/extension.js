/* Semantic Model Viewer — VS Code extension entry point.
   The webview runs the same viewer as the web version (Models/tools/viewer); this side owns the
   file system, settings and persistence. */
'use strict';
const vscode = require('vscode');
const { findModels, modelFromUri, resolveDefaultModel } = require('./workspace');
const { ViewerPanel } = require('./panel');
const { ModelsTree } = require('./tree');
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
  const selected = await vscode.window.showInformationMessage(
    (remove ? 'Remove' : 'Add') + ' the Semantic Model Viewer (VS Code) button ' + (remove ? 'from' : 'to') +
    ' Power BI Desktop? Windows may ask for administrator approval to update its External Tools folder.',
    { modal: true }, action);
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
  panel = new ViewerPanel(context);
  tree = new ModelsTree();
  context.subscriptions.push(
    vscode.commands.registerCommand('semanticModelViewer.open', openCommand),
    vscode.commands.registerCommand('semanticModelViewer.openFolder', openUriCommand),
    vscode.commands.registerCommand('semanticModelViewer.openEntry', (entry) => (entry && entry.uri ? panel.show(entry) : openCommand())),
    vscode.commands.registerCommand('semanticModelViewer.refresh', () => panel.refresh()),
    vscode.commands.registerCommand('semanticModelViewer.refreshModels', () => tree.refresh()),
    vscode.commands.registerCommand('semanticModelViewer.connectPowerBI', () => connectPowerBiCommand(context)),
    vscode.commands.registerCommand('semanticModelViewer.registerPowerBI', () => registrationCommand(context)),
    vscode.commands.registerCommand('semanticModelViewer.unregisterPowerBI', () => registrationCommand(context, true)),
    vscode.window.registerUriHandler({ handleUri: handlePowerBiUri }),
    vscode.window.registerTreeDataProvider('semanticModelViewer.models', tree),
    vscode.workspace.onDidChangeWorkspaceFolders(() => tree.refresh()),
    { dispose: () => { panel.dispose(); tree.dispose(); } }
  );
  return { panel, tree };
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
