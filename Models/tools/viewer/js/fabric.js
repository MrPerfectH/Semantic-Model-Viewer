/* Read-only Fabric connection. Authentication belongs to the native host; only
   parsed metadata and an allowlisted connection identity enter viewer storage. */
(function (g) {
  'use strict';
  function sourceOf(value) {
    var s = value || {};
    if (!s.tenantId || !s.workspaceId || !s.modelId) throw new Error('Fabric did not return a complete model identity.');
    return {kind:'fabric',tenantId:String(s.tenantId),workspaceId:String(s.workspaceId),modelId:String(s.modelId),fetchedAt:typeof s.fetchedAt==='string' && Number.isFinite(Date.parse(s.fetchedAt))?s.fetchedAt:new Date().toISOString(),method:typeof s.method==='string'?s.method:'',accountId:s.accountId?String(s.accountId):'',coverage:typeof s.coverage==='string'?s.coverage:'',warnings:Array.isArray(s.warnings)?s.warnings.filter(function(w){return typeof w==='string';}).slice(0,20):[]};
  }
  function key(s) { return 'fabric:' + [s.tenantId,s.workspaceId,s.modelId].map(encodeURIComponent).join(':'); }
  function FabricConnection(app) { this.app=app; this.generation=0; this.items=[]; this.account=null; this.busy=false;this.transport='xmla'; }
  FabricConnection.prototype.available=function(){return !this.app.snapshotMode && !!(this.app.server || this.app.host && this.app.host.fabricRequest);};
  FabricConnection.prototype.request=async function(payload){
    if(!this.available())throw new Error('Fabric connections are available in the standalone app and VS Code.');
    if(this.app.host)return this.app.host.fabricRequest(payload);
    var response=await fetch('api/fabric',{method:'POST',headers:{'Content-Type':'application/json','X-SMV-Fabric-Session':this.app.server.fabricSession || ''},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(payload.action==='signIn'?330000:payload.action==='openModel'?210000:30000)});
    var data=await response.json(); if(!response.ok || data.error)throw new Error(data.error || 'Fabric request failed.'); return data;
  };
  FabricConnection.prototype.waitForDevice=async function(n){
    while(n===this.generation){
      await new Promise(function(resolve){setTimeout(resolve,2000);});if(n!==this.generation)return;
      var state=await this.request({action:'status'});if(n!==this.generation)return;
      if(state.deviceError)throw new Error(state.deviceError);
      if(state.account){this.deviceLogin=null;this.account=state.account;await this.list(false,n);return;}
      if(!state.deviceLogin || Date.now()>state.deviceLogin.expiresAt)throw new Error('Microsoft sign-in expired. Try again.');
      if(!this.deviceLogin || this.deviceLogin.userCode!==state.deviceLogin.userCode){this.deviceLogin=state.deviceLogin;this.draw();}
    }
  };
  FabricConnection.prototype.current=function(){return this.app.getStore().find(function(r){return r.id===this.app.modelKey;},this);};
  FabricConnection.prototype.run=async function(fn){
    var generation=++this.generation;this.busy=true;this.error='';this.draw();this.app.render(true);
    try{await fn.call(this,generation);}catch(e){if(generation===this.generation){this.deviceLogin=null;this.error=e.message || String(e);if(!this.visible)this.app.setState({snapshotError:this.error});}}
    finally{if(generation===this.generation){this.busy=false;this.draw();this.app.render(true);}}
  };
  FabricConnection.prototype.show=function(){
    if(this.app.snapshotMode)return;
    this.returnFocus=document.activeElement;this.visible=true;this.workspace=null;this.items=[];this.query='';this.draw();
    this.run(async function(n){var s=await this.request({action:'status'});if(n!==this.generation)return;this.account=s.account;this.unavailable=s.available===false?s.message || 'Fabric sign-in has not been configured by the application maintainer.':'';if(s.deviceLogin && !this.account){this.deviceLogin=s.deviceLogin;this.draw();await this.waitForDevice(n);}else if(this.account && !this.unavailable)await this.list(false,n);});
  };
  FabricConnection.prototype.close=function(){if(this.busy && this.available())this.request({action:'cancel'}).catch(function(){});this.generation++;this.visible=false;this.busy=false;this.deviceLogin=null;if(this.overlay)this.overlay.remove();this.overlay=null;if(this.returnFocus && this.returnFocus.focus)this.returnFocus.focus();};
  FabricConnection.prototype.list=async function(more,n){
    var p={action:this.workspace?'listModels':'listWorkspaces'};if(this.workspace)p.workspaceId=this.workspace.id;if(more)p.continuationToken=this.next;
    var result=await this.request(p);if(n!==this.generation)return;
    this.items=(more?this.items:[]).concat(result.items || []);this.next=result.continuationToken || null;
  };
  FabricConnection.prototype.open=async function(item,n){
    var workspace=this.workspace, modelKey=this.app.modelKey,expectedTenant=this.account && this.account.tenantId, expectedAccount=this.account && (this.account.accountId || this.account.id);
    var result=await this.request({action:'openModel',workspaceId:workspace.id,modelId:item.id,transport:this.transport,tenantId:expectedTenant,accountId:expectedAccount});
    if(n!==this.generation || modelKey!==this.app.modelKey)return;
    var source=sourceOf(Object.assign({},result,{tenantId:result.tenantId || this.account && this.account.tenantId,workspaceId:workspace.id,modelId:item.id}));
    if(expectedTenant && source.tenantId!==expectedTenant)throw new Error('This model belongs to another tenant. Sign in with the original work account to refresh it.');
    if(expectedAccount && source.accountId!==expectedAccount)throw new Error('Sign in with the original work account to refresh this saved model.');
    var model=result.model || g.TMDLParser.parseAny(result.files || []);
    if(!model || !Array.isArray(model.tables))throw new Error('Fabric returned invalid model metadata.');
    var record={id:key(source),name:result.name || item.name,at:Date.now(),source:source,model:JSON.parse(JSON.stringify(model))};
    var records=this.app.getStore().filter(function(r){return r.id!==record.id;});records.push(record);
    if(!this.app.setStore(records))throw new Error('Could not cache this model. Free local storage and try again.');
    this.activate(record);this.visible=false;if(this.overlay)this.overlay.remove();this.overlay=null;
  };
  FabricConnection.prototype.activate=function(record){this.app.hostOpenModel(JSON.parse(JSON.stringify(record)));U.store.set('smv_current_v1',record.id);this.app.render(true);};
  FabricConnection.prototype.refresh=function(){
    var record=this.current();if(!record || !record.source)return;
    this.transport=record.source.method || 'xmla';this.workspace={id:record.source.workspaceId};this.account={tenantId:record.source.tenantId,accountId:record.source.accountId};
    this.run(async function(n){await this.open({id:record.source.modelId,name:record.name},n);if(n===this.generation)this.app.setState({snapshotMessage:'Refreshed from Fabric. Your views are kept.',snapshotError:''});});
  };
  FabricConnection.prototype.remove=async function(record){
    this.generation++;
    if(this.app.host){try{await this.request(Object.assign({action:'removeModel'},record.source));}catch(e){this.error=e.message;this.draw();return;}}var records=this.app.getStore().filter(function(r){return r.id!==record.id;});
    if(!this.app.setStore(records)){this.error='Could not remove the cached model.';this.draw();return;}
    ['smv_layout_','smv_presets_','smv_workspace_v1_'].forEach(function(prefix){U.store.del(prefix+record.id);});
    if(this.app.modelKey===record.id){U.store.del('smv_current_v1');this.app.loadEmptyModel();}
    this.draw();this.app.render(true);
  };
  FabricConnection.prototype.draw=function(){
    if(!this.visible)return;var self=this,el=U.el;
    if(this.overlay)this.overlay.remove();
    var overlay=el('div',{style:'position:fixed;inset:0;background:rgba(20,30,50,.35);z-index:100;display:flex;align-items:center;justify-content:center;'});
    var dialog=el('section',{role:'dialog','aria-modal':'true','aria-label':'Connect to Fabric',style:'background:#fff;border-radius:12px;padding:22px;width:520px;max-width:90vw;max-height:85vh;overflow:auto;font:14px "IBM Plex Sans",sans-serif;'});overlay.appendChild(dialog);
    dialog.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();self.close();}if(e.key==='Tab'){var nodes=dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)');if(!nodes.length)return;var first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}}});
    function button(text,fn,disabled){return el('button',{cls:'ex-button',text:text,onClick:fn,disabled:!!disabled,style:'margin:4px;'});}
    dialog.appendChild(el('h2',{text:'Connect to Fabric'}));
    dialog.appendChild(el('label',{text:'Connection method',for:'fabric-transport'}));
    var transport=el('select',{id:'fabric-transport',disabled:this.busy,style:'display:block;width:100%;padding:8px;margin:8px 0;'},[el('option',{value:'xmla',text:'Standard · Read + Build access'}),el('option',{value:'rest',text:'Fabric definition API · requires edit access'})]);transport.value=this.transport;transport.addEventListener('change',function(){self.transport=transport.value;});dialog.appendChild(transport);
    dialog.appendChild(el('p',{text:'Read-only inspection. Standard XMLA access requires an enabled endpoint; available Power Query definitions may be limited. The definition API requires edit access and may request additional Microsoft permissions.'}));dialog.appendChild(button('Close',function(){self.close();}));
    if(this.unavailable)dialog.appendChild(el('p',{role:'status',text:this.unavailable}));
    if(this.error)dialog.appendChild(el('p',{role:'alert',text:this.error,style:'color:#b91c1c;'}));
    if(this.busy)dialog.appendChild(el('p',{role:'status',text:this.deviceLogin?'Waiting for Microsoft sign-in. Enter the code below in your regular browser.':!this.account?'Waiting for Microsoft sign-in. If no browser window appeared, choose Use a code instead.':'Loading Fabric metadata… Close to cancel.'}));
    if(this.deviceLogin){
      dialog.appendChild(el('p',{text:'In Chrome, Edge or Safari on your own device, open microsoft.com/devicelogin and enter this code. A remote preview may not show your passkey or security window. Return here after signing in; this page will continue automatically.'}));
      dialog.appendChild(el('strong',{text:this.deviceLogin.userCode,style:'display:block;font-size:24px;letter-spacing:3px;margin:12px 0;'}));
      dialog.appendChild(button('Copy sign-in code',function(){navigator.clipboard.writeText(self.deviceLogin.userCode).catch(function(){self.error='Select and copy the displayed code manually.';self.draw();});}));
      dialog.appendChild(el('a',{href:'https://microsoft.com/devicelogin',target:'_self',text:'Continue to Microsoft sign-in'}));
    }
    if(this.account){
      dialog.appendChild(el('p',{text:this.account.name || 'Microsoft work account'}));
      dialog.appendChild(button('Sign out',function(){self.run(async function(n){await self.request({action:'signOut'});if(n!==self.generation)return;self.account=null;self.items=[];self.workspace=null;self.next=null;});},this.busy));
      dialog.appendChild(el('p',{text:'Signing out keeps cached metadata. Remove saved models below to delete it.'}));
      if(this.workspace)dialog.appendChild(button('Back to workspaces',function(){self.workspace=null;self.query='';self.run(async function(n){await self.list(false,n);});},this.busy));
      dialog.appendChild(el('h3',{text:this.workspace?'Models in '+this.workspace.name:'Workspaces'}));
      var search=el('input',{type:'search',placeholder:'Search loaded '+(this.workspace?'models':'workspaces'),'aria-label':'Search loaded items',value:this.query || '',style:'width:95%;padding:8px;'});
      var list=el('div',{});function fill(){U.clear(list);self.items.filter(function(i){return String(i.name || i.displayName || '').toLowerCase().includes((search.value || '').toLowerCase());}).forEach(function(i){list.appendChild(button(i.name || i.displayName,function(){self.query='';self.run(async function(n){if(self.workspace)await self.open(i,n);else{self.workspace=i;await self.list(false,n);}});},self.busy));});if(!self.items.length&&!self.busy)list.appendChild(el('p',{text:'No accessible items found.'}));}search.addEventListener('input',function(){self.query=search.value;fill();});dialog.appendChild(search);dialog.appendChild(list);fill();
      if(this.next)dialog.appendChild(button('Load more',function(){self.run(async function(n){await self.list(true,n);});},this.busy));
    }else dialog.appendChild(button('Sign in with Microsoft',function(){self.run(async function(n){var s=await self.request({action:'signIn',transport:self.transport});if(n!==self.generation)return;self.account=s.account;if(!self.account)throw new Error('Sign-in did not complete.');await self.list(false,n);});},this.busy || !!this.unavailable));
    if(!this.account)dialog.appendChild(button(this.busy && !this.deviceLogin?'Use a code instead':'Sign in using a code',function(){self.run(async function(n){
      var started=await self.request({action:'beginDeviceSignIn'});if(n!==self.generation)return;
      self.deviceLogin=started.deviceLogin;self.draw();
      await self.waitForDevice(n);
    });},!!this.deviceLogin || !!this.unavailable));
    var cached=this.app.getStore().filter(function(r){return r.source && r.source.kind==='fabric';});
    if(cached.length){dialog.appendChild(el('h3',{text:'Saved models (available offline)'}));cached.forEach(function(r){dialog.appendChild(button(r.name,function(){self.activate(r);self.close();},self.busy));dialog.appendChild(button('Remove '+r.name,function(){self.remove(r);},self.busy));});}
    document.body.appendChild(overlay);this.overlay=overlay;var focus=dialog.querySelector('input, button:not(:disabled)');if(focus)focus.focus();
  };
  FabricConnection.sourceOf=sourceOf;FabricConnection.key=key;
  g.FabricConnection=FabricConnection;
  if(typeof module==='object'&&module.exports)module.exports={FabricConnection:FabricConnection,sourceOf:sourceOf,key:key};
})(typeof window==='undefined'?globalThis:window);
