#!/usr/bin/env node
/* Adds Power Query metadata to a model-data.json made by tmdl_to_model_data.py.
   Usage: node power_query_to_model_data.js "<Model>.SemanticModel" ../model-data.json
   It runs the viewer's own parser (js/tmdl-parser.js) over the TMDL files, so the
   metadata cannot drift from what the browser would read. Only for the synthetic
   built-in demo: user models and shared snapshots never carry raw M. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const [, , modelDir, dataFile] = process.argv;
if (!modelDir || !dataFile) { console.error('usage: node power_query_to_model_data.js <SemanticModel folder> <model-data.json>'); process.exit(2); }

const jsDir = path.join(__dirname, '..', 'js');
const context = { console };
context.window = context;
vm.createContext(context);
for (const f of ['util.js', 'snapshot.js', 'roles.js', 'tmdl-parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), context, { filename: f });
}

function walk(dir, rel, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name), r = rel + ent.name;
    if (ent.isDirectory()) walk(full, r + '/', out);
    else if (/\.tmdl$/i.test(ent.name)) out.push({ name: ent.name, path: r, text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

const model = context.TMDLParser.parseTMDL(walk(modelDir, '', []));
if (!model.powerQuery || !model.powerQuery.nodes.length) { console.error('No Power Query metadata found in ' + modelDir); process.exit(1); }

// Append the key as text so every other byte of the generated file stays untouched.
let text = fs.readFileSync(dataFile, 'utf8').replace(/\s+$/, '');
text = text.replace(/,"powerQuery":\{[\s\S]*\}\}$/, '}');          // idempotent re-run
if (!text.endsWith('}')) { console.error('Unexpected model-data.json shape'); process.exit(1); }
fs.writeFileSync(dataFile, text.slice(0, -1) + ',"powerQuery":' + JSON.stringify(model.powerQuery) + '}');
const kinds = {}; model.powerQuery.nodes.forEach(n => { kinds[n.classification || n.kind] = (kinds[n.classification || n.kind] || 0) + 1; });
console.log('powerQuery: ' + model.powerQuery.nodes.length + ' nodes ' + JSON.stringify(kinds) + ', ' + model.powerQuery.warnings.length + ' warnings -> ' + dataFile);
