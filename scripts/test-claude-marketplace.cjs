'use strict';

// Exercise Claude's real marketplace installer without touching the user's config.
// With no argument, build a clean git marketplace from the npm package file list.
// Pass owner/repo#ref to verify the published marketplace instead.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-marketplace-'));
const config = path.join(work, 'claude-config');
const marketplace = 'semantic-model-tools';
const plugin = 'semantic-model-viewer';
const id = plugin + '@' + marketplace;
const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_PLUGIN_PREFER_HTTPS: '1' };
const claude = process.env.SMV_CLAUDE_BIN || 'claude';
let windowsClaudeEntry;

function run(command, args, cwd = root, options = {}) {
  // execFile cannot launch npm's Windows .cmd shim. Invoke the installed
  // package's native or JavaScript entry without a shell/interpolated args.
  if (process.platform === 'win32' && command === claude && !process.env.SMV_CLAUDE_BIN) {
    if (!windowsClaudeEntry) {
      assert.ok(process.env.npm_execpath, 'Run with npm run test:marketplace');
      const globalRoot = execFileSync(process.execPath, [process.env.npm_execpath, 'root', '--global'], { encoding: 'utf8' }).trim();
      const packageRoot = path.join(globalRoot, '@anthropic-ai/claude-code');
      const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      windowsClaudeEntry = path.join(packageRoot, typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.claude);
    }
    if (/\.exe$/i.test(windowsClaudeEntry)) command = windowsClaudeEntry;
    else {
      args = [windowsClaudeEntry, ...args];
      command = process.execPath;
    }
  }
  return execFileSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180000, ...options });
}

try {
  let source = process.argv[2];
  if (process.argv.length > 3) throw new Error('Expected at most one marketplace source');
  if (!source) {
    const checkout = path.join(work, 'source');
    fs.mkdirSync(checkout);
    // npm_execpath is provided by npm run, and avoids shell/npm.cmd quoting.
    const npm = process.env.npm_execpath;
    assert.ok(npm, 'Run with npm run test:marketplace');
    const packed = JSON.parse(run(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json']))[0];
    const files = new Set(packed.files.map(file => file.path));
    files.add('package-lock.json');
    for (const name of files) {
      const destination = path.join(checkout, name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, name), destination);
    }
    assert.equal(fs.existsSync(path.join(checkout, 'node_modules')), false);
    run('git', ['init', '--initial-branch=main'], checkout);
    run('git', ['add', '.'], checkout);
    run('git', ['-c', 'user.name=SMV installer test', '-c', 'user.email=smv-test@example.invalid', 'commit', '-m', 'Marketplace test fixture'], checkout);
    const remote = path.join(work, 'marketplace.git');
    run('git', ['clone', '--bare', checkout, remote]);
    // A directory marketplace's relative-path plugins load in place. Point its
    // entry at a clean git remote to exercise the cached-copy/dependency path.
    const catalog = path.join(work, 'catalog');
    fs.mkdirSync(path.join(catalog, '.claude-plugin'), { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(checkout, '.claude-plugin/marketplace.json'), 'utf8'));
    assert.equal(manifest.plugins[0].source, './');
    manifest.plugins[0].source = { source: 'url', url: pathToFileURL(remote).href };
    fs.writeFileSync(path.join(catalog, '.claude-plugin/marketplace.json'), JSON.stringify(manifest));
    source = catalog;
  }

  fs.mkdirSync(config);
  console.log('Adding marketplace to a fresh Claude configuration...');
  console.log(run(claude, ['plugin', 'marketplace', 'add', source]).trim());
  console.log('Installing the plugin through Claude (including locked npm dependencies)...');
  console.log(run(claude, ['plugin', 'install', id, '--scope', 'user', '--json']).trim());
  const installed = JSON.parse(fs.readFileSync(path.join(config, 'plugins/installed_plugins.json'), 'utf8'));
  const entries = installed.plugins[id];
  assert.ok(entries?.length, 'Claude did not record the installed plugin');
  const pluginRoot = fs.realpathSync(entries[0].installPath);
  const relative = path.relative(fs.realpathSync(config), pluginRoot);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Expected a cached copy, not an in-place source');
  assert.ok(fs.existsSync(path.join(pluginRoot, 'node_modules')), 'Claude did not install npm dependencies');
  const load = createRequire(path.join(pluginRoot, 'package.json'));
  for (const dependency of ['@modelcontextprotocol/client', '@modelcontextprotocol/server', '@modelcontextprotocol/ext-apps/server', 'zod']) {
    assert.ok(load.resolve(dependency).startsWith(pluginRoot), 'Dependency escaped the plugin cache: ' + dependency);
  }
  const inventory = run(claude, ['plugin', 'details', id]);
  console.log(inventory.trim());
  for (const skill of ['open', 'explain', 'snapshot', 'smv-explain']) assert.ok(inventory.includes(skill), 'Missing skill: ' + skill);
  assert.match(inventory, /MCP servers \(1\)/, 'Claude did not discover the viewer MCP server');
  console.log('Testing the installed MCP server against a separate Power BI project...');
  run(process.execPath, ['--test', 'tests/claude-plugin.test.cjs'], root, {
    env: { ...env, SMV_PLUGIN_TEST_ROOT: pluginRoot }, stdio: 'inherit'
  });
  console.log('PASS: marketplace install, dependency setup, command discovery, live viewer and HTML export.');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
