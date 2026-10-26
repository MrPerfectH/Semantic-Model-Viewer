/* Run inside an installed VS Code extension host, after opening a live test model.
   This signs out and removes only the selected test model from that test profile.
   Never run against a user's normal profile. Returns sanitized assertions only. */
'use strict';
const assert = require('node:assert/strict');
exports.run = async function(api) {
  const vscode = require('vscode');
  const fabric = api.fabricTree.fabric;
  const entry = api.panel.current;
  assert.equal(entry.kind, 'fabric', 'Open a live test model first');
  const checks = [];
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
  const refreshed = await fabric.refresh(entry);
  check('live refresh replaces one cache entry after validated retrieval',
    fabric.entries().filter(e => e.id === entry.id).length === 1 && refreshed.files.length > 0 && Date.parse(refreshed.fetchedAt) >= Date.parse(entry.fetchedAt));
  const good = JSON.stringify(fabric.entries());
  await assert.rejects(fabric.refresh({...refreshed, tenantId:'acceptance-other-tenant'}), /account and tenant/);
  check('wrong-tenant refresh preserves last good cache', JSON.stringify(fabric.entries()) === good);
  await assert.rejects(fabric.refresh({...refreshed, accountId:'acceptance-other-account'}), /account and tenant/);
  check('wrong-account refresh preserves last good cache', JSON.stringify(fabric.entries()) === good);
  await fabric.signOut();
  check('sign-out clears active credentials', !(await fabric.request({action:'status'})).account);
  await assert.rejects(fabric.request({action:'listWorkspaces'}), /Sign in/);
  check('signed-out discovery cannot use old credentials', true);
  await vscode.commands.executeCommand('semanticModelViewer.openEntry', refreshed);
  check('saved model reopens while signed out', api.panel.current.id === refreshed.id && api.panel.current.files.length > 0);
  await fabric.remove(refreshed.id);
  check('explicit removal deletes selected saved metadata', !fabric.entries().some(e => e.id === refreshed.id));
  return {platform:process.platform,arch:process.arch,checks};
};
