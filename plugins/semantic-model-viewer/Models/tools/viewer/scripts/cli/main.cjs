'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runtime, readModel, selection, snapshot } = require('./model.cjs');

const HELP = `Semantic Model Viewer — offline snapshots and agent-authored visual explanations

Usage:
  smv --where
  smv inspect <model> [--table <name>]
  smv filters-by <model> <table> [--direction outgoing|incoming] [--direct] [--include-inactive]
  smv discover <folder>...
  smv explain validate <explanation.json>
  smv results import <file or -> [--format csv --metadata metadata.json]
  smv serve <model> [--view view.json] [--watch] [--background --session state.json]
  smv open <model> --session state.json [--view view.json]
  smv session status|stop|selection <state.json>
  smv session update <state.json> --view view.json --revision <n> [--apply]
  smv session export <state.json> --basis authored|current --revision <n> --out view.html|view.png [--client <id>]
  smv shot <model-folder> --view view.json --out image.png [--browser <executable>]
  smv explain build <explanation.json> --out <directory>
  smv snapshot <model-folder> --out snapshot.html [--tables Sales,Date | --measure "Total Sales"]

Model: one TMDL .SemanticModel folder, its definition folder, or model.bim.

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
  if (args[0] === '--where') {
    if (args.length !== 1) throw new Error('Use smv --where without other arguments');
    process.stdout.write(require('node:fs').realpathSync(path.resolve(__dirname, '../../../../../bin/smv.cjs')) + '\n'); return;
  }
  if (['inspect', 'filters-by'].includes(args[0])) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      table: { type: 'string' }, model: { type: 'string' }, direction: { type: 'string' }, direct: { type: 'boolean' }, 'include-inactive': { type: 'boolean' }, json: { type: 'boolean' }
    } });
    const query = require('./query.cjs'); let result;
    if (positionals[0] === 'inspect') {
      if (positionals.length !== 2 || values.model || values.direction || values.direct || values['include-inactive']) throw new Error('Expected inspect <model> [--table <name>]');
      if (values.table !== undefined && !values.table.trim()) throw new Error('--table cannot be empty');
      result = query.inspect(positionals[1], values.table);
    } else {
      const source = values.model || positionals[1], table = values.model ? positionals[1] : positionals[2];
      if (positionals.length !== (values.model ? 2 : 3) || values.table || !table?.trim()) throw new Error('Expected filters-by <model> <table> or filters-by <table> --model <model>');
      result = query.filtersBy(source, table, { direction: values.direction, direct: values.direct, includeInactive: values['include-inactive'] });
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return;
  }
  if (['serve','open','session'].includes(args[0]))return sessionCommand(args);
  if (args[0] === 'discover') { if(args.length<2)throw new Error('discover requires at least one folder');process.stdout.write(JSON.stringify(require('./discover.cjs').discover(args.slice(1)),null,2)+'\n');return; }
  if (args[0] === 'results') return resultsCommand(args.slice(1));
  if (args[0] === 'shot' || args[0] === 'explain') return explanationCommand(args);
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
async function explanationCommand(args) {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{view:{type:'string'},report:{type:'string'},out:{type:'string',short:'o'},browser:{type:'string'},force:{type:'boolean'},json:{type:'boolean'}}});
  const api=require('./explain.cjs');let result;
  if(positionals[0]==='explain'&&positionals[1]==='validate'&&positionals.length===3){
    result=api.validateFile(positionals[2]);process.stdout.write(JSON.stringify(result)+'\n');return;
  }
  if(!values.out)throw new Error('--out is required');
  if(positionals[0]==='shot'&&positionals.length===2&&values.view)result=await api.shot(positionals[1],api.readJSON(values.view),values.out,values);
  else if(positionals[0]==='explain'&&positionals[1]==='build'&&positionals.length===3)result=await api.build(positionals[2],values.out,values);
  else throw new Error('Expected shot <model> --view <json> --out <png> or explain build <json> --out <directory>');
  process.stdout.write(values.json?JSON.stringify(result)+'\n':(result.path||result.html)+'\n');
}
async function resultsCommand(args){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{format:{type:'string'},metadata:{type:'string'},out:{type:'string',short:'o'}}});
  if(positionals.length!==2||positionals[0]!=='import')throw new Error('Expected results import <file or -> [--format csv --metadata metadata.json]');
  const text=fs.readFileSync(positionals[1]==='-'?0:positionals[1],'utf8');
  const api=require('./results.cjs');
  if(values.format&&!['csv','json'].includes(values.format))throw new Error('Format must be csv or json');
  if(values.format==='csv'&&!values.metadata)throw new Error('CSV requires --metadata');
  const result=values.format==='csv'?api.fromCSV(text,JSON.parse(fs.readFileSync(values.metadata,'utf8'))):api.validate(JSON.parse(text));
  const output=JSON.stringify(result,null,2)+'\n';if(values.out)fs.writeFileSync(values.out,output,{flag:'wx'});else process.stdout.write(output);
}
async function sessionCommand(args){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{view:{type:'string'},report:{type:'string'},session:{type:'string'},port:{type:'string'},background:{type:'boolean'},watch:{type:'boolean'},json:{type:'boolean'},revision:{type:'string'},basis:{type:'string'},out:{type:'string'},client:{type:'string'},force:{type:'boolean'},apply:{type:'boolean'}}});
  if(values.apply && !(positionals[0]==='session' && positionals[1]==='update'))throw new Error('--apply is only supported for session update');
  const api=require('./session.cjs');let result;
  if(positionals[0]==='session'){
    if(positionals.length!==3||!['status','stop','selection','update','export'].includes(positionals[1]))throw new Error('Expected session status|stop|selection|update|export <state.json>');
    if(['update','export'].includes(positionals[1])&&(!/^\d+$/.test(values.revision||'')||Number(values.revision)<1))throw new Error('--revision must be a positive integer');
    if(positionals[1]==='update'){if(!values.view)throw new Error('--view is required');result=await api.request(positionals[2],'update',{expectedRevision:Number(values.revision),view:require('./explain.cjs').readJSON(values.view),apply:!!values.apply});}
    else if(positionals[1]==='selection')result=await api.request(positionals[2],'selection',{clientId:values.client});
    else if(positionals[1]==='export'){if(!values.out)throw new Error('--out is required');result=await api.exportSession(positionals[2],{...values,revision:Number(values.revision),clientId:values.client});}
    else result=await api.request(positionals[2],positionals[1]);
  }else{
    if(positionals.length!==2)throw new Error('Expected serve|open <model> [--view file] [--watch] [--background --session state.json]');
    if(values.port!==undefined&&(!/^\d+$/.test(values.port)||Number(values.port)>65535))throw new Error('Port must be 0 to 65535');
    if(positionals[0]==='open'&&!values.session)throw new Error('open requires --session <state.json> so the background server can be stopped');
    result=await api.serve(positionals[1],{...values,port:values.port===undefined?0:Number(values.port),background:positionals[0]==='open'||values.background});
    if(positionals[0]==='open')await api.open(result.url);
  }
  process.stdout.write(values.json?JSON.stringify(result)+'\n':(result.url||JSON.stringify(result))+'\n');
}
module.exports = { main };
