'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { makeVscode, install, Uri } = require('./vscode-mock');
const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'vscode-extension');
const FIX = path.join(__dirname, 'fixtures');
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function scratch(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-extension-host-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function fixtureModels(t) {
  const dir = scratch(t);
  for (const name of ['Alpha', 'Beta']) {
    const definition = path.join(dir, name + '.SemanticModel', 'definition');
    fs.mkdirSync(definition, { recursive: true });
    fs.writeFileSync(path.join(definition, 'model.tmdl'), 'model Model\n');
  }
  return dir;
}
function harness(t, options = {}) {
  const vscode = makeVscode({ folders: [FIX], extensionRoot: EXT, ...options });
  for (const file of ['panel', 'workspace', 'cleaner']) delete require.cache[require.resolve(path.join(EXT, 'src', file + '.js'))];
  const restore = install(vscode);
  const host = require(path.join(EXT, 'src', 'panel.js'));
  const panel = new host.ViewerPanel(vscode.context);
  const workspace = require(path.join(EXT, 'src', 'workspace.js'));
  const cleaner = require(path.join(EXT, 'src', 'cleaner.js'));
  t.after(() => { panel.dispose(); restore(); });
  return { vscode, panel, workspace, cleaner, ...host };
}
async function open(h, index = 0) {
  const models = await h.workspace.findModels();
  await h.panel.show(models[index]);
  const webview = h.vscode._panels.at(-1).webview;
  await webview.receive({ type: 'ready' });
  return { models, webview };
}
function fakeExec(t, implementation) { const old = cp.execFile; cp.execFile = implementation; t.after(() => { cp.execFile = old; }); }

test('webview packages canonical CSS and hashed scripts with a fresh nonce and adapter first', async (t) => {
  const h = harness(t);
  const { webview } = await open(h);
  const scripts = Array.from(webview.html.matchAll(/<script nonce="([a-f0-9]{32})" src="([^"]+)"><\/script>/g));
  const template = fs.readFileSync(path.join(EXT, 'media', 'index.html'), 'utf8');
  assert.equal(scripts.length, Array.from(template.matchAll(/<script\b[^>]*src=/g)).length + 1);
  assert.match(scripts[0][2], /\/js\/host-vscode\.js$/);
  assert.match(scripts[1][2], /\/js\/util\.js\?v=/);
  assert.equal(new Set(scripts.map((m) => m[1])).size, 1);
  for (const [, , src] of scripts) {
    const asset = src.split('/media/')[1].split('?')[0];
    assert.ok(fs.existsSync(path.join(EXT, 'media', asset)), asset);
  }
  for (const css of ['explorer', 'measures']) assert.match(webview.html, new RegExp('href="https://[^" ]+/' + css + '\\.css\\?v='));
  assert.doesNotMatch(webview.html, /fonts\.(?:googleapis|gstatic)\.com|host-web\.js|<script src=/);
  assert.match(webview.html, /connect-src 'none'/);
  assert.match(webview.html, /script-src 'nonce-[a-f0-9]{32}'/);
  const rebuilt = h.buildHtml(webview, h.panel.mediaUri);
  assert.notEqual(rebuilt.match(/script-src 'nonce-([^']+)'/)[1], scripts[0][1]);
});

test('snapshotAssets returns complete portable assets and pristine template without the host adapter', async (t) => {
  const h = harness(t); const { webview } = await open(h);
  await webview.receive({ type: 'snapshotAssets', id: 1 });
  const reply = webview.posted.find((m) => m.id === 1);
  const api = require(path.join(EXT, 'media', 'js', 'snapshot.js'));
  assert.equal(reply.type, 'snapshotAssets');
  assert.deepEqual(Object.keys(reply.sources).sort(), api.files.slice().sort());
  assert.equal(reply.template, fs.readFileSync(path.join(EXT, 'media', 'index.html'), 'utf8'));
  assert.doesNotMatch(reply.template, /host-vscode|vscode-resource|Content-Security-Policy/);
  assert.equal(reply.sources['js/host-vscode.js'], undefined);
  assert.match(reply.sources['js/usage-adapter.js'], /UsageAdapter/);
  assert.equal(reply.sources['explorer.css'], fs.readFileSync(path.join(EXT, 'media', 'explorer.css'), 'utf8'));
});

test('saveSnapshot uses the user-selected destination, preserves UTF-8, and strips paths from the suggested name', async (t) => {
  const dir = scratch(t), chosen = Uri.file(path.join(dir, 'Chosen file.html'));
  const h = harness(t, { saveDialog: () => chosen }); const { webview } = await open(h);
  const html = '<!doctype html><html><body>Łódź $& </body></html>';
  await webview.receive({ type: 'saveSnapshot', id: 2, filename: '../outside\\model.html', html });
  assert.deepEqual(webview.posted.find((m) => m.id === 2), { type: 'saveSnapshot', id: 2, filename: 'Chosen file.html' });
  assert.equal(fs.readFileSync(chosen.fsPath, 'utf8'), html);
  assert.equal(h.vscode._writes.length, 1);
  const proposed = h.vscode._saveDialogs[0].defaultUri.fsPath;
  assert.equal(path.dirname(proposed), FIX);
  assert.ok(proposed.endsWith('.html'));
});

test('snapshot cancellation writes nothing and failures return a request error', async (t) => {
  const h = harness(t); const { webview } = await open(h);
  await webview.receive({ type: 'saveSnapshot', id: 'cancel', html: '<html></html>', filename: 'Model.html' });
  assert.deepEqual(webview.posted.find((m) => m.id === 'cancel'), { type: 'saveSnapshot', id: 'cancel', cancelled: true });
  assert.equal(h.vscode._writes.length, 0);
  await webview.receive({ type: 'saveSnapshot', id: 3, html: { invalid: true } });
  assert.match(webview.posted.find((m) => m.id === 3).error, /Invalid HTML/);
  assert.equal(h.vscode._saveDialogs.length, 1);
  h.vscode.window.showSaveDialog = async () => Uri.file('/not-written.html');
  h.vscode.workspace.fs.writeFile = async () => { throw new Error('Disk is read-only'); };
  await webview.receive({ type: 'saveSnapshot', id: 4, html: '<html></html>' });
  assert.equal(webview.posted.find((m) => m.id === 4).error, 'Disk is read-only');
});

test('malformed messages, unsupported requests and storage keys cannot call privileged APIs', async (t) => {
  const h = harness(t); const { webview } = await open(h);
  const before = webview.posted.length;
  for (const message of [null, [], {}, { type: {} }, { type: 'execute', id: 8 }, { type: 'saveSnapshot', id: {}, html: 'x' }, { type: 'listModels', id: Infinity }]) await webview.receive(message);
  assert.equal(webview.posted.length, before);
  assert.equal(h.vscode._saveDialogs.length, 0);
  await webview.receive({ type: 'openModel', id: 5, modelId: {} });
  assert.match(webview.posted.find((m) => m.id === 5).error, /Invalid model/);
  await webview.receive({ type: 'storage', key: '__proto__', value: 'bad' });
  await webview.receive({ type: 'storage', key: 'other-extension-secret', value: 'bad' });
  await webview.receive({ type: 'storage', key: 'smv-detail', value: {} });
  assert.equal(h.vscode._state.size, 0);
  await webview.receive({ type: 'storage', key: 'lsa_model_layout_v1', value: '{}' });
  await webview.receive({ type: 'storage', key: 'smv-measures-workspace-v1', value: '{}' });
  assert.deepEqual(h.panel.storageDump(), { lsa_model_layout_v1: '{}', 'smv-measures-workspace-v1': '{}' });
});

test('openFile accepts model source paths and blocks traversal, absolute paths, and outside symlinks', async (t) => {
  const dir = fixtureModels(t), model = path.join(dir, 'Alpha.SemanticModel');
  fs.writeFileSync(path.join(dir, 'private.json'), '{"secret":true}');
  fs.symlinkSync(path.join(dir, 'private.json'), path.join(model, 'linked.json'));
  fs.symlinkSync(path.join(dir, 'Beta.SemanticModel'), path.join(model, 'linked-folder'));
  const h = harness(t, { folders: [dir] }); const { webview, models } = await open(h);
  await webview.receive({ type: 'openFile', path: 'definition/model.tmdl' });
  assert.equal(h.vscode._shown.length, 1);
  assert.equal(h.vscode._shown[0].doc.uri.fsPath, path.join(model, 'definition', 'model.tmdl'));
  for (const target of ['../private.json', '..\\private.json', path.join(dir, 'private.json'), 'C:\\private.json', 'linked.json', 'linked-folder/definition/model.tmdl']) await webview.receive({ type: 'openFile', path: target });
  assert.equal(h.vscode._opened.length, 1, 'rejected paths never reach openTextDocument');
  const files = await h.workspace.readModelFiles(models[0]);
  assert.deepEqual(files.map((f) => f.path), ['definition/model.tmdl'], 'model reader excludes symlink files and directories');
});

test('a standalone BIM only permits opening the selected model file', async (t) => {
  const dir = scratch(t); fs.writeFileSync(path.join(dir, 'model.bim'), '{}'); fs.writeFileSync(path.join(dir, 'other.bim'), '{}');
  const h = harness(t, { folders: [dir] }); const { webview } = await open(h);
  await webview.receive({ type: 'openFile', path: 'model.bim' });
  await webview.receive({ type: 'openFile', path: 'other.bim' });
  assert.equal(h.vscode._opened.length, 1);
  assert.equal(h.vscode._watchers[0].pattern.pattern, 'model.bim');
});

test('untrusted workspaces may browse and load analysis files but never execute the cleaner', async (t) => {
  let executions = 0, choices;
  fakeExec(t, () => { executions++; throw new Error('must not run'); });
  const h = harness(t, { trusted: false, config: { 'cleaner.autoRun': true },
    quickPick: (items) => { choices = items; return items[0]; },
    openDialog: () => [Uri.file(path.join(FIX, 'cleaner-analysis.json'))] });
  const { webview, models } = await open(h);
  assert.ok(webview.posted.find((m) => m.type === 'init').open.files.length);
  assert.equal(await h.cleaner.runCleaner(models[0]), null);
  await webview.receive({ type: 'loadAnalysis', id: 6 });
  assert.ok(webview.posted.find((m) => m.id === 6).data.items.length);
  assert.deepEqual(choices.map((x) => x.action), ['pick']);
  assert.equal(executions, 0);
  assert.ok(h.vscode.window.messages.some(([, message]) => /Trust this workspace/.test(message)));
});

test('cleaner uses an executable and argument array without a shell, unique outputs and cleanup on every outcome', async (t) => {
  const h = harness(t, { config: { 'cleaner.command': '/path with spaces/smc', 'cleaner.extraArgs': ['--tag', 'literal; $(not-a-command)'] } });
  const [entry] = await h.workspace.findModels(); const outputs = [];
  const a = h.cleaner.buildCommand(entry), b = h.cleaner.buildCommand(entry);
  assert.notEqual(a.out, b.out);
  let mode = 'success';
  fakeExec(t, (command, args, options, callback) => {
    assert.equal(command, '/path with spaces/smc');
    assert.equal(options.shell, false);
    assert.deepEqual(args.slice(-2), ['--tag', 'literal; $(not-a-command)']);
    const output = args[args.indexOf('-o') + 1]; outputs.push(output);
    fs.writeFileSync(output, mode === 'success' ? '{"items":[]}' : 'not json');
    callback(mode === 'execution-error' ? new Error('process failed') : null, '', '');
  });
  assert.deepEqual(await h.cleaner.runCleaner(entry), { items: [] });
  mode = 'bad-json'; assert.equal(await h.cleaner.runCleaner(entry), null);
  mode = 'execution-error'; assert.equal(await h.cleaner.runCleaner(entry), null);
  assert.ok(outputs.every((output) => !fs.existsSync(output)), 'temporary output removed on success, parse failure and execution failure');
});

test('ready initialization follows the latest requested model while an older read is pending', async (t) => {
  const h = harness(t, { folders: [fixtureModels(t)] }); const models = await h.workspace.findModels();
  const pending = deferred(), original = h.panel.modelMessage.bind(h.panel);
  h.panel.modelMessage = (entry) => entry.id === models[0].id ? pending.promise : original(entry);
  await h.panel.show(models[0]); const webview = h.vscode._panels[0].webview;
  const boot = webview.receive({ type: 'ready' }); await turn();
  await h.panel.show(models[1]);
  pending.resolve(await original(models[0])); await boot;
  assert.equal(webview.posted.filter((m) => m.type === 'init').length, 1);
  assert.equal(webview.posted.find((m) => m.type === 'init').open.modelId, models[1].id);
});

test('a slower openModel request cannot replace the newer model or watcher', async (t) => {
  const h = harness(t, { folders: [fixtureModels(t)] }); const { webview, models } = await open(h);
  const pending = deferred(), original = h.panel.modelMessage.bind(h.panel);
  h.panel.modelMessage = (entry) => entry.id === models[0].id ? pending.promise : original(entry);
  const old = webview.receive({ type: 'openModel', id: 10, modelId: models[0].id }); await turn();
  await webview.receive({ type: 'openModel', id: 11, modelId: models[1].id });
  pending.resolve(await original(models[0])); await old;
  assert.equal(webview.posted.find((m) => m.id === 10).cancelled, true);
  assert.equal(webview.posted.find((m) => m.id === 11).modelId, models[1].id);
  assert.equal(h.panel.current.id, models[1].id);
  assert.equal(h.panel.watcher.pattern.base.fsPath, models[1].uri.fsPath);
});

test('a refresh cannot push stale data after switching models and refreshModel acknowledges its push', async (t) => {
  const h = harness(t, { folders: [fixtureModels(t)] }); const { webview, models } = await open(h);
  const pending = deferred(), original = h.panel.modelMessage.bind(h.panel);
  h.panel.modelMessage = (entry) => entry.id === models[0].id ? pending.promise : original(entry);
  const refresh = h.panel.refresh(); await h.panel.show(models[1]);
  pending.resolve(await original(models[0])); assert.equal((await refresh).cancelled, true);
  assert.deepEqual(webview.posted.filter((m) => m.type === 'model').map((m) => m.modelId), [models[1].id]);
  await webview.receive({ type: 'refreshModel', id: 12 });
  assert.equal(webview.posted.at(-2).type, 'model');
  assert.deepEqual(webview.posted.at(-1), { type: 'refreshModel', id: 12, refreshed: true, modelId: models[1].id });
});

test('analysis picked for a previous model is cancelled and cannot be pushed by the command', async (t) => {
  let dialog = deferred();
  const h = harness(t, { folders: [fixtureModels(t)], quickPick: (items) => items.find((item) => item.action === 'pick'), openDialog: () => dialog.promise });
  const { webview, models } = await open(h);
  const request = webview.receive({ type: 'loadAnalysis', id: 13 }); await turn();
  await h.panel.show(models[1]);
  dialog.resolve([Uri.file(path.join(FIX, 'cleaner-analysis.json'))]); await request;
  assert.equal(webview.posted.find((m) => m.id === 13).cancelled, true);
  dialog = deferred(); const command = h.panel.loadAnalysisCommand(); await turn();
  await h.panel.refresh();
  dialog.resolve([Uri.file(path.join(FIX, 'cleaner-analysis.json'))]); await command;
  assert.equal(webview.posted.filter((m) => m.type === 'usage').length, 0);
  dialog = { promise: Promise.resolve([Uri.file(path.join(FIX, 'cleaner-analysis.json'))]) };
  await h.panel.loadAnalysisCommand();
  assert.equal(webview.posted.find((m) => m.type === 'usage').modelId, models[1].id);
});

test('automatic cleaner usage is tied to the model revision and includes the model identity', async (t) => {
  const jobs = [];
  fakeExec(t, (command, args, options, callback) => { jobs.push({ output: args[args.indexOf('-o') + 1], callback }); });
  const h = harness(t, { config: { 'cleaner.autoRun': true } });
  const { webview, models } = await open(h);
  assert.equal(jobs.length, 1);
  await h.panel.refresh(); assert.equal(jobs.length, 2);
  for (const [index, job] of jobs.entries()) { fs.writeFileSync(job.output, JSON.stringify({ revision: index })); job.callback(null, '', ''); }
  await turn();
  const usage = webview.posted.filter((message) => message.type === 'usage');
  assert.equal(usage.length, 1);
  assert.equal(usage[0].data.revision, 1);
  assert.equal(usage[0].modelId, models[0].id);
});

test('disposing the panel clears pending watcher refresh and prevents old reads reaching a new panel', async (t) => {
  const h = harness(t); const { webview, models } = await open(h);
  const pending = deferred(), original = h.panel.modelMessage.bind(h.panel);
  h.panel.modelMessage = () => pending.promise;
  const refresh = h.panel.refresh();
  h.panel.watcher.handlers.change();
  h.vscode._panels[0].dispose();
  h.panel.modelMessage = original;
  await h.panel.show(models[0]); const next = h.vscode._panels[1].webview;
  await next.receive({ type: 'ready' });
  pending.resolve(await original(models[0])); await refresh;
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(next.posted.filter((m) => m.type === 'model').length, 0);
  assert.equal(webview.posted.filter((m) => m.type === 'model').length, 0);
  assert.equal(h.vscode._watchers[0].disposed, true);
});
