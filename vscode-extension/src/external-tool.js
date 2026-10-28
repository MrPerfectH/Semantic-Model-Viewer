'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const EXTENSION_ID = 'MrPerfectH.semantic-model-viewer';
const TOOL_FILE = 'Semantic Model Viewer VS Code.pbitool.json';

function parseLaunchUri(uri) {
  if (uri.authority.toLowerCase() !== EXTENSION_ID.toLowerCase() || uri.path !== '/powerbi' || uri.fragment) {
    throw new Error('Unsupported Semantic Model Viewer launch link.');
  }
  // Preserve unresolved Desktop placeholders: "%da" in "%database%" would
  // otherwise be decoded as a malformed UTF-8 byte by URLSearchParams.
  const query = new URLSearchParams(uri.query.replace(/%server%/g, '%25server%25').replace(/%database%/g, '%25database%25'));
  if (uri.query.length > 4096 || [...query.keys()].some((key) => !['server', 'database'].includes(key)) ||
      query.getAll('server').length > 1 || query.getAll('database').length > 1) {
    throw new Error('Invalid Power BI launch parameters.');
  }
  const server = query.get('server') || '';
  const database = query.get('database') || '';
  // Desktop can leave placeholders unresolved when there is no model.
  if ((!server || server === '%server%') && (!database || database === '%database%')) return null;
  const match = /^(localhost|127\.0\.0\.1):([0-9]{1,5})$/i.exec(server);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535 ||
      database.length > 512 || /[\u0000-\u001f\u007f]/.test(database)) {
    throw new Error('The Power BI launch link must identify a local Desktop model.');
  }
  if (!database || database === '%database%') return null;
  return { id: 'powerbi:' + server + '/' + database, name: 'Power BI Desktop', path: 'Power BI Desktop', kind: 'powerbi', server, database };
}

function createRegistration(appRoot, scheme, extensionPath) {
  if (!['vscode', 'vscode-insiders'].includes(scheme)) throw new Error('Registration supports VS Code and VS Code Insiders on Windows.');
  const executable = path.resolve(appRoot, '..', '..', scheme === 'vscode-insiders' ? 'Code - Insiders.exe' : 'Code.exe');
  if (!fs.existsSync(executable)) throw new Error('Could not locate the VS Code executable. Run this command in local VS Code on Windows.');
  return {
    version: '1.0.0',
    name: 'Semantic Model Viewer (VS Code)',
    description: 'Explore the current Power BI Desktop model in Semantic Model Viewer.',
    path: executable,
    // No versioned extension path: extension updates keep the ribbon button working.
    arguments: '--open-url "' + scheme + '://' + EXTENSION_ID + '/powerbi?server=%server%&database=%database%"',
    iconData: 'image/png;base64,' + fs.readFileSync(path.join(extensionPath, 'images', 'icon.png')).toString('base64')
  };
}

function updateRegistration(extensionPath, registration, remove = false) {
  const script = path.join(extensionPath, 'resources', 'windows', 'register-external-tool.ps1');
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script];
  if (remove) args.push('-Remove');
  else args.push('-RegistrationBase64', Buffer.from(JSON.stringify(registration), 'utf8').toString('base64'));
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', args, { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || stdout || error.message).trim()));
      else resolve(String(stdout || '').trim());
    });
  });
}

module.exports = { EXTENSION_ID, TOOL_FILE, parseLaunchUri, createRegistration, updateRegistration };
