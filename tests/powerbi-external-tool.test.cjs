'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const { makeVscode, install } = require('./vscode-mock');
const EXT = path.resolve(__dirname, '../vscode-extension');
const { parseLaunchUri, createRegistration, EXTENSION_ID, TOOL_FILE } = require('../vscode-extension/src/external-tool');

function uri(query = '') { return { authority: EXTENSION_ID, path: '/powerbi', query, fragment: '' }; }
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-powerbi-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('ribbon launch selects the exact local Desktop model; absent models open empty', () => {
  const model = parseLaunchUri(uri('server=localhost:54321&database=11111111-2222-3333-4444-555555555555'));
  assert.equal(model.server, 'localhost:54321');
  assert.equal(model.database, '11111111-2222-3333-4444-555555555555');
  assert.equal(model.kind, 'powerbi');
  assert.equal(parseLaunchUri(uri()), null);
  assert.equal(parseLaunchUri(uri('server=&database=')), null);
  assert.equal(parseLaunchUri(uri('server=%server%&database=%database%')), null);
  assert.equal(parseLaunchUri(uri('server=localhost:54321&database=')), null);
  assert.equal(parseLaunchUri(uri('server=127.0.0.1:54321&database=My%20model')).database, 'My model');
});

test('public launch links cannot supply remote servers, paths, or duplicate connection parameters', () => {
  for (const query of [
    'server=attacker.example:54321&database=model',
    'server=localhost.attacker.example:54321&database=model',
    'server=localhost:0&database=model',
    'server=localhost:65536&database=model',
    'server=localhost:54321;User%20ID=alice&database=model',
    'server=localhost:54321&server=localhost:54322&database=model',
    'server=localhost:54321&database=first&database=second',
    'server=localhost:54321&database=model&outputPath=C:/secret',
    'server=localhost:54321&database=%00model',
    'server=&database=model'
  ]) assert.throws(() => parseLaunchUri(uri(query)), /local Desktop model|Invalid Power BI/);
  assert.throws(() => parseLaunchUri({ ...uri(), path: '/other' }), /Unsupported/);
  assert.throws(() => parseLaunchUri({ ...uri(), authority: 'other.extension' }), /Unsupported/);
  assert.throws(() => parseLaunchUri({ ...uri(), fragment: 'unexpected' }), /Unsupported/);
});

test('registration uses the installed editor directly and survives extension version changes', (t) => {
  const dir = scratch(t), appRoot = path.join(dir, 'VS Code with spaces', 'resources', 'app');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(path.resolve(appRoot, '../../Code.exe'), 'test executable');
  fs.writeFileSync(path.resolve(appRoot, '../../Code - Insiders.exe'), 'test executable');
  const registration = createRegistration(appRoot, 'vscode', EXT);
  assert.equal(registration.path, path.resolve(appRoot, '../../Code.exe'));
  assert.equal(registration.arguments, '--open-url "vscode://' + EXTENSION_ID + '/powerbi?server=%server%&database=%database%"');
  assert.match(registration.iconData, /^image\/png;base64,/);
  assert.ok(!registration.arguments.includes(EXT));
  assert.match(createRegistration(appRoot, 'vscode-insiders', EXT).arguments, /vscode-insiders:\/\//);
  assert.throws(() => createRegistration(appRoot, 'https', EXT), /supports VS Code/);
  assert.throws(() => createRegistration(dir, 'vscode', EXT), /locate/);
});

function extensionHarness(t, responder) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  t.after(() => Object.defineProperty(process, 'platform', platform));
  const calls = [];
  t.mock.method(childProcess, 'execFile', (file, args, options, callback) => {
    calls.push({ file, args, options });
    responder({ file, args, options, callback });
  });
  const vscode = makeVscode({ folders: [], extensionRoot: EXT });
  const restore = install(vscode);
  for (const file of ['extension', 'panel', 'workspace', 'tree', 'powerbi', 'external-tool']) {
    delete require.cache[require.resolve(path.join(EXT, 'src', file + '.js'))];
  }
  const extension = require('../vscode-extension/src/extension');
  const { panel } = extension.activate(vscode.context);
  t.after(() => { panel.dispose(); restore(); });
  return { vscode, panel, calls };
}

