#!/usr/bin/env node
/* Fail before packaging a cross-platform preview with missing native assets. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const platforms = ['win32-x64','win32-arm64','darwin-x64','darwin-arm64','linux-x64','linux-arm64'];
for (const platform of platforms) {
  const directory = path.join(root, 'fabric/xmla/publish', platform);
  for (const file of [platform.startsWith('win32') ? 'Smv.Fabric.Xmla.exe' : 'Smv.Fabric.Xmla',
    ...['AMO-EULA.rtf','ADOMD-EULA.rtf','DOTNET-LICENSE.txt','DOTNET-THIRD-PARTY-NOTICES.txt'].map(name => 'notices/'+name)]) {
    const target = path.join(directory, file);
    if (!fs.existsSync(target) || !fs.statSync(target).size) throw new Error('Missing preview runtime asset: '+platform+'/'+file);
  }
}
if (!fs.existsSync(path.join(root,'THIRD-PARTY-NOTICES.md'))) throw new Error('Missing third-party component index.');
console.log('Verified six helper targets and bundled license/notice files. Runtime acceptance is recorded separately.');
