const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth, POWER_BI_DESKTOP_CLIENT_ID } = require('../auth.cjs');
const id='11111111-1111-1111-1111-111111111111';
const a={homeAccountId:'a',username:'a@example.test',tenantId:'tenant'};
function mock(options={}) {
 let removed=[]; let cache=[a]; let serialized;
 const tokenCache={getAllAccounts:async()=>cache,removeAccount:async account=>{removed.push(account.homeAccountId);cache=cache.filter(v=>v.homeAccountId!==account.homeAccountId);},deserialize:()=>{},serialize:()=> 'cache'};
 const app={getTokenCache:()=>tokenCache,acquireTokenSilent:options.silent|| (async()=>({accessToken:'token'})),getAuthCodeUrl:async request=>`https://login.example/?${new URLSearchParams({redirect_uri:request.redirectUri,state:request.state})}`,acquireTokenByCode:async()=>({account:options.resultAccount||a,accessToken:'new',expiresOn:options.expiresOn})};
 const auth=createAuth({clientId:id,msalFactory:()=>app,saveTokens:async value=>{serialized=value;},openBrowser:async raw=>{const url=new URL(raw);const callback=new URL(url.searchParams.get('redirect_uri')); callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','code'); await fetch(callback);}});
 return {auth,removed,get saved(){return serialized;}};
}
test('sign-in uses local callback and returns account without tokens',async()=>{const {auth}=mock();assert.deepEqual(await auth.signIn(),{id:'a',name:'a@example.test',tenantId:'tenant'});});
test('token consent cannot silently switch selected account',async()=>{
 const m=mock({silent:async()=>{const e=new Error();e.name='InteractionRequiredAuthError';throw e;},resultAccount:{...a,homeAccountId:'b'}});
 await m.auth.signIn(); // explicit switch is allowed
 // Recreate with initial account a and prompt without explicit sign-in.
 const m2=mock({silent:async()=>{const e=new Error();e.name='InteractionRequiredAuthError';throw e;},resultAccount:{...a,homeAccountId:'b'}});
 // status selects the persisted account; getAccessToken must enforce its identity too.
 await assert.rejects(m2.auth.getAccessToken('https://analysis.windows.net/powerbi/api'),{code:'AccountMismatch'});
});
test('sign-out removes all local accounts and saves null',async()=>{const m=mock();await m.auth.signOut();assert.deepEqual(m.removed,['a']);assert.equal(m.saved,null);});
test('cancel during silent token acquisition discards result',async()=>{let resolve;const m=mock({silent:()=>new Promise(r=>{resolve=r;})});const result=m.auth.getAccessToken('https://api.fabric.microsoft.com');while(!resolve)await new Promise(r=>setImmediate(r));m.auth.cancel();resolve({accessToken:'obsolete'});await assert.rejects(result,{code:'Cancelled'});assert.deepEqual(m.removed,['a']);});
test('two simultaneous sign-ins do not create competing listeners',async()=>{const m=mock();const first=m.auth.signIn();await assert.rejects(m.auth.signIn(),{code:'SignInInProgress'});await first;});
test('cancel before cached-account lookup cannot start token consent',async()=>{const m=mock();const result=m.auth.getAccessToken('https://api.fabric.microsoft.com');m.auth.cancel();await assert.rejects(result,{code:'Cancelled'});});

test('Power BI Desktop identity uses its existing Power BI default permissions',()=>{
 const {scopesFor,POWER_BI_DESKTOP_CLIENT_ID}=require('../auth.cjs');
 for(const audience of ['https://api.fabric.microsoft.com','https://analysis.windows.net/powerbi/api']) assert.deepEqual(scopesFor(audience,'definition',POWER_BI_DESKTOP_CLIENT_ID),['https://analysis.windows.net/powerbi/api/.default']);
 assert.throws(()=>scopesFor('https://untrusted.example',undefined,POWER_BI_DESKTOP_CLIENT_ID),{code:'InvalidAudience'});
 assert.deepEqual(scopesFor('https://api.fabric.microsoft.com','definition',id),['https://api.fabric.microsoft.com/Workspace.Read.All','https://api.fabric.microsoft.com/SemanticModel.ReadWrite.All']);
});
test('Power BI Desktop identity signs in through a root localhost callback',async()=>{
 const {POWER_BI_DESKTOP_CLIENT_ID}=require('../auth.cjs');let request;
 const auth=createAuth({clientId:POWER_BI_DESKTOP_CLIENT_ID,msalFactory:()=>({getAuthCodeUrl:async r=>{request=r;return 'https://login.microsoftonline.com/test';},acquireTokenByCode:async r=>{assert.equal(r.redirectUri,request.redirectUri);assert.equal(r.codeVerifier.length,43);return {account:a};},getTokenCache:()=>({getAllAccounts:async()=>[a]})}),openBrowser:async()=>{const url=new URL(request.redirectUri);assert.equal(url.pathname,'/');assert.equal(url.hostname,'localhost');assert.deepEqual(request.scopes,['https://analysis.windows.net/powerbi/api/.default']);url.searchParams.set('state',request.state);url.searchParams.set('code','test');await fetch(url);}});
 assert.equal((await auth.signIn()).name,a.username);
});
function deviceMock() {
 let request, finish; const removed=[];let accounts=[];
 const auth=createAuth({clientId:require('../auth.cjs').POWER_BI_DESKTOP_CLIENT_ID,openBrowser:async()=>{throw new Error('device flow must not open an embedded browser');},msalFactory:()=>({getTokenCache:()=>({getAllAccounts:async()=>accounts,removeAccount:async a=>{removed.push(a.homeAccountId);accounts=accounts.filter(x=>x!==a);}}),acquireTokenByDeviceCode:r=>{request=r;r.deviceCodeCallback({userCode:'TEST-CODE',verificationUri:'https://microsoft.com/devicelogin',expiresIn:900});return new Promise(resolve=>{finish=()=>{accounts=[a];resolve({account:a,accessToken:'private-token'});};});}})});
 return {auth,removed,get request(){return request;},finish:()=>finish()};
}
test('device login exposes only a user code and completes into the existing account cache',async()=>{
 const m=deviceMock();const login=await m.auth.beginDeviceSignIn();assert.equal(login.userCode,'TEST-CODE');assert.ok(login.expiresAt>Date.now());assert.ok(!JSON.stringify(login).includes('private-token'));
 await assert.rejects(m.auth.beginDeviceSignIn(),{code:'SignInInProgress'});
 m.finish();await new Promise(resolve=>setImmediate(resolve));const status=await m.auth.status();assert.equal(status.account.name,a.username);assert.equal(status.deviceLogin,null);assert.ok(!JSON.stringify(status).includes('private-token'));
});
test('cancelled device login cannot resurrect a signed-out account after late token delivery',async()=>{
 const m=deviceMock();await m.auth.beginDeviceSignIn();m.auth.cancel();assert.equal(m.request.cancel,true);m.finish();await new Promise(resolve=>setImmediate(resolve));const status=await m.auth.status();assert.equal(status.account,null);assert.equal(status.deviceLogin,null);assert.deepEqual(m.removed,['a']);
});
test('browser sign-in returns a Microsoft URL and redirects back only after token exchange',async()=>{
 let request,exchanged=false;
 const auth=createAuth({clientId:require('../auth.cjs').POWER_BI_DESKTOP_CLIENT_ID,openBrowser:async()=>{throw new Error('must not launch a browser on the host');},msalFactory:()=>({getAuthCodeUrl:async r=>{request=r;return 'https://login.microsoftonline.com/organizations/test';},acquireTokenByCode:async()=>{exchanged=true;return {account:a};},getTokenCache:()=>({getAllAccounts:async()=>[a]})})});
 await assert.rejects(auth.beginBrowserSignIn('https://evil.example'),{code:'InvalidRedirect'});
 const login=await auth.beginBrowserSignIn('http://localhost:8945/?fabricSignIn=1');assert.match(login.url,/^https:\/\/login.microsoftonline.com\//);
 const callback=new URL(request.redirectUri);callback.searchParams.set('state',request.state);callback.searchParams.set('code','test');
 const response=await fetch(callback,{redirect:'manual'});assert.equal(response.status,302);assert.equal(response.headers.get('location'),'http://localhost:8945/?fabricSignIn=1');assert.equal(exchanged,true);assert.equal((await auth.status()).account.name,a.username);
});

test('one Microsoft login supplies workspace, model and XMLA tokens without further prompts', async () => {
 let accounts = [a], request, prompts = 0, silent = 0;
 const auth = createAuth({clientId: POWER_BI_DESKTOP_CLIENT_ID, msalFactory: () => ({
  getTokenCache: () => ({getAllAccounts: async () => accounts, removeAccount: async () => {accounts=[];}}),
  getAuthCodeUrl: async r => {request=r; prompts++; return 'https://login.microsoftonline.com/test';},
  acquireTokenByCode: async () => ({account:a, accessToken:'session-token', expiresOn:new Date(Date.now()+3600000)}),
  acquireTokenSilent: async () => {silent++; const e=new Error(); e.name='InteractionRequiredAuthError'; throw e;}
 }), openBrowser:async () => {const url=new URL(request.redirectUri);url.searchParams.set('state',request.state);url.searchParams.set('code','test');await fetch(url);}});
 await auth.signIn();
 for (const audience of ['https://api.fabric.microsoft.com','https://api.fabric.microsoft.com','https://analysis.windows.net/powerbi/api']) assert.equal(await auth.getAccessToken(audience),'session-token');
 assert.equal(prompts,1); assert.equal(silent,0);
 assert.ok(!JSON.stringify(await auth.status()).includes('session-token'));
 await auth.signOut(); await assert.rejects(auth.getAccessToken('https://api.fabric.microsoft.com'), {code:'NotSignedIn'});
});

test('expired session tokens fall back to MSAL renewal', async () => {
 let renewals=0;
 const m=mock({expiresOn:new Date(Date.now()-1000),silent:async()=>{renewals++;return {account:a,accessToken:'renewed',expiresOn:new Date(Date.now()+3600000)};}});
 await m.auth.signIn();
 assert.equal(await m.auth.getAccessToken('https://api.fabric.microsoft.com'),'renewed');
 assert.equal(await m.auth.getAccessToken('https://api.fabric.microsoft.com'),'renewed');
 assert.equal(renewals,1);
});
test('custom application token reuse does not cross API resources or definition permissions', async () => {
 let renewals=0;
 const m=mock({expiresOn:new Date(Date.now()+3600000),silent:async()=>{renewals++;return {account:a,accessToken:'separate',expiresOn:new Date(Date.now()+3600000)};}});
 await m.auth.signIn();
 assert.equal(await m.auth.getAccessToken('https://api.fabric.microsoft.com'),'new');
 assert.equal(await m.auth.getAccessToken('https://analysis.windows.net/powerbi/api'),'separate');
 assert.equal(await m.auth.getAccessToken('https://api.fabric.microsoft.com','definition'),'separate');
 assert.equal(renewals,2);
});
