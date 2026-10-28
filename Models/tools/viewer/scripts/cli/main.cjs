'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runtime, readModel, selection, snapshot } = require('./model.cjs');

const HELP = `Semantic Model Viewer — offline snapshots and agent-authored visual explanations

Usage:
  smv fetch --workspace <name|UUID> --model <name|UUID> [--out <new-folder>]
  smv --where [--json]
  smv --version
  smv workspace
  smv install [--source checkout|plugin] [--bin-dir <directory>]
  smv show <model> --table <name> [--with <table> | --related | --dependents] [--out diagram.html|diagram.png]
  smv compare <model> --measure <first> --with <second> [--out comparison.html|comparison.png]
  smv relations|dependents <model> --table <name> [--details]
  smv session list | smv session stop --all
  smv inspect <model> [--table <name>]
  smv filters-by <model> <table> [--direction outgoing|incoming|both] [--direct] [--include-inactive]
  smv discover <folder>...
  smv explain validate <explanation.json>
  smv results import <file or -> [--format csv --metadata metadata.json]
  smv serve <model> [--view view.json] [--watch] [--background --session state.json]
  smv open <model> --session state.json [--view view.json]
  smv session status|stop|selection <state.json>
  smv session update <state.json> --view view.json --revision <n> [--apply] [--wait <seconds>]
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
  const help = require('./help.cjs');
  if(help.requested(args)){process.stdout.write(help.help(args)||HELP);return;}
  try { return await run(args); }
  catch(error){
    const spec=help.specification(args);
    if(spec){error.details={...error.details,...spec};error.message+=' Run '+spec.help+'.';}
    throw error;
  }
}
async function run(args) {
  // Keep the repository's optional legacy adapter available without shipping it
  // or its dependencies in the CLI-only plugin payload.
  const adapter=path.resolve(__dirname,'../../../../../integrations/mcp/server.cjs');
  if(args[0]==='mcp'&&fs.existsSync(adapter))return require(adapter).start();
  if(args[0]==='workspace'){if(args.length!==1)throw new Error('Use workspace without arguments');process.stdout.write(JSON.stringify(require('../../../../../scripts/claude-workspace.cjs').prepare())+'\n');return;}
  if(args[0]==='compare')return compareCommand(args);
  if(args[0]==='fetch')return fetchCommand(args.slice(1));
  if(['show','relations','dependents','install'].includes(args[0]))return workflowCommand(args);
  if (args[0] === '--where' || args[0] === '--version') {
    const json=args[0]==='--where'&&args.length===2&&args[1]==='--json';
    if(args.length!==1&&!json)throw new Error('Use --where [--json] or --version');
    const api=require('./runtime.cjs'),config=api.currentConfig();
    // Direct invocation always describes this executable, without registry redirection.
    const runtime=api.resolveRuntime({...config,source:'checkout'});
    runtime.source=config.packageHost?'bundled':config.source;runtime.selection='direct';runtime.registry=null;
    runtime.packageHost=config.packageHost;runtime.javascriptRuntime={executable:process.execPath,version:process.version};
    runtime.updatePolicy='Direct invocation of this executable; no runtime substitution.';
    process.stdout.write((args[0]==='--version'?runtime.version:json?JSON.stringify(runtime):runtime.executable)+'\n');return;
  }
  if (['inspect', 'filters-by'].includes(args[0])) {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      table: { type: 'string' }, model: { type: 'string' }, direction: { type: 'string' }, direct: { type: 'boolean' }, 'include-inactive': { type: 'boolean' }, json: { type: 'boolean' }
    } });
    const query = require('./query.cjs'); let result;
    if (positionals[0] === 'inspect') {
      if (positionals.length < 2) throw new Error('Missing model path for inspect. Provide one TMDL folder or BIM file');
      if (positionals.length > 2) throw new Error('inspect accepts one model path. Quote paths containing spaces; use --table <name> for a table filter');
      if (values.model || values.direction || values.direct || values['include-inactive']) throw new Error('inspect supports --table and --json; filter-path options belong to filters-by');
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
    view: { type:'string' }, json: { type:'boolean' }, open:{type:'string'},opener:{type:'string'}, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help || args.length === 0) { process.stdout.write(HELP); return; }
  const [command, source] = positionals;
  if (command !== 'snapshot') throw new Error('Unknown command '+JSON.stringify(command)+'. Run smv --help.');
  if (!source) throw new Error('Missing model path for snapshot');
  if (positionals.length !== 2) throw new Error('snapshot accepts one model path. Quote paths containing spaces');
  if (!values.out) throw new Error('--out is required.');
  require('./opener.cjs').policy(values);
  const output = path.resolve(values.out);
  if (path.extname(output).toLowerCase() !== '.html') throw new Error('Snapshot output must use .html.');
  for (const key of ['tables', 'measure', 'name']) if (values[key] !== undefined && !values[key].trim()) throw new Error('--' + key + ' cannot be empty.');
  if (fs.existsSync(output) && !values.force) throw new Error('Output already exists; use --force to replace it: ' + output);
  const context = runtime(), { model, app } = readModel(context, source, values.name);
  if(values.view&&(values.tables||values.table||values.measure))throw new Error('Choose --view or --table/--tables/--measure, not both');
  const api=require('./explain.cjs'),focus=selection(model,values),measure=focus.measure?model.tables.flatMap(t=>t.measures.map(m=>({table:t.name,name:m.name}))).find(m=>m.name===focus.measure):null;
  const prepared=api.prepare(source,values.view?api.readJSON(values.view):{version:2,mode:measure?'measures':'graph',tables:focus.tables,...(measure?{focus:{kind:'measure',...measure}}:{})});
  const content=values.view?prepared.html:snapshot(context,app,focus);
  const provenance=require('./provenance.cjs');provenance.reserveOutput(output,values.force);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const {receipt:evidence,receiptPath}=await provenance.publish(source,prepared,output,values,async candidate=>fs.writeFileSync(candidate,content,{flag:'wx'}));
  const receipt={path:output,bytes:Buffer.byteLength(content),contents:'Full-model metadata and DAX; starting view may be focused.',receipt:evidence,receiptPath,opening:await require('./opener.cjs').open(output,values)};
  if(!values.json&&receipt.opening.message)process.stderr.write(receipt.opening.message+'\n');
  process.stdout.write(values.json?JSON.stringify(receipt)+'\n':output+'\n');
}
async function explanationCommand(args) {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{view:{type:'string'},report:{type:'string'},out:{type:'string',short:'o'},browser:{type:'string'},force:{type:'boolean'},json:{type:'boolean'},open:{type:'string'},opener:{type:'string'}}});
  require('./opener.cjs').policy(values);
  const api=require('./explain.cjs');let result;
  if(positionals[0]==='explain'&&positionals[1]==='validate'&&positionals.length===3){
    result=api.validateFile(positionals[2]);process.stdout.write(JSON.stringify(result)+'\n');return;
  }
  if(!values.out)throw new Error('--out is required');
  if(positionals[0]==='shot'&&positionals.length===2&&values.view)result=await api.shot(positionals[1],api.readJSON(values.view),values.out,values);
  else if(positionals[0]==='explain'&&positionals[1]==='build'&&positionals.length===3)result=await api.build(positionals[2],values.out,values);
  else throw new Error('Expected shot <model> --view <json> --out <png> or explain build <json> --out <directory>');
  result.opening=await require('./opener.cjs').open(result.path||result.interactive||result.html,values);
  if(!values.json&&result.opening.message)process.stderr.write(result.opening.message+'\n');
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
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{view:{type:'string'},report:{type:'string'},session:{type:'string'},port:{type:'string'},background:{type:'boolean'},watch:{type:'boolean'},json:{type:'boolean'},revision:{type:'string'},basis:{type:'string'},out:{type:'string'},client:{type:'string'},force:{type:'boolean'},apply:{type:'boolean'},wait:{type:'string'},'view-id':{type:'string'},'new-session':{type:'boolean'},all:{type:'boolean'},model:{type:'string'},name:{type:'string'},open:{type:'string'},opener:{type:'string'}}});
  if(values.all&&!(positionals[0]==='session'&&positionals[1]==='stop'))throw new Error('--all is supported only by session stop');
  if(values.apply && !(positionals[0]==='session' && positionals[1]==='update'))throw new Error('--apply is only supported for session update');
  if(values.wait!==undefined && (!(positionals[0]==='session'&&positionals[1]==='update') || !Number.isFinite(Number(values.wait)) || !values.wait.trim() || Number(values.wait)<0 || Number(values.wait)>60))throw new Error('--wait requires session update and a number from 0 to 60 seconds');
  if(values.client && positionals[0]==='session' && !['selection','export','update'].includes(positionals[1]))throw new Error('--client is supported for session selection, update or export');
  if(values.client&&positionals[0]==='session'&&positionals[1]==='update'&&values.wait===undefined)throw new Error('--client for update selects whose acknowledgement to wait for; add --wait <seconds>');
  const api=require('./session.cjs');let result;require('./opener.cjs').policy(values,positionals[0]==='open'?'system':'none');
  if(positionals[0]==='session'){
    if(positionals[1]==='list'){if(positionals.length!==2)throw new Error('Use session list [--model <model>]');const rows=await require('./managed.cjs').list(values.model);process.stdout.write(JSON.stringify(rows.map(({record,...r})=>({sessionId:r.sessionId,source:r.source,sessionFile:r.sessionFile,url:r.url,pluginVersion:r.pluginVersion,running:r.running,views:r.views?.map(v=>({id:v.id,label:v.label,revision:v.revision,summary:v.summary,application:v.application})),error:r.error,warnings:r.pluginVersion===require('./managed.cjs').version()?[]:['Session uses a different or older plugin version']})),null,2)+'\n');return;}
    if(positionals[1]==='stop'&&values.all){if(positionals.length!==2)throw new Error('Use session stop --all [--model <model>] without a state file');process.stdout.write(JSON.stringify(await require('./managed.cjs').stopAll(values.model))+'\n');return;}
    if(!['status','stop','selection','update','export','views','add-view'].includes(positionals[1]))throw new Error('Choose a session command: status, stop, selection, update or export');
    if(positionals.length<3)throw new Error('Missing session file path for session '+positionals[1]);
    if(positionals.length>3)throw new Error('session '+positionals[1]+' accepts one state-file path; quote paths containing spaces');
    if(['update','export'].includes(positionals[1])&&(!/^\d+$/.test(values.revision||'')||Number(values.revision)<1))throw new Error('--revision must be a positive integer');
    if(positionals[1]==='update'){if(!values.view)throw new Error('--view is required');result=await api.request(positionals[2],'update',{expectedRevision:Number(values.revision),view:require('./explain.cjs').readJSON(values.view),apply:!!values.apply},values['view-id']);if(values.wait!==undefined)result={...result,...await api.waitForApply(positionals[2],result.revision,{seconds:Number(values.wait),clientId:values.client,viewId:values['view-id']})};}
    else if(positionals[1]==='selection')result=await api.request(positionals[2],'selection',{clientId:values.client},values['view-id']);
    else if(positionals[1]==='export'){if(!values.out)throw new Error('--out is required');result=await api.exportSession(positionals[2],{...values,viewId:values['view-id'],revision:Number(values.revision),clientId:values.client});}
    else if(positionals[1]==='add-view'){if(!values.view||!values.name)throw new Error('add-view requires --view <json> and --name <label>');result=await api.request(positionals[2],'views',{views:[{id:values['view-id']||require('node:crypto').randomUUID(),label:values.name,view:require('./explain.cjs').readJSON(values.view)}]});}
    else result=await api.request(positionals[2],positionals[1],undefined,values['view-id']);
  }else{
    if(positionals.length!==2)throw new Error('Expected serve|open <model> [--view file] [--watch] [--background --session state.json]');
    if(values.port!==undefined&&(!/^\d+$/.test(values.port)||Number(values.port)>65535))throw new Error('Port must be 0 to 65535');
    result=await api.serve(positionals[1],{...values,newSession:values['new-session'],port:values.port===undefined?0:Number(values.port),background:positionals[0]==='open'||values.background});
    result.opening=await require('./opener.cjs').open(result.url,values,positionals[0]==='open'?'system':'none');
    if(!values.json&&result.opening.message)process.stderr.write(result.opening.message+'\n');
  }
  process.stdout.write(positionals[0]==='session'?JSON.stringify(result,null,values.json?0:2)+'\n':values.json?JSON.stringify(result)+'\n':(result.url||JSON.stringify(result))+'\n');
}
async function compareCommand(args){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{measure:{type:'string'},with:{type:'string'},out:{type:'string',short:'o'},force:{type:'boolean'},json:{type:'boolean'},session:{type:'string'},'new-session':{type:'boolean'},watch:{type:'boolean'},open:{type:'string'},opener:{type:'string'},browser:{type:'string'}}});
  if(positionals.length!==2)throw new Error('Expected compare <model> --measure <first> --with <second>');
  for(const k of ['measure','with','out'])if(values[k]!==undefined&&!values[k].trim())throw new Error('--'+k+' cannot be empty');
  const result=await require('./compare.cjs').compare(positionals[1],{...values,newSession:values['new-session']});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
async function workflowCommand(args){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{table:{type:'string'},model:{type:'string'},related:{type:'boolean'},dependents:{type:'boolean'},direction:{type:'string'},direct:{type:'boolean'},'include-inactive':{type:'boolean'},details:{type:'boolean'},json:{type:'boolean'},session:{type:'string'},'new-session':{type:'boolean'},watch:{type:'boolean'},'bin-dir':{type:'string'},source:{type:'string'},with:{type:'string'},out:{type:'string',short:'o'},force:{type:'boolean'},browser:{type:'string'},measure:{type:'string'},open:{type:'string'},opener:{type:'string'},workspace:{type:'string'},tenant:{type:'string'},'token-stdin':{type:'boolean'}}});
  const allowed={install:['bin-dir','source','json'],show:['table','model','related','dependents','direction','direct','include-inactive','session','new-session','watch','json','with','out','force','browser','open','opener','workspace','tenant','token-stdin'],relations:['table','model','direction','direct','include-inactive','details','json','with'],dependents:['table','model','direct','details','json','measure']}[positionals[0]];
  for(const key of Object.keys(values))if(!allowed.includes(key))throw new Error('--'+key+' is not supported by '+positionals[0]);
  for(const key of ['with','out','measure'])if(values[key]!==undefined&&!values[key].trim())throw new Error('--'+key+' cannot be empty');
  if(values.table!==undefined&&!values.table.trim())throw new Error('--table cannot be empty');
  if(values.model!==undefined&&!values.model.trim())throw new Error('--model cannot be empty');
  require('./opener.cjs').policy(values);
  if((values.tenant||values['token-stdin'])&&!values.workspace)throw new Error('--tenant and --token-stdin require --workspace');
  let result;
  if(positionals[0]==='install'){if(positionals.length!==1)throw new Error('install takes options only');result=require('./install.cjs').install({binDir:values['bin-dir'],source:values.source});}
  else{
    let source,table;
    if(values.workspace){if(positionals[0]!=='show'||positionals.length!==1||!values.model||!values.table)throw new Error('Use show --workspace <name|UUID> --model <name|UUID> --table <name>');const fetched=await require('./fabric.cjs').fetchModel({workspace:values.workspace,model:values.model,tenant:values.tenant,tokenStdin:values['token-stdin']});source=fetched.path;table=values.table;}
    else if(values.table){if(positionals.length!==2||values.model)throw new Error('Use <command> <model> --table <name>');source=positionals[1];table=values.table;}
    else if(values.model){if(positionals.length!==2)throw new Error('Use <command> <table> --model <model>');source=values.model;table=positionals[1];}
    else if(positionals.length===2){const models=require('./discover.cjs').discover([process.cwd()]);if(models.length!==1)throw new Error('Provide --model or a model path with --table; found '+models.length+' local models');source=models[0].path;table=positionals[1];if(/backup/i.test(source))throw new Error('A backup model requires an explicit model path');}
    else throw new Error('Provide a model path and --table <name>');
    const options={...values,table,newSession:values['new-session'],includeInactive:values['include-inactive']};
    result=positionals[0]==='show'?await require('./show.cjs').show(source,options):values.with?require('./query.cjs').between(source,table,values.with,options):require('./query.cjs').focused(source,table,positionals[0],options);
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
async function fetchCommand(args){
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{workspace:{type:'string'},model:{type:'string'},out:{type:'string'},tenant:{type:'string'},'token-stdin':{type:'boolean'},json:{type:'boolean'}}});
  if(positionals.length)throw new Error('fetch accepts named options only');
  const result=await require('./fabric.cjs').fetchModel({...values,tokenStdin:values['token-stdin']});process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
module.exports = { main };
