'use strict';
// Fixture/oracle self-checks ONLY. Passing these is never a production verdict.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {artifacts, eid} = require('./acceptance-fixtures/pq-redesign/build.cjs');
const O = require('./pq-redesign-independent-oracles.cjs');
const root = path.join(__dirname, 'acceptance-fixtures/pq-redesign');
const oracle = JSON.parse(fs.readFileSync(path.join(root, 'oracle.json')));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name, 'model.bim'))).model;
test('new corpus is reproducible without any production imports', () => {
  for (const [name, text] of Object.entries(artifacts())) assert.equal(fs.readFileSync(path.join(root, name)).equals(Buffer.from(text)), true, name);
});
test('every authored dependency has an exact occurrence oracle; no expected edge is inferred by scanning names', () => {
  for (const [name, expected] of Object.entries(oracle.cases)) {
    const model=read(name), codes=new Map(model.expressions.map(e=>[eid(e.name),e.expression]));
    for(const t of model.tables) for(const p of t.partitions) codes.set(JSON.stringify(['partition',t.name,p.name]),p.source?.expression);
    const pairs=[];
    for(const [consumerId,rs] of Object.entries(expected.occurrences)) {
      for(const r of rs) { assert.equal(codes.get(consumerId).slice(r.at,r.end),r.text); pairs.push(JSON.stringify([r.id,consumerId])); }
    }
    assert.deepEqual([...new Set(pairs)].sort(),expected.edges.map(e=>JSON.stringify([e.inputId,e.consumerId])).sort(),name);
  }
});
test('A1 independently has six same-source queries, a semantic relationship and zero expected edges', () => {
  const m = read('a1-disconnected'); assert.equal(m.tables.length, 6); assert.equal(m.relationships.length, 1);
  assert.ok(m.tables.every(t => t.partitions[0].source.expression.includes('same-sql.pq-redesign.invalid')));
  assert.deepEqual(oracle.cases['a1-disconnected'].edges, []);
});
test('A2 five parameter arrows; A3 four result arrows; A6 exact boundary totals and >200 fanout', () => {
  assert.equal(oracle.cases['a2-parameter'].edges.length, 5);
  assert.deepEqual(oracle.cases['a3-results'].edges.map(e => [JSON.parse(e.inputId)[2], JSON.parse(e.consumerId)[2]]),
    [['Q1','MergeResult'],['Q2','MergeResult'],['MergeResult','AppendResult'],['Q3','AppendResult']]);
  for (const n of [300,301,350,1000]) { assert.equal(read('a6-disconnected-' + n).expressions.length, n); assert.equal(oracle.cases['a6-disconnected-' + n].metadataIds.length, n); }
  assert.equal(oracle.cases['a6-fanout-250'].edges.length, 250);
});
test('A4 literal UTF-16 oracle protects repeated/escaped refs and CRLF bytes', () => {
  const source = fs.readFileSync(path.join(root, 'exact-source.m'), 'utf8');
  const rs = oracle.cases['a4-occurrences'].occurrences[eid('OccurrenceProbe')];
  assert.equal(rs.length, 5); assert.equal(rs[0].at, 32); // 5 (let+CRLF) + 17 (emoji line) + 10 (First prefix).
  assert.deepEqual(rs.map(r => source.slice(r.at,r.end)), ['#"Sales Raw"','#"Sales Raw"','#"Quote""Query"','#"Sales#(0020)Raw"','Server']);
  assert.equal(source.replaceAll('\r\n','').includes('\n'), false); assert.ok(source.endsWith('  \r\n'));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), oracle.exactSourceSha256);
  O.occurrenceOracle(rs, rs, source);
  assert.throws(() => O.occurrenceOracle(rs.slice(1), rs, source));
  assert.throws(() => O.occurrenceOracle(rs.map((r,i) => i ? r : {...r, at:r.at-1}), rs, source));
});
test('A7 contains intentional duplicate IDs, ambiguity, cycles, unavailable metadata; A8 reuses identities', () => {
  const e = oracle.cases['a7-uncertainty']; assert.equal(e.metadataIds.length - new Set(e.metadataIds).size, 1);
  assert.deepEqual(e.statusTables, ['NoPartitions']); assert.equal(e.cycles.length, 2);
  assert.deepEqual(oracle.cases['a8-reset-a'].metadataIds, oracle.cases['a8-reset-b'].metadataIds);
  assert.notEqual(read('a8-reset-a').expressions[0].expression, read('a8-reset-b').expressions[0].expression);
  assert.deepEqual(oracle.cases['a8-without-m'].metadataIds, []);
});
test('graph oracle rejects invented SQL/relationship edges, reversal, missing inventory and duplicate UI IDs', () => {
  const expected = oracle.cases['a3-results'];
  const graph = {nodes: expected.metadataIds.map(id => ({id, metadataId:id})), edges: expected.edges.map((e,i) => ({...e, id:'edge'+i}))};
  O.graphOracle(graph, expected);
  assert.throws(() => O.graphOracle({...graph, nodes:graph.nodes.slice(1)}, expected));
  assert.throws(() => O.graphOracle({...graph, nodes:[...graph.nodes, graph.nodes[0]]}, expected));
  assert.throws(() => O.graphOracle({...graph, edges:graph.edges.map(e => ({...e, inputId:e.consumerId, consumerId:e.inputId}))}, expected));
  const disconnected = oracle.cases['a1-disconnected'];
  const ns = disconnected.metadataIds.map(id => ({id, metadataId:id}));
  assert.throws(() => O.graphOracle({nodes:ns, edges:[{id:'invented',inputId:ns[0].id,consumerId:ns[1].id}]}, disconnected));
});
test('A4/A5/A6/A8 evidence oracles fail closed on missing or stale observations', () => {
  assert.throws(() => O.keyboardOracle({}));
  assert.throws(() => O.progressOracle({inventoryCount:80}, 1000, 'last'));
  assert.throws(() => O.resetOracle({oldCodeInDom:1}));
  const before={selectedId:'A',linkTargetId:'B',viewport:{x:10,y:20,zoom:1.5},codeScroll:{top:45,left:7}};
  const after={selectedId:'B',inspectorId:'B',targetVisible:true,readableZoom:true};
  O.navigationOracle(before,after,{selectedId:'A',viewport:before.viewport,codeScroll:before.codeScroll});
  assert.throws(() => O.navigationOracle(before,after,{selectedId:'A',viewport:{x:0,y:0,zoom:1},codeScroll:before.codeScroll}));
});
test('A9 privacy oracle rejects exports of M, altered raw text, XSS and source requests', () => {
  const observed={snapshotText:'{}',rawCopy:'x\r\n',rawSource:'x\r\n',requests:[],mEvaluations:0,credentialReads:0,sourceWrites:0,xssExecutions:0,captureStartedBeforeImport:true};
  O.privacyOracle(observed,['powerQuery','PQ_REDESIGN_RAW_ONLY']);
  for (const bad of [{snapshotText:'{"powerQuery":{}}'},{rawCopy:'x\n'},{xssExecutions:1},{requests:[{sourceRequest:true}]}]) assert.throws(() => O.privacyOracle({...observed,...bad}, ['powerQuery']));
});
test('candidate gate rejects absent/short/exact rejected baseline SHA', () => {
  for (const bad of [undefined, 'f45f696', O.BASELINE]) assert.throws(() => O.candidateSha(bad));
});
test('browser receipt validator rejects synthetic/absent provenance before any acceptance', () => {
  const {verify}=require('./pq-redesign-independent-browser.oracle.cjs');
  assert.throws(()=>verify({},root));
  assert.throws(()=>verify({candidateSha:O.BASELINE,evidenceKind:'integrated-browser'},root));
  assert.throws(()=>verify({candidateSha:'a'.repeat(40),evidenceKind:'synthetic-proposal-only'},root));
});
