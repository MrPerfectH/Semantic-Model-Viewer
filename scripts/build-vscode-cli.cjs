'use strict';
const path = require('node:path');
const { build } = require('./build-portable.cjs');
const { values } = require('node:util').parseArgs({ options: {
  target: { type: 'string' }, 'runtime-root': { type: 'string' }, out: { type: 'string' },
} });
try {
  if (!values.target || !values['runtime-root']) throw new Error('Provide --target and --runtime-root');
  const info = build({ out: values.out || path.resolve(__dirname, '../vscode-extension/cli'),
    runtimeRoot: path.resolve(values['runtime-root']), targets: [values.target], host: 'claude' });
  console.log(JSON.stringify({ target: values.target, engineVersion: info.engineVersion, sha256: info.sha256 }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
