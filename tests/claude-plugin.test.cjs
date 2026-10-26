'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.env.SMV_PLUGIN_TEST_ROOT || path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('Viewer plugin declares CLI commands and no MCP registration or runtime dependencies', () => {
  const manifest = read(path.join(root, '.claude-plugin/plugin.json'));
  assert.equal(manifest.name, 'semantic-model-viewer');
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(fs.existsSync(path.join(root, '.mcp.json')), false);
  assert.deepEqual(read(path.join(root, 'package.json')).dependencies || {}, {});
  for (const name of ['open', 'explain', 'snapshot', 'stop', 'setup', 'smv-explain']) {
    const skill = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.doesNotMatch(skill, /\bsmv_(?:open|inspect|sessions|status|selection|update|export|stop)\b|ui:\/\/|SMV_ROOT/);
    assert.match(skill, /CLI|cli|session stop/);
  }
});

test('plugin runs discover, inspect, live sessions and HTML exports with no node_modules', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smv cli plugin '));
  const plugin = path.join(directory, 'Viewer plugin');
  const projectPath = path.join(directory, 'Power BI project');
  fs.mkdirSync(plugin); fs.mkdirSync(projectPath);
  const project = fs.realpathSync(projectPath);
  let session;
  t.after(() => {
    try { if (session && fs.existsSync(session)) run(cli, ['session', 'stop', session, '--json']); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  // Copy only the CLI and viewer runtime. There is no adapter or dependency tree
  // to accidentally load through a symlink back to the development checkout.
  for (const name of ['bin', 'Models/tools/viewer', 'scripts/claude-workspace.cjs', '.claude-plugin/plugin.json']) {
    const target = path.join(plugin, name); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, name), target, { recursive: true });
  }
  fs.cpSync(path.join(root, 'Models/demo/Contoso Retail.SemanticModel'), path.join(project, 'Sales.SemanticModel'), { recursive: true });
  const cli = path.join(plugin, 'bin/smv.cjs');
  function run(script, args) {
    return spawnSync(process.execPath, [script, ...args], { cwd: project, env: process.env, encoding: 'utf8', timeout: 15000 });
  }
  function successful(script, args) {
    const result = run(script, args);
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout;
  }
  const invoke = (...args) => successful(cli, args);
  const json = (...args) => JSON.parse(invoke(...args));
  const workspace = () => JSON.parse(successful(path.join(plugin, 'scripts/claude-workspace.cjs'), []));
  assert.equal(fs.existsSync(path.join(plugin, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(plugin, 'integrations/mcp')), false);
  assert.doesNotMatch(invoke('--help'), /\bsmv mcp\b/);
  assert.match(invoke('inspect','--help'), /Usage: smv inspect/);
  assert.match(invoke('session','update','--help'), /--wait/);
  const oldProtocol = run(cli, ['mcp']);
  assert.notEqual(oldProtocol.status, 0);
  assert.match(oldProtocol.stderr, /Unknown command/);
  const models = json('discover', '.');
  assert.equal(models.length, 1);
  assert.equal(models[0].path, path.join(project, 'Sales.SemanticModel'));
  assert.equal(invoke('--where').trim(), fs.realpathSync(cli));
  const focused = json('inspect', models[0].path, '--table', 'Sales');
  assert.equal(focused.table.name, 'Sales');
  assert.equal(focused.tables, undefined);
  const filters = json('filters-by', models[0].path, 'Date');
  assert.ok(filters.tables.some(t => t.name === 'Sales'));
  const relations = json('relations', models[0].path, '--table', 'Sales');
  assert.ok(relations.tables.some(t => t.name === 'Date'));
  assert.equal(relations.relationships, undefined);
  const deps = json('dependents', models[0].path, '--table', 'Sales');
  assert.ok(deps.measures.length);assert.ok(deps.measures.every(m => m.dax === undefined));
  const model = json('inspect', models[0].path);
  assert.equal(model.name, 'Contoso Retail');
  assert.ok(model.tables.some(table => table.name === 'Sales'));
  const sourceFile = path.join(models[0].path, 'definition/model.tmdl');
  const original = fs.readFileSync(sourceFile, 'utf8');
  const prepared = workspace(); session = prepared.newSessionFile;
  assert.equal(prepared.cliPath, fs.realpathSync(cli));
  assert.equal(prepared.projectRoot, project);
  assert.equal(prepared.sessions.length, 0);
  const opened = json('serve', models[0].path, '--background', '--session', session, '--json');
  assert.equal(opened.source, models[0].path);
  assert.equal(opened.appliedView.version, 2);
  assert.equal((workspace()).sessions[0].file, session);
  const response = await fetch(opened.url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /SMVInteractive/);
  const currentView = { version: 2, mode: 'graph', tables: ['Date'] };
  fs.writeFileSync(prepared.newViewFile, JSON.stringify(currentView));
  const update = json('session', 'update', session, '--view', prepared.newViewFile, '--revision', '1', '--apply', '--wait', '0', '--json');
  assert.equal(update.revision, 2);
  assert.equal(update.state, 'awaiting-viewer');
  assert.equal(update.application.applyRequested, true);
  assert.equal(update.confirmed, false);
  assert.equal(update.timedOut, true);
  assert.equal(update.view.banner, false);
  const status = json('session', 'status', session, '--json');
  assert.equal(status.revision, 2);
  const endpoint = new URL(opened.url); endpoint.pathname = '/client';
  const receipt = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: 'test-browser', revision: 2, sourceRevision: status.sourceRevision, currentView, selection: { kind: 'table', name: 'Date' }, workspace: 'graph', explored: true }) });
  assert.equal(receipt.status, 200);
  assert.equal(json('session', 'selection', session, '--json').selection.name, 'Date');
  const exported = json('session', 'export', session, '--basis', 'current', '--revision', '2', '--out', prepared.newExportFile, '--json');
  assert.equal(exported.basis, 'current');
  assert.match(fs.readFileSync(exported.path, 'utf8'), /Contoso Retail/);
  const snapshot = path.join(prepared.artifactsDir, 'snapshot.html');
  invoke('snapshot', models[0].path, '--measure', 'Sales LY', '--out', snapshot);
  assert.match(fs.readFileSync(snapshot, 'utf8'), /SAMEPERIODLASTYEAR/);
  assert.equal(fs.readFileSync(sourceFile, 'utf8'), original);
  assert.equal(json('session', 'stop', session, '--json').stopped, true);
  assert.equal((workspace()).sessions.length, 0);
});

test('CLI workspace helper ignores artifacts and refuses symlink destinations', t => {
  const { prepare } = require(path.join(root, 'scripts/claude-workspace.cjs'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smv cli workspace '));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const project = path.join(directory, 'project'), outside = path.join(directory, 'outside');
  fs.mkdirSync(project); fs.mkdirSync(outside);
  assert.equal(spawnSync('git', ['init'], { cwd: project }).status, 0);
  fs.writeFileSync(path.join(project, '.gitignore'), 'original\n');
  const state = prepare(project); fs.writeFileSync(state.newExportFile, 'artifact');
  assert.equal(spawnSync('git', ['check-ignore', state.newExportFile], { cwd: project }).status, 0);
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), 'original\n');
  fs.rmSync(state.artifactsDir, { recursive: true });
  fs.symlinkSync(outside, path.join(project, '.smv-artifacts'), 'junction');
  assert.throws(() => prepare(project), /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
