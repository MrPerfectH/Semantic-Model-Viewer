'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const MARK = 'SMV_VSCODE_LAUNCHER_V1';
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
function installExternal(root, storage, options = {}) {
  const platform = options.platform || process.platform;
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error('Invalid bundled CLI identity');
  const target = path.join(storage, 'cli', info.sha256);
  const bin = options.binDir || (platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'SemanticModelViewer', 'bin')
    : path.join(os.homedir(), '.local', 'bin'));
  const command = path.join(bin, platform === 'win32' ? 'smv.cmd' : 'smv');
  if (fs.existsSync(command) && (fs.lstatSync(command).isSymbolicLink() || !fs.readFileSync(command, 'utf8').includes(MARK))) {
    throw new Error('An unrelated smv command already exists at ' + command + '. It was left unchanged.');
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('CLI cache must not be a symbolic link');
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = fs.mkdtempSync(path.join(path.dirname(target), '.cli-'));
    try {
      fs.cpSync(root, temporary, { recursive: true, filter: () => true });
      // Verify the copy before installing a launcher that can execute it.
      const crypto = require('node:crypto');
      if (crypto.createHash('sha256').update(JSON.stringify(info.files)).digest('hex') !== info.sha256) throw new Error('Invalid bundled CLI manifest');
      for (const [name, expected] of Object.entries(info.files)) {
        if (path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw new Error('Invalid bundled CLI path');
        if (crypto.createHash('sha256').update(fs.readFileSync(path.join(temporary, name))).digest('hex') !== expected) throw new Error('Bundled CLI checksum mismatch: ' + name);
      }
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  fs.mkdirSync(bin, { recursive: true });
  const launcher = platform === 'win32'
    ? '@rem ' + MARK + '\r\n@call "' + path.join(target, 'bin', 'smv.cmd').replace(/%/g, '%%') + '" %*\r\n'
    : '#!/bin/sh\n# ' + MARK + '\nexec /bin/sh ' + quote(path.join(target, 'bin', 'smv')) + ' "$@"\n';
  fs.writeFileSync(command, launcher, { mode: 0o755 });
  if (platform !== 'win32') fs.chmodSync(command, 0o755);
  return { command, binDir: bin, identity: info.sha256 };
}
function register(context, vscode) {
  const root = path.join(context.extensionPath, 'cli');
  const available = fs.existsSync(path.join(root, 'build-info.json'));
  const disposables = [];
  const storage = context.globalStorageUri && context.globalStorageUri.fsPath;
  if (available && storage && context.environmentVariableCollection && !(vscode.env && vscode.env.remoteName)) {
    try {
      // VSIX extractors may strip executable modes. A user-owned launcher also
      // keeps the terminal PATH stable when VS Code changes the extension folder.
      const terminal = installExternal(root, storage, { binDir: path.join(storage, 'terminal-bin') });
      const collection = context.environmentVariableCollection;
      collection.description = 'Semantic Model Viewer bundled CLI';
      collection.clear();
      collection.prepend(process.platform === 'win32' ? 'Path' : 'PATH', terminal.binDir + path.delimiter);
    } catch (error) { void vscode.window.showWarningMessage('SMV terminal CLI: ' + error.message); }
  }
  async function install() {
    try {
      if (!available || !storage) throw new Error('This development extension has no bundled CLI. Install a platform release of Semantic Model Viewer.');
      const result = installExternal(root, storage);
      await context.globalState.update('cli.externalInstalled', true);
      const onPath = (process.env.PATH || '').split(path.delimiter).some(p => (process.platform === 'win32' ? path.resolve(p).toLowerCase() === result.binDir.toLowerCase() : path.resolve(p) === result.binDir));
      await vscode.window.showInformationMessage('SMV is installed at ' + result.command + (onPath ? '. Open a new terminal to use smv.' : '. Add ' + result.binDir + ' to your user PATH to use smv outside VS Code.'));
      return result;
    } catch (error) { await vscode.window.showErrorMessage('SMV CLI: ' + error.message); }
  }
  disposables.push(vscode.commands.registerCommand('semanticModelViewer.installCli', install));
  // Refresh an explicitly installed external launcher after extension upgrades.
  if (available && storage && context.globalState && context.globalState.get('cli.externalInstalled')) {
    try { installExternal(root, storage); } catch (error) { void vscode.window.showWarningMessage('SMV CLI update: ' + error.message); }
  }
  return { available, root, install, dispose() { disposables.forEach(d => d.dispose()); } };
}
module.exports = { register, installExternal };
