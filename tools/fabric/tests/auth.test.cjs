const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../auth.cjs');
const id='11111111-1111-1111-1111-111111111111';
const a={homeAccountId:'a',username:'a@example.test',tenantId:'tenant'};
function mock(options={}) {
 let removed=[]; let cache=[a]; let serialized;
 const tokenCache={getAllAccounts:async()=>cache,removeAccount:async account=>{removed.push(account.homeAccountId);cache=cache.filter(v=>v.homeAccountId!==account.homeAccountId);},deserialize:()=>{},serialize:()=> 'cache'};
 const app={getTokenCache:()=>tokenCache,acquireTokenSilent:options.silent|| (async()=>({accessToken:'token'})),getAuthCodeUrl:async request=>`https://login.example/?${new URLSearchParams({redirect_uri:request.redirectUri,state:request.state})}`,acquireTokenByCode:async()=>({account:options.resultAccount||a,accessToken:'new'})};
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
