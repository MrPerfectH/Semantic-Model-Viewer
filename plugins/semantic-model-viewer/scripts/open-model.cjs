#!/usr/bin/env node
'use strict';
// A fresh offline snapshot per launch; never reuse a server or copied web assets.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { createHash } = require('node:crypto');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || command + ' failed');
  return result.stdout.trim();
}
function main(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'viewer-root': { type: 'string' }, 'no-open': { type: 'boolean' },
    'output-dir': { type: 'string' }, report: { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) {
    console.log('Usage: smv-open-model <TMDL-model-folder> [--report <PBIR-report-folder>] [--viewer-root <checkout>] [--no-open] [--output-dir <folder>]');
    return;
  }
  if (positionals.length !== 1) throw new Error('Select exactly one TMDL model folder. Use --help.');
  const root = fs.realpathSync(values['viewer-root'] || path.resolve(__dirname, '..'));
  const cli = path.join(root, 'bin/smv.cjs');
  if (!fs.existsSync(cli)) throw new Error('Current Viewer CLI missing in ' + root + '; update the configured checkout.');
  const git = (...arguments_) => run('git', ['-C', root, ...arguments_]);
  const revision = git('rev-parse', 'HEAD');
  // Cached origin/main is a lower bound, not a claim of live remote freshness.
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/main'));
  if (behind) throw new Error('Viewer is behind known origin/main by ' + behind + ' commits. Update the configured checkout before opening.');
  const source = fs.realpathSync(positionals[0]);
  const cache = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches')
    : process.platform === 'win32' ? (process.env.LOCALAPPDATA || os.tmpdir())
      : (process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'));
  const base = path.resolve(values['output-dir'] || path.join(cache, 'Semantic Model Viewer', 'launches'));
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'model-'));
  const html = path.join(directory, 'viewer.html');
  // The CLI rejects invalid relationship endpoints before writing a snapshot.
  run(process.execPath, [cli, 'snapshot', source, '--out', html]);
  let content = fs.readFileSync(html, 'utf8');
  const match = content.match(/<script id="smv-snapshot-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Viewer did not produce a valid snapshot. Nothing opened.');
  const payload = JSON.parse(match[1]);
  const columns = new Map(payload.model.tables.map(table => [table.name, new Set(table.columns.map(column => column.name))]));
  for (const rel of payload.model.relationships) {
    if (!rel.from || !rel.fromCol || !rel.to || !rel.toCol) throw new Error('Incomplete relationship metadata. Nothing opened.');
    if (!columns.get(rel.from)?.has(rel.fromCol) || !columns.get(rel.to)?.has(rel.toCol)) {
      throw new Error('Relationship refers to a missing column: ' + rel.from + '[' + rel.fromCol + '] → ' + rel.to + '[' + rel.toCol + ']. Nothing opened.');
    }
  }
  let report = null;
  if (values.report) {
    report = fs.realpathSync(values.report);
    if (!fs.statSync(report).isDirectory() || !/\.Report$/i.test(report) || !fs.existsSync(path.join(report, 'definition.pbir'))) {
      throw new Error('--report must be one PBIR .Report folder containing definition.pbir. Nothing opened.');
    }
    const modelData = path.join(directory, 'model-data.json');
    const usageFile = path.join(directory, 'report-usage.json');
    fs.writeFileSync(modelData, JSON.stringify(payload.model));
    run(process.platform === 'win32' ? 'python' : 'python3', ['-I', path.join(root, 'Models/tools/viewer/scripts/scan_report_usage.py'), report,
      '--model-data', modelData, '-o', usageFile]);
    const usage = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    payload.usage = { measures: usage.measures, meta: Object.fromEntries(['report', 'model', 'pageCount', 'scanned'].map(key => [key, usage[key]])) };
    // Keep imported report text inside the JSON data script, including </script>.
    const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    content = content.replace(match[0], () => '<script id="smv-snapshot-data" type="application/json">' + json + '</script>');
    fs.writeFileSync(html, content);
  }
  const receipt = {
    generatedAt: payload.createdAt, source, viewerRoot: root, viewerRevision: revision,
    viewerDirty: Boolean(git('status', '--porcelain', '--untracked-files=no')),
    freshness: 'Compared with cached origin/main; no network update performed.',
    tables: payload.model.tables.length, relationships: payload.model.relationships.length,
    report, html, htmlSha256: createHash('sha256').update(content).digest('hex')
  };
  fs.writeFileSync(path.join(directory, 'launch.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (!values['no-open']) {
    if (process.platform === 'darwin') run('open', [html]);
    else if (process.platform === 'win32') run('explorer.exe', [html]);
    else run('xdg-open', [html]);
  }
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error('smv-open-model: ' + error.message); process.exitCode = 1; }
}
module.exports = { main };
