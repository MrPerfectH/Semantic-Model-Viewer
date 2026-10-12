// Source-free VM/asset audit, not a browser or native acceptance gate.
// Run from repository root: node docs/verification/pq-tables-connectors-20261011/audit-runtime.cjs
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),viewer=path.join(root,'Models/tools/viewer');
const {harness,context}=require(path.join(root,'tests/power-query-ui-harness.cjs'));
const Snapshots=require(path.join(viewer,'js/snapshot.js'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function assets(dir){const template=fs.readFileSync(path.join(dir,'index.html'),'utf8'),sources={};for(const m of template.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g))sources[m[1]]=fs.readFileSync(path.join(dir,m[1]),'utf8');return {template,sources};}
const canonical=assets(viewer),media=assets(path.join(root,'vscode-extension/media'));
const app={model:{name:'Synthetic connector audit',tables:[],relationships:[],powerQuery:{nodes:[{code:'PRIVATE_M_SENTINEL'}]},credentials:'PRIVATE_CREDENTIAL_SENTINEL'},state:{viewMode:'graph'},canvas:{pos:{},view:{x:0,y:0,k:1},captureFocus:()=>({}),captureDisplay:()=>({}),getPresets:()=>[]},measures:{}};
const payload=Snapshots.capture(app);payload.createdAt='2026-10-11T00:00:00.000Z';const html=Snapshots.buildHTML(canonical.template,canonical.sources,payload);
for(const secret of ['PRIVATE_M_SENTINEL','PRIVATE_CREDENTIAL_SENTINEL'])assert.ok(!html.includes(secret));
assert.equal(payload.model.powerQuery,undefined);
const embedded=Object.fromEntries([...html.matchAll(/<(script|style)\b[^>]*data-smv-asset="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map(m=>[m[2],m[3]]));
const result={boundary:'Linux Node VM and static asset checks only; no browser/native acceptance',node:process.version,platform:process.platform,snapshotSHA256:sha(html),snapshotPrivacy:true,runtimes:[]};
for(const [name,bundle,order] of [['canonical',canonical.sources,canonical.template],['media',media.sources,media.template],['snapshot',embedded,html]]){
  assert.ok(order.indexOf('js/canvas.js')<order.indexOf('js/power-query-canvas.js'));
  const h=harness('power-query-canvas.js');
  delete h.win.GraphCanvas;delete h.win.PowerQueryCanvas;delete h.win.WorkspaceUI;delete h.win.U;
  for(const file of ['js/util.js','js/workspace-ui.js','js/canvas.js','js/power-query-canvas.js'])vm.runInContext(bundle[file],h.win,{filename:name+':'+file});
  const c=context(),canvas=h.win.PowerQueryCanvas.mount(h.host,{context:c});canvas.setViewport({x:1,y:2,k:.3});
  assert.equal(h.host.querySelectorAll('.pqc-edge-arrow').every(a=>a.querySelectorAll('polyline').length===1),true);
  result.runtimes.push({name,loadOrder:true,mounted:true,assets:Object.fromEntries(['js/canvas.js','js/power-query-canvas.js','power-query-canvas.css'].map(f=>{assert.equal(bundle[f],canonical.sources[f]);return [f,sha(bundle[f])];}))});
}
// Compare the real baseline methods. No frozen fixtures or oracle files are edited.
const h=harness('power-query-canvas.js'),current=h.win.GraphCanvas.prototype;
const baseline=cp.execFileSync('git',['show','7ba3abe52ad8fa6dedd35de2ee798971d4b4a471:Models/tools/viewer/js/canvas.js'],{cwd:root,encoding:'utf8'});
vm.runInContext(baseline,h.win);const previous=h.win.GraphCanvas.prototype;
for(const method of ['orthoPath','edgeGeom','edgeArrow'])assert.equal(current[method].toString(),previous[method].toString());
const extracted=previous.renderLines.toString().replace(/var thin = Math\.max\(1\.15,[^\n]+\n        var baseW = Math\.max\(thin,[^\n]+/, 'var baseW = self.edgeStrokeWidth(self.view.k, isSel, active, hop, chip);');
assert.equal(current.renderLines.toString(),extracted);
result.tablesComparison={baseline:'7ba3abe52ad8fa6dedd35de2ee798971d4b4a471',unchanged:['orthoPath','edgeGeom','edgeArrow'],renderLines:'Only width formula replaced with shared method call; formula parity covered by owned test'};
console.log(JSON.stringify(result,null,2));
