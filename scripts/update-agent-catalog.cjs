'use strict';
const fs = require('node:fs');
function update(file, releaseFile) {
  const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
  const incoming = release.plugins.find(p => p.name === 'semantic-model-viewer');
  if (!incoming || incoming.source.source !== 'archive' || !/^[a-f0-9]{64}$/.test(incoming.source.sha256) || !/^https:\/\/github\.com\/MrPerfectH\/Semantic-Model-Viewer\/releases\/download\/v\d+\.\d+\.\d+\/smv-claude-portable\.zip$/.test(incoming.source.url)) throw new Error('Expected the verified immutable SMV release archive');
  if (existing.name !== release.name || !Array.isArray(existing.plugins)) throw new Error('Unexpected marketplace identity');
  const plugin = existing.plugins.find(p => p.name === incoming.name);
  if (plugin) { plugin.source = incoming.source; plugin.description = incoming.description; delete plugin.version; }
  else existing.plugins.push(incoming);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
}
if (require.main === module) { try { update(...process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { update };
