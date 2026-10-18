'use strict';
// Independent post-capture oracle, not a DOM driver. Capture from the actual integrated
// UI with T3 preview AFTER SHA handoff. Missing observations fail rather than become skip/pass.
// node tests/pq-redesign-independent-browser.oracle.cjs <new-receipt.json>
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const O=require('./pq-redesign-independent-oracles.cjs');
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'acceptance-fixtures/pq-redesign/oracle.json'))).cases;
function verify(receipt, evidenceRoot) {
  O.candidateSha(receipt.candidateSha);
  assert.equal(receipt.evidenceKind,'integrated-browser');
  assert.equal(receipt.servedAssetSha,receipt.candidateSha);
  assert.ok(receipt.captureStartedAt && receipt.captureEndedAt);
  assert.ok(Number.isFinite(Date.parse(receipt.captureStartedAt)) && Date.parse(receipt.captureEndedAt)>=Date.parse(receipt.captureStartedAt));
  for (const name of ['a1-disconnected','a2-parameter','a3-results','a7-uncertainty']) O.graphOracle(receipt.graphs[name],expected[name]);
  assert.equal(receipt.initialEntryWithoutSelection,true);
  assert.equal(receipt.inspectorInitiallyClosed,true);
  assert.equal(receipt.selectionPreservesInventory,true);
  assert.equal(receipt.zeroEdgesRenderedAsError,false);
  for (const name of ['a1-disconnected','a2-parameter','a3-results']) assert.equal(receipt.initialVisibleCounts[name],expected[name].metadataIds.length);
  assert.equal(receipt.parameterHighlightedConsumers,5);
  assert.equal(receipt.resultDirectionVerifiedVisually,true);
  const wanted=expected['a4-occurrences'].occurrences[JSON.stringify(['expression','','OccurrenceProbe'])];
  const source=fs.readFileSync(path.join(__dirname,'acceptance-fixtures/pq-redesign/exact-source.m'),'utf8');
  O.occurrenceOracle(receipt.codeLinks,wanted,source);
  assert.equal(receipt.displayedM,source);
  assert.equal(receipt.navigations.length,wanted.length);
  for (let i=0;i<wanted.length;i++) {
    const n=receipt.navigations[i]; assert.equal(n.before.linkTargetId,wanted[i].id);
    assert.equal(n.occurrenceAt,wanted[i].at); O.navigationOracle(n.before,n.after,n.restored);
  }
  assert.equal(receipt.forbiddenTokensNavigate,false);
  O.keyboardOracle(receipt.interactions);
  for (const count of [300,301,350,1000]) { const name='a6-disconnected-'+count; O.progressOracle(receipt.scale[name],count,expected[name].lastId); }
  O.progressOracle(receipt.scale['a6-fanout-250'],251,expected['a6-fanout-250'].lastId);
  assert.equal(receipt.scale['a6-fanout-250'].resolvedEdgeCount,250);
  assert.deepEqual(receipt.uncertainty.checkedConsumers.slice().sort(),Object.keys(expected['a7-uncertainty'].issueConsumers).sort());
  for (const k of ['reasonsInspectable','duplicateRecordsSelectable','partitionsDistinct','cycleStatusVisible','statusNodesReadable']) assert.equal(receipt.uncertainty[k],true);
  O.resetOracle(receipt.reset);
  O.privacyOracle(receipt.privacy,['powerQuery','PQ_REDESIGN_', 'pq-redesign.invalid','PQ_XSS_EXECUTED']);
  assert.equal(receipt.generatedMediaCheck.exitCode,0);
  assert.equal(receipt.generatedMediaCheck.candidateSha,receipt.candidateSha);
  // Hash-addressed captures must exist. Integrity does not replace human visual review.
  for (const kind of ['entry','selection','disconnected','uncertainty','keyboard','zoom200','large1000','reset','network','sync']) {
    const artifact=receipt.artifacts.find(a=>a.kind===kind); assert.ok(artifact,'Missing artifact '+kind);
    assert.ok(!path.isAbsolute(artifact.path) && !artifact.path.split(/[\\/]/).includes('..'));
    const bytes=fs.readFileSync(path.join(evidenceRoot,artifact.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
  }
  return {candidateSha:receipt.candidateSha,observationOracle:'pass',humanVisualReview:'required',installedAcceptance:'not-established',A10:'user-only'};
}
if (require.main===module) {
  assert.ok(process.argv[2],'A fresh exact-SHA browser receipt is required; no default historical receipt');
  const file=path.resolve(process.argv[2]); console.log(JSON.stringify(verify(JSON.parse(fs.readFileSync(file)),path.dirname(file)),null,2));
}
module.exports={verify};
