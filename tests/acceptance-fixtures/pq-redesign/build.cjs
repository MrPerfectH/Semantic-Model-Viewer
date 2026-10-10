'use strict';
// Independent synthetic corpus. Does not import production code, parse or execute M.
// Annotated source fragments express author intent, not name matching or a resolver.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const mid = (kind, table, name) => JSON.stringify([kind, table || '', name]);
const eid = name => mid('expression', '', name);
const pid = (table, name = 'Main') => mid('partition', table, name);
const expr = (name, expression) => ({name, kind: 'm', expression});
const table = (name, expression) => ({name, columns: [{name: 'ID', dataType: 'int64'}], partitions: [{name: 'Main', source: {type: 'm', expression}}]});
function source(parts) {
  let code = ''; const references = [];
  for (const p of parts) {
    if (typeof p === 'string') code += p;
    else { const at = code.length; code += p.text; references.push({id: p.id, name: p.name, at, end: code.length, text: p.text}); }
  }
  return {code, references};
}
const ref = (name, text = name) => ({id: eid(name), name, text});
const corpus = {};
function add(name, tables, expressions, expected, relationships = []) {
  corpus[name] = {input: {name: 'Independent PQ redesign ' + name, model: {tables, expressions, relationships}}, expected};
}
const edge = (inputId, consumerId) => ({inputId, consumerId});
const ids = (tables, expressions) => [...tables.flatMap(t => t.partitions.map(p => pid(t.name, p.name))), ...expressions.map(e => eid(e.name))];
function expectation(tables, expressions, edges = [], extra = {}) {
  return {metadataIds: ids(tables, expressions), statusTables: [], edges, occurrences: {}, ...extra};
}