test('ribbon URI reaches TOM without discovery, refresh rereads Desktop, and empty launch clears the old model', async (t) => {
  let revision = 0;
  const h = extensionHarness(t, ({ args, callback }) => {
    assert.ok(args.includes('-Connect'), 'ribbon launch must never choose a different discovered model');
    assert.equal(args[args.indexOf('-Server') + 1], 'localhost:54321');
    assert.equal(args[args.indexOf('-Database') + 1], 'chosen-model');
    const output = args[args.indexOf('-OutputPath') + 1];
    fs.writeFileSync(output, JSON.stringify({ name: 'chosen-model', model: { tables: [], expressions: [{ name: 'Revision', expression: String(++revision) }] } }));
    callback(null, '', '');
  });
  await h.vscode._uriHandler.handleUri(uri('server=localhost:54321&database=chosen-model'));
  const first = h.vscode._panels[0];
  await first.webview.receive({ type: 'ready' });
  const init = first.webview.posted.find((message) => message.type === 'init');
  assert.equal(JSON.parse(init.open.files[0].text).model.expressions[0].expression, '1');
  await h.panel.refresh();
  const refreshed = first.webview.posted.find((message) => message.type === 'model');
  assert.equal(JSON.parse(refreshed.files[0].text).model.expressions[0].expression, '2');
  assert.equal(h.calls.length, 2);
  assert.equal(h.vscode._watchers.length, 0);
  for (const call of h.calls) {
    assert.ok(!fs.existsSync(call.args[call.args.indexOf('-OutputPath') + 1]), 'temporary metadata is deleted after each read');
  }
  await h.vscode._uriHandler.handleUri(uri());
  assert.equal(first.disposed, true);
  const empty = h.vscode._panels[1];
  await empty.webview.receive({ type: 'ready' });
  assert.equal(empty.webview.posted.find((message) => message.type === 'init').open, null);
  assert.equal(h.panel.current, null);
  assert.equal(h.calls.length, 2, 'empty launch makes no connection');
  await h.vscode._uriHandler.handleUri(uri('server=remote:54321&database=model'));
  assert.equal(h.calls.length, 2, 'invalid launch makes no connection');
  assert.match(h.vscode.window.messages.at(-1)[1], /local Desktop model/);
});

test('manual connection with no Desktop model opens an empty viewer; failed reads clean up temporary exports', async (t) => {
  let output;
  const h = extensionHarness(t, ({ args, callback }) => {
    if (args.includes('-List')) return callback(null, '[]', '');
    output = args[args.indexOf('-OutputPath') + 1];
    fs.writeFileSync(output, 'partial sensitive metadata');
    callback(new Error('Desktop closed'), '', 'The selected model is no longer open.');
  });
  await h.vscode.commands.executeCommand('semanticModelViewer.connectPowerBI');
  await h.vscode._panels[0].webview.receive({ type: 'ready' });
  assert.equal(h.panel.current, null);
  await h.vscode._uriHandler.handleUri(uri('server=localhost:54321&database=closed-model'));
  const failed = h.vscode._panels.at(-1);
  await failed.webview.receive({ type: 'ready' });
  assert.equal(fs.existsSync(output), false);
  assert.ok(failed.webview.posted.some((message) => message.type === 'error' && /no longer open/.test(message.message)));
  assert.equal(failed.webview.posted.find((message) => message.type === 'init').open, null);
});

test('registration is explicit, cancellation makes no change, and removal uses only its dedicated file', async (t) => {
  const dir = scratch(t), appRoot = path.join(dir, 'resources', 'app');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Code.exe'), 'test executable');
  const h = extensionHarness(t, ({ args, callback }) => {
    assert.match(args[args.indexOf('-File') + 1], /register-external-tool\.ps1$/);
    callback(null, 'registered', '');
  });
  h.vscode.env = { appRoot, uriScheme: 'vscode' };
  assert.equal(h.calls.length, 0, 'activation never requests elevation');
  await h.vscode.commands.executeCommand('semanticModelViewer.registerPowerBI');
  assert.equal(h.calls.length, 0, 'cancel does not execute a registration script');
  h.vscode.window.showInformationMessage = async (message, options, action) => action;
  await h.vscode.commands.executeCommand('semanticModelViewer.registerPowerBI');
  const args = h.calls[0].args;
  const registration = JSON.parse(Buffer.from(args[args.indexOf('-RegistrationBase64') + 1], 'base64').toString('utf8'));
  assert.equal(registration.path, path.join(dir, 'Code.exe'));
  assert.match(registration.arguments, /server=%server%&database=%database%/);
  await h.vscode.commands.executeCommand('semanticModelViewer.unregisterPowerBI');
  assert.ok(h.calls[1].args.includes('-Remove'));
  assert.ok(!h.calls[1].args.includes('-RegistrationBase64'));
  const script = fs.readFileSync(path.join(EXT, 'resources/windows/register-external-tool.ps1'), 'utf8');
  assert.ok(script.includes(TOOL_FILE));
  assert.ok(!script.includes('Semantic Model Viewer.pbitool.json'), 'legacy portable registration is independent');
});
