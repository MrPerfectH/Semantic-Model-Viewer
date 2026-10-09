'use strict';
// Fresh captured-observation gate, not a browser driver. No production code is loaded.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {candidateSha}=require('./pq-redesign-independent-oracles.cjs');
const F=require('./pq-redesign-independent-filters-v2.oracle.cjs');
function verify(receipt,expectedSha,evidenceRoot){
  candidateSha(expectedSha);candidateSha(receipt.candidateSha);assert.equal(receipt.candidateSha,expectedSha);
  assert.equal(receipt.servedAssetSha,expectedSha);assert.equal(receipt.evidenceKind,'integrated-browser');
  assert.equal(receipt.contract,'pq-workspace/2');assert.equal(receipt.addendum,'filter-20261009');
  assert.ok(Number.isFinite(Date.parse(receipt.captureStartedAt))&&Date.parse(receipt.captureEndedAt)>=Date.parse(receipt.captureStartedAt));
  for(const [name,c] of Object.entries(F.spec.cases)){
    F.visibilityApi(receipt.visibilityApi[name],name);
    for(const category of ['all','connected','disconnected'])F.filterState(receipt.categories[name][category],name,{category,search:'',selectedId:null,inspectorId:null});
    for(const category of ['connected','disconnected'])F.hiddenCanvasMethods(receipt.hiddenMethods[name][category],name,category);
    assert.equal(receipt.categories[name].all.counts.all,c.all.length);
  }
  for(const name of Object.keys(F.spec.workflows))F.workflow(receipt.workflows[name],name);
  for(const name of ['modelIdentity','metadataIdentity','whileSuspended'])F.lifecycle(receipt.lifecycle[name]);
  // 19 metadata rows are analyzed; the no-partition status row makes 20 displayed objects.
  F.atomicReady(receipt.atomicReady,19,20);
  assert.equal(receipt.sourceRequests,0);assert.equal(receipt.mEvaluations,0);assert.equal(receipt.sourceWrites,0);
  for(const kind of ['all-disconnected','combined-search-category','selected-hidden','show-all','back-hidden','muted-minimap','same-id-model-reset','raw-events']){
    const a=receipt.artifacts.find(x=>x.kind===kind);assert.ok(a,'Missing raw evidence '+kind);
    assert.ok(!path.isAbsolute(a.path)&&!a.path.split(/[\\/]/).includes('..'));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(evidenceRoot,a.path))).digest('hex'),a.sha256);
  }
  return {candidateSha:expectedSha,filterObservationValidation:'pass',runtimeEvidenceStillRequiresHumanReview:true,A1toA9:'separate',A10:'user-only'};
}
if(require.main===module){
  assert.ok(process.argv[2],'Fresh exact-SHA filter receipt required; no historical default');
  const file=path.resolve(process.argv[2]);
  console.log(JSON.stringify(verify(JSON.parse(fs.readFileSync(file)),process.env.PQ_REDESIGN_INTEGRATION_SHA,path.dirname(file)),null,2));
}
module.exports={verify};
