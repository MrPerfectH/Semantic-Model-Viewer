#!/usr/bin/env node
/* Bundle the canonical viewer into media/. Copy only runtime HTML, CSS and JS;
   model-data.json, report-usage.json, scripts and test fixtures stay outside the VSIX. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.resolve(root, '..', 'Models', 'tools', 'viewer');
const dst = path.join(root, 'media');
const check = process.argv.includes('--check');
const required = ['index.html', 'explorer.css', 'measures.css', 'js/app.js',
  'js/host-vscode.js', 'js/snapshot.js'];

for (const file of required) {
  if (!fs.existsSync(path.join(src, file))) throw new Error('Missing canonical viewer asset: ' + file);
}
const files = ['index.html', ...fs.readdirSync(src).filter(file => file.endsWith('.css')),
  ...fs.readdirSync(path.join(src, 'js')).filter(file => file.endsWith('.js') && file !== 'host-web.js').map(file => 'js/' + file)].sort();
const expected = new Set(files);
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)=["']\.\/([^"'?#]+)(?:[?#][^"']*)?["']/g)) {
  if (!expected.has(match[1])) throw new Error('Viewer references an unbundled local asset: ' + match[1]);
}

if (check) {
  const actual = [];
  function walk(directory, prefix = '') {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isDirectory()) walk(path.join(directory, item.name), name + '/');
      else actual.push(name);
    }
  }
  if (!fs.existsSync(dst)) throw new Error('Viewer media is missing. Run npm run sync-viewer first.');
  walk(dst);
  if (JSON.stringify(actual.sort()) !== JSON.stringify(files)) throw new Error('Viewer media has missing or unexpected files. Run npm run sync-viewer.');
  for (const file of files) {
    if (!fs.readFileSync(path.join(src, file)).equals(fs.readFileSync(path.join(dst, file)))) {
      throw new Error('Viewer media is stale: ' + file + '. Run npm run sync-viewer.');
    }
  }
  console.log('verified ' + files.length + ' viewer runtime assets; no model or report data bundled');
} else {
  // Validate the source before replacing generated output.
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.join(dst, 'js'), { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(src, file), path.join(dst, file));
  console.log('synced ' + files.length + ' viewer runtime assets from Models/tools/viewer into media/');
}

// Keep network/auth code in the extension host, outside webview resource roots.
const fabricSource = path.resolve(root, '..', 'tools', 'fabric');
const fabricTarget = path.join(root, 'fabric');
if (fs.existsSync(fabricSource)) {
  const runtime = fs.readdirSync(fabricSource).filter(file => file.endsWith('.cjs')).sort();
  if (check) {
    for (const file of runtime) {
      if (!fs.existsSync(path.join(fabricTarget, file)) || !fs.readFileSync(path.join(fabricSource, file)).equals(fs.readFileSync(path.join(fabricTarget, file)))) throw new Error('Fabric host runtime is stale: ' + file);
    }
  } else {
    fs.rmSync(fabricTarget, { recursive: true, force: true });
    fs.mkdirSync(fabricTarget, { recursive: true });
    for (const file of runtime) fs.copyFileSync(path.join(fabricSource, file), path.join(fabricTarget, file));
  }
}

const xmlaPublish = path.join(fabricSource, 'xmla', 'publish');
if (fs.existsSync(xmlaPublish)) {
  const packagedPublish = path.join(fabricTarget, 'xmla', 'publish');
  if (!check) fs.cpSync(xmlaPublish, packagedPublish, { recursive: true });
  else {
    const verifyHelper = (source, target) => {
      for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, item.name), targetPath = path.join(target, item.name);
        if (item.isDirectory()) verifyHelper(sourcePath, targetPath);
        else if (!fs.existsSync(targetPath) || !fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath))) throw new Error('XMLA helper is stale: ' + item.name);
      }
    };
    verifyHelper(xmlaPublish, packagedPublish);
  }
}
