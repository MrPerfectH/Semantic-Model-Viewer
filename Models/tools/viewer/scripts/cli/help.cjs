'use strict';
const commands = {
  inspect: ['smv inspect <model> [--table <name>] [--json]', 'Read local model metadata. --table returns one table, incident relationships and direct/indirect DAX measure users. Quote paths and table names containing spaces.'],
  'filters-by': ['smv filters-by <model> <table> [--direction outgoing|incoming|both] [--direct] [--include-inactive]', 'Trace active filter paths. Default: outgoing, direct + indirect. Both combines incoming and outgoing paths without including unrelated siblings. Alternative: filters-by <table> --model <model>. JSON output includes cardinalities and many-to-many evidence.'],
  discover: ['smv discover <folder>...', 'Find local TMDL and BIM models. Does not choose among multiple models or backups.'],
  snapshot: ['smv snapshot <model> --out <file.html> [--table <name> ... | --tables <names> | --measure <name>] [--name <name>] [--force]', 'Create a standalone interactive HTML viewer. No live server or browser pane is required. Includes full model metadata behind the focused canvas.'],
  serve: ['smv serve <model> [--view <view.json>] [--report <report.Report>] [--watch] [--port <0..65535>] [--background --session <state.json>] [--json]', 'Start a local live viewer. --background requires a session file so it can be stopped. The browser must run on a machine that can reach the local URL. Omit --view for a plain graph; authored JSON requires version:2.'],
  open: ['smv open <model> --session <state.json> [--view <view.json>] [--watch] [--json]', 'Start a background live viewer and launch the machine’s default browser. For a host browser pane use serve. For a portable file without a server use snapshot.'],
  shot: ['smv shot <model> --view <view.json> --out <file.png> [--browser <executable>] [--force] [--json]', 'Capture a model view as PNG. Requires Chrome/Chromium; SMV_BROWSER can select it.'],
  session: ['smv session <status|selection|update|export|stop> <state.json>', 'Control a live viewer using its session file. Run smv session <command> --help for options.'],
  'session status': ['smv session status <state.json> [--json]', 'Read the requested revision, browser acknowledgements, pending Apply state, last-seen clients and local URL. A successful request alone does not prove the browser rendered it.'],
  'session update': ['smv session update <state.json> --view <view.json> --revision <n> [--apply] [--wait <seconds>] [--client <id>] [--json]', 'Submit a new authored view at the current revision. --apply explicitly takes over exploration. --wait (0–60 seconds) waits for a fresh browser acknowledgement; timeout returns confirmed:false without claiming failure of the accepted update. Without --client, all fresh viewers must acknowledge.'],
  'session selection': ['smv session selection <state.json> [--client <id>] [--json]', 'Read a selection from a fresh browser at the requested revision. Select --client when multiple tabs are open.'],
  'session export': ['smv session export <state.json> --basis authored|current --revision <n> --out <file.html|file.png> [--client <id>] [--force] [--json]', 'Authored HTML export works without an attached browser. Current export needs a fresh browser acknowledgement. PNG requires Chrome/Chromium.'],
  'session stop': ['smv session stop <state.json> [--json]', 'Stop this server and remove its session file. Exported HTML files remain usable.'],
  explain: ['smv explain <validate|build> <explanation.json>', 'Validate or build a visual explanation. Run the subcommand with --help for details.'],
  'explain validate': ['smv explain validate <explanation.json> [--json]', 'Validate the explanation and all model references without capturing images.'],
  'explain build': ['smv explain build <explanation.json> --out <new-directory> [--browser <executable>] [--json]', 'Build an interactive walkthrough, HTML/Markdown report and images. Output directory must not exist. PNG capture requires Chrome/Chromium.'],
  results: ['smv results import <file|-> [--format json|csv] [--metadata <metadata.json>] [--out <file>]', 'Import supplied results; no model query is executed. CSV requires metadata. Use - to read stdin.'],
  'results import': ['smv results import <file|-> [--format json|csv] [--metadata <metadata.json>] [--out <file>]', 'Import supplied results; no model query is executed. CSV requires metadata. Use - to read stdin.']
};
function key(args) { const pair = args.slice(0,2).join(' '); return commands[pair] ? pair : commands[args[0]] ? args[0] : null; }
function specification(args) { const command = key(args); return command ? { command, usage: commands[command][0], help: 'smv ' + command + ' --help' } : null; }
function help(args) { const spec=specification(args); return spec ? 'Usage: '+spec.usage+'\n\n'+commands[spec.command][1]+'\n\nModel: a TMDL .SemanticModel folder, its definition folder, or a BIM file.\n-h, --help  Show this help.\n' : null; }
function requested(args) { const end=args.indexOf('--');return args.slice(0,end<0?args.length:end).some(a=>a==='--help'||a==='-h'); }
module.exports={specification,help,requested};
