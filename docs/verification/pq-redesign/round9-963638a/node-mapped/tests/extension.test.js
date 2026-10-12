/* Exercise the VS Code extension against tests/fixtures with a mocked `vscode` module:
   activation, workspace discovery, the ready/init handshake, opening a model through the
   webview protocol, storage round trip, cleaner file loading and the generated webview HTML. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeVscode, install, Uri } = require('./vscode-mock');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'vscode-extension');
const FIX = path.join(__dirname, 'fixtures');

// media/ must exist (npm run sync-viewer inside vscode-extension)
if (!fs.existsSync(path.join(EXT, 'media', 'index.html'))) {
  require('child_process').execFileSync(process.execPath, [path.join(EXT, 'scripts', 'sync-viewer.js')], { stdio: 'inherit' });
}

(async () => {
  const vscode = makeVscode({
    folders: [FIX], extensionRoot: EXT,
    openDialog: () => [Uri.file(path.join(FIX, 'cleaner-analysis.json'))],
    quickPick: (items) => items.find((i) => i.action === 'pick') || items[0]
  });
  const restore = install(vscode);
  const ext = require(path.join(EXT, 'src', 'extension.js'));
  const { panel, tree } = ext.activate(vscode.context);
  assert.strictEqual(vscode.context.subscriptions.length, 9, 'six commands, tree view, folder listener and panel disposable registered');

  /* --- Activity Bar tree: one row per model, click opens it --- */
  assert.strictEqual(vscode._trees['semanticModelViewer.models'], tree, 'tree provider registered under the view id');
  const rows = await tree.getChildren();
  assert.deepStrictEqual(rows.map((row) => row.id), ['ws:Fixture Model.SemanticModel', 'ws:power-query/model.bim'],
    'the tree discovers both the TMDL folder and standalone BIM fixture');
  const item = tree.getTreeItem(rows[0]);
  assert.strictEqual(item.label, 'Fixture Model');
  assert.strictEqual(item.description, 'Fixture Model.SemanticModel');
  assert.strictEqual(item.command.command, 'semanticModelViewer.openEntry');
  const bimItem = tree.getTreeItem(rows[1]);
  assert.strictEqual(bimItem.label, 'power-query');
  assert.strictEqual(bimItem.description, 'power-query/model.bim');
  assert.strictEqual(bimItem.command.command, 'semanticModelViewer.openEntry');
  assert.strictEqual(vscode._contexts['semanticModelViewer.hasModels'], true, 'hasModels context set for the welcome view');
  let fired = 0; tree.onDidChangeTreeData(() => fired++);
  await vscode.commands.executeCommand('semanticModelViewer.refreshModels');
  vscode._folderListeners.forEach((h) => h());
  assert.strictEqual(fired, 2, 'refresh command and workspace-folder changes refresh the tree');

  /* --- discovery --- */
  const ws = require(path.join(EXT, 'src', 'workspace.js'));
  const models = await ws.findModels();
  assert.deepStrictEqual(models.map((m) => [m.id, m.name, m.kind]), [['ws:Fixture Model.SemanticModel', 'Fixture Model', 'folder'], ['ws:power-query/model.bim', 'power-query', 'file']],
    'models under hidden folders (.worktrees) are not listed');
  // Archive copies are found by default, sorted after the main copy, and can be excluded by setting
  fs.mkdirSync(path.join(FIX, 'Archive', 'Fixture Model.SemanticModel', 'definition'), { recursive: true });
  fs.writeFileSync(path.join(FIX, 'Archive', 'Fixture Model.SemanticModel', 'definition', 'model.tmdl'), 'model Model\n');
  try {
    const withArchive = await ws.findModels();
    assert.deepStrictEqual(withArchive.map((m) => m.path), ['Fixture Model.SemanticModel', 'Archive/Fixture Model.SemanticModel', 'power-query/model.bim']);
    const cfg0 = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = () => ({ get: (k) => (k === 'exclude' ? ['**/Archive/**'] : cfg0().get(k)) });
    const excluded = await ws.findModels();
    vscode.workspace.getConfiguration = cfg0;
    assert.deepStrictEqual(excluded.map((m) => m.path), ['Fixture Model.SemanticModel', 'power-query/model.bim'], 'semanticModelViewer.exclude removes the archive while preserving standalone BIM discovery');
  } finally { fs.rmSync(path.join(FIX, 'Archive'), { recursive: true, force: true }); }
  assert.strictEqual(await ws.modelFromUri(Uri.file(path.join(FIX, 'cleaner-analysis.json'))), null);
  assert.strictEqual((await ws.modelFromUri(Uri.file(path.join(FIX, 'Fixture Model.SemanticModel')))).name, 'Fixture Model');

  /* --- explicitly opening the TMDL model works in a multi-model workspace --- */
  await vscode.commands.executeCommand('semanticModelViewer.openEntry', rows[0]);
  const wv = vscode._panels[0];
  assert.ok(wv, 'webview panel created');
  assert.strictEqual(wv.options.enableScripts, true);
  assert.ok(wv.webview.html.includes('host-vscode.js'), 'webview loads the VS Code host adapter');
  assert.ok(!wv.webview.html.includes('host-web.js'));
  assert.ok(!wv.webview.html.includes('fonts.googleapis.com'), 'no external font in the webview');
  assert.ok(/Content-Security-Policy/.test(wv.webview.html) && /script-src 'nonce-/.test(wv.webview.html), 'CSP with nonce');
  assert.ok(/worker-src blob:/.test(wv.webview.html), 'background analysis allows blob workers');
  assert.ok(/connect-src 'none'/.test(wv.webview.html), 'worker support does not allow webview network connections');
  const scripts = wv.webview.html.match(/<script nonce="[A-Za-z0-9]{32}" src="https:\/\/file\+\.vscode-resource[^"]+"><\/script>/g) || [];
  const canonicalHtml = fs.readFileSync(path.join(ROOT, 'Models', 'tools', 'viewer', 'index.html'), 'utf8');
  const sourceScriptCount = (canonicalHtml.match(/<script\b[^>]*src=/g) || []).length;
  assert.strictEqual(scripts.length, sourceScriptCount + 1, 'canonical scripts plus the host adapter use webview URIs');
  assert.ok(scripts[0].includes('host-vscode.js'), 'host adapter initializes before util and the app');
  assert.ok(scripts[1].includes('util.js?v='), 'hashed canonical script URLs are retained');
  assert.ok(/href="https:\/\/file\+\.vscode-resource[^"]+explorer\.css\?v=/.test(wv.webview.html), 'stylesheet URLs use webview resources');
  assert.ok(!/<script src=/.test(wv.webview.html), 'no un-nonced script tags left');

  /* --- ready -> init with the model that was asked for --- */
  await wv.webview.receive({ type: 'ready' });
  const init = wv.webview.posted.find((m) => m.type === 'init');
  assert.ok(init, 'init message sent');
  assert.deepStrictEqual(init.models, [{ id: 'ws:Fixture Model.SemanticModel', name: 'Fixture Model', path: 'Fixture Model.SemanticModel' },
    { id: 'ws:power-query/model.bim', name: 'power-query', path: 'power-query/model.bim' }]);
  assert.ok(init.open && init.open.files.length >= 9, 'model files sent with init: ' + (init.open && init.open.files.length));
  assert.ok(init.open.files.every((f) => /\.(tmdl)$/.test(f.name)), 'only model files, no .pbi / .pbism content: ' + init.open.files.map((f) => f.path).join(','));
  assert.ok(!init.open.files.some((f) => f.path.startsWith('.pbi')));
  assert.strictEqual(vscode._watchers.length, 1, 'file watcher armed for the open model');
  assert.strictEqual(vscode._watchers[0].pattern.pattern, '**/*.{tmdl,bim}');

  // the files must parse with the shared parser exactly like the CLI does
  require(path.join(ROOT, 'Models', 'tools', 'viewer', 'js', 'roles.js'));
  require(path.join(ROOT, 'Models', 'tools', 'viewer', 'js', 'tmdl-parser.js'));
  const parsed = globalThis.TMDLParser.parseAny(init.open.files);
  const expected = JSON.parse(fs.readFileSync(path.join(FIX, 'expected-model.json'), 'utf8'));
  assert.strictEqual(parsed.tables.length, expected.tables.length);
  assert.strictEqual(parsed.relationships.length, expected.relationships.length);

  /* --- request/response: listModels, openModel, storage --- */
  await wv.webview.receive({ type: 'listModels', id: 7 });
  const lm = wv.webview.posted.find((m) => m.id === 7);
  assert.deepStrictEqual(lm.models, init.models, 'listModels returns the complete discovered TMDL and BIM set');

  await wv.webview.receive({ type: 'openModel', id: 9, modelId: 'ws:nope' });
  const bad = wv.webview.posted.find((m) => m.id === 9);
  assert.ok(bad.error && /not found/.test(bad.error), 'unknown model id -> error reply');
  wv.webview.posted.length = 0;
  await wv.webview.receive({ type: 'openModel', id: 10, modelId: 'ws:Fixture Model.SemanticModel' });
  const om = wv.webview.posted.find((m) => m.id === 10);
  assert.ok(om && om.files && om.files.length >= 9, 'openModel reply carries the files');
  assert.strictEqual(om.name, 'Fixture Model');
  assert.strictEqual(om.modelId, 'ws:Fixture Model.SemanticModel');
  assert.strictEqual(om.type, 'openModel', 'reply keeps the request type');
  assert.strictEqual(wv.title, 'Fixture Model — Semantic Model Viewer');

  // Standalone BIM discovery must deliver its real metadata through the same host protocol.
  await wv.webview.receive({ type: 'openModel', id: 11, modelId: 'ws:power-query/model.bim' });
  const bimOpen = wv.webview.posted.find((m) => m.id === 11);
  assert.strictEqual(bimOpen.modelId, 'ws:power-query/model.bim');
  assert.strictEqual(bimOpen.name, 'power-query');
  assert.deepStrictEqual(bimOpen.files.map((f) => f.name), ['model.bim']);
  const bimFixture = JSON.parse(fs.readFileSync(path.join(FIX, 'power-query', 'model.bim'), 'utf8'));
  assert.deepStrictEqual(JSON.parse(bimOpen.files[0].text), bimFixture, 'host preserves the BIM bytes as text');
  const bimParsed = globalThis.TMDLParser.parseAny(bimOpen.files);
  assert.strictEqual(bimParsed.powerQuery.nodes.length, 7, 'four partitions and three shared expressions reach the parser');
  assert.strictEqual(bimParsed.powerQuery.nodes[1].code, bimFixture.model.tables[0].partitions[1].source.expression,
    'BIM partition M retains its exact trailing whitespace through host delivery and parsing');
  assert.strictEqual(bimParsed.powerQuery.nodes[4].code, bimFixture.model.expressions[0].expression);
  // Restore the TMDL model before the existing analysis/refresh lifecycle checks.
  await wv.webview.receive({ type: 'openModel', id: 12, modelId: 'ws:Fixture Model.SemanticModel' });
  const restored = wv.webview.posted.find((m) => m.id === 12);
  assert.strictEqual(restored.modelId, 'ws:Fixture Model.SemanticModel');
  assert.ok(restored.files.length >= 9, 'switching back restores the full TMDL file set');
  assert.strictEqual(wv.title, 'Fixture Model — Semantic Model Viewer');



  await wv.webview.receive({ type: 'storage', key: 'smv_layout_ws:Fixture Model.SemanticModel', value: '{"Fact Sales":{"x":1,"y":2}}' });
  await wv.webview.receive({ type: 'storage', key: 'smv-detail', value: 'cards' });
  assert.strictEqual(vscode._state.get('smv:smv-detail'), 'cards');
  await wv.webview.receive({ type: 'storage', key: 'smv-detail', value: null });
  assert.strictEqual(vscode._state.has('smv:smv-detail'), false, 'null deletes the key');
  assert.deepStrictEqual(panel.storageDump(), { 'smv_layout_ws:Fixture Model.SemanticModel': '{"Fact Sales":{"x":1,"y":2}}' });

  /* --- analysis: pick a file (quick pick chooses the file option) --- */
  wv.webview.posted.length = 0;
  await wv.webview.receive({ type: 'loadAnalysis', id: 20 });
  const la = wv.webview.posted.find((m) => m.id === 20);
  assert.ok(la.data && la.data.summary && la.data.items.length === 10, 'analysis JSON returned to the webview');

  // the command variant pushes a `usage` message
  wv.webview.posted.length = 0;
  await vscode.commands.executeCommand('semanticModelViewer.loadAnalysis');
  assert.ok(wv.webview.posted.some((m) => m.type === 'usage' && m.data.items.length === 10));

  /* --- cleaner command line --- */
  const cleaner = require(path.join(EXT, 'src', 'cleaner.js'));
  const spec = cleaner.buildCommand(models[0]);
  assert.strictEqual(spec.command, 'smc');
  assert.deepStrictEqual(spec.args.slice(0, 6), ['--models-path', path.join(FIX, 'Fixture Model.SemanticModel'), '--reports-path', FIX, '--format', 'json']);
  assert.strictEqual(spec.args[6], '-o');
  assert.strictEqual(spec.cwd, FIX);

  // a missing cleaner command is reported, not thrown
  const before = vscode.window.messages.length;
  const cfgBackup = vscode.workspace.getConfiguration;
  vscode.workspace.getConfiguration = () => ({ get: (k) => (k === 'cleaner.command' ? 'definitely-not-installed-smc' : cfgBackup().get(k)) });
  const res = await cleaner.runCleaner(models[0], null);
  vscode.workspace.getConfiguration = cfgBackup;
  assert.strictEqual(res, null);
  assert.ok(vscode.window.messages.slice(before).some((m) => /not found/.test(m[1])), 'ENOENT surfaced as a message');

  /* --- refresh + notify + dispose --- */
  wv.webview.posted.length = 0;
  await panel.refresh();
  assert.ok(wv.webview.posted.some((m) => m.type === 'model' && m.files.length >= 9), 'refresh re-sends the model');
  await wv.webview.receive({ type: 'notify', level: 'error', message: 'boom' });
  assert.ok(vscode.window.messages.some((m) => m[0] === 'error' && m[1] === 'boom'));
  wv.dispose();
  assert.strictEqual(vscode._watchers[0].disposed, true, 'watcher disposed with the panel');

  /* --- default model setting --- */
  const v2 = makeVscode({ folders: [FIX], extensionRoot: EXT, config: { defaultModel: 'Fixture Model.SemanticModel' } });
  restore();
  const restore2 = install(v2);
  delete require.cache[require.resolve(path.join(EXT, 'src', 'workspace.js'))];
  const ws2 = require(path.join(EXT, 'src', 'workspace.js'));
  const def = await ws2.resolveDefaultModel();
  assert.ok(def && def.name === 'Fixture Model', 'relative defaultModel resolves against the workspace folder');
  restore2();

  console.log('extension.test.js: ok');
})().catch((e) => { console.error(e); process.exit(1); });
