'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const root = process.env.SMV_PLUGIN_TEST_ROOT || path.resolve(__dirname, '..');
const configuration = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));

test('plugin has a Viewer-specific namespace distinct from Cleaner', () => {
  assert.equal(configuration.name, 'semantic-model-viewer');
});

test('plugin MCP configuration starts the real viewer from a separate project with spaces', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smv plugin test '));
  const projectPath = path.join(directory, 'Power BI project');
  const plugin = path.join(directory, 'Viewer plugin');
  fs.mkdirSync(projectPath);
  const project = fs.realpathSync(projectPath);
  fs.symlinkSync(root, plugin, 'junction');
  fs.cpSync(path.join(root, 'Models/demo/Contoso Retail.SemanticModel'), path.join(project, 'Sales.SemanticModel'), { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  // Expand only the variables Claude Code supplies, then launch the shipped config.
  const variables = { CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PROJECT_DIR: project };
  const expand = value => value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    assert.ok(Object.hasOwn(variables, key), 'Unexpected configuration variable: ' + key);
    return variables[key];
  });
  const config = mcp.mcpServers.viewer;
  assert.equal(config.command, 'node');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: config.args.map(expand),
    env: {
      ...Object.fromEntries(['TMPDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
      ...Object.fromEntries(Object.entries(config.env).map(([key, value]) => [key, expand(value)]))
    },
    // The project scope must come from config, even with a different process cwd.
    cwd: plugin,
    stderr: 'pipe'
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'claude-plugin-test', version: '1' }, { capabilities: {} });
  t.after(() => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  for (const name of ['smv_sessions', 'smv_inspect', 'smv_open', 'smv_status', 'smv_update', 'smv_selection', 'smv_export', 'smv_stop']) {
    assert.ok(tools.tools.some(tool => tool.name === name), 'Missing tool: ' + name);
  }

  async function call(name, args) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result) + stderr);
    return result.structuredContent;
  }
  const model = await call('smv_inspect', { model: 'Sales.SemanticModel' });
  assert.equal(model.name, 'Contoso Retail');
  assert.equal(model.provenance.path, path.join(project, 'Sales.SemanticModel'));
  assert.ok(model.tables.some(table => table.name === 'Sales'));
  const denied = await client.callTool({ name: 'smv_inspect', arguments: { model: path.join(plugin, 'Models/demo/Contoso Retail.SemanticModel') } });
  assert.equal(denied.isError, true, 'Plugin files must not become the model scope');

  const opened = await call('smv_open', { model: 'Sales.SemanticModel', view: {} });
  assert.equal(opened.presentation.inline.available, false);
  assert.equal(opened.revision, 1);
  assert.equal(opened.view.version, 2);
  assert.equal((await call('smv_sessions', {})).sessions.length, 1);
  const url = opened.presentation.live.url;
  assert.ok(url, JSON.stringify(opened.presentation));
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /SMVInteractive/);

  const updated = await call('smv_update', { session: opened.session, revision: 1, view: { version: 2, mode: 'graph', tables: ['Date'] } });
  assert.equal(updated.revision, 2);
  assert.equal(updated.state, 'awaiting-viewer');
  const outside = await client.callTool({ name: 'smv_export', arguments: { session: opened.session, revision: 2, basis: 'authored', out: path.join(directory, 'outside.html') } });
  assert.equal(outside.isError, true);
  assert.equal(fs.existsSync(path.join(directory, 'outside.html')), false);
  const exported = await call('smv_export', { session: opened.session, revision: 2, basis: 'authored', out: 'review.html' });
  assert.equal(exported.path, path.join(project, 'review.html'));
  assert.match(fs.readFileSync(exported.path, 'utf8'), /Contoso Retail/);
  const defaultExport = await call('smv_export', { session: opened.session, revision: 2, basis: 'authored' });
  assert.equal(path.dirname(defaultExport.path), path.join(project, '.smv-artifacts'));
  assert.equal(defaultExport.artifact.gitIgnoredByDefault, true);
  assert.ok(defaultExport.artifact.bytes > 100000);
  await call('smv_stop', { session: opened.session });
  assert.equal((await call('smv_sessions', {})).sessions.length, 0);
  assert.equal(stderr, '');
});
