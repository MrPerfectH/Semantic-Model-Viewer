'use strict';
const fs = require('fs');
const path = require('path');

function physicalPath(file) {
  try { return fs.realpathSync(file); } catch { return path.resolve(file); }
}
function sameFile(a, b) { return physicalPath(a) === physicalPath(b); }
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function dirtyFile(documents, file) {
  return documents.some(d => d.isDirty && d.uri.scheme === 'file' && sameFile(d.uri.fsPath, file));
}
function dirtyModel(documents, root) {
  return documents.some(d => d.isDirty && d.uri.scheme === 'file' &&
    (inside(path.resolve(root), path.resolve(d.uri.fsPath)) || inside(physicalPath(root), physicalPath(d.uri.fsPath))));
}
function regularSource(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Linked model source files are unsupported for editing.');
}
module.exports = { physicalPath, dirtyFile, dirtyModel, regularSource };
