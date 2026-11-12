'use strict';
// CPU phases only. Keep timing distributions separate from deterministic tests.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const modelTools = require('../Models/tools/viewer/scripts/cli/model.cjs');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/benchmark-audit.cjs [--stress | --model PATH]\nDefault: bundled demo. --stress needs Python3 and creates/removes a temporary retained audit fixture. Outputs JSON, six fresh-runtime samples.');
  process.exit(0);
}
const stress = args.includes('--stress'), modelIndex = args.indexOf('--model');
if (!(args.length === 0 || args.length === 1 && stress || args.length === 2 && modelIndex === 0 && args[1] && !args[1].startsWith('--'))) {
  console.error('Choose --stress or --model PATH. See --help.'); process.exit(1);
}
let temporary;
try {
  let source = modelIndex >= 0 ? path.resolve(args[modelIndex+1]) : path.join(root,'Models/demo/Contoso Retail.SemanticModel');
  if (stress) {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(),'smv-audit-benchmark-'));
    source = path.join(temporary,'Stress.SemanticModel');
    const generated = spawnSync('python3',[path.join(__dirname,'generate-audit-stress.py'),source],{encoding:'utf8',env:{...process.env,PYTHONHASHSEED:'0'}});
    if (generated.status !== 0) throw new Error(generated.error?.message || generated.stderr || 'Stress generator failed');
  }
  const samples=[];
  for (let run=0;run<6;run++) {
    let start=performance.now();
    const runtime=modelTools.runtime(),runtimeMs=performance.now()-start;
    start=performance.now();
    const {model,app}=modelTools.readModel(runtime,source),parsePrepareMs=performance.now()-start;
    const canvas=new runtime.GraphCanvas(app,null);
    canvas.layoutCard=canvas.renderLines=canvas.fitView=canvas.persist=()=>{};
    canvas.layoutAlgo='star';
    start=performance.now();canvas.untangle({quiet:true});
    const arrangeMs=performance.now()-start;
    const finite=model.tables.every(table=>Number.isFinite(canvas.pos[table.name]?.x)&&Number.isFinite(canvas.pos[table.name]?.y));
    if (!finite) throw new Error('Layout produced missing or nonfinite positions');
    samples.push({run,runtimeMs,parsePrepareMs,arrangeMs,tables:model.tables.length,relationships:model.relationships.length,measures:Object.keys(model.msrHome).length,finite});
  }
  const distribution=key=>{const sorted=samples.slice(1).map(s=>s[key]).sort((a,b)=>a-b);return {min:sorted[0],median:sorted[2],max:sorted[4]};};
  console.log(JSON.stringify({environment:{node:process.version,cpu:os.cpus()[0]?.model,platform:os.platform(),cores:os.cpus().length},fixture:stress?'retained Fable audit generator, seed7':source,policy:'Sample0 cold runtime/module setup; samples1–5 warm filesystem cache with fresh runtime/model. CPU phases only, no browser paint or input-delay claim. Timings observational; finite positions mandatory.',samples,warm:{parsePrepareMs:distribution('parsePrepareMs'),arrangeMs:distribution('arrangeMs')}},null,2));
} finally {
  if (temporary) fs.rmSync(temporary,{recursive:true,force:true});
}
