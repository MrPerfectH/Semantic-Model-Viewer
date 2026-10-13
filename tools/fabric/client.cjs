'use strict';
const { setTimeout: delay } = require('node:timers/promises');
const FABRIC_AUDIENCE = 'https://api.fabric.microsoft.com';
const POWER_BI_AUDIENCE = 'https://analysis.windows.net/powerbi/api';
class FabricError extends Error {
  constructor(code, message, status = 0) { super(message); this.name = 'FabricError'; this.code = code; this.status = status; }
}
function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) throw new FabricError('InvalidId', 'Invalid Fabric item ID.');
  return value;
}
function safeUrl(value) {
  const url = new URL(value, `${FABRIC_AUDIENCE}/v1/`);
  if (url.origin !== FABRIC_AUDIENCE || !url.pathname.startsWith('/v1/') || url.username || url.password) throw new FabricError('UnsafeUrl', 'Fabric returned an unsafe continuation URL.');
  return url.href;
}
function decodeDefinition(body) {
  const parts = body?.definition?.parts;
  if (!Array.isArray(parts) || !parts.length) throw new FabricError('InvalidDefinition', 'Fabric returned no model definition.');
  let total = 0;
  const seen = new Set();
  return parts.map(part => {
    if (typeof part.path !== 'string' || part.path.startsWith('/') || /[:\x00-\x1f]/.test(part.path) || part.path.includes('\\') || part.path.split('/').some(p => p === '..' || p === '.' || !p) || seen.has(part.path)) throw new FabricError('InvalidDefinition', 'Fabric returned an unsafe or duplicate definition path.');
    seen.add(part.path);
    if (part.payloadType !== 'InlineBase64' || typeof part.payload !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(part.payload)) throw new FabricError('InvalidDefinition', 'Unsupported definition payload.');
    total += part.payload.length;
    if (total > 128 * 1024 * 1024) throw new FabricError('DefinitionTooLarge', 'The model definition exceeds the supported size.');
    return { path: part.path, content: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(part.payload, 'base64')) };
  });
}
async function readJson(response) {
  if (Number(response.headers.get('content-length')) > 128 * 1024 * 1024) throw new FabricError('ResponseTooLarge', 'Fabric response exceeds the supported size.');
  const reader = response.body?.getReader();
  if (!reader) throw new FabricError('InvalidResponse', 'Fabric returned an empty response.');
  const chunks = []; let bytes = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 128 * 1024 * 1024) { await reader.cancel(); throw new FabricError('ResponseTooLarge', 'Fabric response exceeds the supported size.'); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new FabricError('InvalidResponse', 'Fabric returned invalid JSON.'); }
}
function createFabricClient({ getAccessToken, fetch: fetchImpl = globalThis.fetch, xmlaReader, wait = delay }) {
  async function request(path, { method = 'GET', signal } = {}) {
    const url = safeUrl(path);
    for (let attempt = 0; attempt < 4; attempt++) {
      signal?.throwIfAborted();
      const token = await getAccessToken(FABRIC_AUDIENCE, method === 'POST' || url.includes('/operations/') ? 'definition' : undefined);
      const response = await fetchImpl(url, { method, signal, redirect: 'error', headers: { Authorization: `Bearer ${typeof token === 'string' ? token : token.accessToken}`, Accept: 'application/json' } });
      if (response.status === 429 && attempt < 3) { await wait(Math.min(60, Math.max(1, Number(response.headers.get('Retry-After')) || 1)) * 1000, undefined, { signal }); continue; }
      if (!response.ok) {
        let body; try { body = await readJson(response); } catch {}
        throw new FabricError(body?.errorCode || `HTTP${response.status}`, response.status === 401 ? 'Microsoft sign-in has expired. Sign in again.' : response.status === 403 ? 'Your account cannot read this model definition. Read + Build access requires an available XMLA endpoint.' : `Fabric request failed (${response.status}).`, response.status);
      }
      return response;
    }
  }
  async function list(path, { signal, search = '' } = {}) {
    signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
    const values = []; const visited = new Set();
    while (path) {
      path = safeUrl(path);
      if (visited.has(path) || visited.size >= 1000) throw new FabricError('PaginationLoop', 'Fabric pagination did not finish.');
      visited.add(path);
      const body = await readJson(await request(path, { signal }));
      if (!Array.isArray(body.value)) throw new FabricError('InvalidResponse', 'Fabric returned an invalid item list.');
      values.push(...body.value);
      path = body.continuationUri || (body.continuationToken ? `${path.split('?')[0]}?continuationToken=${encodeURIComponent(body.continuationToken)}` : null);
    }
    return values.filter(v => String(v.displayName || '').toLowerCase().includes(search.toLowerCase()));
  }
  return {
    listWorkspaces: options => list('workspaces', options),
    listModels: (workspaceId, options) => list(`workspaces/${uuid(workspaceId)}/semanticModels`, options),
    async getModelDefinition(workspaceId, modelId, options = {}) {
      uuid(workspaceId); uuid(modelId);
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000);
      options = { ...options, signal };
      async function readXmla() {
        const token = await getAccessToken(POWER_BI_AUDIENCE);
        return xmlaReader({ workspaceId, modelId, ...options, accessToken: typeof token === 'string' ? token : token.accessToken });
      }
      if (options.transport === 'xmla') {
        if (!xmlaReader) throw new FabricError('XmlaUnavailable', 'The XMLA helper is not installed.');
        return readXmla();
      }
      // Read-only XMLA is the default; editors may explicitly select REST if XMLA is unavailable.
      if (xmlaReader && options.transport !== 'rest') return readXmla();
      try {
        let response = await request(`workspaces/${workspaceId}/semanticModels/${modelId}/getDefinition?format=TMDL`, { ...options, method: 'POST' });
        if (response.status === 202) {
          const operationId = uuid(response.headers.get('x-ms-operation-id'));
          let complete = false;
          for (let attempt = 0; attempt < 120; attempt++) {
            await wait(Math.min(60, Math.max(1, Number(response.headers.get('Retry-After')) || 1)) * 1000, undefined, { signal: options.signal });
            response = await request(`operations/${operationId}`, options);
            const state = await readJson(response);
            if (state.status === 'Succeeded') { complete = true; break; }
            if (['Failed', 'Cancelled'].includes(state.status)) throw new FabricError(state.error?.errorCode || 'OperationFailed', 'Fabric could not retrieve this model definition.');
          }
          if (!complete) throw new FabricError('OperationTimeout', 'Fabric metadata retrieval timed out.');
          response = await request(`operations/${operationId}/result`, options);
        }
        return { transport: 'rest', parts: decodeDefinition(await readJson(response)) };
      } catch (error) {
        if (error.status !== 403 || !xmlaReader) throw error;
        options.signal?.throwIfAborted();
        const token = await getAccessToken(POWER_BI_AUDIENCE);
        return xmlaReader({ workspaceId, modelId, ...options, accessToken: typeof token === 'string' ? token : token.accessToken });
      }
    }
  };
}
module.exports = { createFabricClient, FabricError, decodeDefinition, FABRIC_AUDIENCE, POWER_BI_AUDIENCE };
