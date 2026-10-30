'use strict';
// Restore the official client and its dependency closure; no SDK is needed at runtime.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const project = path.join(root, 'tools/powerbi/Smv.PowerBi.Client.csproj');
execFileSync('dotnet', ['restore', project, '--nologo', '--locked-mode'], { stdio: 'inherit' });
const assets = JSON.parse(fs.readFileSync(path.join(path.dirname(project), 'obj/project.assets.json'), 'utf8'));
const target = Object.values(assets.targets)[0];
const destination = path.join(root, 'vscode-extension/resources/windows/amo');
fs.mkdirSync(destination, { recursive: true });
const packages = [];
for (const [id, dependency] of Object.entries(target)) {
  if (dependency.type !== 'package') continue;
  const library = assets.libraries[id];
  const folder = Object.keys(assets.packageFolders).map(base => path.join(base, library.path)).find(candidate => fs.existsSync(candidate));
  if (!folder) throw new Error('Restored package missing: ' + id);
  for (const file of Object.keys(dependency.runtime || {})) {
    if (!file.endsWith('.dll')) continue;
    fs.copyFileSync(path.join(folder, file), path.join(destination, path.basename(file)));
  }
  if (dependency.runtime && Object.keys(dependency.runtime).some(file => file.endsWith('.dll'))) {
    packages.push(id);
    const nuspec = fs.readdirSync(folder).find(file => file.endsWith('.nuspec'));
    if (nuspec) fs.copyFileSync(path.join(folder, nuspec), path.join(destination, id.replaceAll('/', '-') + '.nuspec'));
    for (const file of fs.readdirSync(folder).filter(name => /license|notice/i.test(name))) {
      if (fs.statSync(path.join(folder, file)).isFile()) fs.copyFileSync(path.join(folder, file), path.join(destination, id.replaceAll('/', '-') + '-' + file));
    }
  }
}
for (const file of ['AMO-EULA.rtf']) {
  fs.copyFileSync(path.join(root, 'tools/fabric/xmla/notices', file), path.join(destination, file));
}
fs.writeFileSync(path.join(destination, 'packages.json'), JSON.stringify(packages, null, 2) + '\n');
if (!fs.existsSync(path.join(destination, 'Microsoft.AnalysisServices.Tabular.dll'))) throw new Error('TOM library missing');
console.log('Prepared Power BI Desktop client libraries.');

fs.copyFileSync(path.join(root, 'tools/powerbi/THIRD-PARTY-NOTICES.md'), path.join(destination, 'README.md'));
