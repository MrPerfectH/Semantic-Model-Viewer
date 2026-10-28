'use strict';
const fs = require('node:fs'), path = require('node:path');
function build(plugin, out) {
  plugin = path.resolve(plugin); out = path.resolve(out);
  const info = JSON.parse(fs.readFileSync(path.join(plugin, 'build-info.json'), 'utf8'));
  if (info.host !== 'codex' || !info.targets.length) throw new Error('Use a complete Codex package with bundled runtimes');
  if (fs.existsSync(out)) throw new Error('Marketplace output already exists');
  try {
    fs.cpSync(plugin, path.join(out, 'plugins/semantic-model-viewer'), { recursive: true });
    fs.mkdirSync(path.join(out, '.agents/plugins'), { recursive: true });
    fs.writeFileSync(path.join(out, '.agents/plugins/marketplace.json'), JSON.stringify({
      name: 'semantic-model-tools', interface: { displayName: 'Semantic Model Tools' }, plugins: [{
        name: 'semantic-model-viewer', source: { source: 'local', path: './plugins/semantic-model-viewer' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity',
      }],
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'INSTALL.txt'), 'Add this extracted folder as a Codex plugin marketplace.\n\ncodex plugin marketplace add <this-folder>\ncodex plugin add semantic-model-viewer@semantic-model-tools\n\nThe plugin includes SMV and Node. Do not install a separate CLI.\n');
    return out;
  } catch (error) { fs.rmSync(out, { recursive: true, force: true }); throw error; }
}
if (require.main === module) {
  try {
    const { values } = require('node:util').parseArgs({ options: { plugin: { type: 'string' }, out: { type: 'string' }, zip: { type: 'string' } } });
    if (!values.plugin || !values.out) throw new Error('Provide --plugin and --out');
    build(values.plugin, values.out);
    if (values.zip) console.log(JSON.stringify(require('./build-portable.cjs').archive(values.out, values.zip)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build };