// A1: relationship and co-location deliberately tempt a false source/relationship edge.
{
  const tables = ['Sales', 'Customer', 'Product', 'Calendar', 'Rates', 'Budget'].map(name => table(name,
    'let Source = Sql.Database("same-sql.pq-redesign.invalid", "SameDB"), Result = Source{[Schema="dbo", Item="' + name + '"]}[Data] in Result'));
  add('a1-disconnected', tables, [], expectation(tables, []), [{name: 'SemanticOnly', fromTable: 'Sales', fromColumn: 'ID', toTable: 'Customer', toColumn: 'ID'}]);
}
// A2: exactly five consumers; text, fields, let/function bindings must not add edges.
{
  const expressions = [expr('Server', '"PQ_REDESIGN_PARAMETER_ONLY" meta [IsParameterQuery=true]')];
  const occurrences = {};
  for (let i = 1; i <= 5; i++) {
    const s = source(['Sql.Database(', ref('Server'), ', "SameDB")']);
    expressions.push(expr('Consumer' + i, s.code)); occurrences[eid('Consumer' + i)] = s.references;
  }
  expressions.push(expr('LocalShadow', 'let Server = "local", Text = "Server" /* Server */ in Server'),
    expr('FunctionShadow', '(Server as text) => Server'), expr('FieldOnly', 'let r = [Server = "field"] in r[Server]'));
  add('a2-parameter', [], expressions, expectation([], expressions,
    [1, 2, 3, 4, 5].map(i => edge(eid('Server'), eid('Consumer' + i))), {occurrences}));
}
// A3: exactly four result-directed edges, plus a disconnected object.
{
  const expressions = [expr('Q1', '#table({"ID"}, {})'), expr('Q2', '#table({"ID"}, {})'), expr('Q3', '#table({"ID"}, {})')];
  const merge = source(['Table.NestedJoin(', ref('Q1'), ', {"ID"}, ', ref('Q2'), ', {"ID"}, "Joined")']);
  const append = source(['Table.Combine({', ref('MergeResult'), ', ', ref('Q3'), '})']);
  expressions.push(expr('MergeResult', merge.code), expr('AppendResult', append.code), expr('Disconnected', '42'));
  add('a3-results', [], expressions, expectation([], expressions,
    [['Q1', 'MergeResult'], ['Q2', 'MergeResult'], ['MergeResult', 'AppendResult'], ['Q3', 'AppendResult']].map(([a,b]) => edge(eid(a), eid(b))),
    {occurrences: {[eid('MergeResult')]: merge.references, [eid('AppendResult')]: append.references}}));
}
// A4/A9: emoji before refs distinguishes UTF-16 offsets from code points/UTF-8 bytes.
// Every unannotated same-name token below is explicitly NOT navigable.
{
  const s = source(['let\r\n  Emoji = "😀",\r\n  First = ', ref('Sales Raw', '#"Sales Raw"'),
    ',\r\n  Again = ', ref('Sales Raw', '#"Sales Raw"'), ',\r\n  Escaped = ', ref('Quote"Query', '#"Quote""Query"'),
    ',\r\n  EscapedCode = ', ref('Sales Raw', '#"Sales#(0020)Raw"'), ',\r\n  Parameter = ', ref('Server'),
    ',\r\n  Text = "Sales Raw Server", // #"Sales Raw" Server\r\n  Local = (let #"Sales Raw" = 1 in #"Sales Raw"),\r\n  Lambda = (Server as text) => Server,\r\n  Field = [Server = "field"][Server]\r\nin {First, Again, Escaped, EscapedCode, Parameter, Local, Field}  \r\n']);
  const expressions = [expr('Sales Raw', '1'), expr('Quote"Query', '2'), expr('Server', '"PQ_REDESIGN_PARAMETER_ONLY" meta [IsParameterQuery=true]'), expr('OccurrenceProbe', s.code)];
  add('a4-occurrences', [], expressions, expectation([], expressions,
    ['Sales Raw', 'Quote"Query', 'Server'].map(n => edge(eid(n), eid('OccurrenceProbe'))), {occurrences: {[eid('OccurrenceProbe')]: s.references}, exactSource: {id: eid('OccurrenceProbe'), file: 'exact-source.m'}}));
}
// A6: exact TOTAL inventory, no partition extras obscuring threshold semantics.
for (const count of [300, 301, 350, 1000]) {
  const expressions = Array.from({length: count}, (_, i) => expr('Object' + String(i).padStart(4, '0'), '1'));
  add('a6-disconnected-' + count, [], expressions, expectation([], expressions, [], {lastId: eid('Object' + String(count - 1).padStart(4, '0'))}));
}
{
  const expressions = [expr('Server', '"PQ_REDESIGN_FANOUT_ONLY" meta [IsParameterQuery=true]'),
    ...Array.from({length: 250}, (_, i) => expr('Fan' + String(i).padStart(3, '0'), 'Server'))];
  add('a6-fanout-250', [], expressions, expectation([], expressions,
    expressions.slice(1).map(e => edge(eid('Server'), eid(e.name))), {lastId: eid('Fan249'), parameterId: eid('Server'),
      occurrences: Object.fromEntries(expressions.slice(1).map(e => [eid(e.name), source([ref('Server')]).references]))}));
}
// A7: intentionally malformed metadata must remain inspectable without guessed targets.
{
  const tables = [{name: 'Sales', columns: [], partitions: ['Current', 'History'].map(name => ({name, source: {type: 'm', expression: 'RangeStart'}}))},
    {name: 'NoPartitions', columns: [], partitions: []},
    {name: 'NonM', columns: [], partitions: [{name: 'Calc', source: {type: 'calculated', expression: 'ROW("ID", 1)'}}]},
    {name: 'Missing', columns: [], partitions: [{name: 'Main'}]}, table('Collision', '1')];
  const expressions = [expr('RangeStart', '"2026-01-01" meta [IsParameterQuery=true]'), expr('AmbiguousTable', 'Sales'),
    expr('Collision', '2'), expr('AmbiguousName', 'Collision'), expr('Duplicate', '1'), expr('Duplicate', '2'), expr('DuplicateConsumer', 'Duplicate'),
    expr('Dynamic', 'Expression.Evaluate("Sales", #shared)'), expr('MissingRef', 'NotInMetadata'),
    expr('Unsupported', 'section Section1; shared Probe = RangeStart;'), expr('CycleA', 'CycleB'), expr('CycleB', 'CycleA'),
    expr('SelfCycle', 'SelfCycle'), expr('ParseFailure', 'RangeStart +')];
  add('a7-uncertainty', tables, expressions, expectation(tables, expressions,
    [edge(eid('RangeStart'), pid('Sales', 'Current')), edge(eid('RangeStart'), pid('Sales', 'History')),
      edge(eid('CycleA'), eid('CycleB')), edge(eid('CycleB'), eid('CycleA')), edge(eid('SelfCycle'), eid('SelfCycle'))],
    {statusTables: ['NoPartitions'], duplicateMetadataIds: [eid('Duplicate')],
      issueConsumers: {AmbiguousTable: 'ambiguous', AmbiguousName: 'ambiguous', DuplicateConsumer: 'ambiguous', Dynamic: 'dynamic', MissingRef: 'unresolved', Unsupported: 'incomplete', ParseFailure: 'incomplete'},
      states: {[pid('NonM', 'Calc')]: 'non-m', [pid('Missing')]: 'missing'},
      occurrences: {[pid('Sales', 'Current')]: source([ref('RangeStart')]).references, [pid('Sales', 'History')]: source([ref('RangeStart')]).references,
        [eid('CycleA')]: source([ref('CycleB')]).references, [eid('CycleB')]: source([ref('CycleA')]).references, [eid('SelfCycle')]: source([ref('SelfCycle')]).references},
      cycles: [[eid('CycleA'), eid('CycleB')], [eid('SelfCycle')]]}));
}
// A8: identical metadata IDs across A/B prevent a reset test that passes by luck.
for (const [suffix, marker] of [['a', 'PQ_REDESIGN_RESET_A_ONLY'], ['b', 'PQ_REDESIGN_RESET_B_ONLY']]) {
  const expressions = [expr('SameIdentity', '"' + marker + '"')];
  const tables = [table('SameTable', 'SameIdentity')];
  add('a8-reset-' + suffix, tables, expressions, expectation(tables, expressions, [edge(eid('SameIdentity'), pid('SameTable'))],
    {marker, occurrences: {[pid('SameTable')]: source([ref('SameIdentity')]).references}}));
}
add('a8-without-m', [{name: 'SameTable', columns: [], partitions: []}], [], {metadataIds: [], statusTables: ['SameTable'], edges: [], occurrences: {}});
{
  const expressions = [expr('UnsafeText', '"</script><img src=""https://pq-redesign.invalid/x"" onerror=""globalThis.PQ_XSS_EXECUTED=1""><svg onload=""globalThis.PQ_XSS_EXECUTED=2""> PQ_REDESIGN_RAW_ONLY"')];
  add('a9-privacy', [], expressions, expectation([], expressions, [], {forbiddenExport: ['powerQuery', 'PQ_REDESIGN_RAW_ONLY', 'pq-redesign.invalid', 'PQ_XSS_EXECUTED']}));
}

