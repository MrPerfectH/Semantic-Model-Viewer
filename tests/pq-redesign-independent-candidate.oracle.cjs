'use strict';
// DO NOT RUN until parent supplies the redesigned integration SHA.
// Partial graph/occurrence prerequisites only. A1–A9 browser acceptance remains separate.
// PQ_REDESIGN_INTEGRATION_SHA=<full supplied SHA> node tests/pq-redesign-independent-candidate.oracle.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const O = require('./pq-redesign-independent-oracles.cjs');
const sha = process.env.PQ_REDESIGN_INTEGRATION_SHA;
O.candidateSha(sha); // Before any production source loads.
const repo = path.join(__dirname, '..');
assert.equal(execFileSync('git', ['rev-parse','HEAD'], {cwd:repo,encoding:'utf8'}).trim(), sha);
assert.equal(execFileSync('git', ['status','--porcelain','--untracked-files=all','--','Models/tools/viewer','vscode-extension/media'], {cwd:repo,encoding:'utf8'}).trim(), '', 'Production assets must match exact candidate');
const g = {console}; g.window = g; vm.createContext(g);
for (const name of ['util','roles','tmdl-parser','power-query-dependencies','power-query-graph-model','snapshot']) vm.runInContext(fs.readFileSync(path.join(repo,'Models/tools/viewer/js',name+'.js'),'utf8'), g, {filename:name+'.js',timeout:10000});
const root=path.join(__dirname,'acceptance-fixtures/pq-redesign');
const oracle=JSON.parse(fs.readFileSync(path.join(root,'oracle.json')));
const plain=value=>JSON.parse(JSON.stringify(value));
for (const [name, expected] of Object.entries(oracle.cases)) {
  const input=JSON.parse(fs.readFileSync(path.join(root,name,'model.bim')));
  g.__input=input;
  const started=performance.now();
  vm.runInContext('__model=TMDLParser.parseBIM(__input); __beforeGraph=JSON.stringify(__model); __graph=PowerQueryGraphModel.build(__model)',g,{timeout:30000});
  const model=g.__model,graph=g.__graph;
  assert.equal(JSON.stringify(model),g.__beforeGraph,'Graph construction must not mutate model');
  O.graphOracle(plain(graph),expected);
  const before=JSON.stringify(model);
  for (const node of model.powerQuery.nodes) {
    g.__node=node;
    vm.runInContext('__result=PowerQueryDependencies.analyze(__node,__model.powerQuery)',g,{timeout:10000});
    O.occurrenceOracle(plain(g.__result.references ?? null), expected.occurrences[node.id] || [], node.code || '');
    const targetIds=[...new Set((expected.occurrences[node.id] || []).map(r=>r.id))].sort();
    assert.deepEqual(Array.from(g.__result.dependencies,d=>d.id).sort(),targetIds,'Legacy dependencies and navigation must agree');
  }
  assert.equal(JSON.stringify(model),before,'Analysis must not mutate model');
  if (expected.cycles) {
    vm.runInContext('__cycles=PowerQueryDependencies.graph(__model.powerQuery).cycles',g,{timeout:30000});
    assert.deepEqual(plain(g.__cycles).map(c=>c.sort()).sort(),expected.cycles.map(c=>c.slice().sort()).sort());
  }
  for (const n of model.powerQuery.nodes) if (expected.issueConsumers?.[n.name]) {
    const graphNode=graph.nodes.find(x=>x.metadataId===n.id);
    assert.ok(graph.issues.some(i=>i.consumerId===graphNode.id && typeof i.kind==='string' && i.message), 'Object-specific uncertainty required: '+n.name);
  }
  const snapshot=JSON.stringify(g.Snapshots.modelData(model));
  for (const marker of ['powerQuery','PQ_REDESIGN_', 'pq-redesign.invalid','PQ_XSS_EXECUTED']) assert.equal(snapshot.includes(marker),false,'Raw M snapshot leak: '+marker);
  console.log(JSON.stringify({candidateSha:sha,case:name,graphPrerequisite:'pass',elapsedMs:performance.now()-started,productAcceptance:false}));
}
g.__files=[{name:'expressions.tmdl',text:fs.readFileSync(path.join(root,'Exact.SemanticModel/definition/expressions.tmdl'),'utf8')}];
vm.runInContext('__exact=TMDLParser.parseTMDL(__files)',g,{timeout:10000});
assert.equal(g.__exact.powerQuery.nodes[0].code,fs.readFileSync(path.join(root,'exact-source.m'),'utf8'),'Fenced TMDL exact CRLF preservation');
