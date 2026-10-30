'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Only the CI checkout is changed; stable versions stay in source control.
const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const run = process.env.GITHUB_RUN_NUMBER;
if (!/^[1-9]\d*$/.test(run || '') || !Number.isSafeInteger(Number(run))) {
  throw new Error('GITHUB_RUN_NUMBER must be a positive safe integer');
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error('The extension version must be major.minor.patch');
}
const [major, minor] = manifest.version.split('.').map(Number);
// Reserve the next odd minor for previews, leaving even minors for stable.
const previewMinor = minor + (minor % 2 === 0 ? 1 : 2);
const version = `${major}.${previewMinor}.${run}`;
manifest.version = version;
// Unlocks features that ship only in pre-release builds (src/features.js).
manifest.smvPreRelease = true;
lock.version = version;
lock.packages[''].version = version;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`Marketplace pre-release version: ${version}`);
