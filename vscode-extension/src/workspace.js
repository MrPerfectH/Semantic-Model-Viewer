/* Workspace discovery and model file reading (extension host side). */
'use strict';
const vscode = require('vscode');
const path = require('path');

const MODEL_EXT = /\.(tmdl|bim|json)$/i;

/* Exclude glob for findFiles: node_modules, .git and the user's semanticModelViewer.exclude list. */
function excludeGlob() {
  const configured = vscode.workspace.getConfiguration('semanticModelViewer').get('exclude');
  const extra = Array.isArray(configured) ? configured.filter((item) => typeof item === 'string' && item) : [];
  return '{' + ['**/node_modules/**', '**/.git/**'].concat(extra).join(',') + '}';
}
/* Hidden folders (.worktrees, .pbi, .venv …) never count, whatever findFiles returns. */
function inHiddenFolder(uri) {
  return vscode.workspace.asRelativePath(uri, false).split(/[\\/]/).some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..');
}

function relPath(uri) { return vscode.workspace.asRelativePath(uri, true); }
function idFor(uri) { return 'ws:' + relPath(uri).replace(/\\/g, '/'); }

function entryForFolder(uri) {
  return { id: idFor(uri), name: path.basename(uri.fsPath).replace(/\.SemanticModel$/i, ''), path: relPath(uri), uri, kind: 'folder' };
}
function entryForBim(uri) {
  const dir = vscode.Uri.file(path.dirname(uri.fsPath));
  if (/\.SemanticModel$/i.test(dir.fsPath)) return entryForFolder(dir);
  return { id: idFor(uri), name: path.basename(dir.fsPath), path: relPath(uri), uri, kind: 'file' };
}

/* Every *.SemanticModel folder (TMDL or model.bim inside) and stand-alone model.bim in the workspace. */
async function findModels() {
  const byId = new Map();
  const exclude = excludeGlob();
  const tmdl = await vscode.workspace.findFiles('**/*.SemanticModel/definition/model.tmdl', exclude);
  for (const f of tmdl) {
    if (inHiddenFolder(f)) continue;
    const e = entryForFolder(vscode.Uri.file(path.dirname(path.dirname(f.fsPath))));
    byId.set(e.id, e);
  }
  const bims = await vscode.workspace.findFiles('**/model.bim', exclude);
  for (const f of bims) { if (inHiddenFolder(f)) continue; const e = entryForBim(f); if (!byId.has(e.id)) byId.set(e.id, e); }
  // by name, then shortest path first so the main copy of a model comes before archived ones
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name) || a.path.length - b.path.length || a.path.localeCompare(b.path));
}

/* A model entry for an explorer selection (folder or model.bim), or null. */
async function modelFromUri(uri) {
  let st;
  try { st = await vscode.workspace.fs.stat(uri); } catch (e) { return null; }
  if (st.type & vscode.FileType.Directory) {
    if (/\.SemanticModel$/i.test(uri.fsPath)) return entryForFolder(uri);
    // a definition/ folder or the folder above a model.bim
    try {
      const bim = vscode.Uri.file(path.join(uri.fsPath, 'model.bim'));
      await vscode.workspace.fs.stat(bim);
      return entryForBim(bim);
    } catch (e) { return null; }
  }
  if (/model\.bim$/i.test(uri.fsPath)) return entryForBim(uri);
  return null;
}

/* The `semanticModelViewer.defaultModel` setting resolved to a model entry, or null. */
async function resolveDefaultModel() {
  const setting = String(vscode.workspace.getConfiguration('semanticModelViewer').get('defaultModel') || '').trim();
  if (!setting) return null;
  const folders = vscode.workspace.workspaceFolders || [];
  const candidates = path.isAbsolute(setting) ? [setting] : folders.map((f) => path.join(f.uri.fsPath, setting));
  for (const c of candidates) {
    const m = await modelFromUri(vscode.Uri.file(c));
    if (m) return m;
  }
  vscode.window.showWarningMessage('semanticModelViewer.defaultModel does not point at a *.SemanticModel folder or model.bim: ' + setting);
  return null;
}

/* Read every .tmdl / .bim / .json under the model (dot-folders such as .pbi are skipped)
   as [{ name, path, text }] — the shape the viewer's parser takes. */
async function readModelFiles(entry) {
  const dec = new TextDecoder('utf-8');
  const out = [];
  if (entry.kind === 'file') {
    out.push({ name: path.basename(entry.uri.fsPath), path: path.basename(entry.uri.fsPath), text: dec.decode(await vscode.workspace.fs.readFile(entry.uri)) });
    return out;
  }
  const walk = async (dir, rel) => {
    const ents = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of ents.sort(([a], [b]) => a.localeCompare(b))) {
      if (name.startsWith('.') || (type & vscode.FileType.SymbolicLink)) continue;
      const child = vscode.Uri.joinPath(dir, name);
      const r = rel ? rel + '/' + name : name;
      if (type & vscode.FileType.Directory) await walk(child, r);
      else if (MODEL_EXT.test(name)) out.push({ name, path: r, text: dec.decode(await vscode.workspace.fs.readFile(child)) });
    }
  };
  await walk(entry.uri, '');
  return out;
}

module.exports = { findModels, modelFromUri, resolveDefaultModel, readModelFiles, idFor };
