'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseLaunchUri, createRegistration, TOOL_FILE } = require('../vscode-extension/src/external-tool');
const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'vscode-extension');
const uri = query => ({ authority: 'MrPerfectH.semantic-model-viewer', path: '/powerbi', query, fragment: '' });

test('Desktop launch links identify the exact local window and database', () => {
  const a = parseLaunchUri(uri('server=localhost:10001&database=first'));
  const b = parseLaunchUri(uri('server=127.0.0.1:10002&database=second%20model'));
  assert.equal(a.server, 'localhost:10001');
  assert.equal(b.database, 'second model');
  assert.notEqual(a.id, b.id);
});
for (const query of ['', 'server=%server%&database=%database%', 'server=&database=']) {
  test('no Desktop model opens an empty viewer: ' + query, () => assert.equal(parseLaunchUri(uri(query)), null));
}
for (const query of ['server=example.com:123&database=x', 'server=localhost:0&database=x', 'server=localhost:65536&database=x', 'server=localhost:12&database=x&database=y', 'server=localhost:12&database=x&unexpected=1', 'server=localhost:12&database=%00']) {
  test('rejects unsafe or ambiguous launch: ' + query, () => assert.throws(() => parseLaunchUri(uri(query))));
}
test('rejects an unrelated URI route before touching the current viewer', () => {
  assert.throws(() => parseLaunchUri({ ...uri(''), authority: 'another.extension' }));
  assert.throws(() => parseLaunchUri({ ...uri(''), path: '/other' }));
});
test('registration starts the installed Code executable directly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-registration-'));
  try {
    const appRoot = path.join(dir, 'resources/app');
    fs.mkdirSync(appRoot, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Code.exe'), '');
    const result = createRegistration(appRoot, 'vscode', EXT);
    assert.equal(result.path, path.join(dir, 'Code.exe'));
    assert.equal(result.arguments, '--open-url "vscode://MrPerfectH.semantic-model-viewer/powerbi?server=%server%&database=%database%"');
    assert.equal(TOOL_FILE, 'Semantic Model Viewer VS Code.pbitool.json');
    assert.throws(() => createRegistration(appRoot, 'cursor', EXT));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('panel refresh rereads Desktop and an empty launch clears its previous model', async () => {
  const { makeVscode, install } = require('./vscode-mock');
  const vscode = makeVscode({ folders: [], extensionRoot: EXT });
  const restore = install(vscode);
  const powerbi = require('../vscode-extension/src/powerbi');
  const original = powerbi.readPowerBiModel;
  let reads = 0;
  powerbi.readPowerBiModel = async (_root, model) => ({ ...model, files: [{ name: 'model.bim', path: 'model.bim', text: JSON.stringify({ model: { tables: [{ name: 'Trial', measures: [{ name: 'Unsaved', expression: String(++reads) }] }] } }) }] });
  const panelPath = require.resolve('../vscode-extension/src/panel');
  delete require.cache[panelPath];
  const { ViewerPanel } = require(panelPath);
  const panel = new ViewerPanel(vscode.context);
  try {
    await panel.show(parseLaunchUri(uri('server=localhost:1234&database=trial')));
    const first = vscode._panels[0];
    await first.webview.receive({ type: 'ready' });
    assert.equal(reads, 1);
    assert.equal(vscode._watchers.length, 0);
    await panel.refresh();
    assert.equal(reads, 2);
    assert.match(first.webview.posted.at(-1).files[0].text, /"expression":"2"/);
    await panel.showEmpty();
    assert.equal(first.disposed, true);
    assert.equal(panel.current, null);
    await vscode._panels[1].webview.receive({ type: 'ready' });
    assert.equal(vscode._panels[1].webview.posted.at(-1).open, null);
  } finally { panel.dispose(); powerbi.readPowerBiModel = original; delete require.cache[panelPath]; restore(); }
});
test('Windows registration adds/removes only its own file', { skip: process.platform !== 'win32' }, () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-registration-test-'));
  const folder = path.join(fixture, 'Microsoft Shared/Power BI Desktop/External Tools');
  const script = path.join(EXT, 'resources/windows/register-external-tool.ps1');
  const env = { ...process.env, 'CommonProgramFiles(x86)': fixture };
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script];
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Other.pbitool.json'), 'preserve');
  const data = { name: 'Semantic Model Viewer (VS Code)', path: 'C:\\Code.exe', arguments: '--open-url "vscode://MrPerfectH.semantic-model-viewer/powerbi?server=%server%&database=%database%"' };
  try {
    execFileSync('powershell.exe', [...args, '-RegistrationBase64', Buffer.from(JSON.stringify(data)).toString('base64')], { env });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(folder, TOOL_FILE))), data);
    execFileSync('powershell.exe', [...args, '-Remove'], { env });
    assert.equal(fs.existsSync(path.join(folder, TOOL_FILE)), false);
    assert.equal(fs.readFileSync(path.join(folder, 'Other.pbitool.json'), 'utf8'), 'preserve');
    execFileSync('powershell.exe', [...args, '-Remove'], { env });
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});
