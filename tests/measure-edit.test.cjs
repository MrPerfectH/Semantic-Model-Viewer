'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareMeasurePatch: patch } = require('../vscode-extension/src/measure-edit');

test('patch preserves BOM, CRLF, quoted names, properties and neighboring objects', () => {
  const source = "\uFEFFtable 'A''s'\r\n\tmeasure 'M=1' = SUM(A[Value])\r\n\t\tformatString: #,0\r\n\t\tlineageTag: abc\r\n\r\n\tmeasure Other = 2\r\n";
  const result = patch(source, "A's", 'M=1', 'VAR x = 2\nRETURN x');
  assert.equal(result.original, 'SUM(A[Value])');
  assert.equal(result.text, "\uFEFFtable 'A''s'\r\n\tmeasure 'M=1' =\r\n\t\t\tVAR x = 2\r\n\t\t\tRETURN x\r\n\t\tformatString: #,0\r\n\t\tlineageTag: abc\r\n\r\n\tmeasure Other = 2\r\n");
});
test('replaces multiline formula while preserving child metadata', () => {
  const s = 'table T\n\tmeasure M =\n\t\t\tVAR x = 1\n\t\t\tRETURN x\n\t\tdisplayFolder: Test\n';
  assert.equal(patch(s, 'T', 'M', '2').text, 'table T\n\tmeasure M =\n\t\t\t2\n\t\tdisplayFolder: Test\n');
});
test('fails closed for unsupported fenced expressions, duplicate measures and empty DAX', () => {
  assert.throws(() => patch('table T\n\tmeasure M = ```\n\t\t\t1\n\t\t\t```\n', 'T', 'M', '2'), /unsupported/);
  assert.throws(() => patch('table T\n\tmeasure M = 1\n\tmeasure M = 2\n', 'T', 'M', '2'), /Duplicate/);
  assert.throws(() => patch('table T\n\tmeasure M = 1\n', 'T', 'M', ''), /non-empty/);
  assert.equal(patch('table Other\n\tmeasure M = 1\n', 'T', 'M', '2'), null);
});
