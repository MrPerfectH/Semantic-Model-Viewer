'use strict';
/* The "On this device" list gets one sub-folder per workspace folder (repo) in a multi-root workspace. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeVscode, install } = require('./vscode-mock');

function repo(root, name, models) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const m of models) {
    const def = path.join(dir, m, 'definition');
    fs.mkdirSync(def, { recursive: true });
    fs.writeFileSync(path.join(def, 'model.tmdl'), 'model Model\n');
  }
  return dir;
}

test('multi-root workspace lists models in one sub-folder per repo', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-repos-'));
  const folders = [
    repo(root, 'Supply', ['models/sm_supply.SemanticModel']),
    repo(root, 'Choco', ['fabric/B.SemanticModel', 'archive/A.SemanticModel']),
    repo(root, 'Empty', [])
  ];
  const vscode = makeVscode({ folders, extensionRoot: path.resolve(__dirname, '../vscode-extension') });
  const restore = install(vscode);
  try {
    const { ModelsTree } = require('../vscode-extension/src/tree');
    const fabricTree = { onDidChangeTreeData: () => ({ dispose() {} }), getChildren: async () => [], getTreeItem: () => ({}) };
    const tree = new ModelsTree({ entries: () => [] }, fabricTree);
    const rows = await tree.getChildren(tree.localRoot);
    const repos = rows.filter(r => r.kind === 'repo');
    assert.deepEqual(repos.map(r => r.name), ['Choco', 'Supply'], 'repos sorted by name, repos without models are left out');
    assert.equal(rows.some(r => r.kind === 'folder'), false, 'models are not listed flat next to the repos');
    const choco = repos[0];
    assert.equal(tree.getTreeItem(choco).description, '2 models');
    const kids = await tree.getChildren(choco);
    assert.deepEqual(kids.map(k => k.name), ['A', 'B']);
    assert.equal(tree.getTreeItem(kids[0]).description, 'archive/A.SemanticModel', 'path is relative to the repo');
    assert.equal(tree.getTreeItem(repos[1]).description, '1 model');
  } finally { restore(); fs.rmSync(root, { recursive: true, force: true }); }
});
