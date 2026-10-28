'use strict';

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

function scriptPath(extensionPath) {
  return path.join(extensionPath, 'resources', 'windows', 'connect-powerbi.ps1');
}

function runPowerShell(script, args, maxBuffer = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
      windowsHide: true, timeout: 120000, maxBuffer
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve(String(stdout || '').trim());
    });
  });
}

async function listPowerBiModels(extensionPath) {
  const output = await runPowerShell(scriptPath(extensionPath), ['-List']);
  if (!output) return [];
  const result = JSON.parse(output);
  return (Array.isArray(result) ? result : [result]).map((model) => ({
    id: 'powerbi:' + model.server + '/' + model.database,
    name: model.name || model.database,
    server: model.server,
    database: model.database,
    path: 'Power BI Desktop',
    kind: 'powerbi'
  }));
}

async function readPowerBiModel(extensionPath, model) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smv-powerbi-'));
  const file = path.join(dir, crypto.randomUUID() + '.bim');
  try {
    await runPowerShell(scriptPath(extensionPath), ['-Connect', '-Server', model.server, '-Database', model.database, '-OutputPath', file]);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_MODEL_BYTES) throw new Error('Connected model is too large to open.');
    const text = fs.readFileSync(file, 'utf8');
    JSON.parse(text);
    return { ...model, files: [{ name: 'model.bim', path: 'model.bim', text }] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { listPowerBiModels, readPowerBiModel };
