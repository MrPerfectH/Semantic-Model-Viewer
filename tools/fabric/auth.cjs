'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { FABRIC_AUDIENCE, POWER_BI_AUDIENCE, FabricError } = require('./client.cjs');
const scopesFor = (audience, purpose) => {
  if (audience === FABRIC_AUDIENCE) return [`${audience}/Workspace.Read.All`, `${audience}/SemanticModel.${purpose === 'definition' ? 'ReadWrite' : 'Read'}.All`];
  if (audience === POWER_BI_AUDIENCE) return [`${audience}/Dataset.Read.All`];
  throw new FabricError('InvalidAudience', 'Unsupported Microsoft token audience.');
};
function createAuth({ clientId, openBrowser, loadTokens = async () => null, saveTokens = async () => {}, msalFactory }) {
  let client; let pending; let selectedId; let generation = 0;
  async function init() {
    if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) throw new FabricError('NotConfigured', 'Fabric sign-in is awaiting application setup by the Semantic Model Viewer maintainers.');
    if (!client) {
      const factory = msalFactory || (configuration => new (require('@azure/msal-node').PublicClientApplication)(configuration));
      client = factory({ auth: { clientId, authority: 'https://login.microsoftonline.com/organizations' }, cache: { cachePlugin: {
        beforeCacheAccess: async context => { const data = await loadTokens(); if (data) context.tokenCache.deserialize(data); },
        afterCacheAccess: async context => { if (context.cacheHasChanged) await saveTokens(context.tokenCache.serialize()); }
      } } });
    }
    return client;
  }
  function accountInfo(account) { return account ? { id: account.homeAccountId, name: account.username, tenantId: account.tenantId } : null; }
  async function account() { const accounts = await (await init()).getTokenCache().getAllAccounts(); return accounts.find(a => a.homeAccountId === selectedId) || accounts[0] || null; }
  async function interactive(audience, prompt, purpose) {
    if (pending) throw new FabricError('SignInInProgress', 'Microsoft sign-in is already in progress.');
    const currentGeneration = generation;
    const app = await init();
    const verifier = crypto.randomBytes(32).toString('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    let server; let timer; let rejectPending;
    const callback = new Promise((resolve, reject) => {
      rejectPending = reject;
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
        if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in state.'); return; }
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" }).end('Microsoft sign-in received. You can close this tab.');
        if (url.searchParams.has('error')) reject(new FabricError('SignInDenied', 'Microsoft sign-in was cancelled or denied.'));
        else if (!url.searchParams.get('code')) reject(new FabricError('InvalidCallback', 'Microsoft sign-in returned no authorization code.'));
        else resolve(url.searchParams.get('code'));
      });
    });
    // Prevent a timeout rejection becoming unhandled while the browser is opening.
    callback.catch(() => {});
    pending = () => rejectPending(new FabricError('Cancelled', 'Microsoft sign-in cancelled.'));
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const redirectUri = `http://localhost:${server.address().port}/callback`;
      timer = setTimeout(() => rejectPending(new FabricError('SignInTimeout', 'Microsoft sign-in timed out.')), 5 * 60 * 1000);
      const scopes = scopesFor(audience, purpose);
      const url = await app.getAuthCodeUrl({ scopes, redirectUri, codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256', state, prompt });
      await openBrowser(url);
      const code = await callback;
      const result = await app.acquireTokenByCode({ code, scopes, redirectUri, codeVerifier: verifier });
      if (prompt !== 'select_account' && selectedId && result.account.homeAccountId !== selectedId) { await app.getTokenCache().removeAccount(result.account); throw new FabricError('AccountMismatch', 'Use the same Microsoft account, or switch accounts in the viewer first.'); }
      if (generation !== currentGeneration) { await app.getTokenCache().removeAccount(result.account); throw new FabricError('Cancelled', 'Microsoft sign-in cancelled.'); }
      selectedId = result.account.homeAccountId;
      return result;
    } finally { clearTimeout(timer); server?.close(); server?.closeAllConnections(); pending = null; }
  }
  return {
    async status() { if (!clientId) return { configured: false, account: null }; return { configured: true, account: accountInfo(await account()) }; },
    async signIn() { return accountInfo((await interactive(FABRIC_AUDIENCE, 'select_account')).account); },
    async getAccessToken(audience, purpose) {
      const app = await init(); const selected = await account();
      if (!selected) throw new FabricError('NotSignedIn', 'Sign in with your Microsoft work account.');
      selectedId = selected.homeAccountId;
      try { const currentGeneration = generation; const result = await app.acquireTokenSilent({ account: selected, scopes: scopesFor(audience, purpose) }); if (generation !== currentGeneration) { await app.getTokenCache().removeAccount(selected); throw new FabricError('Cancelled', 'Microsoft token request cancelled.'); } return result.accessToken; }
      catch (error) {
        if (error instanceof FabricError) throw error;
        if (error.name !== 'InteractionRequiredAuthError') throw new FabricError('TokenFailed', 'Microsoft could not renew this session. Sign in again.');
        return (await interactive(audience, undefined, purpose)).accessToken;
      }
    },
    async signOut() { generation++; pending?.(); if (clientId) { const app = await init(); for (const a of await app.getTokenCache().getAllAccounts()) await app.getTokenCache().removeAccount(a); } selectedId = null; await saveTokens(null); },
    cancel() { generation++; pending?.(); }
  };
}
module.exports = { createAuth, createWorkAccountAuth: createAuth, scopesFor };
