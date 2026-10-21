'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');

const reference = z.object({
  kind: z.enum(['table', 'column', 'measure', 'relationship', 'query']),
  name: z.string(),
  table: z.string().optional().describe('Required home table for a column or measure.')
}).strict();
const view = z.object({
  version: z.union([z.literal(1), z.literal(2)]).default(2),
  mode: z.enum(['graph', 'measures', 'matrix', 'clusters', 'power-query']).optional(),
  tables: z.array(z.string()).optional(),
  focus: reference.optional().describe('Measures mode requires a qualified measure focus.'),
  context: z.object({ direction: z.enum(['up', 'down', 'both']), depth: z.number().int().min(0).max(20), limit: z.number().int().min(1).max(500) }).strict().optional(),
  highlights: z.array(reference).optional(),
  callouts: z.array(z.object({ object: reference, text: z.string().min(1).max(240) }).strict()).optional(),
  width: z.number().int().min(320).max(4096).optional(),
  height: z.number().int().min(320).max(4096).optional(),
  scale: z.union([z.literal(1), z.literal(2)]).optional(),
  chrome: z.boolean().optional(),
  annotationsVisible: z.boolean().optional(),
  crop: z.enum(['viewport', 'highlights']).optional(),
  proposals: z.array(z.record(z.string(), z.unknown())).optional(),
  state: z.record(z.string(), z.unknown()).optional()
}).strict().describe('Versioned viewer specification. Omit the view or pass {} for a version 2 table graph. Example: {"version":2,"mode":"graph","tables":["Sales","Date"]}. Use smv_inspect for actual object identifiers.');

function provenance(source, name, hash) {
  return {
    kind: 'local-files', path: source, modelName: name, contentHash: hash,
    capturedAt: new Date().toISOString(), publishedModelChecked: false,
    refreshPolicy: 'Snapshot of local files at open time. Reopen after file changes; this is not the published Power BI model.',
    warnings: source.split(path.sep).some(part => /(?:^|[._-])backup(?:[._-]|$)/i.test(part))
      ? [{ code: 'BACKUP_PATH', message: 'The selected path looks like a backup. Confirm this exact source with the user before relying on it.' }] : []
  };
}

function scope(root) {
  return { root, defaultExportDirectory: path.join(root, '.smv-artifacts'), defaultExportsGitIgnored: true };
}

function presentation(state, advertised, entry) {
  const browserSeen = (state.clients || []).some(client => !entry.inlineClients.has(client.clientId));
  const acknowledged = !!entry.inlineAcknowledgedAt;
  const preferred = acknowledged ? 'inline' : browserSeen ? 'browser' : advertised ? 'inline' : 'artifact';
  return {
    ...state.presentation, preferred,
    live: { ...state.presentation.live, reachability: browserSeen ? 'viewer-acknowledged' : 'not-observed-by-server' },
    inline: {
      available: advertised, advertised, viewerAcknowledged: acknowledged,
      status: acknowledged ? 'viewer-acknowledged' : advertised ? 'advertised-unconfirmed' : 'unsupported',
      acknowledgedAt: entry.inlineAcknowledgedAt,
      resourceUri: advertised ? 'ui://smv/viewer.html' : null,
      reason: advertised
        ? 'The host advertised MCP Apps. This does not prove the chat displayed a view. If it does not visibly appear, use this same session URL or export; do not open repeated sessions to retry. An app sync receipt confirms initialization, not that the user can see it.'
        : 'The host did not advertise MCP Apps. Use a browser link or export.'
    },
    fallback: {
      kind: 'interactive-html-or-png',
      reason: browserSeen ? null : 'The server has not observed a browser acknowledgement. This is not a failed reachability test; a host browser may still reach the URL. If chat does not render inline, use the same session in a reachable browser or export a file.'
    }
  };
}

function defaultExport(root, session, revision, format) {
  const folder = path.join(root, '.smv-artifacts');
  if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw new Error('Default export directory must not be a symlink');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const ignore = path.join(folder, '.gitignore');
  try { fs.writeFileSync(ignore, '*\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (fs.lstatSync(ignore).isSymbolicLink() || fs.readFileSync(ignore, 'utf8').trim() !== '*') {
      throw new Error('Default export directory has a custom .gitignore; choose an explicit output path instead');
    }
  }
  return path.join(folder, `view-${session}-r${revision}-${crypto.randomUUID()}.${format}`);
}

function artifact(file, defaultLocation) {
  const bytes = fs.readFileSync(file);
  return {
    path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    mimeType: path.extname(file) === '.png' ? 'image/png' : 'text/html',
    gitIgnoredByDefault: defaultLocation, containsFullMetadata: true,
    handling: 'Use the host file attachment/download mechanism or provide a file link. A file or browser pane is not an inline chat view. Do not paste the full HTML into conversation or bypass host publication/read requirements.'
  };
}

module.exports = { view, provenance, scope, presentation, defaultExport, artifact };
