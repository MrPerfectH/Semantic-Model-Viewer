'use strict';
const vscode=require('vscode'),path=require('node:path'),crypto=require('node:crypto');
const {findModels,readModelFiles}=require('./workspace');
function htmlForView(html,revision){
  const nonce=crypto.randomBytes(18).toString('base64');
  const csp=`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const embedded=html.match(/<script id="smv-snapshot-data"[^>]*>([\s\S]*?)<\/script>/);
  if(!embedded)throw new Error('Prepared diagram is missing its model snapshot');
  const data=JSON.stringify(embedded[1]).replace(/</g,'\\u003c');
  html=html.replace(/<script\b/g,`<script nonce="${nonce}"`);
  // Initialize from the prepared records after the editor document has booted.
  // The editor's asynchronous webview loader does not guarantee that snapshot.js
  // can discover the JSON data element while its assets are being evaluated.
  const acknowledgement=`<script nonce="${nonce}">(()=>{
    const host=acquireVsCodeApi(),payload=JSON.parse(${data}),end=Date.now()+20000;
    const fail=error=>host.postMessage({type:'failed',revision:${revision},error:String(error.message||error)});
    const wait=()=>{
      if(window.app&&app.state.loaded&&window.SMV_AGENT_VIEW){
        try{Snapshots.embedded=Snapshots.validate(payload);Snapshots.error=null;U.store.useMemory(Snapshots.seedStorage(payload));if(app.onboarding&&typeof app.onboarding.dispose==='function')app.onboarding.dispose();app.onboarding=null;app.loadSnapshot(payload);SMVExplanation.start(window.SMV_AGENT_VIEW);window.smv.ready().then(()=>host.postMessage({type:'applied',revision:${revision}})).catch(fail);}catch(error){fail(error);}
      }else if(Date.now()<end)setTimeout(wait,50);else fail(new Error('Editor diagram initialization timed out'));
    };wait();
  })();</script>`;
  return html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${csp}">`).replace('</body>',acknowledgement+'</body>');
}
function register(context){
  if(!vscode.lm||typeof vscode.lm.registerTool!=='function')return {dispose(){}};
  const {compute}=require('./engine-worker-client');
  const panels=new Map(),requests=new Map(),plans=new Map();let revision=0,requestId=0;
  const check=token=>{if(token&&token.isCancellationRequested)throw new Error('Cancelled');};
  async function run(kind,input={},token){
    if(!vscode.workspace.isTrusted)throw new Error('Trust this workspace before reading semantic model files.');
    check(token);const models=await findModels();check(token);
    if(kind==='discover')return {models:models.map(m=>({id:m.id,name:m.name,source:m.uri.toString()}))};
    const matches=input.model?models.filter(m=>[m.id,m.name,m.uri.toString(),m.uri.fsPath].includes(input.model)):models;
    if(matches.length!==1)throw new Error('Choose one model from discover; found '+matches.length+' matching models. Backup models are never chosen automatically.');
    const entry=matches[0];
    if(!input.model&&/backup|archive/i.test(entry.uri.path))throw new Error('A backup or archived model requires an explicit model ID.');
    const requestKey=JSON.stringify([entry.id,input]),generation=++requestId;if(kind==='show')requests.set(requestKey,generation);
    const records=await readModelFiles(entry);check(token);
    const recordHash=crypto.createHash('sha256').update(JSON.stringify(records.map(f=>[f.path||f.name,f.text]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
    const cached=plans.get(requestKey);
    if(kind==='show'&&cached&&cached.hash===recordHash&&cached.keys.every(key=>panels.has(key)&&panels.get(key).status!=='failed')){
      const views=cached.keys.map(key=>{const state=panels.get(key);state.panel.reveal(undefined,true);return {label:state.panel.title,status:state.status,error:state.error,revision:state.revision,reused:true,summary:state.summary,renderer:state.renderer};});
      return {...cached.result,views};
    }

    const computed=await compute(context.extensionPath,{kind,input,records,name:entry.name,identity:entry.uri.toString()},token);
    if(computed.value)return computed.value;
    const {plan,prepared,sourceIdentity,sourceContentHash}=computed;check(token);
    if(kind==='show'&&requests.get(requestKey)!==generation)return {cancelled:true,reason:'A newer request superseded this diagram.'};
    if(kind==='snapshot'){
      if(prepared.length!==1)throw new Error('Choose related or dependents for one portable HTML snapshot.');
      const target=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(path.join(require('node:os').homedir(),'Semantic model diagram.html')),filters:{HTML:['html']}});
      if(!target)return {cancelled:true};check(token);
      await vscode.workspace.fs.writeFile(target,Buffer.from(prepared[0].prepared.html));
      return {artifact:target.toString(),bytes:Buffer.byteLength(prepared[0].prepared.html),contents:'Full-model metadata and formulas; the initial diagram is focused.',sourceIdentity:sourceIdentity,renderer:prepared[0].prepared.renderer};
    }
    const views=[],keys=[];
    for(let i=0;i<prepared.length;i++){
      check(token);const item=prepared[i],key=JSON.stringify([entry.id,plan.table,item.key,input.with||'',input.direction||'both',!!input.direct,!!input.includeInactive]);
      keys.push(key);let state=panels.get(key);
      // Repeated questions reveal the explored panel instead of resetting it.
      if(state&&state.hash===sourceContentHash&&state.status!=='failed'){state.panel.reveal(undefined,true);views.push({label:item.label,status:state.status,error:state.error,revision:state.revision,reused:true,summary:item.prepared.summary,renderer:item.prepared.renderer});continue;}
      if(!state){
        const panel=vscode.window.createWebviewPanel('semanticModelViewer.diagram',item.label,{viewColumn:i===0?vscode.ViewColumn.Active:vscode.ViewColumn.Beside,preserveFocus:true},{enableScripts:true,retainContextWhenHidden:true,localResourceRoots:[]});
        state={panel,status:'awaiting-viewer'};panels.set(key,state);
        panel.onDidDispose(()=>{if(panels.get(key)===state)panels.delete(key);});
        panel.webview.onDidReceiveMessage(message=>{if(message&&message.revision===state.revision&&['applied','failed'].includes(message.type)){state.status=message.type;state.error=typeof message.error==='string'?message.error.slice(0,1000):undefined;}});
      }
      state.summary=item.prepared.summary;state.renderer=item.prepared.renderer;state.revision=++revision;state.hash=sourceContentHash;state.status='awaiting-viewer';state.error=undefined;
      state.panel.webview.html=htmlForView(item.prepared.html,state.revision);state.panel.reveal(undefined,true);
      views.push({label:item.label,status:state.status,error:state.error,revision:state.revision,reused:false,summary:item.prepared.summary,renderer:item.prepared.renderer});
    }
    const result={sourceIdentity:sourceIdentity,counts:plan.counts,warnings:plan.warnings,views,note:'Panels are opened in the editor. awaiting-viewer is not a rendered acknowledgement; repeat the same show request to read the latest panel status without resetting exploration.'};
    plans.set(requestKey,{hash:recordHash,keys,result});return result;
  }
  const messages={discover:'Finding semantic models',inspect:'Reading model metadata',relations:'Tracing table filter paths',dependents:'Tracing calculation dependencies',show:'Opening model diagrams',snapshot:'Saving a portable model diagram'};
  const disposables=['discover','inspect','relations','dependents','show','snapshot'].map(kind=>vscode.lm.registerTool('smv_'+kind,{
    prepareInvocation(){return {invocationMessage:messages[kind]};},
    async invoke(options,token){const result=await run(kind,options.input,token);return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(result))]);}
  }));
  return {run,status:()=>[...panels.values()].map(state=>({label:state.panel.title,status:state.status,error:state.error,revision:state.revision})),dispose(){for(const item of disposables)item.dispose();for(const state of panels.values())state.panel.dispose();panels.clear();}};
}
module.exports={register,htmlForView};
