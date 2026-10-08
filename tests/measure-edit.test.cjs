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

test('metadata preserves fenced DAX, BOM, CRLF and unrelated bytes', () => {
 const source = '\uFEFFtable T\r\n\t/// Old\r\n\tmeasure M = ```\r\n\t\t\t1\r\n\t\t\t```\r\n\t\tdisplayFolder: Old\r\n\t\tformatString: 0\r\n\t\tannotation Keep = yes\r\n\r\n\tmeasure N = 2\r\n';
 const result = patch(source, 'T', 'M', undefined, {description:'First\n\nThird',displayFolder:'A\\B',formatString:'0 "units"'});
 assert.equal(result.text, source.replace('\t/// Old\r\n','\t/// First\r\n\t///\r\n\t/// Third\r\n').replace('displayFolder: Old','displayFolder: "A\\B"').replace('formatString: 0','formatString: "0 ""units"""'));
 assert.throws(()=>patch(source,'T','M','2',{description:'New'}),/unsupported/);
});
test('metadata insertion and removal round trips without changing neighbors',()=>{
 const source='table T\n\tmeasure M = 1\n\n\tmeasure N = 2\n';
 const added=patch(source,'T','M',undefined,{description:'Hello',displayFolder:'Folder',formatString:'0.00'}).text;
 assert.equal(patch(added,'T','M',undefined,{description:'',displayFolder:'',formatString:''}).text,source);
 assert.equal(patch(added,'T','M',undefined,{}).text,added);
});
test('metadata rejects dynamic formats, duplicate and multiline properties and invalid payloads',()=>{
 const base='table T\n\tmeasure M = 1\n';
 for(const tail of ['\t\tformatStringDefinition =\n\t\t\texpression = "0"\n','\t\tformatString: 0\n\t\tformatString: 1\n','\t\tformatString:\n\t\t\t0\n']) assert.throws(()=>patch(base+tail,'T','M',undefined,{formatString:'2'}),/unsupported|Unsupported|Duplicate/);
 assert.throws(()=>patch(base,'T','M',undefined,{displayFolder:'A\nB'}),/Invalid/);
 assert.throws(()=>patch(base,'T','M',undefined,{rename:'X'}),/Invalid/);
 assert.throws(()=>patch(base+'\t\tdescription: Old\n','T','M',undefined,{description:'New'}),/Unsupported/);
});

test('scalar casing and colon whitespace replace existing properties without duplicates', () => {
  const base = 'table T\n\tmeasure M = 1\n';
  for (const [key, spelling] of [['displayFolder', 'DisplayFolder'], ['formatString', 'FORMATSTRING']]) {
    for (const gap of ['', ' ', '\t']) {
      const source = base + '\t\t' + spelling + gap + ': Old\n';
      assert.equal(patch(source, 'T', 'M', undefined, { [key]: 'New' }).text, base + '\t\t' + key + ': "New"\n');
      assert.equal(patch(source, 'T', 'M', undefined, { [key]: '' }).text, base);
      assert.throws(() => patch(source + '\t\t' + key + ': Duplicate\n', 'T', 'M', undefined, { [key]: 'New' }), /Duplicate/);
    }
  }
});
test('case variants cannot bypass description or dynamic format layout guards', () => {
  const base = 'table T\n\tmeasure M = 1\n';
  for (const spelling of ['Description', 'DESCRIPTION']) {
    assert.throws(() => patch(base + '\t\t' + spelling + ' \t: Old\n', 'T', 'M', undefined, { description: 'New' }), /Unsupported description/);
  }
  for (const spelling of ['FormatStringDefinition', 'FORMATSTRINGDEFINITION']) {
    const source = base + '\t\t' + spelling + ' =\n\t\t\texpression = "0"\n';
    assert.throws(() => patch(source, 'T', 'M', undefined, { formatString: '0.00' }), /Dynamic format/);
    assert.equal(patch(source, 'T', 'M', undefined, { description: 'New' }).text, 'table T\n\t/// New\n' + source.slice('table T\n'.length));
  }
});
test('metadata patch preserves the next object description byte for byte', () => {
  const prefix = '\uFEFFtable T\r\n\t/// Before\r\n\tmeasure M = 1\r\n\t\tDisplayFolder : Old\r\n\r\n';
  const next = '\t/// Next object description\r\n\t///  Indented detail\r\n\tmeasure N = 2\r\n\t\tformatString: 0\r\n';
  assert.equal(patch(prefix + next, 'T', 'M', undefined, { description: 'Updated', displayFolder: 'New', formatString: '0.00' }).text, prefix.replace('/// Before', '/// Updated').replace('DisplayFolder : Old', 'displayFolder: "New"').replace('\r\n\r\n', '\r\n\t\tformatString: "0.00"\r\n\r\n') + next);
});
