'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../cli');
const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
const target = process.argv[2];
if (!target || JSON.stringify(info.targets) !== JSON.stringify([target])) throw new Error('CLI runtime must match the VSIX target');
for (const [file, hash] of Object.entries(info.files)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') !== hash) throw new Error('CLI packaging mismatch: ' + file);
}
console.log('Verified complete CLI for ' + target);
