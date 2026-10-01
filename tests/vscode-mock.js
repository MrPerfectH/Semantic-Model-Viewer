/* Minimal stand-in for the `vscode` module so the extension can be exercised in plain Node.
   Only the API surface the extension uses is implemented, on top of the real file system. */
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

class Uri {
  constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; this.path = fsPath; }
  static file(p) { return new Uri(p); }
  static joinPath(u, ...parts) { return new Uri(path.join(u.fsPath, ...parts)); }
  toString() { return 'file://' + this.fsPath; }
}
const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };
const ViewColumn = { Active: -1, Beside: -2, One: 1 };
const ProgressLocation = { Notification: 15 };
class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } }
class Disposable { constructor(fn) { this.fn = fn; } dispose() { if (this.fn) this.fn(); } }
class EventEmitter {
  constructor() { this.listeners = []; this.event = (l) => { this.listeners.push(l); return new Disposable(() => { this.listeners = this.listeners.filter((x) => x !== l); }); }; }
  fire(v) { this.listeners.forEach((l) => l(v)); }
  dispose() { this.listeners = []; }
}
class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } }
const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
class ThemeIcon { constructor(id) { this.id = id; } }

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
/* tiny glob: supports ** and * only (enough for the extension's patterns) */
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if ('.+?^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

function makeVscode(opts) {
  const folders = (opts.folders || []).map((f, i) => ({ uri: Uri.file(f), name: path.basename(f), index: i }));
  const config = Object.assign({ defaultModel: '', exclude: [], 'cleaner.command': 'smc', 'cleaner.reportsPath': '', 'cleaner.extraArgs': [], 'cleaner.autoRun': false }, opts.config || {});
  const log = opts.log || (() => { });
  const state = new Map();
  const commands = new Map();
  const panels = [];
  const contains = (base, target) => { const rel = path.relative(base, target); return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)); };

  const vscode = {
    Uri, FileType, ViewColumn, ProgressLocation, RelativePattern, Disposable, EventEmitter, TreeItem, TreeItemCollapsibleState, ThemeIcon,
    workspace: {
      workspaceFolders: folders,
      isTrusted: opts.trusted !== false,
      getWorkspaceFolder: (uri) => folders.find((f) => contains(f.uri.fsPath, uri.fsPath)) || null,
      asRelativePath: (uri, includeFolder) => {
        const p = uri.fsPath || String(uri);
        const f = folders.find((w) => contains(w.uri.fsPath, p));
        if (!f) return p;
        const rel = path.relative(f.uri.fsPath, p).split(path.sep).join('/');
        return includeFolder && folders.length > 1 ? f.name + '/' + rel : rel;
      },
      getConfiguration: () => ({ get: (k) => config[k] }),
      findFiles: async (glob, exclude) => {
        const re = globToRe(glob);
        const ex = exclude ? String(exclude).replace(/^\{|\}$/g, '').split(',').map(globToRe) : [];
        const hits = [];
        for (const f of folders) {
          for (const file of walk(f.uri.fsPath, [])) {
            const rel = path.relative(f.uri.fsPath, file).split(path.sep).join('/');
            if (re.test(rel) && !ex.some((x) => x.test(rel))) hits.push(Uri.file(file));
          }
        }
        return hits;
      },
      fs: {
        stat: async (uri) => { const st = fs.statSync(uri.fsPath); return { type: st.isDirectory() ? FileType.Directory : FileType.File, size: st.size }; },
        readDirectory: async (uri) => fs.readdirSync(uri.fsPath, { withFileTypes: true }).map((e) => [e.name, e.isSymbolicLink() ? FileType.SymbolicLink : e.isDirectory() ? FileType.Directory : FileType.File]),
        readFile: async (uri) => new Uint8Array(fs.readFileSync(uri.fsPath)),
        writeFile: async (uri, data) => { vscode._writes.push({ uri, data }); fs.writeFileSync(uri.fsPath, data); }
      },
      createFileSystemWatcher: (pattern) => {
        const w = { pattern, handlers: {}, onDidChange: (h) => { w.handlers.change = h; }, onDidCreate: (h) => { w.handlers.create = h; }, onDidDelete: (h) => { w.handlers.delete = h; }, dispose: () => { w.disposed = true; } };
        vscode._watchers.push(w); return w;
      },
      openTextDocument: async (uri) => { vscode._opened.push(uri); return { uri }; },
      onDidChangeWorkspaceFolders: (h) => { vscode._folderListeners.push(h); return new Disposable(); }
    },
    window: {
      messages: [],
      showErrorMessage: async (m) => { vscode.window.messages.push(['error', m]); log('error: ' + m); return undefined; },
      showWarningMessage: async (m) => { vscode.window.messages.push(['warn', m]); return undefined; },
      showInformationMessage: async (m) => { vscode.window.messages.push(['info', m]); return undefined; },
      showQuickPick: async (items) => (opts.quickPick ? opts.quickPick(items) : items[0]),
      showOpenDialog: async () => (opts.openDialog ? opts.openDialog() : undefined),
      showSaveDialog: async (options) => { vscode._saveDialogs.push(options); return opts.saveDialog ? opts.saveDialog(options) : undefined; },
      showTextDocument: async (doc, options) => { vscode._shown.push({ doc, options }); },
      registerTreeDataProvider: (id, provider) => { vscode._trees[id] = provider; return new Disposable(); },
      withProgress: (o, task) => task({ report: () => { } }),
      createOutputChannel: () => ({ lines: [], appendLine(l) { this.lines.push(l); log(l); }, show() { }, dispose() { this.disposed = true; } }),
      createWebviewPanel: (viewType, title, column, options) => {
        const panel = {
          viewType, title, options, disposed: false,
          webview: {
            html: '', cspSource: 'vscode-resource:', posted: [],
            asWebviewUri: (u) => 'https://file+.vscode-resource.vscode-cdn.net' + u.fsPath.replace(/\\/g, '/'),
            postMessage: async (m) => { panel.webview.posted.push(m); return true; },
            onDidReceiveMessage: (h) => { panel.webview.receive = h; }
          },
          reveal: () => { panel.revealed = true; },
          onDidDispose: (h) => { panel.disposeHandler = h; },
          dispose: () => { panel.disposed = true; if (panel.disposeHandler) panel.disposeHandler(); }
        };
        panels.push(panel);
        return panel;
      }
    },
    commands: {
      registerCommand: (id, fn) => { commands.set(id, fn); return new Disposable(() => commands.delete(id)); },
      executeCommand: async (id, ...args) => { if (id === 'setContext') { vscode._contexts[args[0]] = args[1]; return; } const fn = commands.get(id); return fn ? fn(...args) : undefined; }
    },
    _writes: [], _saveDialogs: [], _opened: [], _shown: [], _watchers: [], _panels: panels, _state: state, _trees: {}, _folderListeners: [], _contexts: {},
    context: {
      extensionUri: Uri.file(opts.extensionRoot),
      subscriptions: [],
      workspaceState: {
        keys: () => Array.from(state.keys()),
        get: (k) => state.get(k),
        update: async (k, v) => { if (v === undefined) state.delete(k); else state.set(k, v); }
      }
    }
  };
  return vscode;
}

/* Make `require('vscode')` resolve to the mock for everything loaded afterwards. */
function install(vscode) {
  const orig = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return orig.apply(this, arguments);
  };
  return () => { Module._load = orig; };
}

module.exports = { makeVscode, install, Uri };
