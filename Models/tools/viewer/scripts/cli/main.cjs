'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runtime, readModel, selection, snapshot } = require('./model.cjs');

const HELP = `Semantic Model Viewer — offline HTML snapshots from TMDL

Usage:
  smv snapshot <model-folder> --out snapshot.html [--tables Sales,Date | --measure "Total Sales"]

Model: one TMDL .SemanticModel folder or its definition folder.

Options:
  -o, --out <file>       Required HTML output
      --tables <names>   Comma-separated starting tables (default: all tables)
      --table <name>     Repeat for table names, including names with commas
      --measure <name>   Open the snapshot on this measure
      --name <name>      Override the model display name
      --force            Replace an existing output file
  -h, --help             Show this help

Requires Node.js 22+. No extra packages or browser required to export.
Snapshots include full Viewer model metadata and DAX, even when focused.
Source files are read locally and never modified. No DAX execution is performed.
`;

async function main(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    out: { type: 'string', short: 'o' }, tables: { type: 'string' }, table: { type: 'string', multiple: true },
    measure: { type: 'string' }, name: { type: 'string' },
    force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help || args.length === 0) { process.stdout.write(HELP); return; }
  const [command, source] = positionals;
  if (command !== 'snapshot' || !source || positionals.length !== 2) throw new Error('Expected snapshot with one TMDL model folder. Run smv --help.');
  if (!values.out) throw new Error('--out is required.');
  const output = path.resolve(values.out);
  if (path.extname(output).toLowerCase() !== '.html') throw new Error('Snapshot output must use .html.');
  for (const key of ['tables', 'measure', 'name']) if (values[key] !== undefined && !values[key].trim()) throw new Error('--' + key + ' cannot be empty.');
  if (fs.existsSync(output) && !values.force) throw new Error('Output already exists; use --force to replace it: ' + output);
  const context = runtime(), { model, app } = readModel(context, source, values.name);
  const content = snapshot(context, app, selection(model, values));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content, { flag: values.force ? 'w' : 'wx' });
  process.stdout.write(output + '\n');
}
module.exports = { main };
