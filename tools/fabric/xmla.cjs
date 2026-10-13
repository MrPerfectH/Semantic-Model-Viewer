'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { FabricError } = require('./client.cjs');
function createXmlaReader({ executable = process.env.SMV_FABRIC_XMLA_HELPER || path.join(__dirname, 'xmla', 'publish', process.platform + '-' + process.arch, process.platform === 'win32' ? 'Smv.Fabric.Xmla.exe' : 'Smv.Fabric.Xmla') } = {}) {
  return request => new Promise((resolve, reject) => {
    request.signal?.throwIfAborted();
    if (!fs.existsSync(executable)) return reject(new FabricError('XmlaHelperMissing', 'The XMLA helper is not installed. Editors can choose the Fabric REST connection instead.'));
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let output = ''; let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); request.signal?.removeEventListener('abort', abort); if (error) { child.kill(); reject(error); } else resolve(result); };
    const abort = () => finish(new FabricError('Cancelled', 'XMLA metadata retrieval cancelled.'));
    const timer = setTimeout(() => finish(new FabricError('XmlaTimeout', 'XMLA metadata retrieval timed out.')), 120000);
    request.signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish(new FabricError('XmlaHelperFailed', 'The XMLA helper could not start.')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', data => { output += data.toString('utf8'); if (output.length > 96 * 1024 * 1024) finish(new FabricError('DefinitionTooLarge', 'XMLA model metadata exceeds the supported size.')); });
    child.on('close', code => {
      try { const result = JSON.parse(output); if (code || result.error) throw new FabricError(result.error?.code || 'XmlaFailed', result.error?.message || 'XMLA metadata retrieval failed.'); if (result.transport !== 'xmla' || !Array.isArray(result.parts)) throw new Error(); finish(null, result); }
      catch (error) { finish(error instanceof FabricError ? error : new FabricError('XmlaFailed', 'The XMLA helper returned invalid metadata.')); }
    });
    child.stdin.end(JSON.stringify({ workspaceId: request.workspaceId, workspaceName: request.workspaceName, modelId: request.modelId, accessToken: request.accessToken }));
  });
}
module.exports = { createXmlaReader };
