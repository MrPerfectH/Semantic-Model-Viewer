/* Optional integration with Semantic Model Cleaner (https://github.com/MrPerfectH/Semantic-Model-Cleaner).
   The viewer never computes report usage itself; it only displays the cleaner's JSON export. */
'use strict';
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const INSTALL_HINT = 'Install it with `pip install semantic-model-cleaner` (Python 3.11+) or point `semanticModelViewer.cleaner.command` at it.';

function cfg() { return vscode.workspace.getConfiguration('semanticModelViewer'); }

function workspaceRoot(entry) {
  const wf = vscode.workspace.getWorkspaceFolder ? vscode.workspace.getWorkspaceFolder(entry.uri) : null;
  if (wf) return wf.uri.fsPath;
  const all = vscode.workspace.workspaceFolders || [];
  return all.length ? all[0].uri.fsPath : path.dirname(entry.uri.fsPath);
}

/* Command line for one model: smc --models-path <model> --reports-path <root> --format json -o <tmp> */
function buildCommand(entry) {
  const c = cfg();
  const root = workspaceRoot(entry);
  const reports = String(c.get('cleaner.reportsPath') || '').trim();
  const reportsPath = reports ? (path.isAbsolute(reports) ? reports : path.join(root, reports)) : root;
  const modelPath = entry.kind === 'file' ? path.dirname(entry.uri.fsPath) : entry.uri.fsPath;
  const command = c.get('cleaner.command') || 'smc';
  const extra = c.get('cleaner.extraArgs') || [];
  if (typeof command !== 'string' || !command.trim() || command.includes('\0')) throw new Error('Cleaner command must be an executable name or path.');
  if (!Array.isArray(extra) || extra.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Cleaner extraArgs must be an array of strings.');
  const out = path.join(os.tmpdir(), 'smv-analysis-' + crypto.randomUUID() + '.json');
  const args = ['--models-path', modelPath, '--reports-path', reportsPath, '--format', 'json', '-o', out].concat(extra);
  return { command, args, cwd: root, out };
}

function exec(command, args, cwd) {
  return new Promise((resolve, reject) => {
    cp.execFile(command, args, { cwd, shell: false, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; return reject(err); }
      resolve({ stdout, stderr });
    });
  });
}

/* Run the cleaner for `entry`; resolves with the parsed JSON or null (errors are shown to the user). */
async function runCleaner(entry, output) {
  if (vscode.workspace.isTrusted !== true) {
    await vscode.window.showWarningMessage('Trust this workspace before running Semantic Model Cleaner. You can still load an existing analysis JSON file.');
    return null;
  }
  let spec;
  try {
    spec = buildCommand(entry);
    if (output) output.appendLine('$ ' + spec.command + ' ' + spec.args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' '));
    const res = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Semantic Model Cleaner: analysing ' + entry.name + '…' },
      () => exec(spec.command, spec.args, spec.cwd));
    if (output && res.stderr) output.appendLine(res.stderr.trim());
    const text = fs.readFileSync(spec.out, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (spec && err && err.code === 'ENOENT' && err.syscall && err.syscall.startsWith('spawn')) {
      const pick = await vscode.window.showErrorMessage('Semantic Model Cleaner command not found: ' + spec.command + '. ' + INSTALL_HINT, 'Open settings');
      if (pick) vscode.commands.executeCommand('workbench.action.openSettings', 'semanticModelViewer.cleaner');
      return null;
    }
    const detail = ((err && err.stderr) || (err && err.message) || String(err)).trim().split('\n').slice(-3).join(' ');
    if (output) { output.appendLine((err && err.stderr) || String(err)); output.show(true); }
    vscode.window.showErrorMessage('Semantic Model Cleaner failed: ' + detail);
    return null;
  } finally {
    if (spec) { try { fs.unlinkSync(spec.out); } catch (error) { /* An unsuccessful command may not have produced a file. */ } }
  }
}

/* Let the user pick an existing `smc --format json` export. */
async function pickAnalysisFile(entry) {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false, openLabel: 'Load analysis',
    filters: { 'Semantic Model Cleaner JSON': ['json'] },
    defaultUri: entry ? vscode.Uri.file(workspaceRoot(entry)) : undefined
  });
  if (!picked || !picked.length) return null;
  const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(picked[0]));
  try { return JSON.parse(text); }
  catch (e) { vscode.window.showErrorMessage('Not valid JSON: ' + picked[0].fsPath); return null; }
}

/* Interactive entry point: run now, or pick a file. */
async function loadAnalysisInteractive(entry, output) {
  const choices = [{ label: '$(file) Pick an existing analysis JSON file…', description: 'output of smc --format json', action: 'pick' }];
  if (vscode.workspace.isTrusted === true) choices.unshift({ label: '$(play) Run Semantic Model Cleaner now', description: cfg().get('cleaner.command') + ' --format json', action: 'run' });
  const choice = await vscode.window.showQuickPick(choices, { placeHolder: 'Report usage for ' + entry.name });
  if (!choice) return null;
  return choice.action === 'run' ? runCleaner(entry, output) : pickAnalysisFile(entry);
}

module.exports = { runCleaner, pickAnalysisFile, loadAnalysisInteractive, buildCommand };
