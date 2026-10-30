'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function prepare({ assets, tag, repository, out }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error('Use a stable vX.Y.Z release tag');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Use owner/repository');
  const names = ['smv-claude-portable.zip', 'smv-codex-portable.zip', 'smv-codex-marketplace.zip'];
  const receipts = names.map(file => {
    const bytes = fs.readFileSync(path.join(assets, file));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const expected = fs.readFileSync(path.join(assets, file + '.sha256'), 'utf8').trim().split(/\s+/);
    if (expected[0] !== hash || expected[1] !== file) throw new Error('Release archive checksum mismatch: ' + file);
    if (bytes.length > 256 * 1024 * 1024) throw new Error('Release archive exceeds supported size: ' + file);
    return { file, sha256: hash, bytes: bytes.length, url: 'https://github.com/' + repository + '/releases/download/' + tag + '/' + file };
  });
  const claude = receipts[0];
  const catalog = { name: 'semantic-model-tools', owner: { name: 'MrPerfectH', url: 'https://github.com/MrPerfectH' }, plugins: [{
    name: 'semantic-model-viewer', source: { source: 'archive', url: claude.url, sha256: claude.sha256 },
    description: 'Semantic model diagrams with the bundled CLI and private runtime.',
  }] };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'claude-marketplace.json'), JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'agent-release.json'), JSON.stringify({ tag, repository, artifacts: receipts }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'INSTALL-AGENTS.md'), `# Semantic Model Viewer ${tag}\n\nInstall the plugin for your agent. It includes SMV and a private Node runtime; no separate CLI or Node installation is needed.\n\n## Claude Code\n\nAdd this release's [marketplace catalog](https://github.com/${repository}/releases/download/${tag}/claude-marketplace.json), then install semantic-model-viewer from semantic-model-tools. The catalog pins the complete archive by SHA-256. Existing users of the repository's claude-marketplace branch can update their marketplace after release.\n\n## Codex\n\nDownload [smv-codex-marketplace.zip](${receipts[2].url}), extract it to a permanent user-owned folder, and add that folder as a plugin marketplace:\n\n\`\`\`sh\ncodex plugin marketplace add /absolute/path/to/extracted-folder\ncodex plugin add semantic-model-viewer@semantic-model-tools\n\`\`\`\n\nThis installs the plugin, including its CLI. The standalone [Codex plugin ZIP](${receipts[1].url}) is also included for compatible plugin upload interfaces. This release is not a public-directory listing.\n\n## VS Code\n\nInstall the VSIX matching your platform, or update from Marketplace after publication. New integrated terminals have smv available automatically. Copilot uses the native tools. To use smv outside VS Code, run Semantic Model Viewer: Install CLI for External Terminals.\n\nAsk your agent: Show Sales, its related tables, and the calculations depending on it.\n`);
  return receipts;
}
if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({ options: Object.fromEntries(['assets', 'tag', 'repository', 'out'].map(name => [name, { type: 'string' }])) });
    if (!values.assets || !values.out) throw new Error('Provide --assets and --out');
    console.log(JSON.stringify(prepare(values)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare };
