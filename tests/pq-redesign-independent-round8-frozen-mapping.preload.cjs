'use strict';
// Transport-only remapping of the frozen script's exact Git-source preflight.
// No script source transformation; no assertion/browser/fixture substitution.
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const actual='12ae2e9149590fde8a3292d22ce1d27c11a2aae4',legacy='539010d01f086298e2a8de614ecd73757737a416';
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/verification/pq-redesign/round8-12ae2e9'),mapping=JSON.parse(fs.readFileSync(path.join(out,'mapping.json'))),original=cp.execFileSync.bind(cp),calls=[];
const frozen=path.join(root,'tests/pq-redesign-independent-round7-auto-framing-strict.browser.cjs'),mirror=path.join(out,'frozen-execution-root/tests',path.basename(frozen));
assert.deepEqual(fs.readFileSync(frozen),fs.readFileSync(mirror));const bytes=original('git',['show','71f0a9da30a4de39f86dbf427d46adc659e6b6cf:tests/'+path.basename(frozen)]);assert.deepEqual(fs.readFileSync(mirror),bytes);
cp.execFileSync=function(file,args,...rest){
 if(file==='git'&&args[0]==='show'&&args[1]?.startsWith(legacy+':Models/tools/viewer/')){
  const asset=args[1].slice((legacy+':Models/tools/viewer/').length);assert.ok(mapping.assets.some(a=>a.asset===asset));const requested=args[1],mapped=actual+':Models/tools/viewer/'+asset;const b=original(file,['show',mapped],...rest);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),mapping.assets.find(a=>a.asset===asset).sha256);calls.push({requested,mapped});return b;
 }
 return original(file,args,...rest);
};
process.on('exit',()=>fs.writeFileSync(path.join(out,'frozen-remapping-receipt.json'),JSON.stringify({actualCandidate:actual,frozenCandidateLiteral:legacy,scriptSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),scriptBytesIdenticalTo71f0a9:true,semanticAssertionsUnchanged:true,onlySubstitution:'Git preflight source revision; mirror mapping and served files explicitly contain actual candidate',calls},null,2)+'\n'));
