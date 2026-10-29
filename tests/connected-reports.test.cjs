'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeVscode, install } = require('./vscode-mock');

test('tree binds local Reports by path, excludes invalid bindings, and refreshes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-reports-'));
  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  };
  const report = (name, target) => write(name + '.Report/definition.pbir', JSON.stringify({ datasetReference: { byPath: { path: target } } }));
  write('Main.SemanticModel/definition/model.tmdl', 'model Model');
  write('Archive/Main.SemanticModel/definition/model.tmdl', 'model Model');
  report('Executive', '..\\Main.SemanticModel');
  report('Nested/Detail', '../../Main.SemanticModel');
  report('Archive/Other', '../Main.SemanticModel');
  report('.hidden/Secret', '../../Main.SemanticModel');
  report('Excluded/Secret', '../../Main.SemanticModel');
  write('Broken.Report/definition.pbir', '{');
  write('Remote.Report/definition.pbir', JSON.stringify({ datasetReference: { byConnection: { connectionString: 'Initial Catalog=Main' } } }));
  const vscode = makeVscode({ folders: [root], config: { exclude: ['**/Excluded/**'] } });
  const restore = install(vscode);
  const { ModelsTree } = require('../vscode-extension/src/tree');
  const tree = new ModelsTree();
  try {
    let models = await tree.getChildren();
    const main = models.find((m) => m.path === 'Main.SemanticModel');
    const archive = models.find((m) => m.path === 'Archive/Main.SemanticModel');
    const reports = await tree.getChildren(main);
    assert.deepEqual(reports.map((r) => r.name), ['Detail', 'Executive']);
    assert.deepEqual((await tree.getChildren(archive)).map((r) => r.name), ['Other']);
    assert.equal(tree.getTreeItem(main).command.command, 'semanticModelViewer.openEntry');
    assert.equal(tree.getTreeItem(main).collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    assert.equal(tree.getTreeItem(reports[0]).command.command, 'vscode.open');
    assert.equal(tree.getTreeItem(reports[0]).command.arguments[0], reports[0].uri);
    assert.deepEqual(await tree.getChildren(reports[0]), []);
    report('Executive', '../Archive/Main.SemanticModel');
    fs.rmSync(path.join(root, 'Nested'), { recursive: true });
    tree.refresh(); models = await tree.getChildren();
    const empty = await tree.getChildren(models.find((m) => m.path === 'Main.SemanticModel'));
    assert.equal(empty[0].name, 'No connected local Reports');
    assert.equal(tree.getTreeItem(empty[0]).command, undefined);
    assert.deepEqual((await tree.getChildren(models.find((m) => m.path.startsWith('Archive/')))).map((r) => r.name), ['Executive', 'Other']);
  } finally { tree.dispose(); restore(); fs.rmSync(root, { recursive: true, force: true }); }
});
