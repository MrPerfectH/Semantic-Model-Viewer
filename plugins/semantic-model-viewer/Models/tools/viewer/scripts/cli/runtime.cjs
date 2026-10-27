'use strict';

// Self-contained: these functions are embedded in the installed launcher so that
// plugin cache upgrades do not depend on the previous cache directory surviving.
function resolveRuntime(config) {
  const fs = require('node:fs'), path = require('node:path');
  const warnings = [];
  let executable = config.fallback, selection = config.source;
  if (config.source === 'plugin') {
    let found;
    try {
      const data = JSON.parse(fs.readFileSync(config.registry, 'utf8'));
      const entries = data.plugins['semantic-model-viewer@semantic-model-tools'] || [];
      for (const entry of entries.slice().sort((a, b) => (a.scope === 'user' ? -1 : 0) - (b.scope === 'user' ? -1 : 0))) {
        try {
          const root = fs.realpathSync(entry.installPath);
          const file = path.join(root, 'bin', 'smv.cjs');
          const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
          if (manifest.name === 'semantic-model-viewer' && fs.statSync(file).isFile()) { found = file; break; }
        } catch { /* A stale entry must not hide a valid later installation. */ }
      }
    } catch { /* Keep the explicitly installed plugin copy as an offline fallback. */ }
    if (found) executable = found;
    else {
      if (!config.pluginFallback) throw new Error('No usable Viewer plugin is registered. Install the Claude plugin first, or use install --source checkout.');
      selection = 'plugin-fallback';
      warnings.push('No usable Viewer entry in the Claude plugin registry; using the plugin copy selected at installation. Rerun plugin setup after repairing the registry.');
    }
  }
  if (!fs.existsSync(executable)) throw new Error('Selected SMV ' + config.source + ' runtime is missing: ' + executable + '. Rerun install from the intended checkout or plugin. No other runtime was substituted.');
  executable = fs.realpathSync(executable);
  const root = path.dirname(path.dirname(executable));
  let version = 'unknown';
  try { version = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version || 'unknown'; } catch {}
  const numbers = value => /^\d+\.\d+\.\d+$/.test(value || '') ? value.split('.').map(Number) : null;
  const active = numbers(version), installed = numbers(config.installerVersion);
  if (config.source === 'plugin' && active && installed) {
    const diff = active.findIndex((n, i) => n !== installed[i]);
    if (diff >= 0 && active[diff] < installed[diff]) warnings.push('Selected plugin ' + version + ' is older than installer ' + config.installerVersion + '. Update the Claude plugin, or install --source checkout from the intended checkout.');
  }
  return { executable, root, version, source: config.source, selection, registry: config.source === 'plugin' ? config.registry : null, warnings, updatePolicy: config.source === 'plugin' ? 'Follows the Claude plugin registry; no network update is performed.' : 'Uses this checkout only; update the checkout separately.' };
}

function runLauncher(config, resolve) {
  const { spawnSync } = require('node:child_process');
  try {
    const runtime = resolve(config), args = process.argv.slice(2);
    for (const warning of runtime.warnings) process.stderr.write('SMV: ' + warning + '\n');
    if (args[0] === '--where' && (args.length === 1 || (args.length === 2 && args[1] === '--json'))) {
      process.stdout.write(args.includes('--json') ? JSON.stringify(runtime) + '\n' : runtime.executable + '\n');
      return;
    }
    if (args.length === 1 && args[0] === '--version') { process.stdout.write(runtime.version + '\n'); return; }
    const result = spawnSync(process.execPath, [runtime.executable, ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}

function currentConfig() {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const root = path.resolve(__dirname, '../../../../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  let packageHost=null;try{packageHost=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8')).host;}catch{}
  return { packageHost, fallback: fs.realpathSync(path.join(root, 'bin/smv.cjs')), source: pkg.name === 'semantic-model-viewer-plugin' ? 'plugin' : 'checkout', pluginFallback: pkg.name === 'semantic-model-viewer-plugin', installerVersion: version,
    registry: path.resolve(process.env.SMV_INSTALL_REGISTRY || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'plugins', 'installed_plugins.json')) };
}
module.exports = { resolveRuntime, runLauncher, currentConfig };