function artifacts() {
  const out = {};
  const expected = {schemaVersion: 1, provenance: 'Hand-authored synthetic intent; no production analyzer consulted', cases: {}};
  for (const [name, c] of Object.entries(corpus)) {
    out[name + '/model.bim'] = JSON.stringify(c.input, null, 2) + '\n'; expected.cases[name] = c.expected;
  }
  out['exact-source.m'] = corpus['a4-occurrences'].input.model.expressions.find(e => e.name === 'OccurrenceProbe').expression;
  out['Exact.SemanticModel/definition/expressions.tmdl'] = 'expression OccurrenceProbe = ```\r\n' + out['exact-source.m'].split('\r\n').map(l => '\t' + l).join('\r\n') + '\r\n\t```\r\n';
  expected.exactSourceSha256 = crypto.createHash('sha256').update(out['exact-source.m']).digest('hex');
  out['oracle.json'] = JSON.stringify(expected, null, 2) + '\n';
  return out;
}
if (require.main === module) {
  const check = process.argv.includes('--check'); let bad = false;
  for (const [name, text] of Object.entries(artifacts())) {
    const file = path.join(root, name);
    if (check) { if (!fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(text))) { console.error('Mismatch: ' + name); bad = true; } }
    else { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
  }
  if (bad) process.exitCode = 1;
  else console.log(check ? 'Synthetic artifacts match their authoring source.' : 'Wrote independent synthetic artifacts.');
}
module.exports = {artifacts, eid, pid};
