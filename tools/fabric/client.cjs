'use strict';
const { setTimeout: delay } = require('node:timers/promises');
const FABRIC_AUDIENCE = 'https://api.fabric.microsoft.com';
const POWER_BI_AUDIENCE = 'https://analysis.windows.net/powerbi/api';
class FabricError extends Error {
  constructor(code, message, status = 0, details = {}) { super(message); this.name = 'FabricError'; this.code = code; this.status = status; this.details = safeDiagnostics(details); }
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) throw new FabricError('InvalidId', 'Invalid Fabric item ID.');
  return value;
}
const SERVICE_CODES = new Set(['UnknownError', 'OperationNotSupportedForItem', 'InsufficientPrivileges',
  'ItemNotFound', 'WorkspaceNotFound', 'CapacityNotActive', 'CapacityNotFound',
  'InvalidCapacityException', 'TooManyRequests', 'ServiceUnavailable', 'Other']);
function diagnosticId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : undefined;
}
function safeDiagnostics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  if (typeof value.errorCode === 'string') result.errorCode = SERVICE_CODES.has(value.errorCode) ? value.errorCode : 'Other';
  if (typeof value.isRetriable === 'boolean') result.isRetriable = value.isRetriable;
  for (const key of ['requestId', 'responseRequestId']) { const id = diagnosticId(value[key]); if (id) result[key] = id; }
  if (['Active', 'Inactive', 'Unknown'].includes(value.capacityState)) {
    result.capacityState = value.capacityState; result.capacityObservation = 'preflight';
  }
  return result;
}
function operationError(error, response, capacityState) {
  const details = safeDiagnostics({ ...safeDiagnostics(error),
    requestId: diagnosticId(error?.requestId) || diagnosticId(error?.RequestId),
    responseRequestId: response.headers.get('RequestId'), capacityState });
  const fields = [`Code: ${details.errorCode || 'OperationFailed'}.`];
  if ('isRetriable' in details) fields.push(`Retriable: ${details.isRetriable}.`);
  if (details.requestId) fields.push(`Request ID: ${details.requestId}.`);
  if (details.responseRequestId) fields.push(`Response request ID: ${details.responseRequestId}.`);
  fields.push(`Capacity observed during preflight: ${details.capacityState}.`);
  return new FabricError('OperationFailed', `Fabric could not retrieve this model definition. ${fields.join(' ')}`, 0, details);
}
function capacityUrl(value, base) {
  // Require literal canonical origin/path; URL normalization must not hide an escape.
  if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)
      || !(value === base || value.startsWith(base + '?'))) throw new FabricError('UnsafeUrl', 'Unsafe capacity continuation.');
  const url = new URL(value), query = [...url.searchParams];
  if (url.hash || url.pathname !== new URL(base).pathname
      || (url.search && (query.length !== 1 || !['continuationToken', '$skiptoken'].includes(query[0][0])))) throw new FabricError('UnsafeUrl', 'Unsafe capacity continuation.');
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
        throw new FabricError(safeDiagnostics(body).errorCode || `HTTP${response.status}`, response.status === 401 ? 'Microsoft sign-in has expired. Sign in again.' : response.status === 403 ? 'Your account cannot read this model definition. Read + Build access requires an available XMLA endpoint.' : `Fabric request failed (${response.status}).`, response.status);
      }
      return response;
    }
  }
  async function observeCapacity(workspaceId, signal, powerBiToken) {
    // One bounded advisory pass, no retries and no additional consent. Each open
    // gets fresh observations; discovery/cached-model metadata can be stale.
    const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const powerBi = powerBiToken !== undefined;
    const base = powerBi ? 'https://api.powerbi.com/v1.0/myorg' : `${FABRIC_AUDIENCE}/v1`;
    try {
      const token = powerBiToken || await getAccessToken(FABRIC_AUDIENCE, 'capacity-preflight');
      const get = async url => {
        probeSignal.throwIfAborted();
        const response = await fetchImpl(url, { signal: probeSignal, redirect: 'error',
          headers: { Authorization: `Bearer ${typeof token === 'string' ? token : token.accessToken}`, Accept: 'application/json' } });
        if (response.status !== 200) throw new FabricError('CapacityUnknown', 'Capacity visibility is unavailable.');
        return readJson(response);
      };
      const workspace = await get(`${base}/${powerBi ? 'groups' : 'workspaces'}/${workspaceId}`);
      const capacityId = diagnosticId(workspace?.capacityId);
      if (diagnosticId(workspace?.id) !== workspaceId.toLowerCase() || !capacityId) return 'Unknown';
      const collection = `${base}/capacities`, seen = new Set(), matches = [];
      let next = collection;
      for (let page = 0; page < 5; page++) {
        next = capacityUrl(next, collection);
        if (seen.has(next)) return 'Unknown';
        seen.add(next);
        const body = await get(next);
        if (!Array.isArray(body?.value)) return 'Unknown';
        for (const row of body.value) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) return 'Unknown';
          if (diagnosticId(row.id) === capacityId) matches.push(powerBi && row.state === 'Suspended' ? 'Inactive' : row.state);
        }
        const link = body.continuationUri ?? (powerBi ? body['@odata.nextLink'] ?? body['odata.nextLink'] : undefined);
        if (link != null && typeof link !== 'string' || body.continuationToken != null && typeof body.continuationToken !== 'string') return 'Unknown';
        next = link || (body.continuationToken ? `${collection}?continuationToken=${encodeURIComponent(body.continuationToken)}` : null);
        if (!next) return matches.length && ['Active', 'Inactive'].includes(matches[0]) && matches.every(v => v === matches[0]) ? matches[0] : 'Unknown';
      }
    } catch { signal.throwIfAborted(); }
    return 'Unknown';
  }
  function requireActiveOrUnknown(state) {
    if (state === 'Inactive') throw new FabricError('CapacityInactive', 'This workspace capacity was observed Inactive during preflight. Ask its capacity administrator to resume it before retrying. The viewer never resumes capacity.', 0, { capacityState: state });
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
      let capacityState = await observeCapacity(workspaceId, signal);
      requireActiveOrUnknown(capacityState);
      async function readXmla() {
        const token = await getAccessToken(POWER_BI_AUDIENCE);
        const accessToken = typeof token === 'string' ? token : token.accessToken;
        if (capacityState === 'Unknown') capacityState = await observeCapacity(workspaceId, signal, accessToken);
        requireActiveOrUnknown(capacityState);
        return xmlaReader({ workspaceId, modelId, ...options, accessToken });
      }
      if (options.transport === 'xmla') {
        if (!xmlaReader) throw new FabricError('XmlaUnavailable', 'The XMLA helper is not installed.');
        return readXmla();
      }
      // Read-only XMLA is the default; editors may explicitly select REST if XMLA is unavailable.
      if (xmlaReader && options.transport !== 'rest') return readXmla();
      let response = await request(`workspaces/${workspaceId}/semanticModels/${modelId}/getDefinition?format=TMDL`, { ...options, method: 'POST' });
      if (response.status === 202) {
        const operationId = uuid(response.headers.get('x-ms-operation-id'));
        let complete = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          await wait(Math.min(60, Math.max(1, Number(response.headers.get('Retry-After')) || 1)) * 1000, undefined, { signal: options.signal });
          response = await request(`operations/${operationId}`, options);
          const state = await readJson(response);
          if (state?.status === 'Succeeded') { complete = true; break; }
          if (['Failed', 'Cancelled', 'Canceled'].includes(state?.status)) throw operationError(state.error, response, capacityState);
          if (!['NotStarted', 'Running'].includes(state?.status)) throw new FabricError('InvalidOperationState', 'Fabric returned an unknown operation state.');
        }
        if (!complete) throw new FabricError('OperationTimeout', 'Fabric metadata retrieval timed out.');
        response = await request(`operations/${operationId}/result`, options);
      }
      return { transport: 'rest', parts: decodeDefinition(await readJson(response)) };
    }
  };
}
module.exports = { createFabricClient, FabricError, decodeDefinition, FABRIC_AUDIENCE, POWER_BI_AUDIENCE, safeDiagnostics };
