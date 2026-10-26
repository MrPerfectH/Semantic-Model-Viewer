'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '..');

function build(output, npm = process.env.npm_execpath) {
  if (!npm) throw new Error('Run with npm run build:plugin');
  output = path.resolve(output);
  if (fs.existsSync(output)) throw new Error('Plugin output already exists; choose a new --out directory');
  const listing = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: root, encoding: 'utf8' }))[0];
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const { path: name } of listing.files) {
      if (['package.json', '.claude-plugin/marketplace.json'].includes(name)) continue;
      const target = path.join(output, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, name), target);
    }
    const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
    const pkg = { name: 'semantic-model-viewer-plugin', version: plugin.version, private: true, description: plugin.description, license: 'MIT', engines: { node: '>=22' } };
    fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    fs.copyFileSync(path.join(root, 'docs/claude-code-plugin.md'), path.join(output, 'README.md'));
    return output;
  } catch (error) { fs.rmSync(output, { recursive: true, force: true }); throw error; }
}

if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string' } } });
    console.log(build(values.out || path.join(root, 'dist/claude-plugin')));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build };
