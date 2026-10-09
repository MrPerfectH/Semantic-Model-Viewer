'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const viewerRoot = path.resolve(__dirname, '../..');

// Load the shipped parser, metadata preparation and layouts. No model text is
// evaluated; the VM only executes trusted viewer source files from this package.
function runtime() {
  const context = { console, Set, Map, module: { exports: {} }, addEventListener() {} };
  context.window = context;
  vm.createContext(context);
  for (const file of ['util.js', 'roles.js', 'tmdl-parser.js', 'snapshot.js', 'canvas.js', 'layouts.js', 'relationships.js', 'measures.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(viewerRoot, 'js', file), 'utf8'), context, { filename: file });
  }
  context.U.store.useMemory({});
  context.App = context.module.exports;
  return context;
}

function readModel(context, source, name) {
  let target = path.resolve(source);
  if (!fs.existsSync(target)) throw new Error('Model does not exist: ' + target);
  if (!fs.statSync(target).isDirectory()) throw new Error('Select one TMDL .SemanticModel folder or its definition folder.');
  if (fs.existsSync(path.join(target, 'definition'))) target = path.join(target, 'definition');
  // Do not accidentally combine several models from a repository into one.
  if (!fs.existsSync(path.join(target, 'model.tmdl'))) throw new Error('Select one .SemanticModel folder or its definition folder (model.tmdl is required).');
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) walk(file);
      else if (entry.isFile() && /\.tmdl$/i.test(entry.name)) files.push({ name: entry.name, text: fs.readFileSync(file, 'utf8') });
    }
  }
  walk(target);
  const model = context.TMDLParser.parseTMDL(files, { strictRelationships: true });
  if (!model.tables.length) throw new Error('No tables found in the model.');
  const folder = path.basename(target) === 'definition' ? path.dirname(target) : target;
  model.name = name || model.name || path.basename(folder).replace(/\.SemanticModel$/i, '');
  // The viewer indexes tables and measures by name. Reject ambiguous input rather
  // than exporting the wrong object when the source violates that assumption.
  for (const [kind, names] of [['table', model.tables.map(t => t.name)], ['measure', model.tables.flatMap(t => t.measures.map(m => m.name))]]) {
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n.toLowerCase())) throw new Error('Duplicate ' + kind + ' name: ' + n);
      seen.add(n.toLowerCase());
    }
  }
  const app = Object.create(context.App.prototype);
  const tableNames = new Set(model.tables.map(t => t.name));
  for (const r of model.relationships) {
    if (!tableNames.has(r.from) || !tableNames.has(r.to)) throw new Error('Relationship refers to a missing table: ' + r.from + ' → ' + r.to);
  }
  // CLI preparation uses metadata only; browser palette state is unnecessary.
  app.rebuildColorMaps = () => {};
  app.prepareModel(model);
  app.model = model;
  app.state = {};
  return { model, app };
}

function selection(model, options) {
  const requested = [...(options.table || []), ...(options.tables ? options.tables.split(',').map(n => n.trim()) : [])];
  if (options.measure && requested.length) throw new Error('Choose --measure or --tables/--table, not both.');
  function resolve(value, names, kind) {
    const match = names.find(n => n.toLowerCase() === value.toLowerCase());
    if (!match) throw new Error('Unknown ' + kind + ': ' + value);
    return match;
  }
  const tableNames = model.tables.map(t => t.name);
  const tables = requested.length ? [...new Set(requested.map(n => resolve(n, tableNames, 'table')))] : tableNames;
  const measure = options.measure ? resolve(options.measure, model.tables.flatMap(t => t.measures.map(m => m.name)), 'measure') : null;
  return { tables, measure };
}

function tablePositions(context, app, names) {
  const canvas = new context.GraphCanvas(app, null);
  canvas.setLayoutK(.25);
  canvas.untangle({ names: new Set(names), quiet: true });
  return canvas.pos;
}

function snapshot(context, app, focus) {
  const payload = {
    format: 'semantic-model-viewer', version: 1, name: app.model.name,
    createdAt: new Date().toISOString(), model: context.Snapshots.modelData(app.model), usage: null,
    settings: { roleRules: context.Roles.defaults() },
    workspace: {
      viewMode: focus.measure ? 'measures' : 'graph', presets: [],
      tableView: { version: 2, name: 'CLI starting view', tables: focus.tables,
        pos: tablePositions(context, app, focus.tables), autoFit: true }
    },
    measures: focus.measure ? { version: 1, selectedMeasure: focus.measure,
      preferences: { mode: 'split' }, graph: { autoFit: true } } : null
  };
  const sources = Object.fromEntries(context.Snapshots.files.map(file => [file, fs.readFileSync(path.join(viewerRoot, file), 'utf8')]));
  return context.Snapshots.buildHTML(fs.readFileSync(path.join(viewerRoot, 'index.html'), 'utf8'), sources, payload);
}

module.exports = { runtime, readModel, selection, snapshot };
