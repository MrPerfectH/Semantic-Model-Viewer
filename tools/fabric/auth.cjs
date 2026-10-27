'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { FABRIC_AUDIENCE, POWER_BI_AUDIENCE, FabricError } = require('./client.cjs');
const POWER_BI_DESKTOP_CLIENT_ID = 'ea0616ba-638b-4df5-95b9-636659ae5121';
const scopesFor = (audience, purpose, clientId) => {
  if (![FABRIC_AUDIENCE, POWER_BI_AUDIENCE].includes(audience)) throw new FabricError('InvalidAudience', 'Unsupported Microsoft token audience.');
  if (clientId === POWER_BI_DESKTOP_CLIENT_ID) return [`${POWER_BI_AUDIENCE}/.default`];
  if (audience === FABRIC_AUDIENCE) return [`${audience}/Workspace.Read.All`, `${audience}/SemanticModel.${purpose === 'definition' ? 'ReadWrite' : 'Read'}.All`];
  if (audience === POWER_BI_AUDIENCE) return [`${audience}/Dataset.Read.All`];
  throw new FabricError('InvalidAudience', 'Unsupported Microsoft token audience.');
};
function createAuth({ clientId, openBrowser, loadTokens = async () => null, saveTokens = async () => {}, msalFactory }) {
  let browserLogin = false; let browserError = null;
  let deviceLogin = null; let deviceError = null; let deviceRequest = null;
  const accessTokens = new Map();
  let client; let pending; let interactiveBusy = false; let selectedId; let selectedTenantId; let generation = 0;
  async function init() {
    if (!clientId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) throw new FabricError('NotConfigured', 'Fabric sign-in is awaiting application setup by the Semantic Model Viewer maintainers.');
    if (!client) {
      const factory = msalFactory || (configuration => new (require('@azure/msal-node').PublicClientApplication)(configuration));
      client = factory({ auth: { clientId, authority: 'https://login.microsoftonline.com/organizations' }, cache: { cachePlugin: {
        beforeCacheAccess: async context => { const data = await loadTokens(); if (data) context.tokenCache.deserialize(data); },
        afterCacheAccess: async context => { if (context.cacheHasChanged) await saveTokens(context.tokenCache.serialize()); }
      } } });
    }
    return client;
  }
  function tokenKey(account, audience, purpose) { return JSON.stringify([account.homeAccountId, account.tenantId, scopesFor(audience, purpose, clientId)]); }
  function remember(result, audience, purpose) {
    const expires = result?.expiresOn?.getTime();
    if (result?.account && result.accessToken && Number.isFinite(expires)) accessTokens.set(tokenKey(result.account, audience, purpose), { token: result.accessToken, expires });
    return result;
  }
  function accountInfo(account) { return account ? { id: account.homeAccountId, name: account.username, tenantId: account.tenantId } : null; }
  async function account() { const accounts = await (await init()).getTokenCache().getAllAccounts(); return selectedId ? accounts.find(a => a.homeAccountId === selectedId && a.tenantId === selectedTenantId) || null : accounts.length === 1 ? accounts[0] : null; }
  async function interactive(audience, prompt, purpose, browserFlow) {
    if (interactiveBusy) throw new FabricError('SignInInProgress', 'Microsoft sign-in is already in progress.');
    interactiveBusy = true;
    const currentGeneration = generation;
    let app;
    try { app = await init(); if (currentGeneration !== generation) throw new FabricError('Cancelled', 'Microsoft sign-in cancelled.'); } catch (error) { interactiveBusy = false; throw error; }
    const verifier = crypto.randomBytes(32).toString('base64url');
    const state = crypto.randomBytes(32).toString('base64url');
    let server; let timer; let rejectPending; let callbackResponse;
    const callback = new Promise((resolve, reject) => {
      rejectPending = reject;
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== (clientId === POWER_BI_DESKTOP_CLIENT_ID ? '/' : '/callback')) { res.writeHead(404).end(); return; }
        if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid sign-in state.'); return; }
        if(browserFlow) callbackResponse = res;
        else res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" }).end('Microsoft sign-in received. You can close this tab.');
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
      const redirectUri = `http://localhost:${server.address().port}${clientId === POWER_BI_DESKTOP_CLIENT_ID ? '/' : '/callback'}`;
      timer = setTimeout(() => rejectPending(new FabricError('SignInTimeout', 'Microsoft sign-in timed out.')), 5 * 60 * 1000);
      const scopes = scopesFor(audience, purpose, clientId);
      const url = await app.getAuthCodeUrl({ scopes, redirectUri, codeChallenge: crypto.createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256', state, prompt });
      if (generation !== currentGeneration) throw new FabricError('Cancelled', 'Microsoft sign-in cancelled.');
      await (browserFlow ? browserFlow.ready(url) : openBrowser(url));
      const code = await callback;
      const result = await app.acquireTokenByCode({ code, scopes, redirectUri, codeVerifier: verifier });
      if (prompt !== 'select_account' && selectedId && (result.account.homeAccountId !== selectedId || result.account.tenantId !== selectedTenantId)) { await app.getTokenCache().removeAccount(result.account); throw new FabricError('AccountMismatch', 'Use the same Microsoft account, or switch accounts in the viewer first.'); }
      if (generation !== currentGeneration) { await app.getTokenCache().removeAccount(result.account); throw new FabricError('Cancelled', 'Microsoft sign-in cancelled.'); }
      if (prompt === 'select_account') { for (const previous of await app.getTokenCache().getAllAccounts()) { if ((previous.homeAccountId !== result.account.homeAccountId || previous.tenantId !== result.account.tenantId)) await app.getTokenCache().removeAccount(previous); } }
      selectedId = result.account.homeAccountId; selectedTenantId = result.account.tenantId;
      if (prompt === 'select_account') accessTokens.clear();
      return remember(result, audience, purpose);
    } catch (error) {
      if (error instanceof FabricError) throw error;
      throw new FabricError('SignInFailed', 'Microsoft sign-in did not complete. Check your connection and sign in again.');
    } finally { if(callbackResponse && !callbackResponse.writableEnded) callbackResponse.writeHead(302, {'Location':browserFlow.returnUri,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end(); clearTimeout(timer); server?.close(); server?.closeAllConnections(); if(generation === currentGeneration) { pending = null; interactiveBusy = false; } }
  }
  return {
    async beginBrowserSignIn(returnUri) {
      if(!/^http:\/\/localhost:[0-9]+\/\?fabricSignIn=1$/.test(returnUri || '')) throw new FabricError('InvalidRedirect','Invalid viewer return address.');
      if(interactiveBusy) throw new FabricError('SignInInProgress','Microsoft sign-in is already in progress.');
      browserLogin = true; browserError = null;
      const before = generation;
      let ready, failed;const started = new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
      interactive(clientId === POWER_BI_DESKTOP_CLIENT_ID ? POWER_BI_AUDIENCE : FABRIC_AUDIENCE,'select_account',undefined,{returnUri,ready:url=>ready({url})})
        .catch(error=>{if(before===generation) browserError=error instanceof FabricError ? error.message : 'Microsoft sign-in failed. Sign in again.';failed(error);})
        .finally(()=>{if(before===generation) browserLogin=false;});
      return started;
    },
    async beginDeviceSignIn() {
      if (interactiveBusy) throw new FabricError('SignInInProgress', 'Microsoft sign-in is already in progress.');
      interactiveBusy = true; deviceLogin = null; deviceError = null;
      const currentGeneration = generation;
      let ready, failed; const started = new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
      (async()=>{
        try {
          const app = await init();
          if (generation !== currentGeneration) throw new FabricError('Cancelled','Microsoft sign-in cancelled.');
          deviceRequest = { scopes: scopesFor(POWER_BI_AUDIENCE, undefined, clientId), deviceCodeCallback: response => {
            if (generation !== currentGeneration) { failed(new FabricError('Cancelled','Microsoft sign-in cancelled.')); return; }
            deviceLogin = { userCode: response.userCode, verificationUri: response.verificationUri, expiresAt: Date.now() + response.expiresIn * 1000 }; ready(deviceLogin);
          } };
          const result = await app.acquireTokenByDeviceCode(deviceRequest);
          if (generation !== currentGeneration) { if(result?.account) await app.getTokenCache().removeAccount(result.account); throw new FabricError('Cancelled','Microsoft sign-in cancelled.'); }
          if (!result?.account) throw new FabricError('SignInDenied','Microsoft sign-in did not complete.');
          selectedId = result.account.homeAccountId; selectedTenantId = result.account.tenantId;
          for (const previous of await app.getTokenCache().getAllAccounts()) if ((previous.homeAccountId !== selectedId || previous.tenantId !== selectedTenantId)) await app.getTokenCache().removeAccount(previous);
          accessTokens.clear();
          remember(result, POWER_BI_AUDIENCE);
          deviceLogin = null;
        } catch(error) { if (generation === currentGeneration) { deviceLogin = null; deviceError = 'Microsoft device sign-in did not complete. Check your connection and try again.'; } failed(error); }
        finally { if(generation === currentGeneration) {deviceRequest = null; interactiveBusy = false;} }
      })();
      return started;
    },
    async status() { if (!clientId) return { configured: false, account: null }; return { configured: true, account: accountInfo(await account()), deviceLogin, deviceError, browserLogin, browserError }; },
    async signIn() { return accountInfo((await interactive(clientId === POWER_BI_DESKTOP_CLIENT_ID ? POWER_BI_AUDIENCE : FABRIC_AUDIENCE, 'select_account')).account); },
    async getAccessToken(audience, purpose) {
      const currentGeneration = generation;
      const app = await init(); const selected = await account();
      if (!selected) throw new FabricError('NotSignedIn', 'Sign in with your Microsoft work account.');
      if (generation !== currentGeneration) throw new FabricError('Cancelled', 'Microsoft token request cancelled.');
      selectedId = selected.homeAccountId; selectedTenantId = selected.tenantId;
      const key = tokenKey(selected, audience, purpose);
      const cached = accessTokens.get(key);
      if (cached && cached.expires > Date.now() + 60000) return cached.token;
      accessTokens.delete(key);
      try { const result = await app.acquireTokenSilent({ account: selected, scopes: scopesFor(audience, purpose, clientId) }); if (generation !== currentGeneration) { await app.getTokenCache().removeAccount(selected); throw new FabricError('Cancelled', 'Microsoft token request cancelled.'); } return remember(result, audience, purpose).accessToken; }
      catch (error) {
        if (generation !== currentGeneration) throw new FabricError('Cancelled', 'Microsoft token request cancelled.');
        if (error instanceof FabricError) throw error;
        if (purpose === 'capacity-preflight') throw new FabricError('CapacityUnknown', 'Capacity visibility is unavailable.');
        if (error.name !== 'InteractionRequiredAuthError') throw new FabricError('TokenFailed', 'Microsoft could not renew this session. Sign in again.');
        return (await interactive(audience, undefined, purpose)).accessToken;
      }
    },
    async signOut() { generation++; accessTokens.clear(); browserLogin = false; browserError = null; pending?.(); if(deviceRequest) deviceRequest.cancel = true; deviceRequest = null; deviceLogin = null; deviceError = null; interactiveBusy = false; if (clientId) { const app = await init(); for (const a of await app.getTokenCache().getAllAccounts()) await app.getTokenCache().removeAccount(a); } selectedId = null; selectedTenantId = null; await saveTokens(null); },
    cancel() { generation++; browserLogin = false; browserError = null; pending?.(); if(deviceRequest) deviceRequest.cancel = true; deviceRequest = null; deviceLogin = null; deviceError = null; interactiveBusy = false; }
  };
}
module.exports = { createAuth, createWorkAccountAuth: createAuth, scopesFor, POWER_BI_DESKTOP_CLIENT_ID };
